import express from 'express';
import { pool } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { validateRegistration, validateStore } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';

const adminRouter = express.Router();

const DUPLICATE_MESSAGE = 'An account with this phone or email already exists.';
const STORE_DUPLICATE_MESSAGE = 'A store with this name already exists.';
const ALLOWED_ROLES = ['sender', 'store_staff', 'admin'];

const PUBLIC_USER_COLUMNS =
  'id, phone, email, full_name, role, store_id, is_active, created_at';

const STORE_COLUMNS =
  'id, name, address, phone, is_active, created_at';

adminRouter.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const body = req.body ?? {};

    const requestedRole = typeof body.role === 'string' ? body.role.trim() : '';
    if (!ALLOWED_ROLES.includes(requestedRole)) {
      res.status(400).json({
        error: 'Invalid role. Allowed roles are sender, store_staff, admin.',
      });
      return;
    }

    const { errors, phone, email, fullName } = validateRegistration(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    try {
      const result = await pool.query(
        `INSERT INTO users (phone, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${PUBLIC_USER_COLUMNS}`,
        [phone, email, passwordHash, fullName, requestedRole],
      );

      res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        res.status(409).json({ error: DUPLICATE_MESSAGE });
        return;
      }
      console.error('Admin create user failed:', err.message);
      res.status(500).json({ error: 'Could not create the account.' });
    }
  },
);

adminRouter.post(
  '/stores',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const body = req.body ?? {};
    const { errors, name, address, phone } = validateStore(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO stores (name, address, phone)
         VALUES ($1, $2, $3)
         RETURNING ${STORE_COLUMNS}`,
        [name, address, phone === '' ? null : phone],
      );

      res.status(201).json({ store: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        res.status(409).json({ error: STORE_DUPLICATE_MESSAGE });
        return;
      }
      console.error('Admin create store failed:', err.message);
      res.status(500).json({ error: 'Could not create the store.' });
    }
  },
);

adminRouter.get(
  '/stores',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ${STORE_COLUMNS} FROM stores ORDER BY created_at DESC`,
      );
      res.status(200).json({ stores: result.rows });
    } catch (err) {
      console.error('Admin list stores failed:', err.message);
      res.status(500).json({ error: 'Could not fetch stores.' });
    }
  },
);

export { adminRouter };