const express = require('express');
const path = require('path');
const { init, one, query, run, CATEGORIES, DAYS, STATUSES, toSlug } = require('./db');

const app = express();
app.use(express.json());

const PG_UNIQUE = '23505';
const PG_FOREIGN_KEY = '23503';
const PG_CHECK = '23514';
const PG_NOT_NULL = '23502';

const isUniqueViolation = (e) => e.code === PG_UNIQUE;
const isForeignKeyViolation = (e) => e.code === PG_FOREIGN_KEY;
const isCheckViolation = (e) => e.code === PG_CHECK;

const NAME_RE = /^[A-Za-zÀ-ÿ' -]{2,50}$/;
const PHONE_RE = /^[0-9+ ]{8,15}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const num = (v) => (str(v) === '' ? NaN : Number(str(v)));

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function minimumAgeDate(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setHours(0, 0, 0, 0);
  return d;
}

// API routes await init() so a cold serverless instance migrates on its
// first request instead of writing to disk at import time. Static files are
// deliberately excluded so a database outage cannot take the pages down.
app.use('/api', async (req, res, next) => {
  try {
    await init();
    next();
  } catch (e) {
    console.error('[db] initialisation failed:', e.message);
    res.status(503).json({ errors: ['Database unavailable. Please try again shortly.'] });
  }
});

const SQL = {
  listActivites: `
    SELECT a.*, a.tarif::float8 AS tarif,
           (SELECT count(*) FROM adherents h WHERE h.activite_id = a.id)::int AS inscrits,
           a.places - (SELECT count(*) FROM adherents h WHERE h.activite_id = a.id)::int AS places_restantes
    FROM activites a
    ORDER BY a.nom_activite`,
  getActivite: 'SELECT *, tarif::float8 AS tarif FROM activites WHERE id = $1',
  getActiviteBySlug: 'SELECT id FROM activites WHERE slug = $1',
  listAdherents: `
    SELECT h.*, a.nom_activite, a.slug AS activite_slug,
           a.tarif::float8 AS tarif, a.jour, a.horaire
    FROM adherents h
    LEFT JOIN activites a ON a.id = h.activite_id
    ORDER BY h.id DESC`,
  getAdherent: `
    SELECT h.*, a.nom_activite, a.slug AS activite_slug,
           a.tarif::float8 AS tarif, a.jour, a.horaire
    FROM adherents h
    LEFT JOIN activites a ON a.id = h.activite_id
    WHERE h.id = $1`,
  getAdherentsByActivite: `
    SELECT id, prenom, nom, email, telephone, statut
    FROM adherents WHERE activite_id = $1 ORDER BY nom, prenom`,
  countForActivite: 'SELECT count(*)::int AS n FROM adherents WHERE activite_id = $1',
  activityExists: 'SELECT id FROM activites WHERE id = $1',
  insertAdherent: `
    INSERT INTO adherents (prenom, nom, email, telephone, date_naissance, adresse, activite_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
  updateAdherent: `
    UPDATE adherents
    SET prenom = $1, nom = $2, email = $3, telephone = $4,
        date_naissance = $5, adresse = $6, statut = $7
    WHERE id = $8`,
  setAdherentActivite: 'UPDATE adherents SET activite_id = $1 WHERE id = $2',
  deleteAdherent: 'DELETE FROM adherents WHERE id = $1',
  insertActivite: `
    INSERT INTO activites (nom_activite, slug, categorie, description, jour, horaire, tarif, places)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
  updateActivite: `
    UPDATE activites
    SET nom_activite = $1, categorie = $2, description = $3,
        jour = $4, horaire = $5, tarif = $6, places = $7
    WHERE id = $8`,
  deleteActivite: 'DELETE FROM activites WHERE id = $1',
};

async function validateRegistration(b) {
  const errors = [];
  const data = {
    prenom: str(b.prenom),
    nom: str(b.nom),
    email: str(b.email).toLowerCase(),
    telephone: str(b.telephone),
    date_naissance: str(b.date_naissance),
    adresse: str(b.adresse),
    activite_id: b.activite_id === '' || b.activite_id == null ? null : parseId(b.activite_id),
  };

  if (!NAME_RE.test(data.prenom)) errors.push('Invalid first name.');
  if (!NAME_RE.test(data.nom)) errors.push('Invalid last name.');
  if (!/^\S+@\S+\.\S+$/.test(data.email) || data.email.length > 120) errors.push('Invalid email.');
  if (!PHONE_RE.test(data.telephone)) errors.push('Invalid phone number.');
  if (data.adresse.length < 5 || data.adresse.length > 120) errors.push('Invalid address.');

  if (data.activite_id === null) {
    errors.push('Please choose an activity.');
  } else if (!(await one(SQL.activityExists, [data.activite_id]))) {
    errors.push('Unknown activity.');
  }

  if (!isValidDate(data.date_naissance)) {
    errors.push('Invalid date of birth.');
  } else if (new Date(`${data.date_naissance}T00:00:00Z`) > minimumAgeDate(16)) {
    errors.push('Members must be at least 16 years old.');
  }

  if (b.conditions !== true && b.conditions !== 'on' && b.conditions !== 'true') {
    errors.push('You must accept the conditions.');
  }

  return { data, errors };
}

function validateAdherentAdmin(b) {
  const errors = [];
  const data = {
    prenom: str(b.prenom),
    nom: str(b.nom),
    email: str(b.email).toLowerCase(),
    telephone: str(b.telephone),
    date_naissance: str(b.date_naissance),
    adresse: str(b.adresse),
    statut: str(b.statut),
  };

  if (!NAME_RE.test(data.prenom)) errors.push('Invalid first name.');
  if (!NAME_RE.test(data.nom)) errors.push('Invalid last name.');
  if (!/^\S+@\S+\.\S+$/.test(data.email) || data.email.length > 120) errors.push('Invalid email.');
  if (!PHONE_RE.test(data.telephone)) errors.push('Invalid phone number.');
  if (data.adresse.length < 5 || data.adresse.length > 120) errors.push('Invalid address.');
  if (!STATUSES.includes(data.statut)) errors.push('Invalid status.');

  if (!isValidDate(data.date_naissance)) {
    errors.push('Invalid date of birth.');
  } else if (new Date(`${data.date_naissance}T00:00:00Z`) > minimumAgeDate(16)) {
    errors.push('Members must be at least 16 years old.');
  }

  return { data, errors };
}

function validateActivite(b) {
  const errors = [];
  const data = {
    nom_activite: str(b.nom_activite),
    categorie: str(b.categorie),
    description: str(b.description),
    jour: str(b.jour),
    horaire: str(b.horaire),
    tarif: num(b.tarif),
    places: num(b.places),
  };

  if (data.nom_activite.length < 3 || data.nom_activite.length > 50) {
    errors.push('The name must contain between 3 and 50 characters.');
  }
  if (!CATEGORIES.includes(data.categorie)) errors.push('Invalid category.');
  if (!data.description || data.description.length > 300) {
    errors.push('The description is required and must not exceed 300 characters.');
  }
  if (!DAYS.includes(data.jour)) errors.push('Invalid day.');
  if (!TIME_RE.test(data.horaire)) errors.push('Invalid time.');
  if (!Number.isFinite(data.tarif) || data.tarif < 0 || data.tarif > 1000) {
    errors.push('The fee must be between 0 and 1000.');
  }
  if (!Number.isInteger(data.places) || data.places < 1 || data.places > 200) {
    errors.push('The number of places must be between 1 and 200.');
  }

  return { data, errors };
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/', (req, res) => res.redirect('/FrontOffice/index.html'));

app.get(
  '/api/activites',
  asyncRoute(async (req, res) => res.json(await query(SQL.listActivites)))
);

app.get(
  '/api/activites/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });

    const activite = await one(SQL.getActivite, [id]);
    if (!activite) return res.status(404).json({ errors: ['Activity not found.'] });

    const inscrits = (await one(SQL.countForActivite, [id])).n;
    res.json({
      ...activite,
      inscrits,
      places_restantes: activite.places - inscrits,
      membres: await query(SQL.getAdherentsByActivite, [id]),
    });
  })
);

