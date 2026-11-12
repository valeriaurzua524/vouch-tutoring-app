# Vouch — backend

Peer tutoring marketplace with a verifiable reputation record.
CS 4800-02 · Fall 2026 · Option 04, Track A.

This is the API server: accounts, profiles, availability, help requests, the
matching engine, the booking lifecycle, dual-party attestation, the hash-chained
review ledger with verification, disputes, and the admin tamper demonstration.
It has no user interface of its own; the React client talks to it over JSON.

Node.js + Express + TypeScript on PostgreSQL.

## Run it

Needs Node 20.12 or newer. No database install is required.

```bash
npm install
cp .env.example .env      # defaults work as they are
npm run dev               # http://localhost:4000/api
```

With `DATABASE_URL` unset the server runs on PGlite, which is PostgreSQL compiled
to WebAssembly and stored in `.data/`. It executes the same SQL, including the
ledger triggers. To use a PostgreSQL server instead:

```bash
docker compose up -d db
# in .env:  DATABASE_URL=postgres://vouch:vouch@localhost:5432/vouch
npm run dev
```

Other commands:

| Command | What it does |
|---|---|
| `npm run demo` | Runs the whole graded demo path in the terminal against a throwaway database |
| `npm test` | 45 tests: matching math, ledger integrity, end-to-end over HTTP |
| `npm run typecheck` | TypeScript, no output |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run seed` | Create the demo accounts (stop the dev server first when on PGlite) |
| `docker compose up --build` | PostgreSQL and the API in containers |

### Demo accounts

Created at startup when `SEED_DEMO=true` (the `.env.example` default). All
fictional. Password for every one: `vouch-demo-1`

| Role | Email | Notes |
|---|---|---|
| admin | admin@cpp.edu | |
| tutor | maya.chen@cpp.edu | CS 3310, CS 2400, CS 1400 · free Tue/Wed 2-6 pm, Thu 10-12 |
| tutor | diego.ramirez@cpp.edu | CS 3310, CS 2400, CS 1300 · in person only |
| tutor | priya.nair@cpp.edu | MAT 1140/1150/2140, STA 2260 · online only |
| tutor | sam.okafor@cpp.edu | PHY 1510, CHM 1210, MAT 1140 |
| student | alex.kim@cpp.edu | enrolled in CS 3310 |
| student | jordan.lee@cpp.edu | enrolled in MAT 1150, PHY 1510 |

## API

All routes are under `/api`. Send `Authorization: Bearer <token>` unless marked
public. Errors are always `{ "error": { "code", "message", "details"? } }`.
Times of day are minutes after midnight in campus local time; `day_of_week` is
0 (Sunday) to 6. Booking `start_at` is an ISO 8601 instant.

### Accounts and profile
| Method | Path | Who | |
|---|---|---|---|
| POST | `/auth/register` | public | `{email, password, name, role: student\|tutor}` → `{token, user}`. Email must be on the campus domain. |
| POST | `/auth/login` | public | `{email, password}` → `{token, user}` |
| GET | `/me` | any | Profile, coursework, recorded gaps |
| PATCH | `/me` | any | Any of `{name, major, bio, modality, tags[]}` |
| PUT | `/me/courses` | any | `{courses: [{course_code, kind: completed\|enrolled, grade?, professor?}]}` replaces the list |
| GET / PUT | `/me/availability` | any | `{blocks: [{day_of_week, start_min, end_min}]}` recurring weekly |
| GET | `/courses` | public | The ten-course catalog with topic tags |
| GET | `/tutors/:id` | any | Public profile, reputation, and each review with its ledger position and hash |

### Requests and matching
| Method | Path | Who | |
|---|---|---|---|
| POST | `/intake` | any | `{text}` → `{course_code, tags, exam, deadline_day, urgency, source, missing[]}`. Saves nothing. |
| POST | `/requests` | student, tutor | `{course_code, tags[], windows[], professor?, description?, modality?}` |
| GET | `/requests`, `/requests/:id` | owner, admin | |
| GET | `/requests/:id/matches` | owner, admin | Ranked tutors with the score breakdown and explanation |
| POST | `/requests/:id/cancel` | owner | Only while open |

### Bookings, attestation, reviews
| Method | Path | Who | |
|---|---|---|---|
| POST | `/bookings` | request owner | `{request_id, tutor_id, start_at, duration_min?}` → `requested`. Tutor must be an eligible match. |
| GET | `/bookings`, `/bookings/:id` | parties, admin | Detail includes events, attestations, review, summary, ledger entries |
| POST | `/bookings/:id/accept` · `/decline` | tutor | |
| POST | `/bookings/:id/confirm` | student | `accepted` → `scheduled` |
| POST | `/bookings/:id/cancel` | either party | Reopens the request |
| POST | `/bookings/:id/attest` | each party | Second attestation → `completed` and an `ATTESTATION` ledger entry |
| POST | `/bookings/:id/review` | student | `{rating 1-5, comment?}`. Needs the attestation. Once only. |
| POST | `/bookings/:id/summary` | tutor | `{notes, concepts?, gaps?}`. Stored outside the ledger. |

```
requested --accept--> accepted --confirm--> scheduled --both attest--> completed
    |                    |                      |
    +--decline--> declined                      |
    +--cancel------------+--cancel--------------+--> cancelled
