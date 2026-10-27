import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useAuth } from '../lib/auth';
import {
  SUGGESTION_CATEGORIES,
  fetchMySuggestions,
  submitSuggestion,
  validateSuggestion,
  type MySuggestion,
  type SuggestionCategory,
} from '../lib/community';
import { friendlyError } from '../lib/errors';
import { requireDb } from '../lib/firebase';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Received',
  planned: 'Planned',
  done: 'Done',
  declined: 'Not going ahead',
};

export function Suggestions() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<SuggestionCategory>('facilities');
  const [mine, setMine] = useState<MySuggestion[] | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    fetchMySuggestions(requireDb(), uid)
      .then((rows) => active && setMine(rows))
      .catch((err) => active && setNotice({ kind: 'error', text: friendlyError(err, 'Your suggestions could not be loaded.') }));
    return () => {
      active = false;
    };
  }, [uid, reload]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateSuggestion({ title, body, category });
    if (problem) {
      setNotice({ kind: 'error', text: problem });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await submitSuggestion(requireDb(), uid, { title, body, category });
      setTitle('');
      setBody('');
      setNotice({ kind: 'ok', text: 'Thanks. Your suggestion was received.' });
      setReload((n) => n + 1);
    } catch (err) {
      setNotice({ kind: 'error', text: friendlyError(err, 'Your suggestion was not saved. Please try again.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-[1.1fr_1fr]">
      <Card tone="pink" rotate="left">
        <Tag tone="paper">Campus suggestions</Tag>
        <h1 className="mt-4 font-display text-3xl leading-tight font-bold">What should change?</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Keep it specific. Admins can see your name with the suggestion so they can follow up.
        </p>
        <form onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="sug-title" className="font-semibold">Title</label>
            <input id="sug-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sug-category" className="font-semibold">Category</label>
            <select id="sug-category" value={category} onChange={(e) => setCategory(e.target.value as SuggestionCategory)} className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-3 capitalize focus-visible:outline-violet">
              {SUGGESTION_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sug-body" className="font-semibold">Details</label>
            <textarea id="sug-body" rows={5} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet" />
          </div>
          {notice && (
            <p role={notice.kind === 'error' ? 'alert' : 'status'} className="font-semibold">{notice.text}</p>
          )}
          <div>
            <Button type="submit" disabled={saving} aria-busy={saving}>{saving ? 'Sending…' : 'Send suggestion'}</Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="my-sug-title">
        <h2 id="my-sug-title" className="font-display text-2xl font-bold">Your suggestions</h2>
        {mine === null && <p role="status" className="mt-4 text-ink-soft">Loading…</p>}
        {mine && mine.length === 0 && <p className="mt-4 text-ink-soft">You have not sent any suggestions yet.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {mine?.map((s) => (
            <li key={s.id} className="rounded-2xl border-2 border-ink bg-paper p-4">
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-ink-soft">
                Status: <span className="font-bold">{STATUS_LABEL[s.status] ?? s.status}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
