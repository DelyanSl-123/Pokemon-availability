import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/**
 * Bot protection for the web app. Three layers:
 *  1. requests that identify as a bot / scraper / script (or send no User-Agent) get 403;
 *  2. every client address is rate limited, and sign-in / register are limited much harder;
 *  3. search engines are told to stay away (robots.txt, X-Robots-Tag).
 * A bot that pretends to be a normal browser passes layer 1, so layer 2 and the sign-in
 * requirement (every data endpoint needs an account) are what really protect the data.
 */

const BOT_UA =
  /bot\b|bot[/ ;_-]|crawl|spider|slurp|scrap|curl|wget|httpie|python|aiohttp|httpx|libwww|go-http|java\/|okhttp|apache-httpclient|node-fetch|undici|axios|got\(|postman|insomnia|headless|phantom|selenium|puppeteer|playwright|lighthouse|facebookexternalhit|preview|archiver|monitor|check_http|zgrab|masscan|nmap|nikto|sqlmap|scanner/i;

/** True when the User-Agent header is missing or looks like a bot, crawler, scraper or script. */
export function looksLikeBot(userAgent: string | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  return ua.length < 10 || BOT_UA.test(ua);
}

/** Fixed-window counter per key. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Counts one request; false when `key` is over its limit for the current window. */
    allow(key: string): boolean {
      const t = now();
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      const h = hits.get(key);
      if (!h || h.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      h.count += 1;
      return h.count <= limit;
    },
  };
}

/** Counts failed attempts per key (e.g. an e-mail) and locks the key for the rest of the window. */
export function createLockout(maxFailures: number, windowMs: number, now: () => number = Date.now) {
  const fails = new Map<string, { count: number; resetAt: number }>();
  const current = (key: string) => {
    const f = fails.get(key);
    if (f && f.resetAt <= now()) fails.delete(key);
    return fails.get(key);
  };
  return {
    isLocked: (key: string) => (current(key)?.count ?? 0) >= maxFailures,
    fail(key: string) {
      const f = current(key);
      if (f) f.count += 1;
      else fails.set(key, { count: 1, resetAt: now() + windowMs });
    },
    reset: (key: string) => void fails.delete(key),
  };
}

export interface SecurityOptions {
  /** Wrong passwords allowed per account within 15 minutes before it is locked for the rest of that time (default 5). */
  loginFailuresPerAccount?: number;
  /** Requests per client address per minute for the whole app (default 120). */
  requestsPerMinute?: number;
  /** Sign-in / register attempts per client address per 10 minutes (default 15). */
  loginAttemptsPer10Min?: number;
  /**
   * Development lock: when set, the whole site (pages and API, except the health check) asks for this
   * password with the browser's own sign-in box before anything is shown.
   */
  sitePassword?: string;
  /** Public site: search engines may read the home page, the game pages and the sitemap (everything else stays closed). */
  indexable?: boolean;
  /** Public address of the site (for the Sitemap line in robots.txt). */
  siteUrl?: string;
  /** User name for the site lock (default "admin"). */
  siteUser?: string;
  now?: () => number;
}

function sha(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** True when the Authorization header carries the right user name and password (constant time). */
function siteLockOk(header: string | undefined, user: string, password: string): boolean {
  if (!header || !header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = timingSafeEqual(sha(decoded.slice(0, i)), sha(user));
  const passOk = timingSafeEqual(sha(decoded.slice(i + 1)), sha(password));
  return userOk && passOk;
}

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

/** Search engine crawlers: let them read the public pages (and only those). */
const SEARCH_CRAWLER = /googlebot|bingbot|duckduckbot|yandexbot|applebot/i;
const isPublicPage = (path: string) => path === '/' || path === '/sitemap.xml' || path.startsWith('/games/');

function indexableRobots(siteUrl?: string): string {
  const lines = ['User-agent: *', 'Allow: /$', 'Allow: /games/', 'Allow: /sitemap.xml', 'Disallow: /app', 'Disallow: /api/'];
  if (siteUrl) lines.push('', `Sitemap: ${siteUrl.replace(/\/+$/, '')}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

export function registerBotProtection(app: FastifyInstance, opts: SecurityOptions = {}): void {
  const robotsTxt = opts.indexable ? indexableRobots(opts.siteUrl) : ROBOTS_TXT;
  const general = createRateLimiter(opts.requestsPerMinute ?? 120, 60_000, opts.now);
  const logins = createRateLimiter(opts.loginAttemptsPer10Min ?? 15, 10 * 60_000, opts.now);
  const lockFails = createRateLimiter(10, 10 * 60_000, opts.now);
  const lockUser = opts.siteUser || 'admin';

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/robots.txt') return reply.type('text/plain').send(robotsTxt);

    // Hosting platforms ping this with their own agent (e.g. "Render/1.0"); it only returns {ok:true}.
    if (path === '/api/health') return;

    const crawlerOk = opts.indexable && isPublicPage(path) && SEARCH_CRAWLER.test(req.headers['user-agent'] ?? '');
    if (!crawlerOk && looksLikeBot(req.headers['user-agent'])) {
      return reply.status(403).send({ error: 'Automated access is not allowed' });
    }
    if (!general.allow(req.ip)) {
      return reply.header('Retry-After', '60').status(429).send({ error: 'Too many requests, slow down' });
    }
    if (opts.sitePassword) {
      if (!siteLockOk(req.headers.authorization, lockUser, opts.sitePassword)) {
        // Wrong guesses are counted, so the password cannot be brute-forced.
        if (req.headers.authorization && !lockFails.allow(req.ip)) {
          return reply.header('Retry-After', '600').status(429).send('Too many wrong passwords, try again later');
        }
        return reply.header('WWW-Authenticate', 'Basic realm="Collectible Market (in development)", charset="UTF-8"').status(401).send('Password required');
      }
    }
    if (req.method === 'POST' && ['/api/auth/login', '/api/auth/register', '/api/auth/resend', '/api/auth/activate', '/api/auth/forgot', '/api/auth/reset', '/api/auth/confirm-email'].includes(path) && !logins.allow(req.ip)) {
      return reply.header('Retry-After', '600').status(429).send({ error: 'Too many sign-in attempts, try again later' });
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (!(opts.indexable && isPublicPage(req.url.split('?')[0]) && !req.url.startsWith('/?'))) reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });
}
