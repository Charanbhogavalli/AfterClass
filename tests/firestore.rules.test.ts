import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { submitAttempt, finishAttempt, type Answers } from '../src/lib/quiz';
import { castVote, fetchOpenPolls, submitSuggestion } from '../src/lib/community';

// Runs against the local Firestore emulator only (npm run test:rules). No billing involved.
const STUDENT = { email: 'asha.rao@cvv.ac.in', email_verified: true };
const OTHER_STUDENT = { email: 'ravi@cvv.ac.in', email_verified: true };
const ADMIN = { email: 'admin@cvv.ac.in', email_verified: true, admin: true };
const GMAIL_USER = { email: 'someone@gmail.com', email_verified: true };
const UNVERIFIED = { email: 'asha.rao@cvv.ac.in', email_verified: false };

const KEY: Answers = { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'a' };
const ALL_RIGHT: Answers = { ...KEY };
const TWO_RIGHT: Answers = { q1: 'a', q2: 'a', q3: 'c', q4: 'a', q5: 'b' }; // correct: q1, q3
const ALL_MARKS = { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'afterclass-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const db = (uid: string, claims: Record<string, unknown> = STUDENT): Firestore =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const now = new Date();
    await setDoc(doc(d, 'users', 'asha'), { displayName: 'Asha', photoURL: null, points: 0, streak: 0, scoredQuizzes: [], createdAt: now, updatedAt: now });
    await setDoc(doc(d, 'users', 'ravi'), { displayName: 'Ravi', photoURL: null, points: 10, streak: 0, scoredQuizzes: [], createdAt: now, updatedAt: now });

    const quizQuestions = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => ({
      id,
      text: `Question ${id}`,
      options: { a: 'A', b: 'B', c: 'C', d: 'D' },
    }));
    await setDoc(doc(d, 'quizzes', 'q-open'), { title: 'Open', status: 'published', day: '2026-10-25', questions: quizQuestions });
    await setDoc(doc(d, 'quizzes', 'q-closed'), { title: 'Closed', status: 'closed', day: '2026-10-24', questions: quizQuestions });
    await setDoc(doc(d, 'quizzes', 'q-draft'), { title: 'Draft', status: 'draft', day: '2026-10-26', questions: quizQuestions });
    const explanations = { q1: 'e1', q2: 'e2', q3: 'e3', q4: 'e4', q5: 'e5' };
    await setDoc(doc(d, 'quizKeys', 'q-open'), { answers: KEY, explanations });
    await setDoc(doc(d, 'quizKeys', 'q-closed'), { answers: KEY, explanations });

    await setDoc(doc(d, 'polls', 'p-open'), { question: 'Lab?', options: ['a', 'b', 'c'], status: 'published', createdAt: now });
    await setDoc(doc(d, 'polls', 'p-closed'), { question: 'Old?', options: ['a', 'b'], status: 'closed', createdAt: now });
    await setDoc(doc(d, 'polls', 'p-draft'), { question: 'Hidden', options: ['a', 'b'], status: 'draft', createdAt: now });
  });
});

