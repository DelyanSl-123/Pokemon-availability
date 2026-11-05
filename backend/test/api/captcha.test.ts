import { describe, expect, it, vi } from 'vitest';
import { captchaFromEnv, createTurnstile } from '../../src/api/captcha';

const reply = (body: unknown) => vi.fn(async () => ({ json: async () => body }) as Response);

describe('Turnstile captcha', () => {
  it('accepts only a token that Cloudflare confirms', async () => {
    const f = reply({ success: true });
    const c = createTurnstile('site', 'secret', f as never);
    expect(await c.verify('tok', '1.2.3.4')).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('challenges.cloudflare.com');
    expect(init.body).toContain('secret=secret');
    expect(init.body).toContain('response=tok');
    expect(await createTurnstile('s', 'k', reply({ success: false }) as never).verify('tok', 'ip')).toBe(false);
  });

  it('rejects a missing token without calling Cloudflare, and fails closed on errors', async () => {
    const f = reply({ success: true });
    expect(await createTurnstile('s', 'k', f as never).verify(undefined, 'ip')).toBe(false);
    expect(f).not.toHaveBeenCalled();
    const boom = vi.fn(async () => { throw new Error('network'); });
    expect(await createTurnstile('s', 'k', boom as never).verify('tok', 'ip')).toBe(false);
  });

  it('is only enabled when both keys are set', () => {
    expect(captchaFromEnv({})).toBeUndefined();
    expect(captchaFromEnv({ TURNSTILE_SITE_KEY: 'a' })).toBeUndefined();
    expect(captchaFromEnv({ TURNSTILE_SITE_KEY: 'a', TURNSTILE_SECRET: 'b' })?.siteKey).toBe('a');
  });
});
