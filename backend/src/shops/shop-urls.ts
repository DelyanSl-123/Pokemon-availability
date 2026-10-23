/**
 * Search-URL presets for known shops. These are best guesses and can be edited
 * per shop in the UI: if a shop changes its search URL, just update it there.
 */
const PRESETS: Record<string, string> = {
  // Both shops' robots.txt disallow their search pages, so default to category pages.
  'ozone.bg': 'https://www.ozone.bg/pazeli-2d-3d/nastolni-igri/trading-card-games/pokemon/',
  'toyzzshop.bg': 'https://toyzzshop.bg/nastolni-igri',
};

export function defaultSearchUrl(origin: string): string {
  const host = new URL(origin).hostname.replace(/^www\./, '');
  return PRESETS[host] ?? `${origin}/search?q={query}`;
}

export interface NormalizedShop {
  name: string;
  baseUrl: string;
  searchUrl: string;
}

/** Turns "www.ozone.bg" (or a full URL) into a shop definition. Throws on invalid input. */
export function normalizeShopInput(input: { url: string; name?: string; searchUrl?: string }): NormalizedShop {
  let raw = input.url.trim();
  if (!raw) throw new Error('Shop URL is required');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  const parsed = new URL(raw); // throws on garbage
  const baseUrl = parsed.origin.toLowerCase();
  const host = parsed.hostname.replace(/^www\./, '');

  const searchUrl = input.searchUrl?.trim() || defaultSearchUrl(baseUrl);
  // Either a search template containing {query}, or a fixed category/listing page URL.
  new URL(searchUrl.replace('{query}', 'test')); // throws if it is not a valid URL

  return { name: input.name?.trim() || host, baseUrl, searchUrl };
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
  if (!isCategoryPage(template)) return false;
  let path = template;
  try {
    path = decodeURIComponent(new URL(template).pathname);
  } catch {
    /* use raw */
  }
  return /pok[eé]mon|покемон|tcg/i.test(path);
}

export function buildSearchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query));
}
