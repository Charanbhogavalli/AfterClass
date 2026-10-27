import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useAuth } from '../lib/auth';
import { castVote, fetchMyVote, fetchOpenPolls, type OpenPoll } from '../lib/community';
import { friendlyError } from '../lib/errors';
import { requireDb } from '../lib/firebase';

interface PollState {
  polls: Array<OpenPoll & { myVote: string | null }>;
}

export function Polls() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [state, setState] = useState<PollState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [voting, setVoting] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const db = requireDb();
        const polls = await fetchOpenPolls(db);
        const withVotes = await Promise.all(polls.map(async (p) => ({ ...p, myVote: await fetchMyVote(db, uid, p.id) })));
        if (active) setState({ polls: withVotes });
      } catch (err) {
        if (active) setError(friendlyError(err, 'Polls could not be loaded. Please try again.'));
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, reload]);

  async function onVote(poll: OpenPoll) {
    const option = choice[poll.id];
    if (!option) return;
    setVoting(poll.id);
    setError(null);
    try {
      await castVote(requireDb(), uid, poll, option);
      setReload((n) => n + 1);
    } catch (err) {
      setError(friendlyError(err, 'Your vote was not recorded. It may already be recorded; refresh to check.'));
    } finally {
      setVoting(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Tag tone="violet">Campus polls</Tag>
      <h1 className="mt-4 font-display text-4xl leading-tight font-bold">Have your say</h1>
      <p className="mt-3 text-ink-soft">
        One vote per poll. Individual votes are private. Poll results are shared with campus admins only for now.
      </p>

      {error && (
        <p role="alert" className="mt-6 rounded-2xl border-2 border-ink bg-paper p-4 font-semibold">
          {error}
        </p>
      )}
      {!error && state === null && <p role="status" className="mt-8 text-ink-soft">Loading polls…</p>}
      {state && state.polls.length === 0 && (
        <Card tone="paper" className="mt-8">
          <p className="font-display text-2xl font-bold">No open polls</p>
          <p className="mt-2 text-ink-soft">New polls appear here when campus admins publish them.</p>
        </Card>
      )}

      <div className="mt-8 flex flex-col gap-6">
        {state?.polls.map((poll) => (
          <Card key={poll.id} tone="lime">
            <h2 className="font-display text-2xl font-bold">{poll.question}</h2>
            {poll.myVote ? (
              <p role="status" className="mt-4 font-semibold">
                Your vote is recorded: <span className="uppercase">{poll.myVote}</span>
              </p>
            ) : (
              <fieldset className="mt-4">
                <legend className="sr-only">Choose an option for: {poll.question}</legend>
                <div className="flex flex-col gap-2">
                  {poll.options.map((option) => (
                    <label key={option} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-4 py-3">
                      <input
                        type="radio"
                        name={`poll-${poll.id}`}
                        value={option}
                        checked={choice[poll.id] === option}
                        onChange={() => setChoice((c) => ({ ...c, [poll.id]: option }))}
                        className="h-5 w-5 accent-ink"
                      />
                      <span className="font-semibold">{option}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <Button onClick={() => onVote(poll)} disabled={!choice[poll.id] || voting === poll.id}>
                    {voting === poll.id ? 'Voting…' : 'Submit vote'}
                  </Button>
                </div>
              </fieldset>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
