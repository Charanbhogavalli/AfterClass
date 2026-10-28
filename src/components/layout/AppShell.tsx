import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const navLinks = [
  { to: '/quiz', label: 'Quiz' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/polls', label: 'Polls' },
  { to: '/suggestions', label: 'Suggestions' },
];

export function AppShell() {
  const { status } = useAuth();
  const accountLink = status === 'authorized' ? { to: '/profile', label: 'Profile' } : { to: '/sign-in', label: 'Sign in' };

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-cream/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" className="font-display text-2xl font-bold tracking-tight">
            After<span className="italic text-violet">Class</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} className="rounded-full px-2 py-2 hover:bg-sand sm:px-3">
                {link.label}
              </Link>
            ))}
            <Link to={accountLink.to} className="rounded-full border-2 border-ink bg-lime px-3 py-1.5 sm:px-4">
              {accountLink.label}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t-2 border-ink bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-ink-soft sm:flex-row sm:justify-between sm:px-8">
          <p>AfterClass is an unofficial student project for Chinmaya Vishwa Vidyapeeth.</p>
          <div className="flex items-center gap-4">
            <p>Access is limited to the approved college community.</p>
            <Link
              to="/admin"
              aria-label="Admin access"
              title="Admin access"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft opacity-60 hover:bg-sand hover:opacity-100 focus-visible:outline-violet"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
