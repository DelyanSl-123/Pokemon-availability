import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ensureAdmin } from './auth/users';
import { openDb } from './db/connection';
import { createShop, getSettings, listShops } from './db/repository';
import { createScheduler } from './core/scheduler';
import { buildServer } from './api/server';
import { createService } from './core/service';
import { normalizeShopInput } from './shops/shop-urls';
import { syncShops } from './shops/sync';
import type { Settings } from './types';

async function main() {
  const port = Number(process.env.PORT ?? 3001);
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'tracker.db');
  const timezone = process.env.SCHEDULE_TZ ?? 'Europe/Sofia';

  const defaults: Settings = {
    cron: process.env.DEFAULT_CRON ?? '0 9 * * *', // every day at 09:00
    query: process.env.SEARCH_QUERY ?? 'pokemon tcg',
  };

  const db = openDb(dbPath);

  // First start: load the shops from config/shops.json (the file also used by the daily run).
  if (listShops(db).length === 0) {
    const shopsFile = process.env.SHOPS_FILE ?? path.resolve(process.cwd(), 'config', 'shops.json');
    if (fs.existsSync(shopsFile)) {
      syncShops(db, shopsFile);
    } else {
      createShop(db, normalizeShopInput({ url: 'www.ozone.bg' }));
    }
  }

  // The admin account comes only from the environment; everyone who registers is a regular user.
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (adminEmail) {
    const admin = ensureAdmin(db, adminEmail, process.env.ADMIN_PASSWORD || undefined);
    if (!admin) console.log(`ADMIN_EMAIL is set but ADMIN_PASSWORD is not: no admin account for ${adminEmail} yet.`);
  } else {
    console.log('ADMIN_EMAIL not set: nobody can manage shops, run checks or change settings in the web UI.');
  }

  const service = createService({ db, defaults });
  const scheduler = createScheduler(() => service.run('schedule'), timezone);

  const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  const app = await buildServer({
    db,
    service,
    scheduler,
    defaults,
    staticDir: fs.existsSync(frontendDist) ? frontendDist : undefined,
    secureCookies: process.env.COOKIE_SECURE === 'true',
  });

  const settings = getSettings(db, defaults);
  scheduler.start(settings.cron);

  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
  console.log(`Pokemon tracker API on http://127.0.0.1:${port}`);
  console.log(`Daily check: "${settings.cron}" (${timezone})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
