import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentRequest } from '@/modules/store/types';
import {
  commentEmail,
  mailSettings,
  paymentEmail,
  reminderEmail,
  sendMail,
  testEmail,
} from './server';

const order = (o: Partial<PaymentRequest>): PaymentRequest =>
  ({
    id: 'r1',
    uid: 'u1',
    email: 'buyer@example.com',
    passId: 'month',
    passLabel: '1 month',
    days: 30,
    pricePkr: 499,
    methodId: 'jazz',
    methodLabel: 'JazzCash',
    reference: '',
    orderNo: 'CV-7KQ2M9',
    status: 'approved',
    createdAt: '2026-11-12T10:00:00.000Z',
    ...o,
  }) as PaymentRequest;

afterEach(() => vi.unstubAllEnvs());

describe('payment emails', () => {
  it('says Premium is active, until when, with the order number', () => {
    const m = paymentEmail(order({}), {
      expiresAt: '2026-12-12T10:00:00.000Z',
      supportEmail: 'help@x.com',
    })!;
    expect(m.to).toBe('buyer@example.com');
    expect(m.subject).toBe('Premium is active — order CV-7KQ2M9');
    expect(m.text).toContain('until 12 December 2026');
    expect(m.text).toContain('help@x.com');
    expect(m.html).toContain('Your Premium is active');
  });

  it('gives the reason when rejected, escaping it in HTML', () => {
    const m = paymentEmail(order({ status: 'rejected' }), { reason: 'Amount <wrong>' })!;
    expect(m.subject).toBe('About your order CV-7KQ2M9');
    expect(m.text).toContain('Reason: Amount <wrong>');
    expect(m.html).toContain('Amount &lt;wrong&gt;');
  });

  it('uses the owner’s subject and note from the Console, escaped', () => {
    const wording = {
      approved: { subject: 'Welcome to Premium ({order})', note: 'Shukriya <3' },
      rejected: { subject: '', note: 'Call us on 0300' },
    };
    const a = paymentEmail(order({}), { wording })!;
    expect(a.subject).toBe('Welcome to Premium (CV-7KQ2M9)');
    expect(a.text).toContain('Shukriya <3');
    expect(a.html).toContain('Shukriya &lt;3');
    const r = paymentEmail(order({ status: 'rejected' }), { wording })!;
    expect(r.subject).toBe('About your order CV-7KQ2M9');
    expect(r.text).toContain('Call us on 0300');
  });

  it('sends nothing without a buyer email or for other statuses', () => {
    expect(paymentEmail(order({ email: null }), {})).toBeNull();
    expect(paymentEmail(order({ status: 'pending' }), {})).toBeNull();
  });
});

describe('sendMail', () => {
  it('is skipped, not failed, when the mailbox password is not set', async () => {
    vi.stubEnv('MAIL_OUTBOX', '');
    vi.stubEnv('SMTP_PASSWORD', '');
    vi.stubEnv('SMTP_USER', 'support@aicvstudio.app');
    expect(mailSettings().configured).toBe(false);
    expect(await sendMail(testEmail('a@b.co'))).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('refuses a bad recipient', async () => {
    expect(await sendMail(testEmail('not an email'))).toEqual({
      ok: false,
      reason: 'no_recipient',
    });
  });

  it('defaults to Namecheap Private Email over TLS, from the support mailbox', () => {
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_PORT', '');
    expect(mailSettings('support@aicvstudio.app')).toMatchObject({
      host: 'mail.privateemail.com',
      port: 465,
      from: 'AI CV Studio <support@aicvstudio.app>',
    });
  });
});

describe('emails in German', () => {
  it('writes reminder and comment emails in the person’s language', () => {
    const r = reminderEmail(
      'a@example.com',
      [
        {
          job: { id: 'j1', title: 'Fahrer', company: 'DHL' },
          reminder: { note: '', on: '2026-11-14' },
        },
      ],
      { today: '2026-11-15', unsubscribeUrl: 'https://x/stop', lang: 'de' },
    );
    expect(r.subject).toBe('Erinnerung: Fahrer');
    expect(r.text).toContain('Fahrer bei DHL');
    expect(r.text).toContain('seit');
    const c = commentEmail('a@example.com', {
      cvTitle: 'Mein Lebenslauf',
      open: 2,
      docId: 'd',
      lang: 'de',
    });
    expect(c.subject).toBe('Neuer Kommentar zu Mein Lebenslauf');
    expect(c.text).toContain('2 Kommentare warten auf Sie.');
    const en = commentEmail('a@example.com', { cvTitle: 'My CV', open: 2, docId: 'd' });
    expect(en.subject).toBe('New comment on My CV');
  });
});
