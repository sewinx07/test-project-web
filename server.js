const express = require('express');
const path = require('path');
const db = require('./db');
const { CATEGORIES, DAYS, STATUSES, toSlug } = require('./db');

const app = express();
app.use(express.json());

const SQLITE_CONSTRAINT_UNIQUE = 2067;
const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
const SQLITE_CONSTRAINT_CHECK = 275;
const SQLITE_CONSTRAINT_NOTNULL = 1299;
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

const isUniqueViolation = (e) => e.errcode === SQLITE_CONSTRAINT_UNIQUE || /UNIQUE constraint/i.test(e.message || '');

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

const stmt = {
  listActivites: db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) FROM adherents h WHERE h.activite_id = a.id) AS inscrits,
           a.places - (SELECT COUNT(*) FROM adherents h WHERE h.activite_id = a.id) AS places_restantes
    FROM activites a
    ORDER BY a.nom_activite
  `),
  getActivite: db.prepare('SELECT * FROM activites WHERE id = ?'),
  getActiviteBySlug: db.prepare('SELECT * FROM activites WHERE slug = ?'),
  listAdherents: db.prepare(`
    SELECT h.*, a.nom_activite, a.slug AS activite_slug, a.tarif, a.jour, a.horaire
    FROM adherents h
    LEFT JOIN activites a ON a.id = h.activite_id
    ORDER BY h.id DESC
  `),
  getAdherent: db.prepare(`
    SELECT h.*, a.nom_activite, a.slug AS activite_slug, a.tarif, a.jour, a.horaire
    FROM adherents h
    LEFT JOIN activites a ON a.id = h.activite_id
    WHERE h.id = ?
  `),
  getAdherentsByActivite: db.prepare(`
    SELECT id, prenom, nom, email, telephone, statut
    FROM adherents WHERE activite_id = ? ORDER BY nom, prenom
  `),
  countForActivite: db.prepare('SELECT COUNT(*) AS n FROM adherents WHERE activite_id = ?'),
  activityExists: db.prepare('SELECT id FROM activites WHERE id = ?'),
  insertAdherent: db.prepare(`
    INSERT INTO adherents (prenom, nom, email, telephone, date_naissance, adresse, activite_id)
    VALUES (@prenom, @nom, @email, @telephone, @date_naissance, @adresse, @activite_id)
  `),
  updateAdherent: db.prepare(`
    UPDATE adherents
    SET prenom = @prenom, nom = @nom, email = @email, telephone = @telephone,
        date_naissance = @date_naissance, adresse = @adresse, statut = @statut
    WHERE id = @id
  `),
  setAdherentActivite: db.prepare('UPDATE adherents SET activite_id = ? WHERE id = ?'),
  deleteAdherent: db.prepare('DELETE FROM adherents WHERE id = ?'),
  insertActivite: db.prepare(`
    INSERT INTO activites (nom_activite, slug, categorie, description, jour, horaire, tarif, places)
    VALUES (@nom_activite, @slug, @categorie, @description, @jour, @horaire, @tarif, @places)
  `),
  updateActivite: db.prepare(`
    UPDATE activites
    SET nom_activite = @nom_activite, categorie = @categorie, description = @description,
        jour = @jour, horaire = @horaire, tarif = @tarif, places = @places
    WHERE id = @id
  `),
  deleteActivite: db.prepare('DELETE FROM activites WHERE id = ?'),
};

function validateRegistration(b) {
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
  } else if (!stmt.activityExists.get(data.activite_id)) {
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
  asyncRoute((req, res) => res.json(stmt.listActivites.all()))
);

app.get(
  '/api/activites/:id',
  asyncRoute((req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });

    const activite = stmt.getActivite.get(id);
    if (!activite) return res.status(404).json({ errors: ['Activity not found.'] });

    const inscrits = stmt.countForActivite.get(id).n;
    res.json({
      ...activite,
      inscrits,
      places_restantes: activite.places - inscrits,
      membres: stmt.getAdherentsByActivite.all(id),
    });
  })
);

app.post(
  '/api/activites',
  asyncRoute((req, res) => {
    const { data, errors } = validateActivite(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const base = toSlug(data.nom_activite);
    let slug = base;
    for (let n = 2; stmt.getActiviteBySlug.get(slug); n += 1) slug = `${base}-${n}`;

    try {
      const info = stmt.insertActivite.run({ ...data, slug });
      res.status(201).json({ id: info.lastInsertRowid, slug });
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ errors: ['This activity name already exists.'] });
      if (e.errcode === SQLITE_CONSTRAINT_CHECK) return res.status(400).json({ errors: ['The activity values are out of range.'] });
      throw e;
    }
  })
);

app.put(
  '/api/activites/:id',
  asyncRoute((req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!stmt.getActivite.get(id)) return res.status(404).json({ errors: ['Activity not found.'] });

    const { data, errors } = validateActivite(req.body);
    if (errors.length) return res.status(400).json({ errors });

    try {
      stmt.updateActivite.run({ ...data, id });
      res.json({ id });
    } catch (e) {
      if (e.errcode === SQLITE_CONSTRAINT_CHECK) return res.status(400).json({ errors: ['The activity values are out of range.'] });
      throw e;
    }
  })
);

app.delete(
  '/api/activites/:id',
  asyncRoute((req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!stmt.getActivite.get(id)) return res.status(404).json({ errors: ['Activity not found.'] });

    const orphans = stmt.countForActivite.get(id).n;

    try {
      stmt.deleteActivite.run(id);
      res.json({ id, orphans });
    } catch (e) {
      if (e.errcode === SQLITE_CONSTRAINT_FOREIGNKEY) {
        return res.status(409).json({ errors: ['Members are still assigned to this activity.'] });
      }
      throw e;
    }
  })
);

app.post(
  '/api/adherents',
  asyncRoute((req, res) => {
    const { data, errors } = validateRegistration(req.body);
    if (errors.length) return res.status(400).json({ errors });

    try {
      const info = stmt.insertAdherent.run(data);
      res.status(201).json({ id: info.lastInsertRowid, statut: 'en_attente' });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return res.status(409).json({ errors: ['This email is already registered.'] });
      }
      if (e.errcode === SQLITE_CONSTRAINT_FOREIGNKEY) {
        return res.status(400).json({ errors: ['Unknown activity.'] });
      }
      throw e;
    }
  })
);

app.get(
  '/api/adherents',
  asyncRoute((req, res) => res.json(stmt.listAdherents.all()))
);

app.get(
  '/api/adherents/:id',
  asyncRoute((req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });

    const adherent = stmt.getAdherent.get(id);
    if (!adherent) return res.status(404).json({ errors: ['Member not found.'] });
    res.json(adherent);
  })
);

app.put(
  '/api/adherents/:id',
  asyncRoute((req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!stmt.getAdherent.get(id)) return res.status(404).json({ errors: ['Member not found.'] });

    const { data, errors } = validateAdherentAdmin(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const activiteId = req.body.activite_id === '' || req.body.activite_id == null ? null : parseId(req.body.activite_id);
    if (activiteId !== null && !stmt.activityExists.get(activiteId)) {
      return res.status(400).json({ errors: ['Unknown activity.'] });
    }

    try {
      stmt.updateAdherent.run({ ...data, id });
      stmt.setAdherentActivite.run(activiteId, id);
      res.json({ id });
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ errors: ['This email is already registered.'] });
      throw e;
    }
  })
);

app.delete(
  '/api/adherents/:id',
  asyncRoute((req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ errors: ['Invalid id.'] });
    if (!stmt.getAdherent.get(id)) return res.status(404).json({ errors: ['Member not found.'] });

    stmt.deleteAdherent.run(id);
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
