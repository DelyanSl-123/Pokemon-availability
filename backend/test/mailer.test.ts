import { describe, expect, it, vi } from 'vitest';
import { buildDigest, sendDigest, type MailConfig } from '../src/mailer';
import type { FoundProduct, RunSummary } from '../src/types';

const product = (over: Partial<FoundProduct>): FoundProduct => ({
  title: 'Pokemon TCG Booster',
  url: 'https://www.ozone.bg/p/1',
  price: 12.99,
  currency: 'BGN',
  inStock: true,
  imageUrl: null,
  shopId: 1,
  shopName: 'ozone.bg',
  isNew: true,
  backInStock: false,
  ...over,
});

const summary: RunSummary = {
  runId: 1,
  startedAt: '2026-10-21T07:00:00.000Z',
  finishedAt: '2026-10-21T07:00:05.000Z',
  source: 'manual',
  query: 'pokemon tcg',
  shops: [
    { shopId: 1, shopName: 'ozone.bg', searchUrl: 'https://www.ozone.bg/search?q=pokemon', status: 'ok', found: 2, newCount: 1, backInStock: 0 },
    { shopId: 2, shopName: 'toyzzshop.bg', status: 'blocked', message: 'Disallowed by robots.txt', found: 0, newCount: 0, backInStock: 0 },
  ],
  products: [
    product({}),
    product({ title: 'Pokemon TCG ETB', url: 'https://www.ozone.bg/p/2', inStock: false, isNew: false }),
  ],
};

describe('buildDigest', () => {
  it('lists products per shop with links, prices and flags', () => {
    const d = buildDigest(summary);
    expect(d.subject).toContain('1 in stock, 1 new');
    expect(d.subject).toContain('2026-10-21');
    expect(d.text).toContain('== ozone.bg (2 found) ==');
    expect(d.text).toContain('Page: https://www.ozone.bg/search?q=pokemon');
    expect(d.html).toContain('<a href="https://www.ozone.bg/search?q=pokemon">');
    expect(d.text).toContain('[NEW] Pokemon TCG Booster | 12.99 BGN | in stock');
    expect(d.text).toContain('https://www.ozone.bg/p/1');
    expect(d.html).toContain('<a href="https://www.ozone.bg/p/1">Pokemon TCG Booster</a>');
  });

  it('labels out-of-stock products', () => {
    const d = buildDigest(summary);
    expect(d.text).toContain('[OUT OF STOCK] Pokemon TCG ETB');
    expect(d.html).toContain('[OUT OF STOCK]</b></span> <a href="https://www.ozone.bg/p/2">');
    expect(d.text).not.toContain('[OUT OF STOCK] Pokemon TCG Booster');
  });

  it('mentions shops that could not be checked', () => {
    const d = buildDigest(summary);
    expect(d.text).toContain('== toyzzshop.bg (0 found) ==');
    expect(d.text).toContain('Disallowed by robots.txt');
  });

  it('escapes HTML in titles', () => {
    const d = buildDigest({ ...summary, products: [product({ title: 'A & B <x>' })] });
    expect(d.html).toContain('A &amp; B &lt;x&gt;');
  });

  it('says so when nothing was found', () => {
    const d = buildDigest({ ...summary, products: [] });
    expect(d.text).toContain('No Pokémon TCG products were found today.');
  });
});

describe('sendDigest', () => {
  const cfg: MailConfig = { host: 'smtp.test', port: 465, secure: true, from: 'tracker@test' };
  const digest = buildDigest(summary);

  it('sends through the given transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const res = await sendDigest(cfg, 'me@test.com', digest, { sendMail } as never);
    expect(res.sent).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'me@test.com', from: 'tracker@test', subject: digest.subject }),
    );
  });

  it('returns the error instead of throwing when sending fails', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await sendDigest(cfg, 'me@test.com', digest, { sendMail } as never);
    expect(res).toEqual({ sent: false, reason: 'boom' });
  });

  it('does not send when SMTP is not configured', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await sendDigest({ ...cfg, host: undefined }, 'me@test.com', digest);
    expect(res.sent).toBe(false);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
