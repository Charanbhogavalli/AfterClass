import { isApprovedCollegeEmail, normalizeEmail } from './domain';

/**
 * The only account that may use admin screens. This mirrors isAdmin() in firestore.rules.
 * The address is an identifier, not a credential: it grants nothing on its own.
 * Firestore Security Rules are the real authorization boundary; this check only chooses what to show.
 */
export const ADMIN_EMAIL = 'bhogavalli.cvv241072@cvv.ac.in';

export function isAdminIdentity(email: string | null | undefined, emailVerified: boolean): boolean {
  if (!email || !isApprovedCollegeEmail(email, emailVerified)) return false;
  return normalizeEmail(email) === ADMIN_EMAIL;
}
