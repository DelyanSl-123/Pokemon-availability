import { parseRobots } from './robots';

export const USER_AGENT = 'PokemonTrackerBot/1.0 (personal stock check)';
const PAGE_TIMEOUT_MS = 20_000;
const ROBOTS_TIMEOUT_MS = 10_000;

export type FetchFn = typeof fetch;

export type FetchOutcome =
  | { ok: true; html: string; url: string }
  | { ok: false; reason: 'blocked' | 'http' | 'network'; message: string };

export type PageFetcher = (url: string, opts: { respectRobots: boolean }) => Promise<FetchOutcome>;

async function robotsAllows(url: string, f: FetchFn): Promise<boolean> {
  const target = new URL(url);
  try {
    const res = await f(`${target.origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
    });
    if (!res.ok) return true; // no robots.txt -> nothing is disallowed
    return parseRobots(await res.text(), USER_AGENT)(target.pathname + target.search);
  } catch {
    return true;
  }
}

export async function fetchPage(
  url: string,
  opts: { respectRobots: boolean; fetchImpl?: FetchFn },
): Promise<FetchOutcome> {
  const f = opts.fetchImpl ?? fetch;
  try {
    if (opts.respectRobots && !(await robotsAllows(url, f))) {
      return { ok: false, reason: 'blocked', message: 'Disallowed by robots.txt' };
    }
    const res = await f(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'bg,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: 'http', message: `HTTP ${res.status}` };
    return { ok: true, html: await res.text(), url: res.url || url };
  } catch (e) {
    return { ok: false, reason: 'network', message: e instanceof Error ? e.message : String(e) };
  }
}
