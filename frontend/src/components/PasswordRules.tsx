import { PASSWORD_MIN, passwordProblems } from '../utils/password';

const RULES: [string, (p: string, email: string) => boolean][] = [
  [`At least ${PASSWORD_MIN} characters`, (p) => p.length >= PASSWORD_MIN],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A digit', (p) => /[0-9]/.test(p)],
  ['A special character (! ? # $ % & *)', (p) => /[^A-Za-z0-9\s]/.test(p)],
  [
    'No spaces, no 3 identical characters in a row, not your email name, not a common password',
    (p, e) => p.length > 0 && !passwordProblems(p, e).some((m) => /space|repeat|email|common/i.test(m)),
  ],
];

/** Live checklist of the password rules. */
export function PasswordRules({ password, email }: { password: string; email: string }) {
  return (
    <ul className="rules">
      {RULES.map(([label, ok]) => {
        const pass = ok(password, email);
        return (
          <li key={label} className={password === '' ? '' : pass ? 'ok' : 'bad'}>
            {pass && password !== '' ? '✓' : '○'} {label}
          </li>
        );
      })}
    </ul>
  );
}
