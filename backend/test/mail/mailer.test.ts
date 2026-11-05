import { describe, expect, it, vi } from 'vitest';
import { buildActivationEmail, createMailer, mailConfigFromEnv } from '../../src/mail/mailer';

describe('mailConfigFromEnv', () => {
  it('cleans pasted values and picks sensible defaults', () => {
    const cfg = mailConfigFromEnv({ SMTP_HOST: ' "smtp.gmail.com" ', SMTP_PORT: '465', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' });
    expect(cfg).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'abcdefghijklmnop', from: 'me@gmail.com' });
    expect(mailConfigFromEnv({}).host).toBeUndefined();
  });
});

describe('createMailer', () => {
  it('prints instead of sending when SMTP is not configured', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await createMailer(mailConfigFromEnv({})).send(buildActivationEmail('a@test.com', 'Ivan', 'https://x.test/?activate=abc', 24));
    expect(res.sent).toBe(false);
    expect(log.mock.calls[0][0]).toContain('https://x.test/?activate=abc');
    log.mockRestore();
  });
});

describe('buildActivationEmail', () => {
  it('contains the link and escapes the name in the HTML part', () => {
    const m = buildActivationEmail('a@test.com', '<b>Ivan</b>', 'https://x.test/?activate=abc&x=1', 24);
    expect(m.text).toContain('https://x.test/?activate=abc&x=1');
    expect(m.html).toContain('&lt;b&gt;Ivan&lt;/b&gt;');
    expect(m.html).toContain('href="https://x.test/?activate=abc&amp;x=1"');
    expect(m.to).toBe('a@test.com');
  });
});