```

### Ledger and disputes
| Method | Path | Who | |
|---|---|---|---|
| GET | `/ledger/verify` | public | Walks the chain; reports the first broken entry and why. Optional `?anchor_seq=&anchor_hash=` |
| GET | `/ledger/head` | public | Latest `{seq, hash}` to record elsewhere |
| GET | `/ledger`, `/ledger/:seq` | any | Entries with parsed payloads |
| POST | `/disputes` | either party | `{booking_id, target: review\|session, reason}`. Written to the ledger. |
| GET | `/disputes` | parties, admin | |
| POST | `/disputes/:id/resolve` | admin | `{outcome: upheld\|rejected, note}`. Written to the ledger. |

### Admin
| Method | Path | |
|---|---|---|
| GET | `/admin/users` | |
| POST | `/admin/assign` | `{request_id, tutor_id, start_at}` manual matching |
| GET | `/admin/stats` | Raw counts; each rate with numerator and denominator |
| POST | `/admin/tamper` | `{seq, mode: blocked\|bypass, rating?, comment?}` |
| POST | `/admin/tamper/restore` | Undo every bypass tamper |

## How the score is computed

`src/lib/matching.ts`. Pure functions, no model, no I/O.

```
score = 0.40 * course_match
      + 0.30 * availability_overlap
      + 0.20 * tag_overlap
      + 0.10 * normalized_tutor_rating
      - 0.10 * current_load_penalty
