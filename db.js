const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'club.db');
const SCHEMA_VERSION = 1;

const CATEGORIES = ['ballon', 'eau', 'individuel', 'bien-etre'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STATUSES = ['actif', 'en_attente', 'suspendu'];

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

const quote = (values) => values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');

const tableExists = (name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

const columnsOf = (name) =>
  tableExists(name) ? db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name) : [];

const toSlug = (value) =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

const LEGACY_SLUGS = {
  Football: ['football'],
  Swimming: ['natation', 'swimming'],
  Fitness: ['fitness'],
  Tennis: ['tennis'],
  Yoga: ['yoga'],
  Basketball: ['basket', 'basketball'],
};

const SEED_ACTIVITIES = [
  {
    nom_activite: 'Football',
    categorie: 'ballon',
    description: 'Weekly training sessions and friendly matches for every age group.',
    jour: 'Saturday',
    horaire: '10:00',
    tarif: 60,
    places: 30,
  },
  {
    nom_activite: 'Swimming',
    categorie: 'eau',
    description: 'Coached swimming lessons covering all levels from beginner to advanced.',
    jour: 'Tuesday',
    horaire: '18:00',
    tarif: 80,
    places: 20,
  },
  {
    nom_activite: 'Fitness',
    categorie: 'individuel',
    description: 'Strength and conditioning circuits with certified coaches.',
    jour: 'Monday',
    horaire: '19:00',
    tarif: 70,
    places: 25,
  },
  {
    nom_activite: 'Tennis',
    categorie: 'ballon',
    description: 'Court booking and coaching clinics, all levels welcome.',
    jour: 'Thursday',
    horaire: '17:00',
    tarif: 90,
    places: 16,
  },
  {
    nom_activite: 'Yoga',
    categorie: 'bien-etre',
    description: 'Relaxation, breathing and posture sessions to improve wellbeing.',
    jour: 'Sunday',
    horaire: '09:00',
    tarif: 50,
    places: 35,
  },
  {
    nom_activite: 'Basketball',
    categorie: 'ballon',
    description: 'Pick-up games and structured team training on the outdoor court.',
    jour: 'Friday',
    horaire: '18:30',
    tarif: 60,
    places: 24,
  },
];

function createActivites() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activites (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nom_activite TEXT    NOT NULL,
      slug         TEXT    NOT NULL UNIQUE,
      categorie    TEXT    NOT NULL CHECK (categorie IN (${quote(CATEGORIES)})),
      description  TEXT    NOT NULL,
      jour         TEXT    NOT NULL CHECK (jour IN (${quote(DAYS)})),
      horaire      TEXT    NOT NULL,
      tarif        REAL    NOT NULL CHECK (tarif >= 0 AND tarif <= 1000),
      places       INTEGER NOT NULL CHECK (places >= 1 AND places <= 200),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function createAliasTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activite_aliases (
      alias       TEXT    PRIMARY KEY,
      activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE
    );
  `);
}

function seedAliases() {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO activite_aliases (alias, activite_id) VALUES (?, ?)
  `);
  const findByNom = db.prepare('SELECT id FROM activites WHERE nom_activite = ?');

  db.exec('BEGIN');
  try {
    for (const [nom, aliases] of Object.entries(LEGACY_SLUGS)) {
      const row = findByNom.get(nom);
      if (!row) continue;
      for (const alias of aliases) stmt.run(alias, row.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function createAdherents() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS adherents (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      prenom         TEXT    NOT NULL,
      nom            TEXT    NOT NULL,
      email          TEXT    NOT NULL UNIQUE,
      telephone      TEXT    NOT NULL,
      date_naissance TEXT    NOT NULL,
      adresse        TEXT    NOT NULL,
      activite_id    INTEGER REFERENCES activites(id) ON DELETE SET NULL,
      statut         TEXT    NOT NULL DEFAULT 'en_attente'
                     CHECK (statut IN (${quote(STATUSES)})),
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function createIndexes() {
  db.exec('CREATE INDEX IF NOT EXISTS idx_adherents_activite ON adherents(activite_id);');
}

function seedActivities() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM activites').get().n;
  if (count > 0) return;

  const stmt = db.prepare(`
    INSERT INTO activites (nom_activite, slug, categorie, description, jour, horaire, tarif, places)
    VALUES (@nom_activite, @slug, @categorie, @description, @jour, @horaire, @tarif, @places)
  `);

  db.exec('BEGIN');
  try {
    for (const a of SEED_ACTIVITIES) {
      stmt.run({ ...a, slug: toSlug(a.nom_activite) });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function migrate() {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= SCHEMA_VERSION) return;

  db.exec('PRAGMA foreign_keys = OFF');

  try {
    const adherentCols = columnsOf('adherents');
    const isLegacy = adherentCols.includes('activite') && !adherentCols.includes('activite_id');

    createActivites();
    createAliasTable();
    seedActivities();
    seedAliases();

    if (isLegacy) {
      db.exec(`
        ALTER TABLE adherents RENAME TO adherents_legacy;

        CREATE TABLE adherents (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          prenom         TEXT    NOT NULL,
          nom            TEXT    NOT NULL,
          email          TEXT    NOT NULL UNIQUE,
          telephone      TEXT    NOT NULL,
          date_naissance TEXT    NOT NULL,
          adresse        TEXT    NOT NULL,
          activite_id    INTEGER REFERENCES activites(id) ON DELETE SET NULL,
          statut         TEXT    NOT NULL DEFAULT 'en_attente'
                         CHECK (statut IN (${quote(STATUSES)})),
          created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
        );
      `);

      const legacyCols = columnsOf('adherents_legacy');
      const legacyHasStatus = legacyCols.includes('statut');
      const legacyHasCreated = legacyCols.includes('created_at');
      const legacySlug = "lower(replace(replace(trim(l.activite), ' ', '-'), '_', '-'))";

      db.exec(`
        INSERT INTO adherents
          (prenom, nom, email, telephone, date_naissance, adresse, activite_id, statut, created_at)
        SELECT
          l.prenom, l.nom, l.email, l.telephone, l.date_naissance, l.adresse,
          COALESCE(
            (SELECT a2.id FROM activites a2 WHERE a2.slug = ${legacySlug}),
            (SELECT al.activite_id FROM activite_aliases al WHERE al.alias = ${legacySlug})
          ),
          ${legacyHasStatus ? `COALESCE(l.statut, 'en_attente')` : `'en_attente'`},
          ${legacyHasCreated ? "COALESCE(l.created_at, datetime('now'))" : `datetime('now')`}
        FROM adherents_legacy l;

        DROP TABLE adherents_legacy;
      `);
    } else {
      createAdherents();
    }

    createIndexes();
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } catch (e) {
    db.exec('PRAGMA foreign_keys = ON');
    throw e;
  }

  db.exec('PRAGMA foreign_keys = ON');
}

migrate();

const helpers = {
  CATEGORIES,
  DAYS,
  STATUSES,
  toSlug,
  listActivites: () =>
    db
      .prepare(`
        SELECT a.*,
               (SELECT COUNT(*) FROM adherents h WHERE h.activite_id = a.id) AS inscrits,
               a.places - (SELECT COUNT(*) FROM adherents h WHERE h.activite_id = a.id) AS places_restantes
        FROM activites a
        ORDER BY a.nom_activite
      `)
      .all(),
  listAdherents: () =>
    db
      .prepare(`
        SELECT h.*,
               a.nom_activite,
               a.slug        AS activite_slug,
               a.tarif       AS tarif,
               a.jour        AS jour,
               a.horaire     AS horaire
        FROM adherents h
        LEFT JOIN activites a ON a.id = h.activite_id
        ORDER BY h.id DESC
      `)
      .all(),
};

module.exports = db;
module.exports.helpers = helpers;
module.exports.CATEGORIES = CATEGORIES;
module.exports.DAYS = DAYS;
module.exports.STATUSES = STATUSES;
module.exports.toSlug = toSlug;
