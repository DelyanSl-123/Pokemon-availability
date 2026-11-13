export interface Game {
  slug: string;
  name: string;
  keywords: string;
  query: string;
  enabled: boolean;
  builtin: boolean;
}

export interface Shop {
  id: number;
  name: string;
  baseUrl: string;
  searchUrl: string;
  enabled: boolean;
  respectRobots: boolean;
  game: string;
}

export interface Product {
  id: number;
  game: string;
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
  game?: string;
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
  cron: string;
  query: string;
}

export interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  emailVerified: boolean;
  termsVersion: string | null;
}

export interface Profile {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  phone?: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  phone?: string;
  acceptTerms: boolean;
  captchaToken?: string;
  /** Hidden honeypot field; must stay empty. */
  website?: string;
}

export interface ShopSuggestion {
  id: number;
  url: string;
  note: string;
  createdAt: string;
}

/** An error response from the API; `status` 401 means the session is missing or expired. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  me: () => request<{ user: User }>('/auth/me').then((r) => r.user),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: json(body) }).then((r) => r.user),
  register: (body: RegisterBody) =>
    request<{ email: string; emailSent: boolean }>('/auth/register', { method: 'POST', body: json(body) }),
  activate: (token: string) => request<{ activated: boolean }>('/auth/activate', { method: 'POST', body: json({ token }) }),
  resendActivation: (email: string, captchaToken?: string) =>
    request<{ ok: boolean }>('/auth/resend', { method: 'POST', body: json({ email, captchaToken }) }),
  config: () => request<{ turnstileSiteKey: string | null }>('/config'),
  forgotPassword: (email: string, captchaToken?: string) =>
    request<{ ok: boolean }>('/auth/forgot', { method: 'POST', body: json({ email, captchaToken }) }),
  resetPassword: (body: { token: string; password: string; confirmPassword: string }) =>
    request<{ reset: boolean }>('/auth/reset', { method: 'POST', body: json(body) }),
  confirmEmail: (token: string) => request<{ confirmed: boolean }>('/auth/confirm-email', { method: 'POST', body: json({ token }) }),
  updateProfile: (body: Profile) => request<{ user: User }>('/account', { method: 'PATCH', body: json(body) }).then((r) => r.user),
  changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    request<{ changed: boolean }>('/account/password', { method: 'POST', body: json(body) }),
  changeEmail: (body: { newEmail: string; password: string }) =>
    request<{ emailSent: boolean }>('/account/email', { method: 'POST', body: json(body) }),
  deleteAccount: (password: string) => request<void>('/account', { method: 'DELETE', body: json({ password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  shops: () => request<Shop[]>('/shops'),
  games: () => request<Game[]>('/games'),
  addGame: (body: { name: string; keywords?: string; query?: string }) =>
    request<Game>('/games', { method: 'POST', body: json(body) }),
  patchGame: (slug: string, body: Partial<Pick<Game, 'name' | 'keywords' | 'query' | 'enabled'>>) =>
    request<Game>(`/games/${slug}`, { method: 'PATCH', body: json(body) }),
  deleteGame: (slug: string) => request<void>(`/games/${slug}`, { method: 'DELETE' }),
  addShop: (body: { url: string; searchUrl?: string; game?: string }) => request<Shop>('/shops', { method: 'POST', body: json(body) }),
  patchShop: (id: number, body: Partial<Pick<Shop, 'name' | 'searchUrl' | 'enabled' | 'respectRobots'>>) =>
    request<Shop>(`/shops/${id}`, { method: 'PATCH', body: json(body) }),
  deleteShop: (id: number) => request<void>(`/shops/${id}`, { method: 'DELETE' }),
  products: (q: { shopId?: number; game?: string; inStock?: boolean }) => {
    const params = new URLSearchParams();
    if (q.game) params.set('game', q.game);
    if (q.shopId !== undefined) params.set('shopId', String(q.shopId));
    if (q.inStock) params.set('inStock', 'true');
    return request<Product[]>(`/products?${params}`);
  },
  suggestions: () => request<ShopSuggestion[]>('/suggestions'),
  deleteSuggestion: (id: number) => request<{ ok: boolean }>(`/suggestions/${id}`, { method: 'DELETE' }),
  runs: () => request<RunSummary[]>('/runs'),
  run: () => request<RunSummary>('/run', { method: 'POST', body: json({}) }),
  settings: () => request<Settings>('/settings'),
  saveSettings: (body: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: json(body) }),
};
