import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TERMS_VERSION, ensureAdmin } from '../../src/auth/users';
import { openDb } from '../../src/db/connection';
import { popularProducts, upsertProduct } from '../../src/db/repository';
import { buildServer } from '../../src/api/server';
import type { Message } from '../../src/mail/mailer';
import type { Captcha } from '../../src/api/captcha';

const PROFILE = { firstName: 'Ivan', lastName: 'Petrov', city: 'Sofia', address: 'bul. Vitosha 1', acceptTerms: true };
const ADMIN = { email: 'admin@test.com', password: 'admin-password' };

async function setup(extra: { captcha?: Captcha; staticDir?: string } = {}) {
  const db = openDb(':memory:');
  ensureAdmin(db, ADMIN.email, ADMIN.password);
  const scheduler = { start: vi.fn(), stop: vi.fn() };
  const service = { isRunning: () => false, run: vi.fn() };
  const defaults = { cron: '0 9 * * *', query: 'pokemon tcg' };
  const mails: Message[] = [];
  const mailer = { send: vi.fn(async (m: Message) => (mails.push(m), { sent: true })) };
  const app = await buildServer({ db, service: service as never, scheduler, defaults, mailer, appUrl: 'https://app.test/', captcha: extra.captcha, staticDir: extra.staticDir, security: { loginAttemptsPer10Min: 1000, requestsPerMinute: 10000 } });
  return { app, scheduler, service, mails, mailer, db };
}

/** Signs in and returns the Cookie header to send with later requests. */
async function signIn(app: FastifyInstance, email = ADMIN.email, password = ADMIN.password) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return { cookie: String(res.headers['set-cookie']).split(';')[0] };
}

