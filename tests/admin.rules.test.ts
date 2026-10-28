import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

// Admin-side rules. Runs on the Firestore emulator only (npm run test:rules). Uses its own project ID
// so it cannot clash with the quiz and community rules suite running in parallel.
const STUDENT = { email: 'asha.rao@cvv.ac.in', email_verified: true };
const OTHER_STUDENT = { email: 'ravi@cvv.ac.in', email_verified: true };
// The sole administrator is identified by the verified Google account email; no claim is needed or honoured.
const ADMIN = { email: "bhogavalli.cvv241072@cvv.ac.in", email_verified: true };
const OTHER_ADMIN_CLAIM = { email: "ravi@cvv.ac.in", email_verified: true, admin: true }; // verified @cvv.ac.in, claim present
const GMAIL_OWNER = { email: "bhogavalli.cvv241072@gmail.com", email_verified: true };
const UNVERIFIED_OWNER = { email: "bhogavalli.cvv241072@cvv.ac.in", email_verified: false };

const DAY = '2026-10-29';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'afterclass-admin-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const db = (uid: string, claims: Record<string, unknown> = STUDENT): Firestore =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

const quizBody = (status: string) => ({
  title: 'Space basics',
  day: DAY,
  status,
  questions: ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => ({
    id,
    text: `Question ${id}`,
    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
  })),
});

const keyBody = { answers: { q1: 'a', q2: 'a', q3: 'a', q4: 'a', q5: 'a' }, explanations: { q1: 'x', q2: 'x', q3: 'x', q4: 'x', q5: 'x' } };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const now = new Date();
    await setDoc(doc(d, 'users', 'asha'), { displayName: 'Asha', photoURL: null, points: 0, streak: 0, scoredQuizzes: [], createdAt: now, updatedAt: now });
    await setDoc(doc(d, 'users', 'ravi'), { displayName: 'Ravi', photoURL: null, points: 0, streak: 0, scoredQuizzes: [], createdAt: now, updatedAt: now });
    await setDoc(doc(d, 'quizzes', 'existing-draft'), quizBody('draft'));
    await setDoc(doc(d, 'quizzes', 'existing-draft-day'), { ...quizBody('draft'), day: '2026-10-30' });
    await setDoc(doc(d, 'quizKeys', 'existing-draft-day'), keyBody);
    await setDoc(doc(d, 'quizzes', 'existing-draft'), { ...quizBody('draft'), day: '2026-10-27' });
    await setDoc(doc(d, 'quizKeys', 'existing-draft'), keyBody);
    await setDoc(doc(d, 'quizzes', 'pub-quiz'), { ...quizBody('published'), day: '2026-10-25' });
    await setDoc(doc(d, 'quizKeys', 'pub-quiz'), keyBody);
    await setDoc(doc(d, 'quizzes', 'closed-quiz'), { ...quizBody('closed'), day: '2026-10-24' });
    await setDoc(doc(d, 'quizKeys', 'closed-quiz'), keyBody);
    await setDoc(doc(d, 'quizzes', 'draft-nokey'), { ...quizBody('draft'), day: '2026-10-23' });
    await setDoc(doc(d, 'polls', 'poll-draft'), { question: 'Draft poll?', options: ['Yes', 'No'], status: 'draft', createdAt: now });
    await setDoc(doc(d, 'polls', 'poll-open'), { question: 'Open poll?', options: ['Yes', 'No'], status: 'published', createdAt: now });
    await setDoc(doc(d, 'suggestions', 'sug-asha'), {
      uid: 'asha',
      title: 'Better Wi-Fi',
      body: 'The library Wi-Fi drops every hour.',
      category: 'facilities',
      status: 'submitted',
      createdAt: now,
      reviewedAt: null,
    });
    await setDoc(doc(d, 'suggestions', 'sug-ravi'), {
      uid: 'ravi',
      title: 'Later canteen hours',
      body: 'Please keep the canteen open after the 5pm lab.',
      category: 'facilities',
      status: 'submitted',
      createdAt: now,
      reviewedAt: null,
    });
  });
});

