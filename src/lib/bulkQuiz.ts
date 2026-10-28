import { CHOICES, QUESTION_IDS, type Choice } from './quiz';
import { isIsoDay, trimQuiz, validateQuizInput, type AdminQuestion, type AdminQuizInput } from './adminValidation';

// Deterministic, local parser for pasted quiz text. No network, no AI, no storage.
// A successful parse is only a candidate: the existing editor and Save Draft perform every write.

export type BulkParseResult = { ok: true; quiz: AdminQuizInput } | { ok: false; errors: string[] };

const TITLE_LINE = /^title\s*:\s*(.*)$/i;
const DATE_LINE = /^date\s*:\s*(.*)$/i;
const QUESTION_LINE = /^(?:question|q)\s*(\d+)\s*[.:)]\s*(.*)$/i;
const OPTION_LINE = /^([a-z])\s*([.):])\s*(.*)$/i;
const ANSWER_LINE = /^(?:correct\s+)?answer\s*:\s*(.*)$/i;
const EXPLANATION_LINE = /^explanation\s*:\s*(.*)$/i;

const QUESTION_COUNT = QUESTION_IDS.length;

interface QuestionBuilder {
  number: number;
  /** Duplicate or out-of-range headers: the lines are still checked, but the question is not kept. */
  ignored: boolean;
  text: string[];
  options: Map<Choice, string>;
  order: Choice[];
  separator: string | null;
  answer: string | null;
  explanation: string[] | null;
  errors: string[];
}

function newBuilder(number: number, ignored: boolean): QuestionBuilder {
  return { number, ignored, text: [], options: new Map(), order: [], separator: null, answer: null, explanation: null, errors: [] };
}

