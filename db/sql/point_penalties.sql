-- Penalties paid back with shop runs (lib/penalty.ts). Applied by hand in
-- production on 2026-10-14; cancelled_at added 2026-10-16. Safe to re-run.
CREATE TABLE IF NOT EXISTS point_penalties (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES members(id),
  points integer NOT NULL CHECK (points > 0),
  shops integer NOT NULL CHECK (shops > 0),
  reason text NOT NULL,
  ledger_source_id bigint NOT NULL,   -- point_ledger adjustment holding the deduction
  admin_name text NOT NULL,
  created_at text NOT NULL,           -- ISO time; shop runs sent after this count
  refunded_at text,
  refund_source_id bigint,            -- point_ledger adjustment holding the refund
  cancelled_at text                   -- deduction undone in the admin page
);
ALTER TABLE point_penalties ADD COLUMN IF NOT EXISTS cancelled_at text;
CREATE INDEX IF NOT EXISTS idx_point_penalties_open ON point_penalties (member_id) WHERE refunded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_point_penalties_ledger ON point_penalties (ledger_source_id);
ALTER TABLE point_penalties ENABLE ROW LEVEL SECURITY;
