import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, calculatePercentage } from '@/lib/utils';

describe('Math & Logic Validation (Utils)', () => {
  describe('calculatePercentage', () => {
    it('should calculate percentage correctly', () => {
      expect(calculatePercentage(50, 100)).toBe(50);
      expect(calculatePercentage(25, 100)).toBe(25);
    });

    it('should handle zero denominator gracefully (Boundary Test)', () => {
      expect(calculatePercentage(50, 0)).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(calculatePercentage(-50, 100)).toBe(-50);
      expect(calculatePercentage(50, -100)).toBe(-50);
    });
  });

  describe('formatCurrency', () => {
    it('should format numbers as currency', () => {
      expect(formatCurrency(1000)).toBe('1 000 ₽');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('0 ₽');
    });

    it('should handle negative numbers', () => {
      expect(formatCurrency(-1000)).toBe('-1 000 ₽');
    });
  });
});
