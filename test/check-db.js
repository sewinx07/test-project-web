const db = require('../db');

console.log('BOOT OK');
console.log('user_version :', db.prepare('PRAGMA user_version').get().user_version);
console.log(
  'tables       :',
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name).join(', ')
);
console.log('activites    :', db.prepare('SELECT COUNT(*) n FROM activites').get().n);
console.log('adherents    :', db.prepare('SELECT COUNT(*) n FROM adherents').get().n);
console.log('adh cols     :', db.prepare('PRAGMA table_info(adherents)').all().map((c) => c.name).join(', '));
console.log('fk on        :', db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1);
console.log('seeded       :', db.prepare('SELECT slug, categorie, tarif, places FROM activites ORDER BY id').all().map((a) => `${a.slug}/${a.categorie}/${a.tarif}`).join('  '));
