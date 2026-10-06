import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth/requireAuth.js';

const storesRouter = express.Router();

storesRouter.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, address, phone
       FROM stores
       WHERE is_active = true
       ORDER BY name ASC`,
    );
    res.status(200).json({ stores: result.rows });
  } catch (err) {
    console.error('List stores failed:', err.message);
    res.status(500).json({ error: 'Could not fetch stores.' });
  }
});

export { storesRouter };
