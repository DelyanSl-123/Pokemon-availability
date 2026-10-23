/**
 * One-shot run for schedulers such as GitHub Actions: sync the shop list from
 * shops.json, check every shop once, send the email digest, then exit.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, type DB } from './db';
import { mailConfigFromEnv } from './mailer';
import { createShop, deleteShop, listShops, updateShop } from './repo';
import { createService } from './service';
import { normalizeShopInput } from './shops';
import type { Settings } from './types';

interface ShopEntry {
  url: string;
  name?: string;
  searchUrl?: string;
  enabled?: boolean;
}

/** Makes the database match shops.json (adds, updates and removes shops). */
function syncShops(db: DB, file: string): void {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8')) as ShopEntry[];

  const wanted = new Map<string, { shop: ReturnType<typeof normalizeShopInput>; enabled: boolean }>();
  for (const entry of entries) {
    const shop = normalizeShopInput(entry);
    wanted.set(shop.baseUrl, { shop, enabled: entry.enabled !== false });
  }

  const existing = listShops(db);
  for (const s of existing) {
    if (!wanted.has(s.baseUrl)) deleteShop(db, s.id);
  }
  for (const [baseUrl, { shop, enabled }] of wanted) {
    const current = existing.find((s) => s.baseUrl === baseUrl);
    if (current) {
      updateShop(db, current.id, { name: shop.name, searchUrl: shop.searchUrl, enabled });
    } else {
      const created = createShop(db, shop);
      if (!enabled) updateShop(db, created.id, { enabled: false });
    }
  }
}

async function main() {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'tracker.db');
  const shopsFile = process.env.SHOPS_FILE ?? path.resolve(process.cwd(), 'shops.json');

  const defaults: Settings = {
    mailTo: process.env.MAIL_TO || 'delyan.sl@gmail.com',
    cron: '0 9 * * *',
    query: process.env.SEARCH_QUERY || 'pokemon tcg',
  };

  const db = openDb(dbPath);
  if (fs.existsSync(shopsFile)) {
    syncShops(db, shopsFile);
  } else {
    console.log(`No ${shopsFile} found, using the shops already in the database.`);
  }

  const service = createService({ db, mail: mailConfigFromEnv(), defaults });
  const { summary, email } = await service.runAndNotify('schedule');

  const lines: string[] = [
    `Checked ${summary.shops.length} shop(s), ${summary.products.length} product(s) found.`,
  ];
  for (const s of summary.shops) {
    const detail = s.status === 'ok' ? `${s.found} found, ${s.newCount} new` : `${s.status}: ${s.message ?? ''}`;
    lines.push(`- ${s.shopName}: ${detail}`);
  }
  lines.push(email?.sent ? `Email sent to ${defaults.mailTo}.` : `EMAIL NOT SENT: ${email?.reason ?? 'disabled'}`);
  console.log(lines.join('\n'));

  // Show the result on the workflow run page (Summary), not only in the raw log.
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Pokémon TCG check\n\n${lines.join('\n')}\n`);
  }

  // Fail the run when no email went out, so a missing/wrong SMTP setup is not hidden behind a green tick.
  if (!email?.sent) {
    // `::error::` shows the reason as an annotation at the top of the run page.
    console.log(`::error title=Email not sent::${email?.reason ?? 'disabled'}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.log(`::error title=Check crashed::${e instanceof Error ? e.message : String(e)}`);
  console.error(e);
  process.exit(1);
});
