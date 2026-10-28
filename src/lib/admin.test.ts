import { describe, expect, it } from 'vitest';
import { ADMIN_PIN_LENGTH, normalizePin, verifyAdminPin } from './adminPin';
import { isAdminIdentity } from './adminIdentity';
import {
  QUIZ_TRANSITIONS,
  POLL_TRANSITIONS,
  canTransition,
  isSuggestionStatus,
  validatePollInput,
  validateQuizInput,
  type AdminQuestion,
  type AdminQuizInput,
} from './adminValidation';

function question(id: string, overrides: Partial<AdminQuestion> = {}): AdminQuestion {
  return {
    id: id as AdminQuestion['id'],
    text: 'Which planet is known as the red planet?',
    options: { a: 'Venus', b: 'Mars', c: 'Jupiter', d: 'Saturn' },
    answer: 'b',
    explanation: 'Mars looks red because of iron oxide on its surface.',
    ...overrides,
  };
}

function validQuiz(overrides: Partial<AdminQuizInput> = {}): AdminQuizInput {
  return {
    day: '2026-10-29',
    title: 'Space basics',
    questions: ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => question(id)),
    ...overrides,
  };
}

describe('admin PIN gate', () => {
  // The real PIN is never written in this file. To also check the configured PIN, run with
  // ADMIN_PIN_FOR_TEST set in the environment. Without it, that one check is skipped.
  const configuredPin = process.env.ADMIN_PIN_FOR_TEST ?? '';

  it.skipIf(!configuredPin)('accepts the configured PIN and rejects near-misses', async () => {
    expect(configuredPin).toHaveLength(ADMIN_PIN_LENGTH);
    expect(await verifyAdminPin(configuredPin)).toBe(true);
    expect(await verifyAdminPin(configuredPin.slice(1))).toBe(false);
    const lastDigit = (Number(configuredPin.at(-1)) + 1) % 10;
    expect(await verifyAdminPin(configuredPin.slice(0, -1) + lastDigit)).toBe(false);
  });

  it('rejects inputs that cannot be the PIN', async () => {
    expect(await verifyAdminPin('')).toBe(false);
    expect(await verifyAdminPin('1234')).toBe(false);
    expect(await verifyAdminPin('abcd')).toBe(false);
  });

  it('keeps digits only, caps the length, and preserves a leading zero', () => {
    expect(normalizePin('0 1-2 3 4')).toBe('01234');
    expect(normalizePin('0123456789')).toBe('01234');
    expect(normalizePin('abc')).toBe('');
  });
});

describe('quiz validation', () => {
  it('accepts a complete five-question quiz', () => {
    expect(validateQuizInput(validQuiz())).toEqual([]);
  });

  it('requires a valid date, title, and exactly five questions', () => {
    expect(validateQuizInput(validQuiz({ day: '2026-02-30' }))).toContain('Choose a valid quiz date.');
    expect(validateQuizInput(validQuiz({ day: '29-10-2026' }))).toContain('Choose a valid quiz date.');
    expect(validateQuizInput(validQuiz({ title: 'ab' }))).toContain('Title must be 3 to 120 characters.');
    expect(validateQuizInput(validQuiz({ questions: validQuiz().questions.slice(0, 4) }))).toEqual([
      'A quiz needs exactly 5 questions.',
    ]);
  });

  it('rejects duplicate or out-of-order question IDs', () => {
    const quiz = validQuiz();
    quiz.questions[1] = question('q1');
    const problems = validateQuizInput(quiz);
    expect(problems.some((p) => p.includes('used more than once'))).toBe(true);
    expect(problems.some((p) => p.includes('must be "q2"'))).toBe(true);
  });

  it('requires an answer and an explanation for every question', () => {
    const quiz = validQuiz();
    quiz.questions[0] = question('q1', { answer: '' });
    quiz.questions[2] = question('q3', { explanation: 'no' });
    const problems = validateQuizInput(quiz);
    expect(problems).toContain('Question 1: choose the correct answer.');
    expect(problems).toContain('Question 3: explanation must be 5 to 500 characters.');
  });

  it('requires four non-empty, distinct options', () => {
    const quiz = validQuiz();
    quiz.questions[0] = question('q1', { options: { a: 'Same', b: 'same', c: 'Other', d: 'Fourth' } });
    quiz.questions[1] = question('q2', { options: { a: 'One', b: 'Two', c: '   ', d: 'Four' } });
    const problems = validateQuizInput(quiz);
    expect(problems).toContain('Question 1: each option must be different.');
    expect(problems).toContain('Question 2: option C must be 1 to 120 characters.');
  });
});

