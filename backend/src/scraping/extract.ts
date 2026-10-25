import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { ExtractedProduct } from '../types';

/** Matches Latin and Cyrillic spellings (Pokémon / Pokemon / Покемон). */
export const POKEMON_RE = /pok[eé]mon|покемон/i;
/** Words that mark a trading-card product (English + Bulgarian). */
export const TCG_RE =
  /\btcg\b|trading card|booster|бустер|карти|картов|\bcards?\b|elite trainer|\betb\b|blister|\btin\b|collection|колекци|\bdeck\b|тесте|bundle/i;

const OUT_OF_STOCK_RE = /изчерпан|няма наличност|не е наличен|не е в наличност|out of stock|sold out|unavailable/i;
const IN_STOCK_RE = /в наличност|добави в количката|купи|add to cart|in stock/i;

const PRICE_AFTER_RE = /(\d{1,3}(?:[  .]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(лв\.?|BGN|€|EUR)/i;
const PRICE_BEFORE_RE = /(€|EUR|BGN)\s*(\d{1,3}(?:[  .]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;

export type CheerioAPI = ReturnType<typeof cheerio.load>;

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

const TRACKING_PARAM_RE = /^(_pos|_sid|_ss|_psq|_fid|_ga|utm_.+|fbclid|gclid|srsltid|ref|ref_src)$/i;

function resolveUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || /^(javascript|mailto|tel):/i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    // Tracking parameters change on every visit and would make known products look new.
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM_RE.test(key)) u.searchParams.delete(key);
    }
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

export function fromJsonLd($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
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

/* ---------- Shared helpers for the DOM strategies ---------- */

/** Links that are never the product page itself. */
const BAD_HREF_RE = /^(javascript|mailto|tel):|\/(cart|checkout|wishlist|compare|login|account|customer|contact)(\/|\?|$)/i;
/** Link texts that are buttons, not product names. */
const BAD_LINK_TEXT_RE = /^(добави|купи|buy|add to|в количк|сравни|compare|wishlist|любим|виж|view|details|quick|подробн)/i;
/** Page chrome whose prices (e.g. the mini-cart total) are not products. */
const CHROME_SELECTOR = [
  'header',
  'nav',
  'footer',
  '[role="dialog"]',
  '[class*="mini-cart" i]',
  '[class*="minicart" i]',
  '[id*="minicart" i]',
  '[class*="drawer" i]',
  '[id*="drawer" i]',
  '[class*="facets" i]',
  '[class*="filter" i]',
].join(', ');

/** Crossed-out / list prices that must not be reported as the selling price. */
const OLD_PRICE_SELECTOR = 's, del, strike, [class*="old-price" i], [class*="oldprice" i], [class*="compare-at" i], [class*="was-price" i]';
/** Markers in class names that say a product cannot be bought. */
const OUT_OF_STOCK_CLASS_SELECTOR =
  '[class*="sold-out" i], [class*="soldout" i], [class*="out-of-stock" i], [class*="outofstock" i], [class*="unavailable" i]';

const TITLE_SELECTORS = ['[itemprop="name"]', '.product-name', '.product-title', '.product-item-link', 'h2', 'h3', 'h4'];

/** Turns one product container into a product, or null when it does not look like one. */
function describeCard($: CheerioAPI, card: Cheerio<AnyNode>, baseUrl: string): ExtractedProduct | null {
  const candidates: { url: string; text: string }[] = [];
  card.find('a[href]').each((_, a) => {
    const el = $(a);
    const href = el.attr('href') ?? '';
    const url = resolveUrl(href, baseUrl);
    if (!url || BAD_HREF_RE.test(href)) return;
    const text = clean(el.attr('title')) || clean(el.text()) || clean(el.find('img').first().attr('alt'));
    if (text.length < 4 || BAD_LINK_TEXT_RE.test(text)) return;
    candidates.push({ url, text: text.slice(0, 200) });
  });
  if (candidates.length === 0 || candidates.length > 25) return null;

  // The product name link is normally the one with the longest text.
  const link = candidates.reduce((best, c) => (c.text.length > best.text.length ? c : best));

  let title = '';
  for (const s of TITLE_SELECTORS) {
    title = clean(card.find(s).first().text());
    if (title.length >= 4) break;
    title = '';
  }
  if (!title) title = link.text;

  const text = clean(card.text());
  const current = card.clone();
  current.find(OLD_PRICE_SELECTOR).remove();
  const price = findPrice(clean(current.text())) ?? findPrice(text);
  let inStock = detectStock(text);
  if (card.find(OUT_OF_STOCK_CLASS_SELECTOR).length > 0 || /sold-?out|out-of-stock/i.test(card.attr('data-status') ?? '')) {
    inStock = false;
  }
  // Skip containers that have neither a price nor a stock marker nor Pokémon in the name.
  if (!price && inStock === null && !POKEMON_RE.test(title)) return null;

  const img = card.find('img').first();
  const imgSrc = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');

  return {
    title,
    url: link.url,
    price: price?.price ?? null,
    currency: price?.currency ?? null,
    inStock,
    imageUrl: resolveUrl(imgSrc, baseUrl),
  };
}

/* ---------- Strategy 2: known product-card containers ---------- */

export const CARD_SELECTORS = [
  '[itemtype*="schema.org/Product" i]',
  '.product-item',
  '.product-card',
  '.product-box',
  '.product-tile',
  '.product-miniature',
  '.product',
  'li.item',
  'article',
];

function fromCards($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  for (const selector of CARD_SELECTORS) {
    $(selector).each((_, el) => {
      if (!('name' in el) || el.name === 'body' || el.name === 'html') return;
      const card = $(el);
      if (card.find(selector).length > 0) return; // a wrapper around other cards
      const product = describeCard($, card, baseUrl);
      if (product) out.push(product);
    });
  }
  return out;
}

/* ---------- Strategy 3: start from the prices and climb to the product card ---------- */

/** Distinct product-ish link targets (without query string) inside a node. */
function hrefsIn($: CheerioAPI, node: AnyNode): Set<string> {
  const hrefs = new Set<string>();
  const el = $(node);
  const add = (href: string | undefined) => {
    if (!href || href.startsWith('#') || BAD_HREF_RE.test(href)) return;
    hrefs.add(href.split('?')[0].split('#')[0]);
  };
  if ('name' in node && node.name === 'a') add(el.attr('href'));
  el.find('a[href]').each((_, a) => add($(a).attr('href')));
  return hrefs;
}

/**
 * Works on any markup: every element that is only a price is a seed; the card is the largest
 * ancestor that still belongs to a single product (one product link, one price block).
 */
export function findPriceCards($: CheerioAPI): AnyNode[] {
  const seeds: AnyNode[] = [];
  $('body *')
    .not('script, style, noscript, svg, svg *')
    .each((_, el) => {
      const node = $(el);
      if (node.children().length > 3) return;
      const text = clean(node.text());
      if (text && text.length <= 40 && findPrice(text)) seeds.push(el);
    });

  const seedSet = new Set<AnyNode>(seeds);
  const deepest = seeds.filter((el) => !$(el).find('*').toArray().some((d) => seedSet.has(d)));
  const usable = deepest.filter((el) => $(el).closest(CHROME_SELECTOR).length === 0);

  const cards = new Set<AnyNode>();
  for (const el of usable) {
    let node: AnyNode = el;
    let best: AnyNode | null = null;
    for (let depth = 0; depth < 10; depth++) {
      const parent = node.parent;
      if (!parent || !('name' in parent) || parent.name === 'body' || parent.name === 'html') break;
      const links = hrefsIn($, parent).size;
      const priceBlocks = new Set(usable.filter((d) => $.contains(parent, d)).map((d) => d.parent)).size;
      if (links >= 3 || (links === 2 && priceBlocks > 1)) break;
      node = parent;
      if (links >= 1) best = parent;
    }
    if (best) cards.add(best);
  }
  return [...cards];
}

function fromPriceAnchors($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  for (const card of findPriceCards($)) {
    const product = describeCard($, $(card), baseUrl);
    if (product) out.push(product);
  }
  return out;
}

/* ---------- Strategy 4: any link that mentions Pokémon ---------- */

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

/**
 * Extracts products from a shop listing page. Strategies run from most to least reliable;
 * later ones are only used when the earlier ones found nothing.
 */
export function extractProducts(
  html: string,
  baseUrl: string,
  opts: { filterPokemon?: boolean } = {},
): ExtractedProduct[] {
  return extractAll(html, baseUrl, opts).matched;
}

/** Like extractProducts, but also returns everything that was parsed before the keyword filter. */
export function extractAll(
  html: string,
  baseUrl: string,
  opts: { filterPokemon?: boolean } = {},
): { scanned: ExtractedProduct[]; matched: ExtractedProduct[] } {
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
  if (merged.size === 0) fromPriceAnchors($, baseUrl).forEach(add);
  if (merged.size === 0 && opts.filterPokemon !== false) fromAnchors($, baseUrl).forEach(add);

  const scanned = [...merged.values()];
  // On a Pokémon TCG category page every product counts, so no keyword filter is applied.
  return { scanned, matched: opts.filterPokemon === false ? scanned : scanned.filter(isPokemonTcg) };
}
