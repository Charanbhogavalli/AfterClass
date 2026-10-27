/** The only college email domain admitted by the identity policy. Mirrors firestore.rules. */
export const APPROVED_DOMAIN = 'cvv.ac.in';

const LOCAL_PART = /^[a-z0-9][a-z0-9._+-]*$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Client-side gate for UX only. Security is enforced by Firestore rules, which
 * check the same policy against the verified ID token.
 * Subdomains (for example x.cvv.ac.in) are deliberately rejected.
 */
export function isApprovedCollegeEmail(email: string | null | undefined, emailVerified: boolean): boolean {
  if (!email || !emailVerified) return false;
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return domain === APPROVED_DOMAIN && LOCAL_PART.test(local);
}
