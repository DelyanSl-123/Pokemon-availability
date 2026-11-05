import { describe, expect, it } from 'vitest';
import { runCheck } from '../../src/core/checker';
import { openDb } from '../../src/db/connection';
import type { PageFetcher } from '../../src/scraping/fetcher';
import { createShop, listProducts, listRuns, updateGame, updateShop } from '../../src/db/repository';
import { BOT_WALL_HTML, CARDS_HTML, CARDS_HTML_RESTOCKED, OTHER_CARDS_HTML } from '../fixtures/html';

const now = () => new Date('2026-10-21T07:00:00Z');

function setup(fetchPage: PageFetcher) {
  const db = openDb(':memory:');
  const shop = createShop(db, {
    name: 'Shop A',
    baseUrl: 'https://a.test',
    searchUrl: 'https://a.test/search?q={query}',
  });
  return { db, shop, deps: { db, fetchPage, now, delayMs: 0 } };
}

const serve =
  (html: string): PageFetcher =>
  async (url) => ({ ok: true, html, url });

describe('runCheck', () => {
  it('stores found products and flags them as new on the first run only', async () => {
    const { db, deps } = setup(serve(CARDS_HTML));

    const first = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(first.shops[0]).toMatchObject({ status: 'ok', found: 2, newCount: 2, backInStock: 0 });
    expect(first.products.every((p) => p.isNew)).toBe(true);
    expect(listProducts(db)).toHaveLength(2);

    const second = await runCheck(deps, { query: 'pokemon tcg', source: 'schedule' });
    expect(second.shops[0]).toMatchObject({ found: 2, newCount: 0 });
    expect(second.products.every((p) => !p.isNew)).toBe(true);
    expect(listProducts(db)).toHaveLength(2);
    expect(listRuns(db)).toHaveLength(2);
  });

  it('detects a product that is back in stock', async () => {
    let html = CARDS_HTML;
    const { deps } = setup(async (url) => ({ ok: true, html, url }));

    await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    html = CARDS_HTML_RESTOCKED;
    const second = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });

    expect(second.shops[0].backInStock).toBe(1);
    const etb = second.products.find((p) => p.title.includes('Elite Trainer'));
    expect(etb).toMatchObject({ backInStock: true, inStock: true, isNew: false });
  });

  it('puts the search phrase into the shop search URL', async () => {
    const urls: string[] = [];
    const { deps } = setup(async (url) => {
      urls.push(url);
      return { ok: true, html: '<html></html>', url };
    });
    await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(urls).toEqual(['https://a.test/search?q=pokemon%20tcg']);
  });

  it('reports a shop blocked by robots.txt without failing the run', async () => {
    const { deps } = setup(async () => ({ ok: false, reason: 'blocked', message: 'Disallowed by robots.txt' }));
    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops[0]).toMatchObject({ status: 'blocked', message: 'Disallowed by robots.txt' });
    expect(summary.products).toEqual([]);
  });

  it('reports network errors per shop and keeps checking the others', async () => {
    const { db, deps } = setup(async (url) =>
      url.startsWith('https://b.test')
        ? { ok: false, reason: 'network', message: 'boom' }
        : { ok: true, html: CARDS_HTML, url },
    );
    createShop(db, { name: 'Shop B', baseUrl: 'https://b.test', searchUrl: 'https://b.test/s?q={query}' });

    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops.map((s) => s.status)).toEqual(['ok', 'error']);
    expect(summary.products).toHaveLength(2);
  });

  it('reports a bot-protection page as blocked instead of "0 found"', async () => {
    const { deps } = setup(serve(BOT_WALL_HTML));
    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops[0].status).toBe('blocked');
    expect(summary.shops[0].message).toContain('Incapsula');
  });

  it('explains when products were on the page but none were Pokémon TCG', async () => {
    const { deps } = setup(serve(OTHER_CARDS_HTML));
    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops[0]).toMatchObject({ status: 'ok', found: 0, scanned: 1 });
    expect(summary.shops[0].message).toContain('1 products were on the page');
  });

  it('skips disabled shops', async () => {
    const { db, shop, deps } = setup(serve(CARDS_HTML));
    updateShop(db, shop.id, { enabled: false });
    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops).toEqual([]);
  });

  it('checks every game with its own keywords and search phrase, and tags the products with the game', async () => {
    const MIXED = `<ul class="products">
      <li class="product-item"><h3 class="product-name"><a href="/op-booster">One Piece Card Game Booster OP-05</a></h3><span class="price">5,00 лв.</span><button>Добави в количката</button></li>
      <li class="product-item"><h3 class="product-name"><a href="/ygo-deck">Yu-Gi-Oh! TCG Structure Deck</a></h3><span class="price">15,00 лв.</span><button>Добави в количката</button></li>
      <li class="product-item"><h3 class="product-name"><a href="/pk-booster">Pokémon TCG Booster Pack</a></h3><span class="price">8,00 лв.</span><button>Добави в количката</button></li>
    </ul>`;
    const asked: string[] = [];
    const db = openDb(':memory:');
    createShop(db, { name: 'Shop A', baseUrl: 'https://a.test', searchUrl: 'https://a.test/search?q={query}', game: 'onepiece' });
    createShop(db, { name: 'Shop A', baseUrl: 'https://a.test', searchUrl: 'https://a.test/yugioh/', game: 'yugioh' });
    createShop(db, { name: 'Shop A', baseUrl: 'https://a.test', searchUrl: 'https://a.test/tcg/all', game: 'mtg' });
    const fetchPage: PageFetcher = async (url) => (asked.push(url), { ok: true, html: MIXED, url });

    const summary = await runCheck({ db, fetchPage, now, delayMs: 0 }, { query: 'pokemon tcg', source: 'manual' });

    // the search page of One Piece uses the game's phrase, not the Pokémon one
    expect(asked[0]).toBe('https://a.test/search?q=one%20piece%20card%20game');
    const byGame = Object.fromEntries(summary.shops.map((s) => [s.game, s]));
    expect(byGame.onepiece).toMatchObject({ status: 'ok', found: 1 }); // keyword-filtered search page
    expect(byGame.yugioh).toMatchObject({ status: 'ok', found: 3 }); // category page named after the game: everything counts
    expect(byGame.mtg).toMatchObject({ found: 0 });
    expect(byGame.mtg.message).toContain('Magic: The Gathering');
    expect(summary.products.filter((p) => p.game === 'onepiece').map((p) => p.url)).toEqual(['https://a.test/op-booster']);
    expect(summary.games?.map((g) => g.slug)).toEqual(['pokemon', 'onepiece', 'yugioh', 'mtg']);
  });

  it('skips the pages of a game that is switched off', async () => {
    const { db, deps } = setup(serve(CARDS_HTML));
    updateGame(db, 'pokemon', { enabled: false });
    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops).toHaveLength(0);
    expect(summary.games?.map((g) => g.slug)).not.toContain('pokemon');
  });
});
