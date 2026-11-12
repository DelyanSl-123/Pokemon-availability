import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import * as cron from 'node-cron';
import { z } from 'zod';
import {
  ACTIVATION_HOURS,
  EMAIL_CHANGE_HOURS,
  RESET_HOURS,
  activateWithToken,
  authenticate,
  changePassword,
  confirmEmailChange,
  createActivationToken,
  createEmailChange,
  createPasswordReset,
  deleteAccount,
  findUserByEmail,
  purgeUnactivated,
  resetPassword,
  updateProfile,
  userForPasswordReset,
  verifyUserPassword,
  createSession,
  createUser,
  deleteSession,
  SESSION_MAX_AGE_SECONDS,
  userForSession,
  type User,
} from '../auth/users';
import type { DB } from '../db/connection';
import {
  createGame,
  createShop,
  deleteGame,
  deleteShop,
  getGame,
  getSettings,
  listGames,
  listProducts,
  listRuns,
  priceHistory,
  addShopSuggestion,
  listShopSuggestions,
  deleteShopSuggestion,
  listShops,
  saveSettings,
  updateGame,
  updateShop,
} from '../db/repository';
import { slugify } from '../shops/games';
import type { Scheduler } from '../core/scheduler';
import type { Service } from '../core/service';
import { buildActivationEmail, buildEmailChangeEmail, buildPasswordResetEmail, buildShopSuggestionEmail, type Mailer } from '../mail/mailer';
import { passwordProblems } from '../auth/password-rules';
import type { Captcha } from './captcha';
import { createLockout, registerBotProtection, type SecurityOptions } from './security';
import { normalizeShopInput } from '../shops/shop-urls';
import { buildReportHtml } from '../report/html';
import type { ManualShop } from '../shops/sync';
import type { RunSummary, Settings } from '../types';

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
  /** Sends the activation e-mail. */
  mailer: Mailer;
  /** Optional Turnstile CAPTCHA for register / forgot-password / resend. */
  captcha?: Captcha;
  /** Public address of the web app, used in the activation link (no trailing slash). */
  appUrl: string;
  /** Set when the site is public and may be indexed by search engines (its https address). */
  siteUrl?: string;
  /** Where to send a note when a visitor suggests a shop (the admin's address). */
  notifyEmail?: string;
  /** Shops that are only linked, never fetched; listed on the home page. */
  manualShops?: () => ManualShop[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const SESSION_COOKIE = 'cm_session';
/** API paths that work without being signed in. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/auth/activate', '/api/auth/resend', '/api/auth/forgot', '/api/auth/reset', '/api/auth/confirm-email', '/api/config', '/api/suggestions']);

/** Read-only data that anyone may look at without signing in: the home page of the site. */
const PUBLIC_GET_PATHS = new Set(['/api/shops', '/api/games', '/api/products', '/api/runs', '/api/price-history']);

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

const PHONE_RE = /^(\+?[0-9][0-9 ()-]{5,19})?$/;
const PHONE_MESSAGE = 'Enter a valid phone number (digits, spaces, + ( ) -)';

const suggestionSchema = z.object({
  url: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .refine(
      (v) => {
        try {
          return /^https?:$/.test(new URL(v).protocol) && new URL(v).hostname.includes('.');
        } catch {
          return false;
        }
      },
      { message: 'Enter the address of the shop, for example shop.bg' },
    ),
  note: z.string().trim().max(500).optional(),
  /** Hidden "honeypot" field: people never see it, simple bots fill it in. */
  website: z.string().max(200).optional(),
});

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const registerSchema = credentialsSchema
  .extend({
    password: z.string().max(200),
    confirmPassword: z.string().max(200),
    captchaToken: z.string().max(4000).optional(),
    /** Hidden "honeypot" field: people never see it, simple bots fill it in. */
    website: z.string().max(200).optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must agree to the Terms and Conditions' }) }),
    firstName: z.string().trim().min(1, { message: 'Enter your first name' }).max(60),
    lastName: z.string().trim().min(1, { message: 'Enter your last name' }).max(60),
    city: z.string().trim().min(1, { message: 'Enter your city' }).max(80),
    address: z.string().trim().min(1, { message: 'Enter your address' }).max(200),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(PHONE_RE, { message: PHONE_MESSAGE })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'The passwords do not match' });
    }
    for (const message of passwordProblems(v.password, v.email)) ctx.addIssue({ code: 'custom', path: ['password'], message });
  });

