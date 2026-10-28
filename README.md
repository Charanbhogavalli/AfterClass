# AfterClass

*Your campus. Your curiosity.*

AfterClass is a private technology community for students of Chinmaya Vishwa Vidyapeeth (CVV): a daily quiz,
points and streaks, a leaderboard, campus polls and suggestions.

> **Status:** Quiz, leaderboard, polls and suggestions are implemented and their security rules are tested on the
> local emulator (62 rules tests, 9 unit tests). **Not yet tested against a live Firebase project.** Admin tools are
> not built. See [Implementation status](#implementation-status).

## Technology stack

- React 19, TypeScript (strict), Vite 7, React Router 7, Tailwind CSS 4
- Firebase Authentication (Google) and Cloud Firestore (client SDK 12, **Spark plan only**)
- Firebase Emulator Suite, `@firebase/rules-unit-testing`, Vitest
- Vercel for frontend hosting (configuration in `vercel.json`)

## Cost policy

Everything runs at **₹0**:

- Firebase stays on the **Spark (free)** plan. Do not enable Blaze or add a billing card. Cloud Functions require
  Blaze, so the project does not use them.
- Emulators, tests and the build run locally.
- Vercel's Hobby plan is for non-commercial use only. Check Vercel's current terms before deploying.

## Prerequisites

- Node.js 20 or newer (tested with Node 22.18)
- Java 11 or newer, for the Firestore emulator (tested with Java 25)
- For live sign-in: a Google account on the `cvv.ac.in` Google Workspace

## Install and run

```bash
npm install
npm run dev              # app at http://localhost:5173
```

Without Firebase settings the app runs and shows "Sign-in is not configured".

### Scripts

| Command | What it does | Needs |
|---|---|---|
| `npm run typecheck` | TypeScript strict check of `src/` and `tests/` | — |
| `npm test` | Unit tests: domain policy, display names, quiz marking | — |
| `npm run test:rules` | Starts the Firestore emulator, runs 62 rules and client-flow tests, then stops it | Java |
| `npm run build` | Type check, then production build into `dist/` | — |
| `npm run emulators` | Starts Auth (9099), Firestore (8080) and the emulator UI (4000) for manual testing | Java |

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored) and fill in values from the Firebase console.

| Variable | Browser-visible | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes (public) | Web app identifier. Not a secret; does not grant access. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | For example `<project>.firebaseapp.com`. |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Not used yet. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Not used yet. |
| `VITE_FIREBASE_APP_ID` | Yes | Web app identifier. |
| `VITE_USE_EMULATORS` | Yes | `true` sends the app to the local emulators. Never set in production. |

**Never** put a service-account key, Admin SDK credential or private key in a `VITE_` variable. Everything with that
prefix is published in the browser bundle. Access is enforced by `firestore.rules` and Firebase Authentication.

### Running against the emulators (no Firebase project needed)

1. Create `.env.local`: `VITE_FIREBASE_API_KEY=demo-key`, `VITE_FIREBASE_PROJECT_ID=afterclass-rules-test`,
   `VITE_FIREBASE_AUTH_DOMAIN=localhost`, `VITE_FIREBASE_APP_ID=1:1:web:1`, `VITE_USE_EMULATORS=true`.
