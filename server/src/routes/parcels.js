import express from 'express';
import { pool } from '../db.js';
import { validateParcel } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import {
  generateCode,
  generateReference,
  hashCode,
  encryptString,
} from '../parcels/codes.js';
import {
  buildNotificationRows,
  printDevNotifications,
} from '../parcels/notifications.js';

const parcelsRouter = express.Router();

const MAX_REFERENCE_ATTEMPTS = 5;

parcelsRouter.post(
  '/',
  requireAuth,
  requireRole('sender'),
  async (req, res) => {
    const body = req.body ?? {};
    const {
      errors,
      rankId,
      storeId,
      recipientName,
      recipientPhone,
      recipientEmail,
      description,
      handoverDate,
    } = validateParcel(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    let rankRow;
    try {
      const result = await pool.query(
        'SELECT id, name, town, is_active FROM taxi_ranks WHERE id = $1',
        [rankId],
      );
      rankRow = result.rows[0];
    } catch (err) {
      console.error('Create parcel failed:', err.message);
      res.status(500).json({ error: 'Could not create the parcel.' });
      return;
    }

    if (!rankRow) {
      res.status(404).json({ error: 'Taxi rank not found.' });
      return;
    }

    if (!rankRow.is_active) {
      res.status(400).json({ error: 'Taxi rank is not active.' });
      return;
    }

    let storeRows;
    try {
      const result = await pool.query(
        `SELECT s.id, s.name, s.address
         FROM rank_stores rs
         JOIN stores s ON s.id = rs.store_id
         WHERE rs.rank_id = $1 AND s.is_active = true
         ORDER BY s.name`,
        [rankId],
      );
      storeRows = result.rows;
    } catch (err) {
      console.error('Create parcel failed:', err.message);
      res.status(500).json({ error: 'Could not create the parcel.' });
      return;
    }

    if (storeRows.length === 0) {
      res.status(400).json({ error: 'This taxi rank has no active destination stores.' });
      return;
    }

    let destinationStore;
    if (storeRows.length === 1) {
      destinationStore = storeRows[0];
      if (storeId !== null && storeId !== destinationStore.id) {
        res.status(400).json({
          error: 'This taxi rank has only one destination store and it does not match store_id.',
        });
        return;
      }
    } else {
      if (storeId === null) {
        res.status(400).json({
          error: 'store_id is required when the taxi rank has more than one destination store.',
        });
        return;
      }
      destinationStore = storeRows.find((row) => row.id === storeId);
      if (!destinationStore) {
        res.status(400).json({
          error: 'store_id must be one of the active destination stores for this taxi rank.',
        });
        return;
      }
    }

    let created = false;
    let parcel;
    let senderCodePart;
    let recipientCodePart;

    for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS && !created; attempt += 1) {
      const reference = generateReference();
      const code = generateCode();

      let codeHash;
      let senderCodePartEnc;
      try {
        codeHash = hashCode(reference, code.full);
        senderCodePartEnc = encryptString(code.senderPart);
      } catch (err) {
        console.error('Create parcel failed:', err.message);
        res.status(500).json({ error: 'Could not create the parcel.' });
        return;
      }

      let client = null;
      try {
        client = await pool.connect();
        await client.query('BEGIN');

        const parcelResult = await client.query(
          `INSERT INTO parcels (
             reference, sender_id, rank_id, destination_store_id,
             recipient_name, recipient_phone, recipient_email,
             description, handover_date, code_hash, sender_code_part_enc
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, reference, recipient_name, recipient_phone, recipient_email,
             description, to_char(handover_date, 'YYYY-MM-DD') AS handover_date,
             status, created_at`,
          [
            reference,
            req.user.id,
            rankId,
            destinationStore.id,
            recipientName,
            recipientPhone,
            recipientEmail,
            description,
            handoverDate,
            codeHash,
            senderCodePartEnc,
          ],
        );

        const inserted = parcelResult.rows[0];

        const notificationRows = buildNotificationRows({
          parcelId: inserted.id,
          recipientPhone,
          recipientEmail,
          recipientCodePart: code.recipientPart,
        });

        for (const row of notificationRows) {
          await client.query(
            `INSERT INTO notifications (parcel_id, channel, recipient, code_part_enc)
             VALUES ($1, $2, $3, $4)`,
            [row.parcel_id, row.channel, row.recipient, row.code_part_enc],
          );
        }

        await client.query('COMMIT');

        parcel = {
          id: inserted.id,
          reference: inserted.reference,
          rank: { id: rankRow.id, name: rankRow.name, town: rankRow.town },
          destination_store: {
            id: destinationStore.id,
            name: destinationStore.name,
            address: destinationStore.address,
          },
          recipient_name: inserted.recipient_name,
          recipient_phone: inserted.recipient_phone,
          recipient_email: inserted.recipient_email,
          description: inserted.description,
          handover_date: inserted.handover_date,
          status: inserted.status,
          created_at: inserted.created_at,
        };
        senderCodePart = code.senderPart;
        recipientCodePart = code.recipientPart;
        created = true;
      } catch (err) {
        if (client !== null) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackErr) {
            // ignore rollback failure
          }
        }

        if (err.code === '23505' && attempt < MAX_REFERENCE_ATTEMPTS) {
          continue;
        }

        console.error('Create parcel failed:', err.message);
        res.status(500).json({ error: 'Could not create the parcel.' });
        return;
      } finally {
        if (client !== null) {
          client.release();
        }
      }
    }

    if (!created) {
      res.status(500).json({ error: 'Could not create the parcel.' });
      return;
    }

    printDevNotifications({
      recipientPhone,
      recipientEmail,
      recipientCodePart,
    });

    res.status(201).json({ parcel, sender_code_part: senderCodePart });
  },
);

export { parcelsRouter };
