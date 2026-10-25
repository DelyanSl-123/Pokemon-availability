import * as cheerio from 'cheerio';
import { CARD_SELECTORS, findPriceCards, fromJsonLd } from './extract';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Words that usually mean a bot wall or a page that needs JavaScript. */
const BLOCK_MARKERS: [string, RegExp][] = [
  ['captcha', /captcha/i],
  ['cloudflare', /cf-chl|cloudflare|just a moment/i],
  ['access-denied', /access denied|forbidden|request blocked/i],
  ['akamai', /akamai|_abck/i],
  ['needs-js', /enable javascript|javascript is required|you need to enable javascript/i],
];

/**
 * One-line, human-readable explanation of what a fetched page contains. It is printed in the
 * workflow run so that "0 found" can be traced to a cause: bot wall, JavaScript-only page,
 * or markup the extractor does not recognise (the sample card shows the real structure).
 */
export function diagnose(html: string, url: string): string {
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

  const flags = BLOCK_MARKERS.filter(([, re]) => re.test(html.slice(0, 200_000))).map(([name]) => name);
  if (flags.length) parts.push(`possibleBlock=[${flags.join(',')}]`);

  parts.push(`bodyText="${clean($('body').text()).slice(0, 160)}"`);

  if (priceCards.length > 0) {
    parts.push(`sampleCard=${clean($.html(priceCards[0])).slice(0, 900)}`);
  }

  return parts.join(' | ');
}
