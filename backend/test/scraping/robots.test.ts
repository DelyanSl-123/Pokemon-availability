import { describe, expect, it } from 'vitest';
import { parseRobots } from '../../src/scraping/robots';

const TXT = `
# comment
User-agent: *
Disallow: /search
Disallow: /private/
Allow: /private/public.html
Disallow: /*.pdf$

User-agent: pokemontrackerbot
Disallow: /secret
`;

describe('parseRobots', () => {
  it('uses the specific group for our bot', () => {
    const allowed = parseRobots(TXT, 'PokemonTrackerBot/1.0 (personal stock check)');
    expect(allowed('/secret/page')).toBe(false);
    expect(allowed('/search?q=pokemon')).toBe(true);
  });

  it('falls back to the * group', () => {
    const allowed = parseRobots(TXT, 'SomeOtherBot/2.0');
    expect(allowed('/search?q=pokemon')).toBe(false);
    expect(allowed('/private/a.html')).toBe(false);
    expect(allowed('/catalog')).toBe(true);
  });

  it('lets the longest matching rule win', () => {
    const allowed = parseRobots(TXT, 'SomeOtherBot/2.0');
    expect(allowed('/private/public.html')).toBe(true);
  });

  it('supports * and $ wildcards', () => {
    const allowed = parseRobots(TXT, 'SomeOtherBot/2.0');
    expect(allowed('/files/manual.pdf')).toBe(false);
    expect(allowed('/files/manual.pdf.html')).toBe(true);
  });

  it('allows everything for an empty Disallow or an empty file', () => {
    expect(parseRobots('User-agent: *\nDisallow:', 'Bot')('/anything')).toBe(true);
    expect(parseRobots('', 'Bot')('/anything')).toBe(true);
  });
});
