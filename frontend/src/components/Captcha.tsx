import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the CAPTCHA'));
    document.head.appendChild(s);
  });
  return loading;
}

/** Cloudflare Turnstile widget; calls onToken with the token (or '' when it expires). */
export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: onToken,
          'expired-callback': () => onToken(''),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, onToken]);

  return <div ref={box} />;
}
