(function () {
  'use strict';

  const base = `http://localhost:${process.env.E2E_PORT || 3210}`;
  let pass = 0;
  let fail = 0;
  const ok = (label, cond, extra) => {
    if (cond) {
      pass += 1;
      console.log(`  PASS  ${label}`);
    } else {
      fail += 1;
      console.log(`  FAIL  ${label}${extra !== undefined ? ` -> ${extra}` : ''}`);
    }
  };

  const call = async (method, url, body) => {
    const opts = { method };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + url, opts);
    let json = null;
    try {
      json = await res.json();
    } catch (e) {}
    return { status: res.status, json };
  };

  (async () => {
    console.log('== front office: activities available for registration ==');
    let r = await call('GET', '/api/activites');
    ok('activities 200', r.status === 200, r.status);
    const acts = r.json;
    ok('six seeded activities', acts.length === 6, acts.length);
    ok('each has places_restantes', acts.every((a) => typeof a.places_restantes === 'number'));
    const football = acts.find((a) => a.slug === 'football');
    ok('football found', !!football);

    console.log('== front office: register a member ==');
    const member = {
      prenom: 'Amelie',
      nom: 'Rousseau',
      email: 'amelie.rousseau@email.tn',
      telephone: '+216 70 111 222',
      date_naissance: '1996-04-12',
      adresse: '12 Avenue de la Liberte, Tunis',
      activite_id: football.id,
      conditions: true,
    };
    r = await call('POST', '/api/adherents', member);
    ok('registration 201', r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
    ok('status en_attente', r.json.statut === 'en_attente', r.json.statut);
    const memberId = r.json.id;

    console.log('== front office: rejections ==');
    r = await call('POST', '/api/adherents', { ...member, email: member.email });
    ok('duplicate email 409', r.status === 409, r.status);
    r = await call('POST', '/api/adherents', { ...member, email: 'x@y.tn', date_naissance: '2020-01-01' });
    ok('under 16 rejected', r.status === 400 && r.json.errors.some((e) => /16/.test(e)), JSON.stringify(r.json));
    r = await call('POST', '/api/adherents', { ...member, email: 'x@y.tn', conditions: false });
    ok('conditions required', r.status === 400, r.status);
    r = await call('POST', '/api/adherents', { ...member, email: 'x@y.tn', activite_id: 9999 });
    ok('unknown activity rejected', r.status === 400, r.status);
    r = await call('POST', '/api/adherents', { ...member, email: 'x@y.tn', telephone: 'abc' });
    ok('bad phone rejected', r.status === 400, r.status);
    r = await call('POST', '/api/adherents', { ...member, email: 'x@y.tn', prenom: 'A' });
    ok('short name rejected', r.status === 400, r.status);
    r = await call('POST', '/api/adherents', { ...member, email: 'x@y.tn', activite_id: football.id, adresse: 'ab' });
    ok('short address rejected', r.status === 400, r.status);

    console.log('== back office: member list ==');
    r = await call('GET', '/api/adherents');
    ok('members 200', r.status === 200);
    ok('one member listed', r.json.length === 1, r.json.length);
    const listed = r.json[0];
    ok('list carries nom_activite', listed.nom_activite === 'Football', listed.nom_activite);
    ok('list carries statut', listed.statut === 'en_attente', listed.statut);

    console.log('== back office: member detail ==');
    r = await call('GET', `/api/adherents/${memberId}`);
    ok('detail 200', r.status === 200, r.status);
    ok('detail has activity day', r.json.jour === football.jour, `${r.json.jour} vs ${football.jour}`);
    ok('detail has tarif', r.json.tarif === football.tarif, `${r.json.tarif} vs ${football.tarif}`);
    ok('detail has created_at', !!r.json.created_at);
    r = await call('GET', '/api/adherents/99999');
    ok('unknown member 404', r.status === 404, r.status);
    r = await call('GET', '/api/adherents/abc');
    ok('non numeric id 400', r.status === 400, r.status);

    console.log('== back office: member update ==');
    r = await call('PUT', `/api/adherents/${memberId}`, {
      prenom: 'Amelie',
      nom: 'Rousseau',
      email: member.email,
      telephone: '+216 70 333 444',
      date_naissance: '1996-04-12',
      adresse: '45 Rue de Paris, Sousse',
      statut: 'actif',
      activite_id: football.id,
    });
    ok('update 200', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call('GET', `/api/adherents/${memberId}`);
    ok('statut changed', r.json.statut === 'actif', r.json.statut);
    ok('address changed', r.json.adresse.includes('Sousse'), r.json.adresse);

    r = await call('PUT', `/api/adherents/${memberId}`, {
      prenom: 'Amelie', nom: 'Rousseau', email: member.email, telephone: '+216 70 333 444',
      date_naissance: '1996-04-12', adresse: '45 Rue de Paris, Sousse', statut: 'nope',
    });
    ok('invalid statut 400', r.status === 400, r.status);

    console.log('== back office: activity CRUD ==');
    r = await call('POST', '/api/activites', {
      nom_activite: 'Boxing',
      categorie: 'individuel',
      description: 'Technical and conditioning boxing sessions for all levels.',
      jour: 'Thursday',
      horaire: '19:30',
      tarif: 45.5,
      places: 12,
    });
    ok('create activity 201', r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
    const newActId = r.json.id;
    ok('slug boxing', r.json.slug === 'boxing', r.json.slug);

    r = await call('GET', `/api/activites/${newActId}`);
    ok('activity detail 200', r.status === 200);
    ok('inscrits 0', r.json.inscrits === 0, r.json.inscrits);
    ok('membres empty', r.json.membres.length === 0);
    ok('places_restantes equals places', r.json.places_restantes === 12, r.json.places_restantes);

    r = await call('POST', '/api/activites', {
      nom_activite: 'Boxing',
      categorie: 'individuel',
      description: 'Duplicate name test.',
      jour: 'Thursday', horaire: '19:30', tarif: 45, places: 10,
    });
    ok('duplicate name still created with suffix slug', r.status === 201 && r.json.slug === 'boxing-2', `${r.status} ${JSON.stringify(r.json)}`);
    await call('DELETE', `/api/activites/${r.json.id}`);

    r = await call('PUT', `/api/activites/${newActId}`, {
      nom_activite: 'Boxing', categorie: 'individuel',
      description: 'Updated description.', jour: 'Friday', horaire: '20:00', tarif: 50, places: 15,
    });
    ok('update activity 200', r.status === 200, r.status);
    r = await call('GET', `/api/activites/${newActId}`);
    ok('places updated', r.json.places === 15, r.json.places);
    ok('places_restantes recomputed', r.json.places_restantes === 15, r.json.places_restantes);

    console.log('== back office: capacity accounting ==');
    await call('PUT', `/api/adherents/${memberId}`, {
      prenom: 'Amelie', nom: 'Rousseau', email: member.email, telephone: '+216 70 333 444',
      date_naissance: '1996-04-12', adresse: '45 Rue de Paris, Sousse', statut: 'actif', activite_id: newActId,
    });
    r = await call('GET', `/api/activites/${newActId}`);
    ok('inscrits 1 after reassign', r.json.inscrits === 1, r.json.inscrits);
    ok('places_restantes 14', r.json.places_restantes === 14, r.json.places_restantes);
    ok('membre listed', r.json.membres.length === 1 && r.json.membres[0].id === memberId);

    console.log('== back office: delete activity unassigns members ==');
    r = await call('DELETE', `/api/activites/${newActId}`);
    ok('delete 200', r.status === 200, r.status);
    ok('orphans reported', r.json.orphans === 1, r.json.orphans);
    r = await call('GET', `/api/adherents/${memberId}`);
    ok('member activite_id cleared', r.json.activite_id === null, r.json.activite_id);
    r = await call('DELETE', `/api/activites/${newActId}`);
    ok('delete twice 404', r.status === 404, r.status);

    console.log('== back office: delete member ==');
    r = await call('DELETE', `/api/adherents/${memberId}`);
    ok('delete member 200', r.status === 200, r.status);
    r = await call('GET', `/api/adherents/${memberId}`);
    ok('member gone', r.status === 404, r.status);

    console.log('== meta and unknown endpoints ==');
    r = await call('GET', '/api/activites-meta');
    ok('meta 200', r.status === 200);
    ok('categories present', Array.isArray(r.json.categories) && r.json.categories.length === 4, JSON.stringify(r.json.categories));
    ok('days present', r.json.days.length === 7, r.json.days.length);
    ok('statuses present', r.json.statuses.length === 3, JSON.stringify(r.json.statuses));
    r = await call('GET', '/api/nope');
    ok('unknown api 404 json', r.status === 404 && Array.isArray(r.json.errors), r.status);

    console.log('== static pages are served ==');
    for (const p of [
      '/FrontOffice/index.html',
      '/FrontOffice/inscription-adherent.html',
      '/BackOffice/adherents-liste.html',
      '/BackOffice/activite-detail.html',
      '/assets/js/app.js',
      '/assets/js/inscription.js',
      '/assets/css/style.css',
    ]) {
      const res = await fetch(base + p);
      ok(`serves ${p}`, res.ok, res.status);
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
  })();
})();
