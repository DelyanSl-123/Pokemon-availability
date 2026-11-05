import type { DB } from '../db/connection';
import { detectBotWall, diagnose } from '../scraping/diagnose';
import { extractAll } from '../scraping/extract';
import { fetchPage as defaultFetchPage, type PageFetcher } from '../scraping/fetcher';
import { finishRun, insertRun, listGames, listShops, upsertProduct } from '../db/repository';
import { keywordRegex } from '../shops/games';
import { buildSearchUrl, listsOnlyGame } from '../shops/shop-urls';
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
  const games = listGames(db);
  const gameOf = new Map(games.map((g) => [g.slug, g]));
  // A shop page is checked when it is enabled and its game is still switched on.
  const shops = listShops(db).filter((s) => s.enabled && gameOf.get(s.game)?.enabled !== false);

  const results: ShopRunResult[] = [];
  const products: FoundProduct[] = [];

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    if (i > 0 && delayMs > 0) await sleep(delayMs);

    const game = gameOf.get(shop.game);
    const gameRe = keywordRegex(game?.keywords ?? 'pokemon, pokémon, покемон');
    const gameName = game?.name ?? shop.game;
    // Pokémon keeps using the phrase from the settings; the other games have their own.
    const query = shop.game === 'pokemon' || !game ? opts.query : game.query;
    const searchPage = buildSearchUrl(shop.searchUrl, query);
    const base: ShopRunResult = {
      shopId: shop.id,
      shopName: shop.name,
      game: shop.game,
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
        filterPokemon: !listsOnlyGame(shop.searchUrl, gameRe, shop.game === 'pokemon'),
        gameRe,
      });
      const seenAt = now().toISOString();

      const save = db.transaction(() => {
        for (const p of matched) {
          const { isNew, backInStock } = upsertProduct(db, shop.id, p, seenAt);
          products.push({ ...p, shopId: shop.id, shopName: shop.name, game: shop.game, isNew, backInStock });
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
            ? `${scanned.length} products were on the page, none looked like ${gameName} trading cards`
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
    games: games.filter((g) => g.enabled).map((g) => ({ slug: g.slug, name: g.name })),
    shops: results,
    products,
  };
  finishRun(db, runId, summary.finishedAt, summary);
  return summary;
}
