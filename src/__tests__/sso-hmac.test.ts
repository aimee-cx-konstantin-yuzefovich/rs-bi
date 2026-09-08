import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateSsoHmac,
  generateSsoToken,
  timingSafeEqualString,
  isProxySecretConfigured,
} from '@/lib/sso-hmac';

describe('SSO HMAC Security Tests', () => {
  const originalEnv = process.env.PROXY_SECRET;

  beforeEach(() => {
    process.env.PROXY_SECRET = 'test-secret-key-12345';
  });

  afterEach(() => {
    process.env.PROXY_SECRET = originalEnv;
  });

  it('should verify proxy secret configuration status', () => {
    expect(isProxySecretConfigured()).toBe(true);
  });

  it('should generate deterministic HMAC signature', () => {
    const payload = {
      email: 'user@russilica.ru',
      role: 'administrator',
      timestamp: 1700000000,
    };
    const sig1 = generateSsoHmac(payload);
    const sig2 = generateSsoHmac(payload);
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate formatted SSO token string', () => {
    const payload = {
      email: 'ivan@russilica.ru',
      role: 'editor',
      timestamp: 1700000000,
    };
    const token = generateSsoToken(payload);
    expect(token.startsWith('wp-sso-hmac|')).toBe(true);
    const parts = token.split('|');
    expect(parts[1]).toBe('ivan@russilica.ru');
    expect(parts[2]).toBe('editor');
    expect(parts[3]).toBe('1700000000');
    expect(parts[4]).toMatch(/^[a-f0-9]{64}$/);
  });

  describe('timingSafeEqualString', () => {
    it('should match identical strings', () => {
      expect(timingSafeEqualString('secret123', 'secret123')).toBe(true);
    });

    it('should reject different strings', () => {
      expect(timingSafeEqualString('secret123', 'secret456')).toBe(false);
    });

    it('should reject oversized strings (> 512 bytes)', () => {
      const longStr = 'a'.repeat(600);
      expect(timingSafeEqualString(longStr, longStr)).toBe(false);
    });
  });
});
