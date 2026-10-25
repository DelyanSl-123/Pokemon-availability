import fs from 'node:fs';
import type { DB } from '../db/connection';
import { createShop, deleteShop, listShops, updateShop } from '../db/repository';
import { normalizeShopInput } from './shop-urls';

export interface ShopEntry {
  url: string;
  name?: string;
  searchUrl?: string;
  enabled?: boolean;
}

/** Makes the database match the shops file (adds, updates and removes shops). */
export function syncShops(db: DB, file: string): void {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8')) as ShopEntry[];

  const wanted = new Map<string, { shop: ReturnType<typeof normalizeShopInput>; enabled: boolean }>();
  for (const entry of entries) {
    const shop = normalizeShopInput(entry);
    wanted.set(shop.baseUrl, { shop, enabled: entry.enabled !== false });
  }

  const existing = listShops(db);
  for (const s of existing) {
    if (!wanted.has(s.baseUrl)) deleteShop(db, s.id);
  }
  for (const [baseUrl, { shop, enabled }] of wanted) {
    const current = existing.find((s) => s.baseUrl === baseUrl);
    if (current) {
      updateShop(db, current.id, { name: shop.name, searchUrl: shop.searchUrl, enabled });
    } else {
      const created = createShop(db, shop);
      if (!enabled) updateShop(db, created.id, { enabled: false });
    }
  }
}
