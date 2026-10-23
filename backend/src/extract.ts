import * as cheerio from 'cheerio';
import type { ExtractedProduct } from './types';

/** Matches Latin and Cyrillic spellings (Pokémon / Pokemon / Покемон). */
export const POKEMON_RE = /pok[eé]mon|покемон/i;
/** Words that mark a trading-card product (English + Bulgarian). */
export const TCG_RE =
  /\btcg\b|trading card|booster|бустер|карти|картов|\bcards?\b|elite trainer|\betb\b|blister|\btin\b|collection|колекци|\bdeck\b|тесте|bundle/i;

const OUT_OF_STOCK_RE = /изчерпан|няма наличност|не е наличен|не е в наличност|out of stock|sold out|unavailable/i;
const IN_STOCK_RE = /в наличност|добави в количката|купи|add to cart|in stock/i;

const PRICE_AFTER_RE = /(\d{1,3}(?:[  .]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(лв\.?|BGN|€|EUR)/i;
const PRICE_BEFORE_RE = /(€|EUR|BGN)\s*(\d{1,3}(?:[  .]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;

type CheerioAPI = ReturnType<typeof cheerio.load>;

export function isPokemonTcg(p: Pick<ExtractedProduct, 'title' | 'url'>): boolean {
  let url = p.url;
  try {
    url = decodeURIComponent(p.url);
  } catch {
    /* keep raw url */
  }
  const haystack = `${p.title} ${url}`;
  return POKEMON_RE.test(haystack) && TCG_RE.test(haystack);
}

/** Parses "1 299,90", "1.299,90", "49.99", "49,99" into a number. */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s ]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeCurrency(raw: string): string {
  const c = raw.toLowerCase();
  if (c.startsWith('лв') || c === 'bgn') return 'BGN';
  if (c === '€' || c === 'eur') return 'EUR';
  return raw.toUpperCase();
}

export function findPrice(text: string): { price: number; currency: string } | null {
  const after = PRICE_AFTER_RE.exec(text);
  if (after) {
    const price = parseNumber(after[1]);
    if (price !== null) return { price, currency: normalizeCurrency(after[2]) };
  }
  const before = PRICE_BEFORE_RE.exec(text);
  if (before) {
    const price = parseNumber(before[2]);
    if (price !== null) return { price, currency: normalizeCurrency(before[1]) };
  }
  return null;
}

function detectStock(text: string): boolean | null {
  if (OUT_OF_STOCK_RE.test(text)) return false;
  if (IN_STOCK_RE.test(text)) return true;
  return null;
}

const clean = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

function resolveUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || /^(javascript|mailto|tel):/i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/* ---------- Strategy 1: schema.org JSON-LD ---------- */

function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
  } else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node as Record<string, unknown>).forEach((v) => walk(v, visit));
  }
}

function typeIncludes(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

function fromJsonLd($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse($(el).html() ?? '');
    } catch {
      return;
    }
    walk(data, (node) => {
      if (!typeIncludes(node, 'Product')) return;
      const offersRaw = node.offers;
      const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, unknown> | undefined;
      const url = resolveUrl(String(node.url ?? offer?.url ?? ''), baseUrl);
      const title = clean(String(node.name ?? ''));
      if (!url || !title) return;

      const priceRaw = offer?.price ?? offer?.lowPrice;
      const price = priceRaw !== undefined ? parseNumber(String(priceRaw)) : null;
      const availability = String(offer?.availability ?? '');
      let inStock: boolean | null = null;
      if (/InStock|LimitedAvailability|PreOrder/i.test(availability)) inStock = true;
      else if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) inStock = false;

      const image = Array.isArray(node.image) ? node.image[0] : node.image;
      out.push({
        title,
        url,
        price,
        currency: offer?.priceCurrency ? String(offer.priceCurrency).toUpperCase() : null,
        inStock,
        imageUrl: typeof image === 'string' ? resolveUrl(image, baseUrl) : null,
      });
    });
  });
  return out;
}

/* ---------- Strategy 2: product cards in the DOM ---------- */

const CARD_SELECTORS = [
  '[itemtype*="schema.org/Product" i]',
  '.product-item',
  '.product-card',
  '.product-box',
  '.product',
  'li.item',
  'article',
];
const TITLE_SELECTORS = ['[itemprop="name"]', '.product-name', '.product-title', '.product-item-link', 'h2', 'h3', 'h4'];

function fromCards($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  for (const selector of CARD_SELECTORS) {
    $(selector).each((_, el) => {
      const card = $(el);

      const hrefs = new Set<string>();
      card.find('a[href]').each((__, a) => {
        const url = resolveUrl($(a).attr('href'), baseUrl);
        if (url) hrefs.add(url);
      });
      // A wrapper around a whole product list has many links; a single card has few.
      if (hrefs.size === 0 || hrefs.size > 3) return;
      const url = [...hrefs][0];

      let title = '';
      for (const s of TITLE_SELECTORS) {
        title = clean(card.find(s).first().text());
        if (title) break;
      }
      if (!title) title = clean(card.find('a[title]').first().attr('title'));
      if (!title) title = clean(card.find('a[href]').first().text());
      if (!title) return;

      const text = clean(card.text());
      const price = findPrice(text);
      const img = card.find('img').first();
      const imgSrc = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');

      out.push({
        title,
        url,
        price: price?.price ?? null,
        currency: price?.currency ?? null,
        inStock: detectStock(text),
        imageUrl: resolveUrl(imgSrc, baseUrl),
      });
    });
  }
  return out;
}

/* ---------- Strategy 3: any link that mentions Pokémon ---------- */

function fromAnchors($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  $('a[href]').each((_, a) => {
    const el = $(a);
    const title = clean(el.attr('title')) || clean(el.text());
    const url = resolveUrl(el.attr('href'), baseUrl);
    if (!url || title.length < 8 || !POKEMON_RE.test(title)) return;
    out.push({ title, url, price: null, currency: null, inStock: null, imageUrl: null });
  });
  return out;
}

/** Extracts Pokémon TCG products from a shop search-results page. */
export function extractProducts(
  html: string,
  baseUrl: string,
  opts: { filterPokemon?: boolean } = {},
): ExtractedProduct[] {
  const $ = cheerio.load(html);

  const merged = new Map<string, ExtractedProduct>();
  const add = (p: ExtractedProduct) => {
    const existing = merged.get(p.url);
    if (!existing) {
      merged.set(p.url, { ...p });
      return;
    }
    existing.price ??= p.price;
    existing.currency ??= p.currency;
    existing.inStock ??= p.inStock;
    existing.imageUrl ??= p.imageUrl;
  };

  fromJsonLd($, baseUrl).forEach(add);
  fromCards($, baseUrl).forEach(add);
  if (merged.size === 0 && opts.filterPokemon !== false) fromAnchors($, baseUrl).forEach(add);

  const all = [...merged.values()];
  // On a Pokémon TCG category page every product counts, so no keyword filter is applied.
  return opts.filterPokemon === false ? all : all.filter(isPokemonTcg);
}
