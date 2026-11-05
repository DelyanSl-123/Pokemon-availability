import { FormEvent, useState } from 'react';
import { api, type User } from '../api/client';
import { PASSWORD_MIN, passwordProblems } from '../utils/password';

const RULES: [string, (p: string, email: string) => boolean][] = [
  [`At least ${PASSWORD_MIN} characters`, (p) => p.length >= PASSWORD_MIN],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A digit', (p) => /[0-9]/.test(p)],
  ['A special character (! ? # $ % & *)', (p) => /[^A-Za-z0-9\s]/.test(p)],
  ['No spaces, no 3 identical characters in a row, not your email name, not a common password', (p, e) =>
    p.length > 0 && !passwordProblems(p, e).some((m) => /space|repeat|email|common/i.test(m))],
];

/** Sign-in / register screen shown until there is a session. */
export function AuthForm({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [profile, setProfile] = useState({ firstName: '', lastName: '', city: '', address: '', phone: '' });
  const setField = (k: keyof typeof profile) => (e: { target: { value: string } }) =>
    setProfile({ ...profile, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      const problems = passwordProblems(password, email);
      if (problems.length > 0) return setError(problems.join('. '));
      if (password !== confirm) return setError('The passwords do not match');
    }
    setBusy(true);
    try {
      onSignedIn(await (mode === 'login' ? api.login({ email, password }) : api.register({ email, password, confirmPassword: confirm, ...profile, phone: profile.phone.trim() || undefined })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setConfirm('');
  };

  return (
    <main className="auth">
      <section>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="sub">CollectibleMarket · Pokémon TCG availability tracker</p>
        {error && <div className="banner error">{error}</div>}
        <form className="grid" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>
                First name
                <input required maxLength={60} autoComplete="given-name" value={profile.firstName} onChange={setField('firstName')} />
              </label>
              <label>
                Last name
                <input required maxLength={60} autoComplete="family-name" value={profile.lastName} onChange={setField('lastName')} />
              </label>
              <label>
                City
                <input required maxLength={80} autoComplete="address-level2" value={profile.city} onChange={setField('city')} />
              </label>
              <label>
                Address
                <input required maxLength={200} autoComplete="street-address" value={profile.address} onChange={setField('address')} />
              </label>
              <label>
                <span>
                  Phone <span className="sub">(optional)</span>
                </span>
                <input
                  type="tel"
                  maxLength={20}
                  pattern="\+?[0-9][0-9 ()\-]{5,19}"
                  title="Digits, spaces, + ( ) -"
                  autoComplete="tel"
                  value={profile.phone}
                  onChange={setField('phone')}
                />
              </label>
            </>
          )}
          <label>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={mode === 'register' ? PASSWORD_MIN : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === 'register' && (
            <>
              <label>
                Confirm password
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {confirm !== '' && confirm !== password && <span className="rule bad">The passwords do not match</span>}
              </label>
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
            </>
          )}
          <div>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
            </button>
          </div>
        </form>
        <p className="sub">
          {mode === 'login' ? 'No account yet? ' : 'Already registered? '}
          <button type="button" className="link" onClick={switchMode}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  );
}
