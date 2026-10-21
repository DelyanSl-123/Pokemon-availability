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
  if (!searchUrl.includes('{query}')) {
    throw new Error('Search URL must contain the {query} placeholder');
  }
  new URL(searchUrl.replace('{query}', 'test')); // validates the template

  return { name: input.name?.trim() || host, baseUrl, searchUrl };
}

export function buildSearchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query));
}
