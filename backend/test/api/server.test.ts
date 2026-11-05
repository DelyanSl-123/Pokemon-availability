import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ensureAdmin } from '../../src/auth/users';
import { openDb } from '../../src/db/connection';
import { buildServer } from '../../src/api/server';
import type { Message } from '../../src/mail/mailer';

const PROFILE = { firstName: 'Ivan', lastName: 'Petrov', city: 'Sofia', address: 'bul. Vitosha 1', acceptTerms: true };
const ADMIN = { email: 'admin@test.com', password: 'admin-password' };

async function setup() {
  const db = openDb(':memory:');
  ensureAdmin(db, ADMIN.email, ADMIN.password);
  const scheduler = { start: vi.fn(), stop: vi.fn() };
  const service = { isRunning: () => false, run: vi.fn() };
  const defaults = { cron: '0 9 * * *', query: 'pokemon tcg' };
  const mails: Message[] = [];
  const mailer = { send: vi.fn(async (m: Message) => (mails.push(m), { sent: true })) };
  const app = await buildServer({ db, service: service as never, scheduler, defaults, mailer, appUrl: 'https://app.test/', security: { loginAttemptsPer10Min: 1000, requestsPerMinute: 10000 } });
  return { app, scheduler, service, mails, mailer };
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
  it('requires signing in for everything except health and auth', async () => {
    const { app } = await setup();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/products' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/shops?x=1' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
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
    const { app } = await setup();
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
    const ok = await reg({ ...good, phone: '+359 88 123 4567' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().user).toMatchObject({ firstName: 'Ivan', lastName: 'Petrov', city: 'Sofia', address: 'bul. Vitosha 1', phone: '+359 88 123 4567' });
    const noPhone = await reg({ ...good, email: 'b@test.com' });
    expect(noPhone.statusCode).toBe(201);
    expect(noPhone.json().user.phone).toBeNull();
  });

  it('rejects a wrong password and ends the session on logout', async () => {
    const { app } = await setup();
    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: 'nope' } });
    expect(wrong.statusCode).toBe(401);

    const headers = await signIn(app);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await app.inject({ method: 'GET', url: '/api/products', headers })).statusCode).toBe(401);
  });
});
