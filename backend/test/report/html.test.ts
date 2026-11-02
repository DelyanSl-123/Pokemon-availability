import { describe, expect, it } from 'vitest';
import { buildReportHtml } from '../../src/report/html';
import type { FoundProduct, RunSummary } from '../../src/types';

const product = (over: Partial<FoundProduct>): FoundProduct => ({
  title: 'Pokemon TCG Booster',
  url: 'https://www.ozone.bg/p/1',
  price: 12.99,
  currency: 'EUR',
  inStock: true,
  imageUrl: null,
  shopId: 1,
  shopName: 'ozone.bg',
  isNew: true,
  backInStock: false,
  ...over,
});

const summary: RunSummary = {
  runId: 1,
  startedAt: '2026-10-25T07:00:00.000Z',
  finishedAt: '2026-10-25T07:00:05.000Z',
  source: 'manual',
  query: 'pokemon tcg',
  shops: [
    { shopId: 1, shopName: 'ozone.bg', searchUrl: 'https://www.ozone.bg/pokemon/', status: 'ok', found: 2, scanned: 50, newCount: 1, backInStock: 0 },
    { shopId: 2, shopName: 'blocked.bg', status: 'blocked', message: 'Disallowed by robots.txt', found: 0, newCount: 0, backInStock: 0 },
  ],
  products: [
    product({}),
    product({ title: 'Pokemon TCG ETB', url: 'https://www.ozone.bg/p/2', inStock: false, isNew: false }),
  ],
};

describe('buildReportHtml', () => {
  const html = buildReportHtml(summary);

  it('is a complete page that carries the results as data', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>CollectibleMarket');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,');
    expect(html).toContain('Pokemon TCG Booster');
    expect(html).toContain('https://www.ozone.bg/p/2');
    expect(html).toContain('"inStock":false');
    expect(html).toContain('Out of stock');
  });

  it('includes the status of shops that could not be checked', () => {
    expect(html).toContain('Disallowed by robots.txt');
    expect(html).toContain('"status":"blocked"');
  });

  it('cannot be broken out of by hostile product titles', () => {
    const evil = buildReportHtml({
      ...summary,
      products: [product({ title: '</script><img src=x onerror=alert(1)>' })],
    });
    expect(evil).not.toContain('</script><img');
    expect(evil).toContain('\\u003c/script\\u003e');
  });

  it('shows a sign-in icon linking to the web app only when its address is known', () => {
    expect(html).not.toContain('class="account"');
    const linked = buildReportHtml(summary, { appUrl: 'https://app.example.com/' });
    expect(linked).toContain('<a class="account" href="https://app.example.com/"');
    expect(buildReportHtml(summary, { appUrl: 'javascript:alert(1)' })).not.toContain('class="account"');
    expect(buildReportHtml(summary, { appUrl: 'https://x.test/"><script>' })).not.toContain('"><script>');
  });

  it('has a Poké Ball placeholder for products without an image', () => {
    expect(html).toContain('function noImage()');
    expect(html).toContain('pic.appendChild(noImage())');
  });

  it('lets two to five products be picked and compared on their own page', () => {
    expect(html).toContain('var MIN_PICK = 2;');
    expect(html).toContain('var MAX_PICK = 5;');
    expect(html).toContain('id="compare-view" hidden');
    expect(html).toContain('id="cmpbar" hidden');
    expect(html).toContain("'#compare/'");
  });

  it('lists shops to check by hand with their link and note', () => {
    const withManual = buildReportHtml(summary, {
      manualShops: [{ name: 'toyzzshop.bg', url: 'https://toyzzshop.bg/nastolni-igri', note: 'The shop blocks automatic checks (HTTP 403)' }],
    });
    expect(withManual).toContain(
      '"manualShops":[{"name":"toyzzshop.bg","page":"https://toyzzshop.bg/nastolni-igri","note":"The shop blocks automatic checks (HTTP 403)"}]',
    );
    expect(withManual).toContain("'Check manually'");
    expect(html).toContain('"manualShops":[]');
  });

  it('works without any product', () => {
    expect(buildReportHtml({ ...summary, products: [] })).toContain('"products":[]');
  });
});
