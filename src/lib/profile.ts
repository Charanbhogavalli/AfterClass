import type { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { logDevError } from './errors';

/** Must match the size rule for users.displayName in firestore.rules. */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;

/**
 * Fields a student can read on their own document. points and streak are written only
 * by trusted server logic (not yet available on the Spark plan), so they are read-only here.
 */
export interface StudentProfile {
  displayName: string;
  photoURL: string | null;
  points: number;
  streak: number;
}

export type NameResult = { ok: true; value: string } | { ok: false; error: string };

export function validateDisplayName(raw: string): NameResult {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < DISPLAY_NAME_MIN) return { ok: false, error: `Use at least ${DISPLAY_NAME_MIN} characters.` };
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, error: `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.` };
  return { ok: true, value };
}

/** Creates the profile on first sign-in. Existing profiles are never overwritten. */
export async function ensureProfile(user: User): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const ref = doc(db, 'users', user.uid);
  let existing;
  try {
    existing = await getDoc(ref); // reads users/{uid}; rules allow this for verified CVV students
  } catch (err) {
    logDevError('profile read users/{uid}', err);
    throw err;
  }
  if (existing.exists()) return;

  const name = validateDisplayName(user.displayName ?? '');
  const photo = user.photoURL && user.photoURL.startsWith('https://') && user.photoURL.length <= 500 ? user.photoURL : null;
  try {
    await setDoc(ref, {
      displayName: name.ok ? name.value : 'CVV student',
      photoURL: photo,
      points: 0,
      streak: 0,
      scoredQuizzes: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    logDevError('profile create users/{uid}', err);
    throw err;
  }
}

export function subscribeToProfile(
  uid: string,
  onData: (profile: StudentProfile | null) => void,
  onError: (message: string) => void,
): () => void {
  if (!db) throw new Error('Firestore is not configured.');
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) return onData(null);
      const data = snap.data();
      onData({
        displayName: String(data.displayName ?? ''),
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        points: Number(data.points ?? 0),
        streak: Number(data.streak ?? 0),
      });
    },
    () => onError('Your profile could not be loaded. Please refresh and try again.'),
  );
}

/** Only displayName and updatedAt may change; firestore.rules rejects any other field. */
export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, 'users', uid), { displayName, updatedAt: serverTimestamp() });
}
