# Sports Club

Front office and back office for a sports club, backed by an Express JSON API and
SQLite through Node's built-in `node:sqlite` driver.

## Requirements

- Node.js **22.5.0 or newer** (uses the built-in `node:sqlite` module, no native compilation).
  Developed and tested on Node 24.21.0.
- No external database server. The database file is created and seeded on first run.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Then open <http://localhost:3000>. The root redirects to the front office home page.

Set `PORT` to use a different port and `DB_PATH` to point at a different database file:

```bash
PORT=8080 DB_PATH=./data/club.db npm start
```

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

The first boot upgrades an older database that stored the activity as free text in
`adherents.activite`. The value is normalised to a slug and resolved to an
`activite_id` through `activite_aliases`, which maps the old French slugs
(`natation` → `swimming`, `basket` → `basketball`). Rows whose activity no longer
exists are kept with `activite_id = NULL` rather than dropped. The migration is
recorded in `PRAGMA user_version` and is safe to re-run.

## API

All responses are JSON. Errors return `{ "errors": ["..."] }` with a 4xx status.

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

```bash
npm test              # API + frontend/markup + migration
npm run test:api
npm run test:frontend
npm run test:migration
npm run db:check      # fresh-database smoke test
```

The end-to-end suite needs a running server, so start one on a throwaway database
first:

```bash
DB_PATH=./e2e.db PORT=3210 node server.js &
E2E_PORT=3210 node test/test-e2e.js
```

## Layout

```
server.js          Express app: API routes, static files, error handling
db.js              node:sqlite connection, schema, seed data, migration
test/              Test suites
assets/css/        Single stylesheet, comment-free
assets/js/         Shared helpers plus one script per dynamic page
FrontOffice/       Public pages
BackOffice/        Management pages
```

Front end code is dependency-free: `assets/js/app.js` exposes a small `window.Club`
helper (fetch wrapper, HTML escaping, formatting, feedback) that the page scripts
build on.
