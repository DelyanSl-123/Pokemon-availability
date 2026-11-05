import { describe, expect, it } from 'vitest';
import { passwordProblems } from '../../src/auth/password-rules';

describe('passwordProblems', () => {
  it('accepts a strong password', () => {
    expect(passwordProblems('Tr0ub4dor&Horse', 'me@test.com')).toEqual([]);
  });

  it.each([
    ['Sh0rt!a', 'at least 10'],
    ['alllowercase1!', 'uppercase'],
    ['ALLUPPERCASE1!', 'lowercase'],
    ['NoDigitsHere!!', 'digit'],
    ['NoSpecial1234x', 'special'],
    ['Has Space-1234x', 'spaces'],
    ['Aaaa1234567!b', 'repeat'],
    ['Pokemon123!', 'common'],
  ])('rejects %s', (password, part) => {
    expect(passwordProblems(password).join(' ')).toContain(part);
  });

  it('rejects a password containing the email name', () => {
    expect(passwordProblems('Delyan-2024!x', 'delyan@test.com').join(' ')).toContain('email name');
    expect(passwordProblems('Delyan-2024!x', 'ab@test.com')).toEqual([]);
  });
});
