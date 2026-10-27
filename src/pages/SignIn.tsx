import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { APPROVED_DOMAIN } from '../lib/domain';
import { useAuth } from '../lib/auth';

export function SignIn() {
  const { status, message, busy, signIn } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/profile';

  if (status === 'authorized') return <Navigate to={from} replace />;

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8 sm:py-24">
      <Card tone="lime" rotate="left">
        <Tag>College accounts only</Tag>
        <h1 className="mt-4 font-display text-4xl leading-tight font-bold">Sign in to AfterClass</h1>
        <p className="mt-3 text-ink-soft">
          Use your <span className="font-mono">@{APPROVED_DOMAIN}</span> Google account. Other accounts are signed out
          automatically.
        </p>

        {status === 'unconfigured' ? (
          <p role="alert" className="mt-6 rounded-2xl border-2 border-ink bg-paper p-4 text-sm font-semibold">
            Firebase is not configured on this build. Add the VITE_FIREBASE_* values to .env.local (see README.md).
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <Button onClick={signIn} disabled={busy || status === 'loading'} aria-busy={busy}>
              {busy ? 'Opening Google…' : 'Continue with college Google'}
            </Button>
            {status === 'loading' && <p role="status" className="text-sm text-ink-soft">Checking your session…</p>}
          </div>
        )}

        {message && (
          <p role="alert" className="mt-6 rounded-2xl border-2 border-ink bg-paper p-4 text-sm font-semibold">
            {message}
          </p>
        )}
      </Card>
    </div>
  );
}
