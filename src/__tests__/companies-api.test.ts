import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/bitrix/companies/route';
import { NextRequest } from 'next/server';
import * as bitrix from '@/lib/bitrix';
import * as authGuard from '@/lib/auth-guard';
import { useDashboardStore } from '@/store/dashboard-store';

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
    expect(data.warning).toContain('Не удалось загрузить данные для 1 компаний');
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

  describe('Company Request Cardinality Limits (TC-COMPANY-LIMIT-01 to 05)', () => {
    it('TC-COMPANY-LIMIT-01: MAX_COMPANY_IDS (500) valid IDs is accepted', async () => {
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

