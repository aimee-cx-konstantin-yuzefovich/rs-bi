import { describe, it, expect } from 'vitest';
import { isCorporateEmail, mapWpRoleToBiRole } from '@/lib/auth';

describe('Auth & Role Mapping Tests', () => {
  describe('isCorporateEmail', () => {
    it('should accept valid @russilica.ru corporate emails', () => {
      expect(isCorporateEmail('manager@russilica.ru')).toBe(true);
      expect(isCorporateEmail('ADMIN@RUSSILICA.RU')).toBe(true);
      expect(isCorporateEmail('ivan.petrov@russilica.ru')).toBe(true);
    });

    it('should accept explicit allowlist emails', () => {
      expect(isCorporateEmail('constantinejozefowicz@gmail.com')).toBe(true);
    });

    it('should reject non-corporate emails', () => {
      expect(isCorporateEmail('attacker@gmail.com')).toBe(false);
      expect(isCorporateEmail('user@mail.ru')).toBe(false);
      expect(isCorporateEmail('user@yandex.ru')).toBe(false);
      expect(isCorporateEmail('fake@russilica.com')).toBe(false);
    });
  });

  describe('mapWpRoleToBiRole', () => {
    it('should map administrator or admin to admin', () => {
      expect(mapWpRoleToBiRole('administrator')).toBe('admin');
      expect(mapWpRoleToBiRole('ADMINISTRATOR')).toBe('admin');
      expect(mapWpRoleToBiRole('admin')).toBe('admin');
    });

    it('should map other or unknown roles to user', () => {
      expect(mapWpRoleToBiRole('editor')).toBe('user');
      expect(mapWpRoleToBiRole('author')).toBe('user');
      expect(mapWpRoleToBiRole('subscriber')).toBe('user');
      expect(mapWpRoleToBiRole('')).toBe('user');
      expect(mapWpRoleToBiRole(null)).toBe('user');
      expect(mapWpRoleToBiRole(undefined)).toBe('user');
    });
  });
});
