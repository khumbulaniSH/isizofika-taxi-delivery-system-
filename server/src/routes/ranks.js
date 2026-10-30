import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth/requireAuth.js';

const ranksRouter = express.Router();

ranksRouter.get(
  '/',
  requireAuth,
  async (req, res) => {
    let rankRows;
    try {
      const result = await pool.query(
        `SELECT r.id, r.name, r.town
         FROM taxi_ranks r
         WHERE r.is_active = true
           AND EXISTS (
             SELECT 1
             FROM rank_stores rs
             JOIN stores s ON s.id = rs.store_id
             WHERE rs.rank_id = r.id AND s.is_active = true
           )
         ORDER BY r.town, r.name`,
      );
      rankRows = result.rows;
    } catch (err) {
      console.error('List taxi ranks failed:', err.message);
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
        `SELECT rs.rank_id, s.id, s.name, s.address
         FROM rank_stores rs
         JOIN stores s ON s.id = rs.store_id
         WHERE s.is_active = true
           AND rs.rank_id = ANY($1)
         ORDER BY s.name`,
        [rankRows.map((row) => row.id)],
      );
      storeRows = result.rows;
    } catch (err) {
      console.error('List taxi ranks failed:', err.message);
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
        address: row.address,
      });
    }

    const ranks = rankRows.map((row) => ({
      id: row.id,
      name: row.name,
      town: row.town,
      stores: storesByRank.get(row.id) ?? [],
    }));

    res.status(200).json({ ranks });
  },
);

export { ranksRouter };
