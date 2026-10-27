import { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { requireDb } from '../lib/firebase';
import { fetchLeaderboard, LEADERBOARD_PAGE_SIZE, type LeaderboardRow } from '../lib/community';

export function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaderboard(requireDb())
      .then((data) => active && setRows(data))
      .catch((err) => active && setError(friendlyError(err, 'The leaderboard could not be loaded.')));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Tag tone="pink">Top {LEADERBOARD_PAGE_SIZE}</Tag>
      <h1 className="mt-4 font-display text-4xl leading-tight font-bold">Leaderboard</h1>
      <p className="mt-3 text-ink-soft">
        Points come only from verified quiz results. Ties are ordered by account ID so the order never changes between
        visits.
      </p>

      <div className="mt-8">
        {error && (
          <Card tone="pink">
            <p role="alert" className="font-semibold">{error}</p>
          </Card>
        )}
        {!error && rows === null && <p role="status" className="text-ink-soft">Loading scores…</p>}
        {rows && rows.length === 0 && (
          <Card tone="paper">
            <p className="font-display text-2xl font-bold">No scores yet</p>
            <p className="mt-2 text-ink-soft">Finish today's quiz to appear here.</p>
          </Card>
        )}
        {rows && rows.length > 0 && (
          <ol className="flex flex-col gap-2">
            {rows.map((row) => {
              const isMe = row.uid === user?.uid;
              return (
                <li
                  key={row.uid}
                  aria-current={isMe ? 'true' : undefined}
                  className={`flex items-center justify-between gap-4 rounded-2xl border-2 border-ink px-4 py-3 ${isMe ? 'bg-lime' : 'bg-paper'}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-8 shrink-0 font-display text-xl font-bold tabular-nums">{row.rank}</span>
                    <span className="truncate font-semibold">
                      {row.displayName}
                      {isMe && <span className="ml-2 text-sm font-bold">(you)</span>}
                    </span>
                  </span>
                  <span className="font-display text-xl font-bold tabular-nums">{row.points}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
