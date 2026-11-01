import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db/connection';
import { mailConfigFromEnv } from './mail/mailer';
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
    mailTo: process.env.MAIL_TO ?? 'delyan.sl@gmail.com',
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

  const service = createService({ db, mail: mailConfigFromEnv(), defaults });
  const scheduler = createScheduler(() => service.runAndNotify('schedule'), timezone);

  const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  const app = await buildServer({
    db,
    service,
    scheduler,
    defaults,
    staticDir: fs.existsSync(frontendDist) ? frontendDist : undefined,
  });

  const settings = getSettings(db, defaults);
  scheduler.start(settings.cron);

  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
  console.log(`Pokemon tracker API on http://127.0.0.1:${port}`);
  console.log(`Daily check: "${settings.cron}" (${timezone}) -> ${settings.mailTo}`);
  if (!process.env.SMTP_HOST) console.log('SMTP_HOST not set: digests will be printed here instead of emailed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