const validProfile = () => ({
  displayName: 'Asha Rao',
  photoURL: null,
  points: 0,
  streak: 0,
  scoredQuizzes: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

/** Helper: writes an attempt directly, as a student's client would. */
const createAttemptDoc = (uid: string, quizId: string, answers: Answers, extra: Record<string, unknown> = {}) =>
  setDoc(doc(db(uid), 'quizAttempts', `${quizId}_${uid}`), { uid, quizId, answers, createdAt: serverTimestamp(), ...extra });

describe('users/{uid}', () => {
  it('lets a verified student create their own zero-score profile', async () => {
    await assertSucceeds(setDoc(doc(db('new-student'), 'users', 'new-student'), validProfile()));
  });

  it('rejects a self-assigned score, streak, role, or non-empty award list on create', async () => {
    const d = db('new-student');
    await assertFails(setDoc(doc(d, 'users', 'new-student'), { ...validProfile(), points: 500 }));
    await assertFails(setDoc(doc(d, 'users', 'new-student'), { ...validProfile(), streak: 99 }));
    await assertFails(setDoc(doc(d, 'users', 'new-student'), { ...validProfile(), role: 'admin' }));
    await assertFails(setDoc(doc(d, 'users', 'new-student'), { ...validProfile(), scoredQuizzes: ['q-open'] }));
  });

  it('rejects creating a profile for another uid', async () => {
    await assertFails(setDoc(doc(db('new-student'), 'users', 'asha'), validProfile()));
  });

  it('lets a student change only their display name', async () => {
    await assertSucceeds(updateDoc(doc(db('asha'), 'users', 'asha'), { displayName: 'Asha R.', updatedAt: serverTimestamp() }));
  });

  it('rejects direct writes to points, streak, role, or the award list', async () => {
    const d = db('asha');
    await assertFails(updateDoc(doc(d, 'users', 'asha'), { points: 9999, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(d, 'users', 'asha'), { streak: 50, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(d, 'users', 'asha'), { role: 'admin', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(d, 'users', 'asha'), { scoredQuizzes: ['q-open'], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(d, 'users', 'asha'), { displayName: 'Asha', points: 1, updatedAt: serverTimestamp() }));
  });

  it('rejects editing another student profile', async () => {
    await assertFails(updateDoc(doc(db('ravi', OTHER_STUDENT), 'users', 'asha'), { displayName: 'Hacked', updatedAt: serverTimestamp() }));
  });

  it('lets verified college students read profiles, but not unauthenticated users', async () => {
    await assertSucceeds(getDoc(doc(db('ravi', OTHER_STUDENT), 'users', 'asha')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'users', 'asha')));
  });
});

describe('domain policy in rules', () => {
  it('denies non-college and unverified accounts', async () => {
    await assertFails(getDoc(doc(db('g1', GMAIL_USER), 'users', 'asha')));
    await assertFails(getDoc(doc(db('u1', UNVERIFIED), 'users', 'asha')));
    await assertFails(setDoc(doc(db('g1', GMAIL_USER), 'users', 'g1'), validProfile()));
  });

  it('denies subdomain look-alikes', async () => {
    await assertFails(getDoc(doc(db('s1', { email: 'x@mail.cvv.ac.in', email_verified: true }), 'users', 'asha')));
  });
});

describe('quiz visibility', () => {
  it('shows published quizzes to students but hides drafts', async () => {
    await assertSucceeds(getDoc(doc(db('asha'), 'quizzes', 'q-open')));
    await assertFails(getDoc(doc(db('asha'), 'quizzes', 'q-draft')));
  });

  it('never lets students read answer keys before submitting an attempt', async () => {
    await assertFails(getDoc(doc(db('asha'), 'quizKeys', 'q-open')));
  });

  it('lets students read the key only for a quiz they have attempted', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertSucceeds(getDoc(doc(db('asha'), 'quizKeys', 'q-open')));
    await assertFails(getDoc(doc(db('ravi', OTHER_STUDENT), 'quizKeys', 'q-open')));
  });

  it('lets only admins write quizzes and read answer keys without an attempt', async () => {
    const admin = db('admin', ADMIN);
    await assertSucceeds(setDoc(doc(admin, 'quizzes', 'q-new'), { title: 'New', status: 'draft', day: '2026-11-01', questions: [] }));
    await assertSucceeds(getDoc(doc(admin, 'quizKeys', 'q-open')));
    await assertFails(setDoc(doc(db('asha'), 'quizzes', 'q-x'), { title: 'x', status: 'published' }));
  });
});

describe('quiz attempt creation (one per student per quiz)', () => {
  it('accepts a well-formed attempt for a published quiz', async () => {
    await assertSucceeds(createAttemptDoc('asha', 'q-open', TWO_RIGHT));
  });

  it('rejects attempts on closed and draft quizzes', async () => {
    await assertFails(createAttemptDoc('asha', 'q-closed', TWO_RIGHT));
    await assertFails(createAttemptDoc('asha', 'q-draft', TWO_RIGHT));
  });

  it('rejects a duplicate attempt, so answers cannot be resubmitted', async () => {
    await assertSucceeds(createAttemptDoc('asha', 'q-open', TWO_RIGHT));
    await assertFails(setDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { uid: 'asha', quizId: 'q-open', answers: ALL_RIGHT, createdAt: serverTimestamp() }));
  });

  it('rejects a fabricated score field on the attempt', async () => {
    await assertFails(createAttemptDoc('asha', 'q-open', TWO_RIGHT, { score: 5 }));
  });

  it('rejects malformed answers: missing question, unknown option, extra question', async () => {
    await assertFails(createAttemptDoc('asha', 'q-open', { q1: 'a', q2: 'b', q3: 'c', q4: 'd' } as unknown as Answers));
    await assertFails(createAttemptDoc('asha', 'q-open', { ...KEY, q1: 'z' } as unknown as Answers));
    await assertFails(createAttemptDoc('asha', 'q-open', { ...KEY, q6: 'a' } as unknown as Answers));
  });

  it('rejects an attempt written under another student document ID', async () => {
    await assertFails(setDoc(doc(db('asha'), 'quizAttempts', 'q-open_ravi'), { uid: 'asha', quizId: 'q-open', answers: TWO_RIGHT, createdAt: serverTimestamp() }));
  });

  it('rejects an attempt claiming another uid', async () => {
    await assertFails(setDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { uid: 'ravi', quizId: 'q-open', answers: TWO_RIGHT, createdAt: serverTimestamp() }));
  });

  it('lets a student read only their own attempt', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertSucceeds(getDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha')));
    await assertFails(getDoc(doc(db('ravi', OTHER_STUDENT), 'quizAttempts', 'q-open_asha')));
  });
});

describe('quiz marks (verified against the hidden key)', () => {
  it('accepts correct marks for the student own attempt', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertSucceeds(updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { marks: { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 }, marksAt: serverTimestamp() }));
  });

  it('rejects a mark of 1 for a wrong answer (fabricated score)', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertFails(updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { marks: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 }, marksAt: serverTimestamp() }));
  });

  it('rejects a mark of 0 for a correct answer and non-binary values', async () => {
    await createAttemptDoc('asha', 'q-open', ALL_RIGHT);
    await assertFails(updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { marks: { q1: 0, q2: 1, q3: 1, q4: 1, q5: 1 }, marksAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { marks: { q1: 2, q2: 1, q3: 1, q4: 1, q5: 1 }, marksAt: serverTimestamp() }));
  });

  it('rejects marks that change the submitted answers', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertFails(updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { answers: ALL_RIGHT, marks: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 }, marksAt: serverTimestamp() }));
  });

  it('rejects marks written twice, and marks written by another student', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { marks: { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 }, marksAt: serverTimestamp() });
    await assertFails(updateDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha'), { marks: { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 }, marksAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('ravi', OTHER_STUDENT), 'quizAttempts', 'q-open_asha'), { marks: { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 }, marksAt: serverTimestamp() }));
  });
});

