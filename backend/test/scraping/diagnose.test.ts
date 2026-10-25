import { describe, expect, it } from 'vitest';
import { detectBotWall, diagnose } from '../../src/scraping/diagnose';
import { BOT_WALL_HTML, CARDS_HTML, DIV_SOUP_HTML, MANY_LINKS_HTML } from '../fixtures/html';

describe('diagnose', () => {
  it('summarises what the page contains, including a sample product card', () => {
    const text = diagnose(DIV_SOUP_HTML, 'https://shop.test/pokemon');
    expect(text).toContain('title="Pokemon cards"');
    expect(text).toContain('priceCards=2');
    expect(text).toContain('sampleCard=<div class="c">');
  });

  it('counts known card selectors', () => {
    expect(diagnose(MANY_LINKS_HTML, 'https://shop.test/')).toContain('.product-item=2');
  });

  it('explains when prices exist but all of them sit in page chrome', () => {
    const html = '<html><body><cart-drawer class="drawer"><div><span>5,00 €</span></div></cart-drawer></body></html>';
    const text = diagnose(html, 'https://shop.test/');
    expect(text).toContain('priceSeeds=1');
    expect(text).toContain('inPageChrome=1');
    expect(text).toContain('firstPriceExcludedBy=<cart-drawer class="drawer">');
  });

  it('lists the parsed product titles', () => {
    const text = diagnose(CARDS_HTML, 'https://shop.test/', { titles: ['A', 'B'] });
    expect(text).toContain('parsed=2');
    expect(text).toContain('titles=[A ; B]');
  });

  it('detects a bot-protection page', () => {
    expect(detectBotWall(BOT_WALL_HTML)).toBe('Incapsula');
    expect(diagnose(BOT_WALL_HTML, 'https://x.test/')).toContain('botWall=Incapsula');
    expect(detectBotWall('<html><title>Just a moment...</title></html>')).toBe('Cloudflare');
  });

  it('does not mistake a normal shop page that mentions captcha for a bot wall', () => {
    const bigPage = `<html><body><script>/* captcha */</script>${'<p>product</p>'.repeat(3000)}</body></html>`;
    expect(detectBotWall(bigPage)).toBeNull();
  });
});
