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
  - **Specials**: any yes/no or multiple-choice question, like "Will Fresno be the #1 seed?" or "Who wins the conference?"
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
- Specials: write any question and give it Yes/No, team or custom answers, each with its own odds. You can feature one on the home page, lock it, pick the result to pay winners, and undo a result if needed. If you remove an answer, bets on it are refunded.
- Users: adjust balances (one user or everyone), give or remove admin, reset passwords, view or void bets, delete accounts.
- Settings: starting coins, minimum and maximum bet, current season and week, and an announcement banner.
- Backup and restore everything as one file.

The site starts **blank**. It has no sample teams, games or players.

## Put it on the internet (free, about 2 minutes, one time)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bonebone-cmyk/mcaa-stuff/tree/claude/kind-tesla-lku65o)

1. Click the **Deploy to Cloudflare** button above.
2. Log in to Cloudflare, or make a free account. You don't need a credit card. Connect your GitHub account when it asks.
3. Click **Deploy** and wait about a minute.
4. You get a link like **`https://mcaa-sports.<your-name>.workers.dev`**. Open it and **sign up first**: the first account becomes the league owner (admin).
5. Send that link to everyone. They just open it, sign up and bet. Nobody downloads anything.

**If the button gives an error**, do it from the Cloudflare dashboard instead:
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com), then **Compute (Workers) → Workers & Pages → Create → Import a repository**.
2. Connect GitHub and pick **`mcaa-stuff`**.
3. Set **Project name** to **`mcaa-sports`**. It has to match exactly. Leave the other boxes as they are and click **Deploy**.
4. The first build may fail, because your repo's main branch doesn't have the app. That's expected. Open the new Worker, go to **Settings → Build → Branch control**, set the production branch to **`claude/kind-tesla-lku65o`**, and save.
5. Go to **Deployments** and run the build again if it doesn't start by itself. When it finishes, your link appears at the top of the Worker's page.

Good to know:
- The site stays on all the time. You don't need to keep your computer on.
- Your league data is saved by Cloudflare. Download a backup now and then from **Admin → Settings & Backup** anyway.
- Cloudflare's free plan easily covers a league: about 100,000 requests a day.
- Optional: to reserve the owner account for one username, open the Worker in the Cloudflare dashboard and go to **Settings → Variables and Secrets**. Add `OWNER_USERNAME` = your username.

## Run it on your own computer instead (optional)

Use this only if you don't want it online. Only people on your Wi-Fi can reach it, and only while your computer is on.

1. [Download the ZIP](https://github.com/bonebone-cmyk/mcaa-stuff/archive/refs/heads/claude/kind-tesla-lku65o.zip) and unzip it.
2. Double-click **`Start MCAA Sports (Windows).bat`** or **`Start MCAA Sports (Mac).command`**. If Node.js isn't installed, the launcher downloads it by itself the first time. Then the site opens in your browser.
3. Keep the black window open while people use it. Friends on your Wi-Fi use the "Friends on your Wi-Fi" link it shows.
   - **Windows** may say "Windows protected your PC". Click **More info**, then **Run anyway**.
   - **Mac** may say it can't verify the developer. Go to **System Settings → Privacy & Security** and click **Open Anyway**.

Advanced: `npm start` also works. It reads these optional environment variables: `PORT` (default `3000`), `DATA_DIR` (default `./data`) and `OWNER_USERNAME`.

## Weekly admin flow

1. **Odds & Lines**: post spreads, moneylines and totals for the week, then player props on each game's page.
2. Users bet.
3. **Lock & Final Scores**: lock the week right before you sim. All games are simmed at once, so dates and times are just for flavor.
4. Enter final scores. Game-line bets settle immediately.
5. **Import Stats**: paste or upload each game's box score. Player props grade themselves.
6. **Award Odds**: click *Recommend* to get stat-based candidates and odds, then post or update the boards. Click *Winner* when an award is announced.

## Project layout

```
lib/league.js             League engine: accounts, betting, settlement, admin API (shared by both versions)
worker.js                 Cloudflare version (website): serves the site; data lives in a Durable Object
wrangler.jsonc            Cloudflare settings
server.js                 Node version (your own computer): local server, data in ./data
public/index.html         App shell
public/css/app.css        Styles
public/js/shared.js       Positions, stats, awards, odds math (shared by server and browser)
public/js/core.js         API client, store, helpers, icons, modals
public/js/slip.js         Bet slip
public/js/views/*         Bettor pages
public/js/admin/*         Admin pages, import parsers and the OCR importer
```
