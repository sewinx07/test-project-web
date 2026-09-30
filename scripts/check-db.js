const { query, pool } = require('../db');

(async () => {
  const t = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
  );
  console.log('tables:', t.map((r) => r.table_name).join(', '));

  const a = await query('SELECT nom_activite, categorie, tarif, places FROM activites ORDER BY nom_activite');
  console.log('activities:');
  for (const r of a) console.log(`   ${r.nom_activite.padEnd(11)} ${r.categorie.padEnd(11)} tarif=${r.tarif} places=${r.places}`);

  const al = await query('SELECT count(*)::int AS n FROM activite_aliases');
  console.log('aliases:', al[0].n);

  const v = await query('SELECT version FROM schema_migrations');
  console.log('schema version:', v[0].version);

  await pool.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
