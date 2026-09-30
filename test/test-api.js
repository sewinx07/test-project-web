const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'api-test.db');
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
process.env.DB_PATH = dbPath;

const app = require('../server');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name} ${extra}`); }
};

const server = app.listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;

const api = async (method, url, body, opts = {}) => {
  const res = await fetch(base() + url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    redirect: opts.redirect || 'follow',
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, url: res.url, location: res.headers.get('location') };
};

const validAdherent = {
  prenom: 'Amine', nom: 'Trabelsi', email: 'Amine@Email.tn', telephone: '+216 20 111 222',
  date_naissance: '1998-04-12', adresse: '12 rue de Tunis', activite_id: 1, conditions: 'on',
};

(async () => {
  console.log('\n--- activities ---');
  let r = await api('GET', '/api/activites');
  ok('GET /api/activites 200', r.status === 200, r.status);
  ok('6 seeded activities', r.json.length === 6, r.json.length);
  ok('exposes inscrits + places_restantes', 'inscrits' in r.json[0] && 'places_restantes' in r.json[0]);

  r = await api('GET', '/api/activites/1');
  ok('GET /api/activites/1 200', r.status === 200, r.status);
  ok('detail has membres array', Array.isArray(r.json.membres));

  r = await api('GET', '/api/activites/99999');
  ok('GET missing activity 404', r.status === 404, r.status);

  r = await api('GET', '/api/activites/abc');
  ok('GET non-numeric id 400', r.status === 400, r.status);

  console.log('\n--- registration ---');
  r = await api('POST', '/api/adherents', validAdherent);
  ok('POST /api/adherents 201', r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
  ok('returns id + en_attente', typeof r.json.id === 'number' && r.json.statut === 'en_attente');
  const adherentId = r.json.id;

  r = await api('POST', '/api/adherents', validAdherent);
  ok('duplicate email 409 (not 500)', r.status === 409, r.status);

  r = await api('POST', '/api/adherents', { ...validAdherent, email: 'b@x.tn', conditions: undefined });
  ok('missing conditions 400', r.status === 400, r.status);
  ok('conditions error surfaced', r.json.errors.some((x) => /accept the conditions/i.test(x)));

  r = await api('POST', '/api/adherents', { ...validAdherent, email: 'c@x.tn', date_naissance: '2015-01-01' });
  ok('under-16 rejected 400', r.status === 400, r.status);

  r = await api('POST', '/api/adherents', { ...validAdherent, email: 'd@x.tn', telephone: '12' });
  ok('bad phone 400', r.status === 400, r.status);

  r = await api('POST', '/api/adherents', { ...validAdherent, email: 'e@x.tn', activite_id: 99999 });
  ok('unknown activite 400', r.status === 400, r.status);

  r = await api('POST', '/api/adherents', { ...validAdherent, email: 'f@x.tn', date_naissance: '12/04/1998' });
  ok('bad date format 400', r.status === 400, r.status);

  r = await api('GET', '/api/adherents');
  ok('GET /api/adherents 200', r.status === 200);
  ok('only the valid one stored', r.json.length === 1, r.json.length);
  ok('email lowercased', r.json[0].email === 'amine@email.tn', r.json[0].email);
  ok('joined with activity', r.json[0].nom_activite === 'Football' && r.json[0].tarif === 60);

  console.log('\n--- member admin ---');
  r = await api('GET', `/api/adherents/${adherentId}`);
  ok('GET /api/adherents/:id 200', r.status === 200, r.status);

  r = await api('PUT', `/api/adherents/${adherentId}`, { ...validAdherent, statut: 'actif', activite_id: 2 });
  ok('PUT 200', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  r = await api('GET', `/api/adherents/${adherentId}`);
  ok('statut updated', r.json.statut === 'actif', r.json.statut);
  ok('activite moved to Swimming', r.json.nom_activite === 'Swimming', r.json.nom_activite);

  r = await api('PUT', `/api/adherents/${adherentId}`, { ...validAdherent, statut: 'invalide' });
  ok('bad statut 400', r.status === 400, r.status);

  r = await api('PUT', '/api/adherents/99999', { ...validAdherent, statut: 'actif' });
  ok('PUT missing member 404', r.status === 404, r.status);

  r = await api('POST', '/api/adherents', { ...validAdherent, email: 'g@x.tn' });
  const otherId = r.json.id;
  r = await api('PUT', `/api/adherents/${otherId}`, { ...validAdherent, statut: 'actif' });
  ok('PUT email clash 409', r.status === 409, r.status);

  console.log('\n--- activity admin ---');
  r = await api('POST', '/api/activites', {
    nom_activite: 'Boxing', categorie: 'individuel', description: 'Boxing classes.',
    jour: 'Monday', horaire: '18:00', tarif: 75.5, places: 12,
  });
  ok('POST /api/activites 201', r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
  const boxingId = r.json.id;
  ok('slug generated', r.json.slug === 'boxing', r.json.slug);

  r = await api('POST', '/api/activites', {
    nom_activite: 'Boxing', categorie: 'individuel', description: 'Dup.',
    jour: 'Monday', horaire: '18:00', tarif: 75.5, places: 12,
  });
  ok('duplicate name 201 with deduped slug', r.status === 201 && r.json.slug === 'boxing-2', `${r.status} ${r.json.slug}`);

  r = await api('POST', '/api/activites', {
    nom_activite: 'Bad', categorie: 'nope', description: '', jour: 'Monday',
    horaire: '25:99', tarif: 9999, places: 0,
  });
  ok('all-invalid activity 400', r.status === 400, r.status);
  ok('returns 5 errors (Bad is a valid 3-char name, Monday is valid)', r.json.errors.length === 5, r.json.errors.length);
  ok('errors name the bad fields', ['category', 'description', 'time', 'fee', 'places'].every((w) => r.json.errors.some((e) => new RegExp(w, 'i').test(e))), JSON.stringify(r.json.errors));

  r = await api('PUT', `/api/activites/${boxingId}`, {
    nom_activite: 'Boxing', categorie: 'bien-etre', description: 'Updated.',
    jour: 'Friday', horaire: '07:30', tarif: 99.99, places: 8,
  });
  ok('PUT activity 200', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  r = await api('GET', `/api/activites/${boxingId}`);
  ok('update persisted', r.json.categorie === 'bien-etre' && r.json.tarif === 99.99 && r.json.places === 8);

  r = await api('DELETE', `/api/activites/${boxingId}`);
  ok('DELETE activity 200', r.status === 200, r.status);
  ok('orphans counted', typeof r.json.orphans === 'number');

  r = await api('GET', `/api/activites/${boxingId}`);
  ok('deleted activity 404', r.status === 404, r.status);

  console.log('\n--- integrity ---');
  r = await api('GET', '/api/activites/1');
  ok('Football now has the member', r.json.membres.length >= 1, r.json.membres.length);
  ok('inscrits matches membres', r.json.inscrits === r.json.membres.length);

  r = await api('GET', '/api/activites-meta');
  ok('meta endpoint lists enums', r.json.categories.length === 4 && r.json.days.length === 7 && r.json.statuses.length === 3);

  r = await api('GET', '/api/nope');
  ok('unknown api route 404 json', r.status === 404 && r.json.errors);

  r = await api('GET', '/', null, { redirect: 'manual' });
  ok('root 302 redirects to FrontOffice', r.status === 302 && r.location === '/FrontOffice/index.html', `${r.status} ${r.location}`);
  r = await api('GET', '/');
  ok('following redirect lands on index', r.status === 200 && String(r.url).endsWith('/FrontOffice/index.html'), String(r.url));

  r = await api('GET', '/FrontOffice/index.html');
  ok('static page served', r.status === 200, r.status);

  r = await api('DELETE', `/api/adherents/${otherId}`);
  ok('DELETE member 200', r.status === 200, r.status);
  r = await api('GET', `/api/adherents/${otherId}`);
  ok('deleted member 404', r.status === 404, r.status);

  console.log(`\n===== ${pass} passed, ${fail} failed =====\n`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
