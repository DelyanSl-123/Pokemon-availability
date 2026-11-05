import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection';
import { createGame, createShop, deleteGame, getGame, listGames, listProducts, listShops, updateGame, upsertProduct } from '../../src/db/repository';

describe('games', () => {
  it('has the four built-in games and lets more be added, switched off and removed', () => {
    const db = openDb(':memory:');
    expect(listGames(db).map((g) => g.slug)).toEqual(['pokemon', 'onepiece', 'yugioh', 'mtg']);

    createGame(db, { slug: 'digimon', name: 'Digimon', keywords: 'digimon', query: 'digimon card game' });
    expect(listGames(db).map((g) => g.slug)).toEqual(['pokemon', 'onepiece', 'yugioh', 'mtg', 'digimon']);
    expect(updateGame(db, 'digimon', { enabled: false })?.enabled).toBe(false);

    createShop(db, { name: 'x', baseUrl: 'https://x.test', searchUrl: 'https://x.test/d', game: 'digimon' });
    expect(deleteGame(db, 'pokemon')).toBe(false); // built-in
    expect(deleteGame(db, 'digimon')).toBe(true);
    expect(getGame(db, 'digimon')).toBeUndefined();
    expect(listShops(db)).toHaveLength(0); // its shop pages go with it
  });

  it('allows the same shop address once per game, but not twice for the same game', () => {
    const db = openDb(':memory:');
    const shop = { name: 'k', baseUrl: 'https://k.test', searchUrl: 'https://k.test/p' };
    createShop(db, shop);
    createShop(db, { ...shop, game: 'onepiece' });
    expect(() => createShop(db, shop)).toThrow(/UNIQUE/);
    expect(listShops(db).map((s) => s.game)).toEqual(['pokemon', 'onepiece']);
  });

  it('filters products by game', () => {
    const db = openDb(':memory:');
    const a = createShop(db, { name: 'k', baseUrl: 'https://k.test', searchUrl: 'https://k.test/p' });
    const b = createShop(db, { name: 'k', baseUrl: 'https://k.test', searchUrl: 'https://k.test/o', game: 'onepiece' });
    const p = (url: string) => ({ title: url, url, price: 1, currency: 'EUR', inStock: true, imageUrl: null });
    upsertProduct(db, a.id, p('https://k.test/1'), '2026-11-05');
    upsertProduct(db, b.id, p('https://k.test/2'), '2026-11-05');
    expect(listProducts(db, { game: 'onepiece' }).map((x) => x.url)).toEqual(['https://k.test/2']);
    expect(listProducts(db, { game: 'onepiece' })[0].game).toBe('onepiece');
    expect(listProducts(db)).toHaveLength(2);
  });
});

describe('upgrading an existing database', () => {
  it('keeps shops and products when the shops table gets its game column', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbmig-'));
    const file = path.join(dir, 'old.db');
    try {
      // a database as the previous version created it: no games table, UNIQUE(base_url)
      const old = new Database(file);
      old.exec(`
        CREATE TABLE shops (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, base_url TEXT NOT NULL UNIQUE,
          search_url TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, respect_robots INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          url TEXT NOT NULL, title TEXT NOT NULL, price REAL, currency TEXT, in_stock INTEGER, image_url TEXT,
          first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, UNIQUE (shop_id, url));
        INSERT INTO shops (name, base_url, search_url) VALUES ('ozone.bg', 'https://www.ozone.bg', 'https://www.ozone.bg/pokemon/');
        INSERT INTO products (shop_id, url, title, price, currency, in_stock, first_seen, last_seen)
          VALUES (1, 'https://www.ozone.bg/p/1', 'Pokemon Booster', 9.9, 'EUR', 1, '2026-10-01', '2026-11-01');
      `);
      old.close();

      const db = openDb(file);
      expect(listShops(db)).toMatchObject([{ id: 1, name: 'ozone.bg', game: 'pokemon' }]);
      expect(listProducts(db)).toMatchObject([{ title: 'Pokemon Booster', game: 'pokemon', price: 9.9 }]);
      expect(listGames(db)).toHaveLength(4);
      // and the same address can now be added for another game
      createShop(db, { name: 'ozone.bg', baseUrl: 'https://www.ozone.bg', searchUrl: 'https://www.ozone.bg/yugioh/', game: 'yugioh' });
      expect(listShops(db)).toHaveLength(2);
      db.close();
      openDb(file).close(); // opening it again changes nothing
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
