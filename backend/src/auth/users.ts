import crypto from 'node:crypto';
import type { DB } from '../db/connection';
import { hashPassword, verifyPassword } from './passwords';

/** Version of the Terms and Conditions / Privacy Policy text. Raise it when the text changes. */
export const TERMS_VERSION = '1.0';

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
  termsVersion: string | null;
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
  terms_version: string | null;
}

/** A session ends after this many minutes without any request; every request starts the minutes again. */
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_IDLE_MINUTES * 60;

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
  termsVersion: r.terms_version,
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
      `INSERT INTO users (email, password_hash, role, first_name, last_name, city, address, phone, terms_accepted_at, terms_version)
       VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?)`,
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
      profile?.termsAcceptedAt ? TERMS_VERSION : null,
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
export function createSession(db: DB, userId: number, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date(now).toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return token;
}

/**
 * The person signed in with this token, or null when the token is unknown or has expired.
 * A valid session is extended: it now ends SESSION_IDLE_MINUTES after this request (sliding expiry).
 */
export function userForSession(db: DB, token: string, now = Date.now()): User | null {
  const hash = sha256(token);
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hash, new Date(now).toISOString()) as UserRow | undefined;
  if (!row) return null;
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString(), hash);
  return toUser(row);
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

/* ---- accounts that never got activated ---- */

/** Deletes accounts that were not activated within the validity of their link. Returns how many. */
export function purgeUnactivated(db: DB, hours = ACTIVATION_HOURS): number {
  return db
    .prepare(`DELETE FROM users WHERE email_verified_at IS NULL AND created_at < datetime('now', ?)`)
    .run(`-${hours} hours`).changes;
}

/* ---- forgotten password ---- */

export const RESET_HOURS = 1;

export function createPasswordReset(db: DB, userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + RESET_HOURS * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?').run(userId, new Date().toISOString());
  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return token;
}

/** The account a valid, unused reset token belongs to (token is not consumed). */
export function userForPasswordReset(db: DB, token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.* FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = ? AND r.expires_at > ?`,
    )
    .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

/** Sets the new password, uses up the token and signs the account out everywhere. */
export function resetPassword(db: DB, token: string, newPassword: string): boolean {
  return db.transaction(() => {
    const user = userForPasswordReset(db, token);
    if (!user) return false;
    db.prepare(
      `UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?`,
    ).run(hashPassword(newPassword), user.id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    return true;
  })();
}

/* ---- account page ---- */

export function verifyUserPassword(db: DB, userId: number, password: string): boolean {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  return !!row && verifyPassword(password, row.password_hash);
}

export function updateProfile(db: DB, userId: number, p: Profile): User {
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, city = ?, address = ?, phone = ? WHERE id = ?').run(
    p.firstName,
    p.lastName,
    p.city,
    p.address,
    p.phone || null,
    userId,
  );
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow);
}

/** Records that the person accepted the current Terms and Privacy Policy (now). */
export function acceptCurrentTerms(db: DB, userId: number): User {
  db.prepare('UPDATE users SET terms_accepted_at = ?, terms_version = ? WHERE id = ?').run(new Date().toISOString(), TERMS_VERSION, userId);
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow);
}

/** Changes the password and ends every other session of the account (the current one stays). */
export function changePassword(db: DB, userId: number, newPassword: string, keepSessionToken?: string): void {
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, keepSessionToken ? sha256(keepSessionToken) : '');
  })();
}

export const EMAIL_CHANGE_HOURS = 24;

/** Starts an e-mail change; the address only changes once the link sent to the NEW address is opened. */
export function createEmailChange(db: DB, userId: number, newEmail: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + EMAIL_CHANGE_HOURS * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM email_changes WHERE user_id = ? OR expires_at < ?').run(userId, new Date().toISOString());
  db.prepare('INSERT INTO email_changes (token_hash, user_id, new_email, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    normalizeEmail(newEmail),
    expires,
  );
  return token;
}

/** Applies the e-mail change. False for an unknown/expired link or when the address was taken meanwhile. */
export function confirmEmailChange(db: DB, token: string): boolean {
  try {
    return db.transaction(() => {
      const row = db
        .prepare('SELECT user_id, new_email FROM email_changes WHERE token_hash = ? AND expires_at > ?')
        .get(sha256(token), new Date().toISOString()) as { user_id: number; new_email: string } | undefined;
      if (!row) return false;
      db.prepare('UPDATE users SET email = ?, email_verified_at = COALESCE(email_verified_at, datetime(\'now\')) WHERE id = ?').run(row.new_email, row.user_id);
      db.prepare('DELETE FROM email_changes WHERE user_id = ?').run(row.user_id);
      return true;
    })();
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return false;
    throw e;
  }
}

/** Removes the account and everything stored about it. */
export function deleteAccount(db: DB, userId: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId); // sessions, links and resets cascade
}
