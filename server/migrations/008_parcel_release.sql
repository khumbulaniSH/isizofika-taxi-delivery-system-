ALTER TABLE parcels ADD COLUMN collected_at timestamptz;
ALTER TABLE parcels ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);
ALTER TABLE parcels ADD COLUMN locked_at timestamptz;

CREATE TABLE release_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX release_attempts_parcel_id_idx ON release_attempts (parcel_id);
