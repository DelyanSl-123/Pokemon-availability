import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ensureAdmin } from '../../src/auth/users';
import { openDb } from '../../src/db/connection';
import { buildServer } from '../../src/api/server';

const ADMIN = { email: 'admin@test.com', password: 'admin-password' };

async function setup() {
  const db = openDb(':memory:');
  ensureAdmin(db, ADMIN.email, ADMIN.password);
  const scheduler = { start: vi.fn(), stop: vi.fn() };
  const service = { isRunning: () => false, runAndNotify: vi.fn() };
  const defaults = { mailTo: 'me@test.com', cron: '0 9 * * *', query: 'pokemon tcg' };
  const app = await buildServer({ db, service: service as never, scheduler, defaults });
  return { app, scheduler, service };
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
      payload: { cron: '30 8 * * *', mailTo: 'other@test.com' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ mailTo: 'other@test.com', cron: '30 8 * * *', query: 'pokemon tcg' });
    expect(scheduler.start).toHaveBeenCalledWith('30 8 * * *');
  });

  it('runs a manual check', async () => {
    const { app, service } = await setup();
    service.runAndNotify.mockResolvedValue({ summary: { products: [] }, email: { sent: false } });
    const res = await app.inject({ method: 'POST', url: '/api/run', headers: await signIn(app), payload: { sendEmail: false } });
    expect(res.statusCode).toBe(200);
    expect(service.runAndNotify).toHaveBeenCalledWith('manual', { sendEmail: false });
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
    const { app, service } = await setup();
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: ' Viewer@Test.com ', password: 'viewer-password' },
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.json().user).toMatchObject({ email: 'viewer@test.com', role: 'user' });
    expect(JSON.stringify(reg.json())).not.toContain('password');
    const headers = { cookie: String(reg.headers['set-cookie']).split(';')[0] };
    expect(String(reg.headers['set-cookie'])).toContain('HttpOnly');

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
    expect(service.runAndNotify).not.toHaveBeenCalled();
  });

  it('never lets registration create or take over the admin account', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ADMIN@test.com', password: 'something-else' },
    });
    expect(res.statusCode).toBe(409);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: await signIn(app) });
    expect(me.json().user).toMatchObject({ email: ADMIN.email, role: 'admin' });
  });

  it('validates registration input', async () => {
    const { app } = await setup();
    const short = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'a@test.com', password: 'short' } });
    expect(short.statusCode).toBe(400);
    const notEmail = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'nope', password: 'long-enough' } });
    expect(notEmail.statusCode).toBe(400);
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