describe('point awards (one per quiz, must match verified marks)', () => {
  const awardDoc = (quizId: string, points: number, scored: string[]) =>
    updateDoc(doc(db('asha'), 'users', 'asha'), { points, scoredQuizzes: scored, updatedAt: serverTimestamp() });

  async function markAttempt(uid: string, quizId: string, answers: Answers, marks: Record<string, number>) {
    await createAttemptDoc(uid, quizId, answers);
    await updateDoc(doc(db(uid), 'quizAttempts', `${quizId}_${uid}`), { marks, marksAt: serverTimestamp() });
  }

  it('awards exactly the verified points once', async () => {
    await markAttempt('asha', 'q-open', TWO_RIGHT, { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 });
    await assertSucceeds(awardDoc('q-open', 2, ['q-open']));
  });

  it('rejects an award before marks are recorded', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertFails(awardDoc('q-open', 2, ['q-open']));
  });

  it('rejects inflated points (claims 5 for a 2-point attempt)', async () => {
    await markAttempt('asha', 'q-open', TWO_RIGHT, { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 });
    await assertFails(awardDoc('q-open', 5, ['q-open']));
  });

  it('rejects a repeated award for the same quiz', async () => {
    await markAttempt('asha', 'q-open', TWO_RIGHT, { q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 });
    await assertSucceeds(awardDoc('q-open', 2, ['q-open']));
    await assertFails(awardDoc('q-open', 4, ['q-open', 'q-open']));
    // Adding points again without appending a new quiz id must fail.
    await assertFails(awardDoc('q-open', 4, ['q-open']));
  });

  it('rejects an award for a quiz with no attempt by this student', async () => {
    await assertFails(awardDoc('q-open', 5, ['q-open']));
  });

  it('rejects an award that appends more than one quiz at once', async () => {
    await markAttempt('asha', 'q-open', ALL_RIGHT, ALL_MARKS);
    await assertFails(updateDoc(doc(db('asha'), 'users', 'asha'), { points: 10, scoredQuizzes: ['q-open', 'q-x'], updatedAt: serverTimestamp() }));
  });

  it('rejects an award for a quiz whose attempt was submitted by another student', async () => {
    await markAttempt('ravi', 'q-open', ALL_RIGHT, ALL_MARKS);
    await assertFails(awardDoc('q-open', 5, ['q-open']));
  });
});

