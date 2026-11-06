# Pokémon TCG Tracker

Checks a list of web shops once a day for Pokémon TCG products and publishes what it found (product, price, stock, shop and link) as an HTML report. **Search only, it never buys anything.**

- `backend/` TypeScript, Fastify, SQLite (better-sqlite3), Cheerio, node-cron
- `frontend/` React + Vite + TypeScript: manage shops, see products, run a check, edit schedule

## Project structure

```
.github/workflows/daily-check.yml   daily scheduled run (GitHub Actions)
backend/
  config/shops.json                 shops to check (used by the daily run)
  src/
    index.ts                        long-running server: API + built-in scheduler
    cli.ts                          one-shot run: sync shops, check, write the report, exit
    types.ts                        shared types
    api/server.ts                   REST API (Fastify), sign-in and role checks
    auth/                           users.ts (accounts, admin, sessions), passwords.ts (scrypt hashing)
    core/                           checker.ts (run a check), service.ts (run a check), scheduler.ts (cron)
    scraping/                       fetcher.ts (HTTP + robots.txt), robots.ts (parser), extract.ts (find products)
    shops/shop-urls.ts              shop URL helpers and rules
    db/                             connection.ts (SQLite + schema), repository.ts (queries)
  test/                             mirrors src/, plus fixtures/ (sample HTML)
frontend/
  src/
    App.tsx                         page layout and state
    api/client.ts                   backend API client and types
    components/                     AuthForm (sign in / register), ShopRow, StockBadge
    utils/format.ts                 small helpers
    styles/app.css
```

## See all results on your PC (one HTML page)

```bash
cd backend
npm install        # first time only
npm run report     # checks every shop and opens report/report.html in your browser
```

`backend/report/report.html` is a single self-contained file, branded **CollectibleMarket** (logo in `assets/collectiblemarket-logo.svg`, also built into the page and used as its tab icon): product cards with image, name, shop, price and stock label, a search box, shop / "in stock" / "new" filters (click a shop to filter by it), sorting and the status of each shop, with a link to each shop's search page when grouped by shop. Tick **Compare** on 2 to 5 products and press **Compare** in the bar at the bottom to see them side by side (price and difference to the cheapest, stock, shop, flags) on a comparison page at `report.html#compare/…`; that link can be bookmarked or shared, and the choice is remembered in the browser. It adapts to phone widths and dark mode. It needs no server to open (product images load from the shops' sites).

The daily GitHub run publishes the same page to **GitHub Pages** at `https://<your-user>.github.io/<repo>/`, always showing the latest run. One-time setup: in the repository go to **Settings → Pages** and set **Source** to **GitHub Actions** (GitHub Pages needs a public repository or a paid plan, and the published page is public). The file is also attached to each run as the **pokemon-report** artifact at the bottom of the run page in the **Actions** tab.

**Sign-in icon:** the report header shows a person icon (“Sign in”) that opens the web app's sign-in / register screen (see [Accounts](#accounts-admin-and-users)). It appears only when the report knows the app's address: `APP_URL` in `backend/.env` (locally `npm run report` falls back to `http://127.0.0.1:3001`), or, for the GitHub Pages report, a repository **variable** named `APP_URL` under **Settings → Secrets and variables → Actions → Variables**. Use an address other people can reach, such as where you host the backend.

## Games menu

The app tracks several trading card games: **Pokémon, One Piece, Yu-Gi-Oh! and Magic: The Gathering** are built in, and the admin can add more with **+ Add / manage games** under the header (name, keywords, search phrase). A game is a tab in the web app and in the HTML report; *All games* shows everything. A product counts for a game when its name or link contains one of the game's keywords and it looks like a card product (booster, deck, box...). Each shop page belongs to one game: the same shop can be listed once per game (`"game": "onepiece"` in `backend/config/shops.json`, default `pokemon`), and a category page whose address names the game (for example `.../one-piece/`) counts every product on it. The search phrase of a game replaces `{query}` in search-page addresses (Pokémon keeps the phrase from the settings). Switching a game off skips its pages; built-in games cannot be removed, added ones can (with their shop pages and saved products). Existing databases are upgraded automatically and everything already tracked stays under Pokémon.

**What is still needed:** the shop pages for the new games. Send the addresses of the One Piece / Yu-Gi-Oh! / Magic category pages of the shops (or add them in the Shops table or in `shops.json`).

## Run it

Needs Node 20+ (22 recommended). Run these on the machine that will stay on (PC, Raspberry Pi, VPS).

```bash
# 1. backend
cd backend
npm install
cp .env.example .env      # set the admin account (see "Accounts" below)
npm test                  # unit tests
npm run dev               # API on http://127.0.0.1:3001

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev               # UI on http://localhost:5173
```

