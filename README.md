# MCAA Sports

The sportsbook for the **Minecraft College Athletics Association**. You bet with **coins**, which are fake currency: no real money goes in or comes out.

## Features

**For bettors**
- Log in or sign up with a username and password.
- Bet types:
  - Moneyline
  - Point spread
  - Game total over/under
  - Team total points
  - Exact score
  - Player props (only the stats that fit the player's position)
  - Custom game-stat over/unders
  - Award futures
- A bet slip with quick-stake buttons. If an odd changes before you place a bet, the slip warns you.
- Pages for My Bets, coin history, the leaderboard, team pages (roster, schedule, leaders) and player pages (season stats, game log, open props).
- A Game of the Week banner, plus layouts for phones and desktops.

**For admins**
- Add teams and logos one at a time or in bulk. Logos are matched to teams by file name.
- Import rosters as text, CSV or a screenshot. If a player appears twice at two positions, that's one player with both positions.
- Import a season schedule from a screenshot, CSV, a spreadsheet paste or plain text.
  - Images are read in your browser with OCR.
  - If the image or text is hard to read, the app asks you to upload another version.
  - Team names it doesn't recognize can be created as new teams or matched to existing ones.
- Odds and lines:
  - Enter a whole week at once, or open a single game for team totals, exact score, player props and custom over/unders.
  - A button suggests moneylines from the spreads you entered.
- Lock betting for one game or a whole week, then enter final scores. Bets settle right away. Fixing a score re-settles the bets.
- Import stats: game box scores (these grade player props automatically), season player stats and team season stats.
- Award odds for Craftsman, QBOTY, WROTY, RBOTY, OLOTY, DLOTY, KOTY, POTY, ROTY, FOTY, OPOY and DPOY.
  - After you import stats, the app recommends candidates for each award with suggested odds.
- Users: adjust balances (one user or everyone), give or remove admin, reset passwords, view or void bets, delete accounts.
- Settings: starting coins, minimum and maximum bet, current season and week, and an announcement banner.
- Backup and restore everything as one file.

The site starts **blank**. It has no sample teams, games or players.

## Running it

You need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install beyond that.

```bash
npm start            # or: node server.js
```

Open http://localhost:3000.

> **The first account created becomes the league owner (admin).** Sign up right after you launch it. To reserve owner for one username, start the server with `OWNER_USERNAME=yourname`.

Settings (environment variables):

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DATA_DIR` | `./data` | Where the database (`db.json`) and logos are stored |
| `OWNER_USERNAME` | *(unset)* | When set, only this username can become the owner |

## Hosting it online

The app needs a small always-on Node server, so GitHub Pages won't work. Any Node host will:
- Render, Railway or Fly.io
- A VPS
- A spare PC

Run `node server.js` on it.

**Important:** point `DATA_DIR` at **persistent storage** (for example a Render disk or a Railway volume). Otherwise free hosts can wipe your data when they restart. Download a backup from **Admin → Settings & Backup** now and then either way.

## Weekly admin flow

1. **Odds & Lines**: post spreads, moneylines and totals for the week, then player props on each game's page.
2. Users bet.
3. **Lock & Final Scores**: lock the week right before you sim. All games are simmed at once, so dates and times are just for flavor.
4. Enter final scores. Game-line bets settle immediately.
5. **Import Stats**: paste or upload each game's box score. Player props grade themselves.
6. **Award Odds**: click *Recommend* to get stat-based candidates and odds, then post or update the boards. Click *Winner* when an award is announced.

## Project layout

```
server.js                 HTTP server, JSON-file database, auth, betting and settlement
public/index.html         App shell
public/css/app.css        Styles
public/js/shared.js       Positions, stats, awards, odds math (shared by server and browser)
public/js/core.js         API client, store, helpers, icons, modals
public/js/slip.js         Bet slip
public/js/views/*         Bettor pages
public/js/admin/*         Admin pages, import parsers and the OCR importer
```
