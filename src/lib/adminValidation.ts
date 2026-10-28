import { CHOICES, QUESTION_IDS, type Choice, type QuestionId } from './quiz';

// Pure validation shared by the admin forms and unit tests. Firestore rules do not validate
// these fields, so the admin UI is the only place that enforces the content limits.

export const QUIZ_STATUSES = ['draft', 'published', 'closed'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const POLL_STATUSES = ['draft', 'published', 'closed'] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

export const SUGGESTION_STATUSES = ['submitted', 'planned', 'done', 'declined'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface AdminQuestion {
  id: QuestionId;
  text: string;
  options: Record<Choice, string>;
  /** Empty until the admin picks the correct option; validation refuses an empty answer. */
  answer: Choice | '';
  explanation: string;
}

/** A quiz is keyed by its day (YYYY-MM-DD), matching docs/sample-quiz.json and quizzes/{day}. */
export interface AdminQuizInput {
  day: string;
  title: string;
  questions: AdminQuestion[];
}

export interface AdminPollInput {
  question: string;
  options: string[];
}

export const POLL_OPTION_MIN = 2;
export const POLL_OPTION_MAX = 6;

/** Allowed transitions. Anything else (including reverting to draft) is refused. */
export const QUIZ_TRANSITIONS: Record<QuizStatus, QuizStatus[]> = {
  draft: ['published'],
  published: ['closed'],
  closed: [],
};

export const POLL_TRANSITIONS: Record<PollStatus, PollStatus[]> = {
  draft: ['published'],
  published: ['closed'],
  closed: [],
};

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  return map[from]?.includes(to) ?? false;
}

export function isIsoDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export function trimQuiz(input: AdminQuizInput): AdminQuizInput {
  return {
    day: input.day.trim(),
    title: input.title.trim(),
    questions: input.questions.map((q) => ({
      id: q.id,
      text: q.text.trim(),
      options: Object.fromEntries(CHOICES.map((c) => [c, q.options[c].trim()])) as Record<Choice, string>,
      answer: q.answer,
      explanation: q.explanation.trim(),
    })),
  };
}

/** Returns human-readable problems. An empty array means the quiz can be saved. */
export function validateQuizInput(raw: AdminQuizInput): string[] {
  const input = trimQuiz(raw);
  const problems: string[] = [];

  if (!isIsoDay(input.day)) problems.push('Choose a valid quiz date.');
  if (input.title.length < 3 || input.title.length > 120) problems.push('Title must be 3 to 120 characters.');

  if (input.questions.length !== QUESTION_IDS.length) {
    problems.push(`A quiz needs exactly ${QUESTION_IDS.length} questions.`);
    return problems;
  }

  const seen = new Set<string>();
  input.questions.forEach((q, index) => {
    const n = index + 1;
    const expectedId = QUESTION_IDS[index];
    if (seen.has(q.id)) problems.push(`Question ${n}: the question ID "${q.id}" is used more than once.`);
    seen.add(q.id);
    if (q.id !== expectedId) problems.push(`Question ${n}: the question ID must be "${expectedId}".`);

    if (q.text.length < 5 || q.text.length > 300) problems.push(`Question ${n}: text must be 5 to 300 characters.`);

    const labels = CHOICES.map((c) => q.options[c].toLowerCase());
    CHOICES.forEach((c) => {
      if (q.options[c].length < 1 || q.options[c].length > 120) {
        problems.push(`Question ${n}: option ${c.toUpperCase()} must be 1 to 120 characters.`);
      }
    });
    if (new Set(labels).size !== labels.length) problems.push(`Question ${n}: each option must be different.`);

    if (!(CHOICES as readonly string[]).includes(q.answer)) problems.push(`Question ${n}: choose the correct answer.`);
    if (q.explanation.length < 5 || q.explanation.length > 500) {
      problems.push(`Question ${n}: explanation must be 5 to 500 characters.`);
    }
  });

  return problems;
}

/** Returns human-readable problems. An empty array means the poll can be saved. */
export function validatePollInput(raw: AdminPollInput): string[] {
  const question = raw.question.trim();
  const options = raw.options.map((o) => o.trim());
  const problems: string[] = [];

  if (question.length < 5 || question.length > 200) problems.push('Question must be 5 to 200 characters.');
  if (options.length < POLL_OPTION_MIN || options.length > POLL_OPTION_MAX) {
    problems.push(`A poll needs ${POLL_OPTION_MIN} to ${POLL_OPTION_MAX} options.`);
  }
  if (options.some((o) => o.length === 0)) problems.push('Every option needs text. Remove empty options.');
  if (options.some((o) => o.length > 80)) problems.push('Each option must be 80 characters or fewer.');

  const lowered = options.map((o) => o.toLowerCase());
  if (new Set(lowered).size !== lowered.length) problems.push('Options must be different from each other.');

  return problems;
}

export function isSuggestionStatus(value: string): value is SuggestionStatus {
  return (SUGGESTION_STATUSES as readonly string[]).includes(value);
}
