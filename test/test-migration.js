const { assertTestDatabaseAllowed, createHarness } = require('./helpers');
const { ok, report } = createHarness();

const { pool: firstPool } = require('../db');

// Builds the pre-migration schema: adherents carries a free-text activite
// column instead of a foreign key, and nothing has been versioned yet.
async function buildLegacySchema() {
  const client = await firstPool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS adherents_legacy');
    await client.query('DROP TABLE IF EXISTS adherents CASCADE');
    await client.query('DROP TABLE IF EXISTS activite_aliases CASCADE');
    await client.query('DROP TABLE IF EXISTS activites CASCADE');
    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE');

    await client.query(`
      CREATE TABLE adherents (
        id             integer PRIMARY KEY,
        prenom         text NOT NULL,
        nom            text NOT NULL,
        email          text NOT NULL UNIQUE,
        telephone      text NOT NULL,
        date_naissance text NOT NULL,
        adresse        text NOT NULL,
        activite       text NOT NULL,
        statut         text NOT NULL DEFAULT 'en_attente',
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    const rows = [
      [1, 'Amine', 'Trabelsi', 'amine@x.tn', '+216 20 111 222', '1998-04-12', '12 rue de Tunis', 'football', 'actif'],
      [2, 'Sara', 'Ben Salah', 'sara@x.tn', '+216 20 333 444', '2001-09-02', '45 avenue du Lac', 'natation', 'en_attente'],
      [3, 'Unknown', 'Legacy', 'legacy@x.tn', '+216 20 555 666', '1995-01-01', '9 rue inconnue', 'kayaking', 'actif'],
    ];
    for (const r of rows) {
      await client.query(
        `INSERT INTO adherents (id, prenom, nom, email, telephone, date_naissance, adresse, activite, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        r
      );
    }
  } finally {
    client.release();
  }
}

// db.js memoises its migration on first call, so a fresh module instance is
// needed to exercise the path a genuinely old deployment would take.
function freshDb() {
  delete require.cache[require.resolve('../db')];
  return require('../db');
}

(async () => {
  assertTestDatabaseAllowed();

  await buildLegacySchema();
  const db = freshDb();
  await db.init();

  const migrated = await db.query(`
    SELECT h.id, h.prenom, h.email, h.statut, h.activite_id, a.slug, a.nom_activite
    FROM adherents h
    LEFT JOIN activites a ON a.id = h.activite_id
    ORDER BY h.id
  `);

  console.log('\n--- legacy migration ---');
  ok('all member rows preserved', migrated.length === 3, migrated.length);
  for (const r of migrated) {
    console.log(`  ${r.prenom.padEnd(8)} ${r.email.padEnd(14)} statut=${String(r.statut).padEnd(10)} -> ${r.slug ?? 'NULL (unmatched slug)'}`);
  }

  const [amine, sara, kayaking] = migrated;
  ok('ids preserved', amine.id === 1 && sara.id === 2 && kayaking.id === 3);
  ok('statuses preserved', amine.statut === 'actif' && sara.statut === 'en_attente', `${amine.statut}/${sara.statut}`);
  ok('exact slug matches activity', amine.slug === 'football', amine.slug);
  ok('alias "natation" resolves to Swimming', sara.slug === 'swimming', sara.slug);
  ok('unknown slug becomes NULL', kayaking.slug === null && kayaking.activite_id === null, `${kayaking.slug}/${kayaking.activite_id}`);

  const [tables] = await db.query(
    "SELECT to_regclass('adherents_legacy') IS NULL AS gone"
  );
  ok('legacy table dropped', tables.gone === true);

  const [ver] = await db.query('SELECT version FROM schema_migrations');
  ok('schema version recorded', ver.version === 1, ver.version);

  const [idx] = await db.query("SELECT to_regclass('idx_adherents_activite') IS NOT NULL AS present");
  ok('index created', idx.present === true);

  const [nextId] = await db.query(
    "SELECT coalesce((SELECT max(id) FROM adherents), 0) + 1 AS n"
  );
  ok('identity sequence advanced past legacy ids', nextId.n === 4, nextId.n);

  console.log('\n--- idempotency ---');
  await db.pool.end();
  const again = freshDb();
  await again.init();
  const after = await again.query('SELECT count(*)::int AS n FROM adherents');
  ok('re-running migrations is a no-op', after[0].n === 3, after[0].n);
  const [ver2] = await again.query('SELECT version FROM schema_migrations');
  ok('no duplicate version row', ver2.version === 1);

  await again.resetDatabase();
  const seeded = await again.query('SELECT count(*)::int AS n FROM activites');
  ok('database restored to seeded state', seeded[0].n === 6, seeded[0].n);
  await again.pool.end();
  await firstPool.end().catch(() => {});

  process.exit(report() ? 1 : 0);
})().catch(async (e) => {
  console.error('\nMigration test crashed:', e);
  process.exit(1);
});
