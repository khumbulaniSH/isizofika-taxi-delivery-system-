import express from 'express';
import { pool } from '../db.js';
import { isValidUuid } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { buildParcelSelect, serializeParcelRow } from '../parcels/view.js';

const parcelActionsRouter = express.Router();

const STORE_NOT_ATTACHED_MESSAGE = 'Your account is not attached to a store.';
const PARCEL_NOT_FOUND_MESSAGE = 'Parcel not found.';

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

export { parcelActionsRouter };
