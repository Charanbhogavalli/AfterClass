import { useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Notice, useBusyGuard } from './AdminUi';
import { CHOICES, QUESTION_IDS, type Choice } from '../../lib/quiz';
import { type AdminQuestion, type AdminQuizInput, validateQuizInput } from '../../lib/adminValidation';
import { adminErrorMessage, createQuizDraft, updateQuizDraft } from '../../lib/admin';
import { requireDb } from '../../lib/firebase';

function blankQuestions(): AdminQuestion[] {
  return QUESTION_IDS.map((id) => ({
    id,
    text: '',
    options: { a: '', b: '', c: '', d: '' },
    answer: '',
    explanation: '',
  }));
}

export function blankQuiz(): AdminQuizInput {
  return { day: '', title: '', questions: blankQuestions() };
}

/**
 * Creates a new quiz draft, or edits an existing draft. The date is the document key, so it is
 * fixed once a quiz exists. Answers and explanations are saved to the separate quizKeys document.
 */
export function QuizEditor({
  initial,
  isNew,
  onSaved,
  onCancel,
}: {
  initial: AdminQuizInput;
  isNew: boolean;
  onSaved: (day: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AdminQuizInput>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const { busy, run } = useBusyGuard();

  function patchQuestion(index: number, patch: Partial<AdminQuestion>) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }));
  }

  function patchOption(index: number, choice: Choice, value: string) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === index ? { ...q, options: { ...q.options, [choice]: value } } : q)),
    }));
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateQuizInput(form);
    setProblems(found);
    setNotice(null);
    if (found.length > 0) return;
    await run(async () => {
      try {
        if (isNew) await createQuizDraft(requireDb(), form);
        else await updateQuizDraft(requireDb(), form);
        onSaved(form.day.trim());
      } catch (err) {
        setNotice(adminErrorMessage(err, 'The draft could not be saved. Please try again.'));
      }
    });
  }

  if (previewing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setPreviewing(false)}>Back to editing</Button>
        </div>
        <QuizPreview input={form} />
      </div>
    );
  }

  return (
    <form onSubmit={onSave} noValidate className="flex flex-col gap-8">
      <Card tone="paper" className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="quiz-day" className="font-semibold">Quiz date</label>
            <input
              id="quiz-day"
              type="date"
              value={form.day}
              disabled={!isNew}
              onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
              className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet disabled:opacity-70"
            />
            {!isNew && <p className="text-xs text-ink-soft">The date identifies the quiz and cannot change.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="quiz-title" className="font-semibold">Title</label>
            <input
              id="quiz-title"
              value={form.title}
              maxLength={120}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="min-h-12 rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet"
            />
          </div>
        </div>
      </Card>

      {form.questions.map((q, index) => {
        const n = index + 1;
        return (
          <fieldset key={q.id} className="flex flex-col gap-4 rounded-card border-2 border-ink bg-paper p-5">
            <legend className="px-2 font-display text-xl font-bold">Question {n}</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor={`q${n}-text`} className="font-semibold">Question text</label>
              <textarea
                id={`q${n}-text`}
                rows={2}
                maxLength={300}
                value={q.text}
                onChange={(e) => patchQuestion(index, { text: e.target.value })}
                className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet"
              />
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-semibold">Options. Mark the correct answer.</p>
              {CHOICES.map((c) => (
                <div key={c} className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                  <label className="flex shrink-0 items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name={`answer-${n}`}
                      value={c}
                      checked={q.answer === c}
                      onChange={() => patchQuestion(index, { answer: c })}
                      aria-label={`Question ${n}, option ${c.toUpperCase()} is the correct answer`}
                      className="size-5 accent-ink"
                    />
                    <span className="w-16">Option {c.toUpperCase()}</span>
                  </label>
                  <input
                    aria-label={`Question ${n}, option ${c.toUpperCase()} text`}
                    maxLength={120}
                    value={q.options[c]}
                    onChange={(e) => patchOption(index, c, e.target.value)}
                    className="min-h-12 w-full min-w-0 flex-1 rounded-2xl border-2 border-ink bg-paper px-4 py-2 focus-visible:outline-violet"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`q${n}-explanation`} className="font-semibold">Explanation shown after submitting</label>
              <textarea
                id={`q${n}-explanation`}
                rows={2}
                maxLength={500}
                value={q.explanation}
                onChange={(e) => patchQuestion(index, { explanation: e.target.value })}
                className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 focus-visible:outline-violet"
              />
            </div>
          </fieldset>
        );
      })}

      {problems.length > 0 && (
        <div role="alert" className="rounded-2xl border-2 border-ink bg-pink-soft px-4 py-3">
          <p className="font-bold">Fix these before saving:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && <Notice kind="error">{notice}</Notice>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Save draft'}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setPreviewing(true)}>Preview</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** Admin-only view. It shows answers and explanations, so it must never be used in the student UI. */
export function QuizPreview({ input }: { input: AdminQuizInput }) {
  return (
    <article aria-label="Quiz preview" className="flex flex-col gap-6">
      <Notice kind="ok">Admin preview. Answers are visible only in this admin view.</Notice>
      <header>
        <p className="text-sm font-bold tracking-widest text-violet uppercase">{input.day || 'No date yet'}</p>
        <h2 className="mt-1 font-display text-3xl font-bold">{input.title || 'Untitled quiz'}</h2>
      </header>
      {input.questions.map((q, index) => (
        <Card key={q.id} tone="paper">
          <p className="text-sm font-bold uppercase">Question {index + 1}</p>
          <p className="mt-1 font-display text-xl font-bold">{q.text || '(no text yet)'}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {CHOICES.map((c) => (
              <li
                key={c}
                className={`rounded-2xl border-2 border-ink px-4 py-2 ${q.answer === c ? 'bg-lime font-bold' : 'bg-paper'}`}
              >
                <span className="mr-2">{c.toUpperCase()}.</span>
                {q.options[c] || '(empty)'}
                {q.answer === c && <span className="ml-2 text-sm">Correct answer</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-soft">{q.explanation || '(no explanation yet)'}</p>
        </Card>
      ))}
    </article>
  );
}
