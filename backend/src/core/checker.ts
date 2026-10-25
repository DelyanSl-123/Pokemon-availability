import type { DB } from '../db/connection';
import { detectBotWall, diagnose } from '../scraping/diagnose';
import { extractAll } from '../scraping/extract';
import { fetchPage as defaultFetchPage, type PageFetcher } from '../scraping/fetcher';
import { finishRun, insertRun, listShops, upsertProduct } from '../db/repository';
import { buildSearchUrl, listsOnlyPokemon } from '../shops/shop-urls';
import type { FoundProduct, RunSummary, ShopRunResult } from '../types';

export interface CheckDeps {
  db: DB;
  fetchPage?: PageFetcher;
  now?: () => Date;
  /** Pause between shops so we stay polite. Tests pass 0. */
  delayMs?: number;
}

function safeDiagnose(html: string, url: string, titles?: string[]): string | undefined {
  try {
    return diagnose(html, url, { titles }).slice(0, 3500);
  } catch {
    return undefined; // diagnostics are best-effort
  }
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

    const searchPage = buildSearchUrl(shop.searchUrl, opts.query);
    const base: ShopRunResult = {
      shopId: shop.id,
      shopName: shop.name,
      searchUrl: searchPage,
      status: 'ok',
      found: 0,
      newCount: 0,
      backInStock: 0,
    };

    const outcome = await fetchPage(searchPage, {
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

    const wall = detectBotWall(outcome.html);
    if (wall) {
      results.push({
        ...base,
        status: 'blocked',
        message: `Blocked by bot protection (${wall}); a plain HTTP request cannot open this page`,
        diagnostics: safeDiagnose(outcome.html, outcome.url),
      });
      continue;
    }

    try {
      const { scanned, matched } = extractAll(outcome.html, outcome.url, {
        filterPokemon: !listsOnlyPokemon(shop.searchUrl),
      });
      const seenAt = now().toISOString();

      const save = db.transaction(() => {
        for (const p of matched) {
          const { isNew, backInStock } = upsertProduct(db, shop.id, p, seenAt);
          products.push({ ...p, shopId: shop.id, shopName: shop.name, isNew, backInStock });
          if (isNew) base.newCount++;
          if (backInStock) base.backInStock++;
        }
      });
      save();

      base.found = matched.length;
      base.scanned = scanned.length;
      base.diagnostics = safeDiagnose(outcome.html, outcome.url, scanned.map((p) => p.title));
      if (matched.length === 0) {
        base.message =
          scanned.length > 0
            ? `${scanned.length} products were on the page, none looked like Pokémon TCG`
            : 'Page loaded but no products were recognised';
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
