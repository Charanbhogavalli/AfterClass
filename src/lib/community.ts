import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

// ---- Polls --------------------------------------------------------------------------------

export interface OpenPoll {
  id: string;
  question: string;
  options: string[];
}

/** Lists published polls only. Results are not published; see firestore.rules. */
export async function fetchOpenPolls(db: Firestore): Promise<OpenPoll[]> {
  const snap = await getDocs(
    query(collection(db, 'polls'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(10)),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const options = Array.isArray(data.options) ? data.options.map(String) : [];
    return { id: d.id, question: String(data.question ?? ''), options };
  });
}

export async function fetchMyVote(db: Firestore, uid: string, pollId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'pollVotes', `${pollId}_${uid}`));
  return snap.exists() ? String(snap.data().option) : null;
}

/** One vote per student per poll: the document ID is deterministic and create-only in the rules. */
export async function castVote(db: Firestore, uid: string, poll: OpenPoll, option: string): Promise<void> {
  if (!poll.options.includes(option)) throw new Error('That option is not part of this poll.');
  await setDoc(doc(db, 'pollVotes', `${poll.id}_${uid}`), {
    uid,
    pollId: poll.id,
    option,
    createdAt: serverTimestamp(),
  });
}

// ---- Suggestions --------------------------------------------------------------------------

export const SUGGESTION_CATEGORIES = ['academics', 'facilities', 'events', 'other'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export interface SuggestionInput {
  title: string;
  body: string;
  category: SuggestionCategory;
}

/** Mirrors the limits in firestore.rules. Client validation is for feedback only. */
export function validateSuggestion(input: SuggestionInput): string | null {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 120) return 'Title must be 3 to 120 characters.';
  if (body.length < 10 || body.length > 1000) return 'Details must be 10 to 1000 characters.';
  if (!(SUGGESTION_CATEGORIES as readonly string[]).includes(input.category)) return 'Choose a category.';
  return null;
}

export interface MySuggestion {
  id: string;
  title: string;
  status: string;
  createdAtMillis: number;
}

export async function submitSuggestion(db: Firestore, uid: string, input: SuggestionInput): Promise<void> {
  const error = validateSuggestion(input);
  if (error) throw new Error(error);
  await addDoc(collection(db, 'suggestions'), {
    uid,
    title: input.title.trim(),
    body: input.body.trim(),
    category: input.category,
    status: 'submitted',
    createdAt: serverTimestamp(),
    reviewedAt: null,
  });
}

/** Only the owner's suggestions. Sorted in the client because the query filters on uid. */
export async function fetchMySuggestions(db: Firestore, uid: string): Promise<MySuggestion[]> {
  const snap = await getDocs(query(collection(db, 'suggestions'), where('uid', '==', uid), limit(50)));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const created = data.createdAt as { toMillis?: () => number } | null;
      return {
        id: d.id,
        title: String(data.title ?? ''),
        status: String(data.status ?? 'submitted'),
        createdAtMillis: created?.toMillis?.() ?? Date.now(),
      };
    })
    .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
}

// ---- Leaderboard --------------------------------------------------------------------------

export interface LeaderboardRow {
  rank: number;
  uid: string;
  displayName: string;
  points: number;
}

export const LEADERBOARD_PAGE_SIZE = 25;

/**
 * Top scores only. Ties break on document ID. Both fields use the same direction so Firestore's built-in
 * single-field index serves the query without a composite index (mixed directions would need one).
 * Points are written only through rule-verified quiz awards; the browser cannot set them.
 */
export async function fetchLeaderboard(db: Firestore): Promise<LeaderboardRow[]> {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      orderBy('points', 'desc'),
      orderBy(documentId(), 'desc'),
      limit(LEADERBOARD_PAGE_SIZE),
    ),
  );
  return snap.docs.map((d, index) => ({
    rank: index + 1,
    uid: d.id,
    displayName: String(d.data().displayName ?? 'Student'),
    points: Number(d.data().points ?? 0),
  }));
}