Single-process setup: run `npm run build` in `frontend/`, then `npm run build && npm start` in `backend/`. The backend serves `frontend/dist` itself on port 3001.

The daily job runs inside the backend process (default 09:00, Europe/Sofia), so the backend has to be running. Keep it alive with `pm2`, `systemd`, or Docker.

### Accounts (admin and users)

The web UI needs a sign-in. There are two roles:

| Role | Who | Can |
| --- | --- | --- |
| **Admin** | only the account set in `ADMIN_EMAIL` | everything: add/edit/remove shops, run a check, change schedule/search settings |
| **User** | anyone who registers on the sign-in screen | view products, shops and the last run |

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`. On every start the backend creates that account (or updates its password) and makes it the only admin. Registering can never create an admin, and nobody can register with the admin's email. Passwords are stored as salted scrypt hashes; sign-in uses an HttpOnly session cookie valid for 30 days. If you serve the app over HTTPS, set `COOKIE_SECURE=true`.

The registration form also asks for first name, last name, city and address (required) and a phone number (optional), plus a required checkbox to accept the Terms and Conditions (the time is stored with the account). The terms page is a placeholder, `frontend/public/terms.html`: write your text there; they are stored with the account in the SQLite database and returned only to that signed-in user.

**E-mail activation:** after registering, nobody is signed in. The backend e-mails a link (`APP_URL/?activate=…`, valid for 24 hours, single use) and the account cannot sign in until it is opened; the sign-in page offers "Send the link again". Accounts that existed before this feature, and the admin, count as activated. The backend needs a mail server for this: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` and `APP_URL` in `backend/.env` (for Gmail: `smtp.gmail.com`, port `465`, `SMTP_SECURE=true`, and an **App password** as `SMTP_PASS`). Without `SMTP_HOST` the link is only printed in the server log, which is handy for local testing. This is only for the web app; the daily GitHub run sends no email.

**Account features:** *Forgot your password?* on the sign-in page e-mails a reset link (valid 1 hour, single use; it signs the account out everywhere). A signed-in person opens **My account** to edit name/city/address/phone, change the e-mail (a confirmation link goes to the new address; it only changes when opened), change the password (other devices are signed out), download their data as JSON, or delete the account (not possible for the admin). An account that is never activated is deleted after 24 hours, so a mistyped e-mail frees up by itself. After 5 wrong passwords an account is locked for 15 minutes. The registration form has a hidden honeypot field that catches simple bots; for stronger protection create a free [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) widget and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` in `backend/.env`; the CAPTCHA then appears on the register and forgot-password forms. The checkbox accepts the Terms and the Privacy Policy; both pages are placeholders for your text: `frontend/public/terms.html` and `frontend/public/privacy.html`. The accepted version is stored (`TERMS_VERSION` in `backend/src/auth/users.ts`; raise it when you change the text).

New passwords (registration) must have at least 10 characters, a lowercase letter, an uppercase letter, a digit and a special character, no spaces, no character repeated 3 times in a row, not contain the email name and not be a common password; the form asks to type the password twice and shows which rules are met. The server enforces the same rules (`backend/src/auth/password-rules.ts`; the form uses a copy in `frontend/src/utils/password.ts`). Existing accounts and the admin password from `ADMIN_PASSWORD` are not checked against them, so use a strong one there too.

Only people who can reach the backend can register, so others can only sign up if you host it somewhere public. The GitHub Pages report is separate and has no sign-in.

## Run it with Docker

One image runs the whole app (the backend serves the built frontend).

```
cp backend/.env.example backend/.env    # then fill it in (admin password, SMTP, ...)
docker compose up --build
```

Open http://localhost:3001. The database is kept in the `app-data` volume, so accounts survive restarts and rebuilds. `HOST`, `PORT` and `DB_PATH` are set by the image; the other values come from `backend/.env`. Over plain `http://localhost` keep `COOKIE_SECURE=false`.

To deploy, build the same image on the host (Render, Fly.io, Railway, a VPS) and set the variables from `backend/.env` in its panel instead of a file. Mount a persistent disk at `/data`, set `COOKIE_SECURE=true`, `TRUST_PROXY=true` and `APP_URL` to the public address.

## Run daily on GitHub Actions (no server needed)

`.github/workflows/daily-check.yml` runs `npm run check` every day at 06:00 UTC (09:00 Sofia in summer, 08:00 in winter), checks all shops once and publishes the report.

1. Edit the shop list in `backend/config/shops.json` (commit the change; add `"searchUrl"` or `"enabled": false` per shop if needed).
2. Test it: **Actions → Daily Pokemon TCG check → Run workflow**.

