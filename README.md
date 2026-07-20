# To Do

A Microsoft To Do clone with a productivity dashboard. Next.js 16, React 19,
Tailwind v4, shadcn/ui. All data lives in `localStorage` — no server, no login.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

`npm run build` for a production build, `npm start` to serve it.

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
| [src/lib/store.tsx](src/lib/store.tsx) | State + `localStorage` persistence |
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

Everything sits under the `mstodo.state.v1` key in `localStorage`, so it is
per-browser and never leaves the machine. **Reset sample data** on the dashboard
wipes it and reseeds. Clearing site data does the same thing.
