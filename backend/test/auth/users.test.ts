import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/passwords';
import { authenticate, createSession, createUser, ensureAdmin, userForSession } from '../../src/auth/users';
import { openDb } from '../../src/db/connection';

describe('passwords', () => {
  it('verifies the right password only and salts every hash', () => {
    const hash = hashPassword('correct horse');
    expect(hash).not.toContain('correct horse');
    expect(verifyPassword('correct horse', hash)).toBe(true);
    expect(verifyPassword('wrong horse', hash)).toBe(false);
    expect(hashPassword('correct horse')).not.toBe(hash);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('users', () => {
  it('keeps exactly one admin: the configured email', () => {
    const db = openDb(':memory:');
    createUser(db, 'someone@test.com', 'password-1');
    ensureAdmin(db, 'someone@test.com');
    expect(authenticate(db, 'someone@test.com', 'password-1')?.role).toBe('admin');

    // Changing ADMIN_EMAIL moves the role; the old admin becomes a regular user.
    ensureAdmin(db, 'me@test.com', 'my-password');
    expect(authenticate(db, 'someone@test.com', 'password-1')?.role).toBe('user');
    expect(authenticate(db, 'ME@test.com', 'my-password')?.role).toBe('admin');
  });

  it('does not create an admin without a password', () => {
    const db = openDb(':memory:');
    expect(ensureAdmin(db, 'me@test.com')).toBeNull();
  });

  it('resolves a session token to its user', () => {
    const db = openDb(':memory:');
    const user = createUser(db, 'a@test.com', 'password-1');
    const token = createSession(db, user.id);
    expect(userForSession(db, token)?.email).toBe('a@test.com');
    expect(userForSession(db, token + 'x')).toBeNull();
  });

  it('ends a session after 30 minutes without requests; every request starts the 30 minutes again', () => {
    const db = openDb(':memory:');
    const user = createUser(db, 'idle@test.com', 'a-good-Passw0rd!');
    const t0 = Date.parse('2026-11-13T10:00:00Z');
    const min = 60_000;
    const token = createSession(db, user.id, t0);
    expect(userForSession(db, token, t0 + 29 * min)?.email).toBe('idle@test.com'); // active: now ends at t0+59
    expect(userForSession(db, token, t0 + 44 * min)?.email).toBe('idle@test.com'); // 15 min idle, then a request: ends at t0+74
    expect(userForSession(db, token, t0 + 73 * min)?.email).toBe('idle@test.com'); // 29 min idle: still valid, ends at t0+103
    expect(userForSession(db, token, t0 + 103 * min + 1)).toBeNull(); // just over 30 min idle: expired
    expect(userForSession(db, token, t0 + 104 * min)).toBeNull(); // and stays expired
  });
});
