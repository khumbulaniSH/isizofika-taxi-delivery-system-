CREATE TABLE rank_stores (
  rank_id uuid NOT NULL REFERENCES taxi_ranks(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rank_id, store_id)
);

CREATE INDEX rank_stores_store_id_idx ON rank_stores (store_id);
