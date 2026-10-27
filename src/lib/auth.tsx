import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';
import { APPROVED_DOMAIN, isApprovedCollegeEmail } from './domain';
import { ensureProfile } from './profile';
import { logDevError } from './errors';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'unauthorized' | 'error' | 'authorized';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  message: string | null;
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REJECTED_STATES: AuthStatus[] = ['unauthorized', 'error'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(firebaseConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const firebaseAuth = auth;

    return onAuthStateChanged(firebaseAuth, async (next) => {
      if (!next) {
        setUser(null);
        // Keep a rejection message visible after the forced sign-out below.
        setStatus((prev) => (REJECTED_STATES.includes(prev) ? prev : 'signed-out'));
        return;
      }

      if (!isApprovedCollegeEmail(next.email, next.emailVerified)) {
        setUser(null);
        setStatus('unauthorized');
        setMessage(`Only verified @${APPROVED_DOMAIN} accounts can use AfterClass. You have been signed out.`);
        await firebaseSignOut(firebaseAuth);
        return;
      }

      try {
        await ensureProfile(next);
        setUser(next);
        setMessage(null);
        setStatus('authorized');
      } catch (err) {
        logDevError('profile setup after sign-in', err);
        setUser(null);
        const denied = (err as { code?: string } | null)?.code === 'permission-denied';
        setMessage(
          denied
            ? 'Your profile could not be created because the AfterClass database is not accepting it yet. Please tell the AfterClass team and try again later.'
            : 'We could not set up your profile. Check your connection and sign in again.',
        );
        setStatus('error');
        await firebaseSignOut(firebaseAuth);
      }
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!auth) return;
    setBusy(true);
    setMessage(null);
    const provider = new GoogleAuthProvider();
    // hd is only a hint for the account chooser. The real check happens above and in the rules.
    provider.setCustomParameters({ hd: APPROVED_DOMAIN, prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setMessage('Sign-in did not complete. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    setMessage(null);
  }, []);

  const value = useMemo(
    () => ({ status, user, message, busy, signIn, signOut }),
    [status, user, message, busy, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
