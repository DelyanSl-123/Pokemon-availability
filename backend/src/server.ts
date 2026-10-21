import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import * as cron from 'node-cron';
import { z } from 'zod';
import type { DB } from './db';
import { createShop, deleteShop, getSettings, listProducts, listRuns, listShops, saveSettings, updateShop } from './repo';
import type { Scheduler } from './scheduler';
import type { Service } from './service';
import { normalizeShopInput } from './shops';
import type { Settings } from './types';

export interface ServerDeps {
  db: DB;
  service: Service;
  scheduler: Scheduler;
  defaults: Settings;
  /** Folder with the built frontend; served at / when present. */
  staticDir?: string;
}

const shopCreateSchema = z.object({
  url: z.string().min(3),
  name: z.string().optional(),
  searchUrl: z.string().optional(),
  respectRobots: z.boolean().optional(),
});

const shopPatchSchema = z.object({
  name: z.string().min(1).optional(),
  searchUrl: z.string().includes('{query}', { message: 'Must contain {query}' }).optional(),
  enabled: z.boolean().optional(),
  respectRobots: z.boolean().optional(),
});

const settingsSchema = z.object({
  mailTo: z.string().email().optional(),
  cron: z
    .string()
    .refine((v) => cron.validate(v), { message: 'Invalid cron expression' })
    .optional(),
  query: z.string().min(2).optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const status = err.statusCode ?? 500;
    return reply.status(status).send({ error: err.message });
  });

  app.get('/api/health', async () => ({ ok: true }));

  /* ---- shops ---- */
  app.get('/api/shops', async () => listShops(deps.db));

  app.post('/api/shops', async (req, reply) => {
    const body = shopCreateSchema.parse(req.body);
    let normalized;
    try {
      normalized = normalizeShopInput(body);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : 'Invalid shop' });
    }
    try {
      const shop = createShop(deps.db, { ...normalized, respectRobots: body.respectRobots });
      return reply.status(201).send(shop);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) {
        return reply.status(409).send({ error: 'This shop is already in the list' });
      }
      throw e;
    }
  });

  app.patch('/api/shops/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const shop = updateShop(deps.db, id, shopPatchSchema.parse(req.body));
    return shop ?? reply.status(404).send({ error: 'Shop not found' });
  });

  app.delete('/api/shops/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    return deleteShop(deps.db, id) ? reply.status(204).send() : reply.status(404).send({ error: 'Shop not found' });
  });

  /* ---- products & runs ---- */
  app.get('/api/products', async (req) => {
    const q = z
      .object({
        shopId: z.coerce.number().int().optional(),
        inStock: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    return listProducts(deps.db, { shopId: q.shopId, inStockOnly: q.inStock === 'true' });
  });

  app.get('/api/runs', async () => listRuns(deps.db, 20));

  app.post('/api/run', async (req, reply) => {
    const body = z.object({ sendEmail: z.boolean().optional() }).parse(req.body ?? {});
    if (deps.service.isRunning()) return reply.status(409).send({ error: 'A check is already running' });
    return deps.service.runAndNotify('manual', { sendEmail: body.sendEmail });
  });

  /* ---- settings ---- */
  app.get('/api/settings', async () => getSettings(deps.db, deps.defaults));

  app.put('/api/settings', async (req) => {
    const patch = settingsSchema.parse(req.body);
    saveSettings(deps.db, patch);
    const settings = getSettings(deps.db, deps.defaults);
    if (patch.cron) deps.scheduler.start(settings.cron);
    return settings;
  });

  /* ---- built frontend (optional) ---- */
  if (deps.staticDir) {
    await app.register(fastifyStatic, { root: deps.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
