import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { ExtractedProduct } from '../types';

/** Matches Latin and Cyrillic spellings (Pokémon / Pokemon / Покемон). */
export const POKEMON_RE = /pok[eé]mon|покемон/i;
/** Words that mark a trading-card product (English + Bulgarian). */
export const TCG_RE =
  /\btcg\b|trading card|booster|бустер|карти|картов|\bcards?\b|elite trainer|\betb\b|blister|\btin\b|collection|колекци|\bdeck\b|тесте|bundle/i;

const OUT_OF_STOCK_RE =
  /изчерпан|няма наличност|не е наличен|не е в наличност|не е на разположение|out of stock|sold out|unavailable/i;
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

/** origin + path without trailing slash, to compare "is this the page we are on". */
function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return url;
  }
}

export function fromJsonLd($: CheerioAPI, baseUrl: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  const thisPage = pageKey(baseUrl);
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
      // Some shops give every product the listing page as its url; those collapse into one item.
      if (!url || !title || pageKey(url) === thisPage) return;

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
  'cart-drawer',
  '.drawer',
  '#CartDrawer',
  '[role="dialog"]',
  '[class*="mini-cart" i]',
  '[class*="minicart" i]',
  '[id*="minicart" i]',
  'facets-form-component',
  '.facets',
  '.facets-wrapper',
  '.facets__form',
].join(', ');

/** Crossed-out / list prices that must not be reported as the selling price. */
const OLD_PRICE_SELECTOR = 's, del, strike, [class*="old-price" i], [class*="oldprice" i], [class*="compare-at" i], [class*="was-price" i]';
/** Markers in class names that say a product cannot be bought. */
const OUT_OF_STOCK_CLASS_SELECTOR =
  '[class*="sold-out" i], [class*="soldout" i], [class*="out-of-stock" i], [class*="outofstock" i], [class*="unavailable" i]';

const TITLE_SELECTORS = ['[itemprop="name"]', '.product-name', '.product-title', '.product-item-link', 'h2', 'h3', 'h4', '.title'];

/** Add-to-cart controls (read only as a stock signal; they are never used). */
const BUY_CONTROL_SELECTOR =
  'form[action*="/cart/add" i], [class*="add-to-cart" i], [class*="addtocart" i], [onclick*="cart/add" i], button[name="add"]';
/** Cards that only lead to an options choice say nothing about stock. */
const OPTIONS_TEXT_RE = /избер|опции|select options|choose options/i;
/** Shopify (Dawn) product cards show a badge only when sold out, never an "in stock" label. */
const SOLD_OUT_BADGE_CARD_SELECTOR = '.product-card-wrapper';

/** 'enabled' / 'disabled' add-to-cart control in the card, or 'none'. */
function buyControlIn(card: Cheerio<AnyNode>): 'enabled' | 'disabled' | 'none' {
  const controls = card.find(BUY_CONTROL_SELECTOR);
  if (controls.length === 0) return 'none';
  const buttons = controls.filter('button, input[type=submit]').add(controls.find('button, input[type=submit]'));
  if (buttons.length === 0) return 'enabled'; // a link or icon that adds to the cart
  const usable = buttons.filter((_, b) => {
    const attribs = 'attribs' in b ? b.attribs : {};
    return attribs.disabled === undefined && attribs['aria-disabled'] !== 'true';
  });
  return usable.length > 0 ? 'enabled' : 'disabled';
}

/** A product from a page card, with what its add-to-cart control said (used for the page-wide rule). */
type CardProduct = ExtractedProduct & { buyControl?: 'enabled' | 'disabled' | 'none'; optionsOnly?: boolean };

