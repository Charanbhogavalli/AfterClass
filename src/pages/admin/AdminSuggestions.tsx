import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Notice, StatusTag, formatDate, useBusyGuard } from '../../components/admin/AdminUi';
import {
  adminErrorMessage,
  fetchAdminSuggestions,
  updateSuggestionStatus,
  type AdminSuggestionRow,
} from '../../lib/admin';
import { SUGGESTION_STATUSES, type SuggestionStatus } from '../../lib/adminValidation';
import { requireDb } from '../../lib/firebase';
import { logDevError } from '../../lib/errors';

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  submitted: 'Received',
  planned: 'Planned',
  done: 'Done',
  declined: 'Not going ahead',
};

export function AdminSuggestions() {
  const [rows, setRows] = useState<AdminSuggestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, SuggestionStatus>>({});
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { busy, run } = useBusyGuard();

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchAdminSuggestions(requireDb());
      setRows(next);
      setChoice(Object.fromEntries(next.map((r) => [r.id, r.status])));
    } catch (err) {
      logDevError('admin suggestion list', err);
      setError(adminErrorMessage(err, 'Suggestions could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(row: AdminSuggestionRow) {
    const next = choice[row.id] ?? row.status;
    if (next === row.status) return;
    setNotice(null);
    await run(async () => {
      try {
        await updateSuggestionStatus(requireDb(), row.id, next);
        setNotice({ kind: 'ok', text: `Status for "${row.title}" set to ${STATUS_LABEL[next]}.` });
        await load();
      } catch (err) {
        setNotice({ kind: 'error', text: adminErrorMessage(err, 'The status could not be updated.') });
      }
    });
  }

  return (
    <section aria-labelledby="sug-admin-title" className="flex flex-col gap-6">
      <header>
        <h1 id="sug-admin-title" className="font-display text-4xl leading-tight font-bold">Suggestions</h1>
        <p className="mt-2 text-ink-soft">Only the review status can change. Titles and details stay as students wrote them.</p>
      </header>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {error && (
        <div className="flex flex-col gap-3">
          <Notice kind="error">{error}</Notice>
          <div><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>
        </div>
      )}
      {!error && rows === null && <p role="status" className="text-ink-soft">Loading suggestions…</p>}
      {rows?.length === 0 && (
        <p className="rounded-card border-2 border-dashed border-ink bg-paper p-6 text-ink-soft">No suggestions yet.</p>
      )}

      <ul className="flex flex-col gap-4">
        {rows?.map((row) => {
          const selected = choice[row.id] ?? row.status;
          const selectId = `sug-status-${row.id}`;
          return (
            <li key={row.id}>
              <Card tone="paper" className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag status={row.status} />
                  <span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-bold uppercase">{row.category}</span>
                  <span className="text-sm text-ink-soft">Submitted {formatDate(row.createdAtMillis)}</span>
                </div>
                <h2 className="font-display text-xl font-bold break-words">{row.title}</h2>
                <p className="whitespace-pre-wrap break-words text-ink-soft">{row.body}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={selectId} className="text-sm font-semibold">Review status</label>
                    <select
                      id={selectId}
                      value={selected}
                      disabled={busy}
                      onChange={(e) => setChoice((c) => ({ ...c, [row.id]: e.target.value as SuggestionStatus }))}
                      className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-2 focus-visible:outline-violet"
                    >
                      {SUGGESTION_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                  <Button variant="secondary" disabled={busy || selected === row.status} onClick={() => void save(row)}>
                    Save status
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
