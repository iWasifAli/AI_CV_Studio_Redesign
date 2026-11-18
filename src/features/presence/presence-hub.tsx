'use client';

import { workspaceFetch } from '@/features/workspace/request';

import { useWorkspaceTask } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Copy, ExternalLink, Globe, IdCard, Link2, Mail } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAccount } from '@/features/account/account-context';
import type { PortfolioView } from '@/modules/portfolio/server';
import type { ShareView } from '@/modules/share/server';
import { getRepository } from '@/modules/storage/repository';

/** Tiny bar chart of opens per day, with the total in words for screen readers. */
function Opens({ recent, label }: { recent: { day: string; n: number }[]; label: string }) {
  const t = useT();
  const max = Math.max(1, ...recent.map((d) => d.n));
  const total = recent.reduce((a, d) => a + d.n, 0);
  return (
    <div className="flex items-end gap-3">
      <svg
        viewBox={`0 0 ${recent.length * 6} 24`}
        className="h-6 w-28"
        role="img"
        aria-label={`${label}: ${total} open${total === 1 ? '' : 's'} in the last ${recent.length} days`}
      >
        {recent.map((d, i) => (
          <rect
            key={d.day}
            x={i * 6}
            y={24 - Math.max(1, (d.n / max) * 24)}
            width={4}
            height={Math.max(1, (d.n / max) * 24)}
            rx={1}
            fill={d.n ? 'var(--color-primary)' : 'var(--color-line)'}
          >
            <title>{`${d.day}: ${d.n}`}</title>
          </rect>
        ))}
      </svg>
      <span className="text-ink-muted text-sm">
        {total} {t('in 14 days')}
      </span>
    </div>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'never';

/** Presence (spec §11.1): portfolio, LinkedIn and share links, with how often each is opened. */
export function PresenceHub() {
  const runTask = useWorkspaceTask();

  const t = useT();
  const account = useAccount();
  const toast = useToast();
  const [portfolio, setPortfolio] = useState<PortfolioView | null | undefined>(undefined);
  const [shares, setShares] = useState<ShareView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titles = useMemo(() => {
    const m = new Map<string, string>();
    if (typeof window !== 'undefined')
      for (const d of getRepository().list()) m.set(d.id, d.title || d.name || 'Untitled CV');
    return m;
  }, []);

  useEffect(() => {
    if (account.status !== 'signedIn') return;
    let live = true;
    const controller = new AbortController();
    const init: RequestInit = {
      cache: 'no-store',
      signal: controller.signal,
      headers: account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : undefined,
    };
    Promise.all([
      workspaceFetch('/api/portfolio', init).then(
        (r) => r.json() as Promise<{ portfolio: PortfolioView | null }>,
      ),
      workspaceFetch('/api/shares', init).then((r) => r.json() as Promise<{ shares: ShareView[] }>),
    ]).then(
      ([p, s]) => {
        if (!live) return;
        setPortfolio(p.portfolio ?? null);
        setShares(s.shares ?? []);
      },
      () => {
        if (live) setError('You seem to be offline. Please try again.');
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
  }, [account.status, account.user?.uid]);

  const toggle = async (s: ShareView) => {
    return runTask(`presence.PresenceHub.toggle.${s.token}`, async (signal) => {
      const r = await workspaceFetch(`/api/shares/${s.token}`, {
        signal,
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : {}),
        },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      signal.throwIfAborted();
      if (!r.ok)
        return toast.show({ tone: 'error', message: 'That didn’t work. Please try again.' });
      const { share } = (await r.json()) as { share: ShareView };
      signal.throwIfAborted();
      setShares(
        (list) => list && list.map((x) => (x.token === share.token ? { ...x, ...share } : x)),
      );
      toast.show({
        tone: 'success',
        message: share.enabled ? 'Link switched on' : 'Link switched off',
      });
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ tone: 'success', message: 'Link copied' });
    } catch {
      toast.show({ tone: 'error', message: 'Couldn’t copy. Select the link and copy it.' });
    }
  };

  if (account.status === 'signedOut')
    return (
      <Banner
        tone="info"
        title={t('Sign in to manage your portfolio page and share links')}
        action={
          <ButtonLink size="sm" href="/signin?next=/presence">
            {t('Sign in')}
          </ButtonLink>
        }
      />
    );
  if (error) return <Banner tone="error" title={error} />;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const latest = getRepository()
    .list()
    .find((d) => d.role !== 'profile');

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section
          aria-labelledby="portfolio-h"
          className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-6"
        >
          <div className="flex items-center gap-2">
            <Globe aria-hidden size={22} className="text-primary" />
            <h2 id="portfolio-h" className="text-xl font-semibold">
              {t('Portfolio page')}
            </h2>
            {portfolio?.published && <Badge tone="success">{t('Live')}</Badge>}
          </div>
          {portfolio === undefined ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : portfolio?.published ? (
            <>
              <a
                href={`/p/${portfolio.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 font-semibold break-all hover:underline"
              >
                {origin.replace(/^https?:\/\//, '')}/p/{portfolio.slug}
                <ExternalLink aria-hidden size={14} />
              </a>
              <p className="text-ink-muted text-sm">
                {portfolio.views} {t('visits in total')}
              </p>
              <Opens recent={portfolio.recent} label={t('Portfolio visits')} />
            </>
          ) : (
            <p className="text-ink-muted">
              {t(
                'Your CV as a web page with its own address, to put on applications and your email signature. Choose what shows, and turn it off at any time.',
              )}
            </p>
          )}
          <ButtonLink href="/portfolio" variant="secondary" className="mt-auto self-start">
            {portfolio?.published ? t('Change settings') : t('Set up my page')}
          </ButtonLink>
        </section>

        <section
          aria-labelledby="linkedin-h"
          className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-6"
        >
          <div className="flex items-center gap-2">
            <IdCard aria-hidden size={22} className="text-primary" />
            <h2 id="linkedin-h" className="text-xl font-semibold">
              {t('LinkedIn profile')}
            </h2>
          </div>
          <p className="text-ink-muted">
            {t(
              'A headline, About section and experience entries written from your CV, within LinkedIn’s limits and ready to paste. Or upload your LinkedIn profile for a review of each section.',
            )}
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <ButtonLink href="/linkedin" variant="secondary">
              {t('Write my LinkedIn text')}
            </ButtonLink>
            <ButtonLink href="/linkedin?tab=review" variant="ghost">
              {t('Review my profile')}
            </ButtonLink>
          </div>
        </section>
        <section
          aria-labelledby="card-h"
          className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-6"
        >
          <div className="flex items-center gap-2">
            <Mail aria-hidden size={22} className="text-primary" />
            <h2 id="card-h" className="text-xl font-semibold">
              {t('Email signature and business card')}
            </h2>
          </div>
          <p className="text-ink-muted">
            {t(
              'From your CV, in its colour and fonts: a signature to paste into your email, and a card to print with a QR code to your page.',
            )}
          </p>
          <ButtonLink href="/presence/card" variant="secondary" className="mt-auto self-start">
            {t('Make them')}
          </ButtonLink>
        </section>
      </div>

      <section
        aria-labelledby="shares-h"
        className="border-line bg-surface flex flex-col gap-4 rounded-xl border p-6"
      >
        <div className="flex items-center gap-2">
          <Link2 aria-hidden size={22} className="text-primary" />
          <h2 id="shares-h" className="text-xl font-semibold">
            {t('Share links')}
          </h2>
        </div>
        {shares === null ? (
          <Skeleton className="h-16 w-full rounded-md" />
        ) : shares.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-ink-muted">
              {t(
                'A private, read-only link to the latest version of a CV — for a recruiter, a mentor or a friend. You see how often it’s opened and can switch it off at any time.',
              )}
            </p>
            {latest && (
              <ButtonLink
                href={`/cv/${latest.id}/download`}
                variant="secondary"
                iconAfter={<ArrowRight aria-hidden size={16} />}
              >
                {t('Create a link for “')}
                {latest.title || 'my CV'}”
              </ButtonLink>
            )}
          </div>
        ) : (
          <ul className="divide-line flex flex-col divide-y" aria-label={t('Your share links')}>
            {shares.map((s) => {
              const url = `${origin}/s/${s.token}`;
              const title = titles.get(s.docId) ?? 'A CV';
              return (
                <li key={s.token} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{title}</span>
                      <Badge tone={s.enabled ? 'success' : 'neutral'}>
                        {s.enabled ? t('On') : t('Off')}
                      </Badge>
                    </p>
                    <p className="text-ink-muted text-sm">
                      {t('{views} open', { views: s.views })}
                      {s.views === 1 ? '' : 's'}{' '}
                      {t('· last opened {when}', { when: when(s.lastViewedAt) })}
                      {s.comments && ' · comments on'}
                    </p>
                    {(s.openComments ?? 0) > 0 && (
                      <Link
                        href={`/cv/${s.docId}?tab=check#comments`}
                        className="text-primary text-sm font-semibold underline underline-offset-4"
                      >
                        {s.openComments === 1
                          ? t('1 comment to read')
                          : t('{openComments} comments to read', { openComments: s.openComments })}
                        <span className="sr-only"> {t('on {title}', { title: title })}</span>
                      </Link>
                    )}
                  </div>
                  <Opens
                    recent={s.recent}
                    label={t('Opens of the link to {title}', { title: title })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Copy aria-hidden size={14} />}
                      disabled={!s.enabled}
                      onClick={() => copy(url)}
                      aria-label={t('Copy the link to {title}', { title: title })}
                    >
                      {t('Copy')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle(s)}
                      aria-label={t('{v0} the link to {title}', {
                        v0: s.enabled ? 'Switch off' : 'Switch on',
                        title: title,
                      })}
                    >
                      {s.enabled ? t('Switch off') : t('Switch on')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
