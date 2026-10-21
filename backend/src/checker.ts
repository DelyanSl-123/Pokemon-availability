import type { DB } from './db';
import { extractProducts } from './extract';
import { fetchPage as defaultFetchPage, type PageFetcher } from './fetcher';
import { finishRun, insertRun, listShops, upsertProduct } from './repo';
import { buildSearchUrl } from './shops';
import type { FoundProduct, RunSummary, ShopRunResult } from './types';

export interface CheckDeps {
  db: DB;
  fetchPage?: PageFetcher;
  now?: () => Date;
  /** Pause between shops so we stay polite. Tests pass 0. */
  delayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runCheck(
  deps: CheckDeps,
  opts: { query: string; source: 'schedule' | 'manual' },
): Promise<RunSummary> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const fetchPage: PageFetcher = deps.fetchPage ?? ((url, o) => defaultFetchPage(url, o));
  const delayMs = deps.delayMs ?? 1500;

  const startedAt = now().toISOString();
  const runId = insertRun(db, startedAt, opts.source);
  const shops = listShops(db).filter((s) => s.enabled);

  const results: ShopRunResult[] = [];
  const products: FoundProduct[] = [];

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    if (i > 0 && delayMs > 0) await sleep(delayMs);

    const base: ShopRunResult = {
      shopId: shop.id,
      shopName: shop.name,
      status: 'ok',
      found: 0,
      newCount: 0,
      backInStock: 0,
    };

    const outcome = await fetchPage(buildSearchUrl(shop.searchUrl, opts.query), {
      respectRobots: shop.respectRobots,
    });

    if (!outcome.ok) {
      results.push({
        ...base,
        status: outcome.reason === 'blocked' ? 'blocked' : 'error',
        message: outcome.message,
      });
      continue;
    }

    try {
      const extracted = extractProducts(outcome.html, outcome.url);
      const seenAt = now().toISOString();

      const save = db.transaction(() => {
        for (const p of extracted) {
          const { isNew, backInStock } = upsertProduct(db, shop.id, p, seenAt);
          products.push({ ...p, shopId: shop.id, shopName: shop.name, isNew, backInStock });
          if (isNew) base.newCount++;
          if (backInStock) base.backInStock++;
        }
      });
      save();

      base.found = extracted.length;
      if (extracted.length === 0) {
        base.message = 'Page loaded but no Pokémon TCG products were recognised';
      }
      results.push(base);
    } catch (e) {
      results.push({ ...base, status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const summary: RunSummary = {
    runId,
    startedAt,
    finishedAt: now().toISOString(),
    source: opts.source,
    query: opts.query,
    shops: results,
    products,
  };
  finishRun(db, runId, summary.finishedAt, summary);
  return summary;
}
