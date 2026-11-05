import { FormEvent, useEffect, useState } from 'react';
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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', city: '', address: '', phone: '' });
  const setField = (k: keyof typeof profile) => (e: { target: { value: string } }) =>
    setProfile({ ...profile, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** E-mail of an account that still has to be activated (offers "send the link again"). */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // The link in the activation e-mail opens the app as /?activate=<token>.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('activate');
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    api
      .activate(token)
      .then(() => setNotice('Your account is activated. You can sign in now.'))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const resend = async () => {
    if (!pendingEmail) return;
    setError(null);
    try {
      await api.resendActivation(pendingEmail);
      setNotice(`If ${pendingEmail} has an account waiting for activation, we sent a new link.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'register') {
      const problems = passwordProblems(password, email);
      if (problems.length > 0) return setError(problems.join('. '));
      if (password !== confirm) return setError('The passwords do not match');
      if (!acceptTerms) return setError('You must agree to the Terms and Conditions');
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        onSignedIn(await api.login({ email, password }));
      } else {
        const res = await api.register({ email, password, confirmPassword: confirm, ...profile, phone: profile.phone.trim() || undefined, acceptTerms });
        setPendingEmail(res.email);
        setPassword('');
        setConfirm('');
        setAcceptTerms(false);
        setMode('login');
        setNotice(
          res.emailSent
            ? `Almost done! We sent an activation link to ${res.email}. Open it to activate your account, then sign in.`
            : `Your account was created, but the activation email could not be sent. Press "Send the link again" below.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mode === 'login' && /not activated/i.test(message)) setPendingEmail(email);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setConfirm('');
    setAcceptTerms(false);
  };

  return (
    <main className="auth">
      <section>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="sub">CollectibleMarket · Pokémon TCG availability tracker</p>
        {error && <div className="banner error">{error}</div>}
        {notice && <div className="banner ok">{notice}</div>}
        {pendingEmail && mode === 'login' && (
          <p className="sub">
            No email?{' '}
            <button type="button" className="link" onClick={resend}>
              Send the link again
            </button>
          </p>
        )}
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
              <label className="inline">
                <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
                <span>
                  I agree to the{' '}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer">
                    Terms and Conditions
                  </a>
                </span>
              </label>
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
