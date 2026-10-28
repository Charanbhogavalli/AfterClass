import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Notice } from '../../components/admin/AdminUi';
import { adminErrorMessage, fetchAdminCounts, type AdminCounts } from '../../lib/admin';
import { requireDb } from '../../lib/firebase';
import { logDevError } from '../../lib/errors';

interface Tile {
  label: string;
  value: number;
  note: string;
}

export function AdminOverview() {
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchAdminCounts(requireDb())
      .then((result) => active && setCounts(result))
      .catch((err) => {
        logDevError('admin overview counts', err);
        if (active) setError(adminErrorMessage(err, 'Counts could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const tiles: Tile[] = counts
    ? [
        { label: 'Students', value: counts.students, note: 'Accounts with a profile' },
        { label: 'Quizzes', value: counts.quizzesTotal, note: `${counts.quizzesPublished} published` },
        { label: 'Polls', value: counts.pollsTotal, note: `${counts.pollsPublished} published` },
        { label: 'Suggestions', value: counts.suggestionsTotal, note: `${counts.suggestionsAwaitingReview} awaiting review` },
      ]
    : [];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-4xl leading-tight font-bold">Overview</h1>
        <p className="mt-2 text-ink-soft">Counts are read from Firestore when this page opens.</p>
      </header>

      {error && (
        <div className="flex flex-col gap-3">
          <Notice kind="error">{error}</Notice>
          <div>
            <button type="button" onClick={() => setReload((n) => n + 1)} className="rounded-full border-2 border-ink bg-paper px-4 py-2 font-semibold focus-visible:outline-violet">
              Try again
            </button>
          </div>
        </div>
      )}
      {!error && !counts && <p role="status" className="text-ink-soft">Loading counts…</p>}

      {counts && (
        <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {tiles.map((tile, i) => (
            <Card key={tile.label} tone={i % 2 ? 'lime' : 'paper'} className="p-5">
              <dt className="text-sm font-bold tracking-wide uppercase">{tile.label}</dt>
              <dd className="mt-2 font-display text-4xl font-bold">{tile.value}</dd>
              <dd className="mt-1 text-sm text-ink-soft">{tile.note}</dd>
            </Card>
          ))}
        </dl>
      )}

      <Card tone="violet" className="p-5">
        <p className="font-semibold">Start with content</p>
        <p className="mt-1 text-sm">
          Draft a <Link to="/admin/quizzes" className="font-bold underline">quiz</Link>, review it, then publish it. Polls and
          <Link to="/admin/suggestions" className="font-bold underline"> suggestions</Link> follow the same review steps.
        </p>
      </Card>
    </div>
  );
}
