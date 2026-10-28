import type { ReactNode } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { PinGate, useAdminSession } from '../components/admin/PinGate';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { RequireAuth } from '../components/auth/RequireAuth';
import { useAuth } from '../lib/auth';
import { isAdminIdentity } from '../lib/adminIdentity';

/**
 * Route element for /admin. Order: signed-in student -> PIN (cosmetic) -> administrator identity.
 * Only the account in adminIdentity.ts sees the dashboard. Firestore rules enforce every read and write.
 */
export function AdminRoute() {
  return (
    <RequireAuth>
      <PinGate>
        <IdentityGate>
          <AdminLayout />
        </IdentityGate>
      </PinGate>
    </RequireAuth>
  );
}

/** Display guidance only. It cannot grant access: a student who bypasses it still hits the rules. */
function IdentityGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { lock } = useAdminSession();

  if (user && isAdminIdentity(user.email, user.emailVerified)) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-16 sm:px-8">
      <Card tone="pink">
        <h1 className="font-display text-2xl font-bold">This account does not have admin access</h1>
        <p className="mt-2 text-ink-soft">
          Admin access is limited to the AfterClass administrator. Your student account is unchanged.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="ghost" onClick={lock}>Lock</Button>
          <Link to="/" className="inline-flex min-h-12 items-center rounded-full px-6 font-semibold hover:bg-sand">Back to site</Link>
        </div>
      </Card>
    </div>
  );
}

const ADMIN_LINKS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/quizzes', label: 'Quizzes', end: false },
  { to: '/admin/polls', label: 'Polls', end: false },
  { to: '/admin/suggestions', label: 'Suggestions', end: false },
];

function AdminLayout() {
  const { signOut } = useAuth();
  const { lock } = useAdminSession();

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10 sm:px-8 md:grid-cols-[14rem_1fr]">
      <aside aria-label="Admin navigation" className="flex flex-col gap-4">
        <p className="text-xs font-bold tracking-widest text-violet uppercase">Admin</p>
        <nav className="flex flex-wrap gap-2 md:flex-col">
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-full border-2 px-4 py-2 font-semibold ${isActive ? 'border-ink bg-lime' : 'border-transparent hover:bg-sand'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2 md:mt-4 md:flex-col">
          <Button variant="secondary" onClick={lock}>Lock</Button>
          <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
