import { describe, it, expect } from 'vitest';
import { isSystemField, SYSTEM_FIELDS_TO_EXCLUDE } from '@/lib/bitrix';

describe('Bitrix Field Filtering Tests', () => {
  it('should exclude system IDs and metadata for deals', () => {
    expect(isSystemField('ID', undefined, 'deal')).toBe(true);
    expect(isSystemField('LEAD_ID', undefined, 'deal')).toBe(true);
    expect(isSystemField('CREATED_BY_ID', undefined, 'deal')).toBe(true);
    expect(isSystemField('UTM_SOURCE', undefined, 'deal')).toBe(true);
  });

  it('should differentiate DEAL vs COMPANY system fields', () => {
    // DATE_CREATE is hidden on deals but kept on companies
    expect(isSystemField('DATE_CREATE', undefined, 'deal')).toBe(true);
    expect(isSystemField('DATE_CREATE', undefined, 'company')).toBe(false);

    expect(isSystemField('LAST_ACTIVITY_TIME', undefined, 'deal')).toBe(true);
    expect(isSystemField('LAST_ACTIVITY_TIME', undefined, 'company')).toBe(false);
  });

  it('should never exclude custom fields (UF_CRM_*)', () => {
    expect(isSystemField('UF_CRM_123456789', undefined, 'deal')).toBe(false);
    expect(isSystemField('UF_CRM_CUSTOM_FIELD', undefined, 'company')).toBe(false);
  });

  it('should exclude explicitly blacklisted custom fields', () => {
    expect(isSystemField('UF_CRM_692573380C4F0', undefined, 'deal')).toBe(true);
    expect(isSystemField('UF_CRM_1774878993375', undefined, 'deal')).toBe(true);
  });

  it('should exclude file type fields', () => {
    expect(isSystemField('MY_ATTACHMENT', { type: 'file' }, 'deal')).toBe(true);
  });
});
