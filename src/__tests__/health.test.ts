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
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports buildSha from BUILD_SHA without secrets', async () => {
    const prev = process.env.BUILD_SHA;
    process.env.BUILD_SHA = '0acf5db25e13d91b089fbaae75dafc9e8758f9a2';
    try {
      const response = await GET();
      const body = await response.json();
      expect(body).toEqual({
        status: 'ok',
        buildSha: '0acf5db25e13d91b089fbaae75dafc9e8758f9a2',
      });
      expect(JSON.stringify(body)).not.toMatch(/WEBHOOK|SECRET|TOKEN|PASSWORD/i);
    } finally {
      if (prev === undefined) delete process.env.BUILD_SHA;
      else process.env.BUILD_SHA = prev;
    }
  });

  it('truthfully reports unknown when BUILD_SHA is absent (never fabricates a SHA)', async () => {
    const prev = process.env.BUILD_SHA;
    delete process.env.BUILD_SHA;
    try {
      const response = await GET();
      const body = await response.json();
      expect(body.buildSha).toBe('unknown');
    } finally {
      if (prev !== undefined) process.env.BUILD_SHA = prev;
    }
  });

  it('includes buildTime only when provided', async () => {
    const prevSha = process.env.BUILD_SHA;
    const prevTime = process.env.BUILD_TIME;
    delete process.env.BUILD_SHA;
    delete process.env.BUILD_TIME;
    try {
      const without = await (await GET()).json();
      expect(without.buildTime).toBeUndefined();
      process.env.BUILD_TIME = '2026-09-26T21:00:00Z';
      const withTime = await (await GET()).json();
      expect(withTime.buildTime).toBe('2026-09-26T21:00:00Z');
    } finally {
      if (prevSha !== undefined) process.env.BUILD_SHA = prevSha;
      if (prevTime !== undefined) process.env.BUILD_TIME = prevTime;
    }
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
