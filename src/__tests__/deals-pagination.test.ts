import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/bitrix/deals/route';
import { NextRequest } from 'next/server';
import * as bitrix from '@/lib/bitrix';
import * as authGuard from '@/lib/auth-guard';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

function makeRequest(body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/bitrix/deals', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('Deals Pagination & Partial Failure Semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, 'requireAuth').mockResolvedValue({ id: '1', email: 'test@russilica.ru', role: 'admin' } as any);
    vi.spyOn(authGuard, 'isAuthError').mockReturnValue(false);
  });

  it('1. first page only (< 50 deals) -> success: true, partial: false, capped: false, truncated: false', async () => {
    const mockDeals = Array.from({ length: 30 }, (_, i) => ({ ID: String(i + 1), TITLE: `Deal ${i + 1}` }));
    vi.spyOn(bitrix, 'bitrixPost').mockResolvedValueOnce({
      result: mockDeals,
      total: 30,
    } as any);

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.failedPages).toBe(0);
    expect(data.cappedByLimit).toBe(false);
    expect(data.truncated).toBe(false);
    expect(data.fetched).toBe(30);
    expect(data.total).toBe(30);
    expect(data.warning).toBeUndefined();
  });

  it('2. all multiple pages succeed (e.g. 120 deals across 3 pages) -> partial: false, all deals returned', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      if (start === 0) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
          total: 120,
          next: 50,
        } as any;
      } else if (start === 50) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(50 + i + 1) })),
          total: 120,
          next: 100,
        } as any;
      } else if (start === 100) {
        return {
          result: Array.from({ length: 20 }, (_, i) => ({ ID: String(100 + i + 1) })),
          total: 120,
        } as any;
      }
      return { result: [] } as any;
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.failedPages).toBe(0);
    expect(data.cappedByLimit).toBe(false);
    expect(data.truncated).toBe(false);
    expect(data.fetched).toBe(120);
    expect(data.total).toBe(120);
    expect(data.deals.length).toBe(120);
    expect(data.warning).toBeUndefined();
  });

  it('3. total exceeds application cap (e.g. 1500 deals) -> cappedByLimit: true, truncated: true, partial: false', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      return {
        result: Array.from({ length: 50 }, (_, i) => ({ ID: String(start + i + 1) })),
        total: 1500,
        next: start + 50,
      } as any;
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.failedPages).toBe(0);
    expect(data.cappedByLimit).toBe(true);
    expect(data.truncated).toBe(true);
    expect(data.fetched).toBe(1000);
    expect(data.total).toBe(1500);
    expect(data.warning).toBe('Данные усечены. Показаны последние 1000 сделок.');
  });

  it('4. one middle page fails -> partial: true, failedPages: 1, truthful warning', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      if (start === 0) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
          total: 150,
          next: 50,
        } as any;
      } else if (start === 50) {
        // Page 2 fails
        throw new Error('Bitrix temporary 502 Bad Gateway');
      } else if (start === 100) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(100 + i + 1) })),
          total: 150,
        } as any;
      }
      return { result: [] } as any;
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.partial).toBe(true);
    expect(data.failedPages).toBe(1);
    expect(data.failedOffsets).toEqual([50]);
    expect(data.fetched).toBe(100);
    expect(data.total).toBe(150);
    expect(data.truncated).toBe(true);
    expect(data.cappedByLimit).toBe(false);
    // Anti-test-theater: Must NOT say "Showing the latest 1000 deals"
    expect(data.warning).toBe('Некоторые данные не удалось загрузить. Показано 100 из 150 сделок.');
  });

  it('5. multiple pages fail -> partial: true, failedPages: count of failures', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      if (start === 0) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
          total: 200,
          next: 50,
        } as any;
      }
      // Both offset 50 and offset 100 fail; offset 150 succeeds
      if (start === 150) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(150 + i + 1) })),
          total: 200,
        } as any;
      }
      throw new Error('Timeout');
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(data.partial).toBe(true);
    expect(data.failedPages).toBe(2);
    expect(data.failedOffsets).toEqual([50, 100]);
    expect(data.fetched).toBe(100);
    expect(data.warning).toBe('Некоторые данные не удалось загрузить. Показано 100 из 200 сделок.');
  });

  it('6. partial failure plus cap -> partial takes precedence in warning', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      if (start === 0) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
          total: 2000, // exceeds cap
          next: 50,
        } as any;
      }
      if (start === 100) {
        throw new Error('Fetch error on offset 100');
      }
      return {
        result: Array.from({ length: 50 }, (_, i) => ({ ID: String(start + i + 1) })),
        total: 2000,
      } as any;
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(data.cappedByLimit).toBe(true);
    expect(data.partial).toBe(true);
    expect(data.failedPages).toBe(1);
    expect(data.warning).toContain('Некоторые данные не удалось загрузить');
  });

  it('7. first page fails -> whole request fails with status 500', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockRejectedValue(new Error('Bitrix API completely down'));

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.deals).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('8. mathematical consistency check across all fields', async () => {
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      if (start === 0) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
          total: 150,
          next: 50,
        } as any;
      }
      if (start === 50) {
        throw new Error('Fail');
      }
      return {
        result: Array.from({ length: 50 }, (_, i) => ({ ID: String(start + i + 1) })),
        total: 150,
      } as any;
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    // Invariants
    expect(data.fetched).toBe(data.deals.length);
    expect(data.truncated).toBe(data.total > data.fetched);
    expect(data.partial).toBe(data.failedPages > 0);
    expect(data.failedOffsets.length).toBe(data.failedPages);
  });

  it('9. caller provides non-zero start (start: 100, total: 220) -> fetches 150 and 200, never fetches 50', async () => {
    const requestedOffsets: number[] = [];
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      requestedOffsets.push(start);
      if (start === 100) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(100 + i + 1) })),
          total: 220,
          next: 150,
        } as any;
      } else if (start === 150) {
        return {
          result: Array.from({ length: 50 }, (_, i) => ({ ID: String(150 + i + 1) })),
          total: 220,
          next: 200,
        } as any;
      } else if (start === 200) {
        return {
          result: Array.from({ length: 20 }, (_, i) => ({ ID: String(200 + i + 1) })),
          total: 220,
        } as any;
      }
      return { result: [] } as any;
    });

    const res = await POST(makeRequest({ start: 100 }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(requestedOffsets).toEqual([100, 150, 200]);
    expect(requestedOffsets).not.toContain(50);
    expect(data.fetched).toBe(120);
    expect(data.deals.length).toBe(120);
    expect(data.deals[0].ID).toBe("101");
    expect(data.deals[119].ID).toBe("220");
    expect(data.partial).toBe(false);
  });

  it('10. caller provides non-zero start with fewer than 50 remaining deals -> single page', async () => {
    const requestedOffsets: number[] = [];
    vi.spyOn(bitrix, 'bitrixPost').mockImplementation(async (method, params: any) => {
      const start = params?.start || 0;
      requestedOffsets.push(start);
      return {
        result: Array.from({ length: 25 }, (_, i) => ({ ID: String(100 + i + 1) })),
        total: 125,
      } as any;
    });

    const res = await POST(makeRequest({ start: 100 }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(requestedOffsets).toEqual([100]);
    expect(data.fetched).toBe(25);
    expect(data.deals.length).toBe(25);
    expect(data.partial).toBe(false);
  });
});

