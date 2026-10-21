import { describe, expect, it } from 'vitest';
import { runCheck } from '../src/checker';
import { openDb } from '../src/db';
import type { PageFetcher } from '../src/fetcher';
import { createShop, listProducts, listRuns, updateShop } from '../src/repo';
import { CARDS_HTML, CARDS_HTML_RESTOCKED } from './fixtures';

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

  it('skips disabled shops', async () => {
    const { db, shop, deps } = setup(serve(CARDS_HTML));
    updateShop(db, shop.id, { enabled: false });
    const summary = await runCheck(deps, { query: 'pokemon tcg', source: 'manual' });
    expect(summary.shops).toEqual([]);
  });
});