function snip(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function isChoice(letter: string): letter is Choice {
  return (CHOICES as readonly string[]).includes(letter);
}

function attachOption(b: QuestionBuilder, letterRaw: string, separator: string, text: string): void {
  const letter = letterRaw.toLowerCase();
  const label = letter.toUpperCase();
  if (b.answer !== null || b.explanation !== null) {
    b.errors.push(`Question ${b.number}: Option ${label} appears after the answer. Options must come before the answer.`);
    return;
  }
  if (!isChoice(letter)) {
    b.errors.push(`Question ${b.number}: Option ${label} is not allowed. Each question needs exactly four options, A to D.`);
    return;
  }
  if (b.options.has(letter)) {
    b.errors.push(`Question ${b.number}: Option ${label} appears more than once.`);
    return;
  }
  if (b.separator === null) b.separator = separator;
  else if (b.separator !== separator) {
    b.errors.push(`Question ${b.number}: use the same option style on every line (for example "A)" on each option).`);
  }
  const previous = b.order.at(-1);
  if (previous && CHOICES.indexOf(letter) < CHOICES.indexOf(previous)) {
    b.errors.push(`Question ${b.number}: options must be in order A, B, C, D.`);
  }
  b.options.set(letter, text.trim());
  b.order.push(letter);
}

/** Routes one line inside a question. Ambiguous lines become errors, never silent guesses. */
function attachLine(b: QuestionBuilder, line: string): void {
  const answerMatch = ANSWER_LINE.exec(line);
  if (answerMatch) {
    if (b.answer !== null) b.errors.push(`Question ${b.number}: Answer appears more than once.`);
    else b.answer = (answerMatch[1] ?? '').trim();
    return;
  }

  const explanationMatch = EXPLANATION_LINE.exec(line);
  if (explanationMatch) {
    if (b.explanation !== null) b.errors.push(`Question ${b.number}: Explanation appears more than once.`);
    else b.explanation = [(explanationMatch[1] ?? '').trim()];
    return;
  }

  const optionMatch = OPTION_LINE.exec(line);
  if (optionMatch) {
    attachOption(b, optionMatch[1] ?? '', optionMatch[2] ?? '', optionMatch[3] ?? '');
    return;
  }

  // Lines after "Explanation:" continue the explanation, so long explanations stay intact.
  if (b.explanation !== null) {
    b.explanation.push(line);
    return;
  }
  // Other text after the options or the answer has no clear place, so it is reported.
  if (b.answer !== null || b.order.length > 0) {
    b.errors.push(
      `Question ${b.number}: unexpected text "${snip(line)}". Put question text before the options, and explanations after the answer.`,
    );
    return;
  }
  // Text before the options is the question text, which may span several lines.
  b.text.push(line);
}

/** Final checks for one question. Returns the question only when it has no errors. */
function finishQuestion(b: QuestionBuilder): AdminQuestion | null {
  const n = b.number;
  const text = b.text.join(' ').trim();
  if (!text) b.errors.push(`Question ${n}: Question text is missing.`);

  for (const choice of CHOICES) {
    const label = choice.toUpperCase();
    if (!b.options.has(choice)) b.errors.push(`Question ${n}: Option ${label} is missing.`);
    else if (!b.options.get(choice)) b.errors.push(`Question ${n}: Option ${label} is empty.`);
  }

  const optionTexts = CHOICES.map((c) => (b.options.get(c) ?? '').toLowerCase()).filter((t) => t.length > 0);
  if (new Set(optionTexts).size !== optionTexts.length) b.errors.push(`Question ${n}: Option text is duplicated.`);

  if (b.answer === null) b.errors.push(`Question ${n}: Answer is missing.`);
  const answer = (b.answer ?? '').toLowerCase();
  if (b.answer !== null && !isChoice(answer)) b.errors.push(`Question ${n}: Answer must be A, B, C, or D.`);

  const explanation = (b.explanation ?? []).join(' ').trim();
  if (!explanation) b.errors.push(`Question ${n}: Explanation is missing.`);

  if (b.errors.length > 0 || !isChoice(answer)) return null;
  return {
    id: QUESTION_IDS[n - 1] as AdminQuestion['id'],
    text,
    options: {
      a: b.options.get('a') ?? '',
      b: b.options.get('b') ?? '',
      c: b.options.get('c') ?? '',
      d: b.options.get('d') ?? '',
    },
    answer,
    explanation,
  };
}

function closeQuestion(b: QuestionBuilder, errors: string[], built: Map<number, AdminQuestion>): void {
  const question = finishQuestion(b);
  if (b.ignored) return;
  errors.push(...b.errors);
  if (question) built.set(b.number, question);
}

/**
 * Parses the human-readable quiz format into the editor's form model.
 * Every problem is collected, so the admin can fix the whole text in one pass.
 * The returned quiz is validated with the same rules as the manual editor.
 */
export function parseBulkQuizText(input: string): BulkParseResult {
  const lines = input.replace(/^\uFEFF/, '').replace(/\u00a0/g, ' ').split(/\r\n|\r|\n/);
  const errors: string[] = [];
  const built = new Map<number, AdminQuestion>();
  const seenNumbers = new Set<number>();
  let title: string | null = null;
  let date: string | null = null;
  let current: QuestionBuilder | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;

    const questionMatch = QUESTION_LINE.exec(line);
    if (questionMatch) {
      if (current) closeQuestion(current, errors, built);
      const number = Number(questionMatch[1]);
      if (seenNumbers.has(number)) {
        errors.push(`Question ${number} appears more than once.`);
        current = newBuilder(number, true);
      } else if (number < 1 || number > QUESTION_COUNT) {
        errors.push(`Question ${number} is not part of a ${QUESTION_COUNT}-question quiz.`);
        current = newBuilder(number, true);
      } else {
        seenNumbers.add(number);
        current = newBuilder(number, false);
      }
      // Text on the header line ("Q1. Which ...?") is the start of the question text.
      const headerText = (questionMatch[2] ?? '').trim();
      if (current && headerText) current.text.push(headerText);
      continue;
    }

    const titleMatch = TITLE_LINE.exec(line);
    const dateMatch = DATE_LINE.exec(line);
    if (titleMatch || dateMatch) {
      const label = titleMatch ? 'Title' : 'Date';
      if (current) errors.push(`${label} must appear before the first question.`);
      else if (titleMatch) {
        if (title !== null) errors.push('Title appears more than once.');
        else title = (titleMatch[1] ?? '').trim();
      } else if (dateMatch) {
        if (date !== null) errors.push('Date appears more than once.');
        else date = (dateMatch[1] ?? '').trim();
      }
      continue;
    }

    if (!current) {
      errors.push(`Unexpected text before the first question: "${snip(line)}".`);
      continue;
    }
    attachLine(current, line);
  }
  if (current) closeQuestion(current, errors, built);

  if (title === null || title === '') errors.push('Title is missing. Add a line like "Title: CSE Quick Challenge".');
  if (date === null) errors.push('Date is missing. Add a line like "Date: 2026-10-29".');
  else if (!isIsoDay(date)) errors.push('Date: Enter a valid date in YYYY-MM-DD format.');
  for (let n = 1; n <= QUESTION_COUNT; n++) {
    if (!seenNumbers.has(n)) errors.push(`Question ${n} is missing.`);
  }

  const unique = [...new Set(errors)];
  if (unique.length > 0) return { ok: false, errors: unique };

  const questions: AdminQuestion[] = [];
  for (let n = 1; n <= QUESTION_COUNT; n++) {
    const question = built.get(n);
    if (!question) return { ok: false, errors: [`Question ${n} could not be read.`] };
    questions.push(question);
  }

  const quiz: AdminQuizInput = { day: date ?? '', title: title ?? '', questions };
  const problems = [...new Set(validateQuizInput(quiz))];
  if (problems.length > 0) return { ok: false, errors: problems };
  return { ok: true, quiz: trimQuiz(quiz) };
}