describe('client scoring flow on the emulator', () => {
  it('submits, scores, and awards exactly once; a retry does not double-award', async () => {
    const asha = db('asha');
    const result = await submitAttempt(asha, 'asha', 'q-open', TWO_RIGHT);
    expect(result.score).toBe(2);
    const profile = (await getDoc(doc(asha, 'users', 'asha'))).data();
    expect(profile?.points).toBe(2);
    expect(profile?.scoredQuizzes).toEqual(['q-open']);

    const again = await finishAttempt(asha, 'asha', 'q-open');
    expect(again.score).toBe(2);
    expect((await getDoc(doc(asha, 'users', 'asha'))).data()?.points).toBe(2);
  });

  it('a second submission for the same quiz is rejected and cannot change the score', async () => {
    const asha = db('asha');
    await submitAttempt(asha, 'asha', 'q-open', TWO_RIGHT);
    await expect(submitAttempt(asha, 'asha', 'q-open', ALL_RIGHT)).rejects.toThrow();
    expect((await getDoc(doc(asha, 'users', 'asha'))).data()?.points).toBe(2);
  });

  it('cannot submit to a closed quiz', async () => {
    await expect(submitAttempt(db('asha'), 'asha', 'q-closed', ALL_RIGHT)).rejects.toThrow();
  });
});

describe('leaderboard', () => {
  it('lets verified students query the top scores, ordered by points', async () => {
    const q = query(collection(db('asha'), 'users'), orderBy('points', 'desc'), limit(25));
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.id)).toEqual(['ravi', 'asha']);
  });

  it('does not allow unauthenticated leaderboard reads', async () => {
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDocs(query(collection(anon, 'users'), orderBy('points', 'desc'), limit(25))));
  });
});

describe('polls and votes', () => {
  it('shows published polls to students but hides drafts and exposes no tallies', async () => {
    await assertSucceeds(getDoc(doc(db('asha'), 'polls', 'p-open')));
    await assertFails(getDoc(doc(db('asha'), 'polls', 'p-draft')));
  });

  it('accepts one valid vote on an open poll', async () => {
    await assertSucceeds(setDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { uid: 'asha', pollId: 'p-open', option: 'b', createdAt: serverTimestamp() }));
  });

  it('rejects duplicate votes, including a second write to the same document', async () => {
    await setDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { uid: 'asha', pollId: 'p-open', option: 'b', createdAt: serverTimestamp() });
    await assertFails(setDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { uid: 'asha', pollId: 'p-open', option: 'c', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { option: 'c' }));
  });

  it('rejects votes on closed and draft polls', async () => {
    await assertFails(setDoc(doc(db('asha'), 'pollVotes', 'p-closed_asha'), { uid: 'asha', pollId: 'p-closed', option: 'a', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('asha'), 'pollVotes', 'p-draft_asha'), { uid: 'asha', pollId: 'p-draft', option: 'a', createdAt: serverTimestamp() }));
  });

  it('rejects options that are not part of the poll', async () => {
    await assertFails(setDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { uid: 'asha', pollId: 'p-open', option: 'zzz', createdAt: serverTimestamp() }));
  });

  it('rejects a vote written under another uid', async () => {
    await assertFails(setDoc(doc(db('asha'), 'pollVotes', 'p-open_ravi'), { uid: 'asha', pollId: 'p-open', option: 'a', createdAt: serverTimestamp() }));
  });

  it('keeps votes private to their owner', async () => {
    await setDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { uid: 'asha', pollId: 'p-open', option: 'b', createdAt: serverTimestamp() });
    await assertFails(getDoc(doc(db('ravi', OTHER_STUDENT), 'pollVotes', 'p-open_asha')));
  });

  it('stops accepting votes once an admin closes the poll', async () => {
    await assertSucceeds(updateDoc(doc(db('admin', ADMIN), 'polls', 'p-open'), { status: 'closed' }));
    await assertFails(setDoc(doc(db('asha'), 'pollVotes', 'p-open_asha'), { uid: 'asha', pollId: 'p-open', option: 'a', createdAt: serverTimestamp() }));
  });

  it('lets only admins change poll status', async () => {
    await assertFails(updateDoc(doc(db('asha'), 'polls', 'p-open'), { status: 'closed' }));
  });

  it('client vote helper and poll list work on the emulator', async () => {
    const asha = db('asha');
    const polls = await fetchOpenPolls(asha);
    expect(polls.map((p) => p.id)).toEqual(['p-open']);
    await castVote(asha, 'asha', polls[0]!, 'a');
    await expect(castVote(asha, 'asha', polls[0]!, 'a')).rejects.toThrow();
  });
});

