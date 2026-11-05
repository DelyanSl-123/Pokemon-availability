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

/** The activation e-mail: a link that is valid for `hours` hours. */
export function buildActivationEmail(to: string, firstName: string | null, link: string, hours: number): Message {
  const hello = firstName ? `Hello ${firstName},` : 'Hello,';
  const text =
    `${hello}\n\nThank you for registering at CollectibleMarket.\n` +
    `Open this link to activate your account (valid for ${hours} hours):\n\n${link}\n\n` +
    `If you did not register, you can ignore this message.`;
  const html =
    `<p>${esc(hello)}</p><p>Thank you for registering at CollectibleMarket.</p>` +
    `<p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#e3350d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Activate my account</a></p>` +
    `<p>Or copy this link into your browser (valid for ${hours} hours):<br>${esc(link)}</p>` +
    `<p style="color:#666">If you did not register, you can ignore this message.</p>`;
  return { to, subject: 'Activate your CollectibleMarket account', text, html };
}
