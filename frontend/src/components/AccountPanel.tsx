import { Brand } from './Brand';
import { Req } from './Req';
import { FormEvent, useState } from 'react';
import { api, type User } from '../api/client';
import { PasswordRules } from './PasswordRules';
import { PASSWORD_MIN, passwordProblems } from '../utils/password';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** "My account": edit details, change email or password, download or delete the data. */
export function AccountPanel({
  user,
  onClose,
  onUserChange,
  onDeleted,
  page,
  onSignOut,
}: {
  user: User;
  /** Show as a page of its own (the profile page) instead of a window over the dashboard. */
  page?: boolean;
  onSignOut?: () => void;
  onClose: () => void;
  onUserChange: (user: User) => void;
  onDeleted: () => void;
}) {
  const isAdmin = user.role === 'admin';
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    city: user.city ?? '',
    address: user.address ?? '',
    phone: user.phone ?? '',
  });
  const setField = (k: keyof typeof profile) => (e: { target: { value: string } }) => setProfile({ ...profile, [k]: e.target.value });

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [deletePassword, setDeletePassword] = useState('');

  /** Runs one action and shows its result in the banner at the top. */
  const act = async (fn: () => Promise<string | void>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const message = await fn();
      if (message) setNotice(message);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      onUserChange(await api.updateProfile({ ...profile, phone: profile.phone.trim() || undefined }));
      return 'Your details were saved.';
    });
  };

  const changeEmail = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const res = await api.changeEmail({ newEmail, password: emailPassword });
      setEmailPassword('');
      return res.emailSent
        ? `We sent a confirmation link to ${newEmail}. The address changes when you open it.`
        : 'The confirmation email could not be sent. Try again later.';
    });
  };

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    const problems = passwordProblems(pw.next, user.email);
    if (problems.length > 0) return setError(problems.join('. '));
    if (pw.next !== pw.confirm) return setError('The passwords do not match');
    void act(async () => {
      await api.changePassword({ currentPassword: pw.current, newPassword: pw.next, confirmPassword: pw.confirm });
      setPw({ current: '', next: '', confirm: '' });
      return 'Your password was changed. Other devices were signed out.';
    });
  };

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm('Delete your account and all your data? This cannot be undone.')) return;
    void act(async () => {
      await api.deleteAccount(deletePassword);
      onDeleted();
    });
  };

  const body = (
    <>
        <div className="row">
          {page ? <h1>My account</h1> : <h2>My account</h2>}
          <div className="row">
            {page && (
              <a className="btnlink" href="/#favorites">
                My favourites
              </a>
            )}
            {page && isAdmin && (
              <a className="btnlink" href="/app">
                Admin page
              </a>
            )}
            {page && onSignOut && (
              <button type="button" onClick={onSignOut}>
                Sign out
              </button>
            )}
            {!page && (
              <button type="button" className="link" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>
        <p className="sub">
          {user.email} <span className={`badge ${isAdmin ? 'ok' : 'muted'}`}>{isAdmin ? 'Admin' : 'User'}</span>
        </p>
        {error && <div className="banner error">{error}</div>}
        {notice && <div className="banner ok">{notice}</div>}

        <h3>Your details</h3>
        <p className="sub">
          <span className="req">*</span> required field
        </p>
        <form className="grid" onSubmit={saveProfile}>
          <label>
            <span>First name<Req /></span>
            <input required maxLength={60} value={profile.firstName} onChange={setField('firstName')} />
          </label>
          <label>
            <span>Last name<Req /></span>
            <input required maxLength={60} value={profile.lastName} onChange={setField('lastName')} />
          </label>
          <label>
            <span>City<Req /></span>
            <input required maxLength={80} value={profile.city} onChange={setField('city')} />
          </label>
          <label>
            <span>Address<Req /></span>
            <input required maxLength={200} value={profile.address} onChange={setField('address')} />
          </label>
          <label>
            <span>
              Phone <span className="sub">(optional)</span>
            </span>
            <input type="tel" maxLength={20} pattern="\+?[0-9][0-9 ()\-]{5,19}" title="Digits, spaces, + ( ) -" value={profile.phone} onChange={setField('phone')} />
          </label>
          <div>
            <button className="primary" disabled={busy}>
              Save details
            </button>
          </div>
        </form>

        {!isAdmin && (
          <>
            <h3>Change email</h3>
            <form className="grid" onSubmit={changeEmail}>
              <label>
                <span>New email<Req /></span>
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </label>
              <label>
                <span><span>Your password<Req /></span></span>
                <input type="password" required autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
              </label>
              <div>
                <button disabled={busy}>Send confirmation link</button>
              </div>
            </form>
          </>
        )}

        <h3>Change password</h3>
        <form className="grid" onSubmit={changePassword}>
          <label>
            <span>Current password<Req /></span>
            <input type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label>
            <span>New password<Req /></span>
            <input type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label>
            <span>Confirm new password<Req /></span>
            <input type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            {pw.confirm !== '' && pw.confirm !== pw.next && <span className="rule bad">The passwords do not match</span>}
          </label>
          <PasswordRules password={pw.next} email={user.email} />
          <div>
            <button disabled={busy}>Change password</button>
          </div>
        </form>

        <h3>Your data</h3>
        <p className="sub">
          Terms accepted: {user.termsVersion ? `version ${user.termsVersion}` : 'n/a'} ·{' '}
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">
            Terms
          </a>{' '}
          ·{' '}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
        </p>
        <p>
          <a href="/api/account/export" download>
            Download my data (JSON)
          </a>
        </p>

        {!isAdmin && (
          <>
            <h3>Delete account</h3>
            <form className="grid" onSubmit={deleteAccount}>
              <label>
                <span><span>Your password<Req /></span></span>
                <input type="password" required autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
              </label>
              <div>
                <button className="danger" disabled={busy}>
                  Delete my account
                </button>
              </div>
            </form>
          </>
        )}
    </>
  );

  if (page) {
    return (
      <main className="authpage wide">
        <Brand />
        <section className="authcard panel-page">{body}</section>
        <p className="authback">
          <button type="button" className="link" onClick={onClose}>
            ← Back to the home page
          </button>
        </p>
      </main>
    );
  }
  return (
    <div className="panel-backdrop" role="dialog" aria-modal="true" aria-label="My account" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
