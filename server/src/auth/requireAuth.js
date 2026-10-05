import { hashToken } from './token.js';
import { pool } from '../db.js';

const UNAUTHORIZED_MESSAGE = 'Unauthorized';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: UNAUTHORIZED_MESSAGE });
    return;
  }

  const [scheme, token] = authHeader.split(' ', 2);

  if (scheme !== 'Bearer' || !token || token.trim() === '') {
    res.status(401).json({ error: UNAUTHORIZED_MESSAGE });
    return;
  }

  const tokenHash = hashToken(token);

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.phone,
         u.email,
         u.full_name,
         u.role,
         u.store_id,
         u.is_active,
         u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > now()
         AND u.is_active = true`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: UNAUTHORIZED_MESSAGE });
      return;
    }

    req.user = result.rows[0];
    req.tokenHash = tokenHash;
    next();
  } catch (err) {
    res.status(401).json({ error: UNAUTHORIZED_MESSAGE });
    return;
  }
}