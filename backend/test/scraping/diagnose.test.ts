import { describe, expect, it } from 'vitest';
import { diagnose } from '../../src/scraping/diagnose';
import { DIV_SOUP_HTML, MANY_LINKS_HTML } from '../fixtures/html';

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

  it('flags pages that look like a bot wall', () => {
    const text = diagnose('<html><title>Just a moment...</title><body>Enable JavaScript and cookies</body></html>', 'https://x.test/');
    expect(text).toContain('possibleBlock=');
    expect(text).toContain('cloudflare');
  });
});
