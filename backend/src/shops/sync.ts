import fs from 'node:fs';
import type { DB } from '../db/connection';
import { createShop, deleteShop, listShops, updateShop } from '../db/repository';
import { normalizeShopInput } from './shop-urls';

export interface ShopEntry {
  url: string;
  name?: string;
  searchUrl?: string;
  enabled?: boolean;
  /** Game slug (see shops/games.ts); Pokémon when left out. */
  game?: string;
  /** Never fetched (e.g. the shop blocks the tracker); the report links to it to check by hand. */
  manual?: boolean;
  /** Why the shop has to be checked by hand, shown in the report. */
  note?: string;
}

/** A shop the report lists with a link only, because it cannot be checked automatically. */
export interface ManualShop {
  name: string;
  url: string;
  note: string;
  game: string;
}

function readEntries(file: string): ShopEntry[] {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ShopEntry[];
}

/** Makes the database match the shops file (adds, updates and removes shops). Manual shops are left out. */
export function syncShops(db: DB, file: string): void {
  const entries = readEntries(file).filter((e) => !e.manual);

  const wanted = new Map<string, { shop: ReturnType<typeof normalizeShopInput>; enabled: boolean }>();
  for (const entry of entries) {
    const shop = normalizeShopInput(entry);
    wanted.set(`${shop.baseUrl}|${shop.game}`, { shop, enabled: entry.enabled !== false });
  }

  const existing = listShops(db);
  for (const s of existing) {
    if (!wanted.has(`${s.baseUrl}|${s.game}`)) deleteShop(db, s.id);
  }
  for (const { shop, enabled } of wanted.values()) {
    const current = existing.find((s) => s.baseUrl === shop.baseUrl && s.game === shop.game);
    if (current) {
      updateShop(db, current.id, { name: shop.name, searchUrl: shop.searchUrl, enabled });
    } else {
      const created = createShop(db, shop);
      if (!enabled) updateShop(db, created.id, { enabled: false });
    }
  }
}

/** The shops file's manual entries (enabled ones only), linking to their listing page when given. */
export function readManualShops(file: string): ManualShop[] {
  if (!fs.existsSync(file)) return [];
  return readEntries(file)
    .filter((e) => e.manual && e.enabled !== false)
    .map((e) => {
      const shop = normalizeShopInput({ url: e.url, name: e.name, game: e.game });
      const page = e.searchUrl && !e.searchUrl.includes('{query}') ? e.searchUrl : shop.baseUrl;
      return { name: shop.name, url: page, note: e.note?.trim() ?? '', game: shop.game };
    });
}
