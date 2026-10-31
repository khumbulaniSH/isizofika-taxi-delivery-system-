import express from 'express';
import { pool } from '../db.js';
import { validateParcel, validateParcelListQuery, isValidUuid } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import {
  generateCode,
  generateReference,
  hashCode,
  encryptString,
  decryptString,
} from '../parcels/codes.js';
import {
  buildNotificationRows,
  printDevNotifications,
} from '../parcels/notifications.js';
import {
  buildParcelSelect,
  serializeParcelRow,
  DISPLAYED_STATUS_SQL,
} from '../parcels/view.js';

const parcelsRouter = express.Router();

const MAX_REFERENCE_ATTEMPTS = 5;

const PARCEL_NOT_FOUND_MESSAGE = 'Parcel not found.';
const STORE_NOT_ATTACHED_MESSAGE = 'Your account is not attached to a store.';

function parcelVisibility(user) {
  if (user.role === 'sender') {
    return {
      roleClause: 'p.sender_id = $1',
      roleValues: [user.id],
      includeSender: false,
      includeSenderCodeEnc: true,
    };
  }

  if (user.role === 'store_staff') {
    if (user.store_id === null || user.store_id === undefined) {
      return null;
    }
    return {
      roleClause: 'p.destination_store_id = $1',
      roleValues: [user.store_id],
      includeSender: true,
      includeSenderCodeEnc: false,
    };
  }

  if (user.role === 'admin') {
    return {
      roleClause: null,
      roleValues: [],
      includeSender: true,
      includeSenderCodeEnc: false,
    };
  }

  return null;
}

function senderCodePartFromRow(row) {
  try {
    return decryptString(row.sender_code_part_enc);
  } catch {
    return null;
  }
}

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

parcelsRouter.get('/', requireAuth, async (req, res) => {
  const visibility = parcelVisibility(req.user);
  if (visibility === null) {
    if (req.user.role === 'store_staff') {
      res.status(403).json({ error: STORE_NOT_ATTACHED_MESSAGE });
      return;
    }
    res.status(403).json({ error: 'You do not have permission to view parcels.' });
    return;
  }

  const { errors, status, reference, page, limit } = validateParcelListQuery(req.query);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const conditions = [];
  const values = [];

  if (visibility.roleClause !== null) {
    values.push(...visibility.roleValues);
    conditions.push(visibility.roleClause);
  }

  if (status !== null) {
    values.push(status);
    conditions.push(`${DISPLAYED_STATUS_SQL} = $${values.length}`);
  }

  if (reference !== null) {
    values.push(reference);
    conditions.push(`p.reference = $${values.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const selectSql = buildParcelSelect({
    includeSender: visibility.includeSender,
    includeSenderCodeEnc: visibility.includeSenderCodeEnc,
  });

  let rows;
  let total;
  try {
    const listResult = await pool.query(
      `${selectSql} ${whereSql}
       ORDER BY p.created_at DESC, p.id
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    rows = listResult.rows;

    const countValues = values.slice(0, values.length - 2);
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM parcels p
       ${whereSql}`,
      countValues,
    );
    total = countResult.rows[0].total;
  } catch (err) {
    console.error('List parcels failed:', err.message);
    res.status(500).json({ error: 'Could not fetch parcels.' });
    return;
  }

  const parcels = rows.map((row) => {
    if (visibility.includeSenderCodeEnc) {
      const senderCodePart = senderCodePartFromRow(row);
      return serializeParcelRow(row, { senderCodePart });
    }
    return serializeParcelRow(row);
  });

  res.status(200).json({ parcels, page, limit, total });
});

parcelsRouter.get('/:id', requireAuth, async (req, res) => {
  const parcelId = req.params.id;

  if (!isValidUuid(parcelId)) {
    res.status(400).json({ error: 'Invalid parcel id.' });
    return;
  }

  const visibility = parcelVisibility(req.user);
  if (visibility === null) {
    if (req.user.role === 'store_staff') {
      res.status(403).json({ error: STORE_NOT_ATTACHED_MESSAGE });
      return;
    }
    res.status(403).json({ error: 'You do not have permission to view parcels.' });
    return;
  }

  const values = [...visibility.roleValues, parcelId];

  let whereSql = `p.id = $${values.length}`;
  if (visibility.roleClause !== null) {
    whereSql = `${visibility.roleClause} AND ${whereSql}`;
  }

  const selectSql = buildParcelSelect({
    includeSender: visibility.includeSender,
    includeSenderCodeEnc: visibility.includeSenderCodeEnc,
  });

  let row;
  try {
    const result = await pool.query(
      `${selectSql} WHERE ${whereSql}`,
      values,
    );
    row = result.rows[0];
  } catch (err) {
    console.error('Get parcel failed:', err.message);
    res.status(500).json({ error: 'Could not fetch the parcel.' });
    return;
  }

  if (!row) {
    res.status(404).json({ error: PARCEL_NOT_FOUND_MESSAGE });
    return;
  }

  let payload;
  if (visibility.includeSenderCodeEnc) {
    const senderCodePart = senderCodePartFromRow(row);
    payload = serializeParcelRow(row, { senderCodePart });
  } else {
    payload = serializeParcelRow(row);
  }

  res.status(200).json({ parcel: payload });
});

export { parcelsRouter };
