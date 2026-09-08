// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/health/route';
import proxy from '@/proxy';

afterAll(() => clearInterval(globalThis.__rateLimitInterval));

describe('process health', () => {
  it('returns only liveness without credentials or configuration', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('remains available after the same client exhausts its API quota', () => {
    const request = (path: string) => new NextRequest(`http://localhost:3000${path}`, {
      headers: { 'x-forwarded-for': '192.0.2.20' },
    });
    let limited;
    for (let i = 0; i < 100; i++) limited = proxy(request('/api/companies'));
    expect(limited?.status).toBe(429);
    for (let i = 0; i < 100; i++) {
      const health = proxy(request('/api/health'));
      expect(health.status).toBe(200);
      expect(health.headers.get('x-middleware-next')).toBe('1');
      expect(health.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(health.headers.has('X-RateLimit-Limit')).toBe(false);
    }
    expect(proxy(request('/api/health/other')).status).toBe(429);
  });
});
