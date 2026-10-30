CREATE TABLE parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rank_id uuid NOT NULL REFERENCES taxi_ranks(id) ON DELETE RESTRICT,
  destination_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  recipient_email text,
  description text,
  handover_date date NOT NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'arrived', 'collected')),
  code_hash text NOT NULL,
  sender_code_part_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parcels_sender_id_idx ON parcels (sender_id);
CREATE INDEX parcels_destination_store_id_idx ON parcels (destination_store_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient text NOT NULL,
  code_part_enc text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
