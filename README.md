# College Football Universe

A multi-user, database-driven college football universe: real people own programs, recruit fictional prospects, play simulated games, chase rankings and playoff bids, and write the lore of an evolving league.

Built with **Next.js 16 (App Router) + TypeScript + Tailwind CSS**, **PostgreSQL on Supabase**, **Supabase Auth**, and a server-side simulation engine.

---

## Quick start

### 1. Create a Supabase project
1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy the project URL, the anon (publishable) key and the service-role key.
3. In **Project Settings → Database → Connection string**, copy the **Transaction pooler** URI (port 6543).
4. In **Authentication → URL Configuration**, set the Site URL to your app URL and add `<your-url>/auth/callback` as a redirect URL.

### 2. Configure and install
```bash
cp .env.example .env.local      # fill in the four values above
npm install
```

### 3. Create the schema and seed data
```bash
# Option A — the bundled migrator (uses DATABASE_URL)
set -a; source .env.local; set +a
npm run db:migrate
# Option B — Supabase CLI
supabase link --project-ref <ref> && supabase db push

npm run db:seed        # 138 programs + a DEMO season with 6 simulated weeks (~20 s)
```
`npm run db:seed -- --base-only` loads only conferences, teams, rivalries and TV networks (no demo data).

### 4. Run it and make yourself commissioner
```bash
npm run dev            # http://localhost:3000
```
Sign up in the app, then:
```bash
npm run make-commissioner -- you@example.com
```
After that you can assign owners, run weeks and manage everything from **Commissioner Panel**. No code edits needed.

### Deploying
See **Deploy to Cloudflare** below. Vercel or any other Next.js host also works with the same environment variables; the build doesn't need database access.

---

## Deploy to Cloudflare (Workers)

The site runs as a Cloudflare Worker through the official OpenNext adapter (`wrangler.jsonc`, `open-next.config.ts`).

> **You need the Workers Paid plan ($5/month).** The free plan allows 10 ms of CPU per request. Page rendering, simulating a week and processing recruiting need far more. `wrangler.jsonc` raises the limit to 5 minutes, which only paid accounts can use.

1. **Supabase.** Create the project as in Quick start step 1.
2. **Database (no local setup needed).**
   - In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Name it `DATABASE_URL` and use your Supabase pooler connection string as the value.
   - Then **Actions → Set up database → Run workflow → `migrate-and-seed-demo`**.
