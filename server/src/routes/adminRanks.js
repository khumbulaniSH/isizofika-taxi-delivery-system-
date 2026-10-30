import express from 'express';
import { pool } from '../db.js';
import { validateTaxiRank, validateTaxiRankUpdate, isValidUuid } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';

const adminRanksRouter = express.Router();

const RANK_DUPLICATE_MESSAGE = 'A taxi rank with this name and town already exists.';
const LINK_DUPLICATE_MESSAGE = 'This store is already linked to this taxi rank.';

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
    let rankRows;
    try {
      const result = await pool.query(
        `SELECT ${RANK_COLUMNS} FROM taxi_ranks ORDER BY created_at DESC`,
      );
      rankRows = result.rows;
    } catch (err) {
      console.error('Admin list taxi ranks failed:', err.message);
      res.status(500).json({ error: 'Could not fetch taxi ranks.' });
      return;
    }

    if (rankRows.length === 0) {
      res.status(200).json({ ranks: [] });
      return;
    }

    let storeRows;
    try {
      const result = await pool.query(
        `SELECT rs.rank_id, s.id, s.name, s.is_active
         FROM rank_stores rs
         JOIN stores s ON s.id = rs.store_id
         WHERE rs.rank_id = ANY($1)
         ORDER BY s.name`,
        [rankRows.map((row) => row.id)],
      );
      storeRows = result.rows;
    } catch (err) {
      console.error('Admin list taxi ranks failed:', err.message);
      res.status(500).json({ error: 'Could not fetch taxi ranks.' });
      return;
    }

    const storesByRank = new Map();
    for (const row of storeRows) {
      if (!storesByRank.has(row.rank_id)) {
        storesByRank.set(row.rank_id, []);
      }
      storesByRank.get(row.rank_id).push({
        id: row.id,
        name: row.name,
        is_active: row.is_active,
      });
    }

    const ranks = rankRows.map((row) => ({
      ...row,
      stores: storesByRank.get(row.id) ?? [],
    }));

    res.status(200).json({ ranks });
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

adminRanksRouter.post(
  '/:id/stores',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const rankId = req.params.id;

    if (!isValidUuid(rankId)) {
      res.status(400).json({ error: 'Invalid taxi rank id.' });
      return;
    }

    const body = req.body ?? {};
    const storeId = body.store_id;

    if (!isValidUuid(storeId)) {
      res.status(400).json({ error: 'Invalid store id.' });
      return;
    }

    let rankResult;
    try {
      rankResult = await pool.query('SELECT id FROM taxi_ranks WHERE id = $1', [rankId]);
    } catch (err) {
      console.error('Admin link store to rank failed:', err.message);
      res.status(500).json({ error: 'Could not link the store.' });
      return;
    }

    if (rankResult.rows.length === 0) {
      res.status(404).json({ error: 'Taxi rank not found.' });
      return;
    }

    let storeResult;
    try {
      storeResult = await pool.query('SELECT is_active FROM stores WHERE id = $1', [storeId]);
    } catch (err) {
      console.error('Admin link store to rank failed:', err.message);
      res.status(500).json({ error: 'Could not link the store.' });
      return;
    }

    const store = storeResult.rows[0];
    if (!store) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    if (!store.is_active) {
      res.status(400).json({ error: 'Store is not active.' });
      return;
    }

    try {
      await pool.query(
        'INSERT INTO rank_stores (rank_id, store_id) VALUES ($1, $2)',
        [rankId, storeId],
      );

      res.status(201).json({ rank_id: rankId, store_id: storeId });
    } catch (err) {
      if (err.code === '23505') {
        res.status(409).json({ error: LINK_DUPLICATE_MESSAGE });
        return;
      }
      console.error('Admin link store to rank failed:', err.message);
      res.status(500).json({ error: 'Could not link the store.' });
    }
  },
);

adminRanksRouter.delete(
  '/:id/stores/:storeId',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const rankId = req.params.id;
    const storeId = req.params.storeId;

    if (!isValidUuid(rankId)) {
      res.status(400).json({ error: 'Invalid taxi rank id.' });
      return;
    }

    if (!isValidUuid(storeId)) {
      res.status(400).json({ error: 'Invalid store id.' });
      return;
    }

    try {
      const result = await pool.query(
        'DELETE FROM rank_stores WHERE rank_id = $1 AND store_id = $2',
        [rankId, storeId],
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Link not found.' });
        return;
      }

      res.status(204).send();
    } catch (err) {
      console.error('Admin unlink store from rank failed:', err.message);
      res.status(500).json({ error: 'Could not unlink the store.' });
    }
  },
);

export { adminRanksRouter };
