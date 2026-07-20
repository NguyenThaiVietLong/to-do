# To Do

A Microsoft To Do clone with a productivity dashboard. Next.js 16, React 19,
Tailwind v4, shadcn/ui. Data lives in Postgres, behind a single shared password.

## Run it

```bash
cp .env.example .env.local     # then fill in DATABASE_URL
npm install
npm run dev                    # http://localhost:3000
```

`DATABASE_URL` is required, in development too — there is no local fallback.
[Neon](https://neon.com)'s free plan is enough and needs no card. The schema
creates itself on the first request; there is no migration step to run.

Leave `APP_PASSWORD` unset in development and the app runs open, with no login
screen.

## What is in it

**Tasks** (`/`)

- Smart lists: My Day, Important, Planned, All, Completed
- Custom lists — add and delete from the sidebar
- Add, rename, complete, star, delete tasks
- Detail pane: steps, Add to My Day, due date, notes
- Search across every list
- Light and dark theme, following the OS until you pick one

**Dashboard** (`/dashboard`)

- Current streak — the hero figure, with longest streak, active days, total done
- Open tasks by list — horizontal bars
- Productivity heatmap — completions per day over the last 53 weeks

## Where the code lives

| Path | What it does |
|---|---|
| [src/lib/types.ts](src/lib/types.ts) | `Task`, `TaskList`, `Step` |
| [src/lib/date.ts](src/lib/date.ts) | Local-calendar `YYYY-MM-DD` helpers |
| [src/lib/store.tsx](src/lib/store.tsx) | Client state, optimistic, backed by the API |
| [src/lib/db.ts](src/lib/db.ts) | Postgres schema and queries |
| [src/lib/validate.ts](src/lib/validate.ts) | Request body validation |
| [src/lib/auth.ts](src/lib/auth.ts) | Password check and session signing |
| [src/proxy.ts](src/proxy.ts) | Gates every route (was `middleware.ts` before Next 16) |
| [src/app/api/](src/app/api/) | Route handlers |
| [src/lib/seed.ts](src/lib/seed.ts) | First-run sample data (a year of history) |
| [src/lib/selectors.ts](src/lib/selectors.ts) | View filters, streaks, heatmap grid |
| [src/components/charts/](src/components/charts/) | The two charts and their table twins |

## Notes on the charts

The colours are not hand-picked. They were run through the `dataviz` skill's
validator, and the results drove two decisions worth keeping if you edit them:

- **Bars are all one blue.** List names are nominal — "Work" is not greater than
  "Groceries" — so shading each bar by its value would double-encode bar length
  as colour and spend the identity channel on nothing.
- **The heatmap ramp is one hue, and it is not simply flipped for dark mode.**
  Each mode's steps were chosen against that mode's surface. The lightest
  light-mode step is `#86b6ef` rather than something paler, because level 1 means
  "one task done", not "nothing", so it has to stay visible (2.11:1 against the
  card).

Every chart has a **Table** toggle. That is not decoration — a colour-encoded
scale is unreadable for some people and unprintable for others, so the numbers
must always be reachable as text.

## Data

Two tables, `lists` and `tasks`, created on first use by
[db.ts](src/lib/db.ts). Deleting a list cascades to its tasks in the schema.

Two decisions worth keeping if you touch the schema:

- **Dates are `TEXT`, not `DATE`.** Every date in this app is a local-calendar
  `YYYY-MM-DD` string (see [date.ts](src/lib/date.ts)). Letting the driver hand
  back a `Date` would reintroduce exactly the UTC slide that convention exists
  to avoid.
- **Every bound parameter in the `UPDATE` is cast explicitly.** Values arrive
  untyped, and a bare `NULL` inside `COALESCE`/`CASE` stops Postgres inferring
  the type. The nullable columns also need a separate "is this key present"
  flag, because for them `null` is a value the caller may be setting on purpose.

**Reset data** on the dashboard empties the store — the default lists, no tasks.
To get the year of sample history back, which is the only thing that makes the
charts worth looking at:

```bash
curl -X POST localhost:3000/api/reset -H 'Content-Type: application/json' \
  -d '{"seed":true}'
```

### API

| Endpoint | |
|---|---|
| `GET /api/state` | Everything, in one request |
| `GET POST /api/tasks` | List, create |
| `PATCH DELETE /api/tasks/[id]` | Update, delete |
| `GET POST /api/lists` | List, create |
| `PATCH DELETE /api/lists/[id]` | Update, delete (takes its tasks with it) |
| `POST /api/reset` | Empty, or `{"seed":true}` |
| `POST DELETE /api/login` | Sign in, sign out |

## Auth

One password for everyone, set as `APP_PASSWORD`. This is not multi-user auth:
every visitor who knows the password sees and edits the same data.

The session cookie is `<expiry>.<hmac>`, signed with the password itself.
Nothing is stored server-side, so restarts don't sign you out, and changing
`APP_PASSWORD` invalidates every existing session.

Two behaviours worth knowing before you deploy:

- **A production build refuses to start serving without `APP_PASSWORD`** — every
  route returns 503. Without that, forgetting the variable would put an
  unauthenticated read/write API on the public internet.
- **The session cookie is `Secure` in production, so the app must be served over
  HTTPS.** Behind plain HTTP the browser drops the cookie and login appears to
  do nothing. Vercel terminates TLS for you.

## Deploy

Nothing is written to disk, so any Node host works. Vercel plus Neon needs no
card on either side.

Import the repo on Vercel and set two environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `APP_PASSWORD` | your password — required, or every route returns 503 |

The schema creates itself on the first request, so there is no migration step
in the deploy.

### Known rough edge

`POST /api/reset` with `{"seed":true}` inserts its ~490 rows one statement at a
time, each a separate round trip. It works, but it is slow enough to notice.
Batch it if you find yourself reseeding often.