Notes: the SQLite file is kept between runs with the Actions cache (so NEW / BACK IN STOCK flags work); if the cache is ever lost, everything simply shows as NEW once. GitHub may block scheduled workflows in public repos after 60 days without activity, and some shops block data-centre IPs, so check the first runs' output.

## Adding / changing shops

Use the **Shops** table in the UI (or `POST /api/shops`). Type just `www.example.bg`; the search URL defaults to `https://www.example.bg/search?q={query}`. If a shop uses a different search URL, edit it in the table, `{query}` is replaced with the search phrase (default `pokemon tcg`, editable under settings).

A shop can also be a fixed category/listing page: give a `searchUrl` **without** `{query}` (e.g. the Pokemon Center UK page `https://www.pokemoncenter.com/en-gb/category/tcg-cards`). Every product on such a page is treated as a match. Out-of-stock products are labelled `[OUT OF STOCK]` in the report and sorted last. Note that pokemoncenter.com loads products with JavaScript and may block bots, so it can show up as `blocked` or `0 found`.

A shop that blocks the tracker (e.g. toyzzshop.bg, whose Cloudflare protection answers with HTTP 403) can be kept on the list with `"manual": true` and an optional `"note"`. It is never fetched or stored in the database; the HTML report shows it in the Shops row as **Check manually ↗**, linking to its `searchUrl` (or home page), so it can be checked by hand.

Built-in presets (unverified, edit them if a search returns nothing):

| Shop | Search URL |
| --- | --- |
| ozone.bg | `https://www.ozone.bg/pazeli-2d-3d/nastolni-igri/trading-card-games/pokemon/` (category page; their robots.txt disallows search) |
| toyzzshop.bg | `https://toyzzshop.bg/nastolni-igri` (board-games category, filtered for Pokémon TCG; their robots.txt disallows search) |

## How product detection works

For each shop's search-results page the parser tries, in order: schema.org JSON-LD products, common product-card markup (title, link, price in лв/BGN/€, in/out-of-stock text, lazy-loaded images), then plain links mentioning Pokémon. Results are kept only if they look like trading-card products (Pokémon + TCG/booster/карти/Elite Trainer/tin/…). When a card has no stock text, stock is read from its add-to-cart control (enabled = in stock, disabled = out of stock; on a page where some cards have one, a card without one counts as out of stock) and, on Shopify themes that only badge sold-out products, from the missing sold-out badge. These controls are only read, never used. This is generic by design; if a particular shop is missed, add a dedicated parser for it in `backend/src/scraping/extract.ts` (the HTML fixtures in `backend/test/fixtures/` show the test pattern).

## Bot protection

The web app (`backend/src/api/security.ts`) blocks automated access: requests from bots, crawlers, scripts (curl, python, headless browsers…) or without a User-Agent get `403`; every client address is limited to 120 requests/minute and 15 sign-in/register attempts per 10 minutes (`429` after that); `/robots.txt` disallows everything and all responses carry `X-Robots-Tag: noindex`. All data endpoints also need an account. Behind a reverse proxy set `TRUST_PROXY=true` so the limits use the real client address. A bot that fakes a normal browser User-Agent gets past the first check, so rely on the sign-in and the rate limits for real protection.

The report on GitHub Pages is a static page: it has `noindex` and a `robots.txt` that ask search engines and well-behaved bots to stay away, but GitHub Pages cannot block anyone, so anyone with the link can open it. To really restrict it, put it behind Cloudflare Access / a password-protected host, or do not publish it and use `npm run report` locally.

## Things to know

- **robots.txt:** it is obeyed by default per shop (checkbox in the Shops table). A shop that disallows the search page shows up as `blocked` in the last-run panel and in the report instead of being silently skipped. Check each shop's terms before turning this off.
- Only the first page of results is read. Server-rendered pages work; pages that load products with JavaScript after the page opens will return nothing (they would need a headless browser or the shop's own JSON endpoint).
- The check waits 1.5 s between shops and sends one request per shop per day.

## API

Accounts (no sign-in needed): `POST /api/auth/register {email, password}`, `POST /api/auth/login {email, password}`, `POST /api/auth/logout`, `GET /api/auth/me`. `GET /api/health` is also open.

Signed in (any user): `GET /api/shops`, `GET /api/products?shopId=&inStock=true`, `GET /api/runs`.

Admin only: `POST /api/shops`, `PATCH/DELETE /api/shops/:id`, `POST /api/run`, `GET/PUT /api/settings`.

Without a session the API answers `401`; a regular user calling an admin endpoint gets `403`.
