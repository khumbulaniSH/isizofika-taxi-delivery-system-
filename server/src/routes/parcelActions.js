import express from 'express';
import { pool } from '../db.js';
import { isValidUuid } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { buildParcelSelect, serializeParcelRow } from '../parcels/view.js';
import { verifyCode } from '../parcels/codes.js';

const parcelActionsRouter = express.Router();

const STORE_NOT_ATTACHED_MESSAGE = 'Your account is not attached to a store.';
const PARCEL_NOT_FOUND_MESSAGE = 'Parcel not found.';
const LOCKED_MESSAGE =
  'This parcel is locked after too many wrong codes. Ask an admin to unlock it.';
const CODE_MISMATCH_MESSAGE = 'Code does not match.';
const CODE_FORMAT_MESSAGE = 'Code must be exactly 6 digits.';
const MAX_FAILED_ATTEMPTS = 5;

parcelActionsRouter.post(
  '/:id/arrive',
  requireAuth,
  requireRole('store_staff', 'admin'),
  async (req, res) => {
    const parcelId = req.params.id;

    if (!isValidUuid(parcelId)) {
      res.status(400).json({ error: 'Invalid parcel id.' });
      return;
    }

    const isStaff = req.user.role === 'store_staff';
    if (isStaff && (req.user.store_id === null || req.user.store_id === undefined)) {
      res.status(403).json({ error: STORE_NOT_ATTACHED_MESSAGE });
      return;
    }

    let client = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      let parcelRow;
      if (isStaff) {
        const result = await client.query(
          'SELECT id, status FROM parcels WHERE id = $1 AND destination_store_id = $2 FOR UPDATE',
          [parcelId, req.user.store_id],
        );
        parcelRow = result.rows[0];
      } else {
        const result = await client.query(
          'SELECT id, status FROM parcels WHERE id = $1 FOR UPDATE',
          [parcelId],
        );
        parcelRow = result.rows[0];
      }

      if (!parcelRow) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: PARCEL_NOT_FOUND_MESSAGE });
        return;
      }

      if (parcelRow.status !== 'created') {
        await client.query('ROLLBACK');
        res.status(409).json({
          error: `Parcel is already ${parcelRow.status}.`,
        });
        return;
      }

      await client.query(
        `UPDATE parcels SET status = 'arrived', arrived_at = now() WHERE id = $1`,
        [parcelId],
      );

      await client.query(
        `INSERT INTO parcel_events (parcel_id, actor_id, from_status, to_status)
         VALUES ($1, $2, 'created', 'arrived')`,
        [parcelId, req.user.id],
      );

      await client.query('COMMIT');
    } catch (err) {
      if (client !== null) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          // ignore rollback failure
        }
      }
      console.error('Mark parcel arrived failed:', err.message);
      res.status(500).json({ error: 'Could not mark the parcel as arrived.' });
      return;
    } finally {
      if (client !== null) {
        client.release();
      }
    }

    try {
      const selectSql = buildParcelSelect({
        includeSender: true,
        includeSenderCodeEnc: false,
      });
      const result = await pool.query(`${selectSql} WHERE p.id = $1`, [parcelId]);
      const parcel = serializeParcelRow(result.rows[0]);
      res.status(200).json({ parcel });
    } catch (err) {
      console.error('Mark parcel arrived failed:', err.message);
      res.status(500).json({ error: 'Could not fetch the parcel.' });
    }
  },
);

