/**
 * Search-URL presets for known shops. These are best guesses and can be edited
 * per shop in the UI: if a shop changes its search URL, just update it there.
 */
const PRESETS: Record<string, string> = {
  'ozone.bg': 'https://www.ozone.bg/instantsearchplus/result/?q={query}',
  'toyzzshop.bg': 'https://www.toyzzshop.bg/search?q={query}',
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

export function buildSearchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query));
}
