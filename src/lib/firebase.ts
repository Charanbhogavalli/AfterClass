import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** The app runs in a "not configured" state until the required public config is supplied. */
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

/** For feature code that only runs when configured; RequireAuth guards these routes. */
export function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

if (app && import.meta.env.VITE_USE_EMULATORS === 'true') {
  if (auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
