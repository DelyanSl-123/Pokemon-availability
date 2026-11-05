export interface Shop {
  id: number;
  name: string;
  baseUrl: string;
  /** URL template, `{query}` is replaced with the URL-encoded search phrase. */
  searchUrl: string;
  enabled: boolean;
  respectRobots: boolean;
}

export interface ExtractedProduct {
  title: string;
  url: string;
  price: number | null;
  currency: string | null;
  /** true = in stock, false = out of stock, null = the page does not say */
  inStock: boolean | null;
  imageUrl: string | null;
}

export interface FoundProduct extends ExtractedProduct {
  shopId: number;
  shopName: string;
  isNew: boolean;
  backInStock: boolean;
}

export type ShopStatus = 'ok' | 'blocked' | 'error';

export interface ShopRunResult {
  shopId: number;
  shopName: string;
  /** The shop search-results page that was checked (link for the email). */
  searchUrl?: string;
  /** Products parsed from the page before the Pokémon keyword filter. */
  scanned?: number;
  /** What the fetched page contained; helps to explain "0 found". */
  diagnostics?: string;
  status: ShopStatus;
  message?: string;
  found: number;
  newCount: number;
  backInStock: number;
}

export interface RunSummary {
  runId: number;
  startedAt: string;
  finishedAt: string;
  source: 'schedule' | 'manual';
  query: string;
  shops: ShopRunResult[];
  products: FoundProduct[];
}

export interface Settings {
  cron: string;
  query: string;
}
