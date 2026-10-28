import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { CHOICES, QUESTION_IDS, type Choice, type QuestionId } from './quiz';
import { friendlyError } from './errors';
import {
  POLL_TRANSITIONS,
  QUIZ_STATUSES,
  QUIZ_TRANSITIONS,
  POLL_STATUSES,
  canTransition,
  isSuggestionStatus,
  trimQuiz,
  validatePollInput,
  validateQuizInput,
  type AdminPollInput,
  type AdminQuizInput,
  type AdminQuestion,
  type PollStatus,
  type QuizStatus,
  type SuggestionStatus,
} from './adminValidation';

// Every function here relies on firestore.rules: reads and writes succeed only for the administrator
// identity defined by isAdmin(). The UI checks are for clarity only and can always be bypassed.

const QUIZ_LIST_LIMIT = 60;
const POLL_LIST_LIMIT = 50;
const SUGGESTION_LIST_LIMIT = 100;

export interface AdminCounts {
  students: number;
  quizzesTotal: number;
  quizzesPublished: number;
  pollsTotal: number;
  pollsPublished: number;
  suggestionsTotal: number;
  suggestionsAwaitingReview: number;
}

export interface AdminQuizRow {
  day: string;
  title: string;
  status: QuizStatus;
  questionCount: number;
}

export interface AdminQuizDetail {
  status: QuizStatus;
  input: AdminQuizInput;
}

export interface AdminPollRow {
  id: string;
  question: string;
  options: string[];
  status: PollStatus;
  createdAtMillis: number | null;
}

export interface AdminSuggestionRow {
  id: string;
  title: string;
  body: string;
  category: string;
  status: SuggestionStatus;
  createdAtMillis: number | null;
}

/** Validation and state refusals (AdminRefusal) carry no private data, so their text is shown as-is. */
class AdminRefusal extends Error {}

export function adminErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AdminRefusal) return err.message;
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'permission-denied') return 'Your account does not have admin access for this action.';
  return friendlyError(err, fallback);
}

function countOf(db: Firestore, path: string, constraint?: ReturnType<typeof where>) {
  const base = collection(db, path);
  const q = constraint ? query(base, constraint) : base;
  return getCountFromServer(q).then((snap) => snap.data().count);
}

export async function fetchAdminCounts(db: Firestore): Promise<AdminCounts> {
  const [students, quizzesTotal, quizzesPublished, pollsTotal, pollsPublished, suggestionsTotal, suggestionsAwaitingReview] =
    await Promise.all([
      countOf(db, 'users'),
      countOf(db, 'quizzes'),
      countOf(db, 'quizzes', where('status', '==', 'published')),
      countOf(db, 'polls'),
      countOf(db, 'polls', where('status', '==', 'published')),
      countOf(db, 'suggestions'),
      countOf(db, 'suggestions', where('status', '==', 'submitted')),
    ]);
  return { students, quizzesTotal, quizzesPublished, pollsTotal, pollsPublished, suggestionsTotal, suggestionsAwaitingReview };
}

// ---- Quizzes ------------------------------------------------------------------------------

function millis(value: unknown): number | null {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return ts?.toMillis?.() ?? null;
}

function asQuizStatus(value: unknown, day: string): QuizStatus {
  if (typeof value === 'string' && (QUIZ_STATUSES as readonly string[]).includes(value)) return value as QuizStatus;
  throw new AdminRefusal(`Quiz ${day} has an unknown status.`);
}

/** Rebuilds the editable form model from quizzes/{day} and quizKeys/{day}. Malformed data is an error. */
function quizFromDocs(day: string, quiz: DocumentData, key: DocumentData | undefined): AdminQuizDetail {
  const status = asQuizStatus(quiz.status, day);
  const answers = key?.answers as Record<string, unknown> | undefined;
  const explanations = key?.explanations as Record<string, unknown> | undefined;
  const rawQuestions = Array.isArray(quiz.questions) ? quiz.questions : [];

  const questions: AdminQuestion[] = rawQuestions.map((raw: DocumentData, index) => {
    const id = QUESTION_IDS[index] as QuestionId;
    const options = raw.options as Record<string, unknown> | undefined;
    return {
      id: String(raw.id) as QuestionId,
      text: String(raw.text ?? ''),
      options: Object.fromEntries(CHOICES.map((c) => [c, String(options?.[c] ?? '')])) as Record<Choice, string>,
      answer: CHOICES.find((c) => c === answers?.[id]) ?? '',
      explanation: String(explanations?.[id] ?? ''),
    };
  });

  const input: AdminQuizInput = { day, title: String(quiz.title ?? ''), questions };
  const problems = validateQuizInput(input);
  if (problems.length > 0) throw new AdminRefusal(`Quiz ${day} is malformed: ${problems[0]}`);
  return { status, input: trimQuiz(input) };
}

