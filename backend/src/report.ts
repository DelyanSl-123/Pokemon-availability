/**
 * Local report: checks every shop once (no email) and writes ONE self-contained HTML file with
 * all results, then opens it in your browser.   npm run report
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createService } from './core/service';
import { openDb } from './db/connection';
import { mailConfigFromEnv } from './mail/mailer';
import { writeReport } from './report/write';
import { readManualShops, syncShops } from './shops/sync';
import type { Settings } from './types';

function openInBrowser(file: string): void {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => undefined).unref();
  } catch {
    /* the path is printed anyway */
  }
}

async function main() {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'tracker.db');
  const shopsFile = process.env.SHOPS_FILE ?? path.resolve(process.cwd(), 'config', 'shops.json');
  const reportFile = process.env.REPORT_FILE ?? path.resolve(process.cwd(), 'report', 'report.html');

  const defaults: Settings = {
    mailTo: process.env.MAIL_TO || 'delyan.sl@gmail.com',
    cron: '0 9 * * *',
    query: process.env.SEARCH_QUERY || 'pokemon tcg',
  };

  const db = openDb(dbPath);
  if (fs.existsSync(shopsFile)) syncShops(db, shopsFile);

  console.log('Checking shops, this takes about a minute...');
  const service = createService({ db, mail: mailConfigFromEnv(), defaults });
  const { summary } = await service.runAndNotify('manual', { sendEmail: false });

  // Locally the sign-in icon points at the web app on this PC unless APP_URL says otherwise.
  const written = writeReport(summary, reportFile, {
    appUrl: process.env.APP_URL || `http://127.0.0.1:${process.env.PORT ?? 3001}`,
    manualShops: readManualShops(shopsFile),
  });
  for (const s of summary.shops) {
    const detail = s.status === 'ok' ? `${s.found} found` : `${s.status}: ${s.message ?? ''}`;
    console.log(`  - ${s.shopName}: ${detail}`);
  }
  console.log(`\nReport: ${written}`);
  if (!process.argv.includes('--no-open')) openInBrowser(written);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
