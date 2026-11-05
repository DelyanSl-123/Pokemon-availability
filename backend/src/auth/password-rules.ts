/**
 * Rules for new passwords (registration). A copy of this file lives in
 * frontend/src/utils/password.ts (live feedback). Keep both in sync; the server enforces them.
 * Sign-in is not checked against them, so older accounts can still log in.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty', 'qwerty123', 'qwertyuiop', 'letmein', 'welcome',
  'welcome1', 'admin', 'administrator', 'iloveyou', 'monkey', 'dragon', 'football', 'abc123', '123456', '12345678',
  '123456789', '1234567890', 'pokemon', 'pikachu', 'charizard', 'collectiblemarket',
]);

/** Returns what is wrong with `password`, one message per broken rule (empty list = acceptable). */
export function passwordProblems(password: string, email = ''): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters`);
  if (password.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters`);
  if (!/[a-z]/.test(password)) problems.push('Add a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('Add an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('Add a digit');
  if (!/[^A-Za-z0-9\s]/.test(password)) problems.push('Add a special character (for example ! ? # $ % & *)');
  if (/\s/.test(password)) problems.push('Do not use spaces');
  if (/(.)\1{2,}/.test(password)) problems.push('Do not repeat the same character 3 times in a row');

  const lower = password.toLowerCase();
  const local = email.trim().toLowerCase().split('@')[0];
  if (local.length >= 3 && lower.includes(local)) problems.push('Do not include your email name');
  if ([...COMMON].some((w) => lower.replace(/[^a-z0-9]/g, '').startsWith(w) && lower.replace(/[^a-z0-9]/g, '').length <= w.length + 4)) {
    problems.push('This password is too common');
  }
  return problems;
}
