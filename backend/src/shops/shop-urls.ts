/**
 * Search-URL presets for known shops. These are best guesses and can be edited
 * per shop in the UI: if a shop changes its search URL, just update it there.
 */
const PRESETS: Record<string, string> = {
  // Both shops' robots.txt disallow their search pages, so default to category pages.
  'ozone.bg': 'https://www.ozone.bg/pazeli-2d-3d/nastolni-igri/trading-card-games/pokemon/',
  'toyzzshop.bg': 'https://toyzzshop.bg/nastolni-igri',
};

export function defaultSearchUrl(origin: string, game = 'pokemon'): string {
  const host = new URL(origin).hostname.replace(/^www\./, '');
  // The presets are Pokémon category pages.
  return (game === 'pokemon' ? PRESETS[host] : undefined) ?? `${origin}/search?q={query}`;
}

export interface NormalizedShop {
  name: string;
  baseUrl: string;
  searchUrl: string;
  game: string;
}

/** Turns "www.ozone.bg" (or a full URL) into a shop definition. Throws on invalid input. */
export function normalizeShopInput(input: { url: string; name?: string; searchUrl?: string; game?: string }): NormalizedShop {
  let raw = input.url.trim();
  if (!raw) throw new Error('Shop URL is required');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  const parsed = new URL(raw); // throws on garbage
  const baseUrl = parsed.origin.toLowerCase();
  const host = parsed.hostname.replace(/^www\./, '');

  const searchUrl = input.searchUrl?.trim() || defaultSearchUrl(baseUrl, input.game?.trim() || 'pokemon');
  // Either a search template containing {query}, or a fixed category/listing page URL.
  new URL(searchUrl.replace('{query}', 'test')); // throws if it is not a valid URL

  return { name: input.name?.trim() || host, baseUrl, searchUrl, game: input.game?.trim() || 'pokemon' };
}

/** A URL without {query} is a fixed listing/category page (every product on it is checked). */
export function isCategoryPage(template: string): boolean {
  return !template.includes('{query}');
}

/**
 * Category pages whose own URL says Pokémon/TCG (e.g. .../pokemon/ or .../tcg-cards) list only
 * relevant products, so every product there matches. Any other page (searches, general
 * categories such as "board games") is still filtered by Pokémon TCG keywords.
 */
export function listsOnlyPokemon(template: string): boolean {
  return listsOnlyGame(template, /pok[eé]mon|покемон/i, true);
}

/**
 * Like {@link listsOnlyPokemon}, for any game (`gameRe` = the game's keywords). The generic word
 * "tcg" in the path only counts when `tcgWordCounts` (it is the Pokémon rule: such a page may list other games).
 */
export function listsOnlyGame(template: string, gameRe: RegExp, tcgWordCounts = false): boolean {
  if (!isCategoryPage(template)) return false;
  let path = template;
  try {
    path = decodeURIComponent(new URL(template).pathname);
  } catch {
    /* use raw */
  }
  return gameRe.test(path.replace(/[-_/]+/g, ' ')) || (tcgWordCounts && /tcg/i.test(path));
}

export function buildSearchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query));
}
