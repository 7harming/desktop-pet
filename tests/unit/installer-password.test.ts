import { describe, it, expect } from 'vitest';
import { passwordHash } from '../../scripts/installer-password.mjs';

describe('passwordHash', () => {
  it('is upper-case SHA-256 of salt + password, repeated', () => {
    // SHA-256("abc"), the standard test vector
    expect(passwordHash('a', 'bc', 1)).toBe('BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
    expect(passwordHash('a', 'bc', 2)).toBe(passwordHash('', 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD', 1));
  });
  it('hashes the UTF-8 bytes of non-ASCII passwords', () => {
    // matches what StdUtils::HashText gave for 貓咪abc in the installer
    expect(passwordHash('', '貓咪abc', 1)).toBe('017592DE08A5C3555CA39CDE42A6BB4D66551CF48B5A1FBCDC36CE419F020FD2');
  });
});
