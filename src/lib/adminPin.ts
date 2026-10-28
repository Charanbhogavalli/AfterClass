/**
 * Cosmetic UI gate for the /admin screen. It is NOT administrator authentication.
 * Anyone can read browser JavaScript, so the PIN never protects data: every privileged
 * read and write is enforced by Firestore Security Rules that check the administrator identity.
 * Only a SHA-256 digest is stored here, so the PIN itself does not appear in the source.
 */
export const ADMIN_PIN_LENGTH = 5;

const ADMIN_PIN_SHA256 = '8550f18e5ded9f0ade5cf692529302ed59b2032d6c77cbb88f8732a4cf1e291e';

/** Keeps digits only and caps the length. Leading zeros are preserved because the value stays a string. */
export function normalizePin(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, ADMIN_PIN_LENGTH);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const candidate = normalizePin(pin);
  if (candidate.length !== ADMIN_PIN_LENGTH) return false;
  return (await sha256Hex(candidate)) === ADMIN_PIN_SHA256;
}
