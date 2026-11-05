import crypto from 'node:crypto';
import type { DB } from '../db/connection';
import { hashPassword, verifyPassword } from './passwords';

export type Role = 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  role: Role;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  emailVerified: boolean;
}

/** Details asked on the registration form (phone is optional). */
export interface Profile {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  phone?: string;
  /** Set when the person ticked the Terms and Conditions box. */
  termsAcceptedAt?: string;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email_verified_at: string | null;
}

const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  role: r.role,
  createdAt: r.created_at,
  firstName: r.first_name,
  lastName: r.last_name,
  city: r.city,
  address: r.address,
  phone: r.phone,
  emailVerified: r.email_verified_at !== null,
});
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function findRow(db: DB, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | undefined;
}

/** Registration always creates a regular user; the admin account only comes from {@link ensureAdmin}. */
export function createUser(db: DB, email: string, password: string, profile?: Profile): User {
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, city, address, phone, terms_accepted_at)
       VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      normalizeEmail(email),
      hashPassword(password),
      profile?.firstName ?? null,
      profile?.lastName ?? null,
      profile?.city ?? null,
      profile?.address ?? null,
      profile?.phone || null,
      profile?.termsAcceptedAt ?? null,
    );
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow);
}

export function authenticate(db: DB, email: string, password: string): User | null {
  const row = findRow(db, email);
  return row && verifyPassword(password, row.password_hash) ? toUser(row) : null;
}

/**
 * Makes `email` the one and only admin (creating it, or setting its password, when a password is
 * given) and turns any other admin back into a regular user. Returns null when there is no such
 * account and no password to create it with.
 */
export function ensureAdmin(db: DB, email: string, password?: string): User | null {
  const normalized = normalizeEmail(email);
  return db.transaction(() => {
    db.prepare(`UPDATE users SET role = 'user' WHERE role = 'admin' AND email <> ?`).run(normalized);
    const existing = findRow(db, normalized);
    if (existing) {
      if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
      db.prepare(`UPDATE users SET role = 'admin', email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?`).run(existing.id);
    } else if (password) {
      db.prepare(`INSERT INTO users (email, password_hash, role, email_verified_at) VALUES (?, ?, 'admin', datetime('now'))`).run(normalized, hashPassword(password));
    } else {
      return null;
    }
    return toUser(findRow(db, normalized)!);
  })();
}

/** Starts a session and returns its token (only a hash of it is stored). */
export function createSession(db: DB, userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return token;
}

export function userForSession(db: DB, token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export const ACTIVATION_HOURS = 24;

/** Creates an activation token for the account (older ones are dropped); only its hash is stored. */
export function createActivationToken(db: DB, userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + ACTIVATION_HOURS * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM email_verifications WHERE user_id = ? OR expires_at < ?').run(userId, new Date().toISOString());
  db.prepare('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return token;
}

/** Activates the account the token belongs to. Returns false for an unknown, used or expired token. */
export function activateWithToken(db: DB, token: string): boolean {
  return db.transaction(() => {
    const row = db
      .prepare('SELECT user_id FROM email_verifications WHERE token_hash = ? AND expires_at > ?')
      .get(sha256(token), new Date().toISOString()) as { user_id: number } | undefined;
    if (!row) return false;
    db.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?`).run(row.user_id);
    db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(row.user_id);
    return true;
  })();
}

export function findUserByEmail(db: DB, email: string): User | null {
  const row = findRow(db, email);
  return row ? toUser(row) : null;
}
