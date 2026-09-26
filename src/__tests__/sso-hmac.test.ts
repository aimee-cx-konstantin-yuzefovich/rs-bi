import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateSsoHmac,
  generateSsoToken,
  verifySsoToken,
  timingSafeEqualString,
  isProxySecretConfigured,
} from '@/lib/sso-hmac';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

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

  describe('verifySsoToken Replay Protection & Fail-Closed Semantics', () => {
    const validPayload = () => ({
      email: 'security@russilica.ru',
      role: 'administrator',
      timestamp: Math.floor(Date.now() / 1000),
    });

    it('1. valid unused token -> accepted', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);

      const deleteManySpy = vi.spyOn(db.usedNonce, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const createSpy = vi.spyOn(db.usedNonce, 'create').mockResolvedValue({ nonce: 'test', createdAt: new Date() } as any);

      const result = await verifySsoToken(token);
      expect(result).not.toBeNull();
      expect(result?.email).toBe('security@russilica.ru');
      expect(createSpy).toHaveBeenCalled();

      deleteManySpy.mockRestore();
      createSpy.mockRestore();
    });

    it('2. same token reused -> rejected via unique constraint, logs redacted fingerprint', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);
      const signature = token.split('|')[4];

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`nonce`)', {
        code: 'P2002',
        clientVersion: '6.11.1',
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deleteManySpy = vi.spyOn(db.usedNonce, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const createSpy = vi.spyOn(db.usedNonce, 'create').mockRejectedValue(p2002Error);

      const result = await verifySsoToken(token);
      expect(result).toBeNull();

      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0][0];
      expect(warnMsg).toContain('nonce fingerprint:');
      // Must NOT leak the raw 64-character signature
      expect(warnMsg).not.toContain(signature);

      warnSpy.mockRestore();
      deleteManySpy.mockRestore();
      createSpy.mockRestore();
    });

    it('3. nonce INSERT unique violation (P2002) -> rejected', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint violation', {
        code: 'P2002',
        clientVersion: '6.11.1',
      });

      vi.spyOn(db.usedNonce, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const createSpy = vi.spyOn(db.usedNonce, 'create').mockRejectedValue(p2002Error);

      const result = await verifySsoToken(token);
      expect(result).toBeNull();
      expect(createSpy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });

    it('4. unexpected nonce INSERT failure -> rejected (FAIL-CLOSED)', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);

      vi.spyOn(db.usedNonce, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      vi.spyOn(db.usedNonce, 'create').mockRejectedValue(new Error('Disk I/O error or corruption'));

      const result = await verifySsoToken(token);
      // In old implementation, this returned payload (fail-open).
      // In new implementation, this MUST be null (fail-closed).
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('5. nonce storage unavailable -> rejected (FAIL-CLOSED)', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);

      vi.spyOn(db.usedNonce, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      vi.spyOn(db.usedNonce, 'create').mockRejectedValue(new Error('Connection to database lost'));

      const result = await verifySsoToken(token);
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('6. cleanup/deleteMany failure but nonce INSERT succeeds -> token accepted', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);

      vi.spyOn(db.usedNonce, 'deleteMany').mockRejectedValue(new Error('Cleanup table locked'));
      const createSpy = vi.spyOn(db.usedNonce, 'create').mockResolvedValue({ nonce: 'test', createdAt: new Date() } as any);

      const result = await verifySsoToken(token);
      expect(result).not.toBeNull();
      expect(result?.email).toBe('security@russilica.ru');
      expect(createSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('7. two simultaneous verifications of the same token -> at most ONE succeeds', async () => {
      const payload = validPayload();
      const token = generateSsoToken(payload);

      // Simulate atomic unique constraint: first create succeeds, second throws P2002
      let callCount = 0;
      vi.spyOn(db.usedNonce, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      vi.spyOn(db.usedNonce, 'create').mockImplementation((async () => {
        callCount++;
        if (callCount === 1) {
          return { nonce: 'test', createdAt: new Date() } as any;
        }
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on nonce', {
          code: 'P2002',
          clientVersion: '6.11.1',
        });
      }) as any);

      const [res1, res2] = await Promise.all([
        verifySsoToken(token),
        verifySsoToken(token),
      ]);

      const successCount = [res1, res2].filter(Boolean).length;
      expect(successCount).toBe(1);
      expect(successCount <= 1).toBe(true);

      vi.restoreAllMocks();
    });
  });
});
