import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

// Fixed quiz format: five single-choice questions. firestore.rules enforces the same shape.
export const QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];
export const CHOICES = ['a', 'b', 'c', 'd'] as const;
export type Choice = (typeof CHOICES)[number];
export type Answers = Record<QuestionId, Choice>;
export type Marks = Record<QuestionId, 0 | 1>;

export interface QuizQuestion {
  id: QuestionId;
  text: string;
  options: Record<Choice, string>;
}

export interface PublishedQuiz {
  id: string;
  title: string;
  day: string;
  questions: QuizQuestion[];
}

export interface QuizKey {
  answers: Answers;
  explanations: Record<QuestionId, string>;
}

export interface QuizResult {
  quizId: string;
  answers: Answers;
  marks: Marks;
  score: number;
  key: QuizKey;
}

/** Marks are computed from the hidden key only inside the browser to produce a claim that rules verify. */
export function computeMarks(answers: Answers, key: Answers): Marks {
  return Object.fromEntries(QUESTION_IDS.map((id) => [id, answers[id] === key[id] ? 1 : 0])) as Marks;
}

export function scoreOf(marks: Marks): number {
  return QUESTION_IDS.reduce((sum, id) => sum + marks[id], 0);
}

export function attemptIdFor(quizId: string, uid: string): string {
  return `${quizId}_${uid}`;
}

function isChoice(v: unknown): v is Choice {
  return typeof v === 'string' && (CHOICES as readonly string[]).includes(v);
}

function parseAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const out = {} as Answers;
  for (const id of QUESTION_IDS) {
    if (!isChoice(record[id])) return null;
    out[id] = record[id];
  }
  return out;
}

function parseMarks(raw: unknown): Marks | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const out = {} as Marks;
  for (const id of QUESTION_IDS) {
    if (record[id] !== 0 && record[id] !== 1) return null;
    out[id] = record[id];
  }
  return out;
}

function parseQuestions(raw: unknown): QuizQuestion[] | null {
  if (!Array.isArray(raw) || raw.length !== QUESTION_IDS.length) return null;
  const questions: QuizQuestion[] = [];
  for (const [index, item] of raw.entries()) {
    const expectedId = QUESTION_IDS[index];
    if (!expectedId || !item || typeof item !== 'object' || item.id !== expectedId) return null;
    const options = item.options as Record<string, unknown> | undefined;
    if (typeof item.text !== 'string' || !options || !CHOICES.every((c) => typeof options[c] === 'string')) return null;
    questions.push({
      id: expectedId,
      text: item.text,
      options: Object.fromEntries(CHOICES.map((c) => [c, String(options[c])])) as Record<Choice, string>,
    });
  }
  return questions;
}

function parseKey(raw: unknown): QuizKey | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as { answers?: unknown; explanations?: Record<string, unknown> };
  const answers = parseAnswers(record.answers);
  if (!answers || !record.explanations) return null;
  return {
    answers,
    explanations: Object.fromEntries(QUESTION_IDS.map((id) => [id, String(record.explanations?.[id] ?? '')])) as Record<
      QuestionId,
      string
    >,
  };
}

/**
 * Loads the newest published quiz. Returns null only when no published quiz exists (an empty result).
 * A published quiz with malformed questions throws, so it is reported as an error rather than hidden.
 */
export async function fetchLatestQuiz(db: Firestore): Promise<PublishedQuiz | null> {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('status', '==', 'published'), orderBy('day', 'desc'), limit(1)),
  );
  const first = snap.docs[0];
  if (!first) return null;
  const data = first.data();
  const questions = parseQuestions(data.questions);
  if (!questions) throw new Error('Published quiz is malformed.');
  return { id: first.id, title: String(data.title ?? ''), day: String(data.day ?? ''), questions };
}

async function getAttempt(db: Firestore, uid: string, quizId: string) {
  const snap = await getDoc(doc(db, 'quizAttempts', attemptIdFor(quizId, uid)));
  if (!snap.exists()) return null;
  const answers = parseAnswers(snap.data().answers);
  if (!answers) throw new Error('Stored attempt is malformed.');
  return { answers, marks: parseMarks(snap.data().marks) };
}

/** Returns true if the student has already submitted an attempt for this quiz. */
export async function hasAttempt(db: Firestore, uid: string, quizId: string): Promise<boolean> {
  return (await getAttempt(db, uid, quizId)) !== null;
}

/**
 * Step 1 of submission: create the attempt with answers only. The key is not yet readable.
 * Duplicate attempts fail in the rules, so a second submit cannot change the answers.
 */
async function createAttempt(db: Firestore, uid: string, quizId: string, answers: Answers): Promise<void> {
  await setDoc(doc(db, 'quizAttempts', attemptIdFor(quizId, uid)), {
    uid,
    quizId,
    answers,
    createdAt: serverTimestamp(),
  });
}

/**
 * Steps 2–4, safe to repeat after a failed network call: read the key, write marks if missing,
 * then award points if this quiz is not yet in scoredQuizzes. Rules reject any inconsistent claim.
 */
export async function finishAttempt(db: Firestore, uid: string, quizId: string): Promise<QuizResult> {
  const attemptRef = doc(db, 'quizAttempts', attemptIdFor(quizId, uid));
  const attempt = await getAttempt(db, uid, quizId);
  if (!attempt) throw new Error('No attempt has been submitted for this quiz.');

  const keySnap = await getDoc(doc(db, 'quizKeys', quizId));
  const key = parseKey(keySnap.data());
  if (!key) throw new Error('Answer key is unavailable for this quiz.');

  let marks = attempt.marks;
  if (!marks) {
    marks = computeMarks(attempt.answers, key.answers);
    await updateDoc(attemptRef, { marks, marksAt: serverTimestamp() });
  }

  await awardPoints(db, uid, quizId);
  return { quizId, answers: attempt.answers, marks, score: scoreOf(marks), key };
}

async function awardPoints(db: Firestore, uid: string, quizId: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const profile = (await getDoc(userRef)).data();
  if (!profile) throw new Error('Profile not found.');

  const scored = Array.isArray(profile.scoredQuizzes) ? profile.scoredQuizzes.map(String) : [];
  if (scored.includes(quizId)) return; // already awarded; nothing to do

  const attempt = await getAttempt(db, uid, quizId);
  if (!attempt?.marks) throw new Error('Marks have not been recorded yet.');

  await updateDoc(userRef, {
    points: Number(profile.points ?? 0) + scoreOf(attempt.marks),
    scoredQuizzes: [...scored, quizId],
    updatedAt: serverTimestamp(),
  });
}

/** Full submission: create the attempt, then finish marks and award points. */
export async function submitAttempt(db: Firestore, uid: string, quizId: string, answers: Answers): Promise<QuizResult> {
  await createAttempt(db, uid, quizId, answers);
  return finishAttempt(db, uid, quizId);
}
