import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

/**
 * UX-level route guard. It is NOT the security boundary: Firestore rules reject
 * reads and writes from any account that fails the policy, even if this guard is bypassed.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'authorized') return <>{children}</>;
  if (status === 'loading') return <StatusPanel title="Checking your college account…" />;
  if (status === 'unconfigured') return <StatusPanel title="Sign-in is not configured" body="Add the Firebase web settings to .env.local. See the README for setup steps." />;
  return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
}

function StatusPanel({ title, body }: { title: string; body?: string }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-xl flex-col gap-3 px-5 py-24 sm:px-8">
      <p className="font-display text-3xl">{title}</p>
      {body && <p className="text-ink-soft">{body}</p>}
    </div>
  );
}