parcelActionsRouter.post(
  '/:id/release',
  requireAuth,
  requireRole('store_staff', 'admin'),
  async (req, res) => {
    const parcelId = req.params.id;

    if (!isValidUuid(parcelId)) {
      res.status(400).json({ error: 'Invalid parcel id.' });
      return;
    }

    const body = req.body ?? {};
    const code = body.code;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: CODE_FORMAT_MESSAGE });
      return;
    }

    const isStaff = req.user.role === 'store_staff';
    if (isStaff && (req.user.store_id === null || req.user.store_id === undefined)) {
      res.status(403).json({ error: STORE_NOT_ATTACHED_MESSAGE });
      return;
    }

    let client = null;
    let collected = false;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      let parcelRow;
      if (isStaff) {
        const result = await client.query(
          `SELECT id, reference, status, code_hash, failed_attempts, locked_at
           FROM parcels
           WHERE id = $1 AND destination_store_id = $2
           FOR UPDATE`,
          [parcelId, req.user.store_id],
        );
        parcelRow = result.rows[0];
      } else {
        const result = await client.query(
          `SELECT id, reference, status, code_hash, failed_attempts, locked_at
           FROM parcels
           WHERE id = $1
           FOR UPDATE`,
          [parcelId],
        );
        parcelRow = result.rows[0];
      }

      if (!parcelRow) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: PARCEL_NOT_FOUND_MESSAGE });
        return;
      }

      if (parcelRow.locked_at !== null) {
        await client.query('ROLLBACK');
        res.status(423).json({ error: LOCKED_MESSAGE });
        return;
      }

      if (parcelRow.status === 'created') {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Parcel has not arrived yet.' });
        return;
      }

      if (parcelRow.status === 'collected') {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Parcel has already been collected.' });
        return;
      }

      const matches = verifyCode(parcelRow.reference, code, parcelRow.code_hash);

      if (!matches) {
        const newFailedAttempts = parcelRow.failed_attempts + 1;
        const nowLocked = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

        if (nowLocked) {
          await client.query(
            'UPDATE parcels SET failed_attempts = $1, locked_at = now() WHERE id = $2',
            [newFailedAttempts, parcelId],
          );
        } else {
          await client.query(
            'UPDATE parcels SET failed_attempts = $1 WHERE id = $2',
            [newFailedAttempts, parcelId],
          );
        }

        await client.query(
          'INSERT INTO release_attempts (parcel_id, actor_id, success) VALUES ($1, $2, false)',
          [parcelId, req.user.id],
        );

        await client.query('COMMIT');

        if (nowLocked) {
          res.status(423).json({ error: LOCKED_MESSAGE });
        } else {
          res.status(400).json({
            error: CODE_MISMATCH_MESSAGE,
            attempts_left: MAX_FAILED_ATTEMPTS - newFailedAttempts,
          });
        }
        return;
      }

      await client.query(
        `UPDATE parcels
         SET status = 'collected', collected_at = now(), failed_attempts = 0
         WHERE id = $1`,
        [parcelId],
      );

      await client.query(
        'INSERT INTO release_attempts (parcel_id, actor_id, success) VALUES ($1, $2, true)',
        [parcelId, req.user.id],
      );

      await client.query(
        `INSERT INTO parcel_events (parcel_id, actor_id, from_status, to_status)
         VALUES ($1, $2, 'arrived', 'collected')`,
        [parcelId, req.user.id],
      );

      await client.query('COMMIT');
      collected = true;
    } catch (err) {
      if (client !== null) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          // ignore rollback failure
        }
      }
      console.error('Release parcel failed:', err.message);
      res.status(500).json({ error: 'Could not release the parcel.' });
      return;
    } finally {
      if (client !== null) {
        client.release();
      }
    }

    if (!collected) {
      return;
    }

    try {
      const selectSql = buildParcelSelect({
        includeSender: true,
        includeSenderCodeEnc: false,
      });
      const result = await pool.query(`${selectSql} WHERE p.id = $1`, [parcelId]);
      const parcel = serializeParcelRow(result.rows[0]);
      res.status(200).json({ parcel });
    } catch (err) {
      console.error('Release parcel failed:', err.message);
      res.status(500).json({ error: 'Could not fetch the parcel.' });
    }
  },
);

parcelActionsRouter.post(
  '/:id/unlock',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const parcelId = req.params.id;

    if (!isValidUuid(parcelId)) {
      res.status(400).json({ error: 'Invalid parcel id.' });
      return;
    }

    let client = null;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const result = await client.query(
        'SELECT id, status FROM parcels WHERE id = $1 FOR UPDATE',
        [parcelId],
      );
      const parcelRow = result.rows[0];

      if (!parcelRow) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: PARCEL_NOT_FOUND_MESSAGE });
        return;
      }

      await client.query(
        'UPDATE parcels SET failed_attempts = 0, locked_at = NULL WHERE id = $1',
        [parcelId],
      );

      await client.query(
        `INSERT INTO parcel_events (parcel_id, actor_id, from_status, to_status, note)
         VALUES ($1, $2, $3, $4, 'release unlocked')`,
        [parcelId, req.user.id, parcelRow.status, parcelRow.status],
      );

      await client.query('COMMIT');
    } catch (err) {
      if (client !== null) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          // ignore rollback failure
        }
      }
      console.error('Unlock parcel failed:', err.message);
      res.status(500).json({ error: 'Could not unlock the parcel.' });
      return;
    } finally {
      if (client !== null) {
        client.release();
      }
    }

    try {
      const selectSql = buildParcelSelect({
        includeSender: true,
        includeSenderCodeEnc: false,
      });
      const result = await pool.query(`${selectSql} WHERE p.id = $1`, [parcelId]);
      const parcel = serializeParcelRow(result.rows[0]);
      res.status(200).json({ parcel });
    } catch (err) {
      console.error('Unlock parcel failed:', err.message);
      res.status(500).json({ error: 'Could not fetch the parcel.' });
    }
  },
);

export { parcelActionsRouter };
