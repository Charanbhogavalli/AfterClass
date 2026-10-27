import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useAuth } from '../lib/auth';
import {
  DISPLAY_NAME_MAX,
  subscribeToProfile,
  updateDisplayName,
  validateDisplayName,
  type StudentProfile,
} from '../lib/profile';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

export function Profile() {
  const { user, signOut } = useAuth();
  const uid = user?.uid ?? null;
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return subscribeToProfile(
      uid,
      (next) => {
        setProfile(next);
        setLoadState(next ? 'ready' : 'missing');
        setLoadError(null);
        if (next) setDraft((current) => (current === '' ? next.displayName : current));
      },
      (message) => {
        setLoadError(message);
        setLoadState('error');
      },
    );
  }, [uid]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uid) return;
    const result = validateDisplayName(draft);
    if (!result.ok) {
      setEditError(result.error);
      setSaved(false);
      return;
    }
    setEditError(null);
    setSaving(true);
    try {
      await updateDisplayName(uid, result.value);
      setDraft(result.value);
      setSaved(true);
    } catch {
      setEditError('Your name could not be saved. Please try again.');
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-[1fr_1.2fr]">
      <Card tone="paper" rotate="left" className="flex flex-col gap-4">
        <Tag tone="lime">Your profile</Tag>
        {loadState === 'loading' && <p role="status" className="text-ink-soft">Loading your profile…</p>}
        {loadState === 'error' && (
          <p role="alert" className="font-semibold">{loadError}</p>
        )}
        {loadState === 'missing' && (
          <p role="status" className="text-ink-soft">Your profile is being created. Refresh in a moment.</p>
        )}
        {profile && (
          <>
            <div className="flex items-center gap-4">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="" width={64} height={64} referrerPolicy="no-referrer" className="h-16 w-16 rounded-full border-2 border-ink object-cover" />
              ) : (
                <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-violet-soft font-display text-2xl">
                  {profile.displayName.charAt(0).toUpperCase() || '?'}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-2xl font-bold">{profile.displayName}</p>
                <p className="text-sm text-ink-soft">Verified college account</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border-2 border-ink bg-cream p-4">
                <dt className="text-xs font-bold tracking-wide uppercase">Points</dt>
                <dd className="font-display text-3xl tabular-nums">{profile.points}</dd>
              </div>
              <div className="rounded-2xl border-2 border-ink bg-cream p-4">
                <dt className="text-xs font-bold tracking-wide uppercase">Streak</dt>
                <dd className="font-display text-3xl tabular-nums">{profile.streak}</dd>
              </div>
            </dl>
            <p className="text-sm text-ink-soft">
              Points and streaks are awarded by the server when quizzes go live. Nothing has been earned yet.
            </p>
          </>
        )}
        <div className="mt-auto pt-2">
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </Card>

      <Card tone="pink" rotate="right">
        <h2 className="font-display text-2xl font-bold">Display name</h2>
        <p className="mt-2 text-sm text-ink-soft">
          This is the name other students see on the leaderboard and in polls. Up to {DISPLAY_NAME_MAX} characters.
        </p>
        <form onSubmit={onSave} className="mt-5 flex flex-col gap-3" noValidate>
          <label htmlFor="display-name" className="font-semibold">
            Name
          </label>
          <input
            id="display-name"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
            maxLength={DISPLAY_NAME_MAX + 20}
            autoComplete="name"
            aria-invalid={editError ? true : undefined}
            aria-describedby={editError ? 'display-name-error' : undefined}
            disabled={loadState !== 'ready'}
            className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-base focus-visible:outline-violet disabled:opacity-60"
          />
          {editError && (
            <p id="display-name-error" role="alert" className="text-sm font-semibold">
              {editError}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm font-semibold">
              Saved.
            </p>
          )}
          <div>
            <Button type="submit" disabled={saving || loadState !== 'ready'}>
              {saving ? 'Saving…' : 'Save name'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
