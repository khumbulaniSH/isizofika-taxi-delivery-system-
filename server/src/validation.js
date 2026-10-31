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

function rankNameError(name) {
  if (name.length < 2 || name.length > 100) {
    return 'Name must be between 2 and 100 characters.';
  }
  return null;
}

function rankTownError(town) {
  if (town.length < 2 || town.length > 100) {
    return 'Town must be between 2 and 100 characters.';
  }
  return null;
}

export function validateTaxiRank(body) {
  const errors = {};

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameError = rankNameError(name);
  if (nameError !== null) {
    errors.name = nameError;
  }

  const town = typeof body.town === 'string' ? body.town.trim() : '';
  const townError = rankTownError(town);
  if (townError !== null) {
    errors.town = townError;
  }

  return { errors, name, town };
}

export function validateTaxiRankUpdate(body) {
  const errors = {};
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const nameError = rankNameError(name);
    if (nameError !== null) {
      errors.name = nameError;
    } else {
      updates.name = name;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'town')) {
    const town = typeof body.town === 'string' ? body.town.trim() : '';
    const townError = rankTownError(town);
    if (townError !== null) {
      errors.town = townError;
    } else {
      updates.town = town;
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

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function johannesburgTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysIso(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isRealCalendarDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateParcel(body) {
  const errors = {};

  const rankId = typeof body.rank_id === 'string' ? body.rank_id.trim() : '';
  if (!isValidUuid(rankId)) {
    errors.rank_id = 'rank_id must be a valid uuid.';
  }

  let storeId = null;
  if (
    Object.prototype.hasOwnProperty.call(body, 'store_id') &&
    body.store_id !== null &&
    body.store_id !== undefined
  ) {
    if (typeof body.store_id === 'string' && isValidUuid(body.store_id.trim())) {
      storeId = body.store_id.trim();
    } else {
      errors.store_id = 'store_id must be a valid uuid.';
    }
  }

  const recipientName = typeof body.recipient_name === 'string' ? body.recipient_name.trim() : '';
  if (recipientName.length < 2 || recipientName.length > 100) {
    errors.recipient_name = 'Recipient name must be between 2 and 100 characters.';
  }

  const recipientPhone = normalizePhone(body.recipient_phone);
  if (!PHONE_PATTERN.test(recipientPhone)) {
    errors.recipient_phone = 'Phone must be in international format, for example +27721234567.';
  }

  let recipientEmail = null;
  if (
    Object.prototype.hasOwnProperty.call(body, 'recipient_email') &&
    body.recipient_email !== null &&
    body.recipient_email !== undefined
  ) {
    recipientEmail = normalizeEmail(body.recipient_email);
    if (recipientEmail !== null) {
      if (!EMAIL_PATTERN.test(recipientEmail) || recipientEmail.length > 254) {
        errors.recipient_email = 'Email must be a valid address of at most 254 characters.';
        recipientEmail = null;
      }
    }
  }

  let description = null;
  if (
    Object.prototype.hasOwnProperty.call(body, 'description') &&
    body.description !== null &&
    body.description !== undefined
  ) {
    if (typeof body.description === 'string') {
      const trimmed = body.description.trim();
      if (trimmed !== '') {
        if (trimmed.length > 200) {
          errors.description = 'Description must be at most 200 characters.';
        } else {
          description = trimmed;
        }
      }
    } else {
      errors.description = 'Description must be at most 200 characters.';
    }
  }

  const handoverDate = typeof body.handover_date === 'string' ? body.handover_date.trim() : '';
  if (!isRealCalendarDate(handoverDate)) {
    errors.handover_date = 'handover_date must be a real calendar date in YYYY-MM-DD format.';
  } else {
    const today = johannesburgTodayIso();
    const maxDate = addDaysIso(today, 14);
    if (handoverDate < today) {
      errors.handover_date = 'handover_date cannot be earlier than today.';
    } else if (handoverDate > maxDate) {
      errors.handover_date = 'handover_date cannot be more than 14 days from today.';
    }
  }

  return {
    errors,
    rankId,
    storeId,
    recipientName,
    recipientPhone,
    recipientEmail,
    description,
    handoverDate,
  };
}

const PARCEL_STATUS_VALUES = ['created', 'in_transit', 'arrived', 'collected'];
const PARCEL_REFERENCE_PATTERN = /^ISZ-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
const PARCEL_LIST_DEFAULT_LIMIT = 20;
const PARCEL_LIST_MAX_LIMIT = 50;

export function validateParcelListQuery(query) {
  const errors = {};

  let status = null;
  if (query.status !== undefined && query.status !== null && query.status !== '') {
    if (typeof query.status === 'string' && PARCEL_STATUS_VALUES.includes(query.status)) {
      status = query.status;
    } else {
      errors.status = `Status must be one of: ${PARCEL_STATUS_VALUES.join(', ')}.`;
    }
  }

  let reference = null;
  if (query.reference !== undefined && query.reference !== null && query.reference !== '') {
    if (typeof query.reference === 'string') {
      const upper = query.reference.trim().toUpperCase();
      if (!PARCEL_REFERENCE_PATTERN.test(upper)) {
        errors.reference = 'Reference must look like ISZ-XXXXXX using the allowed characters.';
      } else {
        reference = upper;
      }
    } else {
      errors.reference = 'Reference must look like ISZ-XXXXXX using the allowed characters.';
    }
  }

  let page = 1;
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    if (typeof query.page !== 'string') {
      errors.page = 'Page must be an integer of at least 1.';
    } else {
      const parsed = Number(query.page);
      if (!Number.isInteger(parsed) || parsed < 1 || String(query.page).trim() === '') {
        errors.page = 'Page must be an integer of at least 1.';
      } else {
        page = parsed;
      }
    }
  }

  let limit = PARCEL_LIST_DEFAULT_LIMIT;
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    if (typeof query.limit !== 'string') {
      errors.limit = `Limit must be an integer between 1 and ${PARCEL_LIST_MAX_LIMIT}.`;
    } else {
      const parsed = Number(query.limit);
      if (
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > PARCEL_LIST_MAX_LIMIT ||
        String(query.limit).trim() === ''
      ) {
        errors.limit = `Limit must be an integer between 1 and ${PARCEL_LIST_MAX_LIMIT}.`;
      } else {
        limit = parsed;
      }
    }
  }

  return { errors, status, reference, page, limit };
}

export function validateAppSettingsUpdate(body) {
  const errors = {};
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'storage_free_days')) {
    const value = body.storage_free_days;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.storage_free_days = 'storage_free_days must be an integer.';
    } else if (value < 0 || value > 60) {
      errors.storage_free_days = 'storage_free_days must be between 0 and 60.';
    } else {
      updates.storage_free_days = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'storage_fee_per_day_cents')) {
    const value = body.storage_fee_per_day_cents;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.storage_fee_per_day_cents = 'storage_fee_per_day_cents must be an integer.';
    } else if (value < 0 || value > 100000) {
      errors.storage_fee_per_day_cents = 'storage_fee_per_day_cents must be between 0 and 100000.';
    } else {
      updates.storage_fee_per_day_cents = value;
    }
  }

  return { errors, updates };
}