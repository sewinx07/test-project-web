const { init, pool } = require('../db');

init()
  .then(async () => {
    const { rows } = await pool.query(
      'SELECT (SELECT count(*) FROM activites)::int AS activites, (SELECT count(*) FROM adherents)::int AS adherents'
    );
    console.log(`Migrations applied. activites=${rows[0].activites} adherents=${rows[0].adherents}`);
  })
  .catch((e) => {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
