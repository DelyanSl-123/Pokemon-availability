import * as nodemailer from 'nodemailer';
import type { FoundProduct, RunSummary } from './types';

export interface MailConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const port = Number(env.SMTP_PORT || 587); // `||`: an empty value counts as unset
  return {
    host: env.SMTP_HOST || undefined,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASS || undefined,
    from: env.MAIL_FROM || env.SMTP_USER || 'pokemon-tracker@localhost',
  };
}

export interface Digest {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function stockLabel(p: FoundProduct): string {
  if (p.inStock === true) return 'in stock';
  if (p.inStock === false) return 'out of stock';
  return 'stock unknown';
}

function priceLabel(p: FoundProduct): string {
  return p.price === null ? 'price n/a' : `${p.price.toFixed(2)} ${p.currency ?? ''}`.trim();
}

function flags(p: FoundProduct): string[] {
  const out: string[] = [];
  if (p.isNew) out.push('NEW');
  if (p.backInStock) out.push('BACK IN STOCK');
  return out;
}

export function buildDigest(summary: RunSummary): Digest {
  const date = summary.startedAt.slice(0, 10);
  const inStock = summary.products.filter((p) => p.inStock !== false).length;
  const newCount = summary.products.filter((p) => p.isNew).length;
  const subject = `Pokémon TCG: ${inStock} in stock, ${newCount} new (${date})`;

  const textParts: string[] = [`Pokémon TCG check for ${date} (search: "${summary.query}")`, ''];
  const htmlParts: string[] = [
    `<h2>Pokémon TCG check for ${esc(date)}</h2>`,
    `<p>Search phrase: <i>${esc(summary.query)}</i></p>`,
  ];

  if (summary.products.length === 0) {
    textParts.push('No Pokémon TCG products were found today.', '');
    htmlParts.push('<p>No Pokémon TCG products were found today.</p>');
  }

  for (const shop of summary.shops) {
    const items = summary.products
      .filter((p) => p.shopId === shop.shopId)
      .sort((a, b) => Number(b.inStock === true) - Number(a.inStock === true));

    textParts.push(`== ${shop.shopName} (${items.length} found) ==`);
    htmlParts.push(`<h3>${esc(shop.shopName)} (${items.length} found)</h3>`);
    if (shop.searchUrl) {
      textParts.push(`Page: ${shop.searchUrl}`);
      htmlParts.push(`<p>Page: <a href="${esc(shop.searchUrl)}">${esc(shop.searchUrl)}</a></p>`);
    }

    if (shop.status !== 'ok') {
      const msg = `Could not check this page (${shop.status}): ${shop.message ?? 'unknown problem'}`;
      textParts.push(`! ${msg}`, '');
      htmlParts.push(`<p style="color:#b45309">⚠ ${esc(msg)}</p>`);
      continue;
    }
    if (items.length === 0) {
      textParts.push('No Pokémon TCG products found.', '');
      htmlParts.push('<p>No Pokémon TCG products found.</p>');
      continue;
    }

    htmlParts.push('<ul>');
    for (const p of items) {
      const f = flags(p);
      const prefix = f.length ? `[${f.join(', ')}] ` : '';
      textParts.push(`- ${prefix}${p.title} | ${priceLabel(p)} | ${stockLabel(p)}`, `  ${p.url}`);
      htmlParts.push(
        `<li>${f.length ? `<b>[${esc(f.join(', '))}]</b> ` : ''}<a href="${esc(p.url)}">${esc(p.title)}</a> ` +
          `— ${esc(priceLabel(p))} — ${esc(stockLabel(p))}</li>`,
      );
    }
    textParts.push('');
    htmlParts.push('</ul>');
  }

  return { subject, text: textParts.join('\n'), html: htmlParts.join('\n') };
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendDigest(
  cfg: MailConfig,
  to: string,
  digest: Digest,
  transport?: Pick<nodemailer.Transporter, 'sendMail'>,
): Promise<SendResult> {
  if (!transport && !cfg.host) {
    console.log(`[mail] SMTP not configured — digest for ${to} printed below\n${digest.subject}\n\n${digest.text}`);
    return { sent: false, reason: 'SMTP is not configured (digest was printed to the server log)' };
  }

  const t =
    transport ??
    nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });

  try {
    await t.sendMail({ from: cfg.from, to, subject: digest.subject, text: digest.text, html: digest.html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
