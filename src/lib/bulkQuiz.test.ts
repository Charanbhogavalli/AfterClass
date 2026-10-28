import { describe, expect, it } from 'vitest';
import bulkSource from './bulkQuiz?raw';
import { parseBulkQuizText } from './bulkQuiz';

// Test fixtures are built from data, not escape-sequence literals, so line endings are explicit.
const CRLF = String.fromCharCode(13, 10);
const BOM = String.fromCharCode(0xfeff);
const NBSP = String.fromCharCode(0xa0);

interface Q {
  text: string;
  options: [string, string, string, string];
  answer: string;
  explanation: string;
}

const QUIZ: Q[] = [
  {
    text: 'Which language is popular for competitive programming?',
    options: ['HTML', 'C++', 'CSS', 'SQL'],
    answer: 'B',
    explanation: 'C++ is popular because of its speed and STL.',
  },
  {
    text: 'Which data structure follows FIFO?',
    options: ['Stack', 'Queue', 'Tree', 'Graph'],
    answer: 'B',
    explanation: 'A queue removes items in the order they arrive.',
  },
  {
    text: 'Which language is commonly used to retrieve data from relational databases?',
    options: ['SQL', 'CSS', 'HTML', 'XML'],
    answer: 'A',
    explanation: 'SQL provides commands such as SELECT to retrieve records.',
  },
  {
    text: 'Which protocol is commonly used for communication between a browser and a web server?',
    options: ['HTTP', 'FTP', 'SMTP', 'SSH'],
    answer: 'A',
    explanation: 'HTTP defines request and response communication between clients and servers.',
  },
  {
    text: 'Which of these is an operating system?',
    options: ['React', 'Linux', 'MySQL', 'TypeScript'],
    answer: 'B',
    explanation: 'Linux is an operating-system kernel used by Linux distributions.',
  },
];

const HEADER = ['Title: CSE Quick Challenge', 'Date: 2026-10-29'];

/** Standard block: "Q1. ...", "A) ..." options, "Answer: ...", "Explanation: ...", then a blank line. */
function block(n: number, q: Q, style: { header?: string; sep?: string; answerLabel?: string } = {}): string[] {
  const sep = style.sep ?? ')';
  const letters = ['A', 'B', 'C', 'D'];
  return [
    `${style.header ?? `Q${n}.`} ${q.text}`,
    ...q.options.map((o, i) => `${letters[i]}${sep} ${o}`),
    `${style.answerLabel ?? 'Answer:'} ${q.answer}`,
    `Explanation: ${q.explanation}`,
    '',
  ];
}

function quizText(blocks: string[][], header: string[] = HEADER): string {
  return [...header, '', ...blocks.flat()].join('\n');
}

function validBlocks(): string[][] {
  return QUIZ.map((q, i) => block(i + 1, q));
}

function expectErrors(text: string, expected: string): void {
  const result = parseBulkQuizText(text);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors).toContain(expected);
}

