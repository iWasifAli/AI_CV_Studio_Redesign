'use client';

import { workspaceFetch } from '@/features/workspace/request';

import { useWorkspaceTask } from '@/features/workspace/context';

import { useWorkspaceState, useWorkspace } from '@/features/workspace/context';
import { useWorkspaceAcknowledge } from '@/features/workspace/use-acknowledge';
import { reconcileCanonicalFields } from '@/features/workspace/canonical-reconciliation';
import { sameSnapshotValue } from '@/features/workspace/equality';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ExternalLink, Eye, Globe } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { CheckboxField } from '@/features/editor/fields';
import type { PortfolioView } from '@/modules/portfolio/server';
import { slugProblem, suggestSlug } from '@/modules/portfolio/slug';
import { themeForDoc, type Theme } from '@/modules/portfolio/themes';
import { getRepository } from '@/modules/storage/repository';
import { saveDraft, type PortfolioDraft } from './draft';
import { ProjectsEditor, QrCard, SectionsEditor, ThemePicker } from './portfolio-extras';

type Form = PortfolioDraft;
const fromView = (p: PortfolioView): Form => ({
  slug: p.slug,
  docId: p.docId,
  published: p.published,
  showEmail: p.showEmail,
  showPhone: p.showPhone,
  theme: p.theme,
  sections: p.sections,
  projects: p.projects,
  contact: p.contact,
});

export function PortfolioSettings() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted)
    return <div className="skeleton mx-auto my-8 h-80 max-w-[760px] rounded-lg" aria-busy="true" />;
  return <Settings />;
}

