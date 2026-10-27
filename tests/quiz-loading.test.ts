import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { fetchLatestQuiz, hasAttempt } from '../src/lib/quiz';

// Runs against the local Firestore emulator only (npm run test:rules).
const STUDENT = { email: 'asha.rao@cvv.ac.in', email_verified: true };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Own project ID: the emulator is shared, and parallel test files would clear each other's data.
    projectId: 'afterclass-quiz-loading-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const db = (): Firestore => env.authenticatedContext('asha', STUDENT).firestore() as unknown as Firestore;

const questions = (prefix: string) =>
  ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => ({
    id,
    text: `${prefix} ${id}`,
    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
  }));

async function seedQuiz(id: string, fields: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'quizzes', id), fields);
  });
}

describe('fetchLatestQuiz', () => {
  it('returns null when the quizzes collection is empty (no error)', async () => {
    await expect(fetchLatestQuiz(db())).resolves.toBeNull();
  });

  it('returns null when only drafts and closed quizzes exist', async () => {
    await seedQuiz('d1', { title: 'Draft', status: 'draft', day: '2026-10-28', questions: questions('draft') });
    await seedQuiz('c1', { title: 'Closed', status: 'closed', day: '2026-10-26', questions: questions('closed') });
    await expect(fetchLatestQuiz(db())).resolves.toBeNull();
  });

  it('returns the published quiz with the latest day', async () => {
    await seedQuiz('2026-10-24', { title: 'Older', status: 'published', day: '2026-10-24', questions: questions('old') });
    await seedQuiz('2026-10-25', { title: 'Newest', status: 'published', day: '2026-10-25', questions: questions('new') });
    const quiz = await fetchLatestQuiz(db());
    expect(quiz?.id).toBe('2026-10-25');
    expect(quiz?.title).toBe('Newest');
    expect(quiz?.questions).toHaveLength(5);
  });

  it('throws for a published quiz with malformed questions instead of hiding it', async () => {
    await seedQuiz('bad', { title: 'Bad', status: 'published', day: '2026-10-25', questions: questions('x').slice(0, 4) });
    await expect(fetchLatestQuiz(db())).rejects.toThrow('Published quiz is malformed.');
  });

  it('reports no attempt for a first-time student instead of failing', async () => {
    await seedQuiz('2026-10-25', { title: 'Newest', status: 'published', day: '2026-10-25', questions: questions('new') });
    await expect(hasAttempt(db(), 'asha', '2026-10-25')).resolves.toBe(false);
  });
});