describe('bulk quiz parser: valid input', () => {
  it('parses a complete five-question quiz into the editor model', () => {
    const result = parseBulkQuizText(quizText(validBlocks()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quiz.title).toBe('CSE Quick Challenge');
    expect(result.quiz.day).toBe('2026-10-29');
    expect(result.quiz.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(result.quiz.questions.map((q) => q.answer)).toEqual(['b', 'b', 'a', 'a', 'b']);
    expect(result.quiz.questions[0]?.options).toEqual({ a: 'HTML', b: 'C++', c: 'CSS', d: 'SQL' });
    expect(result.quiz.questions[1]?.explanation).toBe('A queue removes items in the order they arrive.');
  });

  it('accepts blank lines and Windows or Unix line endings', () => {
    const unix = parseBulkQuizText(quizText(validBlocks()));
    const windows = parseBulkQuizText(quizText(validBlocks()).split('\n').join(CRLF));
    const extraBlanks = parseBulkQuizText(quizText(validBlocks()).replace(/\n/g, '\n\n'));
    expect(windows).toEqual(unix);
    expect(extraBlanks).toEqual(unix);
  });

  it('accepts a byte-order mark and non-breaking spaces', () => {
    const text = BOM + quizText(validBlocks()).replace('Title: CSE', `Title:${NBSP}CSE`);
    expect(parseBulkQuizText(text).ok).toBe(true);
  });

  it('accepts the alternative header, option, and answer formats when used consistently', () => {
    const blocks = QUIZ.map((q, i) =>
      block(i + 1, q, {
        header: i % 2 === 0 ? `Question ${i + 1}:` : `Q${i + 1}:`,
        sep: i % 2 === 0 ? '.' : ':',
        answerLabel: i % 2 === 0 ? 'Correct Answer:' : 'Answer:',
      }),
    );
    const result = parseBulkQuizText(quizText(blocks));
    expect(result.ok).toBe(true);
  });
});

describe('bulk quiz parser: metadata', () => {
  it('requires a title', () => {
    const text = quizText(validBlocks(), ['Date: 2026-10-29']);
    expectErrors(text, 'Title is missing. Add a line like "Title: CSE Quick Challenge".');
  });

  it('requires a date and never picks one silently', () => {
    const text = quizText(validBlocks(), ['Title: CSE Quick Challenge']);
    expectErrors(text, 'Date is missing. Add a line like "Date: 2026-10-29".');
  });

  it('rejects an impossible calendar date', () => {
    const text = quizText(validBlocks(), ['Title: CSE Quick Challenge', 'Date: 2026-02-30']);
    expectErrors(text, 'Date: Enter a valid date in YYYY-MM-DD format.');
  });

  it('rejects a date that is not in YYYY-MM-DD format', () => {
    const text = quizText(validBlocks(), ['Title: CSE Quick Challenge', 'Date: 29/10/2026']);
    expectErrors(text, 'Date: Enter a valid date in YYYY-MM-DD format.');
  });
});

describe('bulk quiz parser: questions and options', () => {
  it('reports a missing question', () => {
    const blocks = validBlocks().slice(0, 4);
    expectErrors(quizText(blocks), 'Question 5 is missing.');
  });

  it('reports missing question text', () => {
    const blocks = validBlocks();
    blocks[1] = ['Q2.', ...blocks[1]!.slice(1)];
    expectErrors(quizText(blocks), 'Question 2: Question text is missing.');
  });

  it('reports a missing option', () => {
    const blocks = validBlocks();
    blocks[1] = blocks[1]!.filter((line) => !line.startsWith('C)'));
    expectErrors(quizText(blocks), 'Question 2: Option C is missing.');
  });

  it('reports an empty option', () => {
    const blocks = validBlocks();
    blocks[1] = blocks[1]!.map((line) => (line === 'C) CSS' || line === 'C) Tree' ? 'C)' : line));
    expectErrors(quizText(blocks), 'Question 2: Option C is empty.');
  });

  it('reports duplicated option text within a question', () => {
    const blocks = validBlocks();
    blocks[2] = blocks[2]!.map((line) => (line === 'D) XML' ? 'D) SQL' : line));
    expectErrors(quizText(blocks), 'Question 3: Option text is duplicated.');
  });

  it('refuses a fifth option rather than ignoring it', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.flatMap((line) => (line.startsWith('D)') ? [line, 'E) Extra'] : [line]));
    expectErrors(quizText(blocks), 'Question 1: Option E is not allowed. Each question needs exactly four options, A to D.');
  });

  it('refuses mixed option styles inside one question', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.map((line) => (line === 'B) C++' ? 'B. C++' : line));
    const result = parseBulkQuizText(quizText(blocks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('Question 1: use the same option style'))).toBe(true);
  });

  it('refuses options given out of order', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.map((line) => (line === 'B) C++' ? 'C) C++' : line === 'C) CSS' ? 'B) CSS' : line));
    expectErrors(quizText(blocks), 'Question 1: options must be in order A, B, C, D.');
  });
});

