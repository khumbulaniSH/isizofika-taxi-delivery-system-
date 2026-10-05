CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('sender', 'store_staff', 'admin')),
  store_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);