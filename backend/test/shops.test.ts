import { describe, expect, it } from 'vitest';
import { buildSearchUrl, isCategoryPage, normalizeShopInput } from '../src/shops';

describe('normalizeShopInput', () => {
  it('accepts a bare domain', () => {
    const shop = normalizeShopInput({ url: 'www.ozone.bg' });
    expect(shop.name).toBe('ozone.bg');
    expect(shop.baseUrl).toBe('https://www.ozone.bg');
    expect(shop.searchUrl).toContain('{query}');
  });

  it('reduces a full URL to its origin and uses a generic search URL for unknown shops', () => {
    const shop = normalizeShopInput({ url: 'https://Example.COM/some/path?x=1' });
    expect(shop.baseUrl).toBe('https://example.com');
    expect(shop.searchUrl).toBe('https://example.com/search?q={query}');
  });

  it('keeps a custom name and search URL', () => {
    const shop = normalizeShopInput({
      url: 'example.com',
      name: 'My shop',
      searchUrl: 'https://example.com/?s={query}',
    });
    expect(shop).toEqual({ name: 'My shop', baseUrl: 'https://example.com', searchUrl: 'https://example.com/?s={query}' });
  });

  it('accepts a fixed category page URL without {query}', () => {
    const shop = normalizeShopInput({
      url: 'https://www.pokemoncenter.com',
      name: 'Pokemon Center UK',
      searchUrl: 'https://www.pokemoncenter.com/en-gb/category/tcg-cards',
    });
    expect(shop.searchUrl).toBe('https://www.pokemoncenter.com/en-gb/category/tcg-cards');
    expect(isCategoryPage(shop.searchUrl)).toBe(true);
    expect(isCategoryPage('https://a.test/s?q={query}')).toBe(false);
  });

  it('rejects a search URL that is not a URL', () => {
    expect(() => normalizeShopInput({ url: 'example.com', searchUrl: 'not a url' })).toThrow();
  });

  it('rejects an empty URL', () => {
    expect(() => normalizeShopInput({ url: '  ' })).toThrow();
  });
});

describe('buildSearchUrl', () => {
  it('leaves a fixed category URL unchanged', () => {
    expect(buildSearchUrl('https://a.test/en-gb/category/tcg-cards', 'pokemon tcg')).toBe(
      'https://a.test/en-gb/category/tcg-cards',
    );
  });

  it('URL-encodes the query', () => {
    expect(buildSearchUrl('https://a.test/s?q={query}', 'pokemon tcg')).toBe('https://a.test/s?q=pokemon%20tcg');
  });
});