/** Turns one product container into a product, or null when it does not look like one. */
function describeCard($: CheerioAPI, original: Cheerio<AnyNode>, baseUrl: string): CardProduct | null {
  // Work on a copy without scripts: shops embed JSON/JS inside cards, which would end up in titles.
  const card = original.clone();
  card.find('script, style, noscript, template').remove();

  const candidates: { url: string; text: string }[] = [];
  // The card itself can be the product link (e.g. <a class="product-box"> on ozone.bg).
  card.find('a[href]').addBack('a[href]').each((_, a) => {
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
  // Some shops append attribute lines to the name, e.g. "... Тема: Pokémon" (theme).
  title = title.replace(/\s+(Тема|Серия|Марка|Бранд):.*$/i, '').trim() || title;

  const text = clean(card.text());
  const current = card.clone();
  current.find(OLD_PRICE_SELECTOR).remove();
  const price = findPrice(clean(current.text())) ?? findPrice(text);
  let inStock = detectStock(text);
  if (card.find(OUT_OF_STOCK_CLASS_SELECTOR).length > 0 || /sold-?out|out-of-stock/i.test(card.attr('data-status') ?? '')) {
    inStock = false;
  }
  const buyControl = buyControlIn(card);
  if (inStock === null && buyControl !== 'none') inStock = buyControl === 'enabled';
  if (inStock === null && price) {
    let wrapper = original.closest(SOLD_OUT_BADGE_CARD_SELECTOR);
    if (wrapper.length === 0) wrapper = original.find(SOLD_OUT_BADGE_CARD_SELECTOR);
    if (wrapper.length === 1) inStock = !OUT_OF_STOCK_RE.test(clean(wrapper.text()));
  }
  // Skip containers that have neither a price nor a stock marker nor Pokémon in the name.
  if (!price && inStock === null && !POKEMON_RE.test(title)) return null;

  return {
    title,
    url: link.url,
    price: price?.price ?? null,
    currency: price?.currency ?? null,
    inStock,
    imageUrl: imageUrlOf(card.find('img').first(), baseUrl),
    buyControl,
    optionsOnly: OPTIONS_TEXT_RE.test(text),
  };
}

/** Attributes lazy-loading scripts use for the real image; `src` then holds only a placeholder. */
const LAZY_IMG_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
const SRCSET_ATTRS = ['data-srcset', 'srcset'];

/** The real image of an <img>, skipping lazy-load placeholders such as 1×1 data: GIFs. */
function imageUrlOf(img: Cheerio<AnyNode>, baseUrl: string): string | null {
  const candidates = [
    ...LAZY_IMG_ATTRS.map((a) => img.attr(a)),
    img.attr('src'),
    // "url 1x, url 2x" -> the first url
    ...SRCSET_ATTRS.map((a) => img.attr(a)?.trim().split(/\s+/)[0].replace(/,$/, '')),
  ];
  for (const c of candidates) {
    const url = resolveUrl(c, baseUrl);
    if (url) return url;
  }
  return null;
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

function fromCards($: CheerioAPI, baseUrl: string): CardProduct[] {
  const out: CardProduct[] = [];
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

/** Elements that contain nothing but a price, split into all of them and those outside page chrome. */
export function findPriceSeeds($: CheerioAPI): { all: AnyNode[]; usable: AnyNode[] } {
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
  const all = seeds.filter((el) => !$(el).find('*').toArray().some((d) => seedSet.has(d)));
  const usable = all.filter((el) => $(el).closest(CHROME_SELECTOR).length === 0);
  return { all, usable };
}

/**
 * Works on any markup: every element that is only a price is a seed; the card is the largest
 * ancestor that still belongs to a single product (it stops where a second price block and a
 * second product link show up).
 */
export function findPriceCards($: CheerioAPI): AnyNode[] {
  const { usable } = findPriceSeeds($);
  // Old/new/hidden price variants of one card sit side by side below the same grandparent.
  const blockOf = (el: AnyNode): AnyNode | null => el.parent?.parent ?? el.parent;

  const cards = new Set<AnyNode>();
  for (const el of usable) {
    let node: AnyNode = el;
    let best: AnyNode | null = null;
    for (let depth = 0; depth < 10; depth++) {
      const parent = node.parent;
      if (!parent || !('name' in parent) || parent.name === 'body' || parent.name === 'html') break;
      const links = hrefsIn($, parent).size;
      const priceBlocks = new Set(usable.filter((d) => $.contains(parent, d)).map(blockOf)).size;
      if (priceBlocks > 1 && links >= 2) break;
      node = parent;
      if (links >= 1) best = parent;
    }
    if (best) cards.add(best);
  }
  return [...cards];
}

/**
 * Some shops keep the picture in a sibling of the block with name and price. Climbs a few levels
 * for an image, but only while every link there still leads to this same product.
 */
function imageNear($: CheerioAPI, node: AnyNode, productUrl: string, baseUrl: string): string | null {
  const samePage = pageKey(productUrl);
  let current = node.parent;
  for (let depth = 0; depth < 3 && current && 'name' in current && current.name !== 'body'; depth++) {
    const el = $(current);
    const others = el.find('a[href]').toArray().some((a) => {
      const href = $(a).attr('href') ?? '';
      const url = resolveUrl(href, baseUrl);
      return url !== null && !BAD_HREF_RE.test(href) && pageKey(url) !== samePage;
    });
    if (others) return null;
    const img = el.find('img').first();
    if (img.length > 0) return imageUrlOf(img, baseUrl);
    current = current.parent;
  }
  return null;
}

function fromPriceAnchors($: CheerioAPI, baseUrl: string): CardProduct[] {
  const out: CardProduct[] = [];
  for (const card of findPriceCards($)) {
    const product = describeCard($, $(card), baseUrl);
    if (!product) continue;
    product.imageUrl ??= imageNear($, card, product.url, baseUrl);
    out.push(product);
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

  const merged = new Map<string, CardProduct>();
  const add = (p: CardProduct) => {
    const existing = merged.get(p.url);
    if (!existing) {
      merged.set(p.url, { ...p });
      return;
    }
    existing.price ??= p.price;
    existing.currency ??= p.currency;
    existing.inStock ??= p.inStock;
    existing.imageUrl ??= p.imageUrl;
    if (!existing.buyControl || existing.buyControl === 'none') existing.buyControl = p.buyControl;
    existing.optionsOnly ||= p.optionsOnly;
  };

  fromJsonLd($, baseUrl).forEach(add);
  fromCards($, baseUrl).forEach(add);

  const priceProducts = fromPriceAnchors($, baseUrl);
  if (merged.size === 0) {
    priceProducts.forEach(add);
  } else if (priceProducts.length >= 6 && merged.size < priceProducts.length / 2) {
    // The earlier strategies saw only part of the page: add what they missed (matched by title).
    const known = new Set([...merged.values()].map((p) => p.title.toLowerCase()));
    priceProducts.filter((p) => !known.has(p.title.toLowerCase())).forEach(add);
  }
  if (merged.size === 0 && opts.filterPokemon !== false) fromAnchors($, baseUrl).forEach(add);

  // Shops such as ozone.bg show the add-to-cart control only on products that can be bought: when
  // some cards on the page have one, a card without one (and without an options choice) is out of stock.
  const cards = [...merged.values()];
  if (cards.some((p) => p.buyControl === 'enabled')) {
    for (const p of cards) {
      if (p.inStock === null && p.buyControl === 'none' && !p.optionsOnly) p.inStock = false;
    }
  }

  const scanned: ExtractedProduct[] = cards.map(({ buyControl: _b, optionsOnly: _o, ...p }) => p);
  // On a Pokémon TCG category page every product counts, so no keyword filter is applied.
  return { scanned, matched: opts.filterPokemon === false ? scanned : scanned.filter(isPokemonTcg) };
}
