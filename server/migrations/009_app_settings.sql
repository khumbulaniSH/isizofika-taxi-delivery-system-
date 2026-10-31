CREATE TABLE app_settings (
  key text PRIMARY KEY CHECK (key IN ('storage_free_days', 'storage_fee_per_day_cents')),
  value text NOT NULL CHECK (value ~ '^[0-9]{1,6}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT
);

INSERT INTO app_settings (key, value) VALUES
  ('storage_free_days', '5'),
  ('storage_fee_per_day_cents', '1000');
