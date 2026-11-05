import * as cheerio from 'cheerio';
import { CARD_SELECTORS, findPriceCards, findPriceSeeds, fromJsonLd } from './extract';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Bot-protection pages are short; real shop pages are far bigger. */
const WALL_MAX_BYTES = 20_000;

const BLOCK_MARKERS: [string, RegExp][] = [
  ['Incapsula', /incapsula incident|_incapsula_/i],
  ['Cloudflare', /cf-chl|just a moment\.\.\.|attention required! \| cloudflare/i],
  ['Access Denied', /access denied|request blocked|request unsuccessful/i],
  ['browser check', /one moment, please|request is being verified|checking your browser/i],
  ['CAPTCHA', /captcha/i],
  ['needs JavaScript', /enable javascript|javascript is required/i],
];

/** Name of the bot protection when the page is a challenge/block page instead of a shop page. */
export function detectBotWall(html: string): string | null {
  if (html.length > WALL_MAX_BYTES) return null;
  const hit = BLOCK_MARKERS.find(([, re]) => re.test(html));
  return hit ? hit[0] : null;
}

/**
 * One-line, human-readable explanation of what a fetched page contains. It is printed in the
 * workflow run so that "0 found" can be traced to a cause: bot wall, JavaScript-only page,
 * or markup the extractor does not recognise (the sample card shows the real structure).
 */
export function diagnose(html: string, url: string, extra: { titles?: string[] } = {}): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  parts.push(`url=${url}`);
  parts.push(`htmlBytes=${html.length}`);
  parts.push(`title="${clean($('title').first().text()).slice(0, 80)}"`);

  const jsonLd = $('script[type="application/ld+json"]').length;
  parts.push(`jsonLdBlocks=${jsonLd}`, `jsonLdProducts=${fromJsonLd($, url).length}`);
  if (html.includes('__NEXT_DATA__')) parts.push('nextData=yes');
  if (/<script[^>]+type="application\/json"/i.test(html)) parts.push('inlineJson=yes');

  const selectorCounts = CARD_SELECTORS.map((s) => [s, $(s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${s}=${n}`);
  parts.push(`cardSelectors=[${selectorCounts.join(' ')}]`);

  const anchors = $('a[href]').length;
  const pokemonAnchors = $('a[href]')
    .toArray()
    .filter((a) => /pok[eé]mon|покемон/i.test($(a).text() + ($(a).attr('href') ?? ''))).length;
  parts.push(`links=${anchors}`, `pokemonLinks=${pokemonAnchors}`);

  const priceCards = findPriceCards($);
  const seeds = findPriceSeeds($);
  parts.push(`priceSeeds=${seeds.all.length}`, `inPageChrome=${seeds.all.length - seeds.usable.length}`, `priceCards=${priceCards.length}`);

  if (seeds.all.length > 0 && priceCards.length === 0) {
    // Show what swallowed the prices: the element that excluded the first seed, or the seed's surroundings.
    const first = seeds.all[0];
    const chrome = $(first).closest('header, nav, footer, cart-drawer, .drawer, #CartDrawer, [role="dialog"], [class*="minicart" i], [class*="mini-cart" i], facets-form-component, .facets, .facets-wrapper, .facets__form');
    const openingTag = (html: string) => (clean(html).match(/^<[^>]+>/) ?? [''])[0];
    if (chrome.length) parts.push(`firstPriceExcludedBy=${openingTag($.html(chrome.first()))}`);
    parts.push(`firstPriceContext=${clean($.html($(first).parent().parent().parent())).slice(0, 700)}`);
  }

  const wall = detectBotWall(html);
  if (wall) parts.push(`botWall=${wall}`);
  if (extra.titles) {
    parts.push(`parsed=${extra.titles.length}`);
    parts.push(`titles=[${extra.titles.slice(0, 12).map((t) => t.slice(0, 60)).join(' ; ')}]`);
  }

  parts.push(`bodyText="${clean($('body').text()).slice(0, 160)}"`);

  if (priceCards.length > 0) {
    parts.push(`sampleCard=${clean($.html(priceCards[0])).slice(0, 900)}`);
  }

  return parts.join(' | ');
}
