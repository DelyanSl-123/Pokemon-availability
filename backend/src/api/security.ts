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

export interface SecurityOptions {
  /** Requests per client address per minute for the whole app (default 120). */
  requestsPerMinute?: number;
  /** Sign-in / register attempts per client address per 10 minutes (default 15). */
  loginAttemptsPer10Min?: number;
  now?: () => number;
}

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

export function registerBotProtection(app: FastifyInstance, opts: SecurityOptions = {}): void {
  const general = createRateLimiter(opts.requestsPerMinute ?? 120, 60_000, opts.now);
  const logins = createRateLimiter(opts.loginAttemptsPer10Min ?? 15, 10 * 60_000, opts.now);

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/robots.txt') return reply.type('text/plain').send(ROBOTS_TXT);

    if (looksLikeBot(req.headers['user-agent'])) {
      return reply.status(403).send({ error: 'Automated access is not allowed' });
    }
    if (!general.allow(req.ip)) {
      return reply.header('Retry-After', '60').status(429).send({ error: 'Too many requests, slow down' });
    }
    if (req.method === 'POST' && ['/api/auth/login', '/api/auth/register', '/api/auth/resend', '/api/auth/activate'].includes(path) && !logins.allow(req.ip)) {
      return reply.header('Retry-After', '600').status(429).send({ error: 'Too many sign-in attempts, try again later' });
    }
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });
}
