CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  address text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD CONSTRAINT users_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES stores(id)
  ON DELETE RESTRICT;