# AfterClass — PLAN

## Budget (OpenRouter, verified 2026-10-25 via /api/v1/key)
- Key limit: $5 (OpenRouter-enforced; **resets monthly** on the 1st — so it caps per-month, not lifetime).
- Spent at preflight: ~$0.28. Check https://openrouter.ai/activity before each milestone.
- Routing: **confirmed**. Key spend rose with session calls: $0.276 (M0) → $0.470 (M1 start) → $0.484 (M1 end). Remaining $4.52 of $5.
- Pricing ($/M in/out): haiku-5.5 0.10/0.50 · sonnet-5.5 2/10 · opus-5.5 4/20 · fable 10/50.
- Preflight ran on **Opus 5.5** (expensive). Each tool round re-sends full context (~$0.05–0.10 on Opus).
  → Switch to Haiku 5.5 for routine milestones; Sonnet 5.5 only for security rules/functions review.

## Environment
- Node 22.18, npm 10.9, Java 25 (emulators OK). Firebase CLI: **not installed** (`npm i -g firebase-tools`).
- Repo: empty. Initialized a dedicated git repo here (previously the git root was the home dir).

## Architecture
- `web/`-less single Vite app at root: React + TS + Vite + Tailwind + React Router.
- Firebase Auth (Google, `hd=cvv.ac.in` hint + server-side domain check via blocking function or callable guard).
- Firestore, deny-by-default rules. Clients read public data; **all scoring/voting/admin writes go through
  Callable Cloud Functions** (`functions/`, TS, Admin SDK, transactions).
- Admin role = custom claim `admin: true`, set only by `scripts/grant-admin.ts` run locally with a
  service account (never committed). No first-user auto-promotion; no public endpoint.
- Note: Cloud Functions require the Firebase **Blaze** plan (billing account). Needs your approval.

## Data model (draft)
- `users/{uid}`: displayName, photoURL (client-editable); points, streak, lastQuizDay, quizzesTaken (server-only).
  Email kept in `userPrivate/{uid}` (owner/admin read only).
- `quizzes/{id}`: title, day (YYYY-MM-DD), status draft|published|closed, questions[{id,text,options[],points}].
  `quizKeys/{id}`: answers + explanations (server/admin only; returned after submission).
- `quizAttempts/{quizId_uid}`: deterministic ID → one attempt; score, answers, createdAt (owner read).
- `polls/{id}`: question, options, status, resultsVisibility, counts{} (server-written).
- `pollVotes/{pollId_uid}`: deterministic ID; server-only, owner can read own.
- `suggestions/{id}`: title, body, category, status, uid (owner+admin read).
- `adminAuditLogs/{id}`: actor uid, action, target, at.
- Leaderboard: query `users` orderBy points desc, uid asc (tie-break), limit 25 + cursor.

## Milestones
- [x] M0 Preflight (budget, routing, repo, plan)
- [x] M1 Design foundation + landing (see Work log)
- [~] M2 Auth (code complete; live test pending)
- [ ] M3 Quiz (functions + rules)
- [ ] M4 Leaderboard + profiles
- [ ] M5 Polls + suggestions
- [ ] M6 Admin
- [ ] M7 QA / emulator tests
- [ ] M8 Docs / deploy readiness

## Work log
- M0 (Opus 5.5): preflight, this file, git repo initialised inside AfterClass/ (previous git root was the home dir).
- M1 (Haiku 5.5, confirmed from system model ID):
  - Stack: Vite 7, React 19, TypeScript 5.9 strict, React Router 7, Tailwind 4 via @tailwindcss/vite. No UI library.
  - Tokens: src/styles/index.css (@theme: cream/paper/sand/ink, lime, pink, violet, serif display + sans, radius, hard shadows, focus ring, reduced-motion).
  - UI: src/components/ui/{Button,Tag,Card,Section}.tsx. Shell: src/components/layout/AppShell.tsx (skip link, sticky header, footer).
  - Pages: src/pages/Landing.tsx, src/pages/NotFound.tsx. Routes: src/App.tsx. Entry: src/main.tsx.
  - Demo content: src/data/demo.ts, labelled "not live" in the UI.
  - Sign-in button is disabled with an explicit "not connected yet" note. No fake auth.
  - Checks actually run: `npm run build` (tsc -b + vite build) PASSED. `vite preview` returned HTTP 200 on / and on an unknown route (SPA fallback).
  - Bundle: JS 269.88 kB (85.86 kB gzip), CSS 18.08 kB (4.35 kB gzip).
  - NOT run: browser-based visual/responsive check (no browser automation set up), accessibility audit, unit tests (none configured yet).
  - Not committed to git (commit only on request).

