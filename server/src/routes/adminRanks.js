import express from 'express';
import { pool } from '../db.js';
import { validateTaxiRank, validateTaxiRankUpdate, isValidUuid } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';

const adminRanksRouter = express.Router();

const RANK_DUPLICATE_MESSAGE = 'A taxi rank with this name and town already exists.';

const RANK_COLUMNS = 'id, name, town, is_active, created_at';

const FIELD_COLUMNS = {
  name: 'name',
  town: 'town',
  is_active: 'is_active',
};

adminRanksRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const body = req.body ?? {};
    const { errors, name, town } = validateTaxiRank(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO taxi_ranks (name, town)
         VALUES ($1, $2)
         RETURNING ${RANK_COLUMNS}`,
        [name, town],
      );

      res.status(201).json({ rank: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        res.status(409).json({ error: RANK_DUPLICATE_MESSAGE });
        return;
      }
      console.error('Admin create taxi rank failed:', err.message);
      res.status(500).json({ error: 'Could not create the taxi rank.' });
    }
  },
);

adminRanksRouter.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ${RANK_COLUMNS} FROM taxi_ranks ORDER BY created_at DESC`,
      );
      res.status(200).json({ ranks: result.rows });
    } catch (err) {
      console.error('Admin list taxi ranks failed:', err.message);
      res.status(500).json({ error: 'Could not fetch taxi ranks.' });
    }
  },
);

adminRanksRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const rankId = req.params.id;

    if (!isValidUuid(rankId)) {
      res.status(400).json({ error: 'Invalid taxi rank id.' });
      return;
    }

    const body = req.body ?? {};
    const { errors, updates } = validateTaxiRankUpdate(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const sets = [];
    const values = [];

    for (const field of Object.keys(FIELD_COLUMNS)) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        values.push(updates[field]);
        sets.push(`${FIELD_COLUMNS[field]} = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      res
        .status(400)
        .json({ error: 'Provide at least one of name, town, is_active.' });
      return;
    }

    values.push(rankId);

    try {
      const result = await pool.query(
        `UPDATE taxi_ranks SET ${sets.join(', ')}
         WHERE id = $${values.length}
         RETURNING ${RANK_COLUMNS}`,
        values,
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Taxi rank not found.' });
        return;
      }

      res.status(200).json({ rank: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        res.status(409).json({ error: RANK_DUPLICATE_MESSAGE });
        return;
      }
      console.error('Admin update taxi rank failed:', err.message);
      res.status(500).json({ error: 'Could not update the taxi rank.' });
    }
  },
);

export { adminRanksRouter };
