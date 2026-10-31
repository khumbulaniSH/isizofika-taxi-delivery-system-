import crypto from 'node:crypto';

const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function requireHexKey(variableName) {
  const value = process.env[variableName];
  if (typeof value !== 'string' || !HEX_KEY_PATTERN.test(value)) {
    throw new Error(`${variableName} must be set to 64 hex characters.`);
  }
  if (/^(.)\1*$/.test(value)) {
    throw new Error(`${variableName} must not be a single repeated character.`);
  }

  const otherName =
    variableName === 'PARCEL_CODE_HMAC_KEY' ? 'PARCEL_CODE_KEY' : 'PARCEL_CODE_HMAC_KEY';
  const otherValue = process.env[otherName];
  if (
    typeof otherValue === 'string' &&
    HEX_KEY_PATTERN.test(otherValue) &&
    otherValue.toLowerCase() === value.toLowerCase()
  ) {
    throw new Error(`${variableName} and ${otherName} must be different values.`);
  }

  return Buffer.from(value, 'hex');
}

export function generateCode() {
  const full = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  return {
    full,
    senderPart: full.slice(0, 3),
    recipientPart: full.slice(3),
  };
}

export function generateReference() {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += REFERENCE_ALPHABET[crypto.randomInt(0, REFERENCE_ALPHABET.length)];
  }
  return `ISZ-${suffix}`;
}

export function hashCode(reference, code) {
  const key = requireHexKey('PARCEL_CODE_HMAC_KEY');
  return crypto
    .createHmac('sha256', key)
    .update(`${reference}:${code}`)
    .digest('hex');
}

export function verifyCode(reference, code, storedHash) {
  if (typeof storedHash !== 'string') {
    return false;
  }

  const computedHash = hashCode(reference, code);
  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}

export function encryptString(plaintext) {
  const key = requireHexKey('PARCEL_CODE_KEY');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptString(encoded) {
  const key = requireHexKey('PARCEL_CODE_KEY');
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
