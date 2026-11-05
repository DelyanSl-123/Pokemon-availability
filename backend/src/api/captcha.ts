/** Optional Cloudflare Turnstile check (https://developers.cloudflare.com/turnstile/) for the public forms. */
export interface Captcha {
  /** Public key the browser widget needs. */
  siteKey: string;
  verify(token: string | undefined, ip: string): Promise<boolean>;
}

export function createTurnstile(siteKey: string, secret: string, fetchImpl: typeof fetch = fetch): Captcha {
  return {
    siteKey,
    async verify(token, ip) {
      if (!token) return false;
      try {
        const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
        });
        return ((await res.json()) as { success?: boolean }).success === true;
      } catch {
        return false; // when in doubt, do not let it through
      }
    },
  };
}

/** Turnstile when both keys are set, otherwise no captcha. */
export function captchaFromEnv(env: NodeJS.ProcessEnv = process.env): Captcha | undefined {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  const secret = env.TURNSTILE_SECRET?.trim();
  return siteKey && secret ? createTurnstile(siteKey, secret) : undefined;
}