app.post(
  '/api/activites',
  asyncRoute(async (req, res) => {
    const { data, errors } = validateActivite(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const base = toSlug(data.nom_activite);
    let slug = base;
    for (let n = 2; await one(SQL.getActiviteBySlug, [slug]); n += 1) slug = `${base}-${n}`;

    try {
      const [created] = await query(
        SQL.insertActivite,
        [data.nom_activite, slug, data.categorie, data.description, data.jour, data.horaire, data.tarif, data.places]
      );
      res.status(201).json({ id: created.id, slug });
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ errors: ['This activity name already exists.'] });
      if (isCheckViolation(e)) return res.status(400).json({ errors: ['The activity values are out of range.'] });
      throw e;
    }
  })
);

app.put(
  '/api/activites/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!(await one(SQL.getActivite, [id]))) return res.status(404).json({ errors: ['Activity not found.'] });

    const { data, errors } = validateActivite(req.body);
    if (errors.length) return res.status(400).json({ errors });

    try {
      await run(SQL.updateActivite, [data.nom_activite, data.categorie, data.description, data.jour, data.horaire, data.tarif, data.places, id]);
      res.json({ id });
    } catch (e) {
      if (isCheckViolation(e)) return res.status(400).json({ errors: ['The activity values are out of range.'] });
      throw e;
    }
  })
);