3. **Cloudflare.**
   - Go to **Workers & Pages → Create → Import a repository** and pick this repo and branch.
   - Name the Worker `college-football-universe`. It must match `name` in `wrangler.jsonc`.
   - Build command: `npx opennextjs-cloudflare build`. Deploy command: `npx opennextjs-cloudflare deploy`.
   - **Build variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. These are baked into the browser code at build time.
   - **Worker variables and secrets** (Settings → Variables and Secrets): the same three, plus `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as secrets.
4. **Supabase Auth URLs.** Set the Site URL to your `*.workers.dev` (or custom) domain and add `<that URL>/auth/callback` as a redirect URL.
5. **Commissioner.** Sign up on the live site, then run **Actions → Set up database → `make-commissioner`** with your email.

**Optional: Hyperdrive.** In Cloudflare, go to **Storage & Databases → Hyperdrive → Create**. Paste Supabase's *direct* connection string (port 5432), then uncomment the `hyperdrive` block in `wrangler.jsonc` with its ID. The app uses `HYPERDRIVE` automatically when it's present.

**From your own computer instead:** run `npx wrangler login`, then `npm run cf:deploy`. `npm run cf:preview` runs the Worker locally; put your secrets in `.dev.vars` (see `.dev.vars.example`).

**What was verified:** the Cloudflare build succeeds (2.1 MB compressed). Under Cloudflare's local runtime (`wrangler dev`), every page rendered from the database, and these all worked: advancing a week, simulating a 69-game week, recruiting offers and an exhibition live sim. It has not yet been deployed to a real Cloudflare account.

---

## Demo data versus official records
The seed creates a **2026 Demo Season**, generated rosters, a recruiting class, simulated results and a few articles. **Every one of those rows is flagged `is_demo` and shows a DEMO badge** in the UI. The 138 programs, conferences, rivalries and networks are the starting dataset of the official universe and are not demo data.

When you're ready to begin for real: **Commissioner Panel → Overview → Purge demo data**, then **Seasons & League → Create Official Season**. Use **Teams → Edit → Generate fictional roster** (or **Import / Export**) to fill rosters.

## Logos
Teams use their **real logos** from ESPN's public logo CDN (`a.espncdn.com/i/teamlogos/ncaa/500/<espn id>.png`), and conferences use their real logos too. If an image can't load, a team-colored badge with the abbreviation is shown instead. Commissioners can change any logo URL or upload a replacement to Supabase Storage (**Teams → Edit**).

> The ESPN IDs come from the dataset in `src/lib/data/teams.ts`. The CDN was unreachable from the build sandbox, so each ID has not been checked against a live image. If one shows the fallback badge, fix it from **Teams → Edit**.

---

## Architecture

```
src/
  app/                    Next.js routes (server components + server actions)
    commissioner/         Control Center (+ actions.ts: every admin mutation)
    my-team/              Owner dashboard, recruiting board, depth chart (+ actions.ts)
    games/[id]/live       Live Game Center (drive-by-drive replay)
    news/                 Lore platform + TipTap editor (+ actions.ts)
  lib/
    sim/engine.ts         Play-by-play simulation engine (pure, seeded)
    recruiting/engine.ts  Recruiting decision engine + AI recruiting (pure, seeded)
    rankings/compute.ts   Computer / coaches / media / playoff rankings (pure)
    schedule/generate.ts  Season schedule generator (pure)
    standings.ts          Records, tiebreakers, strength of schedule (pure)
    playoffs.ts           Field selection + 4/8/12/16-team brackets (pure)
    development.ts        Progression, redshirts, eligibility, team ratings (pure)
    services/             Transactional database operations (games, seasons, recruiting, rankings, articles…)
    auth/permissions.ts   Role rules (pure, unit tested)
