import type { DB } from './connection';
import type { ExtractedProduct, RunSummary, Settings, Shop } from '../types';
import { DEFAULT_GAME, type Game } from '../shops/games';

/* ---------------- shops ---------------- */

interface ShopRow {
  id: number;
  name: string;
  base_url: string;
  search_url: string;
  enabled: number;
  respect_robots: number;
  game: string;
}

const toShop = (r: ShopRow): Shop => ({
  id: r.id,
  name: r.name,
  baseUrl: r.base_url,
  searchUrl: r.search_url,
  enabled: r.enabled === 1,
  respectRobots: r.respect_robots === 1,
  game: r.game,
});

export function listShops(db: DB): Shop[] {
  return (db.prepare('SELECT * FROM shops ORDER BY id').all() as ShopRow[]).map(toShop);
}

export function getShop(db: DB, id: number): Shop | undefined {
  const row = db.prepare('SELECT * FROM shops WHERE id = ?').get(id) as ShopRow | undefined;
  return row ? toShop(row) : undefined;
}

export function createShop(
  db: DB,
  input: { name: string; baseUrl: string; searchUrl: string; respectRobots?: boolean; game?: string },
): Shop {
  const info = db
    .prepare('INSERT INTO shops (name, base_url, search_url, respect_robots, game) VALUES (?, ?, ?, ?, ?)')
    .run(input.name, input.baseUrl, input.searchUrl, input.respectRobots === false ? 0 : 1, input.game ?? DEFAULT_GAME);
  return getShop(db, Number(info.lastInsertRowid))!;
}

export function updateShop(
  db: DB,
  id: number,
  patch: Partial<Pick<Shop, 'name' | 'searchUrl' | 'enabled' | 'respectRobots'>>,
): Shop | undefined {
  const current = getShop(db, id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  db.prepare('UPDATE shops SET name = ?, search_url = ?, enabled = ?, respect_robots = ? WHERE id = ?').run(
    next.name,
    next.searchUrl,
    next.enabled ? 1 : 0,
    next.respectRobots ? 1 : 0,
    id,
  );
  return getShop(db, id);
}

export function deleteShop(db: DB, id: number): boolean {
  return db.prepare('DELETE FROM shops WHERE id = ?').run(id).changes > 0;
}

/* ---------------- games ---------------- */

interface GameRow {
  slug: string;
  name: string;
  keywords: string;
  query: string;
  enabled: number;
  builtin: number;
}

const toGame = (r: GameRow): Game => ({
  slug: r.slug,
  name: r.name,
  keywords: r.keywords,
  query: r.query,
  enabled: r.enabled === 1,
  builtin: r.builtin === 1,
});

/** Built-in games first (in their fixed order), then the added ones by name. */
export function listGames(db: DB): Game[] {
  return (db.prepare('SELECT * FROM games ORDER BY builtin DESC, rowid').all() as GameRow[]).map(toGame);
}

export function getGame(db: DB, slug: string): Game | undefined {
  const row = db.prepare('SELECT * FROM games WHERE slug = ?').get(slug) as GameRow | undefined;
  return row ? toGame(row) : undefined;
}

export function createGame(db: DB, g: { slug: string; name: string; keywords: string; query: string }): Game {
  db.prepare('INSERT INTO games (slug, name, keywords, query, enabled, builtin) VALUES (?, ?, ?, ?, 1, 0)').run(
    g.slug,
    g.name,
    g.keywords,
    g.query,
  );
  return getGame(db, g.slug)!;
}

export function updateGame(
  db: DB,
  slug: string,
  patch: Partial<Pick<Game, 'name' | 'keywords' | 'query' | 'enabled'>>,
): Game | undefined {
  const cur = getGame(db, slug);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE games SET name = ?, keywords = ?, query = ?, enabled = ? WHERE slug = ?').run(
    next.name,
    next.keywords,
    next.query,
    next.enabled ? 1 : 0,
    slug,
  );
  return getGame(db, slug);
}

/** Deletes an added game together with its shop pages and products. Built-in games cannot be deleted. */
export function deleteGame(db: DB, slug: string): boolean {
  return db.transaction(() => {
    const g = getGame(db, slug);
    if (!g || g.builtin) return false;
    db.prepare('DELETE FROM shops WHERE game = ?').run(slug); // products cascade
    db.prepare('DELETE FROM games WHERE slug = ?').run(slug);
    return true;
  })();
}

/* ---------------- settings ---------------- */

export function getSettings(db: DB, defaults: Settings): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    cron: stored.cron ?? defaults.cron,
    query: stored.query ?? defaults.query,
  };
}

export function saveSettings(db: DB, patch: Partial<Settings>): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) stmt.run(key, value);
  }
}

/* ---------------- products ---------------- */

interface ProductRow {
  id: number;
  shop_id: number;
  shop_name: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  in_stock: number | null;
  image_url: string | null;
  first_seen: string;
  last_seen: string;
  game: string;
}

export interface StoredProduct {
  id: number;
  shopId: number;
  shopName: string;
  game: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
  imageUrl: string | null;
  firstSeen: string;
  lastSeen: string;
}

const boolToDb = (v: boolean | null): number | null => (v === null ? null : v ? 1 : 0);

