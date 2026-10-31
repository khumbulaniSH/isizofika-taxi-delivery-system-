import express from 'express';
import { pool } from '../db.js';
import { validateAppSettingsUpdate } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';

const adminSettingsRouter = express.Router();

const SETTINGS_KEYS = ['storage_free_days', 'storage_fee_per_day_cents'];

const ALLOWED_UPDATES = {
  storage_free_days: 'storage_free_days',
  storage_fee_per_day_cents: 'storage_fee_per_day_cents',
};

async function readSettings() {
  const result = await pool.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [SETTINGS_KEYS],
  );

  const settings = {
    storage_free_days: 5,
    storage_fee_per_day_cents: 1000,
  };

  for (const row of result.rows) {
    settings[row.key] = Number.parseInt(row.value, 10);
  }

  return settings;
}

adminSettingsRouter.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const settings = await readSettings();
      res.status(200).json({ settings });
    } catch (err) {
      console.error('Admin get settings failed:', err.message);
      res.status(500).json({ error: 'Could not fetch settings.' });
    }
  },
);

adminSettingsRouter.patch(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const body = req.body ?? {};
    const { errors, updates } = validateAppSettingsUpdate(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) {
      res
        .status(400)
        .json({ error: 'Provide at least one of storage_free_days, storage_fee_per_day_cents.' });
      return;
    }

    let client = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      for (const key of keys) {
        await client.query(
          `UPDATE app_settings
           SET value = $1, updated_at = now(), updated_by = $2
           WHERE key = $3`,
          [String(updates[key]), req.user.id, ALLOWED_UPDATES[key]],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      if (client !== null) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          // ignore rollback failure
        }
      }
      console.error('Admin update settings failed:', err.message);
      res.status(500).json({ error: 'Could not update settings.' });
      return;
    } finally {
      if (client !== null) {
        client.release();
      }
    }

    try {
      const settings = await readSettings();
      res.status(200).json({ settings });
    } catch (err) {
      console.error('Admin update settings failed:', err.message);
      res.status(500).json({ error: 'Could not fetch settings.' });
    }
  },
);

export { adminSettingsRouter };
