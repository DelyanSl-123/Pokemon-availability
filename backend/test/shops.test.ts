import { describe, expect, it } from 'vitest';
import { buildSearchUrl, normalizeShopInput } from '../src/shops';

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

  it('rejects a search URL without {query}', () => {
    expect(() => normalizeShopInput({ url: 'example.com', searchUrl: 'https://example.com/search' })).toThrow();
  });

  it('rejects an empty URL', () => {
    expect(() => normalizeShopInput({ url: '  ' })).toThrow();
  });
});

describe('buildSearchUrl', () => {
  it('URL-encodes the query', () => {
    expect(buildSearchUrl('https://a.test/s?q={query}', 'pokemon tcg')).toBe('https://a.test/s?q=pokemon%20tcg');
  });
});