describe('API', () => {
  it('creates, lists, updates and deletes shops', async () => {
    const { app } = await setup();
    const headers = await signIn(app);

    const created = await app.inject({ method: 'POST', url: '/api/shops', headers, payload: { url: 'www.example.bg' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ baseUrl: 'https://www.example.bg', enabled: true });

    const duplicate = await app.inject({ method: 'POST', url: '/api/shops', headers, payload: { url: 'www.example.bg' } });
    expect(duplicate.statusCode).toBe(409);

    const list = await app.inject({ method: 'GET', url: '/api/shops', headers });
    expect(list.json()).toHaveLength(1);

    const patched = await app.inject({ method: 'PATCH', url: '/api/shops/1', headers, payload: { enabled: false } });
    expect(patched.json().enabled).toBe(false);

    const removed = await app.inject({ method: 'DELETE', url: '/api/shops/1', headers });
    expect(removed.statusCode).toBe(204);
    const missing = await app.inject({ method: 'DELETE', url: '/api/shops/1', headers });
    expect(missing.statusCode).toBe(404);
  });

  it('rejects an invalid shop search URL', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/shops',
      headers: await signIn(app),
      payload: { url: 'example.bg', searchUrl: 'not a url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates and saves settings, restarting the scheduler on a new cron', async () => {
    const { app, scheduler } = await setup();
    const headers = await signIn(app);

    const bad = await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { cron: 'not a cron' } });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { cron: '30 8 * * *' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ cron: '30 8 * * *', query: 'pokemon tcg' });
    expect(scheduler.start).toHaveBeenCalledWith('30 8 * * *');
  });

  it('runs a manual check', async () => {
    const { app, service } = await setup();
    service.run.mockResolvedValue({ products: [] });
    const res = await app.inject({ method: 'POST', url: '/api/run', headers: await signIn(app), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(service.run).toHaveBeenCalledWith('manual');
  });
});

describe('API accounts', () => {
  it('serves the report as the public home page, with the sign-in link pointing at the app', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('CollectibleMarket');
    expect(res.body).toContain('href="/app?login"');
    expect(res.body).toContain('Pokémon');
  });

  it('lets anyone read products, shops, games and runs, and requires signing in for everything else', async () => {
    const { app } = await setup();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    for (const url of ['/api/products', '/api/shops?x=1', '/api/games', '/api/runs']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/account/export' })).statusCode).toBe(401);
    // reading is public, changing is not
    expect((await app.inject({ method: 'POST', url: '/api/shops', payload: { url: 'www.example.bg' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/run' })).statusCode).toBe(401);
  });

  it('registers a regular user who can view but not manage', async () => {
    const { app, service, mails } = await setup();
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: ' Viewer@Test.com ', password: 'Sunny-Day#2024x', confirmPassword: 'Sunny-Day#2024x', ...PROFILE },
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.json()).toEqual({ email: 'viewer@test.com', emailSent: true });
    // nobody is signed in by registering: the account must be activated first
    expect(reg.headers['set-cookie']).toBeUndefined();
    const credentials = { email: 'viewer@test.com', password: 'Sunny-Day#2024x' };
    const early = await app.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
    expect(early.statusCode).toBe(403);
    expect(early.json().code).toBe('not_activated');

    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('viewer@test.com');
    const token = /\?activate=([\w-]+)/.exec(mails[0].text)![1];
    expect(mails[0].text).toContain('https://app.test/?activate=');
    expect((await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token: 'x'.repeat(43) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token } })).statusCode).toBe(400); // single use

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
    expect(login.statusCode).toBe(200);
    expect(JSON.stringify(login.json())).not.toContain('password');
    const headers = { cookie: String(login.headers['set-cookie']).split(';')[0] };
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');

    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).json().user.role).toBe('user');
    expect((await app.inject({ method: 'GET', url: '/api/products', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/shops', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/runs', headers })).statusCode).toBe(200);

    expect((await app.inject({ method: 'POST', url: '/api/shops', headers, payload: { url: 'www.x.bg' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/api/shops/1', headers, payload: { enabled: false } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: '/api/shops/1', headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/run', headers, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/settings', headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { query: 'abc' } })).statusCode).toBe(403);
    expect(service.run).not.toHaveBeenCalled();
  });

  it('resends the activation link only for accounts that are not activated', async () => {
    const { app, mails } = await setup();
    const payload = { email: 'new@test.com', password: 'Sunny-Day#2024x', confirmPassword: 'Sunny-Day#2024x', ...PROFILE };
    await app.inject({ method: 'POST', url: '/api/auth/register', payload });
    const resend = (email: string) => app.inject({ method: 'POST', url: '/api/auth/resend', payload: { email } });
    expect((await resend('new@test.com')).statusCode).toBe(200);
    expect(mails).toHaveLength(2);
    const first = /activate=([\w-]+)/.exec(mails[0].text)![1];
    const second = /activate=([\w-]+)/.exec(mails[1].text)![1];
    // the newest link replaces the older one
    expect((await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token: first } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token: second } })).statusCode).toBe(200);
    // same answer for unknown, activated and the admin accounts, and nothing is sent
    for (const email of ['nobody@test.com', 'new@test.com', ADMIN.email]) expect((await resend(email)).json()).toEqual({ ok: true });
    expect(mails).toHaveLength(2);
  });

  it('never lets registration create or take over the admin account', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ADMIN@test.com', password: 'Something-Else#9', confirmPassword: 'Something-Else#9', ...PROFILE },
    });
    expect(res.statusCode).toBe(409);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: await signIn(app) });
    expect(me.json().user).toMatchObject({ email: ADMIN.email, role: 'admin' });
  });

  it('validates registration input', async () => {
    const { app, mails } = await setup();
    const reg = (payload: object) => app.inject({ method: 'POST', url: '/api/auth/register', payload });
    const good = { email: 'a@test.com', password: 'Str0ng-Passw0rd!', confirmPassword: 'Str0ng-Passw0rd!', ...PROFILE };
    expect((await reg({ ...good, email: 'nope' })).statusCode).toBe(400);
    for (const password of ['Sh0rt!a', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoDigitsHere!!', 'NoSpecial1234x', 'Has Space-1234x']) {
      expect((await reg({ ...good, password, confirmPassword: password })).statusCode, password).toBe(400);
    }
    expect((await reg({ ...good, acceptTerms: false })).statusCode).toBe(400);
    const { acceptTerms: _omit, ...withoutTerms } = good;
    expect((await reg(withoutTerms)).statusCode).toBe(400);
    const mismatch = await reg({ ...good, confirmPassword: 'Str0ng-Passw0rd?' });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error).toContain('do not match');
    expect((await reg({ email: good.email, password: good.password })).statusCode).toBe(400);
    for (const missing of ['firstName', 'lastName', 'city', 'address']) {
      expect((await reg({ ...good, [missing]: '  ' })).statusCode, missing).toBe(400);
    }
    expect((await reg({ ...good, phone: 'abc' })).statusCode).toBe(400);
    // the saved details come back once the account is activated and signed in
    const signInAfterActivation = async (email: string) => {
      const token = /activate=([\w-]+)/.exec([...mails].reverse().find((m) => m.to === email)!.text)![1];
      await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token } });
      return (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: good.password } })).json().user;
    };
    expect((await reg({ ...good, phone: '+359 88 123 4567' })).statusCode).toBe(201);
    expect(await signInAfterActivation('a@test.com')).toMatchObject({ firstName: 'Ivan', lastName: 'Petrov', city: 'Sofia', address: 'bul. Vitosha 1', phone: '+359 88 123 4567' });
    expect((await reg({ ...good, email: 'b@test.com' })).statusCode).toBe(201);
    expect((await signInAfterActivation('b@test.com')).phone).toBeNull();
  });

  it('rejects a wrong password and ends the session on logout', async () => {
    const { app } = await setup();
    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: 'nope' } });
    expect(wrong.statusCode).toBe(401);

    const headers = await signIn(app);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode).toBe(401);
  });

  describe('accounts', () => {
    const PASSWORD = 'Sunny-Day#2024x';
    const token = (m: Message, key: string) => new RegExp(`${key}=([\\w-]+)`).exec(m.text)![1];

    async function member(app: FastifyInstance, mails: Message[], email = 'ivan@test.com') {
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: PASSWORD, confirmPassword: PASSWORD, ...PROFILE } });
      const mail = [...mails].reverse().find((m) => m.to === email)!;
      await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token: token(mail, 'activate') } });
      return signIn(app, email, PASSWORD);
    }

    it('resets a forgotten password with a single-use link and signs the person out everywhere', async () => {
      const { app, mails } = await setup();
      const headers = await member(app, mails);
      const forgot = (email: string) => app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email } });
      expect((await forgot('nobody@test.com')).json()).toEqual({ ok: true });
      expect(mails.filter((m) => m.subject.includes('Reset'))).toHaveLength(0);
      expect((await forgot('IVAN@test.com')).json()).toEqual({ ok: true });
      const mail = mails.find((m) => m.subject.includes('Reset'))!;
      expect(mail.text).toContain('https://app.test/?reset=');
      const reset = (body: object) => app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token: token(mail, 'reset'), ...body } });

      expect((await reset({ password: 'weak', confirmPassword: 'weak' })).statusCode).toBe(400);
      expect((await reset({ password: 'New-Passw0rd!x', confirmPassword: 'New-Passw0rd?x' })).statusCode).toBe(400);
      expect((await reset({ password: 'New-Passw0rd!x', confirmPassword: 'New-Passw0rd!x' })).statusCode).toBe(200);
      expect((await reset({ password: 'Other-Passw0rd!x', confirmPassword: 'Other-Passw0rd!x' })).statusCode).toBe(400); // used up

      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode).toBe(401); // old session ended
      const old = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ivan@test.com', password: PASSWORD } });
      expect(old.statusCode).toBe(401);
      await signIn(app, 'ivan@test.com', 'New-Passw0rd!x');
    });

    it('locks an account for a while after 5 wrong passwords', async () => {
      const { app } = await setup();
      const wrong = () => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: 'wrong-password' } });
      for (let i = 0; i < 5; i++) expect((await wrong()).statusCode).toBe(401);
      expect((await wrong()).statusCode).toBe(429);
      // even the right password is refused while locked
      const right = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: ADMIN.password } });
      expect(right.statusCode).toBe(429);
    });

    it('lets a member edit the profile, change the password and export the data', async () => {
      const { app, mails } = await setup();
      const headers = await member(app, mails);
      const patch = await app.inject({ method: 'PATCH', url: '/api/account', headers, payload: { firstName: 'Georgi', lastName: 'Ivanov', city: 'Varna', address: 'ul. Morska 5', phone: '' } });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().user).toMatchObject({ firstName: 'Georgi', city: 'Varna', phone: null });
      expect((await app.inject({ method: 'PATCH', url: '/api/account', headers, payload: { firstName: '', lastName: 'x', city: 'x', address: 'x' } })).statusCode).toBe(400);

      const change = (body: object) => app.inject({ method: 'POST', url: '/api/account/password', headers, payload: body });
      expect((await change({ currentPassword: 'nope', newPassword: 'New-Passw0rd!x', confirmPassword: 'New-Passw0rd!x' })).statusCode).toBe(403);
      expect((await change({ currentPassword: PASSWORD, newPassword: 'weak', confirmPassword: 'weak' })).statusCode).toBe(400);
      expect((await change({ currentPassword: PASSWORD, newPassword: 'New-Passw0rd!x', confirmPassword: 'New-Passw0rd!x' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode).toBe(200); // this session stays
      await signIn(app, 'ivan@test.com', 'New-Passw0rd!x');

      const exp = await app.inject({ method: 'GET', url: '/api/account/export', headers });
      expect(exp.headers['content-disposition']).toContain('attachment');
      expect(exp.json().account).toMatchObject({ email: 'ivan@test.com', firstName: 'Georgi', city: 'Varna' });
      expect(JSON.stringify(exp.json())).not.toMatch(/hash|Passw0rd/);
    });

    it('changes the e-mail only after the link sent to the new address is opened', async () => {
      const { app, mails } = await setup();
      const headers = await member(app, mails);
      const start = (body: object) => app.inject({ method: 'POST', url: '/api/account/email', headers, payload: body });
      expect((await start({ newEmail: 'new@test.com', password: 'wrong' })).statusCode).toBe(403);
      expect((await start({ newEmail: ADMIN.email, password: PASSWORD })).statusCode).toBe(409);
      expect((await start({ newEmail: 'New@Test.com', password: PASSWORD })).json()).toEqual({ emailSent: true });
      const mail = mails[mails.length - 1];
      expect(mail.to).toBe('New@Test.com');
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).json().user.email).toBe('ivan@test.com');
      const confirm = () => app.inject({ method: 'POST', url: '/api/auth/confirm-email', payload: { token: token(mail, 'confirm-email') } });
      expect((await confirm()).statusCode).toBe(200);
      expect((await confirm()).statusCode).toBe(400);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).json().user.email).toBe('new@test.com');
    });

    it('deletes an account after the password is confirmed, but never the admin', async () => {
      const { app, mails } = await setup();
      const headers = await member(app, mails);
      expect((await app.inject({ method: 'DELETE', url: '/api/account', headers, payload: { password: 'wrong' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'DELETE', url: '/api/account', headers, payload: { password: PASSWORD } })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ivan@test.com', password: PASSWORD } })).statusCode).toBe(401);
      const admin = await signIn(app);
      expect((await app.inject({ method: 'DELETE', url: '/api/account', headers: admin, payload: { password: ADMIN.password } })).statusCode).toBe(403);
    });

    it('ignores honeypot registrations and requires the CAPTCHA when one is configured', async () => {
      const verify = vi.fn(async (t: string | undefined) => t === 'good');
      const { app, mails } = await setup({ captcha: { siteKey: 'site-key', verify } });
      expect((await app.inject({ method: 'GET', url: '/api/config' })).json()).toEqual({ turnstileSiteKey: 'site-key', termsVersion: TERMS_VERSION });
      const body = { email: 'bot@test.com', password: PASSWORD, confirmPassword: PASSWORD, ...PROFILE };
      const reg = (extra: object) => app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...body, ...extra } });
      expect((await reg({})).statusCode).toBe(400);
      expect((await reg({ captchaToken: 'bad' })).statusCode).toBe(400);
      expect(mails).toHaveLength(0);
      const trap = await reg({ website: 'http://spam.example' });
      expect(trap.statusCode).toBe(201); // looks like success to the bot...
      expect(mails).toHaveLength(0); // ...but nothing was created or sent
      expect((await reg({ captchaToken: 'good' })).statusCode).toBe(201);
      expect(mails).toHaveLength(1);
      expect((await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'x@test.com' } })).statusCode).toBe(400);
    });

    it('removes registrations that were never activated', async () => {
      const { app, mails, db } = await setup();
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'old@test.com', password: PASSWORD, confirmPassword: PASSWORD, ...PROFILE } });
      const again = () => app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'old@test.com', password: PASSWORD, confirmPassword: PASSWORD, ...PROFILE } });
      expect((await again()).statusCode).toBe(409);
      db.prepare(`UPDATE users SET created_at = datetime('now', '-25 hours') WHERE email = 'old@test.com'`).run();
      expect((await again()).statusCode).toBe(201); // the stale, never-activated one was purged
      expect(mails).toHaveLength(2);
    });
  });

  describe('games menu', () => {
    it('lists the built-in games to everyone and lets only the admin add, change and delete games', async () => {
      const { app, mails } = await setup();
      const admin = await signIn(app);
      const list = await app.inject({ method: 'GET', url: '/api/games', headers: admin });
      expect(list.json().map((g: { slug: string }) => g.slug)).toEqual(['pokemon', 'onepiece', 'yugioh', 'mtg']);
      expect((await app.inject({ method: 'GET', url: '/api/games' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/games', payload: { name: 'Nope' } })).statusCode).toBe(401);

      const created = await app.inject({ method: 'POST', url: '/api/games', headers: admin, payload: { name: 'Dragon Ball', keywords: 'dragon ball, dbs' } });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ slug: 'dragon-ball', name: 'Dragon Ball', keywords: 'dragon ball, dbs', query: 'Dragon Ball', builtin: false, enabled: true });
      expect((await app.inject({ method: 'POST', url: '/api/games', headers: admin, payload: { name: 'dragon ball' } })).statusCode).toBe(409);
      expect((await app.inject({ method: 'POST', url: '/api/games', headers: admin, payload: { name: '!!' } })).statusCode).toBe(400);

      // a shop page can be added for the new game, but not for an unknown one
      const shop = (game: string) => app.inject({ method: 'POST', url: '/api/shops', headers: admin, payload: { url: 'shop.test', searchUrl: 'https://shop.test/db', game } });
      expect((await shop('nope')).statusCode).toBe(400);
      const added = await shop('dragon-ball');
      expect(added.statusCode).toBe(201);
      expect(added.json().game).toBe('dragon-ball');
      expect((await shop('dragon-ball')).statusCode).toBe(409);
      expect((await shop('mtg')).statusCode).toBe(201); // same address, other game

      expect((await app.inject({ method: 'PATCH', url: '/api/games/yugioh', headers: admin, payload: { enabled: false } })).json().enabled).toBe(false);
      expect((await app.inject({ method: 'DELETE', url: '/api/games/pokemon', headers: admin })).statusCode).toBe(400);
      expect((await app.inject({ method: 'DELETE', url: '/api/games/dragon-ball', headers: admin })).statusCode).toBe(204);
      expect((await app.inject({ method: 'DELETE', url: '/api/games/dragon-ball', headers: admin })).statusCode).toBe(404);
      const shops = (await app.inject({ method: 'GET', url: '/api/shops', headers: admin })).json();
      expect(shops.map((s: { game: string }) => s.game)).toEqual(['mtg']); // the deleted game's page went with it

      // a regular member can read but not change the menu
      const reg = { email: 'member@test.com', password: 'Sunny-Day#2024x', confirmPassword: 'Sunny-Day#2024x', ...PROFILE };
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: reg });
      const token = /activate=([\w-]+)/.exec(mails[mails.length - 1].text)![1];
      await app.inject({ method: 'POST', url: '/api/auth/activate', payload: { token } });
      const member = await signIn(app, 'member@test.com', reg.password);
      expect((await app.inject({ method: 'GET', url: '/api/games', headers: member })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/games', headers: member, payload: { name: 'Digimon' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PATCH', url: '/api/games/mtg', headers: member, payload: { enabled: false } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'DELETE', url: '/api/games/mtg', headers: member })).statusCode).toBe(403);
    });
  });

  describe('shop suggestions', () => {
    it('accepts a suggestion from anyone, stores it and shows it only to the admin', async () => {
      const { app } = await setup();
      const sent = await app.inject({ method: 'POST', url: '/api/suggestions', payload: { url: 'newshop.bg', note: 'Sells One Piece' } });
      expect(sent.statusCode).toBe(201);

      expect((await app.inject({ method: 'GET', url: '/api/suggestions' })).statusCode).toBe(403);
      const headers = await signIn(app);
      const list = await app.inject({ method: 'GET', url: '/api/suggestions', headers });
      expect(list.json()).toMatchObject([{ url: 'https://newshop.bg', note: 'Sells One Piece' }]);

      const id = list.json()[0].id;
      expect((await app.inject({ method: 'DELETE', url: `/api/suggestions/${id}`, headers })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/suggestions', headers })).json()).toEqual([]);
    });

    it('rejects something that is not a shop address and ignores bots that fill the hidden field', async () => {
      const { app } = await setup();
      expect((await app.inject({ method: 'POST', url: '/api/suggestions', payload: { url: 'not a shop' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/suggestions', payload: { url: 'spam.bg', website: 'x' } })).statusCode).toBe(201);
      const headers = await signIn(app);
      expect((await app.inject({ method: 'GET', url: '/api/suggestions', headers })).json()).toEqual([]);
    });
  });

  describe('price history', () => {
    it('returns the recorded prices of a product by its link, one per day, to anyone', async () => {
      const { app, db } = await setup();
      const headers = await signIn(app);
      const shop = (await app.inject({ method: 'POST', url: '/api/shops', headers, payload: { url: 'www.example.bg' } })).json();
      const product = { url: 'https://www.example.bg/p/1', title: 'Booster Box', price: 100, currency: 'EUR', inStock: true, imageUrl: null };
      upsertProduct(db, shop.id, product, '2026-11-01T09:00:00.000Z');
      upsertProduct(db, shop.id, { ...product, price: 95 }, '2026-11-02T09:00:00.000Z');
      upsertProduct(db, shop.id, { ...product, price: 90, inStock: false }, '2026-11-02T15:00:00.000Z');

      const res = await app.inject({ method: 'GET', url: `/api/price-history?url=${encodeURIComponent(product.url)}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        currency: 'EUR',
        points: [
          { day: '2026-11-01', price: 100, inStock: true },
          { day: '2026-11-02', price: 90, inStock: false },
        ],
      });
      const none = await app.inject({ method: 'GET', url: '/api/price-history?url=https%3A%2F%2Fnope.bg%2Fx' });
      expect(none.json()).toEqual({ currency: null, points: [] });
    });
  });

  describe('favourites', () => {
    const item = { url: 'https://www.example.bg/p/1', title: 'Booster Box', shop: 'example.bg', game: 'pokemon', price: 100, currency: 'EUR', image: '' };

    it('needs a signed-in visitor', async () => {
      const { app } = await setup();
      expect((await app.inject({ method: 'GET', url: '/api/favorites' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/favorites', payload: { items: [item] } })).statusCode).toBe(401);
    });

    it('adds (once), lists with the latest price and removes', async () => {
      const { app, db } = await setup();
      const headers = await signIn(app);
      const other = { ...item, url: 'https://www.example.bg/p/2', title: 'Tin' };
      const added = await app.inject({ method: 'POST', url: '/api/favorites', headers, payload: { items: [item, other, item] } });
      expect(added.statusCode).toBe(200);
      expect(added.json()).toHaveLength(2);
      expect(added.json().find((f: { url: string }) => f.url === item.url)).toMatchObject({ price: 100, tracked: false, inStock: null });

      // once the product is checked, the favourite shows its current price and stock
      const shop = (await app.inject({ method: 'POST', url: '/api/shops', headers, payload: { url: 'www.example.bg' } })).json();
      upsertProduct(db, shop.id, { url: item.url, title: 'Booster Box', price: 89, currency: 'EUR', inStock: true, imageUrl: null }, '2026-11-02T09:00:00.000Z');
      const list = (await app.inject({ method: 'GET', url: '/api/favorites', headers })).json();
      expect(list.find((f: { url: string }) => f.url === item.url)).toMatchObject({ price: 89, tracked: true, inStock: true });

      await app.inject({ method: 'DELETE', url: `/api/favorites?url=${encodeURIComponent(item.url)}`, headers });
      expect((await app.inject({ method: 'GET', url: '/api/favorites', headers })).json()).toHaveLength(1);
    });

    it('rejects links that are not web addresses', async () => {
      const { app } = await setup();
      const headers = await signIn(app);
      const res = await app.inject({ method: 'POST', url: '/api/favorites', headers, payload: { items: [{ ...item, url: 'javascript:alert(1)' }] } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('home page and app', () => {
    it('shows the home page for links with tracking parameters, the app only for e-mail links', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-static-'));
      fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>APP</title>');
      const { app } = await setup({ staticDir: dir });
      const home = await app.inject({ method: 'GET', url: '/?fbclid=abc&utm_source=facebook' });
      expect(home.statusCode).toBe(200);
      expect(home.body).not.toContain('<title>APP</title>');
      expect(home.body).toContain('id="list-view"');
      for (const q of ['activate=x', 'reset=x', 'confirm-email=x']) {
        expect((await app.inject({ method: 'GET', url: `/?${q}` })).body).toContain('<title>APP</title>');
      }
    });

    it('does not show internal error details to the visitor', async () => {
      const { app, db } = await setup();
      const headers = await signIn(app);
      db.exec('DROP TABLE favorites');
      const res = await app.inject({ method: 'GET', url: '/api/favorites', headers });
      expect(res.statusCode).toBe(500);
      expect(res.json().error).not.toMatch(/favorites|SQLITE|no such table/i);
      expect(res.json().error).toContain('Something went wrong');
    });

    it('is not open to other websites (no CORS headers)', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/games', headers: { origin: 'https://evil.example' } });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('accepting changed Terms', () => {
    it('shows the window on the home page until the current version is accepted', async () => {
      const { app, db } = await setup();
      const headers = await signIn(app);
      // the admin account was made without accepting the Terms
      expect((await app.inject({ method: 'GET', url: '/', headers })).body).toContain('id="terms-dlg"');
      expect((await app.inject({ method: 'GET', url: '/api/config' })).json().termsVersion).toBe(TERMS_VERSION);

      const old = await app.inject({ method: 'POST', url: '/api/account/accept-terms', headers, payload: { version: '0.1' } });
      expect(old.statusCode).toBe(409);
      const ok = await app.inject({ method: 'POST', url: '/api/account/accept-terms', headers, payload: { version: TERMS_VERSION } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().user.termsVersion).toBe(TERMS_VERSION);
      expect((await app.inject({ method: 'GET', url: '/', headers })).body).not.toContain('id="terms-dlg"');

      // an older accepted version asks again
      db.prepare("UPDATE users SET terms_version = '0.9'").run();
      expect((await app.inject({ method: 'GET', url: '/', headers })).body).toContain('Our Terms have changed');
      expect((await app.inject({ method: 'POST', url: '/api/account/accept-terms', payload: { version: TERMS_VERSION } })).statusCode).toBe(401);
    });
  });

  describe('popular products', () => {
    it('counts openings of tracked products only and ranks them with favourites', async () => {
      const { app, db } = await setup();
      const headers = await signIn(app);
      const shop = (await app.inject({ method: 'POST', url: '/api/shops', headers, payload: { url: 'www.example.bg' } })).json();
      const make = (n: number) => ({ url: `https://www.example.bg/p/${n}`, title: `P${n}`, price: 10, currency: 'EUR', inStock: true, imageUrl: null });
      for (const n of [1, 2, 3]) upsertProduct(db, shop.id, make(n), new Date().toISOString());

      const click = (url: string, asText = false) =>
        app.inject({
          method: 'POST',
          url: '/api/clicks',
          headers: asText ? { 'content-type': 'text/plain' } : {},
          payload: asText ? JSON.stringify({ url }) : { url },
        });
      expect((await click(make(2).url)).statusCode).toBe(204);
      expect((await click(make(2).url, true)).statusCode).toBe(204); // as navigator.sendBeacon sends it
      expect((await click('https://unknown.bg/x')).statusCode).toBe(204);
      expect((await click('not a link')).statusCode).toBe(400);
      await app.inject({ method: 'POST', url: '/api/favorites', headers, payload: { items: [{ url: make(3).url, title: 'P3' }] } });

      expect(popularProducts(db)).toEqual({ pokemon: [make(3).url, make(2).url] });
      expect(db.prepare('SELECT COUNT(*) AS n FROM product_clicks').get()).toEqual({ n: 1 });
    });
  });

  describe('session expiry', () => {
    it('extends the sign-in cookie to 30 minutes on every request and clears an unknown one', async () => {
      const { app } = await setup();
      const headers = await signIn(app);
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
      expect(res.statusCode).toBe(200);
      expect(String(res.headers['set-cookie'])).toContain('Max-Age=1800');
      const gone = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: 'cm_session=not-a-session' } });
      expect(gone.statusCode).toBe(401);
      expect(String(gone.headers['set-cookie'])).toContain('Max-Age=0');
    });
  });

  describe('game pages', () => {
    it('opens /games/<slug> with that game selected, also without search-engine mode', async () => {
      const { app } = await setup();
      const page = await app.inject({ method: 'GET', url: '/games/onepiece' });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('var game = "onepiece";');
      expect(page.body).toContain('<title>One Piece · CollectibleMarket</title>');
      expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('var game = "";');
      expect((await app.inject({ method: 'GET', url: '/games/no-such-game' })).statusCode).toBe(404);
    });
  });
});
