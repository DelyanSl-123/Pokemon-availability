import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection';
import { createShop, listShops } from '../../src/db/repository';
import { normalizeShopInput } from '../../src/shops/shop-urls';
import { readManualShops, syncShops } from '../../src/shops/sync';

const dirs: string[] = [];
function shopsFile(entries: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shops-'));
  dirs.push(dir);
  const file = path.join(dir, 'shops.json');
  fs.writeFileSync(file, JSON.stringify(entries));
  return file;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const entries = [
  { url: 'https://itcg.bg', name: 'itcg.bg', searchUrl: 'https://itcg.bg/collections/pokemon-tcg' },
  {
    url: 'https://toyzzshop.bg',
    name: 'toyzzshop.bg',
    searchUrl: 'https://toyzzshop.bg/nastolni-igri',
    manual: true,
    note: 'The shop blocks automatic checks (HTTP 403)',
  },
  { url: 'https://other.test', searchUrl: 'https://other.test/search?q={query}', manual: true },
  { url: 'https://off.test', manual: true, enabled: false },
];

describe('syncShops', () => {
  it('never adds manual shops to the checked shops, and removes one that was checked before', () => {
    const db = openDb(':memory:');
    createShop(db, normalizeShopInput({ url: 'https://toyzzshop.bg' }));
    syncShops(db, shopsFile(entries));
    expect(listShops(db).map((s) => s.name)).toEqual(['itcg.bg']);
  });
});

describe('readManualShops', () => {
  it('lists enabled manual shops with their listing page (or home page for search templates)', () => {
    expect(readManualShops(shopsFile(entries))).toEqual([
      { name: 'toyzzshop.bg', url: 'https://toyzzshop.bg/nastolni-igri', note: 'The shop blocks automatic checks (HTTP 403)' },
      { name: 'other.test', url: 'https://other.test', note: '' },
    ]);
  });

  it('returns nothing when there is no shops file', () => {
    expect(readManualShops(path.join(os.tmpdir(), 'does-not-exist', 'shops.json'))).toEqual([]);
  });
});
