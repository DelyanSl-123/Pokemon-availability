import { describe, expect, it } from 'vitest';
import { extractAll, extractProducts, findPrice, isPokemonTcg, parseNumber } from '../../src/scraping/extract';
import {
  ANCHORS_ONLY_HTML,
  CARDS_HTML,
  DIV_SOUP_HTML,
  JSON_LD_HTML,
  JSON_LD_SAME_URL_HTML,
  MANY_LINKS_HTML,
  MULTI_LINK_PRICE_BLOCKS_HTML,
  OLD_PRICE_HTML,
  OTHER_CARDS_HTML,
  SCRIPT_IN_TITLE_HTML,
  SHOPIFY_LIKE_HTML,
} from '../fixtures/html';

describe('parseNumber', () => {
  it.each([
    ['1 299,90', 1299.9],
    ['1.299,90', 1299.9],
    ['1,299.50', 1299.5],
    ['49.99', 49.99],
    ['49,99', 49.99],
    ['1.299', 1299],
  ])('parses %s', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });
});

describe('findPrice', () => {
  it('finds a price followed by a currency', () => {
    expect(findPrice('Цена: 12,99 лв.')).toEqual({ price: 12.99, currency: 'BGN' });
  });
  it('finds a price preceded by a currency', () => {
    expect(findPrice('€ 24.50')).toEqual({ price: 24.5, currency: 'EUR' });
  });
  it('is not fooled by digits in the title', () => {
    expect(findPrice('Booster 36 49,99 лв')).toEqual({ price: 49.99, currency: 'BGN' });
  });
  it('returns null when there is no price', () => {
    expect(findPrice('no price here')).toBeNull();
  });
});

describe('isPokemonTcg', () => {
  it('accepts Pokémon trading-card products', () => {
    expect(isPokemonTcg({ title: 'Pokemon TCG Booster', url: 'https://x.test/y' })).toBe(true);
    expect(isPokemonTcg({ title: 'Покемон карти бустер', url: 'https://x.test/y' })).toBe(true);
  });
  it('rejects other Pokémon merchandise and other brands', () => {
    expect(isPokemonTcg({ title: 'Pokemon plush Pikachu', url: 'https://x.test/pikachu-plush' })).toBe(false);
    expect(isPokemonTcg({ title: 'Magic: The Gathering Booster', url: 'https://x.test/mtg' })).toBe(false);
  });
});