const emailOnlySchema = z.object({ email: z.string().trim().email(), captchaToken: z.string().max(4000).optional() });

const gameCreateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  /** Comma-separated words that mark a product of this game. Defaults to the name. */
  keywords: z.string().trim().max(300).optional(),
  query: z.string().trim().max(80).optional(),
});

const gamePatchSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  keywords: z.string().trim().min(2).max(300).optional(),
  query: z.string().trim().min(2).max(80).optional(),
  enabled: z.boolean().optional(),
});

const shopCreateSchema = z.object({
  url: z.string().min(3),
  game: z.string().max(40).optional(),
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
    const publicRead = req.method === 'GET' && PUBLIC_GET_PATHS.has(pathOnly);
    if (pathOnly.startsWith('/api/') && !PUBLIC_PATHS.has(pathOnly) && !publicRead && !req.user) {
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
    const { email, password, firstName, lastName, city, address, phone, captchaToken, website } = registerSchema.parse(req.body);
    if (website) return reply.status(201).send({ email, emailSent: true }); // honeypot: pretend it worked
    if (!(await captchaOk(captchaToken, req.ip))) return reply.status(400).send({ error: CAPTCHA_MESSAGE });
    purgeUnactivated(deps.db);
    let user: User;
    try {
      user = createUser(deps.db, email, password, { firstName, lastName, city, address, phone, termsAcceptedAt: new Date().toISOString() });
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) {
        return reply.status(409).send({
          error: 'An account with this email already exists. If it is yours and was not activated yet, use "Send the link again" on the sign-in page.',
        });
      }
      throw e;
    }
    // The account stays inactive (and nobody is signed in) until the e-mail link is opened.
    const emailSent = await sendActivation(user.email, user.firstName, user.id);
    return reply.status(201).send({ email: user.email, emailSent });
  });

  const CAPTCHA_MESSAGE = 'Please complete the CAPTCHA check';
  const captchaOk = async (token: string | undefined, ip: string) => !deps.captcha || (await deps.captcha.verify(token, ip));
  const lockout = createLockout(deps.security?.loginFailuresPerAccount ?? 5, 15 * 60_000, deps.security?.now);
  const linkTo = (query: string, token: string) => `${deps.appUrl.replace(/\/+$/, '')}/?${query}=${token}`;

  /** What the browser needs to know before showing the forms. */
  app.get('/api/config', async () => ({ turnstileSiteKey: deps.captcha?.siteKey ?? null }));

  async function sendActivation(email: string, firstName: string | null, userId: number): Promise<boolean> {
    const link = `${deps.appUrl.replace(/\/+$/, '')}/?activate=${createActivationToken(deps.db, userId)}`;
    const result = await deps.mailer.send(buildActivationEmail(email, firstName, link, ACTIVATION_HOURS));
    return result.sent;
  }

  app.post('/api/auth/activate', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    if (!activateWithToken(deps.db, token)) {
      return reply.status(400).send({ error: 'This activation link is invalid or has expired. Request a new one from the sign-in page.' });
    }
    return { activated: true };
  });

  // Always answers the same, so it cannot be used to find out which e-mails have accounts.
  app.post('/api/auth/resend', async (req, reply) => {
    const { email, captchaToken } = emailOnlySchema.parse(req.body);
    if (!(await captchaOk(captchaToken, req.ip))) return reply.status(400).send({ error: CAPTCHA_MESSAGE });
    const user = findUserByEmail(deps.db, email);
    if (user && !user.emailVerified) await sendActivation(user.email, user.firstName, user.id);
    return { ok: true };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const lockKey = email.trim().toLowerCase();
    if (lockout.isLocked(lockKey)) {
      return reply.header('Retry-After', '900').status(429).send({ error: 'Too many wrong passwords for this account. Try again in 15 minutes or reset your password.' });
    }
    const user = authenticate(deps.db, email, password);
    if (!user) {
      lockout.fail(lockKey);
      return reply.status(401).send({ error: 'Wrong email or password' });
    }
    lockout.reset(lockKey);
    if (!user.emailVerified) {
      return reply.status(403).send({ error: 'Your account is not activated yet. Open the link we sent to your email.', code: 'not_activated' });
    }
    signIn(reply, user);
    return { user };
  });

  /* ---- forgotten password ---- */

  // Always answers the same, so it cannot be used to find out which e-mails have accounts.
  app.post('/api/auth/forgot', async (req, reply) => {
    const { email, captchaToken } = emailOnlySchema.parse(req.body);
    if (!(await captchaOk(captchaToken, req.ip))) return reply.status(400).send({ error: CAPTCHA_MESSAGE });
    const user = findUserByEmail(deps.db, email);
    if (user) {
      const link = linkTo('reset', createPasswordReset(deps.db, user.id));
      await deps.mailer.send(buildPasswordResetEmail(user.email, user.firstName, link, RESET_HOURS));
    }
    return { ok: true };
  });

  app.post('/api/auth/reset', async (req, reply) => {
    const body = z
      .object({ token: z.string().min(10).max(200), password: z.string().max(200), confirmPassword: z.string().max(200) })
      .parse(req.body);
    const user = userForPasswordReset(deps.db, body.token);
    if (!user) return reply.status(400).send({ error: 'This reset link is invalid or has expired. Ask for a new one.' });
    if (body.password !== body.confirmPassword) return reply.status(400).send({ error: 'The passwords do not match' });
    const problems = passwordProblems(body.password, user.email);
    if (problems.length > 0) return reply.status(400).send({ error: problems.join('; ') });
    resetPassword(deps.db, body.token, body.password);
    lockout.reset(user.email);
    return { reset: true };
  });

  app.post('/api/auth/confirm-email', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    if (!confirmEmailChange(deps.db, token)) {
      return reply.status(400).send({ error: 'This link is invalid or has expired, or the address is already in use.' });
    }
    return { confirmed: true };
  });

  /* ---- the signed-in person's own account ---- */

  const profileSchema = z.object({
    firstName: z.string().trim().min(1, { message: 'Enter your first name' }).max(60),
    lastName: z.string().trim().min(1, { message: 'Enter your last name' }).max(60),
    city: z.string().trim().min(1, { message: 'Enter your city' }).max(80),
    address: z.string().trim().min(1, { message: 'Enter your address' }).max(200),
    phone: z.string().trim().max(20).regex(PHONE_RE, { message: PHONE_MESSAGE }).optional(),
  });

  app.patch('/api/account', async (req) => ({ user: updateProfile(deps.db, req.user!.id, profileSchema.parse(req.body)) }));

  app.post('/api/account/password', async (req, reply) => {
    const body = z
      .object({ currentPassword: z.string().max(200), newPassword: z.string().max(200), confirmPassword: z.string().max(200) })
      .parse(req.body);
    if (!verifyUserPassword(deps.db, req.user!.id, body.currentPassword)) {
      return reply.status(403).send({ error: 'Your current password is wrong' });
    }
    if (body.newPassword !== body.confirmPassword) return reply.status(400).send({ error: 'The passwords do not match' });
    const problems = passwordProblems(body.newPassword, req.user!.email);
    if (problems.length > 0) return reply.status(400).send({ error: problems.join('; ') });
    changePassword(deps.db, req.user!.id, body.newPassword, readCookie(req, SESSION_COOKIE));
    return { changed: true };
  });

  app.post('/api/account/email', async (req, reply) => {
    const { newEmail, password } = z.object({ newEmail: z.string().trim().email(), password: z.string().max(200) }).parse(req.body);
    if (!verifyUserPassword(deps.db, req.user!.id, password)) return reply.status(403).send({ error: 'Your password is wrong' });
    if (findUserByEmail(deps.db, newEmail)) return reply.status(409).send({ error: 'This email address is already in use' });
    const link = linkTo('confirm-email', createEmailChange(deps.db, req.user!.id, newEmail));
    const result = await deps.mailer.send(buildEmailChangeEmail(newEmail.trim(), req.user!.firstName, link, EMAIL_CHANGE_HOURS));
    return { emailSent: result.sent };
  });

  /** Everything stored about the person, as a downloadable file. */
  app.get('/api/account/export', async (req, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="my-collectiblemarket-data.json"');
    return { exportedAt: new Date().toISOString(), account: req.user };
  });

  app.delete('/api/account', async (req, reply) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    if (req.user!.role === 'admin') {
      return reply.status(403).send({ error: 'The admin account cannot be deleted here (it comes from ADMIN_EMAIL)' });
    }
    if (!verifyUserPassword(deps.db, req.user!.id, password)) return reply.status(403).send({ error: 'Your password is wrong' });
    deleteAccount(deps.db, req.user!.id);
    return reply.header('Set-Cookie', sessionCookie('', 0)).status(204).send();
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

  /* ---- games (the menu) ---- */

  app.get('/api/games', async () => listGames(deps.db));

  app.post('/api/games', { preHandler: requireAdmin }, async (req, reply) => {
    const body = gameCreateSchema.parse(req.body);
    const slug = slugify(body.name);
    if (!slug) return reply.status(400).send({ error: 'Use letters or digits in the game name' });
    if (getGame(deps.db, slug)) return reply.status(409).send({ error: 'This game is already in the menu' });
    const game = createGame(deps.db, {
      slug,
      name: body.name,
      keywords: body.keywords || body.name,
      query: body.query || body.name,
    });
    return reply.status(201).send(game);
  });

  app.patch('/api/games/:slug', { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const game = updateGame(deps.db, slug, gamePatchSchema.parse(req.body));
    return game ?? reply.status(404).send({ error: 'Game not found' });
  });

  app.delete('/api/games/:slug', { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    if (getGame(deps.db, slug)?.builtin) {
      return reply.status(400).send({ error: 'The built-in games cannot be deleted; switch them off instead' });
    }
    return deleteGame(deps.db, slug) ? reply.status(204).send() : reply.status(404).send({ error: 'Game not found' });
  });

  app.post('/api/shops', { preHandler: requireAdmin }, async (req, reply) => {
    const body = shopCreateSchema.parse(req.body);
    if (body.game && !getGame(deps.db, body.game)) return reply.status(400).send({ error: 'Unknown game' });
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
        return reply.status(409).send({ error: 'This shop page is already in the list for this game' });
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
        game: z.string().max(40).optional(),
        inStock: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    return listProducts(deps.db, { shopId: q.shopId, game: q.game, inStockOnly: q.inStock === 'true' });
  });

  // The prices recorded for one product (by its link), one per day: the chart on the home page.
  app.get('/api/price-history', async (req) => {
    const q = z.object({ url: z.string().min(1).max(2000) }).parse(req.query);
    return priceHistory(deps.db, q.url);
  });

  app.get('/api/runs', async () => listRuns(deps.db, 20));

  app.post('/api/run', { preHandler: requireAdmin }, async (req, reply) => {
    if (deps.service.isRunning()) return reply.status(409).send({ error: 'A check is already running' });
    return deps.service.run('manual');
  });

  /* ---- settings ---- */
  /* ---- shops suggested by visitors ---- */

  // Open to everyone (the form is on the public home page); limited per address in the bot protection.
  app.post('/api/suggestions', async (req, reply) => {
    const { url, note, website } = suggestionSchema.parse(req.body);
    if (website) return reply.status(201).send({ ok: true }); // honeypot: pretend it worked
    addShopSuggestion(deps.db, url, note ?? '');
    if (deps.notifyEmail) {
      try {
        await deps.mailer.send(buildShopSuggestionEmail(deps.notifyEmail, url, note ?? ''));
      } catch {
        /* the suggestion is stored; the e-mail is only a convenience */
      }
    }
    return reply.status(201).send({ ok: true });
  });

  app.get('/api/suggestions', { preHandler: requireAdmin }, async () => listShopSuggestions(deps.db));

  app.delete<{ Params: { id: string } }>('/api/suggestions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    if (!deleteShopSuggestion(deps.db, Number(req.params.id))) return reply.status(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.get('/api/settings', { preHandler: requireAdmin }, async () => getSettings(deps.db, deps.defaults));

  app.put('/api/settings', { preHandler: requireAdmin }, async (req) => {
    const patch = settingsSchema.parse(req.body);
    saveSettings(deps.db, patch);
    const settings = getSettings(deps.db, deps.defaults);
    if (patch.cron) deps.scheduler.start(settings.cron);
    return settings;
  });

  /* ---- built frontend (optional) ---- */
  /* ---- home page: the report with the latest results (public); the app itself lives at /app ---- */
  const renderHome = (viewer: User | null, game?: { slug: string; name: string }) => {
    const last = listRuns(deps.db, 1)[0];
    const now = new Date().toISOString();
    const summary: RunSummary = last ?? {
      runId: 0,
      startedAt: now,
      finishedAt: now,
      source: 'manual',
      query: '',
      games: listGames(deps.db)
        .filter((g) => g.enabled)
        .map((g) => ({ slug: g.slug, name: g.name })),
      shops: [],
      products: [],
    };
    let manualShops: ManualShop[] = [];
    try {
      manualShops = deps.manualShops?.() ?? [];
    } catch {
      /* the list is optional */
    }
    return buildReportHtml(summary, {
      signInUrl: '/app?login',
      suggestUrl: '/api/suggestions',
      historyUrl: '/api/price-history',
      ...(viewer
        ? { account: { name: viewer.firstName?.trim() || 'Account', admin: viewer.role === 'admin', profileUrl: '/app?account', adminUrl: '/app' } }
        : {}),
      manualShops,
      ...(deps.siteUrl ? { seo: { baseUrl: deps.siteUrl, game } } : {}),
    });
  };

  app.get('/', async (req, reply) => {
    // Links from e-mails (/?activate=..., ?reset=..., ?confirm-email=...) open the app.
    if (deps.staticDir && req.url.includes('?')) return reply.sendFile('index.html');
    return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(renderHome(req.user));
  });

  // One page per game (own address, title and description for search engines).
  app.get<{ Params: { slug: string } }>('/games/:slug', async (req, reply) => {
    const game = listGames(deps.db).find((g) => g.enabled && g.slug === req.params.slug);
    if (!game) return reply.status(404).type('text/plain').send('Not found');
    return reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(renderHome(req.user, { slug: game.slug, name: game.name }));
  });

  app.get('/sitemap.xml', async (_req, reply) => {
    if (!deps.siteUrl) return reply.status(404).type('text/plain').send('Not found');
    const base = deps.siteUrl.replace(/\/+$/, '');
    const urls = [`${base}/`, ...listGames(deps.db).filter((g) => g.enabled).map((g) => `${base}/games/${g.slug}`)];
    const day = new Date().toISOString().slice(0, 10);
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) => `  <url><loc>${u}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq></url>`).join('\n') +
      '\n</urlset>\n';
    return reply.type('application/xml; charset=utf-8').send(xml);
  });

  if (deps.staticDir) {
    // index:false so that "/" is the report above, not the app's index.html
    await app.register(fastifyStatic, { root: deps.staticDir, index: false });
    app.get('/app', async (_req, reply) => reply.sendFile('index.html'));
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
