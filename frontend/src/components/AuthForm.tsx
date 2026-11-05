import { FormEvent, useEffect, useState } from 'react';
import { api, type User } from '../api/client';
import { Captcha } from './Captcha';
import { PasswordRules } from './PasswordRules';
import { PASSWORD_MIN, passwordProblems } from '../utils/password';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Sign-in / register / forgotten-password screen shown until there is a session. */
export function AuthForm({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', city: '', address: '', phone: '' });
  const setField = (k: keyof typeof profile) => (e: { target: { value: string } }) =>
    setProfile({ ...profile, [k]: e.target.value });
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** E-mail of an account that still has to be activated (offers "send the link again"). */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  /** Token from the password-reset link (/?reset=<token>). */
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);

  useEffect(() => {
    api.config().then((c) => setSiteKey(c.turnstileSiteKey), () => undefined);

    // Links in e-mails open the app as /?activate=<token> or /?reset=<token>.
    const params = new URLSearchParams(window.location.search);
    const activate = params.get('activate');
    const reset = params.get('reset');
    if (!activate && !reset) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (reset) {
      setResetToken(reset);
      setMode('reset');
    } else if (activate) {
      api
        .activate(activate)
        .then(() => setNotice('Your account is activated. You can sign in now.'))
        .catch((err) => setError(messageOf(err)));
    }
  }, []);

  const needsCaptcha = siteKey !== null && (mode === 'register' || mode === 'forgot');
  const newCaptcha = () => {
    setCaptchaToken('');
    setCaptchaRound((n) => n + 1);
  };

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setConfirm('');
    setAcceptTerms(false);
    newCaptcha();
  };

  const resend = async () => {
    if (!pendingEmail) return;
    setError(null);
    try {
      await api.resendActivation(pendingEmail, captchaToken || undefined);
      setNotice(`If ${pendingEmail} has an account waiting for activation, we sent a new link.`);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'register' || mode === 'reset') {
      const problems = passwordProblems(password, email);
      if (problems.length > 0 && mode === 'register') return setError(problems.join('. '));
      if (mode === 'reset' && problems.filter((p) => !/email/i.test(p)).length > 0) {
        return setError(problems.join('. '));
      }
      if (password !== confirm) return setError('The passwords do not match');
    }
    if (mode === 'register' && !acceptTerms) return setError('You must agree to the Terms and Conditions and the Privacy Policy');
    if (needsCaptcha && !captchaToken) return setError('Please complete the CAPTCHA check');

    setBusy(true);
    try {
      if (mode === 'login') {
        onSignedIn(await api.login({ email, password }));
      } else if (mode === 'register') {
        const res = await api.register({
          email,
          password,
          confirmPassword: confirm,
          ...profile,
          phone: profile.phone.trim() || undefined,
          acceptTerms,
          captchaToken: captchaToken || undefined,
          website: honeypot || undefined,
        });
        setPendingEmail(res.email);
        go('login');
        setPassword('');
        setNotice(
          res.emailSent
            ? `Almost done! We sent an activation link to ${res.email}. Open it to activate your account, then sign in.`
            : 'Your account was created, but the activation email could not be sent. Press "Send the link again" below.',
        );
      } else if (mode === 'forgot') {
        await api.forgotPassword(email, captchaToken || undefined);
        go('login');
        setNotice(`If ${email} has an account, we sent a link to choose a new password. It is valid for 1 hour.`);
      } else if (resetToken) {
        await api.resetPassword({ token: resetToken, password, confirmPassword: confirm });
        setResetToken(null);
        setPassword('');
        go('login');
        setNotice('Your password was changed. Sign in with the new one.');
      }
    } catch (err) {
      const message = messageOf(err);
      if (mode === 'login' && /not activated/i.test(message)) setPendingEmail(email);
      setError(message);
      if (needsCaptcha) newCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const title = { login: 'Sign in', register: 'Create an account', forgot: 'Forgot your password?', reset: 'Choose a new password' }[mode];
  const button = { login: 'Sign in', register: 'Register', forgot: 'Send the link', reset: 'Change password' }[mode];

  return (
    <main className="auth">
      <section>
        <h1>{title}</h1>
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
        {mode === 'forgot' && <p className="sub">Enter your email and we will send you a link to choose a new password.</p>}
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
          {mode !== 'reset' && (
            <label>
              Email
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>
              {mode === 'reset' ? 'New password' : 'Password'}
              <input
                type="password"
                required
                minLength={mode === 'login' ? undefined : PASSWORD_MIN}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {(mode === 'register' || mode === 'reset') && (
            <>
              <label>
                Confirm password
                <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {confirm !== '' && confirm !== password && <span className="rule bad">The passwords do not match</span>}
              </label>
              <PasswordRules password={password} email={email} />
            </>
          )}
          {mode === 'register' && (
            <>
              {/* Honeypot: invisible to people, simple bots fill it in and get ignored. */}
              <div className="hp" aria-hidden="true">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                </label>
              </div>
              <label className="inline">
                <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
                <span>
                  I agree to the{' '}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer">
                    Terms and Conditions
                  </a>{' '}
                  and the{' '}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </a>
                </span>
              </label>
            </>
          )}
          {needsCaptcha && siteKey && <Captcha key={`${mode}-${captchaRound}`} siteKey={siteKey} onToken={setCaptchaToken} />}
          <div>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Please wait…' : button}
            </button>
          </div>
        </form>
        {mode === 'login' && (
          <p className="sub">
            <button type="button" className="link" onClick={() => go('forgot')}>
              Forgot your password?
            </button>
          </p>
        )}
        {mode !== 'reset' && (
          <p className="sub">
            {mode === 'register' ? 'Already registered? ' : mode === 'forgot' ? 'Remembered it? ' : 'No account yet? '}
            <button type="button" className="link" onClick={() => go(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