function Settings() {
  const runTask = useWorkspaceTask();
  const { store, tabId, routeKey } = useWorkspace();
  const acknowledgeForm = useWorkspaceAcknowledge<Form>('portfolio.Settings.form');

  const tx = useT();
  const account = useAccount();
  const { ent } = useEntitlements();
  const toast = useToast();
  const repo = getRepository();
  const cvs = useMemo(() => repo.list(), [repo]);
  const [saved, setSaved] = useWorkspaceState<PortfolioView | null | undefined>(
    'portfolio.Settings.saved',
    undefined,
    { dirty: false },
  );
  const [needsReview, setNeedsReview] = useWorkspaceState('portfolio.Settings.needsReview', false, {
    dirty: false,
  });
  const baseline = useRef<Form | null>(null);
  const mutations = useRef(0);
  const [draft, setForm] = useWorkspaceState<Form | null>('portfolio.Settings.form', null, {
    dirty: true,
  });
  const [initialForm, setInitialForm] = useState<Form | null>(null);
  const [refreshedFor, setRefreshedFor] = useState<object | null>(null);
  const form = draft ?? initialForm;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useWorkspaceState<string | null>('portfolio.Settings.error', null, {
    dirty: false,
  });
  const signedIn = account.status === 'signedIn';
  const premium = ent?.plan === 'premium';
  const refreshScope = useMemo(
    () => ({ signedIn, ownerUid: account.user?.uid, cvs, store, tabId, routeKey }),
    [signedIn, account.user?.uid, cvs, store, tabId, routeKey],
  );
  const refreshed = refreshedFor === refreshScope;

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const startedAt = mutations.current;
    const savedAtRequest =
      store && tabId ? store.readFeature(tabId, `${routeKey}:portfolio.Settings.saved`) : undefined;
    const controller = new AbortController();
    workspaceFetch('/api/portfolio', {
      cache: 'no-store',
      signal: controller.signal,
      headers: account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : undefined,
    })
      .then((r) => {
        if (!r.ok) throw new Error('Could not refresh saved settings. Reload to try again.');
        return r.json() as Promise<{ portfolio: PortfolioView | null }>;
      })
      .then(({ portfolio }) => {
        if (!live) return;
        setRefreshedFor(refreshScope);
        if (startedAt !== mutations.current) return;
        let accepted = true;
        setSaved((current) => {
          // The completing save may belong to an earlier mount. Its snapshot still wins
          // over an older (or empty, unversioned) GET started before that save completed.
          const changedDuringGet = store && tabId && current !== savedAtRequest;
          if (
            (current && portfolio && current.updatedAt > portfolio.updatedAt) ||
            (changedDuringGet &&
              (current === null ||
                (current && (!portfolio || current.updatedAt >= portfolio.updatedAt))))
          ) {
            accepted = false;
            return current;
          }
          return portfolio;
        });
        if (!accepted) return;
        const source = cvs.find((c) => c.role === 'profile') ?? cvs[0];
        const next: Form = portfolio
          ? fromView(portfolio)
          : {
              slug: suggestSlug(source?.name ?? ''),
              docId: source?.id ?? '',
              published: true,
              showEmail: false,
              showPhone: false,
              theme: 'auto',
              sections: [],
              projects: [],
              contact: false,
            };
        const acknowledged =
          store && tabId
            ? (store.getTab(tabId)?.features[`${routeKey}:portfolio.Settings.form`]?.baseline
                ?.value as Form | null | undefined)
            : undefined;
        const previous = acknowledged ?? baseline.current;
        setForm((current) => {
          if (!current) return next;
          const conflicts = (Object.keys(next) as (keyof Form)[]).some(
            (key) =>
              !sameSnapshotValue(current[key], next[key]) &&
              (!previous ||
                (!sameSnapshotValue(current[key], previous[key]) &&
                  !sameSnapshotValue(next[key], previous[key]))),
          );
          if (conflicts) setNeedsReview(true);
          return previous ? reconcileCanonicalFields(current, previous, next) : current;
        });
        baseline.current = next;
        setInitialForm(next);
        acknowledgeForm(next);
      })
      .catch(() => {
        if (live) {
          setRefreshedFor(null);
          setError('Could not refresh saved settings. Reload to try again.');
          if (startedAt === mutations.current) setSaved((current) => current ?? null);
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [
    signedIn,
    account.user?.uid,
    cvs,
    store,
    tabId,
    routeKey,
    setSaved,
    setForm,
    setNeedsReview,
    setError,
    acknowledgeForm,
    refreshScope,
  ]);

  const url = (slug: string) => `${window.location.origin}/p/${slug}`;
  const problem = form ? slugProblem(form.slug) : null;
  const dirty = !!form && (!saved || JSON.stringify(form) !== JSON.stringify(fromView(saved)));
  const doc = form ? repo.get(form.docId) : null;
  const auto = doc ? themeForDoc(doc) : 'clean';
  const contactOn = !!ent?.features.portfolioContact;

  /** Opens the preview in a new tab with these settings (saved or not). */
  function preview(theme?: Theme) {
    if (!form) return;
    const key = saveDraft(form, account.user?.uid ?? null);
    const query = new URLSearchParams({ draft: key });
    if (theme) query.set('theme', theme);
    window.open(`/portfolio-preview?${query}`, '_blank', 'noopener');
  }

  async function save() {
    return runTask('portfolio.Settings.save', async (signal) => {
      if (!form || needsReview || !refreshed) return;
      setBusy(true);
      setError(null);
      try {
        const r = await workspaceFetch('/api/portfolio', {
          signal,
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            ...(account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : {}),
          },
          body: JSON.stringify(form),
        });
        signal.throwIfAborted();
        const j = (await r.json()) as { portfolio?: PortfolioView; error?: { message: string } };
        signal.throwIfAborted();
        if (!r.ok || !j.portfolio) throw new Error(j.error?.message ?? 'That didn’t work.');
        mutations.current += 1;
        const next = fromView(j.portfolio);
        let accepted = true;
        setSaved((current) => {
          if (current && current.updatedAt > j.portfolio!.updatedAt) {
            accepted = false;
            return current;
          }
          return j.portfolio!;
        });
        if (!accepted) return;
        setInitialForm(next);
        setForm((current) => reconcileCanonicalFields(current ?? form, form, next));
        baseline.current = next;
        acknowledgeForm(next);
        toast.show({
          tone: 'success',
          message: j.portfolio.published ? 'Your page is live' : 'Saved. Your page is hidden.',
        });
      } catch (e) {
        signal.throwIfAborted();
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  }

  async function remove() {
    return runTask('portfolio.Settings.remove', async (signal) => {
      if (!confirm('Delete your portfolio page? The address will become free for others.')) return;
      const response = await workspaceFetch('/api/portfolio', {
        signal,
        method: 'DELETE',
        headers: account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : undefined,
      });
      signal.throwIfAborted();
      if (!response.ok) {
        setError('The portfolio could not be deleted. Please try again.');
        return;
      }
      mutations.current += 1;
      setSaved(null);
      toast.show({ tone: 'success', message: 'Portfolio page deleted' });
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">
          {tx('Your portfolio page')}
        </h1>
        <p className="text-ink-muted mt-1">
          {tx(
            'A personal web page made from your CV, in your colours, to put on LinkedIn, your email signature or a business card. It updates when you change the CV.',
          )}
        </p>
      </div>
      {account.status === 'signedOut' ? (
        <Banner
          tone="info"
          title={tx('Sign in to make your portfolio page')}
          action={<ButtonLink href="/signin?next=/portfolio">{tx('Sign in')}</ButtonLink>}
        />
      ) : ent && !premium ? (
        <Banner
          tone="info"
          title={tx('Your portfolio page is part of Premium')}
          action={<ButtonLink href="/premium?next=/portfolio">{tx('See Premium')}</ButtonLink>}
        >
          {tx('Get your own address, like aicvstudio.app/p/your-name, with your CV as a web page.')}
        </Banner>
      ) : cvs.length === 0 ? (
        <p className="text-ink-muted">
          <Link href="/start" className="text-primary font-semibold">
            {tx('Create a CV')}
          </Link>{' '}
          {tx('first, then come back here.')}
        </p>
      ) : !form || saved === undefined ? (
        <div className="skeleton h-80 rounded-lg" aria-busy="true" aria-label={tx('Loading')} />
      ) : (
        <>
          {needsReview && (
            <Banner tone="warning" title={tx('Review your unsaved settings')}>
              <p>
                {tx(
                  'Your edits were kept because the saved settings changed. Review contact details and publishing before saving.',
                )}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => setNeedsReview(false)}>
                  {tx('Keep my edits')}
                </Button>
                {saved && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const next = fromView(saved);
                      setForm(next);
                      acknowledgeForm(next);
                      setNeedsReview(false);
                    }}
                  >
                    {tx('Use saved settings')}
                  </Button>
                )}
              </div>
            </Banner>
          )}
          {saved?.published && (
            <Card
              className="flex flex-wrap items-center justify-between gap-3 p-5"
              data-testid="portfolio-live"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <Globe aria-hidden size={18} className="text-success" /> {tx('Your page is live')}
                </p>
                <a
                  href={url(saved.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary break-all"
                >
                  {url(saved.slug).replace(/^https?:\/\//, '')}
                </a>
                <p className="text-ink-muted text-sm" data-testid="portfolio-views">
                  {saved.views === 1
                    ? tx('Visited once')
                    : tx('Visited {views} times', { views: saved.views })}
                </p>
              </div>
              <ButtonLink
                variant="secondary"
                href={`/p/${saved.slug}`}
                target="_blank"
                icon={<ExternalLink aria-hidden size={16} />}
              >
                {tx('Open my page')}
              </ButtonLink>
              <div className="border-line w-full border-t pt-4">
                <QrCard url={url(saved.slug)} slug={saved.slug} />
              </div>
            </Card>
          )}
          <Card className="flex flex-col gap-4 p-5">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {tx('Make it from')}
              <select
                className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
                value={form.docId}
                onChange={(e) => setForm({ ...form, docId: e.target.value })}
              >
                {cvs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.role === 'profile'
                      ? tx('Career profile')
                      : c.title || c.name || tx('Untitled CV')}
                  </option>
                ))}
              </select>
            </label>
            <ThemePicker
              value={form.theme}
              auto={auto}
              onChange={(theme) => setForm({ ...form, theme })}
              onPreview={(t) => preview(t)}
            />
            <TextField
              label={tx('Your address')}
              hint={`aicvstudio.app/p/${form.slug || 'your-name'}`}
              value={form.slug}
              maxLength={40}
              error={form.slug && problem ? problem : undefined}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })
              }
            />
            <fieldset className="flex flex-col">
              <legend className="mb-1 text-sm font-semibold">
                {tx('Contact details on the page')}
              </legend>
              <CheckboxField
                label={tx('Show my email address')}
                checked={form.showEmail}
                onChange={(v) => setForm({ ...form, showEmail: v })}
              />
              <CheckboxField
                label={tx('Show my phone number')}
                checked={form.showPhone}
                onChange={(v) => setForm({ ...form, showPhone: v })}
              />
              <p className="text-ink-muted text-xs">
                {tx(
                  'Your location and links are shown. The page is public, so only show what you’re happy for anyone to see.',
                )}
              </p>
            </fieldset>
            {(contactOn || form.contact) && (
              <div className="flex flex-col">
                <CheckboxField
                  label={tx('Add a contact form')}
                  checked={form.contact}
                  onChange={(v) => setForm({ ...form, contact: v })}
                />
                <p className="text-ink-muted -mt-1 pl-8 text-xs">
                  {tx('Visitors can send you a message. It comes to your sign-in email')}
                  {account.user?.email ? ` (${account.user.email})` : ''}
                  {tx('; your address stays hidden and replying answers them.')}
                </p>
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-6 p-5">
            <SectionsEditor
              value={form.sections}
              onChange={(sections) => setForm({ ...form, sections })}
            />
            <ProjectsEditor
              value={form.projects}
              onChange={(projects) =>
                setForm((current) => {
                  const latest = current ?? form;
                  return {
                    ...latest,
                    projects: typeof projects === 'function' ? projects(latest.projects) : projects,
                  };
                })
              }
            />
          </Card>
          <Card className="flex flex-col gap-4 p-5">
            <CheckboxField
              label={tx('Page is published')}
              checked={form.published}
              onChange={(v) => setForm({ ...form, published: v })}
            />
            {error && (
              <Banner tone="error" title={tx('That didn’t work')} onDismiss={() => setError(null)}>
                {tx(error)}
              </Banner>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!dirty || !!problem || needsReview || !refreshed}
                loading={busy}
                onClick={save}
              >
                {saved ? tx('Save changes') : tx('Create my page')}
              </Button>
              <Button
                variant="secondary"
                icon={<Eye aria-hidden size={16} />}
                onClick={() => preview()}
              >
                {tx('Preview')}
              </Button>
              {saved && (
                <Button variant="ghost" onClick={remove}>
                  {tx('Delete my page')}
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
