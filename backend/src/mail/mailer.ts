import * as nodemailer from 'nodemailer';

/**
 * Sends the account e-mails (activation link). SMTP settings come from the environment;
 * without SMTP_HOST nothing is sent and the message is printed to the server log instead.
 */
export interface MailConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export interface Mailer {
  send(message: Message): Promise<SendResult>;
}

/** Secrets pasted into GitHub/hosting forms often carry quotes or line breaks. */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/^["']|["']$/g, '').trim();
  return t ? t : undefined;
}

export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const port = Number(clean(env.SMTP_PORT) || 587);
  const secure = clean(env.SMTP_SECURE);
  return {
    host: clean(env.SMTP_HOST),
    port,
    secure: secure ? secure.toLowerCase() === 'true' : port === 465,
    user: clean(env.SMTP_USER),
    pass: clean(env.SMTP_PASS)?.replace(/\s+/g, ''), // Google shows app passwords with spaces
    from: clean(env.MAIL_FROM) || clean(env.SMTP_USER) || 'noreply@localhost',
  };
}

export function createMailer(cfg: MailConfig): Mailer {
  return {
    async send(m) {
      if (!cfg.host) {
        console.log(`[mail] SMTP not configured, message for ${m.to} printed instead:\n${m.subject}\n\n${m.text}`);
        return { sent: false, reason: 'SMTP is not configured' };
      }
      try {
        const t = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
        });
        await t.sendMail({ from: cfg.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
        return { sent: true };
      } catch (e) {
        return { sent: false, reason: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function actionEmail(o: { to: string; subject: string; hello: string; intro: string; button: string; link: string; note: string }): Message {
  const text = `${o.hello}\n\n${o.intro}\n\n${o.link}\n\n${o.note}`;
  const html =
    `<p>${esc(o.hello)}</p><p>${esc(o.intro)}</p>` +
    `<p><a href="${esc(o.link)}" style="display:inline-block;padding:10px 18px;background:#e3350d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${esc(o.button)}</a></p>` +
    `<p>Or copy this link into your browser:<br>${esc(o.link)}</p><p style="color:#666">${esc(o.note)}</p>`;
  return { to: o.to, subject: o.subject, text, html };
}

const greeting = (firstName: string | null) => (firstName ? `Hello ${firstName},` : 'Hello,');

/** The activation e-mail: a link that is valid for `hours` hours. */
export function buildActivationEmail(to: string, firstName: string | null, link: string, hours: number): Message {
  return actionEmail({
    to,
    subject: 'Activate your CollectibleMarket account',
    hello: greeting(firstName),
    intro: `Thank you for registering at CollectibleMarket. Open this link to activate your account (valid for ${hours} hours):`,
    button: 'Activate my account',
    link,
    note: 'If you did not register, you can ignore this message.',
  });
}

export function buildPasswordResetEmail(to: string, firstName: string | null, link: string, hours: number): Message {
  return actionEmail({
    to,
    subject: 'Reset your CollectibleMarket password',
    hello: greeting(firstName),
    intro: `We received a request to reset your password. Open this link to choose a new one (valid for ${hours} hour${hours === 1 ? '' : 's'}):`,
    button: 'Choose a new password',
    link,
    note: 'If you did not ask for this, ignore this message: your password stays the same.',
  });
}

export function buildEmailChangeEmail(to: string, firstName: string | null, link: string, hours: number): Message {
  return actionEmail({
    to,
    subject: 'Confirm your new CollectibleMarket email address',
    hello: greeting(firstName),
    intro: `Open this link to confirm that this is your new email address for CollectibleMarket (valid for ${hours} hours):`,
    button: 'Confirm email address',
    link,
    note: 'If you did not ask for this, ignore this message: the address on the account stays the same.',
  });
}

const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tells the admin that a visitor suggested a shop on the home page. */
export function buildShopSuggestionEmail(to: string, url: string, note: string): Message {
  const text = `A visitor suggested a shop for CollectibleMarket:\n\n${url}\n\n${note ? `Note: ${note}\n\n` : ''}Open the link only if it looks like a real shop.`;
  const html =
    `<p>A visitor suggested a shop for CollectibleMarket:</p><p><b>${escHtml(url)}</b></p>` +
    (note ? `<p>Note: ${escHtml(note)}</p>` : '') +
    '<p>Open the link only if it looks like a real shop.</p>';
  return { to, subject: 'CollectibleMarket: a shop was suggested', text, html };
}
