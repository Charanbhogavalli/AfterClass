import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog, Notice, StatusTag, formatDate, useBusyGuard } from '../../components/admin/AdminUi';
import {
  adminErrorMessage,
  changePollStatus,
  fetchAdminPolls,
  savePollDraft,
  type AdminPollRow,
} from '../../lib/admin';
import { POLL_OPTION_MAX, POLL_OPTION_MIN, validatePollInput, type PollStatus } from '../../lib/adminValidation';
import { requireDb } from '../../lib/firebase';
import { logDevError } from '../../lib/errors';

interface Confirm {
  to: Extract<PollStatus, 'published' | 'closed'>;
  row: AdminPollRow;
}

interface Draft {
  pollId: string | null;
  question: string;
  options: string[];
}

const EMPTY_DRAFT: Draft = { pollId: null, question: '', options: ['', ''] };

export function AdminPolls() {
  const [rows, setRows] = useState<AdminPollRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { busy, run } = useBusyGuard();

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchAdminPolls(requireDb()));
    } catch (err) {
      logDevError('admin poll list', err);
      setError(adminErrorMessage(err, 'Polls could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function editDraft(row: AdminPollRow) {
    setNotice(null);
    setProblems([]);
    setDraft({ pollId: row.id, question: row.question, options: row.options.length >= POLL_OPTION_MIN ? [...row.options] : ['', ''] });
  }

  function patchOption(index: number, value: string) {
    setDraft((d) => ({ ...d, options: d.options.map((o, i) => (i === index ? value : o)) }));
  }

  function removeOption(index: number) {
    setDraft((d) => ({ ...d, options: d.options.filter((_, i) => i !== index) }));
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validatePollInput({ question: draft.question, options: draft.options });
    setProblems(found);
    setNotice(null);
    if (found.length > 0) return;
    await run(async () => {
      try {
        await savePollDraft(requireDb(), { question: draft.question, options: draft.options }, draft.pollId ?? undefined);
        setDraft(EMPTY_DRAFT);
        setNotice({ kind: 'ok', text: 'Poll draft saved. It is not visible to students yet.' });
        await load();
      } catch (err) {
        setNotice({ kind: 'error', text: adminErrorMessage(err, 'The poll could not be saved. Please try again.') });
      }
    });
  }

  async function applyConfirm() {
    if (!confirm) return;
    const { to, row } = confirm;
    await run(async () => {
      try {
        await changePollStatus(requireDb(), row.id, to);
        setConfirm(null);
        setNotice({ kind: 'ok', text: to === 'published' ? 'Poll published.' : 'Poll closed. Votes are no longer accepted.' });
      } catch (err) {
        setConfirm(null);
        setNotice({ kind: 'error', text: adminErrorMessage(err, 'The poll status could not be changed.') });
      }
      await load();
    });
  }

  const editing = draft.pollId !== null;

  return (
    <section aria-labelledby="polls-title" className="flex flex-col gap-8">
      <header>
        <h1 id="polls-title" className="font-display text-4xl leading-tight font-bold">Polls</h1>
        <p className="mt-2 text-ink-soft">Polls start as drafts. Publishing opens voting, and closing stops it.</p>
      </header>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <Card tone="paper">
        <form onSubmit={onSave} noValidate className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold">{editing ? 'Edit draft poll' : 'New poll draft'}</h2>
          <div className="flex flex-col gap-1">
            <label htmlFor="poll-question" className="font-semibold">Question</label>
            <input
              id="poll-question"
              value={draft.question}
              maxLength={200}
              onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
              className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">Options ({POLL_OPTION_MIN} to {POLL_OPTION_MAX})</legend>
            {draft.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={`Option ${index + 1}`}
                  maxLength={80}
                  value={option}
                  onChange={(e) => patchOption(index, e.target.value)}
                  className="min-h-12 w-full min-w-0 flex-1 rounded-2xl border-2 border-ink bg-paper px-4 py-2 focus-visible:outline-violet"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={draft.options.length <= POLL_OPTION_MIN || busy}
                  className="min-h-12 shrink-0 rounded-full border-2 border-ink bg-paper px-4 font-semibold disabled:opacity-50 focus-visible:outline-violet"
                >
                  Remove
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, options: [...d.options, ''] }))}
                disabled={draft.options.length >= POLL_OPTION_MAX || busy}
                className="rounded-full border-2 border-ink bg-lime px-4 py-2 font-semibold disabled:opacity-50 focus-visible:outline-violet"
              >
                Add option
              </button>
            </div>
          </fieldset>

          {problems.length > 0 && (
            <div role="alert" className="rounded-2xl border-2 border-ink bg-pink-soft px-4 py-3">
              <ul className="list-disc space-y-1 pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Save draft'}</Button>
            {editing && (
              <Button variant="ghost" disabled={busy} onClick={() => setDraft(EMPTY_DRAFT)}>Cancel edit</Button>
            )}
          </div>
        </form>
      </Card>

      <section aria-labelledby="poll-list-title" className="flex flex-col gap-4">
        <h2 id="poll-list-title" className="font-display text-2xl font-bold">Existing polls</h2>
        {error && (
          <div className="flex flex-col gap-3">
            <Notice kind="error">{error}</Notice>
            <div><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>
          </div>
        )}
        {!error && rows === null && <p role="status" className="text-ink-soft">Loading polls…</p>}
        {rows?.length === 0 && (
          <p className="rounded-card border-2 border-dashed border-ink bg-paper p-6 text-ink-soft">No polls yet.</p>
        )}
        <ul className="flex flex-col gap-4">
          {rows?.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 rounded-card border-2 border-ink bg-paper p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusTag status={row.status} />
                <span className="text-sm text-ink-soft">Created {formatDate(row.createdAtMillis)}</span>
              </div>
              <p className="font-display text-xl font-bold break-words">{row.question}</p>
              <ol className="list-decimal pl-5 text-sm text-ink-soft">
                {row.options.map((o, i) => (
                  <li key={`${i}-${o}`}>{o}</li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                {row.status === 'draft' && (
                  <>
                    <Button variant="secondary" disabled={busy} onClick={() => editDraft(row)}>Edit draft</Button>
                    <Button disabled={busy} onClick={() => setConfirm({ to: 'published', row })}>Publish</Button>
                  </>
                )}
                {row.status === 'published' && (
                  <Button variant="secondary" disabled={busy} onClick={() => setConfirm({ to: 'closed', row })}>Close</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={confirm !== null}
        busy={busy}
        title={confirm?.to === 'published' ? 'Publish this poll?' : 'Close this poll?'}
        body={
          confirm?.to === 'published'
            ? 'Students will be able to vote once. Options cannot be changed after publishing.'
            : 'No further votes will be accepted. Existing votes are kept.'
        }
        confirmLabel={confirm?.to === 'published' ? 'Publish poll' : 'Close poll'}
        onConfirm={() => void applyConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