describe('admin: quiz management', () => {
  it('lets a verified admin create a draft quiz and its key', async () => {
    const admin = db('admin', ADMIN);
    await assertSucceeds(setDoc(doc(admin, 'quizzes', DAY), quizBody('draft')));
    await assertSucceeds(setDoc(doc(admin, 'quizKeys', DAY), keyBody));
  });

  it('refuses quiz and key writes from an ordinary student', async () => {
    const student = db('asha', STUDENT);
    await assertFails(setDoc(doc(student, 'quizzes', DAY), quizBody('draft')));
    await assertFails(setDoc(doc(student, 'quizKeys', DAY), keyBody));
    await assertFails(updateDoc(doc(student, 'quizzes', 'existing-draft'), { status: 'published' }));
  });

  it('refuses admin writes when the account is a personal Gmail address', async () => {
    await assertFails(setDoc(doc(db('admin', GMAIL_OWNER), 'quizzes', DAY), quizBody('draft')));
  });

  it('refuses admin writes when the email is unverified', async () => {
    await assertFails(setDoc(doc(db('admin', UNVERIFIED_OWNER), 'quizzes', DAY), quizBody('draft')));
  });

  it('lets an admin read drafts, but not students', async () => {
    await assertSucceeds(getDoc(doc(db('admin', ADMIN), 'quizzes', 'existing-draft')));
    await assertFails(getDoc(doc(db('asha', STUDENT), 'quizzes', 'existing-draft')));
  });

  it('lets an admin read answer keys directly', async () => {
    await assertSucceeds(getDoc(doc(db('admin', ADMIN), 'quizKeys', 'existing-draft-day')));
  });

  it('lets an admin publish a draft', async () => {
    await assertSucceeds(updateDoc(doc(db('admin', ADMIN), 'quizzes', 'existing-draft'), { status: 'published' }));
  });
});

describe('admin: privilege cannot be self-granted', () => {
  it('refuses a student who writes an admin flag into their own profile', async () => {
    const asha = db('asha', STUDENT);
    await assertFails(updateDoc(doc(asha, 'users', 'asha'), { admin: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asha, 'users', 'asha'), { role: 'admin', updatedAt: serverTimestamp() }));
  });

  it('refuses a student who creates a profile carrying an admin flag', async () => {
    const newcomer = db('new-student', STUDENT);
    await assertFails(
      setDoc(doc(newcomer, 'users', 'new-student'), {
        displayName: 'New',
        photoURL: null,
        points: 0,
        streak: 0,
        scoredQuizzes: [],
        admin: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('does not honour an admin flag stored in a profile document', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'asha'), { admin: true }, { merge: true });
    });
    await assertFails(setDoc(doc(db('asha', STUDENT), 'quizzes', DAY), quizBody('draft')));
  });
});

