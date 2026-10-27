import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useAuth } from '../lib/auth';
import { requireDb } from '../lib/firebase';
import { friendlyError, logDevError } from '../lib/errors';
import {
  CHOICES,
  QUESTION_IDS,
  finishAttempt,
  fetchLatestQuiz,
  hasAttempt,
  submitAttempt,
  type Answers,
  type Choice,
  type PublishedQuiz,
  type QuestionId,
  type QuizResult,
} from '../lib/quiz';

type View =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; quiz: PublishedQuiz }
  | { kind: 'done'; quiz: PublishedQuiz; result: QuizResult };

type Picks = Partial<Record<QuestionId, Choice>>;

export function Quiz() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [picks, setPicks] = useState<Picks>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Loads the newest published quiz. If the student already submitted, resumes any unfinished
  // scoring step (marks or award), which is safe to repeat.
  useEffect(() => {
    let active = true;
    setView({ kind: 'loading' });
    (async () => {
      try {
        const db = requireDb();
        const quiz = await fetchLatestQuiz(db);
        if (!active) return;
        if (!quiz) return setView({ kind: 'empty' });
        if (await hasAttempt(db, uid, quiz.id)) {
          const result = await finishAttempt(db, uid, quiz.id);
          if (active) setView({ kind: 'done', quiz, result });
        } else if (active) {
          setView({ kind: 'ready', quiz });
        }
      } catch (err) {
        logDevError('load daily quiz', err);
        if (active) setView({ kind: 'error', message: friendlyError(err, 'The quiz could not be loaded. Please try again.') });
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, attempt]);

  async function onSubmit(event: FormEvent<HTMLFormElement>, quiz: PublishedQuiz) {
    event.preventDefault();
    if (!QUESTION_IDS.every((id) => picks[id])) return;
    setBusy(true);
    try {
      const result = await submitAttempt(requireDb(), uid, quiz.id, picks as Answers);
      setView({ kind: 'done', quiz, result });
    } catch (err) {
      // The attempt may have been saved before the failure. "Try again" resumes safely.
      setView({
        kind: 'error',
        message: friendlyError(err, 'Your answers may not have been saved. Press Try again to check and finish safely.'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="mb-3 text-sm font-bold tracking-widest text-violet uppercase">Daily technology quiz</p>

      {view.kind === 'loading' && <p role="status" className="text-ink-soft">Loading today's quiz…</p>}

      {view.kind === 'empty' && (
        <Card tone="paper">
          <h1 className="font-display text-3xl font-bold">No quiz available today</h1>
          <p className="mt-3 text-ink-soft">Check back later. A new technology quiz is published each day.</p>
        </Card>
      )}

      {view.kind === 'error' && (
        <Card tone="pink">
          <p role="alert" className="font-semibold">{view.message}</p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {view.kind === 'ready' && (
        <form onSubmit={(e) => onSubmit(e, view.quiz)} noValidate className="flex flex-col gap-6">
          <header>
            <Tag tone="lime">{view.quiz.day}</Tag>
            <h1 className="mt-4 font-display text-4xl leading-tight font-bold">{view.quiz.title}</h1>
            <p className="mt-3 text-ink-soft">
              Five questions, one attempt. Answers are locked when you submit. Each correct answer earns one point.
            </p>
          </header>

          {view.quiz.questions.map((question, index) => (
            <fieldset key={question.id} className="rounded-card border-2 border-ink bg-paper p-5">
              <legend className="px-1 font-display text-xl font-bold">
                {index + 1}. {question.text}
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CHOICES.map((choice) => (
                  <label
                    key={choice}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-4 py-3 has-[:checked]:bg-lime"
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={choice}
                      checked={picks[question.id] === choice}
                      onChange={() => setPicks((p) => ({ ...p, [question.id]: choice }))}
                      className="h-5 w-5 accent-ink"
                    />
                    <span>
                      <span className="font-bold uppercase">{choice}.</span> {question.options[choice]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={busy || !QUESTION_IDS.every((id) => picks[id])} aria-busy={busy}>
              {busy ? 'Submitting…' : 'Lock in my answers'}
            </Button>
            <p className="text-sm text-ink-soft">
              {QUESTION_IDS.filter((id) => picks[id]).length} of {QUESTION_IDS.length} answered
            </p>
          </div>
        </form>
      )}

      {view.kind === 'done' && (
        <div className="flex flex-col gap-6">
          <Card tone="lime" rotate="left">
            <p className="text-sm font-bold tracking-widest uppercase">Your score</p>
            <p className="mt-2 font-display text-6xl font-bold tabular-nums">
              {view.result.score}
              <span className="text-3xl"> / {QUESTION_IDS.length}</span>
            </p>
            <p className="mt-3 font-semibold">Points are added once per quiz, after the server-side check in the rules.</p>
          </Card>
          <ol className="flex flex-col gap-4">
            {view.quiz.questions.map((question, index) => {
              const correct = view.result.marks[question.id] === 1;
              const yours = view.result.answers[question.id];
              const right = view.result.key.answers[question.id];
              return (
                <li key={question.id}>
                  <Card tone={correct ? 'lime' : 'paper'}>
                    <p className="font-bold">
                      {index + 1}. {question.text}
                    </p>
                    <p className="mt-2 text-sm font-semibold">
                      {correct ? 'Correct' : 'Not this time'} · your answer: {yours.toUpperCase()} · correct answer: {right.toUpperCase()}
                    </p>
                    <p className="mt-2 text-ink-soft">{view.result.key.explanations[question.id]}</p>
                  </Card>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
