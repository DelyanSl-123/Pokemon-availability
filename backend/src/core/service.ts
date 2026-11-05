import { runCheck } from './checker';
import type { DB } from '../db/connection';
import type { PageFetcher } from '../scraping/fetcher';
import { getSettings } from '../db/repository';
import type { RunSummary, Settings } from '../types';

export interface ServiceDeps {
  db: DB;
  defaults: Settings;
  fetchPage?: PageFetcher;
  delayMs?: number;
}

export function createService(deps: ServiceDeps) {
  let running = false;

  async function run(source: 'schedule' | 'manual'): Promise<RunSummary> {
    if (running) throw new Error('A check is already running');
    running = true;
    try {
      const settings = getSettings(deps.db, deps.defaults);
      return await runCheck(
        { db: deps.db, fetchPage: deps.fetchPage, delayMs: deps.delayMs },
        { query: settings.query, source },
      );
    } finally {
      running = false;
    }
  }

  return { run, isRunning: () => running };
}

export type Service = ReturnType<typeof createService>;
