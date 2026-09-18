import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp, checkRateLimit, clearRateLimitsForTesting, isValidIp } from '@/proxy';
import { extractClientIp as extractClientIpPure, getClientIp as getClientIpPure, normalizeClientIp, isValidIp as isValidIpPure } from '@/lib/client-ip';


function makeRequest(headers: Record<string, string | undefined>): NextRequest {
  const headerEntries: [string, string][] = Object.entries(headers)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => [k, v as string]);
  const req = new NextRequest('http://localhost:3000/api/bitrix/deals', {
    method: 'POST',
    headers: new Headers(headerEntries),
  });
  return req;
}

describe('Proxy Client IP & Rate-Limit Trust Model', () => {
  beforeEach(() => {
    clearRateLimitsForTesting();
  });

  it('1. extracts trusted sanitized client IP A', () => {
    const req = makeRequest({ 'x-real-ip': '203.0.113.10' });
    expect(getClientIp(req)).toBe('203.0.113.10');
  });

  it('2. extracts trusted sanitized client IP B', () => {
    const req = makeRequest({ 'x-real-ip': '198.51.100.25' });
    expect(getClientIp(req)).toBe('198.51.100.25');
  });

  it('3. IP A and IP B receive independent rate-limit buckets', () => {
    const ipA = '203.0.113.10';
    const ipB = '198.51.100.25';
    const limit = 2;
    const windowMs = 60_000;

    // Consume all 2 requests for IP A
    const a1 = checkRateLimit(ipA, limit, windowMs);
    const a2 = checkRateLimit(ipA, limit, windowMs);
    const a3 = checkRateLimit(ipA, limit, windowMs);

    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(true);
    expect(a3.allowed).toBe(false); // IP A is rate-limited

    // IP B must still have full quota
    const b1 = checkRateLimit(ipB, limit, windowMs);
    const b2 = checkRateLimit(ipB, limit, windowMs);
    const b3 = checkRateLimit(ipB, limit, windowMs);

    expect(b1.allowed).toBe(true);
    expect(b2.allowed).toBe(true);
    expect(b3.allowed).toBe(false); // IP B is rate-limited independently
  });

  it('4. spoofed extra XFF data does not override the proxy-selected client identity', () => {
    // Case A: Proxy sets X-Real-IP, attacker supplied fake XFF
    const reqWithRealIp = makeRequest({
      'x-real-ip': '203.0.113.50',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12',
    });
    expect(getClientIp(reqWithRealIp)).toBe('203.0.113.50');

    // Case B: In XFF chain where trusted proxy appended client IP, attacker-supplied prefix is ignored
    const reqXffChain = makeRequest({
      'x-forwarded-for': '1.2.3.4, 198.51.100.77',
    });
    expect(getClientIp(reqXffChain)).toBe('198.51.100.77');
  });

  it('5. missing header uses safe fallback "unknown" (never manufactures 127.0.0.1)', () => {
    const req = makeRequest({ host: 'bi-terminal.rus-silica.com' });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('6. malformed header uses safe fallback "unknown"', () => {
    const cases = [
      { 'x-real-ip': 'invalid-ip' },
      { 'x-real-ip': '999.999.999.999' },
      { 'x-real-ip': '; DROP TABLE users;' },
      { 'x-real-ip': '   ' },
      { 'x-forwarded-for': 'bad-ip, another-bad-ip' },
    ];

    for (const headers of cases) {
      const req = makeRequest({ ...headers, host: 'bi-terminal.rus-silica.com' });
      expect(getClientIp(req)).toBe('unknown');
    }
  });

  it('7. valid IPv6 addresses are parsed correctly', () => {
    const reqIpv6 = makeRequest({ 'x-real-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334' });
    expect(getClientIp(reqIpv6)).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');

    const reqIpv6Short = makeRequest({ 'x-real-ip': '::1' });
    expect(getClientIp(reqIpv6Short)).toBe('::1');
  });

  it('8. localhost development continues working', () => {
    // In dev environment with host localhost:3000
    const reqLocalhost = makeRequest({ host: 'localhost:3000' });
    expect(getClientIp(reqLocalhost)).toBe('127.0.0.1');

    const req127 = makeRequest({ host: '127.0.0.1:3000' });
    expect(getClientIp(req127)).toBe('127.0.0.1');
  });

  it('9. isValidIp helper handles edge cases', () => {
    expect(isValidIp('')).toBe(false);
    expect(isValidIp(' ')).toBe(false);
    expect(isValidIp('127.0.0.1')).toBe(true);
    expect(isValidIp('255.255.255.255')).toBe(true);
    expect(isValidIp('256.0.0.1')).toBe(false);
    expect(isValidIp('1.2.3.4.5')).toBe(false);
    expect(isValidIp('::1')).toBe(true);
    expect(isValidIp('fe80::1')).toBe(true);
    expect(isValidIp('::ffff:192.0.2.1')).toBe(true);
    expect(isValidIp('::ffff:127.0.0.1')).toBe(true);
    expect(isValidIp('not:an:ip:address')).toBe(false);
  });

  it('10. handles IPv4-mapped IPv6 addresses in getClientIp', () => {
    const req = makeRequest({ 'x-real-ip': '::ffff:198.51.100.42' });
    expect(getClientIp(req)).toBe('::ffff:198.51.100.42');
  });

  it('11. pure client-ip helper extracts from plain object, Headers, and functional getters identically', () => {
    // Plain object
    const plainObj = { 'x-real-ip': '203.0.113.88' };
    expect(extractClientIpPure(plainObj)).toBe('203.0.113.88');
    expect(getClientIpPure(plainObj)).toBe('203.0.113.88');

    // Headers instance
    const headers = new Headers({ 'x-real-ip': '203.0.113.88' });
    expect(extractClientIpPure(headers)).toBe('203.0.113.88');
    expect(getClientIpPure(headers)).toBe('203.0.113.88');

    // Functional getters
    const getRealIp = () => '203.0.113.88';
    const getXff = () => null;
    const getHost = () => 'bi.example.com';
    expect(extractClientIpPure(getRealIp, getXff, getHost, true)).toBe('203.0.113.88');
  });

  it('12. normalizeClientIp unwraps IPv4-mapped IPv6 addresses when needed', () => {
    expect(normalizeClientIp('::ffff:198.51.100.42')).toBe('198.51.100.42');
    expect(normalizeClientIp('198.51.100.42')).toBe('198.51.100.42');
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1');
  });
});

