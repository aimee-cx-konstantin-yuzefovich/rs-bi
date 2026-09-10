// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/db', () => ({ db: { auditLog: { create: mocks.create } } }));
vi.mock('@/lib/config.server', () => ({ WP_LOGIN_URL: 'https://wp.example/wp-login.php' }));
vi.mock('@/lib/config', () => ({ shouldLog: false }));
import { POST } from '@/app/api/auth/wp-login/route';
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());
const request = () => new Request('http://localhost/api/auth/wp-login', { method: 'POST', body: JSON.stringify({ email: 'person@russilica.ru', password: 'secret-password' }) });
describe('WordPress login failure classification and audit', () => {
  it.each([[401, 'INVALID_CREDENTIALS', 401], [429, 'RATE_LIMITED', 429], [500, 'SERVICE_UNAVAILABLE', 502], [403, 'SERVICE_UNAVAILABLE', 502]])('maps upstream %s to %s', async (status, code, expectedStatus) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive upstream response', { status: Number(status) })));
    const response = await POST(request());
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toMatchObject({ success: false, code });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const audit = JSON.stringify(mocks.create.mock.calls);
    expect(audit).toContain('person@russilica.ru');
    expect(audit).not.toContain('secret-password');
    expect(audit).not.toContain('sensitive upstream response');
  });
  it.each(['html', 'missing-token', 'network'])('audits %s failures', async mode => {
    const fetchMock = mode === 'network' ? vi.fn().mockRejectedValue(new Error('network detail')) : vi.fn().mockResolvedValue(new Response(mode === 'html' ? '<html>broken</html>' : JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('audits invalid request bodies', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: 'invalid' }));
    expect(response.status).toBe(400);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('passes the token to NextAuth without logging it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, token: 'wp-sso-hmac|private-token' })));
    const response = await POST(request());
    expect(await response.json()).toEqual({ success: true, token: 'wp-sso-hmac|private-token' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
