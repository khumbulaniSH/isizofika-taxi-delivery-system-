const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_PHONE = 5;
const MAX_PER_IP = 20;

const phoneFailures = new Map();
const ipFailures = new Map();

function getClientIp(req) {
  if (req.ip) {
    return req.ip;
  }
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const [first] = forwarded.split(',');
    return first.trim();
  }
  return 'unknown';
}

function prune(map, now, key) {
  const entries = map.get(key);
  if (!entries) {
    return;
  }

  const pruned = entries.filter((ts) => now - ts < WINDOW_MS);
  if (pruned.length === 0) {
    map.delete(key);
    return;
  }

  map.set(key, pruned);
}

function countFailures(map, key, now) {
  prune(map, now, key);
  const entries = map.get(key);
  return entries ? entries.length : 0;
}

function record(map, key, now) {
  const entries = map.get(key);
  if (entries) {
    entries.push(now);
    return;
  }
  map.set(key, [now]);
}

function oldestTimestamp(map, key) {
  const entries = map.get(key);
  if (!entries || entries.length === 0) {
    return Date.now();
  }
  let oldest = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i] < oldest) {
      oldest = entries[i];
    }
  }
  return oldest;
}

function computeRetryAfter(oldestTs, now) {
  const seconds = Math.ceil((oldestTs + WINDOW_MS - now) / 1000);
  if (seconds < 1) {
    return '1';
  }
  return String(seconds);
}

export function checkLimit(phone, req) {
  if (!phone) {
    return { blocked: false };
  }

  const now = Date.now();
  const ip = getClientIp(req);

  const phoneCount = countFailures(phoneFailures, phone, now);
  const ipCount = countFailures(ipFailures, ip, now);

  if (phoneCount >= MAX_PER_PHONE || ipCount >= MAX_PER_IP) {
    const oldestTs =
      phoneCount >= MAX_PER_PHONE && ipCount >= MAX_PER_IP
        ? Math.min(oldestTimestamp(phoneFailures, phone), oldestTimestamp(ipFailures, ip))
        : phoneCount >= MAX_PER_PHONE
          ? oldestTimestamp(phoneFailures, phone)
          : oldestTimestamp(ipFailures, ip);
    const retryAfter = computeRetryAfter(oldestTs, now);
    return { blocked: true, retryAfter };
  }

  return { blocked: false };
}

export function recordFailure(phone, req) {
  if (!phone) {
    return;
  }

  const now = Date.now();
  const ip = getClientIp(req);

  record(phoneFailures, phone, now);
  record(ipFailures, ip, now);
}

export function clearPhone(phone) {
  if (!phone) {
    return;
  }
  phoneFailures.delete(phone);
}

function sweep() {
  const now = Date.now();
  for (const [key, entries] of phoneFailures.entries()) {
    const pruned = entries.filter((ts) => now - ts < WINDOW_MS);
    if (pruned.length === 0) {
      phoneFailures.delete(key);
    } else if (pruned.length !== entries.length) {
      phoneFailures.set(key, pruned);
    }
  }
  for (const [key, entries] of ipFailures.entries()) {
    const pruned = entries.filter((ts) => now - ts < WINDOW_MS);
    if (pruned.length === 0) {
      ipFailures.delete(key);
    } else if (pruned.length !== entries.length) {
      ipFailures.set(key, pruned);
    }
  }
}

const cleanupTimer = setInterval(sweep, 5 * 60 * 1000);
cleanupTimer.unref();