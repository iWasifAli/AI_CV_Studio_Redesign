'use client';

import { useT } from '@/i18n/client';
import { InviteCard } from '@/features/referrals/invite-card';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CircleCheck, LogOut, MailWarning } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAccount } from './account-context';
import { useEntitlements } from './entitlements';
import { TextField } from '@/components/ui/field';
import {
  AuthUiError,
  authMessage,
  refreshVerification,
  resendVerification,
} from './firebase-client';
import { InstallApp } from '@/features/app/install-app';

export function AccountScreen() {
  const t = useT();
  const account = useAccount();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const { ent } = useEntitlements();
  // Signing out on purpose goes home, not to the sign-in page.
  const leaving = useRef(false);

  useEffect(() => {
    if (account.status === 'signedOut' && !leaving.current) router.replace('/signin?next=/account');
  }, [account.status, router]);

  if (account.status !== 'signedIn' || !account.user) {
    return (
      <div
        className="skeleton h-48 rounded-lg"
        aria-busy="true"
        aria-label={t('Loading your account')}
      />
    );
  }
  const u = account.user;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show({ tone: 'error', message: authMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section
        className="border-line bg-surface shadow-1 flex flex-col gap-4 rounded-lg border p-5"
        aria-labelledby="acc-h"
      >
        <h2 id="acc-h" className="text-xl font-semibold">
          {t('Your account')}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          {u.name && (
            <>
              <dt className="text-ink-muted">{t('Name')}</dt>
              <dd className="font-semibold">{u.name}</dd>
            </>
          )}
          <dt className="text-ink-muted">{t('Email')}</dt>
          <dd className="flex flex-wrap items-center gap-2 font-semibold">
            {u.email}
            {u.emailVerified ? (
              <span className="text-success inline-flex items-center gap-1 text-sm font-semibold">
                <CircleCheck aria-hidden size={16} /> {t('Verified')}
              </span>
            ) : (
              <span className="text-warning inline-flex items-center gap-1 text-sm font-semibold">
                <MailWarning aria-hidden size={16} /> {t('Not verified yet')}
              </span>
            )}
          </dd>
          <dt className="text-ink-muted">{t('Your CVs')}</dt>
          <dd>
            {t('Saved to your account and available wherever you sign in.')}{' '}
            {account.sync === 'syncing' && <span className="text-ink-muted">{t('Saving…')}</span>}
            {account.sync === 'offline' && (
              <span className="text-warning">
                {t('Offline — changes will save when you are back online.')}
              </span>
            )}
            {account.sync === 'error' && (
              <span className="text-danger">
                {t('Some changes could not be saved yet. We will keep trying.')}
              </span>
            )}
          </dd>
        </dl>
        {!u.emailVerified && (
          <Banner tone="warning" title={t('Please verify your email')}>
            <p>
              {t(
                'We sent a link to {email}. Verifying lets us reach you about payments and keeps your account safe.',
                { email: u.email },
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'resend'}
                onClick={() =>
                  void run('resend', async () => {
                    await resendVerification();
                    toast.show({ tone: 'success', message: 'Verification email sent.' });
                  })
                }
              >
                {t('Send the link again')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={busy === 'check'}
                onClick={() =>
                  void run('check', async () => {
                    const ok = await refreshVerification();
                    await account.refresh();
                    toast.show({
                      tone: ok ? 'success' : 'neutral',
                      message: ok
                        ? 'Thanks — your email is verified.'
                        : 'Not verified yet. Open the link in the email first.',
                    });
                  })
                }
              >
                {t('I have verified it')}
              </Button>
            </div>
          </Banner>
        )}
      </section>

      {ent && ent.plan !== 'visitor' && (
        <section
          aria-labelledby="plan-h"
          data-testid="plan"
          className="border-line bg-surface shadow-1 flex flex-col gap-4 rounded-lg border p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plan-h" className="text-xl font-semibold">
              {t('Your plan: {planLabel}', { planLabel: ent.planLabel })}
            </h2>
            {ent.plan === 'premium' && ent.passExpiresAt && (
              <p className="text-ink-muted text-sm">
                {t('Premium until{v} {v2}', {
                  v: ' ',
                  v2: new Date(ent.passExpiresAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })}
              </p>
            )}
          </div>
          <dl className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['pdf.download', 'PDF downloads'],
                ['import.cv', 'CV imports'],
                ['ai.action', 'AI actions'],
              ] as const
            ).map(([k, label]) => {
              const lim = ent.limits[k];
              return (
                <div key={k} className="bg-sunken rounded-md px-3 py-2">
                  <dt className="text-ink-muted text-sm">
                    {label} {t('this month')}
                  </dt>
                  <dd className="font-semibold">
                    {lim === 0
                      ? t('Premium only')
                      : lim === -1
                        ? t('{v0} used', { v0: ent.usage[k] })
                        : `${ent.usage[k]} of ${lim}`}
                  </dd>
                </div>
              );
            })}
          </dl>
          {ent.plan !== 'premium' && ent.features.sales && ent.passes.length > 0 && (
            <ButtonLink href="/premium" className="self-start">
              {t('See Premium')}
            </ButtonLink>
          )}
        </section>
      )}

      {ent && ent.plan !== 'visitor' && ent.features.reminders && <ReminderEmails />}

      {ent && ent.plan !== 'visitor' && <InviteCard />}

      <InstallApp />

      <section className="flex flex-wrap gap-3" aria-label={t('Account actions')}>
        <ButtonLink href="/documents" variant="secondary">
          {t('Documents')}
        </ButtonLink>
        <Button
          variant="ghost"
          icon={<LogOut aria-hidden size={18} />}
          loading={busy === 'out'}
          onClick={() =>
            void run('out', async () => {
              leaving.current = true;
              await account.signOut();
              router.replace('/');
            })
          }
        >
          {t('Sign out')}
        </Button>
        <Button
          variant="ghost"
          loading={busy === 'all'}
          onClick={() =>
            void run('all', async () => {
              leaving.current = true;
              await account.signOut(true);
              router.replace('/');
            })
          }
        >
          {t('Sign out on all devices')}
        </Button>
      </section>
      <p className="text-ink-muted text-sm">
        {t(
          'Signing out removes your account’s CVs from this device. They stay safe in your account.',
        )}
      </p>

      {!u.admin && (
        <section aria-labelledby="del-h" className="border-line flex flex-col gap-3 border-t pt-6">
          <h2 id="del-h" className="text-lg font-semibold">
            {t('Delete your account')}
          </h2>
          <p className="text-ink-muted text-sm">
            {t(
              'This permanently deletes your account and every CV in it, including earlier versions. It can’t be undone — download any CV you want to keep first.',
            )}
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run('delete', async () => {
                const r = await fetch('/api/me', {
                  method: 'DELETE',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ confirm }),
                });
                if (!r.ok) {
                  const j = (await r.json().catch(() => null)) as {
                    error?: { message?: string };
                  } | null;
                  throw new AuthUiError(j?.error?.message ?? 'That didn’t work. Please try again.');
                }
                leaving.current = true;
                await account.signOut();
                toast.show({ tone: 'success', message: 'Your account has been deleted.' });
                router.replace('/');
              });
            }}
          >
            <TextField
              label={t('Type DELETE to confirm')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              containerClassName="w-56"
            />
            <Button
              type="submit"
              variant="danger"
              disabled={confirm !== 'DELETE'}
              loading={busy === 'delete'}
            >
              {t('Delete my account')}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

/** R9.6: the daily reminder email on or off (reminders still show in the studio). */
function ReminderEmails() {
  const t = useT();
  const [state, setState] = useState<{ emails: boolean; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/me/reminders', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setState, () => setState(null));
  }, []);
  if (!state) return null;
  return (
    <section
      id="reminders"
      aria-labelledby="rem-h"
      className="border-line bg-surface flex scroll-mt-20 flex-col gap-3 rounded-lg border p-5"
    >
      <h2 id="rem-h" className="text-xl font-semibold">
        {t('Reminder emails')}
      </h2>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="accent-primary mt-1 size-5"
          checked={state.emails}
          aria-busy={busy}
          onChange={async (e) => {
            const emails = e.target.checked;
            const before = state;
            setState({ ...state, emails });
            setBusy(true);
            try {
              const r = await fetch('/api/me/reminders', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ emails }),
              });
              if (!r.ok) throw new Error();
              const j = (await r.json()) as { emails: boolean };
              setState({ ...before, emails: j.emails });
            } catch {
              setState(before);
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>
          {t('Email me my job reminders at 8:00 on the day')}
          {state.email ? ` ${t('(to {email})', { email: state.email })}` : ''}
          {t('. Reminders always show in your job tracker.')}
        </span>
      </label>
    </section>
  );
}
