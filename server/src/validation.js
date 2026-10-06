const PHONE_PATTERN = /^\+[0-9]{8,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD_LENGTH = 8;

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

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

function storeNameError(name) {
  if (name.length < 2 || name.length > 100) {
    return 'Name must be between 2 and 100 characters.';
  }
  return null;
}

function storeAddressError(address) {
  if (address.length < 5 || address.length > 200) {
    return 'Address must be between 5 and 200 characters.';
  }
  return null;
}

function storePhoneError(phone) {
  if (phone !== '' && !PHONE_PATTERN.test(phone)) {
    return 'Phone must be in international format, for example +27721234567.';
  }
  return null;
}

export function validateStore(body) {
  const errors = {};

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameError = storeNameError(name);
  if (nameError !== null) {
    errors.name = nameError;
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const addressError = storeAddressError(address);
  if (addressError !== null) {
    errors.address = addressError;
  }

  const phone = normalizePhone(body.phone);
  const phoneError = storePhoneError(phone);
  if (phoneError !== null) {
    errors.phone = phoneError;
  }

  return { errors, name, address, phone };
}

export function validateStoreUpdate(body) {
  const errors = {};
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const nameError = storeNameError(name);
    if (nameError !== null) {
      errors.name = nameError;
    } else {
      updates.name = name;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'address')) {
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const addressError = storeAddressError(address);
    if (addressError !== null) {
      errors.address = addressError;
    } else {
      updates.address = address;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    if (body.phone === null) {
      updates.phone = null;
    } else if (typeof body.phone === 'string') {
      const phone = normalizePhone(body.phone);
      const phoneError = storePhoneError(phone);
      if (phoneError !== null) {
        errors.phone = phoneError;
      } else {
        updates.phone = phone === '' ? null : phone;
      }
    } else {
      errors.phone = 'Phone must be in international format, for example +27721234567.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') {
      errors.is_active = 'is_active must be true or false.';
    } else {
      updates.is_active = body.is_active;
    }
  }

  return { errors, updates };
}