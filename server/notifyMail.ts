/**
 * Optional SMTP for the directed-notify email fallback.
 * Unset host or from-address means email is off — push still works.
 * The import is dynamic so the desktop packager does not ship this module.
 * Cloud Run installs it with `npm ci`.
 *
 * Secrets stay in the process environment (Cloud Run / Secret Manager).
 * Never a VITE_ variable.
 */
export type NotifyMail = {
  to: string;
  subject: string;
  text: string;
};

export function notifyMailConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} | null {
  const host = (process.env.NOTIFY_SMTP_HOST || '').trim();
  const from = (process.env.NOTIFY_EMAIL_FROM || '').trim();
  if (!host || !from) return null;
  const port = Number(process.env.NOTIFY_SMTP_PORT || '587');
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user: (process.env.NOTIFY_SMTP_USER || '').trim(),
    pass: process.env.NOTIFY_SMTP_PASS || '',
    from,
  };
}

export function isNotifyEmailConfigured(): boolean {
  return notifyMailConfig() !== null;
}

export async function sendNotifyMail(mail: NotifyMail): Promise<void> {
  const config = notifyMailConfig();
  if (!config) throw new Error('Email is not set up on this server.');
  const nodemailer = (await import('nodemailer')) as {
    createTransport: (opts: object) => {
      sendMail: (opts: { from: string; to: string; subject: string; text: string }) => Promise<unknown>;
    };
  };
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  await transport.sendMail({
    from: config.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
}
