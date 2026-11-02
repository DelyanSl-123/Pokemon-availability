/**
 * One-shot run for schedulers such as GitHub Actions: sync the shop list from
 * config/shops.json, check every shop once, send the email digest, then exit.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db/connection';
import { mailConfigFromEnv } from './mail/mailer';
import { createService } from './core/service';
import { writeReport } from './report/write';
import { readManualShops, syncShops } from './shops/sync';
import type { Settings } from './types';

async function main() {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'tracker.db');
  const shopsFile = process.env.SHOPS_FILE ?? path.resolve(process.cwd(), 'config', 'shops.json');

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

  // HTML report of everything found; the workflow publishes it to GitHub Pages and uploads it as a file.
  const reportFile = process.env.REPORT_FILE ?? path.resolve(process.cwd(), 'report', 'report.html');
  // APP_URL: address of the web app; adds a sign-in / register icon to the report header.
  writeReport(summary, reportFile, { appUrl: process.env.APP_URL, manualShops: readManualShops(shopsFile) });
  console.log(`Report written to ${reportFile}`);

  // One notice per shop explaining what its page contained (shown on the workflow run page).
  const escapeData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProp = (s: string) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
  for (const s of summary.shops) {
    if (s.status !== 'ok') {
      console.log(`::warning title=${escapeProp(`${s.shopName}: ${s.status}`)}::${escapeData(s.message ?? 'no details')}`);
    }
    if (s.diagnostics) {
      console.log(`::notice title=${escapeProp(`${s.shopName}: ${s.found} found of ${s.scanned ?? 0} parsed`)}::${escapeData(s.diagnostics)}`);
    }
  }

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