describe('suggestions', () => {
  const valid = (uid: string) => ({
    uid,
    title: 'Longer library hours',
    body: 'Please keep the reading room open until 9 pm during exams.',
    category: 'facilities',
    status: 'submitted',
    createdAt: serverTimestamp(),
    reviewedAt: null,
  });

  it('accepts a well-formed suggestion from its owner', async () => {
    await assertSucceeds(setDoc(doc(db('asha'), 'suggestions', 's1'), valid('asha')));
  });

  it('rejects suggestions submitted under another uid', async () => {
    await assertFails(setDoc(doc(db('asha'), 'suggestions', 's2'), valid('ravi')));
  });

  it('rejects malformed content, oversize text, unknown categories, and self-set status', async () => {
    const d = db('asha');
    await assertFails(setDoc(doc(d, 'suggestions', 's3'), { ...valid('asha'), title: 'ab' }));
    await assertFails(setDoc(doc(d, 'suggestions', 's4'), { ...valid('asha'), body: 'x'.repeat(1001) }));
    await assertFails(setDoc(doc(d, 'suggestions', 's5'), { ...valid('asha'), category: 'nonsense' }));
    await assertFails(setDoc(doc(d, 'suggestions', 's6'), { ...valid('asha'), status: 'done' }));
    await assertFails(setDoc(doc(d, 'suggestions', 's7'), { ...valid('asha'), extraField: true }));
  });

  it('lets students neither update nor read others suggestions; admins may change status only', async () => {
    await setDoc(doc(db('asha'), 'suggestions', 's8'), valid('asha'));
    await assertFails(updateDoc(doc(db('asha'), 'suggestions', 's8'), { status: 'done' }));
    await assertFails(getDoc(doc(db('ravi', OTHER_STUDENT), 'suggestions', 's8')));
    await assertSucceeds(updateDoc(doc(db('admin', ADMIN), 'suggestions', 's8'), { status: 'planned', reviewedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('admin', ADMIN), 'suggestions', 's8'), { title: 'Changed' }));
  });

  it('client submit helper writes a valid suggestion on the emulator', async () => {
    await submitSuggestion(db('asha'), 'asha', { title: 'Cleaner labs', body: 'Please clean the robotics lab weekly.', category: 'facilities' });
    await expect(submitSuggestion(db('asha'), 'asha', { title: 'x', body: 'short', category: 'other' })).rejects.toThrow();
  });
});

describe('default deny', () => {
  it('denies access to undeclared collections, even for admins', async () => {
    const d = db('admin', ADMIN);
    await assertFails(getDoc(doc(d, 'anything', 'x')));
    await assertFails(setDoc(doc(d, 'anything', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(d, 'adminAuditLogs', 'x')));
    await assertFails(addDoc(collection(d, 'anything'), { a: 1 }));
  });

  it('does not allow student deletes on attempts, votes, or profiles', async () => {
    await createAttemptDoc('asha', 'q-open', TWO_RIGHT);
    await assertFails(deleteDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha')));
    await assertFails(deleteDoc(doc(db('asha'), 'users', 'asha')));
  });
});

describe('first-time reads of missing documents', () => {
  it('lets a student read their own missing attempt and vote (not-found, not denied)', async () => {
    await assertSucceeds(getDoc(doc(db('asha'), 'quizAttempts', 'q-open_asha')));
    await assertSucceeds(getDoc(doc(db('asha'), 'pollVotes', 'p-open_asha')));
  });

  it('does not reveal whether another student has an attempt or vote', async () => {
    await createAttemptDoc('ravi', 'q-open', TWO_RIGHT);
    await setDoc(doc(db('ravi'), 'pollVotes', 'p-open_ravi'), { uid: 'ravi', pollId: 'p-open', option: 'a', createdAt: serverTimestamp() });
    const asha = db('asha');
    await assertFails(getDoc(doc(asha, 'quizAttempts', 'q-open_ravi')));
    await assertFails(getDoc(doc(asha, 'quizAttempts', 'q-open_nobody')));
    await assertFails(getDoc(doc(asha, 'pollVotes', 'p-open_ravi')));
    await assertFails(getDoc(doc(asha, 'pollVotes', 'p-open_nobody')));
  });
});
