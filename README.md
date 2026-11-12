# Vouch — CS 4800 Assignment 2 (UI)

Peer tutoring marketplace with a verifiable reputation record. This branch (`UI`) contains the **customer-facing front end**: React 19 + TypeScript + Vite, styled with plain CSS in the Vouch design language (forest green / cream, DM Sans + Playfair Display).

All data is mock data kept in the browser (`localStorage`), so the UI runs on its own with no backend. Everything the backend will eventually own is isolated in `src/lib/` so it can be swapped for real API calls.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Use the demo accounts on the Sign-in page, then switch roles any time from the avatar menu (top right). **Reset demo data** in that menu restores the starting state.

## What's in the UI

| Screen | Route | Role | Covers (SRS / backlog) |
|---|---|---|---|
| Landing | `#/` | public | Value proposition, how it works, ledger explainer |
| Sign in | `#/signin` | public | Email + simulated campus SSO, role-based demo accounts (B2) |
| Student home | `#/home` | student | Next session, actions needed, “topics to revisit” from session summaries (D7) |
| Get help | `#/request` | student | Free-text AI intake → structured request fields (D0, D3) |
| Matches | `#/matches` | student | Ranked tutors with visible score breakdown and explanation (D4, D5, D6) |
| Request a session | modal | student | Pick a slot from the tutor’s availability vs. your own (E2) |
| Sessions | `#/sessions` | student, tutor | Booking lifecycle request → accept → session → both confirm → review (E1–E3) |
| Review | modal | student | Only on attested sessions, appended to the ledger (F4) |
| Report a problem | modal | student, tutor | Dispute filing, recorded on the ledger (G1) |
| Tutor profile | `#/tutor/:id` | all | Verified coursework, availability, reputation record + verify |
| Tutor home | `#/home` | tutor | Incoming requests, upcoming sessions, record status |
| Courses & availability | `#/profile` | tutor, student | Coursework editor, topics, drag-to-edit weekly availability grid (B3, C1) |
| Ledger | `#/ledger` | all | Hash-linked entries, filter, animated chain verification (F2, F3) |
| Admin audit | `#/admin` | admin | Metrics, verification, **tamper demo** (edit/delete → verify fails → restore) (H1) |
| Match queue | `#/admin/queue` | admin | Manual matching with ranked suggestions (D1) |
| Disputes | `#/admin/disputes` | admin | Resolve disputes; outcome appended to the ledger (G1) |

## Project structure

```
src/
  main.tsx              entry point
  App.tsx               hash router + role guards
  types.ts              domain types (match the architecture modules M1–M8)
  style.css             all styles
  data/seed.ts          10 hand-seeded courses, demo users, bookings, ledger history
  lib/store.tsx         app state + mock API actions (replace with fetch calls)
  lib/ledger.ts         SHA-256 hash chain + verify (Web Crypto), mirrors M7
  lib/matching.ts       display copy of the weighted score, mirrors M3
  lib/intake.ts         keyword stand-in for the LLM intake call, mirrors M9
  lib/format.ts         time/percent helpers
  components/           Layout (nav/footer), AvailabilityGrid, TutorCard, LedgerBlock, ui primitives
  pages/                one file per screen
```

## Backend hand-off

Each action in `src/lib/store.tsx` maps to one endpoint. Keep the shapes in `src/types.ts`.

| UI action | Suggested endpoint |
|---|---|
| `signIn` | `POST /auth/login` |
| `updateUser` | `PUT /users/:id` (profile, coursework, availability) |
| `requestSession` | `POST /bookings` |
| `respond` | `POST /bookings/:id/accept` · `/decline` |
| `cancel` | `POST /bookings/:id/cancel` |
| `confirmSession` | `POST /bookings/:id/attest` (server appends attestation when both sides confirm) |
| `submitReview` | `POST /bookings/:id/review` (server appends to ledger) |
| `fileDispute` / `resolveDispute` | `POST /disputes` · `POST /disputes/:id/resolve` |
| `assignTutor` | `POST /admin/bookings/:id/assign` |
| ranking (`lib/matching.ts`) | `GET /requests/:id/matches` → `{ tutor, score, parts, explanation }[]` |
| intake (`lib/intake.ts`) | `POST /ai/parse` → `Partial<HelpRequest>` |
| verify (`lib/ledger.ts`) | `GET /ledger/verify` → `{ ok, checked, firstBreak?, reason? }` |
| `tamper` | demo-mode-only admin endpoint; never exposed in production |

The hash input order is `seq|type|bookingId|tutorId|JSON(payload)|ts|prevHash`. The backend should use the same order so client-side verification agrees with the server.

## Notes

- All names, courses and reviews are fictional sample data.
- AI features are simulated locally so a demo never depends on a live model call.
- Screenshots are in `screenshots/`.

## Backend

The API lives in `server/` (Express + TypeScript + PostgreSQL). It is not wired to this UI yet.

```bash
cd server
npm install
cp .env.example .env
npm run dev        # http://localhost:4000/api
```

See `server/README.md` for the API reference, the score and ledger math, and the demo accounts.
