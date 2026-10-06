import express from 'express';
import { pool } from '../db.js';
import { hashPassword, verifyPassword, burnPasswordCycles } from '../auth/password.js';
import {
  generateToken,
  hashToken,
  SESSION_TTL_DAYS,
} from '../auth/token.js';
import {
  validateRegistration,
  validateLogin,
  validateChangePassword,
} from '../validation.js';
import { requireAuth } from '../auth/requireAuth.js';
import { checkLimit, recordFailure, clearPhone } from '../auth/loginRateLimit.js';

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

  const limit = checkLimit(phone, req);
  if (limit.blocked) {
    res
      .status(429)
      .set('Retry-After', limit.retryAfter)
      .json({ error: 'Too many attempts. Try again later.' });
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
    recordFailure(phone, req);
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  if (!user.is_active) {
    recordFailure(phone, req);
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  const passwordMatches = await verifyPassword(body.password, user.password_hash);

  if (!passwordMatches) {
    recordFailure(phone, req);
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  clearPhone(phone);

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

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const limit = checkLimit(req.user.phone, req);
  if (limit.blocked) {
    res
      .status(429)
      .set('Retry-After', limit.retryAfter)
      .json({ error: 'Too many attempts. Try again later.' });
    return;
  }

  const body = req.body ?? {};
  const { errors } = validateChangePassword(body);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const currentPassword = body.current_password;
  const newPassword = body.new_password;

  const userResult = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id],
  );

  const storedHash = userResult.rows[0]?.password_hash;
  const passwordMatches = storedHash
    ? await verifyPassword(currentPassword, storedHash)
    : false;

  if (!passwordMatches) {
    recordFailure(req.user.phone, req);
    res.status(403).json({ error: 'Current password is incorrect.' });
    return;
  }

  clearPhone(req.user.phone);

  const newPasswordHash = await hashPassword(newPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      newPasswordHash,
      req.user.id,
    ]);
    await client.query(
      'DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2',
      [req.user.id, req.tokenHash],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Change password failed:', err.message);
    res.status(500).json({ error: 'Could not change the password.' });
    return;
  } finally {
    client.release();
  }

  res.status(204).end();
});

export { authRouter };