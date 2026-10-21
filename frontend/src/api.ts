export interface Shop {
  id: number;
  name: string;
  baseUrl: string;
  searchUrl: string;
  enabled: boolean;
  respectRobots: boolean;
}

export interface Product {
  id: number;
  shopId: number;
  shopName: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
  imageUrl: string | null;
  firstSeen: string;
  lastSeen: string;
}

export interface ShopRunResult {
  shopId: number;
  shopName: string;
  status: 'ok' | 'blocked' | 'error';
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
}

export interface Settings {
  mailTo: string;
  cron: string;
  query: string;
}

export interface RunOutcome {
  summary: RunSummary;
  email: { sent: boolean; reason?: string } | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  shops: () => request<Shop[]>('/shops'),
  addShop: (body: { url: string; searchUrl?: string }) => request<Shop>('/shops', { method: 'POST', body: json(body) }),
  patchShop: (id: number, body: Partial<Pick<Shop, 'name' | 'searchUrl' | 'enabled' | 'respectRobots'>>) =>
    request<Shop>(`/shops/${id}`, { method: 'PATCH', body: json(body) }),
  deleteShop: (id: number) => request<void>(`/shops/${id}`, { method: 'DELETE' }),
  products: (q: { shopId?: number; inStock?: boolean }) => {
    const params = new URLSearchParams();
    if (q.shopId !== undefined) params.set('shopId', String(q.shopId));
    if (q.inStock) params.set('inStock', 'true');
    return request<Product[]>(`/products?${params}`);
  },
  runs: () => request<RunSummary[]>('/runs'),
  run: (sendEmail: boolean) => request<RunOutcome>('/run', { method: 'POST', body: json({ sendEmail }) }),
  settings: () => request<Settings>('/settings'),
  saveSettings: (body: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: json(body) }),
};
