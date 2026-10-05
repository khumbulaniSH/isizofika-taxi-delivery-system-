import express from 'express';
import { pool } from '../db.js';
import { hashPassword, verifyPassword, burnPasswordCycles } from '../auth/password.js';
import {
  generateToken,
  hashToken,
  SESSION_TTL_DAYS,
} from '../auth/token.js';
import { validateRegistration, validateLogin } from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';

const authRouter = express.Router();

const DUPLICATE_MESSAGE = 'An account with this phone or email already exists.';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid phone or password.';

const PUBLIC_USER_COLUMNS =
  'id, phone, email, full_name, role, store_id, is_active, created_at';

authRouter.post('/register', async (req, res) => {
  const body = req.body ?? {};
  const { errors, phone, email, fullName } = validateRegistration(body);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const passwordHash = await hashPassword(body.password);

  try {
    const result = await pool.query(
      `INSERT INTO users (phone, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'sender')
       RETURNING ${PUBLIC_USER_COLUMNS}`,
      [phone, email, passwordHash, fullName],
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ error: DUPLICATE_MESSAGE });
      return;
    }
    console.error('Register failed:', err.message);
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

authRouter.post('/login', async (req, res) => {
  const body = req.body ?? {};
  const { errors, phone } = validateLogin(body);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const result = await pool.query(
    `SELECT ${PUBLIC_USER_COLUMNS}, password_hash
     FROM users
     WHERE phone = $1`,
    [phone],
  );

  const user = result.rows[0];

  if (!user) {
    await burnPasswordCycles(body.password);
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  if (!user.is_active) {
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  const passwordMatches = await verifyPassword(body.password, user.password_hash);

  if (!passwordMatches) {
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  const token = generateToken();

  const session = await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))
     RETURNING expires_at`,
    [user.id, hashToken(token), SESSION_TTL_DAYS],
  );

  const { password_hash: storedHash, ...safeUser } = user;

  res.status(200).json({
    token,
    expires_at: session.rows[0].expires_at,
    user: safeUser,
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [
      req.tokenHash,
    ]);
  } catch (err) {
    // Swallow query errors to keep the response consistent and avoid leaking details
  }

  res.status(204).end();
});

export { authRouter };