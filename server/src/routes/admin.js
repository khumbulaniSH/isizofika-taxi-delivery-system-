import express from 'express';
import { pool } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { validateRegistration, validateStore, validateStoreUpdate, isValidUuid } from '../validation.js';
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

adminRouter.patch(
  '/stores/:id',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const storeId = req.params.id;

    if (!isValidUuid(storeId)) {
      res.status(400).json({ error: 'Invalid store id.' });
      return;
    }

    const body = req.body ?? {};
    const { errors, updates } = validateStoreUpdate(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const FIELD_COLUMNS = {
      name: 'name',
      address: 'address',
      phone: 'phone',
      is_active: 'is_active',
    };

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
        .json({ error: 'Provide at least one of name, address, phone, is_active.' });
      return;
    }

    values.push(storeId);

    try {
      const result = await pool.query(
        `UPDATE stores SET ${sets.join(', ')}
         WHERE id = $${values.length}
         RETURNING ${STORE_COLUMNS}`,
        values,
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Store not found.' });
        return;
      }

      res.status(200).json({ store: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        res.status(409).json({ error: STORE_DUPLICATE_MESSAGE });
        return;
      }
      console.error('Admin update store failed:', err.message);
      res.status(500).json({ error: 'Could not update the store.' });
    }
  },
);

adminRouter.patch(
  '/users/:id/store',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    const userId = req.params.id;

    if (!isValidUuid(userId)) {
      res.status(400).json({ error: 'Invalid user id.' });
      return;
    }

    let userResult;
    try {
      userResult = await pool.query(
        `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`,
        [userId],
      );
    } catch (err) {
      console.error('Admin attach store failed:', err.message);
      res.status(500).json({ error: 'Could not update the user.' });
      return;
    }

    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (user.role !== 'store_staff') {
      res
        .status(400)
        .json({ error: 'Only store_staff users can be attached to a store.' });
      return;
    }

    const body = req.body ?? {};
    const storeId = body.store_id;

    if (storeId !== null) {
      if (!isValidUuid(storeId)) {
        res.status(400).json({ error: 'Invalid store id.' });
        return;
      }

      let storeResult;
      try {
        storeResult = await pool.query(
          'SELECT is_active FROM stores WHERE id = $1',
          [storeId],
        );
      } catch (err) {
        console.error('Admin attach store failed:', err.message);
        res.status(500).json({ error: 'Could not update the user.' });
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
    }

    try {
      const result = await pool.query(
        `UPDATE users SET store_id = $1 WHERE id = $2
         RETURNING ${PUBLIC_USER_COLUMNS}`,
        [storeId, userId],
      );

      res.status(200).json({ user: result.rows[0] });
    } catch (err) {
      console.error('Admin attach store failed:', err.message);
      res.status(500).json({ error: 'Could not update the user.' });
    }
  },
);

export { adminRouter };