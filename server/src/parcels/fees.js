const STORAGE_FREE_DAYS_SQL = `COALESCE((SELECT value::int FROM app_settings WHERE key = 'storage_free_days'), 5)`;
const STORAGE_FEE_PER_DAY_CENTS_SQL = `COALESCE((SELECT value::int FROM app_settings WHERE key = 'storage_fee_per_day_cents'), 1000)`;

const DAYS_OVERDUE_BASE = `CASE
  WHEN p.status = 'arrived' AND p.arrived_at IS NOT NULL
    THEN GREATEST(
      0,
      ((now() AT TIME ZONE 'Africa/Johannesburg')::date
        - (p.arrived_at AT TIME ZONE 'Africa/Johannesburg')::date)
      - ${STORAGE_FREE_DAYS_SQL}
    )
  ELSE 0
END`;

export const DAYS_OVERDUE_SQL = DAYS_OVERDUE_BASE;
export const FEE_CENTS_SQL = `(${DAYS_OVERDUE_BASE}) * ${STORAGE_FEE_PER_DAY_CENTS_SQL}`;