export function upsertProduct(
  db: DB,
  shopId: number,
  p: ExtractedProduct,
  nowIso: string,
): { isNew: boolean; backInStock: boolean } {
  const existing = db.prepare('SELECT id, in_stock FROM products WHERE shop_id = ? AND url = ?').get(shopId, p.url) as
    | { id: number; in_stock: number | null }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO products (shop_id, url, title, price, currency, in_stock, image_url, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(shopId, p.url, p.title, p.price, p.currency, boolToDb(p.inStock), p.imageUrl, nowIso, nowIso);
    const created = db.prepare('SELECT id FROM products WHERE shop_id = ? AND url = ?').get(shopId, p.url) as { id: number };
    recordPrice(db, created.id, p, nowIso);
    return { isNew: true, backInStock: false };
  }

  db.prepare(
    `UPDATE products SET title = ?, price = ?, currency = ?, in_stock = ?, image_url = COALESCE(?, image_url), last_seen = ?
     WHERE id = ?`,
  ).run(p.title, p.price, p.currency, boolToDb(p.inStock), p.imageUrl, nowIso, existing.id);
  recordPrice(db, existing.id, p, nowIso);

  return { isNew: false, backInStock: existing.in_stock === 0 && p.inStock === true };
}

/** One price per product and day (the last check of the day wins); products without a price are skipped. */
function recordPrice(db: DB, productId: number, p: ExtractedProduct, nowIso: string): void {
  if (p.price === null || p.price === undefined) return;
  db.prepare(
    `INSERT INTO price_history (product_id, day, price, in_stock) VALUES (?, ?, ?, ?)
     ON CONFLICT (product_id, day) DO UPDATE SET price = excluded.price, in_stock = excluded.in_stock`,
  ).run(productId, nowIso.slice(0, 10), p.price, boolToDb(p.inStock));
}

export interface PricePoint {
  day: string;
  price: number;
  inStock: boolean | null;
}

/** The recorded prices of the product with this link, oldest first (at most the last `limit` days). */
export function priceHistory(db: DB, url: string, limit = 365): { currency: string | null; points: PricePoint[] } {
  const product = db.prepare('SELECT id, currency FROM products WHERE url = ? ORDER BY last_seen DESC LIMIT 1').get(url) as
    | { id: number; currency: string | null }
    | undefined;
  if (!product) return { currency: null, points: [] };
  const rows = db
    .prepare('SELECT day, price, in_stock FROM price_history WHERE product_id = ? ORDER BY day DESC LIMIT ?')
    .all(product.id, limit) as { day: string; price: number; in_stock: number | null }[];
  return {
    currency: product.currency,
    points: rows.reverse().map((r) => ({ day: r.day, price: r.price, inStock: r.in_stock === null ? null : r.in_stock === 1 })),
  };
}

export function listProducts(db: DB, filter: { shopId?: number; game?: string; inStockOnly?: boolean } = {}): StoredProduct[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.shopId !== undefined) {
    where.push('p.shop_id = ?');
    params.push(filter.shopId);
  }
  if (filter.game !== undefined) {
    where.push('s.game = ?');
    params.push(filter.game);
  }
  if (filter.inStockOnly) where.push('p.in_stock = 1');

  const rows = db
    .prepare(
      `SELECT p.*, s.name AS shop_name, s.game AS game FROM products p JOIN shops s ON s.id = p.shop_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY p.last_seen DESC, p.id DESC`,
    )
    .all(...params) as ProductRow[];

  return rows.map((r) => ({
    id: r.id,
    shopId: r.shop_id,
    shopName: r.shop_name,
    game: r.game,
    url: r.url,
    title: r.title,
    price: r.price,
    currency: r.currency,
    inStock: r.in_stock === null ? null : r.in_stock === 1,
    imageUrl: r.image_url,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
}

/* ---------------- runs ---------------- */

export function insertRun(db: DB, startedAt: string, source: string): number {
  return Number(db.prepare('INSERT INTO runs (started_at, source) VALUES (?, ?)').run(startedAt, source).lastInsertRowid);
}

export function finishRun(db: DB, id: number, finishedAt: string, summary: RunSummary): void {
  db.prepare('UPDATE runs SET finished_at = ?, summary = ? WHERE id = ?').run(finishedAt, JSON.stringify(summary), id);
}

export function listRuns(db: DB, limit = 20): RunSummary[] {
  const rows = db
    .prepare('SELECT summary FROM runs WHERE summary IS NOT NULL ORDER BY id DESC LIMIT ?')
    .all(limit) as { summary: string }[];
  return rows.map((r) => JSON.parse(r.summary) as RunSummary);
}

/* ---- shops suggested by visitors (the "Suggest a shop" form on the home page) ---- */

export interface ShopSuggestion {
  id: number;
  url: string;
  note: string;
  createdAt: string;
}

export function addShopSuggestion(db: DB, url: string, note: string): ShopSuggestion {
  const info = db.prepare('INSERT INTO shop_suggestions (url, note) VALUES (?, ?)').run(url, note);
  return listShopSuggestions(db).find((s) => s.id === Number(info.lastInsertRowid))!;
}

export function listShopSuggestions(db: DB, limit = 200): ShopSuggestion[] {
  const rows = db
    .prepare('SELECT id, url, note, created_at FROM shop_suggestions ORDER BY id DESC LIMIT ?')
    .all(limit) as { id: number; url: string; note: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, url: r.url, note: r.note, createdAt: r.created_at }));
}

export function deleteShopSuggestion(db: DB, id: number): boolean {
  return db.prepare('DELETE FROM shop_suggestions WHERE id = ?').run(id).changes > 0;
}
