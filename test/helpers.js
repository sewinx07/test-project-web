const { init, resetDatabase, pool } = require('../db');

// The test suite truncates real tables, so it refuses to start unless the
// operator opts in. This keeps `npm test` from wiping a deployed database.
function assertTestDatabaseAllowed() {
  if (process.env.ALLOW_DB_TESTS !== '1') {
    console.error(
      '\nRefusing to run: these tests truncate the database in DATABASE_URL.\n' +
        'Point DATABASE_URL at a scratch database and set ALLOW_DB_TESTS=1, e.g.\n\n' +
        '  $env:DATABASE_URL="<scratch url>"; $env:ALLOW_DB_TESTS=1; npm test\n'
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('\nRefusing to run: DATABASE_URL is not set.\n');
    process.exit(1);
  }
}

async function cleanDatabase() {
  assertTestDatabaseAllowed();
  await init();
  await resetDatabase();
}

async function closeDatabase() {
  await pool.end().catch(() => {});
}

const createHarness = () => {
  const state = { pass: 0, fail: 0 };
  const ok = (name, cond, extra = '') => {
    if (cond) {
      state.pass += 1;
      console.log(`  PASS  ${name}`);
    } else {
      state.fail += 1;
      console.log(`  FAIL  ${name} ${extra}`);
    }
  };
  return {
    ok,
    report() {
      console.log(`\n===== ${state.pass} passed, ${state.fail} failed =====\n`);
      return state.fail;
    },
  };
};

module.exports = { cleanDatabase, closeDatabase, createHarness, assertTestDatabaseAllowed };
