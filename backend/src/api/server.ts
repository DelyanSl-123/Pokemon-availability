import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import * as cron from 'node-cron';
import { z } from 'zod';
import {
  authenticate,
  createSession,
  createUser,
  deleteSession,
  SESSION_MAX_AGE_SECONDS,
  userForSession,
  type User,
} from '../auth/users';
import type { DB } from '../db/connection';
import { createShop, deleteShop, getSettings, listProducts, listRuns, listShops, saveSettings, updateShop } from '../db/repository';
import type { Scheduler } from '../core/scheduler';
import type { Service } from '../core/service';
import { passwordProblems } from '../auth/password-rules';
import { registerBotProtection, type SecurityOptions } from './security';
import { normalizeShopInput } from '../shops/shop-urls';
import type { Settings } from '../types';

export interface ServerDeps {
  db: DB;
  service: Service;
  scheduler: Scheduler;
  defaults: Settings;
  /** Folder with the built frontend; served at / when present. */
  staticDir?: string;
  /** Mark the session cookie Secure (set when the app is served over HTTPS). */
  secureCookies?: boolean;
  /** Bot-protection limits (defaults are fine for normal use). */
  security?: SecurityOptions;
  /** Trust X-Forwarded-For (set when running behind a reverse proxy) so limits apply per real client. */
  trustProxy?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const SESSION_COOKIE = 'cm_session';
/** API paths that work without being signed in. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/me']);

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const registerSchema = credentialsSchema
  .extend({
    password: z.string().max(200),
    confirmPassword: z.string().max(200),
    firstName: z.string().trim().min(1, { message: 'Enter your first name' }).max(60),
    lastName: z.string().trim().min(1, { message: 'Enter your last name' }).max(60),
    city: z.string().trim().min(1, { message: 'Enter your city' }).max(80),
    address: z.string().trim().min(1, { message: 'Enter your address' }).max(200),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^(\+?[0-9][0-9 ()-]{5,19})?$/, { message: 'Enter a valid phone number (digits, spaces, + ( ) -)' })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'The passwords do not match' });
    }
    for (const message of passwordProblems(v.password, v.email)) ctx.addIssue({ code: 'custom', path: ['password'], message });
  });

const shopCreateSchema = z.object({
  url: z.string().min(3),
  name: z.string().optional(),
  searchUrl: z.string().optional(),
  respectRobots: z.boolean().optional(),
});

const shopPatchSchema = z.object({
  name: z.string().min(1).optional(),
  searchUrl: z.string().url({ message: 'Must be a valid URL (use {query} for search pages)' }).optional(),
  enabled: z.boolean().optional(),
  respectRobots: z.boolean().optional(),
});

const settingsSchema = z.object({
  cron: z
    .string()
    .refine((v) => cron.validate(v), { message: 'Invalid cron expression' })
    .optional(),
  query: z.string().min(2).optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: deps.trustProxy ?? false });
  registerBotProtection(app, deps.security);
  await app.register(cors, { origin: true });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const status = err.statusCode ?? 500;
    return reply.status(status).send({ error: err.message });
  });

  /* ---- authentication ---- */
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req, reply) => {
    const token = readCookie(req, SESSION_COOKIE);
    req.user = token ? userForSession(deps.db, token) : null;
    const pathOnly = req.url.split('?')[0];
    if (pathOnly.startsWith('/api/') && !PUBLIC_PATHS.has(pathOnly) && !req.user) {
      return reply.status(401).send({ error: 'Please sign in' });
    }
  });

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user?.role !== 'admin') return reply.status(403).send({ error: 'Only the admin can do this' });
  };

  const sessionCookie = (value: string, maxAge: number) =>
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
    (deps.secureCookies ? '; Secure' : '');

  const signIn = (reply: FastifyReply, user: User) =>
    reply.header('Set-Cookie', sessionCookie(createSession(deps.db, user.id), SESSION_MAX_AGE_SECONDS));

  app.post('/api/auth/register', async (req, reply) => {
    const { email, password, firstName, lastName, city, address, phone } = registerSchema.parse(req.body);
    let user: User;
    try {
      user = createUser(deps.db, email, password, { firstName, lastName, city, address, phone });
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) {
        return reply.status(409).send({ error: 'An account with this email already exists' });
      }
      throw e;
    }
    signIn(reply, user);
    return reply.status(201).send({ user });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = authenticate(deps.db, email, password);
    if (!user) return reply.status(401).send({ error: 'Wrong email or password' });
    signIn(reply, user);
    return { user };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) deleteSession(deps.db, token);
    return reply.header('Set-Cookie', sessionCookie('', 0)).status(204).send();
  });

  app.get('/api/auth/me', async (req, reply) =>
    req.user ? { user: req.user } : reply.status(401).send({ error: 'Not signed in' }),
  );

  app.get('/api/health', async () => ({ ok: true }));

  /* ---- shops ---- */
  app.get('/api/shops', async () => listShops(deps.db));

  app.post('/api/shops', { preHandler: requireAdmin }, async (req, reply) => {
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

  app.patch('/api/shops/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const shop = updateShop(deps.db, id, shopPatchSchema.parse(req.body));
    return shop ?? reply.status(404).send({ error: 'Shop not found' });
  });

  app.delete('/api/shops/:id', { preHandler: requireAdmin }, async (req, reply) => {
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

  app.post('/api/run', { preHandler: requireAdmin }, async (req, reply) => {
    if (deps.service.isRunning()) return reply.status(409).send({ error: 'A check is already running' });
    return deps.service.run('manual');
  });

  /* ---- settings ---- */
  app.get('/api/settings', { preHandler: requireAdmin }, async () => getSettings(deps.db, deps.defaults));

  app.put('/api/settings', { preHandler: requireAdmin }, async (req) => {
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
