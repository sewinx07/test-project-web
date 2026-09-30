# Sports Club

Front office and back office for a sports club, backed by an Express JSON API and
PostgreSQL.

## Requirements

- Node.js **22 or newer** (the npm scripts use `--env-file-if-exists`).
  Developed and tested on Node 24.21.0.
- A reachable PostgreSQL database and its connection string. Works with any
  Postgres host; the project is set up against a Neon project.

## Install

```bash
npm install
```

## Configure

Copy the template and fill in your connection string:

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

`.env` is read automatically by the npm scripts. On Vercel, set the same value as an
environment variable named `DATABASE_URL` instead — do not commit a `.env` file.

## Run

```bash
npm start
```

Then open <http://localhost:3000>. The root redirects to the front office home page.
The schema is created and seeded automatically on the first request.

Apply the schema ahead of time with `npm run db:migrate`, and inspect the result with
`npm run db:check`.

## Deploying to Vercel

`vercel.json` and `api/index.js` deploy the app as a single serverless function. Set
`DATABASE_URL` in **Project Settings → Environment Variables** for all environments.
No filesystem state is required, so the function is stateless across cold starts.

Why a hosted database is required: the previous version stored data in a local SQLite
file. Vercel mounts a deployment read-only and runs each invocation in a fresh
sandbox, so a file-backed database cannot work there.

## Pages

| Path | Purpose |
| --- | --- |
| `/FrontOffice/index.html` | Public landing page with the animated logo marquee |
| `/FrontOffice/activites-liste.html` | Public activity catalogue |
| `/FrontOffice/inscription-adherent.html` | Public member registration form |
| `/BackOffice/activites-liste.html` | Activity list: search, edit, delete |
| `/BackOffice/activite-detail.html` | Activity detail with its enrolled members |
| `/BackOffice/activite-form.html` | Create or edit an activity (`?id=` to edit) |
| `/BackOffice/adherents-liste.html` | Member list: search, status filter, edit, delete |
| `/BackOffice/adherent-detail.html` | Member profile and assigned activity |
| `/BackOffice/adherent-form.html` | Create or edit a member (`?id=` to edit) |

All back office pages read and write through the API, so every page reflects the
current database contents after a refresh.

## Data model

`adherents.activite_id` is a foreign key to `activites.id`, so a member belongs to at
most one activity. Deleting an activity sets its members' `activite_id` to `NULL`
and the API reports how many members were unassigned.

```
adherents ──activite_id──▶ activites
                             ▲
                    activite_aliases (legacy slug mapping)
```

| Table | Purpose |
| --- | --- |
| `activites` | Activity catalogue, seeded with six rows |
| `adherents` | Members, each linked to at most one activity |
| `activite_aliases` | Maps historical slugs onto current activity ids |
| `schema_migrations` | Applied schema version |

### Seed activities

| Activity | Category | Day | Time | Fee | Places |
| --- | --- | --- | --- | --- | --- |
| Football | Ball Sports | Saturday | 10:00 | 60 | 30 |
| Swimming | Water Sports | Tuesday | 18:00 | 80 | 20 |
| Fitness | Individual Sports | Monday | 19:00 | 70 | 25 |
| Tennis | Ball Sports | Thursday | 17:00 | 90 | 16 |
| Yoga | Well-being | Sunday | 09:00 | 50 | 35 |
| Basketball | Ball Sports | Friday | 18:30 | 60 | 24 |

### Migration from the legacy schema

The first run upgrades an older database that stored the activity as free text in
`adherents.activite`. The value is normalised to a slug and resolved to an
`activite_id` through `activite_aliases`, which maps the old French slugs
(`natation` → `swimming`, `basket` → `basketball`). Rows whose activity no longer
exists are kept with `activite_id = NULL` rather than dropped, and member ids and
statuses are preserved. The version is recorded in `schema_migrations` and the
migration is safe to re-run.

Migrations run inside a transaction and take a table lock, so two cold starts racing
on a fresh database cannot both seed.

## API

All responses are JSON. Errors return `{ "errors": ["..."] }` with a 4xx status.
If the database is unreachable, `/api/*` returns `503` while the static pages keep
serving normally.

### Activities

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/api/activites` | Includes `inscrits` and `places_restantes` |
| `GET` | `/api/activites/:id` | Includes `membres[]` |
| `POST` | `/api/activites` | `201` with `{ id, slug }` |
| `PUT` | `/api/activites/:id` | |
| `DELETE` | `/api/activites/:id` | Returns `{ id, orphans }` |

### Members

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/api/adherents` | Joined with the activity name |
| `GET` | `/api/adherents/:id` | |
| `POST` | `/api/adherents` | Public registration, created as `en_attente`, needs `conditions: true` |
| `PUT` | `/api/adherents/:id` | Requires a valid `statut` |
| `DELETE` | `/api/adherents/:id` | |

### Meta

`GET /api/activites-meta` returns the allowed `categories`, `days` and `statuses`.

### Validation

- Names: 2–50 letters, spaces, apostrophes and hyphens.
- Email: unique, `409` on conflict.
- Phone: 8–15 characters from digits, `+` and spaces.
- Address: 5–120 characters.
- Members must be at least 16 years old.
- Activity: name 3–50 characters, description ≤ 300, fee 0–1000, places 1–200.
- Activity categories: `ballon`, `eau`, `individuel`, `bien-etre`.
- Member statuses: `actif`, `en_attente`, `suspendu`.

There is no authentication on the back office endpoints, as this is a course project.
Do not expose it to the internet as-is.

## Tests

`test/test-frontend.js` is static analysis and needs nothing but the repository.
The remaining suites **truncate the database in `DATABASE_URL`**, so they refuse to
run unless you opt in and point at a scratch database:

```bash
ALLOW_DB_TESTS=1 DATABASE_URL="<scratch url>" npm test
```

| Command | Covers |
| --- | --- |
| `npm test` | API + markup + migration |
| `npm run test:api` | CRUD, validation, constraint handling |
| `npm run test:frontend` | Markup, script wiring, stylesheet (no database) |
| `npm run test:migration` | Legacy free-text activity upgrade and idempotency |
| `npm run test:e2e` | Boots a real server and drives the full user flow |

## Layout

```
server.js          Express app: API routes, static files, error handling
db.js              Postgres pool, schema, seed data, migration
api/index.js       Vercel serverless entry point
vercel.json        Rewrites every non-API path to the function
scripts/           migrate.js, check-db.js
test/              Test suites and the shared harness
assets/css/        Single stylesheet, comment-free
assets/js/         Shared helpers plus one script per dynamic page
FrontOffice/       Public pages
BackOffice/        Management pages
```

Front end code is dependency-free: `assets/js/app.js` exposes a small `window.Club`
helper (fetch wrapper, HTML escaping, formatting, feedback) that the page scripts
build on.
