import 'server-only';
import { makeT, type Lang, type T } from '@/i18n/core';
import { DICTS } from '@/i18n/dicts';
import type { PaymentRequest } from '@/modules/store/types';

/**
 * Emails from the studio (spec §6 R5: payment emails). SMTP through the owner's Namecheap Private
 * Email mailbox: SMTP_HOST (default mail.privateemail.com), SMTP_PORT (465, TLS), SMTP_USER (the
 * mailbox, default: the support email in the business settings) and SMTP_PASSWORD (a secret the
 * owner sets; never in code or config). Without a password, emails are skipped and logged.
 *
 * Test runs (MAIL_OUTBOX=memory, with the in-memory store) keep messages in an outbox instead.
 */
export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers (e.g. List-Unsubscribe for reminder emails). */
  headers?: Record<string, string>;
  /** Where a reply goes (a portfolio visitor's address for contact messages). */
  replyTo?: string;
};
export type MailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: 'not_configured' | 'no_recipient' | 'failed'; message?: string };

type Outbox = Mail[];
const g = globalThis as unknown as { __cvsOutbox?: Outbox };
const outboxMode = () =>
  process.env.MAIL_OUTBOX === 'memory' && process.env.DATA_STORE === 'memory';

export function testOutbox(): Outbox {
  g.__cvsOutbox ??= [];
  return g.__cvsOutbox;
}

