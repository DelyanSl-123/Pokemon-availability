import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../../src/db/connection';
import { buildServer } from '../../src/api/server';
import { createRateLimiter, looksLikeBot } from '../../src/api/security';

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function setup(security = {}) {
  const service = { isRunning: () => false, run: vi.fn() };
  return buildServer({
    db: openDb(':memory:'),
    service: service as never,
    scheduler: { start: vi.fn(), stop: vi.fn() },
    defaults: { cron: '0 9 * * *', query: 'pokemon tcg' },
    mailer: { send: async () => ({ sent: true }) },
    appUrl: 'https://app.test',
    security,
  });
}

describe('looksLikeBot', () => {
  it('flags bots, scripts and missing user agents but not browsers', () => {
    for (const ua of [undefined, '', 'curl/8.5.0', 'python-requests/2.31', 'Googlebot/2.1', 'Scrapy/2.11', 'HeadlessChrome/120', 'Go-http-client/1.1']) {
      expect(looksLikeBot(ua)).toBe(true);
    }
    expect(looksLikeBot(BROWSER)).toBe(false);
    expect(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});

describe('rate limiter', () => {
  it('allows `limit` requests per window, then resets', () => {
    let t = 0;
    const rl = createRateLimiter(2, 1000, () => t);
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a'), rl.allow('b')]).toEqual([true, true, false, true]);
    t = 1001;
    expect(rl.allow('a')).toBe(true);
  });
});

describe('bot protection on the API', () => {
  it('blocks bot user agents with 403 and lets browsers through', async () => {
    const app = await setup();
    const bot = await app.inject({ method: 'GET', url: '/api/config', headers: { 'user-agent': 'curl/8.5.0' } });
    expect(bot.statusCode).toBe(403);
    const none = await app.inject({ method: 'GET', url: '/api/config', headers: { 'user-agent': '' } });
    expect(none.statusCode).toBe(403);
    const ok = await app.inject({ method: 'GET', url: '/api/config', headers: { 'user-agent': BROWSER } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['x-robots-tag']).toContain('noindex');
  });

  it('lets a hosting platform health check through without a browser user agent', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { 'user-agent': 'Render/1.0' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('rate limits requests and sign-in attempts', async () => {
    const app = await setup({ requestsPerMinute: 5, loginAttemptsPer10Min: 2 });
    const h = { 'user-agent': BROWSER };
    const login = () => app.inject({ method: 'POST', url: '/api/auth/login', headers: h, payload: { email: 'a@test.com', password: 'wrong-password' } });
    expect((await login()).statusCode).toBe(401);
    expect((await login()).statusCode).toBe(401);
    expect((await login()).statusCode).toBe(429);
    const flood = await setup({ requestsPerMinute: 3 });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await flood.inject({ method: 'GET', url: '/api/config', headers: h })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('asks for the site password when the development lock is on', async () => {
    const app = await setup({ sitePassword: 'secret-pass', siteUser: 'dev' });
    const h = { 'user-agent': BROWSER };
    const basic = (u: string, p: string) => ({ ...h, authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') });
    const none = await app.inject({ method: 'GET', url: '/', headers: h });
    expect(none.statusCode).toBe(401);
    expect(none.headers['www-authenticate']).toContain('Basic');
    expect((await app.inject({ method: 'GET', url: '/api/games', headers: basic('dev', 'wrong') })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/games', headers: basic('other', 'secret-pass') })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/games', headers: basic('dev', 'secret-pass') })).statusCode).toBe(200);
    // the hosting platform's health check must keep working
    expect((await app.inject({ method: 'GET', url: '/api/health', headers: { 'user-agent': 'Render/1.0' } })).statusCode).toBe(200);
    await app.close();
  });

  it('stops guessing the site password after ten wrong tries', async () => {
    const app = await setup({ sitePassword: 'secret-pass' });
    const bad = { 'user-agent': BROWSER, authorization: 'Basic ' + Buffer.from('admin:nope').toString('base64') };
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await app.inject({ method: 'GET', url: '/', headers: bad })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[11]).toBe(429);
    await app.close();
  });

  it('serves a robots.txt that disallows everything', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/robots.txt', headers: { 'user-agent': BROWSER } });
    expect(res.body).toContain('Disallow: /');
  });
});
