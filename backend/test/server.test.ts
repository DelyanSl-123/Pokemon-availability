import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db';
import { buildServer } from '../src/server';

async function setup() {
  const db = openDb(':memory:');
  const scheduler = { start: vi.fn(), stop: vi.fn() };
  const service = { isRunning: () => false, runAndNotify: vi.fn() };
  const defaults = { mailTo: 'me@test.com', cron: '0 9 * * *', query: 'pokemon tcg' };
  const app = await buildServer({ db, service: service as never, scheduler, defaults });
  return { app, scheduler, service };
}

describe('API', () => {
  it('creates, lists, updates and deletes shops', async () => {
    const { app } = await setup();

    const created = await app.inject({ method: 'POST', url: '/api/shops', payload: { url: 'www.example.bg' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ baseUrl: 'https://www.example.bg', enabled: true });

    const duplicate = await app.inject({ method: 'POST', url: '/api/shops', payload: { url: 'www.example.bg' } });
    expect(duplicate.statusCode).toBe(409);

    const list = await app.inject({ method: 'GET', url: '/api/shops' });
    expect(list.json()).toHaveLength(1);

    const patched = await app.inject({ method: 'PATCH', url: '/api/shops/1', payload: { enabled: false } });
    expect(patched.json().enabled).toBe(false);

    const removed = await app.inject({ method: 'DELETE', url: '/api/shops/1' });
    expect(removed.statusCode).toBe(204);
    const missing = await app.inject({ method: 'DELETE', url: '/api/shops/1' });
    expect(missing.statusCode).toBe(404);
  });

  it('rejects an invalid shop search URL', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/shops',
      payload: { url: 'example.bg', searchUrl: 'https://example.bg/search' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates and saves settings, restarting the scheduler on a new cron', async () => {
    const { app, scheduler } = await setup();

    const bad = await app.inject({ method: 'PUT', url: '/api/settings', payload: { cron: 'not a cron' } });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { cron: '30 8 * * *', mailTo: 'other@test.com' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ mailTo: 'other@test.com', cron: '30 8 * * *', query: 'pokemon tcg' });
    expect(scheduler.start).toHaveBeenCalledWith('30 8 * * *');
  });

  it('runs a manual check', async () => {
    const { app, service } = await setup();
    service.runAndNotify.mockResolvedValue({ summary: { products: [] }, email: { sent: false } });
    const res = await app.inject({ method: 'POST', url: '/api/run', payload: { sendEmail: false } });
    expect(res.statusCode).toBe(200);
    expect(service.runAndNotify).toHaveBeenCalledWith('manual', { sendEmail: false });
  });
});