```

| Term | Definition |
|---|---|
| `course_match` | 1.0 exact course; 0.6 same subject and first digit of the number within 1 (CS 2400 for a CS 3310 request); else 0 |
| `availability_overlap` | requested minutes inside the tutor's free blocks ÷ requested minutes. Overlapping blocks are merged first. |
| `tag_overlap` | requested tags the tutor declares ÷ requested tags. 0 if the request has none. |
| `normalized_tutor_rating` | (average − 1) ÷ 4 over verified, non-retracted reviews. 0.5 when there are none. |
| `current_load_penalty` | min(active bookings ÷ 4, 1). Active = requested, accepted or scheduled. |

Before scoring, tutors are filtered: not the requester, compatible modality, and
`course_match > 0`. Ties break on same professor, then lower id.

Worked example (the first one in `npm run demo`):

```
Maya:  0.40*1.0 + 0.30*(120/120) + 0.20*(2/2) + 0.10*0.5 - 0.10*(0/4) = 0.40 + 0.30 + 0.20 + 0.05 - 0 = 0.95
Diego: 0.40*1.0 + 0.30*(0/120)   + 0.20*(1/2) + 0.10*0.5 - 0.10*(0/4) = 0.40 + 0.00 + 0.10 + 0.05 - 0 = 0.55
```

Three choices here are ours, not the project document's, and are easy to change:
unrated tutors get 0.5, the rating maps as (avg − 1) ÷ 4, and the load cap is 4.

## How the ledger works

`src/lib/ledger.ts`, table `ledger_entries` in `src/db/schema.ts`.

```
hash_n      = SHA-256( canonical JSON of { seq, entry_type, booking_id, payload, created_at, prev_hash } )
prev_hash_n = hash_(n-1)                      prev_hash_1 = 64 zeros
```

- Entry types: `ATTESTATION`, `REVIEW`, `DISPUTE_FILED`, `DISPUTE_RESOLVED`.
- `payload` and `created_at` are stored as text so the bytes hashed are the bytes stored.
- Database triggers reject `UPDATE`, `DELETE` and `TRUNCATE` on the table.
- Unique indexes allow one attestation and one review per booking.
- A review's payload carries the seq and hash of the attestation it depends on.
- Appends take a table lock inside their transaction, so concurrent writers cannot fork the chain.
- There is no separate reviews table. Ratings are computed from ledger entries.
- A review is never removed. An upheld dispute appends an entry that marks it retracted.

Verification reports the first break:

| Reason | Meaning |
|---|---|
| `HASH_MISMATCH` | This entry's contents no longer produce its stored hash |
| `PREV_HASH_MISMATCH` | This entry does not link to the one before: an earlier entry was rewritten and re-hashed |
| `SEQ_GAP` | An entry is missing |
| `ANCHOR_MISMATCH` | The chain is self-consistent but disagrees with a head hash recorded earlier |

### What it does and does not prove

The chain makes a partial edit detectable. It does not, by itself, stop someone
with full database access from rewriting an entry and recomputing every hash
after it, or from dropping entries off the end; both leave a chain that verifies.
Catching those needs a head hash kept somewhere the database owner cannot edit.
`GET /ledger/head` gives that value and `GET /ledger/verify?anchor_seq=&anchor_hash=`
checks against it. The test suite demonstrates both the gap and the fix
(`tests/ledger.test.ts`, "a full rewrite...").

### The tamper demonstration

`POST /admin/tamper` has two modes.

- `blocked` runs a plain `UPDATE`. The trigger rejects it and the response carries the database error.
- `bypass` sets `vouch.allow_tamper` for one transaction, which the trigger honours, and rewrites the payload without touching the hash. Verification then fails at that entry. The original is saved so `/admin/tamper/restore` can put it back.

The bypass exists only for the demo. It is refused unless `ALLOW_TAMPER_DEMO=true`,
which defaults to false when `NODE_ENV=production`.

## Where the language model is, and is not

`src/lib/intake.ts`. With `ANTHROPIC_API_KEY` set, a hosted model proposes the
structured fields for `/intake` and the concepts and gaps for `/summary`. Its
answer is validated against the catalog; anything unknown is dropped, and a bad
answer falls back to the deterministic keyword parser. Without a key the parser
does all of it, so the demo path makes no live call. Intake results are cached
by text.

The model never ranks, never writes to the ledger, and never takes part in a
hash. Match explanations are built from the score terms by template, not
generated.

## Backlog coverage

| ID | Item | Where |
|---|---|---|
| A1 | CI, PR template | `.github/` |
| A2 | Docker Compose with PostgreSQL | `docker-compose.yml`, `Dockerfile` |
| A3 | Express API skeleton | `src/app.ts`, `src/server.ts` |
| B1 | Data model | `src/db/schema.ts` |
| B2 | Auth and roles | `src/http.ts`, `src/routes/accounts.ts` |
| B3 | Unified profile | `src/routes/accounts.ts` |
| B4 | Ten-course catalog, taxonomy v1 | `src/db/catalog.ts` |
| C1 | Availability model | `src/routes/accounts.ts` |
| D0 | Help request, structured fields | `src/routes/requests.ts` |
| D1 | Manual matching | `POST /admin/assign` |
| D3 | Structured intake | `src/lib/intake.ts`, `POST /intake` |
| D4 | Weighted score | `src/lib/matching.ts` |
| D6 | Ranking explanations | `scoreTutor().explanation` (template) |
| D7 | Session summaries, gaps fed back | `POST /bookings/:id/summary` |
| E1 | Booking state machine | `src/lib/bookingMachine.ts` |
| E3 | Dual-party attestation | `POST /bookings/:id/attest` |
| F1 | Append-only ledger schema | `src/db/schema.ts` |
| F2 | SHA-256 chaining | `src/lib/ledger.ts` |
| F3 | Verification endpoint | `GET /ledger/verify` |
| G1 | Disputes on the ledger | `src/routes/ledger.ts` |
| H1 | Tamper demonstration | `src/routes/admin.ts` |
| J1 | Ledger integrity suite | `tests/ledger.test.ts` |
| J2 | End-to-end suite | `tests/flow.test.ts` |

Not in this repository: the interface items (A3 client, D5, E2, F4 screens, J3),
the staging deployment (A4), and the documents (I1 to I7).

## Decisions that differ from the project document

- **Vitest, not Jest.** Same test API. Jest's ES-module support made the embedded database awkward to load.
- **PGlite as the default development database.** PostgreSQL remains the target; CI runs the suites on both.
- **Triggers, not a `RULE`.** A rule with `DO INSTEAD NOTHING` would ignore an edit silently. The trigger raises an error the demo can show.
- **A tutor account can also request help.** Peer tutors are students. Permissions on a booking follow who is the student and who is the tutor of that booking, not the account's role.
- **Attestation is allowed as soon as a booking is scheduled**, so the demo runs in one sitting. Set `ENFORCE_SESSION_TIME=true` to require the start time to have passed.
- **Only the student reviews**, and only the tutor.

Descoped in the project document and not built here: payments, campus SSO,
rescheduling, double-booking detection, no-show penalties, tutor directory and
search, notifications, evidence attachments, review moderation.

## Known limits

- Prototype authentication: email and password with a 12-hour token. No email verification, password reset, or rate limiting on login.
- Any signed-in user can read the ledger, including review comments and user ids. That is the audit story, but confirm it is acceptable before real data goes in.
- Course codes are modeled on the Cal Poly Pomona catalog and were not checked against the current one.
- All availability is in one time zone, America/Los_Angeles.