export async function fetchAdminQuizzes(db: Firestore): Promise<AdminQuizRow[]> {
  const snap = await getDocs(query(collection(db, 'quizzes'), orderBy('day', 'desc'), limit(QUIZ_LIST_LIMIT)));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      day: d.id,
      title: String(data.title ?? ''),
      status: asQuizStatus(data.status, d.id),
      questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
    };
  });
}

export async function fetchAdminQuiz(db: Firestore, day: string): Promise<AdminQuizDetail | null> {
  const quizSnap = await getDoc(doc(db, 'quizzes', day));
  if (!quizSnap.exists()) return null;
  const keySnap = await getDoc(doc(db, 'quizKeys', day));
  return quizFromDocs(day, quizSnap.data(), keySnap.data());
}

function quizPayload(input: AdminQuizInput) {
  const trimmed = trimQuiz(input);
  return {
    title: trimmed.title,
    day: trimmed.day,
    questions: trimmed.questions.map((q) => ({ id: q.id, text: q.text, options: q.options })),
  };
}

function keyPayload(input: AdminQuizInput) {
  const trimmed = trimQuiz(input);
  return {
    answers: Object.fromEntries(trimmed.questions.map((q) => [q.id, q.answer])),
    explanations: Object.fromEntries(trimmed.questions.map((q) => [q.id, q.explanation])),
  };
}

function assertValidQuiz(input: AdminQuizInput): void {
  const problems = validateQuizInput(input);
  if (problems.length > 0) throw new AdminRefusal(problems[0]);
}

