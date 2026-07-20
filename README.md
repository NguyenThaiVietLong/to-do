# To Do

A Microsoft To Do clone with a productivity dashboard. Next.js 16, React 19,
Tailwind v4, shadcn/ui. Data lives in a JSON file on the server, behind a single
shared password.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

In development, with no `APP_PASSWORD` set, the app runs open — no login screen.

Note that `npm start` does **not** work here: `output: "standalone"` means the
production server is `node .next/standalone/server.js`, and that folder needs
`.next/static` and `public/` copied in beside it. The Dockerfile does both.

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
| [src/lib/db.ts](src/lib/db.ts) | The JSON file store |
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

Everything is one JSON file, `db.json`, written under `DATA_DIR` (default
`./data`, gitignored). Writes go through a promise queue so concurrent requests
can't drop each other's changes, and use write-then-rename so a crash mid-write
leaves the previous file intact.

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
  do nothing. Railway and Render both terminate TLS for you.

## Deploy

The store writes to disk, so this needs a host with a **persistent volume**.
It will not work on Vercel or any read-only/ephemeral filesystem — the to-do
list would vanish on every redeploy.

Build with the included `Dockerfile`, then set:

| Variable | Value |
|---|---|
| `APP_PASSWORD` | your password — required, or the app returns 503 |
| `DATA_DIR` | the volume mount path (the image defaults to `/data`) |

**Railway** — New Project → Deploy from GitHub repo. It detects the Dockerfile.
Add a Volume mounted at `/data`, then set `APP_PASSWORD` under Variables.

**Render** — New → Web Service → Docker. Add a Disk mounted at `/data`, then set
`APP_PASSWORD` under Environment.

Mount the volume before the first deploy that stores anything real: attaching
one later starts from an empty directory.
