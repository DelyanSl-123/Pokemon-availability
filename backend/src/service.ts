import { runCheck } from './checker';
import type { DB } from './db';
import type { PageFetcher } from './fetcher';
import { sendDigest, buildDigest, type MailConfig, type SendResult } from './mailer';
import { getSettings } from './repo';
import type { RunSummary, Settings } from './types';

export interface ServiceDeps {
  db: DB;
  mail: MailConfig;
  defaults: Settings;
  fetchPage?: PageFetcher;
  delayMs?: number;
}

export interface RunOutcome {
  summary: RunSummary;
  email: SendResult | null;
}

export function createService(deps: ServiceDeps) {
  let running = false;

  async function runAndNotify(
    source: 'schedule' | 'manual',
    opts: { sendEmail?: boolean } = {},
  ): Promise<RunOutcome> {
    if (running) throw new Error('A check is already running');
    running = true;
    try {
      const settings = getSettings(deps.db, deps.defaults);
      const summary = await runCheck(
        { db: deps.db, fetchPage: deps.fetchPage, delayMs: deps.delayMs },
        { query: settings.query, source },
      );

      let email: SendResult | null = null;
      if (opts.sendEmail !== false) {
        email = await sendDigest(deps.mail, settings.mailTo, buildDigest(summary));
      }
      return { summary, email };
    } finally {
      running = false;
    }
  }

  return { runAndNotify, isRunning: () => running };
}

export type Service = ReturnType<typeof createService>;
