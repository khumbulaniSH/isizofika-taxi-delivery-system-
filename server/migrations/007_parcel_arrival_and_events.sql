ALTER TABLE parcels ADD COLUMN arrived_at timestamptz;

CREATE TABLE parcel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_status text NOT NULL CHECK (from_status IN ('created', 'arrived', 'collected')),
  to_status text NOT NULL CHECK (to_status IN ('created', 'arrived', 'collected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parcel_events_parcel_id_idx ON parcel_events (parcel_id);
