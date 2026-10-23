# Pokémon TCG Tracker

Checks a list of web shops once a day for Pokémon TCG products and emails you what it found and on which page. **Search only, it never buys anything.**

- `backend/` TypeScript, Fastify, SQLite (better-sqlite3), Cheerio, node-cron, nodemailer
- `frontend/` React + Vite + TypeScript: manage shops, see products, run a check, edit email/schedule

## Run it

Needs Node 20+ (22 recommended). Run these on the machine that will stay on (PC, Raspberry Pi, VPS).

```bash
# 1. backend
cd backend
npm install
cp .env.example .env      # fill in the SMTP_* values (see "Email" below)
npm test                  # unit tests
npm run dev               # API on http://127.0.0.1:3001

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev               # UI on http://localhost:5173
```

Single-process setup: run `npm run build` in `frontend/`, then `npm run build && npm start` in `backend/`. The backend serves `frontend/dist` itself on port 3001.

The daily job runs inside the backend process (default 09:00, Europe/Sofia), so the backend has to be running. Keep it alive with `pm2`, `systemd`, or Docker.

## Run daily on GitHub Actions (no server needed)

`.github/workflows/daily-check.yml` runs `npm run check` every day at 06:00 UTC (09:00 Sofia in summer, 08:00 in winter), checks all shops once and sends the email.

1. In the repo go to **Settings → Secrets and variables → Actions → New repository secret** and add: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (see "Email" below). `MAIL_TO` is optional and defaults to delyan.sl@gmail.com.
2. Edit the shop list in `backend/shops.json` (commit the change; add `"searchUrl"` or `"enabled": false` per shop if needed).
3. Test it: **Actions → Daily Pokemon TCG check → Run workflow**.

Notes: the SQLite file is kept between runs with the Actions cache (so NEW / BACK IN STOCK flags work); if the cache is ever lost, everything simply shows as NEW once. GitHub may block scheduled workflows in public repos after 60 days without activity, and some shops block data-centre IPs, so check the first runs' output.

## Email

Without `SMTP_HOST` the digest is only printed to the server log. For Gmail: turn on 2-step verification, create an **App password**, then use `smtp.gmail.com`, port `465`, `SMTP_SECURE=true`, your address as `SMTP_USER` and the app password as `SMTP_PASS`.

Each digest lists, per shop: the product, price, stock state and link, with `NEW` and `BACK IN STOCK` flags. Shops that could not be checked are listed with the reason.

## Adding / changing shops

Use the **Shops** table in the UI (or `POST /api/shops`). Type just `www.example.bg`; the search URL defaults to `https://www.example.bg/search?q={query}`. If a shop uses a different search URL, edit it in the table, `{query}` is replaced with the search phrase (default `pokemon tcg`, editable under settings).

A shop can also be a fixed category/listing page: give a `searchUrl` **without** `{query}` (e.g. the Pokemon Center UK page `https://www.pokemoncenter.com/en-gb/category/tcg-cards`). Every product on such a page is treated as a match. Out-of-stock products are labelled `[OUT OF STOCK]` in the email and sorted last. Note that pokemoncenter.com loads products with JavaScript and may block bots, so it can show up as `blocked` or `0 found`.

Built-in presets (unverified, edit them if a search returns nothing):

| Shop | Search URL |
| --- | --- |
| ozone.bg | `https://www.ozone.bg/instantsearchplus/result/?q={query}` |
| toyzzshop.bg | `https://toyzzshop.bg/catalogsearch/result/?q={query}` |

## How product detection works

For each shop's search-results page the parser tries, in order: schema.org JSON-LD products, common product-card markup (title, link, price in лв/BGN/€, in/out-of-stock text), then plain links mentioning Pokémon. Results are kept only if they look like trading-card products (Pokémon + TCG/booster/карти/Elite Trainer/tin/…). This is generic by design; if a particular shop is missed, add a dedicated parser for it in `backend/src/extract.ts` (the test fixtures in `backend/test/` show the pattern).

## Things to know

- **robots.txt:** it is obeyed by default per shop (checkbox in the Shops table). A shop that disallows the search page shows up as `blocked` in the last-run panel and in the email instead of being silently skipped. Check each shop's terms before turning this off.
- Only the first page of results is read. Server-rendered pages work; pages that load products with JavaScript after the page opens will return nothing (they would need a headless browser or the shop's own JSON endpoint).
- The check waits 1.5 s between shops and sends one request per shop per day.

## API

`GET/POST /api/shops`, `PATCH/DELETE /api/shops/:id`, `GET /api/products?shopId=&inStock=true`, `GET /api/runs`, `POST /api/run {sendEmail}`, `GET/PUT /api/settings`.
