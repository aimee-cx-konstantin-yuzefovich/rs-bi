import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/bitrix/companies/route';
import { NextRequest } from 'next/server';
import * as bitrix from '@/lib/bitrix';
import * as authGuard from '@/lib/auth-guard';
import { useDashboardStore } from '@/store/dashboard-store';
import { BitrixTransientError } from '@/lib/bitrix';

// Simulates a shared-transport failure AFTER its own bounded retries (the
// route must not multiply retries at route level).
class BitrixTransientFailure extends BitrixTransientError {
  constructor() {
    super('API returned status 503', 503);
  }
}

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/bitrix/companies', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('Companies API & Partial Failure Semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, 'requireAuth').mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' } as any);
    vi.spyOn(authGuard, 'isAuthError').mockReturnValue(false);
  });

  it('1. all companies resolved -> success: true, partial: false, fetchedCompanyIds complete', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({
      result: [
        { ID: '10', TITLE: 'ООО Ромашка', ASSIGNED_BY_ID: '1' },
        { ID: '20', TITLE: 'ЗАО Лютик', ASSIGNED_BY_ID: '2' },
      ],
    } as any);

    const res = await POST(makeRequest({ ids: ['10', '20'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.fetchedCompanyIds).toEqual(['10', '20']);
    expect(data.unresolvedCompanyIds).toEqual([]);
    expect(data.companies['10'].TITLE).toBe('ООО Ромашка');
    expect(data.companies['20'].TITLE).toBe('ЗАО Лютик');
    expect(data.warning).toBeUndefined();
  });

  it('2. partial resolution -> partial: true, truthful warning, unresolvedCompanyIds tracked', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      if (method === 'crm.company.list') {
        // Only company 10 is found in batch
        return {
          result: [{ ID: '10', TITLE: 'ООО Ромашка' }],
        } as any;
      }
      if (method === 'crm.company.get') {
        // Fallback also fails or finds nothing for company 20
        return { result: null } as any;
      }
      return { result: [] } as any;
    });

    const res = await POST(makeRequest({ ids: ['10', '20'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(true);
    expect(data.fetchedCompanyIds).toEqual(['10']);
    expect(data.unresolvedCompanyIds).toEqual(['20']);
    expect(data.warning).toContain('Не удалось загрузить данные для 1 из 2 компаний');
    expect(data.companies['10'].TITLE).toBe('ООО Ромашка');
    expect(data.companies['20'].TITLE).toBe('');
  });

  it('3. total upstream failure -> status 500, success: false, partial: true', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockRejectedValue(new Error('Bitrix CRM connection refused'));

    const res = await POST(makeRequest({ ids: ['10', '20'] }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.partial).toBe(true);
    expect(data.fetchedCompanyIds).toEqual([]);
    expect(data.unresolvedCompanyIds).toEqual(['10', '20']);
    expect(data.error).toBe('Failed to fetch companies from CRM.');
  });

  it('4. fallback per-ID get successfully resolves company missed in batch', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      if (method === 'crm.company.list') {
        return { result: [] } as any; // Batch returned empty
      }
      if (method === 'crm.company.get' && (params as any).ID === '30') {
        return { result: { ID: '30', TITLE: 'Индивидуальный Предприниматель' } } as any;
      }
      return { result: null } as any;
    });

    const res = await POST(makeRequest({ ids: ['30'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.fetchedCompanyIds).toEqual(['30']);
    expect(data.companies['30'].TITLE).toBe('Индивидуальный Предприниматель');
  });

  it('5. store cache: unresolved companies are NOT timestamped in companiesDataFetchedAt', async () => {
    useDashboardStore.setState({
      allDeals: [{ COMPANY_ID: '10' }, { COMPANY_ID: '20' }] as any,
      selectedColumns: ['COMPANY_TITLE'],
      companiesData: {},
      companiesDataFetchedAt: {},
      isDemoMode: false,
    });

    // Mock global fetch returning partial companies data
    const globalFetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: true,
        fetchedCompanyIds: ['10'],
        unresolvedCompanyIds: ['20'],
        companies: {
          '10': { ID: '10', TITLE: 'ООО Ромашка' },
          '20': { ID: '20', TITLE: '' },
        },
      }),
    } as any);

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    // Successfully fetched company 10 is timestamped
    expect(state.companiesDataFetchedAt['10']).toBeDefined();
    // Unresolved company 20 is NOT timestamped (eligible for retry)
    expect(state.companiesDataFetchedAt['20']).toBeUndefined();

    globalFetchSpy.mockRestore();
  });

  it('6. Bitrix returns company with empty TITLE -> resolved, cached as "Без названия", no immediate refetch', async () => {
    // 1) Test API route
    vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({
      result: [{ ID: '123', TITLE: '' }],
    } as any);

    const res = await POST(makeRequest({ ids: ['123'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.fetchedCompanyIds).toEqual(['123']);
    expect(data.unresolvedCompanyIds).toEqual([]);
    expect(data.companies['123'].TITLE).toBe('Без названия');

    // 2) Test store caching and prevention of immediate refetch
    useDashboardStore.setState({
      allDeals: [{ COMPANY_ID: '123' }] as any,
      selectedColumns: ['COMPANY_TITLE'],
      companiesData: {},
      companiesDataFetchedAt: {},
      isDemoMode: false,
    });

    const globalFetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: false,
        fetchedCompanyIds: ['123'],
        unresolvedCompanyIds: [],
        companies: {
          '123': { ID: '123', TITLE: 'Без названия' },
        },
      }),
    } as any);

    // Initial fetch
    await useDashboardStore.getState().fetchCompaniesData();
    expect(globalFetchSpy).toHaveBeenCalledTimes(1);

    const state = useDashboardStore.getState();
    expect(state.companiesData['123']).toBeDefined();
    expect(state.companiesData['123'].TITLE).toBe('Без названия');
    expect(state.companiesDataFetchedAt['123']).toBeDefined();

    // Immediate second fetch call must NOT trigger a new network request
    await useDashboardStore.getState().fetchCompaniesData();
    expect(globalFetchSpy).toHaveBeenCalledTimes(1); // Still 1! No immediate refetch

    globalFetchSpy.mockRestore();
  });

  describe('Company enrichment defensiveness (remediation)', () => {
    it('foreign IDs returned by Bitrix are ignored, never accepted', async () => {
      vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [
          { ID: '10', TITLE: 'Requested' },
          { ID: '999', TITLE: 'Foreign record' },
        ],
      } as any);

      const res = await POST(makeRequest({ ids: ['10'] }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.fetchedCompanyIds).toEqual(['10']);
      expect(data.companies['999']).toBeUndefined();
      expect(data.companies['10'].TITLE).toBe('Requested');
    });

    it('permits foreign TITLE-less placeholder only for requested IDs; unresolved stay retryable and untitled', async () => {
      vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method) => {
        if (method === 'crm.company.list') return { result: [] } as any;
        if (method === 'crm.company.get') return { result: null } as any;
        return { result: [] } as any;
      });

      const res = await POST(makeRequest({ ids: ['10', '20'] }));
      const data = await res.json();

      expect(data.partial).toBe(true);
      expect(data.fetchedCompanyIds).toEqual([]);
      expect(data.unresolvedCompanyIds).toEqual(['10', '20']);
      // Unresolved IDs never become resolved-looking rows
      expect(data.companies['10'].TITLE).toBe('');
    });

    it('crawls unresolved IDs with a smaller-batch retry before per-ID fallback', async () => {
      const listCalls: Array<{ size: number }> = [];
      vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
        if (method === 'crm.company.list') {
          listCalls.push({ size: params.FILTER['@ID'].length });
          // Primary batch (empty); second small-batch call resolves one ID
          if (listCalls.length === 1) return { result: [] } as any;
          if (params.FILTER['@ID'].includes('77')) {
            return { result: [{ ID: '77', TITLE: 'Recovered' }] } as any;
          }
          return { result: [] } as any;
        }
        return { result: null } as any;
      });

      const res = await POST(makeRequest({ ids: ['77', '88'] }));
      const data = await res.json();

      // A small retry batch ran after the primary batch (2 list calls total)
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
      expect(listCalls[1].size).toBeLessThanOrEqual(15);
      expect(data.fetchedCompanyIds).toEqual(['77']);
      expect(data.companies['77'].TITLE).toBe('Recovered');
      expect(data.unresolvedCompanyIds).toEqual(['88']);
    });

    it('per-ID fallback is capped — excessive unresolved IDs never trigger hundreds of gets', async () => {
      const getCallCount = { n: 0 };
      const missingIds = Array.from({ length: 30 }, (_, i) => String(i + 1));
      vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method) => {
        if (method === 'crm.company.list') return { result: [] } as any;
        if (method === 'crm.company.get') {
          getCallCount.n++;
          return { result: null } as any;
        }
        return { result: [] } as any;
      });

      const res = await POST(makeRequest({ ids: missingIds }));
      const data = await res.json();

      expect(res.status).toBe(200);
      // Cap active: no more than PER_ID_FALLBACK_LIMIT per-ID calls
      expect(getCallCount.n).toBeLessThanOrEqual(15);
      expect(data.partial).toBe(true);
      expect(data.unresolvedCompanyIds).toHaveLength(30);
    });

    it('route-level retries are removed: one failed batch issues ONE transport call (shared layer retries alone)', async () => {
      const missingIds = Array.from({ length: 100 }, (_, i) => String(i + 1));
      const listSpy = vi.spyOn(bitrix, 'bitrixPost').mockRejectedValue(new BitrixTransientFailure());

      const res = await POST(makeRequest({ ids: missingIds }));
      const data = await res.json();

      // 100 IDs = 2 primary batches → exactly 2 bitrixPost calls (no route-level
      // re-issue of identical transport requests; recovery chunks each issue one
      // call, 100 unresolved → ceil(100/15) = 7 more).
      expect(listSpy).toHaveBeenCalledTimes(2 + 7);
      expect(data.success).toBe(false);
      expect(res.status).toBe(500);
    });

    it('large unresolved set (>150, ~202) still enters small-batch recovery with bounded request count', async () => {
      const missingIds = Array.from({ length: 202 }, (_, i) => String(i + 1));
      let listCallCount = 0;
      const chunkSizes: number[] = [];
      const recovered: string[] = [];
      vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
        expect(method).toBe('crm.company.list');
        listCallCount++;
        const chunk: string[] = params.FILTER['@ID'];
        expect(chunk.length).toBeLessThanOrEqual(50);
        if (listCallCount <= 5) {
          chunkSizes.push(chunk.length);
          // Primary batches all fail to return the requested rows.
          return { result: [] } as any;
        }
        // Recovery chunks: resolve exactly the even IDs of THIS chunk.
        chunkSizes.push(chunk.length);
        const chunkRecovered = chunk.filter((id) => Number(id) % 2 === 0);
        recovered.push(...chunkRecovered);
        return {
          result: chunkRecovered.map((id) => ({ ID: id, TITLE: `Recovered ${id}` })),
        } as any;
      });

      const res = await POST(makeRequest({ ids: missingIds }));
      const data = await res.json();

      expect(res.status).toBe(200);
      // Bounded request count: 5 primary batches + ceil(202/15)=14 recovery chunks = 19.
      // Never a per-ID storm (~202 crm.company.get calls are impossible here):
      expect(listCallCount).toBe(19);
      const getCalls = (bitrix.bitrixPost as any).mock.calls.filter(([m]: [string]) => m === 'crm.company.get').length;
      expect(getCalls).toBe(0);
      // Recovery chunk sizes respect the bounded small batch.
      for (const size of chunkSizes.slice(5)) {
        expect(size).toBeLessThanOrEqual(15);
      }
      // Recovered IDs resolved; remainder stays truthful PARTIAL.
      expect(data.fetchedCompanyIds.length).toBe(101);
      expect(data.unresolvedCompanyIds.length).toBe(101);
      expect(data.partial).toBe(true);
      expect(data.warning).toContain('101 из 202');
      expect(data.companies['2'].TITLE).toBe('Recovered 2');
      expect(data.companies['1'].TITLE).toBe('');
    });

    it('primary success + all unresolved recovery executes for >150 IDs without per-ID storm', async () => {
      const missingIds = Array.from({ length: 202 }, (_, i) => String(i + 1));
      let listCallCount = 0;
      vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method: string, params?: any) => {
        if (method === 'crm.company.list') {
          listCallCount++;
          return { result: [] } as any; // every list call empty (all 202 unresolved)
        }
        if (method === 'crm.company.get') {
          throw new Error('per-ID fallback must not run for large unresolved sets');
        }
        return { result: [] } as any;
      });

      const res = await POST(makeRequest({ ids: missingIds }));
      const data = await res.json();

      // 5 primary + 14 recovery chunks; per-ID fallback capped <=15 gets (→0 or
      // ≤15, never ≈202). All-ordering strictly bounded:
      expect(listCallCount).toBe(19);
      const getCalls = (bitrix.bitrixPost as any).mock.calls.filter(([m]: [string]) => m === 'crm.company.get').length;
      expect(getCalls).toBeLessThanOrEqual(15);
      expect(data.partial).toBe(true);
      expect(data.unresolvedCompanyIds).toHaveLength(202);
    });
  });

  describe('Company Request Cardinality Limits (TC-COMPANY-LIMIT-01 to 05)', () => {    it('TC-COMPANY-LIMIT-01: MAX_COMPANY_IDS (500) valid IDs is accepted', async () => {
      const bitrixSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [],
      } as any);

      const ids = Array.from({ length: 500 }, (_, i) => String(i + 1));
      const res = await POST(makeRequest({ ids }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(bitrixSpy).toHaveBeenCalled();
    });

    it('TC-COMPANY-LIMIT-02: MAX_COMPANY_IDS + 1 (501) is rejected with 400 before Bitrix access', async () => {
      const bitrixSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [],
      } as any);

      const ids = Array.from({ length: 501 }, (_, i) => String(i + 1));
      const res = await POST(makeRequest({ ids }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Too many company IDs requested.');
      expect(bitrixSpy.mock.calls.length).toBe(0);
    });

    it('TC-COMPANY-LIMIT-03: huge duplicate array that normalizes below limit is accepted', async () => {
      const bitrixSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [],
      } as any);

      // 1000 items but only 10 unique IDs
      const ids = Array.from({ length: 1000 }, (_, i) => String((i % 10) + 1));
      const res = await POST(makeRequest({ ids }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(bitrixSpy).toHaveBeenCalled();
    });

    it('TC-COMPANY-LIMIT-04: excessive select field count (> 100) rejected with 400 before Bitrix call', async () => {
      const bitrixSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [],
      } as any);

      const select = Array.from({ length: 105 }, (_, i) => `FIELD_${i}`);
      const res = await POST(makeRequest({ ids: ['1', '2'], select }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Too many company fields requested.');
      expect(bitrixSpy.mock.calls.length).toBe(0);
    });

    it('TC-COMPANY-LIMIT-05: malformed/non-numeric IDs do not count as valid IDs', async () => {
      const bitrixSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [],
      } as any);

      // 600 items, but only 2 are valid numbers
      const ids = [
        ...Array.from({ length: 598 }, (_, i) => `invalid_id_${i}`),
        '10',
        '20',
      ];
      const res = await POST(makeRequest({ ids }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(bitrixSpy).toHaveBeenCalled();
    });
  });
});

