const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'legacy-test.db');
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);

const legacy = new DatabaseSync(dbPath);
legacy.exec(`
  CREATE TABLE adherents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prenom          TEXT NOT NULL,
    nom             TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    telephone       TEXT NOT NULL,
    date_naissance  TEXT NOT NULL,
    adresse         TEXT NOT NULL,
    activite        TEXT NOT NULL,
    statut          TEXT NOT NULL DEFAULT 'en_attente',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const ins = legacy.prepare(
  'INSERT INTO adherents (prenom, nom, email, telephone, date_naissance, adresse, activite, statut) VALUES (@prenom,@nom,@email,@tel,@dob,@adr,@act,@st)'
);
ins.run({ prenom: 'Amine', nom: 'Trabelsi', email: 'amine@x.tn', tel: '+216 20 111 222', dob: '1998-04-12', adr: '12 rue de Tunis', act: 'football', st: 'actif' });
ins.run({ prenom: 'Sara', nom: 'Ben Salah', email: 'sara@x.tn', tel: '+216 20 333 444', dob: '2001-09-02', adr: '45 avenue du Lac', act: 'natation', st: 'en_attente' });
ins.run({ prenom: 'Unknown', nom: 'Legacy', email: 'legacy@x.tn', tel: '+216 20 555 666', dob: '1995-01-01', adr: '9 rue inconnue', act: 'kayaking', st: 'actif' });
legacy.close();

process.env.DB_PATH = dbPath;
const db = require('../db');

console.log('migrated rows:', db.prepare('SELECT COUNT(*) n FROM adherents').get().n);
const rows = db.prepare(`
  SELECT h.prenom, h.nom, h.email, h.statut, a.slug, a.nom_activite
  FROM adherents h LEFT JOIN activites a ON a.id = h.activite_id
  ORDER BY h.id
`).all();
for (const r of rows) {
  console.log(`  ${r.prenom.padEnd(8)} ${r.email.padEnd(16)} statut=${r.statut.padEnd(10)} activite_id -> ${r.slug ?? 'NULL (unmatched slug)'}`);
}
console.log('user_version:', db.prepare('PRAGMA user_version').get().user_version);
console.log('legacy table gone:', !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='adherents_legacy'").get());
console.log('index present   :', !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_adherents_activite'").get());
console.log('re-run is idempotent:', (() => { delete require.cache[require.resolve('../db')]; require('../db'); return true; })());
