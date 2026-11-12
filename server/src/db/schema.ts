/**
 * Data model. Every statement is idempotent so this runs on each start.
 *
 * The ledger is the part to read closely:
 *  - payload and created_at are TEXT, not JSONB/TIMESTAMPTZ, so the bytes that
 *    were hashed are exactly the bytes stored (JSONB would reorder keys).
 *  - triggers reject UPDATE, DELETE and TRUNCATE at the database level.
 *  - the one escape hatch is the transaction-local setting vouch.allow_tamper,
 *    used only by the admin tamper demonstration (see routes/admin.ts).
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','tutor','admin')),
  name          TEXT NOT NULL,
  major         TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  modality      TEXT NOT NULL DEFAULT 'both' CHECK (modality IN ('in_person','online','both')),
  tags          JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  code    TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  number  INTEGER NOT NULL,
  title   TEXT NOT NULL,
  topics  JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS user_courses (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code),
  kind        TEXT NOT NULL CHECK (kind IN ('completed','enrolled')),
  grade       TEXT,
  professor   TEXT,
  UNIQUE (user_id, course_code, kind)
);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_min   INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min     INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  CHECK (start_min < end_min)
);
CREATE INDEX IF NOT EXISTS availability_user_idx ON availability_blocks(user_id);

CREATE TABLE IF NOT EXISTS help_requests (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id),
  course_code TEXT NOT NULL REFERENCES courses(code),
  professor   TEXT,
  tags        JSONB NOT NULL DEFAULT '[]',
  windows     JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  raw_text    TEXT,
  modality    TEXT NOT NULL DEFAULT 'either' CHECK (modality IN ('in_person','online','either')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','fulfilled','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id             SERIAL PRIMARY KEY,
  request_id     INTEGER NOT NULL REFERENCES help_requests(id),
  student_id     INTEGER NOT NULL REFERENCES users(id),
  tutor_id       INTEGER NOT NULL REFERENCES users(id),
  state          TEXT NOT NULL DEFAULT 'requested'
                 CHECK (state IN ('requested','accepted','scheduled','completed','declined','cancelled')),
  start_at       TIMESTAMPTZ NOT NULL,
  duration_min   INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 240),
  assigned_by    INTEGER REFERENCES users(id),
  score_snapshot JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (student_id <> tutor_id)
);
CREATE INDEX IF NOT EXISTS bookings_tutor_idx ON bookings(tutor_id);
CREATE INDEX IF NOT EXISTS bookings_student_idx ON bookings(student_id);

CREATE TABLE IF NOT EXISTS booking_events (
  id         SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  from_state TEXT,
  to_state   TEXT NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attestations (
  booking_id  INTEGER NOT NULL REFERENCES bookings(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  attested_at TEXT NOT NULL,
  PRIMARY KEY (booking_id, user_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  seq        INTEGER PRIMARY KEY,
  entry_type TEXT NOT NULL
             CHECK (entry_type IN ('ATTESTATION','REVIEW','DISPUTE_FILED','DISPUTE_RESOLVED')),
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  prev_hash  TEXT NOT NULL CHECK (length(prev_hash) = 64),
  hash       TEXT NOT NULL UNIQUE CHECK (length(hash) = 64)
);
-- One attestation and one review per booking, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_one_attestation
  ON ledger_entries(booking_id) WHERE entry_type = 'ATTESTATION';
CREATE UNIQUE INDEX IF NOT EXISTS ledger_one_review
  ON ledger_entries(booking_id) WHERE entry_type = 'REVIEW';

CREATE OR REPLACE FUNCTION vouch_ledger_immutable() RETURNS trigger AS $fn$
BEGIN
  IF current_setting('vouch.allow_tamper', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger_entries is append-only: % is not permitted', TG_OP;
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vouch_ledger_no_truncate() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: TRUNCATE is not permitted';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update_delete ON ledger_entries;
CREATE TRIGGER ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION vouch_ledger_immutable();

DROP TRIGGER IF EXISTS ledger_no_truncate ON ledger_entries;
CREATE TRIGGER ledger_no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION vouch_ledger_no_truncate();

CREATE TABLE IF NOT EXISTS disputes (
  id              SERIAL PRIMARY KEY,
  booking_id      INTEGER NOT NULL REFERENCES bookings(id),
  filed_by        INTEGER NOT NULL REFERENCES users(id),
  target          TEXT NOT NULL CHECK (target IN ('review','session')),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  outcome         TEXT CHECK (outcome IN ('upheld','rejected')),
  resolution_note TEXT,
  resolved_by     INTEGER REFERENCES users(id),
  filed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

-- Generated / advisory content. Deliberately outside the ledger: nothing a
-- model produces takes part in hashing or verification.
CREATE TABLE IF NOT EXISTS session_summaries (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id),
  author_id  INTEGER NOT NULL REFERENCES users(id),
  notes      TEXT NOT NULL,
  concepts   JSONB NOT NULL DEFAULT '[]',
  gaps       JSONB NOT NULL DEFAULT '[]',
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_gaps (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id),
  course_code TEXT NOT NULL REFERENCES courses(code),
  tag         TEXT NOT NULL,
  booking_id  INTEGER REFERENCES bookings(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_code, tag)
);

CREATE TABLE IF NOT EXISTS intake_cache (
  text_hash  TEXT PRIMARY KEY,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tamper_backup (
  seq              INTEGER PRIMARY KEY,
  original_payload TEXT NOT NULL,
  tampered_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
