import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { validateRegistration } from '../src/validation.js';

const ROLE = 'admin';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

async function ask(question) {
  const answer = await rl.question(question);
  return answer.trim();
}

async function askSecret(question) {
  const sink = new Writable({
    write(chunk, encoding, callback) {
      callback();
    },
  });

  const previousOutput = rl.output;
  rl.output = sink;

  let answer;
  try {
    answer = await rl.question(question);
  } finally {
    rl.output = previousOutput;
    process.stdout.write('\n');
  }

  return answer;
}

function fail(message) {
  console.error(`${message} Nothing was created.`);
  process.exitCode = 1;
}

async function main() {
  const phone = await ask('Phone (international format, for example +27721234567): ');
  const fullName = await ask('Full name: ');

  const password = await askSecret('Password: ');
  const passwordConfirm = await askSecret('Confirm password: ');

  if (password !== passwordConfirm) {
    fail('Passwords do not match.');
    return;
  }

  const { errors, phone: validPhone, fullName: validFullName } =
    validateRegistration({ phone, full_name: fullName, password });

  if (Object.keys(errors).length > 0) {
    for (const [field, message] of Object.entries(errors)) {
      console.error(`${field}: ${message}`);
    }
    console.error('Nothing was created.');
    process.exitCode = 1;
    return;
  }

  const existing = await pool.query(
    'SELECT 1 FROM users WHERE phone = $1',
    [validPhone],
  );

  if (existing.rowCount > 0) {
    fail(`A user with phone ${validPhone} already exists.`);
    return;
  }

  console.log(`Phone:     ${validPhone}`);
  console.log(`Full name: ${validFullName}`);

  const confirm = (await ask('Create this admin? (y/N) ')).toLowerCase();
  if (confirm !== 'y' && confirm !== 'yes') {
    console.log('Not created.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);

  try {
    await pool.query(
      `INSERT INTO users (phone, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)`,
      [validPhone, passwordHash, validFullName, ROLE],
    );
  } catch (err) {
    if (err.code === '23505') {
      fail(`A user with phone ${validPhone} already exists.`);
      return;
    }
    console.error(`Could not create the admin. ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Admin created for phone ${validPhone}.`);
}

main()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await pool.end();
  });