export function mailSettings(fallbackUser = '') {
  const user = process.env.SMTP_USER || fallbackUser;
  return {
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: Number(process.env.SMTP_PORT || 465),
    user,
    from: process.env.SMTP_FROM || (user ? `AI CV Studio <${user}>` : ''),
    configured: outboxMode() || (!!user && !!process.env.SMTP_PASSWORD),
  };
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

export async function sendMail(mail: Mail, fallbackUser = ''): Promise<MailResult> {
  if (!EMAIL.test(mail.to)) return { ok: false, reason: 'no_recipient' };
  if (outboxMode()) {
    testOutbox().push(mail);
    return { ok: true, id: `outbox-${testOutbox().length}` };
  }
  const s = mailSettings(fallbackUser);
  if (!s.configured) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        area: 'notify',
        event: 'mail_skipped',
        reason: 'not_configured',
      }),
    );
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const { createTransport } = await import('nodemailer');
    const t = createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465,
      auth: { user: s.user, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    const info = await t.sendMail({ from: s.from, ...mail });
    console.log(JSON.stringify({ level: 'info', area: 'notify', event: 'mail_sent' }));
    return { ok: true, id: info.messageId };
  } catch (e) {
    const message = (e as Error).message.slice(0, 200);
    console.error(
      JSON.stringify({ level: 'error', area: 'notify', event: 'mail_failed', message }),
    );
    return { ok: false, reason: 'failed', message };
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function wrapHtml(title: string, paragraphs: string[], footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#faf8f4;font-family:Arial,Helvetica,sans-serif;color:#1b1f24">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:14px;color:#1e5a55;font-weight:bold;margin:0 0 16px">AI CV Studio</p>
<h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${p}</p>`).join('\n')}
<p style="font-size:13px;color:#5b616b;margin-top:24px">${footer}</p>
</div></body></html>`;
}

/** The site address used in emails (staging sets PUBLIC_SITE_URL to its own address). */
export const SITE = (process.env.PUBLIC_SITE_URL || 'https://aicvstudio.app').replace(/\/$/, '');

/** Emails go out in the recipient's interface language (saved with their account). */
const words = (lang: Lang = 'en'): { t: T; locale: string } => ({
  t: makeT(DICTS[lang] ?? null),
  locale: lang === 'de' ? 'de-DE' : 'en-GB',
});
const fmtDate = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

/** The owner's wording for payment emails (Console → Settings → Emails). */
export type EmailWording = {
  approved: { subject: string; note: string };
  rejected: { subject: string; note: string };
};

/** The buyer's email when their order is approved or rejected. */
export function paymentEmail(
  p: PaymentRequest,
  opts: {
    expiresAt?: string | null;
    reason?: string;
    supportEmail?: string;
    /** The owner's wording from the Console: subject ({order} is filled in) and a short note. */
    wording?: EmailWording;
    lang?: Lang;
  },
): Mail | null {
  if (!p.email) return null;
  const { t, locale } = words(opts.lang);
  const order = p.orderNo ?? p.reference;
  const w = opts.wording;
  const subjectOf = (custom: string | undefined, fallback: string) =>
    (custom?.trim() ? t(custom).replace(/\{order\}/g, order) : fallback).slice(0, 160);
  const help = opts.supportEmail
    ? t('Questions? Reply to this email or write to {email}.', { email: opts.supportEmail })
    : t('Questions? Just reply to this email.');
  const footer = esc(t('You get this email because you placed an order on aicvstudio.app.'));
  if (p.status === 'approved') {
    const until = opts.expiresAt ? fmtDate(opts.expiresAt, locale) : '';
    const note = t(w?.approved.note.trim() ?? '');
    const lines = [
      until
        ? t(
            'Thank you — we received your payment for order {order}. Your {pass} is now active until {until}.',
            { order, pass: t(p.passLabel), until },
          )
        : t('Thank you — we received your payment for order {order}. Your {pass} is now active.', {
            order,
            pass: t(p.passLabel),
          }),
      `${t('Every design, more downloads and AI help are ready for you:')} ${SITE}/cv`,
      note,
      help,
    ].filter(Boolean);
    return {
      to: p.email,
      subject: subjectOf(w?.approved.subject, t('Premium is active — order {order}', { order })),
      text: lines.join('\n\n'),
      html: wrapHtml(
        t('Your Premium is active'),
        [
          esc(lines[0]!),
          `${esc(t('Every design, more downloads and AI help are ready for you:'))} <a href="${SITE}/cv" style="color:#1e5a55">${esc(t('open your CVs'))}</a>.`,
          ...(note ? [esc(note)] : []),
          esc(help),
        ],
        footer,
      ),
    };
  }
  if (p.status === 'rejected') {
    const lines = [
      t('We couldn’t confirm the payment for order {order}.', { order }),
      opts.reason ? t('Reason: {reason}', { reason: opts.reason }) : '',
      `${t('If you have paid, please send the payment screenshot with your order number on WhatsApp, or place a new order:')} ${SITE}/premium`,
      t(w?.rejected.note.trim() ?? ''),
      help,
    ].filter(Boolean);
    return {
      to: p.email,
      subject: subjectOf(w?.rejected.subject, t('About your order {order}', { order })),
      text: lines.join('\n\n'),
      html: wrapHtml(t('We couldn’t confirm your payment'), lines.map(esc), footer),
    };
  }
  return null;
}

export function testEmail(to: string): Mail {
  const text =
    'This is a test email from the AI CV Studio console. If you can read it, emails to buyers will arrive too.';
  return {
    to,
    subject: 'Test email from AI CV Studio',
    text,
    html: wrapHtml(
      'Test email',
      [esc(text)],
      'You get this email because you placed an order on aicvstudio.app.',
    ),
  };
}

/** One line per due reminder: "Follow up with Acme — Delivery Driver at Acme (due 16 Nov)". */
type DigestItem = {
  job: { id: string; title: string; company: string };
  reminder: { note: string; on: string };
};

const dayLabel = (on: string, locale: string) =>
  new Date(`${on}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * The daily reminders digest (R9.6). Every reminder links to its job; the email and its headers
 * carry a one-click way to stop reminder emails (RFC 8058).
 */
export function reminderEmail(
  to: string,
  items: DigestItem[],
  opts: { today: string; unsubscribeUrl: string; lang?: Lang },
): Mail {
  const { t, locale } = words(opts.lang);
  const line = (i: DigestItem) => {
    const job = i.job.company
      ? t('{title} at {company}', { title: i.job.title, company: i.job.company })
      : i.job.title;
    const when =
      i.reminder.on < opts.today
        ? ` (${t('since {day}', { day: dayLabel(i.reminder.on, locale) })})`
        : '';
    return {
      text: `${i.reminder.note || t('Reminder')} — ${job}${when}`,
      url: `${SITE}/jobs/${i.job.id}`,
    };
  };
  const lines = items.map(line);
  const n = items.length;
  const subject =
    n === 1
      ? `${t('Reminder')}: ${items[0]!.reminder.note || items[0]!.job.title}`
      : t('{n} reminders for today', { n });
  const text = [
    n === 1
      ? t('You asked us to remind you today:')
      : t('You asked us to remind you about {n} things:', { n }),
    ...lines.map((l) => `- ${l.text}\n  ${l.url}`),
    `${t('All your jobs:')} ${SITE}/jobs`,
    `${t('Stop reminder emails:')} ${opts.unsubscribeUrl}`,
  ].join('\n\n');
  const html = wrapHtml(
    n === 1 ? t('Your reminder for today') : t('Your reminders for today'),
    [
      ...lines.map(
        (l) => `<a href="${esc(l.url)}" style="color:#1e5a55;font-weight:bold">${esc(l.text)}</a>`,
      ),
      `<a href="${SITE}/jobs" style="color:#1e5a55">${esc(t('Open your job tracker'))}</a>`,
    ],
    `${esc(t('You get this email because you set reminders on aicvstudio.app.'))} <a href="${esc(opts.unsubscribeUrl)}" style="color:#5b616b">${esc(t('Stop reminder emails'))}</a>.`,
  );
  return {
    to,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * A comment notice (R9.7). It never carries the reviewer's words or name: anyone holding the link
 * can write a comment, so the email only says there are new ones and links to the studio.
 */
export function commentEmail(
  to: string,
  opts: { cvTitle: string; open: number; docId: string; lang?: Lang },
): Mail {
  const { t } = words(opts.lang);
  const url = `${SITE}/cv/${encodeURIComponent(opts.docId)}?tab=check#comments`;
  const settings = `${SITE}/cv/${encodeURIComponent(opts.docId)}/download`;
  const title = opts.cvTitle.trim().slice(0, 80) || t('your CV');
  const subject = t('New comment on {title}', { title });
  const count =
    opts.open === 1
      ? t('There is 1 comment waiting for you.')
      : t('There are {open} comments waiting for you.', { open: opts.open });
  const text = [
    t('Someone you shared a link with left a comment on “{title}”.', { title }),
    count,
    `${t('Read them in your studio:')} ${url}`,
    `${t('To stop these emails or comments, change the link’s settings:')} ${settings}`,
  ].join('\n\n');
  const html = wrapHtml(
    t('New comment on your CV'),
    [
      esc(t('Someone you shared a link with left a comment on “{title}”.', { title })),
      esc(count),
      `<a href="${esc(url)}" style="color:#1e5a55;font-weight:bold">${esc(t('Read the comments'))}</a>`,
    ],
    `${esc(t('You get this email because comments are on for a link to your CV.'))} <a href="${esc(settings)}" style="color:#5b616b">${esc(t('Change the link’s settings'))}</a>.`,
  );
  return { to, subject, text, html };
}

/**
 * A message from a portfolio page's contact form (R9.8). The visitor's words go to the owner,
 * clearly marked as coming from someone on the internet; replying answers the visitor directly.
 * The owner's address is never shown to the visitor.
 */
export function contactEmail(
  to: string,
  m: { name: string; email: string; message: string; slug: string },
  lang?: Lang,
): Mail {
  const { t } = words(lang);
  const page = `${SITE}/p/${encodeURIComponent(m.slug)}`;
  const settings = `${SITE}/portfolio`;
  const name = m.name.slice(0, 80);
  const subject = t('Message from {name} through your portfolio page', { name });
  const note = t(
    'Someone used the contact form on your portfolio page. We don’t check who sends messages, so be careful with links and requests for money or personal details.',
  );
  const text = [
    note,
    `${t('From:')} ${name} <${m.email}>`,
    m.message,
    t('Reply to this email to answer {name}.', { name }),
    `${t('Your page:')} ${page}`,
    `${t('To stop messages, turn off the contact form:')} ${settings}`,
  ].join('\n\n');
  const html = wrapHtml(
    t('A message through your portfolio page'),
    [
      `<strong>${esc(t('From:'))}</strong> ${esc(name)} &lt;${esc(m.email)}&gt;`,
      `<span style="white-space:pre-wrap">${esc(m.message)}</span>`,
      esc(t('Reply to this email to answer {name}.', { name })),
      `<span style="color:#5b616b;font-size:13px">${esc(note)}</span>`,
    ],
    `${esc(t('You get this email because the contact form is on for your portfolio page.'))} <a href="${esc(page)}" style="color:#5b616b">${esc(t('Open your page'))}</a> · <a href="${esc(settings)}" style="color:#5b616b">${esc(t('Turn it off'))}</a>.`,
  );
  return { to, subject, text, html, replyTo: m.email };
}
