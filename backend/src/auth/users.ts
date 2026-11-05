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
}

/** Details asked on the registration form (phone is optional). */
export interface Profile {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  phone?: string;
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
      `INSERT INTO users (email, password_hash, role, first_name, last_name, city, address, phone)
       VALUES (?, ?, 'user', ?, ?, ?, ?, ?)`,
    )
    .run(
      normalizeEmail(email),
      hashPassword(password),
      profile?.firstName ?? null,
      profile?.lastName ?? null,
      profile?.city ?? null,
      profile?.address ?? null,
      profile?.phone || null,
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
      db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(existing.id);
    } else if (password) {
      db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')`).run(normalized, hashPassword(password));
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
