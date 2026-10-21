import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db';
import { mailConfigFromEnv } from './mailer';
import { createShop, getSettings, listShops } from './repo';
import { createScheduler } from './scheduler';
import { buildServer } from './server';
import { createService } from './service';
import { normalizeShopInput } from './shops';
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

  // First start: seed the shops from the original list.
  if (listShops(db).length === 0) {
    for (const url of ['www.ozone.bg', 'www.toyzzshop.bg']) {
      createShop(db, normalizeShopInput({ url }));
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