app.delete(
  '/api/activites/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!(await one(SQL.getActivite, [id]))) return res.status(404).json({ errors: ['Activity not found.'] });

    const orphans = (await one(SQL.countForActivite, [id])).n;

    try {
      await run(SQL.deleteActivite, [id]);
      res.json({ id, orphans });
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        return res.status(409).json({ errors: ['Members are still assigned to this activity.'] });
      }
      throw e;
    }
  })
);

app.post(
  '/api/adherents',
  asyncRoute(async (req, res) => {
    const { data, errors } = await validateRegistration(req.body);
    if (errors.length) return res.status(400).json({ errors });

    try {
      const [created] = await query(SQL.insertAdherent, [
        data.prenom, data.nom, data.email, data.telephone, data.date_naissance, data.adresse, data.activite_id,
      ]);
      res.status(201).json({ id: created.id, statut: 'en_attente' });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return res.status(409).json({ errors: ['This email is already registered.'] });
      }
      if (isForeignKeyViolation(e)) {
        return res.status(400).json({ errors: ['Unknown activity.'] });
      }
      throw e;
    }
  })
);

app.get(
  '/api/adherents',
  asyncRoute(async (req, res) => res.json(await query(SQL.listAdherents)))
);

app.get(
  '/api/adherents/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });

    const adherent = await one(SQL.getAdherent, [id]);
    if (!adherent) return res.status(404).json({ errors: ['Member not found.'] });
    res.json(adherent);
  })
);

app.put(
  '/api/adherents/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!(await one(SQL.getAdherent, [id]))) return res.status(404).json({ errors: ['Member not found.'] });

    const { data, errors } = validateAdherentAdmin(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const activiteId = req.body.activite_id === '' || req.body.activite_id == null ? null : parseId(req.body.activite_id);
    if (activiteId !== null && !(await one(SQL.activityExists, [activiteId]))) {
      return res.status(400).json({ errors: ['Unknown activity.'] });
    }

    try {
      await run(SQL.updateAdherent, [data.prenom, data.nom, data.email, data.telephone, data.date_naissance, data.adresse, data.statut, id]);
      await run(SQL.setAdherentActivite, [activiteId, id]);
      res.json({ id });
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ errors: ['This email is already registered.'] });
      throw e;
    }
  })
);

app.delete(
  '/api/adherents/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!(await one(SQL.getAdherent, [id]))) return res.status(404).json({ errors: ['Member not found.'] });

    await run(SQL.deleteAdherent, [id]);
    res.json({ id });
  })
);

app.get('/api/activites-meta', (req, res) =>
  res.json({ categories: CATEGORIES, days: DAYS, statuses: STATUSES })
);

app.use('/api', (req, res) => res.status(404).json({ errors: ['Unknown endpoint.'] }));

app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(500).json({ errors: ['Server error.'] });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
}

module.exports = app;