## Blockers / decisions needed
1. Firebase plan. Spark (free) can host Auth and rules-protected Firestore, but cannot run Cloud Functions. Cloud Functions need Blaze (billing card, free quota). Until a trusted scoring/voting path exists, the browser must NOT write points or votes in production. Needs your decision.
2. Firebase project ID and web config (needed for M2).
3. Alternative to Blaze (not preferred): a trusted backend on a free host with a service-account secret. Adds a second deployment target.

## M2 — Firebase Auth + Firestore foundation (status: code complete, live test pending)
- [x] Firebase client (Spark only) initialised from VITE_* env vars; app shows "not configured" without them. src/lib/firebase.ts
- [x] Google sign-in/out with `cvv.ac.in` policy (exact domain, verified email, subdomains rejected). src/lib/domain.ts, src/lib/auth.tsx
- [x] Unauthorized and profile-error states; sign-out; protected /profile route (RequireAuth). Routing guard is UX only.
- [x] Profile created on first sign-in with points 0, streak 0; display name is the only editable field. src/lib/profile.ts, src/pages/Profile.tsx
- [x] firestore.rules: deny by default; domain policy checked on token; admin = custom claim `admin` (token.get default false).
- [x] firestore.indexes.json (3 planned composites), firebase.json (rules + emulator ports), vercel.json (SPA rewrite).
- [x] .env.example (placeholders only). Secret scan of repo: no keys or private keys found.
- [ ] Live test with a real Firebase project: NOT done (no project supplied; no console access).
- Checks actually run:
  - `npm run typecheck` (tsc -b): PASSED.
  - `npm test` (vitest, domain policy + display-name validation): 7/7 PASSED.
  - `npm run test:rules` (Firebase Firestore emulator + rules-unit-testing): 23/23 PASSED. Emulator run locally, ₹0, no billing.
  - `npm run build`: PASSED. Warning: main chunk 820 kB minified (251 kB gzip), mostly Firebase SDK.
- Not done in M2 by design: quiz submit/scoring, poll voting, suggestion form UI, leaderboard, admin.

## Blocker (decision needed): trusted scoring/voting on a free plan
- Cloud Functions require Blaze (billing). Not enabled. Client-side scoring/voting is rejected by rules, so those features stay off.
- Recommended free option (not built): Vercel serverless endpoint + Firebase Admin SDK (free), with the service-account key only as a Vercel server-side secret, verifying the Firebase ID token before scoring/voting in a transaction. Needs your approval; Vercel Hobby terms apply.

## Next: Milestone 3 (Quiz) — waiting on the scoring decision above
- 1. You approve the free endpoint approach (or choose another). 2. Connect a Firebase project and run the README checklist. 3. Then build quiz UI on the endpoint.
- Milestone 3 must not write points from the browser under any circumstance.

## Architecture investigation (M2 review, 2026-10-25) — no code changed
Budget: ₹0 infrastructure; OpenRouter spend $0.634 of $5 (≈$4.37 left) at this review.