describe('extractProducts', () => {
  const base = 'https://shop.test/search?q=pokemon';

  it('reads product cards and filters out non-Pokémon items', () => {
    const products = extractProducts(CARDS_HTML, base);
    expect(products).toHaveLength(2);

    const [booster, etb] = products;
    expect(booster.title).toBe('Pokémon TCG Scarlet & Violet Booster Pack');
    expect(booster.url).toBe('https://shop.test/pokemon-tcg-scarlet-violet-booster');
    expect(booster.price).toBe(12.99);
    expect(booster.currency).toBe('BGN');
    expect(booster.inStock).toBe(true);
    expect(booster.imageUrl).toBe('https://shop.test/img/a.jpg');

    expect(etb.title).toBe('Pokemon TCG Elite Trainer Box');
    expect(etb.price).toBe(89.9);
    expect(etb.inStock).toBe(false);
  });

  it('reads schema.org JSON-LD products', () => {
    const products = extractProducts(JSON_LD_HTML, base);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ price: 159.9, currency: 'BGN', inStock: true });
    expect(products[1]).toMatchObject({
      url: 'https://shop.test/p/tin',
      price: 29.5,
      currency: 'EUR',
      inStock: false,
    });
  });

  it('falls back to plain links that mention Pokémon', () => {
    const products = extractProducts(ANCHORS_ONLY_HTML, base);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      url: 'https://shop.test/p/1',
      price: null,
      inStock: null,
    });
  });

  it('keeps every product on a category page when the keyword filter is off', () => {
    const products = extractProducts(CARDS_HTML, base, { filterPokemon: false });
    expect(products.map((p) => p.title)).toEqual([
      'Pokémon TCG Scarlet & Violet Booster Pack',
      'LEGO City Fire Station',
      'Pokemon TCG Elite Trainer Box',
    ]);
  });

  it('reads cards that contain many links (photo, name, brand, wishlist, compare)', () => {
    const products = extractProducts(MANY_LINKS_HTML, base, { filterPokemon: false });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      title: 'Pokémon TCG Booster Display',
      url: 'https://shop.test/p/pokemon-booster-display',
      price: 45.5,
      currency: 'BGN',
      inStock: true,
    });
    expect(products[1]).toMatchObject({ url: 'https://shop.test/p/pokemon-tin', price: 29.9, inStock: false });
  });

  it('finds products on pages without any known class names by starting from the prices', () => {
    const products = extractProducts(DIV_SOUP_HTML, base, { filterPokemon: false });
    expect(products.map((p) => p.url)).toEqual(['https://shop.test/x/etb-prismatic', 'https://shop.test/x/booster-bundle']);
    expect(products[0].title).toBe('Elite Trainer Box Prismatic Evolutions');
    expect(products[1].price).toBe(39.9);
  });

  it('ignores the mini-cart total in the page header', () => {
    const products = extractProducts(DIV_SOUP_HTML, base, { filterPokemon: false });
    expect(products.every((p) => !/количка/i.test(p.title))).toBe(true);
  });

  it('removes tracking parameters so products keep the same link on every visit', () => {
    const products = extractProducts(SHOPIFY_LIKE_HTML, base, { filterPokemon: false });
    expect(products.map((p) => p.url)).toEqual([
      'https://shop.test/products/pokemon-etb',
      'https://shop.test/products/pokemon-tin',
    ]);
  });

  it('uses the sale price and ignores prices in a cart drawer', () => {
    const products = extractProducts(SHOPIFY_LIKE_HTML, base, { filterPokemon: false });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ title: 'Pokémon Elite Trainer Box', price: 49.9, currency: 'EUR' });
  });

  it('marks products with a sold-out badge as out of stock', () => {
    const products = extractProducts(SHOPIFY_LIKE_HTML, base, { filterPokemon: false });
    expect(products[1]).toMatchObject({ title: 'Pokémon Collector Tin', inStock: false, price: 29.9 });
  });

  it('reports the selling price, not the crossed-out list price', () => {
    const [product] = extractProducts(OLD_PRICE_HTML, base, { filterPokemon: false });
    expect(product).toMatchObject({ title: 'Pokémon Booster Pack', price: 29.9, currency: 'EUR', inStock: true });
  });

  it('tells how many products were parsed before the Pokémon filter', () => {
    const { scanned, matched } = extractAll(OTHER_CARDS_HTML, base);
    expect(scanned).toHaveLength(1);
    expect(matched).toHaveLength(0);
  });

  it('ignores JSON-LD products that only point at the listing page and reads the markup instead', () => {
    const products = extractProducts(JSON_LD_SAME_URL_HTML, base);
    expect(products.map((p) => p.url)).toEqual([
      'https://shop.test/x/booster-a',
      'https://shop.test/x/booster-b',
      'https://shop.test/x/booster-c',
    ]);
  });

  it('never puts inline script text into a product title', () => {
    const [product] = extractProducts(SCRIPT_IN_TITLE_HTML, base, { filterPokemon: false });
    expect(product.title).toBe('Pokémon Booster Pack');
    expect(product.url).toBe('https://shop.test/p/pokemon-booster');
  });

  it('finds cards that have several links and separate sale / regular price blocks', () => {
    const products = extractProducts(MULTI_LINK_PRICE_BLOCKS_HTML, base, { filterPokemon: false });
    expect(products.map((p) => p.url)).toEqual([
      'https://shop.test/products/pokemon-bundle',
      'https://shop.test/products/pokemon-tin',
    ]);
    expect(products.map((p) => p.title)).toEqual(['Pokémon Booster Bundle', 'Pokémon Collector Tin']);
  });

  it('returns an empty list for a page without products', () => {
    expect(extractProducts('<html><body><p>No results</p></body></html>', base)).toEqual([]);
  });
});
