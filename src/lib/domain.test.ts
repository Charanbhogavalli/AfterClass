import { describe, expect, it } from 'vitest';
import { isApprovedCollegeEmail, normalizeEmail } from './domain';
import { validateDisplayName } from './profile';

describe('isApprovedCollegeEmail', () => {
  it('accepts verified cvv.ac.in accounts, ignoring case and surrounding spaces', () => {
    expect(isApprovedCollegeEmail('Student.Name@CVV.ac.in', true)).toBe(true);
    expect(isApprovedCollegeEmail('  ab+tag@cvv.ac.in ', true)).toBe(true);
  });

  it('rejects unverified accounts even on the approved domain', () => {
    expect(isApprovedCollegeEmail('student@cvv.ac.in', false)).toBe(false);
  });

  it('rejects other domains, subdomains and look-alike domains', () => {
    expect(isApprovedCollegeEmail('student@gmail.com', true)).toBe(false);
    expect(isApprovedCollegeEmail('student@mail.cvv.ac.in', true)).toBe(false);
    expect(isApprovedCollegeEmail('student@cvv.ac.in.evil.com', true)).toBe(false);
    expect(isApprovedCollegeEmail('student@notcvv.ac.in', true)).toBe(false);
  });

  it('rejects malformed or missing addresses', () => {
    expect(isApprovedCollegeEmail(null, true)).toBe(false);
    expect(isApprovedCollegeEmail(undefined, true)).toBe(false);
    expect(isApprovedCollegeEmail('@cvv.ac.in', true)).toBe(false);
    expect(isApprovedCollegeEmail('a b@cvv.ac.in', true)).toBe(false);
    expect(isApprovedCollegeEmail('a@b@cvv.ac.in', true)).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('lower-cases and trims', () => {
    expect(normalizeEmail('  A@Cvv.AC.in ')).toBe('a@cvv.ac.in');
  });
});

describe('validateDisplayName', () => {
  it('collapses whitespace and accepts names within limits', () => {
    expect(validateDisplayName('  Asha   Rao ')).toEqual({ ok: true, value: 'Asha Rao' });
  });

  it('rejects names that are too short or too long', () => {
    expect(validateDisplayName(' a ').ok).toBe(false);
    expect(validateDisplayName('x'.repeat(61)).ok).toBe(false);
    expect(validateDisplayName('x'.repeat(60)).ok).toBe(true);
  });
});