Verified facts (sources: firebase.google.com/pricing, firebase rules-conditions, firebase admin setup, vercel fair-use page, cloudflare workers pricing):
- Firestore Spark: 50k reads/day, 20k writes/day, 20k deletes/day, 1 GiB stored, 10 GiB egress/month; no payment method needed.
- Cloud Functions: NOT on Spark (Blaze only, requires billing account).
- Admin SDK: works in any non-Google server with a service-account key or Application Default Credentials; key is a high-risk secret.
- Vercel Hobby: non-commercial only. Commercial includes any paid person (even a consultant or paid student) writing or maintaining the site. Hobby limits: 1M function invocations, 4 hours Active CPU per month.
- Cloudflare Workers Free: 100k requests/day, 10 ms CPU per invocation. Commercial-use terms and secret-handling were NOT confirmed from the fetched page.
- Firestore rules: get()/exists() are billed reads; rules have no loops; 10 nested-call stack depth; 10 get() calls per single-document request (20 for batches). Not verified: the exact unique-call limit when calls repeat (repeated identical calls are cached and don't count).
- Emulator spike (temporary, deleted): a rule CAN read a document via get() that the requesting student is denied reading directly. So answer keys can stay client-unreadable and still be used by rules for validation.

Options (₹0 each):
A. Rules-only enforcement on Spark (no server, no secrets):
   - Voting: deterministic vote ID + create-only + option must exist in poll + poll status published (via get()). Enforceable. Public live tallies are NOT enforceable by rules (a user could repeatedly bump counters), so results stay admin-only until a trusted tally exists.
   - Quiz scoring: enforceable for fixed-format quizzes (e.g., single-choice, N questions with a fixed ID scheme): attempt create-only (one attempt), answer key read via get() only, score validated in rules, and points increase only if the quiz ID is not in the user's scoredQuizzes list. Needs an unrolled per-question rule (no loops). Untested beyond the spike.
   - Admin: custom claim `admin` set by a local script (needs a service-account key on the admin's own PC, never committed). Free. Not a runtime server.
B. Vercel serverless + Admin SDK: free within Hobby limits, but non-commercial only, and the service-account key becomes a server secret in Vercel env. Commercial-use risk if anyone is paid.
C. Cloudflare Workers + service-account JWT (REST): free tier generous; 10 ms CPU limit is tight; commercial terms and secret handling unverified.
D. Google Apps Script: free, but needs an owner account and fragile Firestore auth; unverified; not recommended.
E. Switch to Supabase (Postgres + RLS + edge functions) or similar: a stack change; out of scope unless you ask.
F. Client-side scoring/voting: rejected (not secure).

Recommendation: A first. It needs no secrets, runs on Spark, and is testable in the free emulator. Smallest next step: a rules-only prototype for one fixed-format quiz (5 questions) and voting, with emulator tests for duplicate attempts, wrong scores, replayed point awards, and closed polls. Keep admin-only results. Re-evaluate B/C only if rules can't express a needed rule.

## Session: quiz, polls, leaderboard, suggestions (rules-only, ₹0)
Status: implemented and tested on the local emulator. Not connected to a live Firebase project.
- Quiz (src/lib/quiz.ts, src/pages/Quiz.tsx): create attempt → read key (after attempt only) → write rule-verified marks → award points. Resumable; one attempt per quiz; points rule-checked; score never sent as a value.
- Rules (firestore.rules): marks checked against hidden key via get(); users.scoredQuizzes prevents repeat awards; awardOk uses list concat (list+list is not supported in rules).
- Polls (src/lib/community.ts, src/pages/Polls.tsx): create-only vote, option and published status enforced in rules. Results NOT published (cannot be secured without a trusted tally).
- Suggestions (src/pages/Suggestions.tsx): owner create, owner read, admin status change. No rate limit.
- Leaderboard (src/pages/Leaderboard.tsx): top 25 by points desc, document ID tie-break, only trusted points.
- Admin: NOT built. Content is seeded from the Firebase console (owner).
- Checks actually run:
  - npm run typecheck: PASSED
  - npm test: 9/9 PASSED (domain policy, display names, quiz marking)
  - npm run test:rules: 55/55 PASSED (Firestore emulator; includes client scoring flow on emulator)
  - npm run build: PASSED (main chunk 846 kB minified, 258 kB gzip)
  - Secret scan of repo: no matches.
- Bugs found and fixed during testing:
  - rules list+list unsupported → use list.concat()
  - awards rejected because of that bug, which had made "rejects" tests pass for the wrong reason; fixed and all tests re-run.
  - a no-op updatedAt-only write is allowed (harmless; does not change points or awards).
- Not done: live Firebase test, admin dashboard, lazy-load split, own-rank beyond top 25, suggestion rate limit.
- Budget: OpenRouter spend $1.096 of $5 at end of session (≈ $3.90 remaining).

## Incident: "could not set up your profile" after Google sign-in (live project after-class-b016c)
Root cause (verified read-only via the Firebase Rules API, no changes made):
- Live Firestore database exists (Standard edition, Native mode).
- The deployed ruleset for cloud.firestore is the DEFAULT DENY-ALL ruleset (`allow read, write: if false;`), last updated 2026-10-25 18:08 UTC.
- The AfterClass rules in firestore.rules have never been deployed to after-class-b016c.
- So the first profile read (getDoc users/{uid}) is rejected with permission-denied, ensureProfile throws, and the app shows the generic message.
- The code path is correct: ensureProfile reads users/{uid} first (allowed for verified @cvv.ac.in students by the rules), creates the profile only if missing, and never overwrites.

Verified:
- The local rules compile on the live project: Rules API test endpoint returned HTTP 200 with no errors (compile check only, nothing deployed).
- npm run test:rules: 55/55 PASSED (run on alternate emulator ports 18080/19099 because the local emulator on 8080 was already running).

Changes made in this fix (code only):
- src/lib/profile.ts: logDevError around the read and the create (development builds only; logs code and message, never uids or emails).
- src/lib/auth.tsx: logs the failing stage; shows a clearer message on permission-denied.
- src/lib/errors.ts: logDevError helper (import.meta.env.DEV only).

NOT DONE - requires your action:
- Deploy the rules and indexes to the live project:
    npx firebase-tools deploy --only firestore:rules,firestore:indexes --project after-class-b016c
  An automated deploy attempt was blocked by the permission system, so it was not completed. Run it yourself.
- After deploying, sign in again with a @cvv.ac.in account and check the browser console in dev mode.
- Rollback path if needed: Firebase console > Firestore > Rules > Release history > restore the previous release.

Checks run after the change:
- npm run typecheck: PASSED
- npm test: 9/9 PASSED
- npm run test:rules: 55/55 PASSED (alternate ports)
- npm run build: PASSED