describe('admin: polls', () => {
  it('lets an admin create a draft poll and publish it', async () => {
    const admin = db('admin', ADMIN);
    const ref = await assertSucceeds(
      addDoc(collection(admin, 'polls'), { question: 'Canteen menu?', options: ['Yes', 'No'], status: 'draft', createdAt: serverTimestamp() }),
    );
    await assertSucceeds(updateDoc(ref, { status: 'published' }));
  });

  it('refuses poll creation from an ordinary student', async () => {
    await assertFails(
      addDoc(collection(db('asha', STUDENT), 'polls'), { question: 'Sneaky?', options: ['Yes', 'No'], status: 'published', createdAt: serverTimestamp() }),
    );
  });

  it('keeps draft polls hidden from students', async () => {
    await assertFails(getDoc(doc(db('asha', STUDENT), 'polls', 'poll-draft')));
    await assertSucceeds(getDoc(doc(db('asha', STUDENT), 'polls', 'poll-open')));
  });

  it('refuses votes on a draft poll', async () => {
    await assertFails(
      setDoc(doc(db('asha', STUDENT), 'pollVotes', 'poll-draft_asha'), {
        uid: 'asha',
        pollId: 'poll-draft',
        option: 'Yes',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('admin: suggestions', () => {
  it('lets an admin read every suggestion', async () => {
    await assertSucceeds(getDocs(collection(db('admin', ADMIN), 'suggestions')));
  });

  it('lets an admin change only the review status', async () => {
    const admin = db('admin', ADMIN);
    await assertSucceeds(updateDoc(doc(admin, 'suggestions', 'sug-asha'), { status: 'planned', reviewedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(admin, 'suggestions', 'sug-ravi'), { status: 'done', reviewedAt: serverTimestamp() }));
  });

  it('refuses an admin edit to the student text', async () => {
    await assertFails(updateDoc(doc(db('admin', ADMIN), 'suggestions', 'sug-asha'), { title: 'Rewritten', status: 'planned', reviewedAt: serverTimestamp() }));
  });

  it('refuses a status outside the allowed set', async () => {
    await assertFails(updateDoc(doc(db('admin', ADMIN), 'suggestions', 'sug-asha'), { status: 'approved', reviewedAt: serverTimestamp() }));
  });

  it('refuses a status change from the student who wrote it', async () => {
    await assertFails(updateDoc(doc(db('asha', STUDENT), 'suggestions', 'sug-asha'), { status: 'done', reviewedAt: serverTimestamp() }));
  });

  it("keeps other students' suggestions private, including from list queries", async () => {
    await assertFails(getDoc(doc(db('asha', STUDENT), 'suggestions', 'sug-ravi')));
    await assertFails(getDocs(collection(db('asha', STUDENT), 'suggestions')));
    await assertSucceeds(getDocs(query(collection(db('ravi', OTHER_STUDENT), 'suggestions'), where('uid', '==', 'ravi'))));
  });
});

describe('admin: only the sole administrator identity is authorized', () => {
  const other = () => db('other-admin', OTHER_ADMIN_CLAIM);

  it('refuses another verified @cvv.ac.in account even when it carries admin: true', async () => {
    await assertFails(setDoc(doc(other(), 'quizzes', DAY), quizBody('draft')));
    await assertFails(setDoc(doc(other(), 'quizKeys', DAY), keyBody));
    await assertFails(getDoc(doc(other(), 'quizzes', 'existing-draft')));
    await assertFails(getDoc(doc(other(), 'quizKeys', 'existing-draft-day')));
    await assertFails(updateDoc(doc(other(), 'quizzes', 'existing-draft'), { status: 'published' }));
  });

  it('refuses another verified @cvv.ac.in account from poll and suggestion admin actions', async () => {
    await assertFails(
      addDoc(collection(other(), 'polls'), { question: 'Sneaky?', options: ['Yes', 'No'], status: 'draft', createdAt: serverTimestamp() }),
    );
    await assertFails(getDoc(doc(other(), 'polls', 'poll-draft')));
    await assertFails(updateDoc(doc(other(), 'suggestions', 'sug-asha'), { status: 'planned', reviewedAt: serverTimestamp() }));
    await assertFails(getDocs(collection(other(), 'suggestions')));
  });

  it('refuses the same administrator address on a non-approved domain, even with the claim', async () => {
    const spoof = db('spoof', { email: 'bhogavalli.cvv241072@cvv.ac.in.example.com', email_verified: true, admin: true });
    await assertFails(setDoc(doc(spoof, 'quizzes', DAY), quizBody('draft')));
  });

  it('keeps the sole administrator able to publish and review', async () => {
    await assertSucceeds(updateDoc(doc(db('admin', ADMIN), 'polls', 'poll-draft'), { status: 'published' }));
    await assertSucceeds(updateDoc(doc(db('admin', ADMIN), 'suggestions', 'sug-ravi'), { status: 'done', reviewedAt: serverTimestamp() }));
  });
});

describe('admin: published content is immutable through direct requests', () => {
  const admin = () => db('admin', ADMIN);
  const changedQuestions = { ...quizBody('published'), questions: [] as unknown[] };

  it('refuses edits to a published quiz (questions, title, day)', async () => {
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'pub-quiz'), { questions: changedQuestions.questions }));
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'pub-quiz'), { title: 'Changed after publishing' }));
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'pub-quiz'), { day: '2026-10-30' }));
  });

  it('refuses edits to the answer key of a published quiz', async () => {
    await assertFails(updateDoc(doc(admin(), 'quizKeys', 'pub-quiz'), { answers: { q1: 'd', q2: 'd', q3: 'd', q4: 'd', q5: 'd' } }));
    await assertFails(setDoc(doc(admin(), 'quizKeys', 'pub-quiz'), keyBody));
  });

  it('refuses edits to a closed quiz and reopening it', async () => {
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'closed-quiz'), { title: 'Changed' }));
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'closed-quiz'), { status: 'published' }));
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'pub-quiz'), { status: 'draft' }));
  });

  it('allows only the published -> closed transition for a published quiz', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'quizzes', 'pub-quiz'), { status: 'closed', closedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('refuses publishing a draft that has no answer key', async () => {
    await assertFails(updateDoc(doc(admin(), 'quizzes', 'draft-nokey'), { status: 'published', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('allows editing a draft, and publishing it once its key exists', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'quizzes', 'existing-draft'), { title: 'Edited draft', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(admin(), 'quizzes', 'existing-draft'), { status: 'published', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('refuses creating a quiz that is already published, or whose day does not match its ID', async () => {
    await assertFails(setDoc(doc(admin(), 'quizzes', 'new-published'), { ...quizBody('published'), day: 'new-published' }));
    await assertFails(setDoc(doc(admin(), 'quizzes', DAY), { ...quizBody('draft'), day: '2026-01-01' }));
  });

  it('refuses deleting any quiz, key, or poll', async () => {
    await assertFails(deleteDoc(doc(admin(), 'quizzes', 'existing-draft')));
    await assertFails(deleteDoc(doc(admin(), 'quizKeys', 'pub-quiz')));
    await assertFails(deleteDoc(doc(admin(), 'polls', 'poll-open')));
  });

  it('refuses changing the options or question of a published poll, but allows closing it', async () => {
    await assertFails(updateDoc(doc(admin(), 'polls', 'poll-open'), { options: ['Yes', 'No', 'Maybe'] }));
    await assertFails(updateDoc(doc(admin(), 'polls', 'poll-open'), { question: 'Changed?' }));
    await assertSucceeds(updateDoc(doc(admin(), 'polls', 'poll-open'), { status: 'closed', closedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
});
