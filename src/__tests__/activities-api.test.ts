import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/bitrix/activities/route';
import { NextRequest } from 'next/server';
import * as bitrix from '@/lib/bitrix';
import * as authGuard from '@/lib/auth-guard';
import { useDashboardStore } from '@/store/dashboard-store';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/bitrix/activities', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('Activities API & Pagination Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, 'requireAuth').mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' } as any);
    vi.spyOn(authGuard, 'isAuthError').mockReturnValue(false);
  });

  it('1. all batches succeed (< 50 items, 1 page) -> success: true, partial: false', async () => {
    const bitrixPostSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({
      result: [
        {
          ID: '101',
          OWNER_ID: '1',
          COMPLETED: 'Y',
          SUBJECT: 'Call client',
          CREATED: '2026-01-01T10:00:00Z',
        },
        {
          ID: '102',
          OWNER_ID: '1',
          COMPLETED: 'N',
          SUBJECT: 'Send contract',
          DEADLINE: '2026-01-05T12:00:00Z',
          CREATED: '2026-01-02T10:00:00Z',
        },
      ],
    } as any);

    const res = await POST(makeRequest({ dealIds: ['1'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.failedBatches).toBe(0);
    expect(data.fetchedDealIds).toEqual(['1']);
    expect(data.activities['1'].last.ID).toBe('101');
    expect(data.activities['1'].next.ID).toBe('102');
    expect(bitrixPostSpy).toHaveBeenCalledTimes(1);
  });

  it('2. exactly 50 rows with next -> second page fetched and aggregated', async () => {
    // Page 1 returns 50 activities with next = 50
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      ID: String(i + 1),
      OWNER_ID: '1',
      COMPLETED: 'N',
      SUBJECT: `Activity ${i + 1}`,
      CREATED: '2026-01-01T00:00:00Z',
    }));

    // Page 2 returns 5 activities, including last completed
    const page2 = [
      {
        ID: '100',
        OWNER_ID: '1',
        COMPLETED: 'Y',
        SUBJECT: 'Finalized Meeting',
        CREATED: '2026-01-02T15:00:00Z',
      },
    ];

    const bitrixPostSpy = vi.spyOn(bitrix, 'bitrixPost')
      .mockResolvedValueOnce({ result: page1, next: 50 } as any)
      .mockResolvedValueOnce({ result: page2 } as any);

    const res = await POST(makeRequest({ dealIds: ['1'] }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(bitrixPostSpy).toHaveBeenCalledTimes(2);
    expect(data.activities['1'].all.length).toBe(51);
    expect(data.activities['1'].last.ID).toBe('100');
  });

  it('3. last completed activity exists only on a later page -> correctly resolved from complete set', async () => {
    const page1 = [
      { ID: '1', OWNER_ID: '5', COMPLETED: 'N', SUBJECT: 'Task 1', CREATED: '2026-01-01T00:00:00Z' },
    ];
    const page2 = [
      { ID: '2', OWNER_ID: '5', COMPLETED: 'Y', SUBJECT: 'Completed Call on page 2', CREATED: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(bitrix, 'bitrixPost')
      .mockResolvedValueOnce({ result: page1, next: 50 } as any)
      .mockResolvedValueOnce({ result: page2 } as any);

    const res = await POST(makeRequest({ dealIds: ['5'] }));
    const data = await res.json();

    expect(data.activities['5'].last.ID).toBe('2');
    expect(data.activities['5'].last.SUBJECT).toBe('Completed Call on page 2');
  });

  it('4. next planned activity exists only on a later page -> correctly resolved from complete set', async () => {
    const page1 = [
      { ID: '1', OWNER_ID: '5', COMPLETED: 'Y', SUBJECT: 'Done 1', CREATED: '2026-01-01T00:00:00Z' },
    ];
    const page2 = [
      { ID: '2', OWNER_ID: '5', COMPLETED: 'N', SUBJECT: 'Future presentation', DEADLINE: '2026-02-01T00:00:00Z', CREATED: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(bitrix, 'bitrixPost')
      .mockResolvedValueOnce({ result: page1, next: 50 } as any)
      .mockResolvedValueOnce({ result: page2 } as any);

    const res = await POST(makeRequest({ dealIds: ['5'] }));
    const data = await res.json();

    expect(data.activities['5'].next.ID).toBe('2');
    expect(data.activities['5'].next.SUBJECT).toBe('Future presentation');
  });

  it('5. one batch succeeds, one batch fails -> partial: true, failed IDs remain UNKNOWN (not empty)', async () => {
    // Generate 60 IDs (batch 1: 0..49, batch 2: 50..59)
    const dealIds = Array.from({ length: 60 }, (_, i) => String(i + 1));

    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const ownerIds: string[] = params?.FILTER?.['@OWNER_ID'] || [];
      if (ownerIds.includes('1')) {
        // Batch 1 succeeds
        return {
          result: [
            { ID: '999', OWNER_ID: '1', COMPLETED: 'Y', SUBJECT: 'Call', CREATED: '2026-01-01T00:00:00Z' },
          ],
        } as any;
      }
      // Batch 2 fails (e.g. upstream network error)
      throw new Error('Upstream Bitrix network failure');
    });

    const res = await POST(makeRequest({ dealIds }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(true);
    expect(data.failedBatches).toBe(1);
    expect(data.fetchedDealIds.length).toBe(50);
    expect(data.failedDealIds.length).toBe(10);
    expect(data.warning).toContain('Не удалось загрузить');

    // CRITICAL SECURITY / DATA INTEGRITY RULE:
    // Succeeded batch deals exist in activities
    expect(data.activities['1']).toBeDefined();
    // Failed batch deals must NOT be initialized as empty { all: [] }
    expect(data.activities['51']).toBeUndefined();
    expect(data.activities['60']).toBeUndefined();
  });

  it('6. total upstream failure -> success: false with status 500, no IDs marked empty', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockRejectedValue(new Error('Bitrix CRM unavailable'));

    const res = await POST(makeRequest({ dealIds: ['10', '20'] }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.partial).toBe(true);
    expect(data.failedDealIds).toEqual(['10', '20']);
    expect(data.activities).toEqual({});
  });

  it('7. later page in a batch fails -> batch marked as failed/partial', async () => {
    vi.spyOn(bitrix, 'bitrixPost')
      .mockResolvedValueOnce({
        result: [{ ID: '1', OWNER_ID: '10', COMPLETED: 'N', CREATED: '2026-01-01T00:00:00Z' }],
        next: 50,
      } as any)
      .mockRejectedValueOnce(new Error('Gateway timeout on page 2'));

    const res = await POST(makeRequest({ dealIds: ['10'] }));
    const data = await res.json();

    // Since the only batch failed on page 2, this is a total failure for this request
    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.failedDealIds).toContain('10');
  });

  it('8. malformed / repeated next cursor -> terminates safely without infinite loop', async () => {
    const bitrixPostSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
      result: [{ ID: '1', OWNER_ID: '10', COMPLETED: 'N', CREATED: '2026-01-01T00:00:00Z' }],
      next: 0, // Malformed cursor repeating start=0
    } as any);

    const res = await POST(makeRequest({ dealIds: ['10'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(bitrixPostSpy).toHaveBeenCalledTimes(1); // Did not loop infinitely!
    expect(data.partial).toBe(true); // Marked partial due to loop guard
  });

  it('9. store cache: failed IDs are NOT timestamped in activitiesDataFetchedAt', async () => {
    // Test the store contract directly
    const store = useDashboardStore.getState();
    useDashboardStore.setState({
      allDeals: [{ ID: '100' }, { ID: '200' }] as any,
      selectedColumns: ['ACTIVITY_LAST'],
      activitiesData: {},
      activitiesDataFetchedAt: {},
      isDemoMode: false,
    });

    // Mock global fetch to return partial response: ID 100 succeeded, ID 200 failed
    const globalFetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: true,
        fetchedDealIds: ['100'],
        failedDealIds: ['200'],
        activities: {
          '100': { all: [], last: undefined, next: undefined },
        },
      }),
    } as any);

    await useDashboardStore.getState().fetchActivitiesData();

    const state = useDashboardStore.getState();
    // ID 100 was successfully fetched -> timestamped
    expect(state.activitiesDataFetchedAt['100']).toBeDefined();
    // ID 200 failed -> must NOT be timestamped
    expect(state.activitiesDataFetchedAt['200']).toBeUndefined();

    globalFetchSpy.mockRestore();
  });

  it('10. numeric string next cursor ("50") -> parsed and advances pagination', async () => {
    const page1 = [{ ID: '1', OWNER_ID: '77', COMPLETED: 'N', CREATED: '2026-01-01T00:00:00Z' }];
    const page2 = [{ ID: '2', OWNER_ID: '77', COMPLETED: 'Y', CREATED: '2026-01-02T00:00:00Z' }];

    const bitrixPostSpy = vi.spyOn(bitrix, 'bitrixPost')
      .mockResolvedValueOnce({ result: page1, next: '50' } as any)
      .mockResolvedValueOnce({ result: page2 } as any);

    const res = await POST(makeRequest({ dealIds: ['77'] }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(bitrixPostSpy).toHaveBeenCalledTimes(2);
    expect(data.activities['77'].all.length).toBe(2);
    expect(data.activities['77'].last.ID).toBe('2');
  });

  it('11. invalid DEADLINE string does not displace valid upcoming deadline', async () => {
    const activities = [
      { ID: 'bad', OWNER_ID: '88', COMPLETED: 'N', DEADLINE: 'invalid-date-string', CREATED: '2026-01-01T00:00:00Z' },
      { ID: 'good', OWNER_ID: '88', COMPLETED: 'N', DEADLINE: '2026-05-01T10:00:00Z', CREATED: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({ result: activities } as any);

    const res = await POST(makeRequest({ dealIds: ['88'] }));
    const data = await res.json();

    expect(data.success).toBe(true);
    // The valid upcoming deadline must be chosen as next
    expect(data.activities['88'].next.ID).toBe('good');
  });

  it('12. invalid CREATED string is sorted defensively without breaking order', async () => {
    const activities = [
      { ID: 'inv', OWNER_ID: '99', COMPLETED: 'Y', CREATED: 'not-a-date' },
      { ID: 'newer', OWNER_ID: '99', COMPLETED: 'Y', CREATED: '2026-03-01T00:00:00Z' },
      { ID: 'older', OWNER_ID: '99', COMPLETED: 'Y', CREATED: '2026-01-01T00:00:00Z' },
    ];

    vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({ result: activities } as any);

    const res = await POST(makeRequest({ dealIds: ['99'] }));
    const data = await res.json();

    expect(data.success).toBe(true);
    // Newest valid date must be selected as last completed
    expect(data.activities['99'].last.ID).toBe('newer');
  });

  it('13. rejects malformed cursors ("50abc", "-10", 1.5) and triggers partial: true without looping', async () => {
    const invalidCursors = ['50abc', '-10', 1.5, 'bad-cursor'];

    for (const invalidCursor of invalidCursors) {
      vi.restoreAllMocks();
      vi.spyOn(authGuard, 'requireAuth').mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' } as any);
      vi.spyOn(authGuard, 'isAuthError').mockReturnValue(false);

      const bitrixPostSpy = vi.spyOn(bitrix, 'bitrixPost').mockResolvedValue({
        result: [{ ID: '1', OWNER_ID: '42', COMPLETED: 'N', CREATED: '2026-01-01T00:00:00Z' }],
        next: invalidCursor,
      } as any);

      const res = await POST(makeRequest({ dealIds: ['42'] }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(bitrixPostSpy).toHaveBeenCalledTimes(1); // Did not loop!
      expect(data.partial).toBe(true); // Loop guard marked partial
    }
  });

  it('14. Case C: all invalid deadlines produce deterministic result without process crash', async () => {
    const activities = [
      { ID: 'bad1', OWNER_ID: '43', COMPLETED: 'N', DEADLINE: 'invalid-date-1', CREATED: '2026-01-01T00:00:00Z' },
      { ID: 'bad2', OWNER_ID: '43', COMPLETED: 'N', DEADLINE: 'invalid-date-2', CREATED: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({ result: activities } as any);

    const res = await POST(makeRequest({ dealIds: ['43'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.activities['43']).toBeDefined();
    // Deterministic selection without throwing NaN or crashing
    expect(['bad1', 'bad2']).toContain(data.activities['43'].next.ID);
  });
});