describe('poll validation', () => {
  it('accepts a poll with two to six distinct options', () => {
    expect(validatePollInput({ question: 'Best canteen snack?', options: ['Samosa', 'Maggi'] })).toEqual([]);
  });

  it('rejects fewer than two or more than six options', () => {
    expect(validatePollInput({ question: 'Best canteen snack?', options: ['Samosa'] })).toContain(
      'A poll needs 2 to 6 options.',
    );
    expect(validatePollInput({ question: 'Best canteen snack?', options: ['1', '2', '3', '4', '5', '6', '7'] })).toContain(
      'A poll needs 2 to 6 options.',
    );
  });

  it('rejects empty and duplicate options, ignoring case', () => {
    expect(validatePollInput({ question: 'Best canteen snack?', options: ['Samosa', '   '] })).toContain(
      'Every option needs text. Remove empty options.',
    );
    expect(validatePollInput({ question: 'Best canteen snack?', options: ['Samosa', 'samosa'] })).toContain(
      'Options must be different from each other.',
    );
  });

  it('rejects a question that is too short', () => {
    expect(validatePollInput({ question: 'Hi', options: ['Yes', 'No'] })).toContain('Question must be 5 to 200 characters.');
  });
});

describe('status transitions', () => {
  it('allows draft to published and published to closed only', () => {
    expect(canTransition(QUIZ_TRANSITIONS, 'draft', 'published')).toBe(true);
    expect(canTransition(QUIZ_TRANSITIONS, 'published', 'closed')).toBe(true);
    expect(canTransition(QUIZ_TRANSITIONS, 'published', 'draft')).toBe(false);
    expect(canTransition(QUIZ_TRANSITIONS, 'closed', 'published')).toBe(false);
    expect(canTransition(QUIZ_TRANSITIONS, 'draft', 'closed')).toBe(false);
  });

  it('applies the same rules to polls', () => {
    expect(canTransition(POLL_TRANSITIONS, 'draft', 'published')).toBe(true);
    expect(canTransition(POLL_TRANSITIONS, 'closed', 'draft')).toBe(false);
  });

  it('accepts only the four suggestion statuses the rules allow', () => {
    expect(['submitted', 'planned', 'done', 'declined'].every(isSuggestionStatus)).toBe(true);
    expect(isSuggestionStatus('approved')).toBe(false);
    expect(isSuggestionStatus('')).toBe(false);
  });
});

describe('administrator identity (display guidance)', () => {
  it('accepts only the verified owner account', () => {
    expect(isAdminIdentity('bhogavalli.cvv241072@cvv.ac.in', true)).toBe(true);
    expect(isAdminIdentity('BHOGAVALLI.cvv241072@cvv.ac.in', true)).toBe(true);
  });

  it('denies other verified @cvv.ac.in accounts', () => {
    expect(isAdminIdentity('ravi@cvv.ac.in', true)).toBe(false);
    expect(isAdminIdentity('bhogavalli@cvv.ac.in', true)).toBe(false);
  });

  it('denies the owner address on other domains or unverified', () => {
    expect(isAdminIdentity('bhogavalli.cvv241072@gmail.com', true)).toBe(false);
    expect(isAdminIdentity('bhogavalli.cvv241072@cvv.ac.in', false)).toBe(false);
    expect(isAdminIdentity('bhogavalli.cvv241072@x.cvv.ac.in', true)).toBe(false);
    expect(isAdminIdentity(null, true)).toBe(false);
  });
});