/** Creates a new draft. The quiz and its answer key are written together, so publishing never finds a missing key. */
export async function createQuizDraft(db: Firestore, input: AdminQuizInput): Promise<void> {
  assertValidQuiz(input);
  const trimmed = trimQuiz(input);
  await runTransaction(db, async (tx: Transaction) => {
    const quizRef = doc(db, 'quizzes', trimmed.day);
    if ((await tx.get(quizRef)).exists()) throw new AdminRefusal('A quiz already exists for that date.');
    tx.set(quizRef, { ...quizPayload(trimmed), status: 'draft', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(doc(db, 'quizKeys', trimmed.day), keyPayload(trimmed));
  });
}

/** Edits a draft only. Published and closed quizzes are read-only in the UI and refused here. */
export async function updateQuizDraft(db: Firestore, input: AdminQuizInput): Promise<void> {
  assertValidQuiz(input);
  const trimmed = trimQuiz(input);
  await runTransaction(db, async (tx: Transaction) => {
    const quizRef = doc(db, 'quizzes', trimmed.day);
    const snap = await tx.get(quizRef);
    if (!snap.exists()) throw new AdminRefusal('This quiz no longer exists.');
    if (snap.data().status !== 'draft') throw new AdminRefusal('Only draft quizzes can be edited.');
    tx.update(quizRef, { ...quizPayload(trimmed), updatedAt: serverTimestamp() });
    tx.set(doc(db, 'quizKeys', trimmed.day), keyPayload(trimmed));
  });
}

/** Publishes or closes a quiz. Publishing re-validates the stored quiz and key inside the transaction. */
export async function changeQuizStatus(db: Firestore, day: string, to: QuizStatus): Promise<void> {
  await runTransaction(db, async (tx: Transaction) => {
    const quizRef = doc(db, 'quizzes', day);
    const snap = await tx.get(quizRef);
    if (!snap.exists()) throw new AdminRefusal('This quiz no longer exists.');
    const from = asQuizStatus(snap.data().status, day);
    if (!canTransition(QUIZ_TRANSITIONS, from, to)) throw new AdminRefusal(`A ${from} quiz cannot be changed to ${to}.`);

    if (to === 'published') {
      const keySnap = await tx.get(doc(db, 'quizKeys', day));
      if (!keySnap.exists()) throw new AdminRefusal('This quiz has no answer key, so it cannot be published.');
      quizFromDocs(day, snap.data(), keySnap.data());
      tx.update(quizRef, { status: 'published', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      tx.update(quizRef, { status: 'closed', closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  });
}

// ---- Polls --------------------------------------------------------------------------------

function asPollStatus(value: unknown): PollStatus {
  if (typeof value === 'string' && (POLL_STATUSES as readonly string[]).includes(value)) return value as PollStatus;
  throw new AdminRefusal('A poll has an unknown status.');
}

export async function fetchAdminPolls(db: Firestore): Promise<AdminPollRow[]> {
  const snap = await getDocs(query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(POLL_LIST_LIMIT)));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      question: String(data.question ?? ''),
      options: Array.isArray(data.options) ? data.options.map(String) : [],
      status: asPollStatus(data.status),
      createdAtMillis: millis(data.createdAt),
    };
  });
}

/** Creates a poll as a draft, or edits an existing draft. Published polls cannot change options. */
export async function savePollDraft(db: Firestore, input: AdminPollInput, pollId?: string): Promise<string> {
  const problems = validatePollInput(input);
  if (problems.length > 0) throw new AdminRefusal(problems[0]);
  const payload = { question: input.question.trim(), options: input.options.map((o) => o.trim()) };

  if (!pollId) {
    const ref = await addDoc(collection(db, 'polls'), {
      ...payload,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  await runTransaction(db, async (tx: Transaction) => {
    const ref = doc(db, 'polls', pollId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new AdminRefusal('This poll no longer exists.');
    if (snap.data().status !== 'draft') throw new AdminRefusal('Only draft polls can be edited.');
    tx.update(ref, { ...payload, updatedAt: serverTimestamp() });
  });
  return pollId;
}

/** Publishes or closes a poll. Publishing re-validates the stored options inside the transaction. */
export async function changePollStatus(db: Firestore, pollId: string, to: PollStatus): Promise<void> {
  await runTransaction(db, async (tx: Transaction) => {
    const ref = doc(db, 'polls', pollId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new AdminRefusal('This poll no longer exists.');
    const from = asPollStatus(snap.data().status);
    if (!canTransition(POLL_TRANSITIONS, from, to)) throw new AdminRefusal(`A ${from} poll cannot be changed to ${to}.`);

    if (to === 'published') {
      const data = snap.data();
      const problems = validatePollInput({ question: String(data.question ?? ''), options: Array.isArray(data.options) ? data.options.map(String) : [] });
      if (problems.length > 0) throw new AdminRefusal(problems[0]);
      tx.update(ref, { status: 'published', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      tx.update(ref, { status: 'closed', closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  });
}

// ---- Suggestions --------------------------------------------------------------------------

/** Admins see every submission. The student's UID is deliberately not mapped into the view model. */
export async function fetchAdminSuggestions(db: Firestore): Promise<AdminSuggestionRow[]> {
  const snap = await getDocs(query(collection(db, 'suggestions'), orderBy('createdAt', 'desc'), limit(SUGGESTION_LIST_LIMIT)));
  return snap.docs.map((d) => {
    const data = d.data();
    const status = String(data.status ?? '');
    if (!isSuggestionStatus(status)) throw new AdminRefusal('A suggestion has an unknown status.');
    return {
      id: d.id,
      title: String(data.title ?? ''),
      body: String(data.body ?? ''),
      category: String(data.category ?? ''),
      status,
      createdAtMillis: millis(data.createdAt),
    };
  });
}

/** Only the status and reviewedAt fields may change. firestore.rules refuses every other field. */
export async function updateSuggestionStatus(db: Firestore, suggestionId: string, status: SuggestionStatus): Promise<void> {
  if (!isSuggestionStatus(status)) throw new AdminRefusal('Choose a valid status.');
  await updateDoc(doc(db, 'suggestions', suggestionId), { status, reviewedAt: serverTimestamp() });
}

export { AdminRefusal };
