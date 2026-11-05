/**
 * Games (trading card games) the tracker looks for. Each game has keywords that must appear in a
 * product's name or link, and a search phrase for shops whose page is a search (`{query}`).
 * The four built-in games are always there; more can be added in the web app.
 */
export interface Game {
  /** Short id used in URLs and shops.json, e.g. "pokemon". */
  slug: string;
  name: string;
  /** Comma-separated words/phrases, any of which marks a product of this game. */
  keywords: string;
  /** Search phrase that replaces {query} in search-page URLs. */
  query: string;
  enabled: boolean;
  builtin: boolean;
}

export const DEFAULT_GAME = 'pokemon';

export const BUILTIN_GAMES: Omit<Game, 'enabled'>[] = [
  { slug: 'pokemon', name: 'Pokémon', keywords: 'pokemon, pokémon, покемон', query: 'pokemon tcg', builtin: true },
  { slug: 'onepiece', name: 'One Piece', keywords: 'one piece, onepiece, ван пийс, уан пийс', query: 'one piece card game', builtin: true },
  { slug: 'yugioh', name: 'Yu-Gi-Oh!', keywords: 'yu-gi-oh, yugioh, yu gi oh, юги-о, ю-ги-о, юги о', query: 'yugioh', builtin: true },
  { slug: 'mtg', name: 'Magic: The Gathering', keywords: 'magic: the gathering, magic the gathering, mtg, мейджик, меджик', query: 'magic the gathering', builtin: true },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regular expression that matches any keyword (spaces, hyphens and colons inside a keyword are flexible). */
export function keywordRegex(keywords: string): RegExp {
  const parts = keywords
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .map((k) => {
      const body = k.split(/[\s:\-]+/).filter(Boolean).map(escapeRe).join('[\\s:\\-]*');
      return /^[a-z0-9 :\-]+$/.test(k) ? `\\b${body}\\b` : body; // word boundaries only work for latin text
    });
  return parts.length ? new RegExp(parts.join('|'), 'i') : /(?!)/; // no keywords: never matches
}

/** "My Game" -> "my-game"; used as the id of a game added in the app. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
