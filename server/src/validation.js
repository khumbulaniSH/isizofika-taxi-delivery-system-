const PHONE_PATTERN = /^\+[0-9]{8,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function normalizePhone(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

export function normalizeFullName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateRegistration(body) {
  const errors = {};

  const phone = normalizePhone(body.phone);
  if (!PHONE_PATTERN.test(phone)) {
    errors.phone = 'Phone must be in international format, for example +27721234567.';
  }

  const fullName = normalizeFullName(body.full_name);
  if (fullName === '') {
    errors.full_name = 'Full name is required.';
  }

  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  const email = normalizeEmail(body.email);
  if (email !== null && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Email must be a valid address.';
  }

  return { errors, phone, email, fullName };
}

export function validateLogin(body) {
  const errors = {};

  const phone = normalizePhone(body.phone);
  if (!PHONE_PATTERN.test(phone)) {
    errors.phone = 'Phone must be in international format, for example +27721234567.';
  }

  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return { errors, phone };
}

export function validateChangePassword(body) {
  const errors = {};

  if (typeof body.current_password !== 'string') {
    errors.current_password = 'Current password is required.';
  }

  if (typeof body.new_password !== 'string' || body.new_password.length < MIN_PASSWORD_LENGTH) {
    errors.new_password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    return { errors };
  }

  if (body.new_password === body.current_password) {
    errors.new_password = 'New password must be different from current password.';
  }

  return { errors };
}