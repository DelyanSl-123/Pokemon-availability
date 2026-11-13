import { useEffect, useRef, useState } from 'react';
import { api, type User } from '../api/client';

/**
 * Shown to a signed-in person whose accepted Terms are older than the current version.
 * It can only be closed by accepting (after reading) or by signing out.
 */
export function TermsPrompt({
  user,
  version,
  onAccepted,
  onSignOut,
}: {
  user: User;
  version: string;
  onAccepted: (user: User) => void;
  onSignOut: () => void;
}) {
  const box = useRef<HTMLDialogElement>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = user.termsVersion === null;

  useEffect(() => {
    const d = box.current;
    if (d && !d.open) d.showModal();
  }, []);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      onAccepted(await api.acceptTerms(version));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={box}
      className="termsdlg"
      aria-labelledby="terms-title"
      onCancel={(e) => e.preventDefault()}
      // Escape must not close it: browsers do not always honour the cancel block, so it opens again
      onClose={() => box.current?.showModal()}
    >
      <h2 id="terms-title">{first ? 'Please accept our Terms' : 'Our Terms have changed'}</h2>
      <p className="sub">
        {first
          ? 'To keep using your account, please read and accept the Terms and Conditions and the Privacy Policy.'
          : `We updated the Terms and Conditions and the Privacy Policy (version ${version}). Please read them and accept the new version to keep using your account.`}
      </p>
      <p className="tlinks">
        <a href="/terms.html" target="_blank" rel="noopener">
          Terms and Conditions ↗
        </a>
        <a href="/privacy.html" target="_blank" rel="noopener">
          Privacy Policy ↗
        </a>
      </p>
      <label className="tcheck">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I have read and agree to the Terms and Conditions and the Privacy Policy</span>
      </label>
      {error && <div className="banner error">{error}</div>}
      <div className="tacts">
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
        <button type="button" className="primary" disabled={!agree || busy} onClick={() => void accept()}>
          {busy ? 'Saving…' : 'Accept'}
        </button>
      </div>
    </dialog>
  );
}
