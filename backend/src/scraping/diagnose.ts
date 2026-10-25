import * as cheerio from 'cheerio';
import { CARD_SELECTORS, findPriceCards, fromJsonLd } from './extract';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Bot-protection pages are short; real shop pages are far bigger. */
const WALL_MAX_BYTES = 20_000;

const BLOCK_MARKERS: [string, RegExp][] = [
  ['Incapsula', /incapsula incident|_incapsula_/i],
  ['Cloudflare', /cf-chl|just a moment\.\.\.|attention required! \| cloudflare/i],
  ['Access Denied', /access denied|request blocked|request unsuccessful/i],
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
  parts.push(`priceCards=${priceCards.length}`);

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
