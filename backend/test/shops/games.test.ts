import { describe, expect, it } from 'vitest';
import { BUILTIN_GAMES, keywordRegex, slugify } from '../../src/shops/games';
import { listsOnlyGame, normalizeShopInput } from '../../src/shops/shop-urls';

const re = (slug: string) => keywordRegex(BUILTIN_GAMES.find((g) => g.slug === slug)!.keywords);

describe('keywordRegex', () => {
  it('recognises the built-in games in Latin and Cyrillic spellings', () => {
    expect(re('pokemon').test('Pokémon TCG Booster')).toBe(true);
    expect(re('pokemon').test('Покемон карти')).toBe(true);
    expect(re('onepiece').test('One Piece Card Game OP-05')).toBe(true);
    expect(re('onepiece').test('/products/one-piece-op05')).toBe(true); // dashes count as spaces
    expect(re('onepiece').test('onepiece starter deck')).toBe(true);
    expect(re('yugioh').test('Yu-Gi-Oh! Structure Deck')).toBe(true);
    expect(re('yugioh').test('YuGiOh booster')).toBe(true);
    expect(re('mtg').test('Magic: The Gathering Commander Deck')).toBe(true);
    expect(re('mtg').test('MTG Bundle')).toBe(true);
  });

  it('does not match other games or look-alike words', () => {
    expect(re('mtg').test('Pokemon TCG Booster')).toBe(false);
    expect(re('mtg').test('Tangmtgfoo')).toBe(false); // "mtg" only as a word
    expect(re('yugioh').test('LEGO City')).toBe(false);
  });

  it('turns the keywords of an added game into a safe pattern (no regex injection)', () => {
    const r = keywordRegex('Dragon Ball, (Digimon)');
    expect(r.test('dragon ball super card game')).toBe(true);
    expect(r.test('Digimon (card)')).toBe(false); // the parentheses are literal, "(Digimon)" is not in the title
    expect(r.test('(Digimon) booster')).toBe(true);
    expect(keywordRegex('').test('anything')).toBe(false);
    expect(() => keywordRegex('a(b, [c, *d')).not.toThrow();
  });
});

describe('slugify', () => {
  it('makes a short URL-safe id', () => {
    expect(slugify('Dragon Ball Super!')).toBe('dragon-ball-super');
    expect(slugify('  Weiß Schwarz  ')).toBe('wei-schwarz');
    expect(slugify('!!!')).toBe('');
  });
});

describe('listsOnlyGame', () => {
  it('treats a category page that names the game as listing only that game', () => {
    const op = re('onepiece');
    expect(listsOnlyGame('https://shop.test/collections/one-piece', op)).toBe(true);
    expect(listsOnlyGame('https://shop.test/trading-cards/yu-gi-oh/', re('yugioh'))).toBe(true);
    expect(listsOnlyGame('https://shop.test/trading-cards/', op)).toBe(false);
    expect(listsOnlyGame('https://shop.test/search?q={query}', op)).toBe(false);
    // the generic word "tcg" only counts for Pokémon pages
    expect(listsOnlyGame('https://shop.test/tcg-cards', op)).toBe(false);
    expect(listsOnlyGame('https://shop.test/tcg-cards', op, true)).toBe(true);
  });
});

describe('normalizeShopInput with a game', () => {
  it('does not use the Pokémon preset pages for other games', () => {
    expect(normalizeShopInput({ url: 'www.ozone.bg' }).searchUrl).toContain('/pokemon/');
    const other = normalizeShopInput({ url: 'www.ozone.bg', game: 'yugioh' });
    expect(other.searchUrl).toBe('https://www.ozone.bg/search?q={query}');
    expect(other.game).toBe('yugioh');
  });
});
