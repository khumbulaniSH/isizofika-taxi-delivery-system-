import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const ALGORITHM = 'scrypt';

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH);
  return `${ALGORITHM}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') {
    return false;
  }

  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== ALGORITHM) {
    return false;
  }

  const saltHex = parts[1];
  const hashHex = parts[2];
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(
    plain,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );

  if (derived.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, expected);
}

const DUMMY_PASSWORD_HASH = await hashPassword(
  crypto.randomBytes(32).toString('hex'),
);

export async function burnPasswordCycles(plain) {
  await verifyPassword(plain, DUMMY_PASSWORD_HASH);
}