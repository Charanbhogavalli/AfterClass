import { useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog, Notice } from './AdminUi';
import { QuizPreview } from './QuizEditor';
import { parseBulkQuizText, type BulkParseResult } from '../../lib/bulkQuiz';
import type { AdminQuizInput } from '../../lib/adminValidation';

const FORMAT_EXAMPLE = `Title: CSE Quick Challenge
Date: 2026-10-29

Q1. Which language is popular for competitive programming?
A) HTML
B) C++
C) CSS
D) SQL
Answer: B
Explanation: C++ is popular because of its speed and STL.`;

/**
 * Pasted quiz text in, validated preview out. Parsing is local and synchronous. Nothing is written
 * here: Import only fills the manual editor, and the existing Save Draft action saves it.
 */
export function BulkImport({
  text,
  onTextChange,
  onImport,
}: {
  text: string;
  onTextChange: (next: string) => void;
  onImport: (quiz: AdminQuizInput) => void;
}) {
  // The result is kept with the text it was computed from, so any edit makes it stale.
  const [checked, setChecked] = useState<{ source: string; outcome: BulkParseResult } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const outcome = checked && checked.source === text ? checked.outcome : null;

  function parse() {
    setChecked({ source: text, outcome: parseBulkQuizText(text) });
  }

  return (
    <section aria-labelledby="bulk-title" className="flex flex-col gap-6">
      <Card tone="paper" className="flex flex-col gap-4">
        <div>
          <h2 id="bulk-title" className="font-display text-2xl font-bold">Bulk import</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Paste the title, date, and five questions. Each question needs four options, one correct answer, and an explanation.
            Nothing is saved until you import and then save the draft.
          </p>
        </div>

        <details className="rounded-2xl border-2 border-ink bg-paper px-4 py-3">
          <summary className="cursor-pointer font-semibold">Show the expected format</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-sand p-3 text-sm">{FORMAT_EXAMPLE}</pre>
        </details>

        <div className="flex flex-col gap-1">
          <label htmlFor="bulk-text" className="font-semibold">Quiz text</label>
          <textarea
            id="bulk-text"
            rows={18}
            value={text}
            spellCheck={false}
            onChange={(e) => {
              onTextChange(e.target.value);
            }}
            aria-describedby="bulk-help"
            className="min-h-64 rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-mono text-sm focus-visible:outline-violet"
          />
          <p id="bulk-help" className="text-xs text-ink-soft">
            Your text stays here if validation fails, so you can correct it in place.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={parse} disabled={text.trim() === ''}>Parse and validate</Button>
          <Button variant="ghost" disabled={text === ''} onClick={() => setConfirmClear(true)}>Clear text</Button>
        </div>
      </Card>

      {text.trim() === '' && <p className="text-ink-soft">Paste the quiz text above, then parse and validate it.</p>}

      {outcome && !outcome.ok && (
        <div role="alert" className="flex flex-col gap-2 rounded-card border-2 border-ink bg-pink-soft p-5">
          <p className="font-bold">Fix these problems, then parse again:</p>
          <ul className="list-disc space-y-1 pl-5">
            {outcome.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {outcome && outcome.ok && (
        <div className="flex flex-col gap-6">
          <Notice kind="ok">Validation passed: 5 questions, 4 options each, one correct answer each.</Notice>
          <QuizPreview input={outcome.quiz} />
          <div>
            <Button onClick={() => onImport(outcome.quiz)}>Import to draft</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        busy={false}
        title="Clear the pasted text?"
        body="The text you pasted will be removed. This cannot be undone."
        confirmLabel="Clear text"
        onConfirm={() => {
          onTextChange('');
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
