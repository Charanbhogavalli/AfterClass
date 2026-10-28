import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, Notice, StatusTag, useBusyGuard } from '../../components/admin/AdminUi';
import { QuizEditor, QuizPreview, blankQuiz } from '../../components/admin/QuizEditor';
import {
  adminErrorMessage,
  changeQuizStatus,
  fetchAdminQuiz,
  fetchAdminQuizzes,
  type AdminQuizDetail,
  type AdminQuizRow,
} from '../../lib/admin';
import type { AdminQuizInput, QuizStatus } from '../../lib/adminValidation';
import { requireDb } from '../../lib/firebase';
import { logDevError } from '../../lib/errors';

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; day: string; initial: AdminQuizInput }
  | { kind: 'preview'; detail: AdminQuizDetail };

interface Confirm {
  to: Extract<QuizStatus, 'published' | 'closed'>;
  row: AdminQuizRow;
}

export function AdminQuizzes() {
  const [rows, setRows] = useState<AdminQuizRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { busy, run } = useBusyGuard();

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchAdminQuizzes(requireDb()));
    } catch (err) {
      logDevError('admin quiz list', err);
      setError(adminErrorMessage(err, 'Quizzes could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(row: AdminQuizRow, mode: 'edit' | 'preview') {
    setNotice(null);
    try {
      const detail = await fetchAdminQuiz(requireDb(), row.day);
      if (!detail) {
        setNotice({ kind: 'error', text: 'This quiz no longer exists.' });
        await load();
        return;
      }
      if (mode === 'preview') setView({ kind: 'preview', detail });
      else setView({ kind: 'edit', day: row.day, initial: detail.input });
    } catch (err) {
      logDevError('admin quiz detail', err);
      setNotice({ kind: 'error', text: adminErrorMessage(err, 'This quiz could not be opened. It may be malformed.') });
    }
  }

  async function applyConfirm() {
    if (!confirm) return;
    const { to, row } = confirm;
    await run(async () => {
      try {
        await changeQuizStatus(requireDb(), row.day, to);
        setConfirm(null);
        setNotice({ kind: 'ok', text: to === 'published' ? `"${row.title}" is now published.` : `"${row.title}" is closed.` });
        await load();
      } catch (err) {
        setConfirm(null);
        setNotice({ kind: 'error', text: adminErrorMessage(err, 'The status could not be changed.') });
        await load();
      }
    });
  }

  if (view.kind === 'new' || view.kind === 'edit') {
    const isNew = view.kind === 'new';
    return (
      <section aria-labelledby="quiz-editor-title" className="flex flex-col gap-6">
        <header>
          <h1 id="quiz-editor-title" className="font-display text-4xl leading-tight font-bold">{isNew ? 'New quiz draft' : 'Edit draft'}</h1>
          <p className="mt-2 text-ink-soft">Five multiple-choice questions, four options each. Drafts are not visible to students.</p>
        </header>
        <QuizEditor
          initial={isNew ? blankQuiz() : view.initial}
          isNew={isNew}
          onCancel={() => setView({ kind: 'list' })}
          onSaved={(day) => {
            setView({ kind: 'list' });
            setNotice({ kind: 'ok', text: `Draft for ${day} saved. It is not published.` });
            void load();
          }}
        />
      </section>
    );
  }

  if (view.kind === 'preview') {
    return (
      <section aria-labelledby="quiz-preview-title" className="flex flex-col gap-6">
        <div>
          <Button variant="secondary" onClick={() => setView({ kind: 'list' })}>Back to quizzes</Button>
        </div>
        <h1 id="quiz-preview-title" className="sr-only">Quiz preview</h1>
        <QuizPreview input={view.detail.input} />
      </section>
    );
  }

  return (
    <section aria-labelledby="quizzes-title" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="quizzes-title" className="font-display text-4xl leading-tight font-bold">Quizzes</h1>
          <p className="mt-2 text-ink-soft">Newest first. Publishing makes a quiz visible to students.</p>
        </div>
        <Button onClick={() => setView({ kind: 'new' })}>New quiz draft</Button>
      </header>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {error && (
        <div className="flex flex-col gap-3">
          <Notice kind="error">{error}</Notice>
          <div><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>
        </div>
      )}
      {!error && rows === null && <p role="status" className="text-ink-soft">Loading quizzes…</p>}
      {rows?.length === 0 && (
        <p className="rounded-card border-2 border-dashed border-ink bg-paper p-6 text-ink-soft">
          No quizzes yet. Create a draft to get started.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {rows?.map((row) => (
          <li key={row.day} className="flex flex-col gap-3 rounded-card border-2 border-ink bg-paper p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-violet">{row.day}</p>
              <p className="font-display text-xl font-bold break-words">{row.title || 'Untitled quiz'}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                <StatusTag status={row.status} />
                <span>{row.questionCount} questions</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => void openDetail(row, 'preview')}>Preview</Button>
              {row.status === 'draft' && (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => void openDetail(row, 'edit')}>Edit</Button>
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

      <ConfirmDialog
        open={confirm !== null}
        busy={busy}
        title={confirm?.to === 'published' ? 'Publish this quiz?' : 'Close this quiz?'}
        body={
          confirm?.to === 'published'
            ? `Students will see "${confirm.row.title}" as today's quiz. It cannot be edited after publishing.`
            : `Students will no longer be able to start "${confirm?.row.title ?? ''}". Existing results are kept.`
        }
        confirmLabel={confirm?.to === 'published' ? 'Publish quiz' : 'Close quiz'}
        onConfirm={() => void applyConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