describe('bulk quiz parser: answers and explanations', () => {
  it('rejects an answer letter outside A to D', () => {
    const blocks = validBlocks();
    blocks[2] = blocks[2]!.map((line) => (line === 'Answer: A' ? 'Answer: E' : line));
    expectErrors(quizText(blocks), 'Question 3: Answer must be A, B, C, or D.');
  });

  it('reports a missing answer and never guesses one', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.filter((line) => !line.startsWith('Answer:'));
    expectErrors(quizText(blocks), 'Question 1: Answer is missing.');
  });

  it('reports a missing explanation, because the quiz schema requires one', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.filter((line) => !line.startsWith('Explanation:'));
    expectErrors(quizText(blocks), 'Question 1: Explanation is missing.');
  });

  it('keeps a multi-line explanation intact', () => {
    const blocks = validBlocks();
    blocks[0] = [...blocks[0]!.slice(0, -2), 'Explanation: C++ is popular.', 'It is fast and has the STL.', ''];
    const result = parseBulkQuizText(quizText(blocks));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quiz.questions[0]?.explanation).toBe('C++ is popular. It is fast and has the STL.');
  });
});

describe('bulk quiz parser: boundaries and unexpected content', () => {
  it('reports duplicate question numbers', () => {
    const blocks = validBlocks();
    blocks[4] = block(2, QUIZ[4]!);
    expectErrors(quizText(blocks), 'Question 2 appears more than once.');
  });

  it('reports a question number outside a five-question quiz', () => {
    const blocks = [...validBlocks(), block(6, QUIZ[0]!)];
    expectErrors(quizText(blocks), 'Question 6 is not part of a 5-question quiz.');
  });

  it('reports an option that appears after the answer, so it is never mixed into the next question', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.flatMap((line) => (line === 'Answer: B' ? [line, 'D) Late option'] : [line]));
    expectErrors(quizText(blocks), 'Question 1: Option D appears after the answer. Options must come before the answer.');
  });

  it('reports unexpected text between the options and the answer', () => {
    const blocks = validBlocks();
    blocks[0] = blocks[0]!.flatMap((line) => (line === 'Answer: B' ? ['Which one is best?', line] : [line]));
    const result = parseBulkQuizText(quizText(blocks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('Question 1: unexpected text'))).toBe(true);
  });

  it('reports text before the first question instead of ignoring it', () => {
    const text = quizText(validBlocks(), [...HEADER, 'Please check the answers before posting']);
    const result = parseBulkQuizText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('Unexpected text before the first question'))).toBe(true);
  });

  it('reports a duplicate title line', () => {
    const text = quizText(validBlocks(), [...HEADER, 'Title: Another title']);
    expectErrors(text, 'Title appears more than once.');
  });

  it('reports a title or date line placed after the questions begin', () => {
    const blocks = validBlocks();
    blocks[0] = [blocks[0]![0]!, 'Date: 2026-10-30', ...blocks[0]!.slice(1)];
    expectErrors(quizText(blocks), 'Date must appear before the first question.');
  });
});

describe('bulk quiz parser: safety of the parse itself', () => {
  it('does not modify the pasted text, whether parsing succeeds or fails', () => {
    const text = quizText(validBlocks());
    const copy = text.slice();
    parseBulkQuizText(text);
    expect(text).toBe(copy);
    const broken = text.replace('Answer: B', 'Answer: Z');
    const brokenCopy = broken.slice();
    expect(parseBulkQuizText(broken).ok).toBe(false);
    expect(broken).toBe(brokenCopy);
  });

  it('returns a quiz without a status, so parsing can never publish anything', () => {
    const result = parseBulkQuizText(quizText(validBlocks()));
    expect(result.ok).toBe(true);
    if (result.ok) expect('status' in result.quiz).toBe(false);
  });

  it('contains no network, Firebase, or AI calls and no Firestore writes', () => {
    const forbidden = ['firebase', 'fetch(', 'xmlhttprequest', 'openrouter', 'openai', 'anthropic', 'gemini', 'setdoc', 'updatedoc', 'changequizstatus', 'createquizdraft'];
    const lower = bulkSource.toLowerCase();
    for (const term of forbidden) expect(lower.includes(term)).toBe(false);
  });
});
