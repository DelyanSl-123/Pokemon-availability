import { useEffect, useRef, useState } from 'react';
import type { User } from '../api/client';
import { Brand } from './Brand';

/** The name shown next to the profile icon: the first name, else the part of the email before the @. */
export function displayName(user: User): string {
  return user.firstName?.trim() || user.email.split('@')[0];
}

const UserIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
);

/**
 * The profile icon with its menu: My favourites, My account, Admin page (admin only) and Sign out.
 * The same menu is on the home page; `current` marks the page that is open.
 */
export function AccountMenu({
  user,
  onSignOut,
  current,
}: {
  user: User;
  onSignOut: () => void;
  current?: 'account' | 'admin';
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>('.acct-btn')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isAdmin = user.role === 'admin';
  const name = displayName(user);
  return (
    <div className="acct" ref={box}>
      <button
        type="button"
        className="acct-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="acct-menu"
        aria-label={`Account menu: ${name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <UserIcon />
        <span className="acct-name">{name}</span>
        <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="acct-menu" id="acct-menu">
          <div className="acct-who">
            <b>{name}</b>
            <span>{user.email}</span>
          </div>
          <a href="/#favorites">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
            </svg>
            My favourites
          </a>
          <a href="/app?account" aria-current={current === 'account' ? 'page' : undefined}>
            <UserIcon />
            My account
          </a>
          {isAdmin && (
            <a href="/app" aria-current={current === 'admin' ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
              </svg>
              Admin page
            </a>
          )}
          <button type="button" className="acct-out" onClick={onSignOut}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Top bar of the app pages: logo (home page) and the profile menu. */
export function SiteHeader({
  user,
  onSignOut,
  current,
}: {
  user: User;
  onSignOut: () => void;
  current?: 'account' | 'admin';
}) {
  return (
    <header className="sitebar">
      <div className="sitebar-in">
        <Brand />
        <AccountMenu user={user} onSignOut={onSignOut} current={current} />
      </div>
    </header>
  );
}
