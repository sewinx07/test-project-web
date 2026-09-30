(function () {
  'use strict';

  const fs = require('fs');
  const path = require('path');

  const ROOT = path.join(__dirname, '..');
  const PAGES = [
    'FrontOffice/index.html',
    'FrontOffice/activites-liste.html',
    'FrontOffice/inscription-adherent.html',
    'BackOffice/activites-liste.html',
    'BackOffice/activite-detail.html',
    'BackOffice/activite-form.html',
    'BackOffice/adherents-liste.html',
    'BackOffice/adherent-detail.html',
    'BackOffice/adherent-form.html',
  ];

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

  console.log('== static assets referenced by pages exist ==');
  for (const page of PAGES) {
    const file = path.join(ROOT, page);
    ok(`${page} exists`, fs.existsSync(file));
    const html = fs.readFileSync(file, 'utf8');

    const refs = [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
      const target = path.resolve(path.dirname(file), decodeURIComponent(ref));
      if (ref.endsWith('/')) continue;
      ok(`  ${page} -> ${ref}`, fs.existsSync(target), 'missing');
    }
  }

  console.log('== every page that needs API has the scripts ==');
  const expected = {
    'FrontOffice/inscription-adherent.html': ['app.js', 'inscription.js'],
    'BackOffice/adherents-liste.html': ['app.js', 'adherents-liste.js'],
    'BackOffice/adherent-detail.html': ['app.js', 'adherent-detail.js'],
    'BackOffice/adherent-form.html': ['app.js', 'adherent-form.js'],
    'BackOffice/activites-liste.html': ['app.js', 'activites-liste.js'],
    'BackOffice/activite-detail.html': ['app.js', 'activite-detail.js'],
    'BackOffice/activite-form.html': ['app.js', 'activite-form.js'],
  };
  for (const [page, scripts] of Object.entries(expected)) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const s of scripts) ok(`${page} loads ${s}`, html.includes(`../assets/js/${s}`));
  }

  console.log('== no hardcoded member/activity rows left in backoffice tables ==');
  for (const page of [
    'BackOffice/adherents-liste.html',
    'BackOffice/activites-liste.html',
    'BackOffice/adherent-detail.html',
    'BackOffice/activite-detail.html',
  ]) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    ok(`${page} has no sample member names`, !/Trabelsi|Ben Salah|Bouazizi|Mansouri/.test(html));
    ok(`${page} has no hardcoded detail links without id`, !/href="adherent-detail\.html"/.test(html));
    ok(`${page} has no hardcoded activity detail links without id`, !/href="activite-detail\.html"/.test(html));
  }

  console.log('== no mojibake left in the pages ==');
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    ok(`${page} clean`, !/Ãƒ|Ã¢|Ã†|â€/.test(html));
  }

  console.log('== forms declare novalidate and a feedback target ==');
  for (const page of [
    'FrontOffice/inscription-adherent.html',
    'BackOffice/adherent-form.html',
    'BackOffice/activite-form.html',
  ]) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    ok(`${page} novalidate`, /<form[^>]*novalidate/.test(html));
    ok(`${page} has #form-feedback`, /id="form-feedback"/.test(html));
    ok(`${page} has #submit-btn`, /id="submit-btn"/.test(html));
  }

  console.log('== css braces balanced and new classes defined ==');
  const css = fs.readFileSync(path.join(ROOT, 'assets/css/style.css'), 'utf8');
  const open = (css.match(/{/g) || []).length;
  const close = (css.match(/}/g) || []).length;
  ok('braces balanced', open === close, `${open} vs ${close}`);
  ok('no comments', !/\/\*|\*\//.test(css));
  for (const sel of [
    '.toolbar',
    '.toolbar-count',
    '.form-feedback',
    '.form-feedback--success',
    '.form-feedback--error',
    '.form-feedback--warning',
    '.field-hint',
    '.btn-danger',
    '--danger-dark',
  ]) {
    ok(`css defines ${sel}`, css.includes(`${sel} {`) || css.includes(`${sel}:`) || css.includes(`${sel},`));
  }
  ok('css defines .table-empty', /\.table-empty[ ,{]/.test(css));
  const used = new Set();
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
  }
  for (const cls of used) {
    ok(`class .${cls} styled`, css.includes(`.${cls}`) || cls.startsWith('form-feedback--'), 'not in css');
  }

  // Vercel only bundles files it can trace through require(). Nothing
  // requires the HTML, so without includeFiles the deployed function serves
  // "Cannot GET" for every page.
  console.log('\n== deployment config ==');
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const included = vercel.functions?.['api/index.js']?.includeFiles || [];
  for (const dir of ['FrontOffice', 'BackOffice', 'assets']) {
    ok(`vercel includeFiles ships ${dir}/`, included.some((g) => g.startsWith(`${dir}/`)), JSON.stringify(included));
  }
  ok('vercel rewrites non-api paths to the function',
    (vercel.rewrites || []).some((r) => r.source.includes('api') && r.destination === '/api'));
  ok('api/index.js exports the express app',
    fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8').includes("require('../server')"));
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok('server.js writes no files (stateless deploy)',
    !/writeFile|appendFile|createWriteStream|new DatabaseSync/.test(serverSrc));
  ok('server.js listens only when run directly',
    /require\.main === module[\s\S]{0,80}app\.listen/.test(serverSrc));
  ok('db init is scoped to /api so pages survive a db outage',
    /app\.use\('\/api',[\s\S]{0,200}init\(\)/.test(serverSrc));

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
})();
