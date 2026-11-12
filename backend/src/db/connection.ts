import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_GAMES } from '../shops/games';

export type DB = Database.Database;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      base_url       TEXT NOT NULL,
      search_url     TEXT NOT NULL,
      enabled        INTEGER NOT NULL DEFAULT 1,
      respect_robots INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      game           TEXT NOT NULL DEFAULT 'pokemon',
      UNIQUE (base_url, game)
    );

    CREATE TABLE IF NOT EXISTS games (
      slug     TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      keywords TEXT NOT NULL,
      query    TEXT NOT NULL,
      enabled  INTEGER NOT NULL DEFAULT 1,
      builtin  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id    INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      title      TEXT NOT NULL,
      price      REAL,
      currency   TEXT,
      in_stock   INTEGER,
      image_url  TEXT,
      first_seen TEXT NOT NULL,
      last_seen  TEXT NOT NULL,
      UNIQUE (shop_id, url)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      source      TEXT NOT NULL,
      summary     TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_changes (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      new_email  TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_history (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      day        TEXT NOT NULL,
      price      REAL NOT NULL,
      in_stock   INTEGER,
      PRIMARY KEY (product_id, day)
    );

    CREATE TABLE IF NOT EXISTS shop_suggestions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Databases created before the profile fields existed (e.g. the one kept between daily runs).
  const userColumns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name));
  for (const col of ['first_name', 'last_name', 'city', 'address', 'phone', 'terms_accepted_at', 'terms_version']) {
    if (!userColumns.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
  }
  // Games: the built-in ones are always present (a stored name/keywords change is kept).
  const addGame = db.prepare('INSERT OR IGNORE INTO games (slug, name, keywords, query, enabled, builtin) VALUES (?, ?, ?, ?, 1, 1)');
  for (const g of BUILTIN_GAMES) addGame.run(g.slug, g.name, g.keywords, g.query);

  // Shops used to be unique per web address; now unique per address AND game, so the same shop
  // can be listed once for every game it sells. SQLite cannot change a UNIQUE constraint, so the
  // table is rebuilt (foreign keys off meanwhile so that the products are not touched).
  const shopColumns = new Set((db.prepare('PRAGMA table_info(shops)').all() as { name: string }[]).map((c) => c.name));
  if (!shopColumns.has('game')) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE shops_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          name           TEXT NOT NULL,
          base_url       TEXT NOT NULL,
          search_url     TEXT NOT NULL,
          enabled        INTEGER NOT NULL DEFAULT 1,
          respect_robots INTEGER NOT NULL DEFAULT 1,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          game           TEXT NOT NULL DEFAULT 'pokemon',
          UNIQUE (base_url, game)
        );
        INSERT INTO shops_new (id, name, base_url, search_url, enabled, respect_robots, created_at)
          SELECT id, name, base_url, search_url, enabled, respect_robots, created_at FROM shops;
        DROP TABLE shops;
        ALTER TABLE shops_new RENAME TO shops;
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  // Accounts that existed before activation links were introduced count as activated.
  if (!userColumns.has('email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
    db.exec(`UPDATE users SET email_verified_at = created_at`);
  }
  return db;
}