supabase/migrations/      Schema, views, RLS, storage bucket
scripts/                  migrate, seed, make-commissioner, lifecycle-check
tests/unit, tests/integration
```

**Data access and security**
- All **official writes** go through server actions. Each one finds the signed-in user (Supabase Auth), checks their role with `lib/auth/permissions.ts`, and runs inside a **Postgres transaction** on the server's database connection. Important changes are written to `audit_log`.
- **Row-level security** is on for every table. It is defense in depth for anyone calling the Supabase REST API with the public key:
  - Official data is read-only.
  - Recruiting interest, budgets and actions are visible only to the owning staff and the commissioner.
  - Drafts are visible only to their author.
  - Users can edit only their own display name. The `role` column isn't writable through the API.
- **Game results:** the game row is locked with `SELECT … FOR UPDATE` and must not already be final, so a game can never be finalized twice. Concurrent requests are covered by a test.
- **Recruiting actions:** the team's weekly budget row is locked, so concurrent submissions can't overspend. A partial unique index blocks duplicate actions, and another prevents a recruit from signing twice.
- **Derived data:** standings, records and leaderboards are SQL views over final games. Results flow into them automatically, and exhibitions and lore are excluded.

### Simulation engine
- It's a real state machine: downs, distance, field position, game clock, possession, kickoffs and touchbacks, punts, field goals, PAT and 2-point decisions, 4th-down logic, kneel-downs, onside kicks, safeties, return touchdowns, and college overtime (2-point attempts from 2OT, alternating 2-point plays from 3OT).
- **Inputs:** unit ratings computed from the depth chart (QB, receivers, offensive line, RB, front seven, secondary, kickers), offensive and defensive scheme matchups, coach rating, home-field rating, momentum from recent results, injuries (injured players are skipped), RB and defensive fatigue, and seeded randomness.
- **Upsets:** each team gets a game-day "form" swing, scaled by the upset and randomness sliders. Stronger teams usually win, but nothing is predetermined.

  | Talent gap | Underdog win rate (default sliders) |
  |---|---|
  | ~8 points | ~24% |
  | ~15 points | ~9% |
  | even | ~5% of games go to OT |

- **Calibration:** about 26–27 points and about 410 yards per team per game.
- **Consistency:** every statistic is derived from the plays. Tests check that:
  - the score equals the scoring plays;
  - quarters sum to the total;
  - passer, receiver and rusher yards sum to team yards;
  - every interception thrown equals one made;
  - per-play stat deltas sum exactly to the final box score.
- **Reproducible seeds:** each game's seed (`<game id>:v<version>`, or a custom one) and settings are saved. Re-simulating a reopened game with the same seed reproduces it.
- **Modes:**
  - **Quick:** score, box score and player stats.
  - **Detailed:** adds drives and play-by-play.
  - **Live:** the same server-side result, presented drive by drive in the Live Game Center. It shows the scoreboard, clock, down and distance, a field graphic, play-by-play, running team and player stats, a win-probability chart and the scoring summary.
  - **Manual:** a result entered by the commissioner, for example a game played in EA Sports College Football.
- **Overrides:** "Override result" reopens a final game. It removes that game's stats and injuries and is written to the audit log.

### Recruiting
- **Prospects:** each one is generated with stars, national, state and position ranks, attributes, a preferred scheme and **personal priorities**. Priorities are weights over prestige, playing time, coach, recent success, title contention, distance, scheme fit, visits and relationship.
- **Owner actions:** owners spend weekly points to **scout** (reveals exact ratings, otherwise you see ranges), **contact**, **offer**, schedule an **official visit**, **pitch** an angle, or **pull an offer**. Owners can never set interest directly.
- **Weekly processing:** when the commissioner advances the week, the engine:
  - runs the owners' actions plus **AI recruiting by every computer-controlled school**;
  - updates interest as action effect × school fit;
  - decides **commitments, flips and decommitments**;
  - runs **signing day** at the configured week. Computer-controlled programs fill their roster needs; owners must sign their own classes.
- **Transfer portal:** opens when a season closes (buried or unhappy players) or when an owner releases a player. Transfers are recruited during offseason weeks.
- **Class rankings:** a 247-style weighted score.
- **Commissioner rules:** points, costs, scholarship and offer limits, visits per week, signing-day week, commit threshold, flip margin, and optional **approval of owner actions**.

### Seasons
`createSeason → generate schedule → advance weeks (sim → advance) → conference title games → playoff → close season → offseason portal weeks → start next season`
- **Schedule generator:** builds week-by-week matchings. A team never plays twice in a week, matchups don't repeat, all 54 annual rivalries are scheduled, and each team gets 11–12 games. Kickoff times and TV networks are assigned by matchup quality.
- **Close season:** archives final records and ranks into `team_seasons`. Every season stays browsable under History.
- **Start next season:**
  - player development, scaled by potential, coaching, playing time, production and development trait;
  - redshirts (four or fewer games played);
  - graduation (four seasons played or five years in the program);
  - signees and transfers join their rosters;
  - program prestige drifts with results;
  - a new schedule and recruiting class are generated.

---

## Tests
```bash
npm test                                                     # unit tests (engines, standings, schedule, rankings, playoffs, recruiting, permissions)
TEST_DATABASE_URL=postgres://… npm test                      # + integration tests on a scratch DB (it is wiped!)
DATABASE_URL=… npm run lifecycle-check                       # drives the current season through playoffs into next season
```

The integration tests apply the migrations to plain Postgres using a local stub of Supabase's auth schema (`supabase/local/auth_stub.sql`, local testing only). They cover:
- exactly-once finalization under concurrency;
- seed reproducibility after an override;
- manual-result validation;
- concurrent budget spending;
- permission checks;
- single signing per recruit;
- lore never changing official results, and HTML sanitization;
- RLS hiding private recruiting data and blocking writes.

CI (`.github/workflows/ci.yml`) runs the type check, all tests against Postgres 16, and a production build.

---

## Feature status

### Implemented and working
- **Accounts and permissions**
  - Supabase email and password auth.
  - Roles: commissioner, owner/head coach, viewer/fan.
  - One primary owner per team, plus optional assistant coaches (a commissioner toggle).
  - Owners can't touch other teams or commissioner data.
  - Audit log.
- **138-team database**
  - Your conference alignment, with real logos and colors, stadiums and coordinates.
  - Custom and fictional schools, renames, custom conferences and realignment (per-season membership snapshots).
- **Team pages:** overview, roster, depth chart, schedule, recruiting class, history and timeline (official events and lore kept separate), rivalries with head-to-head records, news, and follow.
- **Simulation:** quick, detailed, live and manual modes; exhibitions between any two teams; eight settings sliders; reproducible seeds; overrides.
- **Live Game Center** and box scores: quarter scoring, team stats, individual stats, play-by-play, drive chart, win probability, scoring summary, injuries.
- **Schedules:** generator, rivalry games, neutral sites, kickoff times, custom TV networks (name, tier, logo URL), Game of the Week, manual game creation and editing.
- **Standings:** overall, conference, home and away records, PF and PA, streaks, strength of schedule, head-to-head tiebreakers.
- **Rankings:** coaches, media, computer (with a transparent breakdown) and playoff rankings, generated every week. The commissioner can also set any poll manually.
- **Playoffs:** 4, 8, 12 or 16 teams; automatic and at-large bids; seeding with byes; campus first round; bowl sites; national championship history.
- **Recruiting:** the full system described above, including AI competition, flips, decommits, signing day, transfer portal and class rankings.
- **Players:** profiles with attributes, season, career and game-log stats, injuries, recruiting and transfer history, development log, milestones, redshirt and eligibility.
- **Statistics:** leaderboards by season, conference, team and position; team stat leaders; a record book (single game, single season, career, team records, margins, conference titles); rivalry series.
- **Lore platform:**
  - TipTap editor with headings, lists, quotes, links, image URL and upload, YouTube embeds, and quick links to teams;
  - related teams, players and games;
  - cover image, tags, categories, featured and breaking flags, comments;
  - drafts;
  - owner lore limited to their own program;
  - HTML sanitized on save and on render.
- **Owner dashboard:** action center, upcoming opponent, record and rank, recruiting points, targets with interest meters, pending actions and decisions, injuries, development, standings, team news. Also a recruiting board and a depth chart and strategy editor.
- **Commissioner Control Center:** weekly operations, exhibitions, games, teams (logo upload, staff assignment, roster generation, delete or deactivate), users and roles, seasons, conferences, networks, rivalries, rankings, recruiting rules and approvals, simulation and universe settings, audit log, JSON export and import, demo purge. Destructive actions ask for confirmation.
- **Interface:** global search (teams, players, recruits, articles, games); dark theme with a light toggle; desktop sidebar and mobile bottom navigation; tested at phone width with no horizontal scroll.

### Not yet implemented, or partial (honest list)
- **Awards:** the `awards` table and its display exist, but there is no automatic award voting (Heisman-style). Awards are not yet created anywhere in the UI.
- **Divisions:** there is a table but no UI. Conferences are single-table standings with a top-two championship game.
- **Bowl games outside the playoff** are not generated.
- **Notifications, e-mail or push alerts, and a "followed teams" feed** are not built. Following a team is stored but only shown on the team page.
- **Live Sim** is a replay of a game the server has already computed and saved. That is intentional, so results can't be changed mid-game, but it isn't a real-time multi-viewer broadcast.
- **Comments:** authors and the commissioner can delete via the API, but there is no moderation UI or rate limiting yet.
- **Import** takes JSON only (teams and players), not CSV. Export is JSON. Database backups rely on Supabase's built-in backups plus this export.
- **Supabase Auth end to end:** sign-up, sign-in and session refresh are written against the official `@supabase/ssr` APIs, but there was no Supabase project in the build sandbox. Signed-in flows (commissioner simulation and week advancement, owner recruiting, depth chart, article publishing) were exercised in a browser with a temporary local session stub that was not committed. Do a quick end-to-end check after connecting your project.
