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

## Starting it (one double-click)

1. **Download** the app: [click here for the ZIP](https://github.com/bonebone-cmyk/mcaa-stuff/archive/refs/heads/claude/kind-tesla-lku65o.zip). Unzip it anywhere, like your Desktop.
2. **Double-click** the launcher for your computer:
   - Windows: **`Start MCAA Sports (Windows).bat`**
   - Mac: **`Start MCAA Sports (Mac).command`**
3. The site opens in your browser. **Sign up first.** The first account becomes the league owner (admin).

That's it. The first time, the launcher downloads Node.js (about 30–45 MB) into the app folder by itself. You don't need to install anything. After that it starts in a second or two.

- **Keep the black window open** while people use the site. Closing it shuts the site down. Double-click the launcher again to bring it back. Everything is saved.
- **Friends on the same Wi-Fi** can join with the "Friends on your Wi-Fi" link shown in that window.
- **First-time security pop-ups** (normal for files downloaded from the internet):
  - **Windows** may say "Windows protected your PC". Click **More info**, then **Run anyway**.
  - **Mac** may say it can't verify the developer. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. Older Macs: right-click the file, choose **Open**, then **Open**.
- Your data lives in the `data` folder inside the app folder. To move to a new computer, copy that folder or use **Admin → Settings & Backup**.

### Advanced options

If you're comfortable with a terminal, `npm start` also works. These environment variables are optional:

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