2. Terminal 1: `npm run emulators`. Terminal 2: `npm run dev`.
3. Open the emulator UI at http://127.0.0.1:4000 to add quiz, poll and key documents (see
   [Seeding content](#seeding-content)).

Emulator sign-in has not been tested in this project. Expect to create test users with a `@cvv.ac.in` address in the
emulator Auth UI, and confirm the sign-in flow works before relying on it.

## Firebase project setup (manual, console only)

1. Create a Firebase project in the [console](https://console.firebase.google.com). **Do not upgrade to Blaze.**
2. **Authentication → Sign-in method**: enable **Google** and set a support email.
3. **Authentication → Settings → Authorized domains**: confirm `localhost` and add your Vercel domain.
4. **Firestore Database → Create database.** Pick a region near India, start in production mode. If the console offers
   an upgrade that asks for billing, decline it and confirm no billing account is attached.
5. **Project settings → Your apps → Web**: register a web app and copy the config into `.env.local`.
6. Link the folder and deploy the rules and indexes (free on Spark):

   ```bash
   npx firebase-tools login
   echo '{"projects":{"default":"YOUR_PROJECT_ID"}}' > .firebaserc   # local only, do not commit
   npx firebase-tools deploy --only firestore:rules,firestore:indexes
   ```

## Quiz design (rules-verified scoring, no server)

Answers must stay hidden from students, yet points must not be forgeable. This is achieved in the rules, without a
server:

1. **Create attempt** `quizAttempts/{quizId}_{uid}` with the five answers. Create-only, so one attempt per quiz. Allowed
   only while the quiz status is `published`. No score field is accepted.
2. **Read key**: `quizKeys/{quizId}` becomes readable by that student **only after** their attempt exists. Before that,
   the key is not visible to students at all.
3. **Write marks**: the student writes `marks` (0 or 1 per question). The rules check each mark against the key:
   a 1 requires a correct answer, a 0 requires a wrong one. Answers cannot change after creation, and marks can be
   written once.
4. **Award points**: the student appends the quiz ID to `users.scoredQuizzes` and raises `points` by the attempt's
   marks. The rules require the quiz ID to be new, the attempt to belong to the student, and the points increase to
   equal the verified marks.

Client code (`src/lib/quiz.ts`) runs these steps in order and is safe to repeat after a failed network call. A
failed submit shows "Try again", which resumes the unfinished step rather than creating a second attempt.

Limits of this design: the quiz format is fixed at five single-choice questions (the rules are unrolled per
question, because rules have no loops). Students read answers for quizzes they have attempted, which is intended for
explanations. A student who gets an error after step 1 can finish later, but cannot start over.

## Firestore data model

| Collection | Purpose | Client read | Client write |
|---|---|---|---|
| `users/{uid}` | Profile: displayName, photoURL, points, streak, scoredQuizzes | Verified CVV students (leaderboard) | Owner renames; owner awards a verified quiz result. Nothing else. |
| `quizzes/{id}` | Title, `day`, `status` (draft/published/closed), five questions without answers | Students, if published | Administrator only |
| `quizKeys/{id}` | Answers and explanations | Admin, or a student with an attempt | Administrator only |
| `quizAttempts/{quizId}_{uid}` | Answers, marks, timestamps | Owner, admin | Owner creates once, then adds marks once. No deletes. |
| `polls/{id}` | `question`, `options` (list of strings), `status`, `createdAt` | Students, if published or closed | Administrator only |
| `pollVotes/{pollId}_{uid}` | `option`, `uid`, `pollId` | Owner, admin | Owner creates once while the poll is published. No updates. |
| `suggestions/{id}` | `title`, `body`, `category`, `status`, `uid` | Owner, admin | Owner creates `submitted`. Admin changes `status` and `reviewedAt`. |
| `adminAuditLogs/{id}` | Reserved | None | None |

Anything not listed is denied by default.

### Seeding content

Quizzes, keys and polls are created by the project owner in the Firebase console (or the emulator UI). Console
writes bypass the rules, so they are a trusted owner action; the app itself cannot create them. Shapes:

- `quizzes/{id}`: `title` (string), `day` (`YYYY-MM-DD`), `status` (`published`), `questions` (array of exactly five
  maps: `id` `q1`..`q5` in order, `text`, and `options` map with keys `a`, `b`, `c`, `d`).
- `quizKeys/{same id}`: `answers` map (`q1`..`q5` → `a`..`d`), `explanations` map (`q1`..`q5` → text).
- `polls/{id}`: `question`, `options` (array of strings), `status` (`published`), `createdAt` (timestamp).

Only one `published` quiz is shown: the one with the latest `day`. Quizzes need `status == published` for students to
attempt them.

## Leaderboard

Top 25 by `points` descending, with document ID ascending as the tie-break. The client reads only the bounded page.
Points are written only through rule-verified quiz awards.

## Polls and suggestions

- **Polls**: one vote per student per poll. Votes are private and create-only. The rules reject votes on closed or
  draft polls and options that are not in the poll. **Results are not published.** A live tally would need either a
  trusted aggregator or exposing voter lists; neither is available on the free plan without a server.
- **Suggestions**: validated lengths and categories in the rules. Students see their own suggestions and status.
  **Limitation:** no rate limit, so a signed-in student could send many suggestions.

## Security rules and tests

`firestore.rules` enforces everything above and denies by default. `tests/firestore.rules.test.ts` contains 61
emulator tests, covering:

- Duplicate attempts, fabricated scores, malformed or extra fields, and attempts under another uid.
- Marks that contradict the key, marks written twice, and answer changes after submission.
- Repeated awards, inflated points, awards without an attempt, and awards for another student's attempt.
- Unauthorized writes to profiles, quizzes, keys, polls and suggestions.
- Duplicate votes, votes on closed or draft polls, invalid options, and votes under another uid.
- Admin-only writes, and the leaderboard query, which works for verified students and fails without auth.
- The client scoring flow end to end on the emulator, including a second submit that must fail without changing points.

Caveat: a "should fail" test can pass for the wrong reason. Earlier in development, every award was being rejected, so
the negative award tests passed trivially. After that bug was fixed, the whole suite was re-run and passed. I have not
verified, case by case, which rule rejects each negative test.

## Administrator access

There is one administrator: the verified Google account `bhogavalli.cvv241072@cvv.ac.in`. `isAdmin()` in
`firestore.rules` checks that email on the signed ID token, after the existing verified `@cvv.ac.in` check. Every
other account, including other `@cvv.ac.in` accounts, is a student.

- There are no custom claims, provisioning scripts, service-account keys, or stored admin secrets.
- The `/admin` PIN is a cosmetic screen lock. It is not a security boundary.
- To change the administrator, edit `isAdmin()` and `src/lib/adminIdentity.ts`, then redeploy the rules.

## Deployment (Vercel)

Vercel runs `npm install` and then `npm run build` (set in `vercel.json`), and serves `dist/`. All `/*` paths rewrite to
`index.html`, so deep links such as `/quiz` work.

1. Push the repository to GitHub, then **Add New → Project** in Vercel and import it. Leave the framework preset as
   Vite or Other; the build settings come from `vercel.json`.
2. In **Project Settings → Environment Variables**, add these for the Production environment (and Preview, if you
   want preview deployments to sign in):

   | Variable | Required | Value source |
   |---|---|---|
   | `VITE_FIREBASE_API_KEY` | Yes | Firebase console → Project settings → Your apps → Web app config |
   | `VITE_FIREBASE_AUTH_DOMAIN` | Yes | `after-class-b016c.firebaseapp.com` (same config) |
   | `VITE_FIREBASE_PROJECT_ID` | Yes | `after-class-b016c` |
   | `VITE_FIREBASE_APP_ID` | Yes | Same config |
   | `VITE_FIREBASE_STORAGE_BUCKET` | No | Not used yet; copy from config if you like |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | No | Not used yet; copy from config if you like |

   Do **not** add `VITE_USE_EMULATORS`, or set it to `false`. Never add service-account keys or secrets with a `VITE_`
   prefix, because every `VITE_` value is written into the public browser bundle.
3. Click **Deploy**. `VITE_*` values are read at build time, so after changing any of them, open **Deployments →
   Redeploy** to rebuild.
4. Copy the Vercel domain (for example `afterclass-xyz.vercel.app`) and add it under **Firebase Console →
   Authentication → Settings → Authorized domains**. Without this, Google sign-in fails on the deployed site.
5. Confirm the Firestore rules are deployed (`npx firebase-tools deploy --only firestore:rules --project
   after-class-b016c`). The rules must be live before the site is shared. Indexes are already deployed.

Do not claim the site is live until a real sign-in on the deployed domain has been tested, using a `@cvv.ac.in`
account.

## Verification checklist (live, not yet run)

- [ ] Sign in with a `@cvv.ac.in` account. A profile is created with 0 points and `scoredQuizzes: []`.
- [ ] Sign in with a non-college account. You are signed out with the policy message, and no profile is created.
- [ ] Owner publishes a quiz. Submit it. Points match the score, and reloading the page shows the same result.
- [ ] Reload after submitting: the quiz shows the completed result, and no extra points are added.
- [ ] Vote in a published poll. A second vote is rejected. Close the poll in the console and check it cannot be voted on.
- [ ] Leaderboard shows the top scores, and your own row is highlighted.
- [ ] Send a suggestion and see it in "Your suggestions" as "Received".

## Implementation status

| Area | Status |
|---|---|
| Design system, landing page, responsive shell | Done |
| Google sign-in, domain policy, sign-out, protected routes | Done in code. Not tested live. |
| Profile page and display-name edit | Done in code. Not tested live. |
| Daily quiz (view, submit, marks, award, resume) | Done in code. Rules tested on emulator (62 tests). Not tested live. |
| Leaderboard (top 25, trusted points) | Done in code. Not tested live. Own-rank lookup beyond the top 25 is not implemented. |
| Polls: browse and vote | Done in code. Results are not published. |
| Suggestions: submit and view own | Done in code. No rate limit. |
| Admin tools and admin provisioning | **Not built.** Owner uses the console. |

## Known limitations

1. **No live test.** No Firebase project has been connected, so the sign-in flow and live rules have not been exercised
   outside the emulator.
2. **Quiz format is fixed** at five single-choice questions, by design. Changing the count requires changing the rules.
3. **Answers become visible** to a student after they submit, for their explanations. Quiz content should be treated as
   public once it has been attempted.
4. **Poll results are private** until a trusted tally exists.
5. **No rate limiting** on suggestions or on repeated sign-in attempts.
6. **The domain policy trusts Google Workspace.** Any active `cvv.ac.in` account can sign in; enrolment is not
   verified. Account lifecycle is a college decision.
7. **Own rank beyond the top 25** is not shown.
8. **Bundle size.** The Firebase SDK pushes the main chunk to about 258 kB gzipped. Lazy-loading the Firebase-dependent
   routes would reduce this.
9. **Claims take up to an hour** to update after an admin grant or revoke, once admin tools exist.

## Next steps

1. Connect a Firebase project on Spark, deploy the rules and indexes, and run the verification checklist above.
2. Test the whole scoring flow in the emulator UI with a seeded quiz.
3. Deploy the rules (see the Firebase steps above) and verify the admin dashboard with the administrator account.
4. Add lazy loading for the Firebase routes.
