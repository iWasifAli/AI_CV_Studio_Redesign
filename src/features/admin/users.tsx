'use client';

import { useT } from '@/i18n/client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { AdminHeading } from './admin-shell';
import { adminGet, adminSend } from './api';
import { when } from './overview';

type Pass = {
  plan: 'premium';
  expiresAt: string;
  source: string;
  grantedBy: string;
  note?: string;
};
type UserDetail = {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  disabled: boolean;
  admin: boolean;
  createdAt: string;
  lastSignInAt: string;
  providers: string[];
  plan: string;
  pass: Pass | null;
  usage: Record<string, number>;
};
type ListData = {
  total: number;
  recent: { uid: string; email: string | null; lastSeenAt: string | null }[];
  passes: (Pass & { uid: string; email: string | null })[];
};

const GRANT_OPTIONS = [7, 30, 90, 365];

export function AdminUsers() {
  const t = useT();
  const toast = useToast();
  const [list, setList] = useState<ListData | null>(null);
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<UserDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    adminGet<ListData>('/api/admin/users').then(setList, (e: Error) => setError(e.message));
  }, []);
  useEffect(loadList, [loadList]);

  const lookup = useCallback(async (address: string) => {
    setError(null);
    setBusy(true);
    try {
      const r = await adminGet<{ user: UserDetail | null }>(
        `/api/admin/users?email=${encodeURIComponent(address.trim())}`,
      );
      setUser(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) void lookup(email);
  };

  const act = async (body: Record<string, unknown>, done: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await adminSend(`/api/admin/users/${user.uid}`, 'POST', body);
      toast.show({ tone: 'success', message: done });
      await lookup(user.email ?? email);
      loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const premiumActive = !!user?.pass && user.pass.expiresAt > new Date().toISOString();

  return (
    <>
      <AdminHeading
        title={t('Users')}
        intro="Find an account by email to grant Premium, reset this month's allowance or block sign-in."
      />
      <form onSubmit={onSearch} className="mb-6 flex items-end gap-2" role="search">
        <TextField
          label={t('Email address')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          containerClassName="flex-1"
          autoComplete="off"
        />
        <Button type="submit" icon={<Search aria-hidden size={18} />} disabled={busy}>
          {t('Find')}
        </Button>
      </form>
      {error && (
        <Banner
          tone="error"
          title={t("That didn't work")}
          className="mb-4"
          onDismiss={() => setError(null)}
        >
          {error}
        </Banner>
      )}
      {user === null && <Banner tone="info" title={t('No account uses that email address.')} />}
      {user && (
        <section
          className="border-line bg-surface mb-8 rounded-lg border p-5"
          aria-label={t('Account details')}
          data-testid="admin-user"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{user.name || user.email}</h2>
            <span
              className={
                premiumActive
                  ? 'bg-primary-soft text-primary rounded-full px-3 py-1 text-sm font-semibold'
                  : 'bg-sunken text-ink-muted rounded-full px-3 py-1 text-sm font-semibold'
              }
              data-testid="admin-user-plan"
            >
              {premiumActive ? 'Premium' : 'Free'}
              {user.disabled && ' · blocked'}
              {user.admin && ' · admin'}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-ink-muted">{t('Email')}</dt>
            <dd>
              {user.email} {user.emailVerified ? '(verified)' : '(not verified)'}
            </dd>
            <dt className="text-ink-muted">{t('Signs in with')}</dt>
            <dd>{user.providers.join(', ') || '—'}</dd>
            <dt className="text-ink-muted">{t('Joined')}</dt>
            <dd>{when(user.createdAt)}</dd>
            <dt className="text-ink-muted">{t('Last sign-in')}</dt>
            <dd>{when(user.lastSignInAt)}</dd>
            <dt className="text-ink-muted">{t('Premium until')}</dt>
            <dd data-testid="admin-user-expiry">{user.pass ? when(user.pass.expiresAt) : '—'}</dd>
            <dt className="text-ink-muted">{t('This month')}</dt>
            <dd>
              {t('{v} downloads · {v2} imports ·{v3} {v4} AI actions', {
                v: user.usage['pdf.download'] ?? 0,
                v2: user.usage['import.cv'] ?? 0,
                v3: ' ',
                v4: user.usage['ai.action'] ?? 0,
              })}
            </dd>
          </dl>
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">
                {premiumActive ? 'Extend Premium:' : 'Grant Premium:'}
              </span>
              {GRANT_OPTIONS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act({ action: 'grant', days: d }, `Premium added: ${d} days`)}
                >
                  {t('{d} days', { d: d })}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {user.pass && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    confirm('Remove Premium from this account?') &&
                    act({ action: 'revoke' }, 'Premium removed')
                  }
                >
                  {t('Remove Premium')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => act({ action: 'resetUsage' }, "This month's usage was reset")}
              >
                {t('Reset this month&apos;s usage')}
              </Button>
              <Button
                size="sm"
                variant={user.disabled ? 'secondary' : 'danger'}
                disabled={busy}
                onClick={() =>
                  user.disabled
                    ? act({ action: 'enable' }, 'Sign-in allowed again')
                    : confirm('Block this account from signing in? Their sessions end now.') &&
                      act({ action: 'disable' }, 'Account blocked')
                }
              >
                {user.disabled ? 'Allow sign-in' : 'Block sign-in'}
              </Button>
            </div>
          </div>
        </section>
      )}
      {list && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="border-line bg-surface rounded-lg border p-5">
            <h2 className="mb-3 text-lg font-semibold">{t('Premium accounts')}</h2>
            {list.passes.length === 0 ? (
              <p className="text-ink-muted text-sm">{t('None yet.')}</p>
            ) : (
              <ul className="divide-line divide-y text-sm">
                {list.passes.map((p) => (
                  <li key={p.uid} className="flex justify-between gap-4 py-2">
                    <span className="truncate">{p.email ?? p.uid}</span>
                    <span
                      className={
                        p.expiresAt > new Date().toISOString() ? '' : 'text-ink-subtle line-through'
                      }
                    >
                      {t('until {when}', { when: when(p.expiresAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border-line bg-surface rounded-lg border p-5">
            <h2 className="mb-3 text-lg font-semibold">
              {t('Recently active ({total} accounts)', { total: list.total })}
            </h2>
            <ul className="divide-line divide-y text-sm">
              {list.recent.map((u) => (
                <li key={u.uid} className="flex items-center justify-between gap-4 py-1.5">
                  <button
                    type="button"
                    className="text-primary min-h-9 truncate text-left underline-offset-2 hover:underline"
                    onClick={() => {
                      if (!u.email) return;
                      setEmail(u.email);
                      void lookup(u.email);
                    }}
                  >
                    {u.email ?? u.uid}
                  </button>
                  <span className="text-ink-muted shrink-0">{when(u.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
