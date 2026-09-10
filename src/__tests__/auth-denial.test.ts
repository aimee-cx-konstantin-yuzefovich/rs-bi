// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/sso-hmac', () => ({ verifySsoToken: mocks.verify, isProxySecretConfigured: () => true, timingSafeEqualString: () => false }));
vi.mock('@/lib/auth-audit', () => ({ auditLog: mocks.audit }));
import { authOptions } from '@/lib/auth';
const provider = authOptions.providers[0] as any;
const authorize = provider.options.authorize;
beforeEach(() => vi.clearAllMocks());
describe('verified access denial', () => {
  it('only reports access denial after verifying the token identity', async () => {
    mocks.verify.mockResolvedValue({ email: 'person@outside.test', role: 'user' });
    await expect(authorize({ email: 'person@outside.test', password: 'wp-sso-hmac|test' }, {})).rejects.toThrow('ACCESS_DENIED');
    expect(mocks.audit).toHaveBeenCalledWith('LOGIN_DOMAIN_BLOCKED', expect.objectContaining({ email: 'person@outside.test' }), 'unknown');
  });
  it('keeps invalid tokens as credential failures and audits them', async () => {
    mocks.verify.mockResolvedValue(null);
    expect(await authorize({ email: 'person@outside.test', password: 'wp-sso-hmac|bad' }, {})).toBeNull();
    expect(mocks.audit).toHaveBeenCalledWith('LOGIN_BLOCKED_INVALID_HMAC', expect.anything(), 'unknown');
  });
});
