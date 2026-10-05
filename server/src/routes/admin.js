import express from 'express';
import { pool } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { validateRegistration } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';

const adminRouter = express.Router();

const DUPLICATE_MESSAGE = 'An account with this phone or email already exists.';
const ALLOWED_ROLES = ['sender', 'store_staff', 'admin'];

const PUBLIC_USER_COLUMNS =
  'id, phone, email, full_name, role, store_id, is_active, created_at';

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

export { adminRouter };