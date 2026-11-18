'use client';

import { sameSnapshotValue } from '@/features/workspace/equality';
import { useCurrentWorkspaceValue } from '@/features/workspace/use-current-value';

import { useWorkspaceTask } from '@/features/workspace/context';

import { useWorkspaceState, useWorkspaceScope } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link, { useWorkspaceRouter } from '@/features/workspace/navigation';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Sparkles } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { useAccount, useRepositoryVersion } from '@/features/account/account-context';
import { Tabs, tabId, tabPanelId } from '@/components/ui/tabs';
import { useEntitlements } from '@/features/account/entitlements';
import { callAi } from '@/features/ai/client';
import { profileDigest } from '@/modules/jobs/digest';
import { getRepository } from '@/modules/storage/repository';
import { CopyField } from './copy-field';
import { LinkedinReview } from './linkedin-review';

type Result = {
  headline: string;
  about: string;
  experience: { job: string; title: string; text: string }[];
  skills: string[];
};
/** `{{?confirm: X}}` → `[confirm: X]` so the person can see and replace it in a plain text box. */
const visible = (s: string) => s.replace(/\{\{\?([^{}]*)\}\}/g, '[$1]');
const LIMITS = { headline: 220, about: 2600, experience: 2000 };
const cacheKey = (id: string, scope: string | null) =>
  `cvstudio:v1:linkedin:${scope ? `${scope}:` : ''}${id}`;

/** LinkedIn profile writer (Premium): headline, About and job descriptions, ready to paste. */
export function LinkedinScreen() {
  const router = useWorkspaceRouter();
  const tx = useT();
  // CVs live in this browser: render after mounting so server and client agree.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const params = useSearchParams();
  const [tab, setTab] = useWorkspaceState<'write' | 'review'>(
    'linkedin.LinkedinScreen.tab',
    params.get('tab') === 'review' ? 'review' : 'write',
    { dirty: false },
  );
  if (!mounted)
    return <div className="skeleton mx-auto my-8 h-80 max-w-[860px] rounded-lg" aria-busy="true" />;
  const pick = (t: 'write' | 'review') => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'review') url.searchParams.set('tab', 'review');
    else url.searchParams.delete('tab');
    router.replace(url.pathname + url.search + url.hash, { scroll: false });
  };
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">
          {tx('Your LinkedIn profile')}
        </h1>
        <p className="text-ink-muted mt-1">
          {tab === 'write'
            ? tx(
                'A headline, About section and job descriptions written from your CV, ready to paste into LinkedIn. Nothing is invented.',
              )
            : tx(
                'Upload the PDF LinkedIn makes of your profile and get a review of each section, with better text to paste back.',
              )}
        </p>
      </div>
      <Tabs
        label={tx('LinkedIn tools')}
        idBase="linkedin"
        value={tab}
        onChange={pick}
        tabs={[
          { value: 'write', label: 'Write from my CV' },
          { value: 'review', label: 'Review my profile' },
        ]}
      />
      <div
        role="tabpanel"
        id={tabPanelId('linkedin', tab)}
        aria-labelledby={tabId('linkedin', tab)}
        className="flex flex-col gap-6"
      >
        {tab === 'write' ? <LinkedinWriter /> : <LinkedinReview />}
      </div>
    </div>
  );
}

function LinkedinWriter() {
  const runTask = useWorkspaceTask();

  const tx = useT();
  const account = useAccount();
  const scope = useWorkspaceScope();
  const { ent, refresh } = useEntitlements();
  const params = useSearchParams();
  const repositoryVersion = useRepositoryVersion();
  const repo = typeof window === 'undefined' ? null : getRepository();
  const cvs = useMemo(() => repo?.list() ?? [], [repo, repositoryVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- repository event revision
  const [docId, setDocId] = useWorkspaceState(
    'linkedin.LinkedinWriter.docId',
    params.get('doc') ?? cvs.find((c) => c.role === 'profile')?.id ?? cvs[0]?.id ?? '',
    { dirty: true },
  );
  useEffect(() => {
    const next = cvs.find((c) => c.role === 'profile')?.id ?? cvs[0]?.id ?? '';
    if (!docId && next) setDocId((current) => current || next);
  }, [cvs, docId, setDocId]);
  const [target, setTarget] = useWorkspaceState('linkedin.LinkedinWriter.target', '', {
    dirty: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'linkedin.LinkedinWriter.error',
    null,
    { dirty: false },
  );
  const [result, setResult] = useWorkspaceState<Result | null>(
    `linkedin.LinkedinWriter.result.${docId}`,
    () => {
      try {
        const raw =
          scope || typeof window === 'undefined'
            ? null
            : localStorage.getItem(cacheKey(docId, scope));
        return raw ? (JSON.parse(raw) as Result) : null;
      } catch {
        return null;
      }
    },
    { dirty: true },
  );

  const [generated, setGenerated] = useWorkspaceState<{
    result: Result;
    target: string;
    docId: string;
  } | null>(`linkedin.LinkedinWriter.generated.${docId}`, null, { dirty: false });

  const currentDocId = useCurrentWorkspaceValue('linkedin.LinkedinWriter.docId', docId);
  const currentTarget = useCurrentWorkspaceValue('linkedin.LinkedinWriter.target', target);
  const currentResult = useCurrentWorkspaceValue(`linkedin.LinkedinWriter.result.${docId}`, result);

  const locked = ent ? ent.limits['ai.action'] === 0 : false;
  const signedOut = account.status === 'signedOut';

  async function write() {
    return runTask(`linkedin.LinkedinWriter.write.${docId}`, async (signal) => {
      const doc = repo?.get(docId);
      if (!doc) return;
      setBusy(true);
      setError(null);
      const digest = profileDigest(doc);
      const r = await callAi(
        'linkedin.write',
        { profile: digest.text.slice(0, 24_000), target },
        0,
        signal,
      );
      signal.throwIfAborted();
      setBusy(false);
      refresh();
      if (!r.ok) {
        if (r.code !== 'ABORTED')
          setError({
            message: r.message,
            premium: r.code === 'PREMIUM_REQUIRED' || r.code === 'LIMIT_REACHED',
          });
        return;
      }
      const o = r.data.result;
      const next: Result = {
        headline: visible(o.headline),
        about: visible(o.about),
        experience: o.experience.map((e) => ({
          job: e.job,
          title: digest.lines.get(e.job)?.text ?? e.job,
          text: visible(e.text),
        })),
        skills: o.skills,
      };
      if (
        currentDocId() === docId &&
        currentTarget() === target &&
        sameSnapshotValue(currentResult(), result) &&
        sameSnapshotValue(repo?.get(docId), doc)
      ) {
        setResult(next);
        setGenerated(null);
        if (!scope) {
          try {
            localStorage.setItem(cacheKey(docId, scope), JSON.stringify(next));
          } catch {}
        }
      } else setGenerated({ result: next, target, docId });
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  }

  const edit = (patch: Partial<Result>) =>
    setResult((r) => {
      const next = r && { ...r, ...patch };
      try {
        if (next && !scope) localStorage.setItem(cacheKey(docId, scope), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  const asks = result
    ? ([result.headline, result.about, ...result.experience.map((e) => e.text)]
        .join(' ')
        .match(/\[[^\]]+\]/g)?.length ?? 0)
    : 0;

  return (
    <>
      {signedOut ? (
        <Banner
          tone="info"
          title={tx('Sign in to write your LinkedIn profile')}
          action={<ButtonLink href="/signin?next=/linkedin">{tx('Sign in')}</ButtonLink>}
        />
      ) : locked ? (
        <Banner
          tone="info"
          title={tx('The LinkedIn profile writer is part of Premium')}
          action={<ButtonLink href="/premium?next=/linkedin">{tx('See Premium')}</ButtonLink>}
        >
          {tx(
            'Get a headline, About section and job descriptions that match your CV, in your own words.',
          )}
        </Banner>
      ) : cvs.length === 0 ? (
        <p className="text-ink-muted">
          <Link href="/start" className="text-primary font-semibold">
            {tx('Create a CV')}
          </Link>{' '}
          {tx('first, then come back here.')}
        </p>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {tx('Write from')}
            <select
              className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
              value={docId}
              onChange={(e) => {
                setDocId(e.target.value);
                if (scope) return;
                try {
                  const raw = localStorage.getItem(cacheKey(e.target.value, scope));
                  setResult(raw ? (JSON.parse(raw) as Result) : null);
                } catch {
                  setResult(null);
                }
              }}
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
          <TextField
            label={tx('The kind of role you want next')}
            optional
            hint={tx(
              'For example “transport planning” or “team leader”. Leave empty to describe your current work.',
            )}
            value={target}
            maxLength={160}
            onChange={(e) => setTarget(e.target.value)}
          />
          <Button
            icon={<Sparkles aria-hidden size={18} />}
            loading={busy}
            loadingText={tx('Writing… this takes about 20 seconds')}
            disabled={!docId}
            onClick={write}
            className="self-start"
          >
            {result ? tx('Write again') : tx('Write my LinkedIn profile')}
          </Button>
          {error && (
            <Banner
              tone="error"
              title={tx('That didn’t work')}
              onDismiss={() => setError(null)}
              action={
                error.premium ? (
                  <ButtonLink size="sm" href="/premium?next=/linkedin">
                    {tx('See Premium')}
                  </ButtonLink>
                ) : undefined
              }
            >
              {error.message}
            </Banner>
          )}
        </Card>
      )}

      {generated && !signedOut && !locked && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">{tx('Generated suggestion')}</h2>
          <p className="text-sm">{generated.target || tx('Current work')}</p>
          <p>{generated.result.headline}</p>
          <p className="whitespace-pre-wrap">{generated.result.about}</p>
          {generated.result.experience.map((item) => (
            <p key={item.job} className="whitespace-pre-wrap">
              {item.title}: {item.text}
            </p>
          ))}
          <Button
            disabled={generated.docId !== docId}
            onClick={() => {
              setResult(generated.result);
              setGenerated(null);
            }}
          >
            {tx('Use this suggestion')}
          </Button>
        </Card>
      )}
      {result && !signedOut && !locked && (
        <section
          aria-label={tx('Your LinkedIn text')}
          className="flex flex-col gap-4"
          data-testid="linkedin-result"
        >
          {asks > 0 && (
            <Banner
              tone="warning"
              title={tx('{asks} detail{v1} to check', { asks: asks, v1: asks > 1 ? 's' : '' })}
            >
              {tx(
                'Replace or remove the parts in [brackets] before you paste. They mark facts that aren’t in your CV.',
              )}
            </Banner>
          )}
          <CopyField
            label={tx('Headline')}
            value={result.headline}
            limit={LIMITS.headline}
            rows={2}
            onChange={(v) => edit({ headline: v })}
          />
          <CopyField
            label={tx('About')}
            value={result.about}
            limit={LIMITS.about}
            rows={10}
            onChange={(v) => edit({ about: v })}
          />
          {result.experience.map((e, i) => (
            <CopyField
              key={e.job}
              label={e.title}
              value={e.text}
              limit={LIMITS.experience}
              rows={4}
              onChange={(v) =>
                edit({
                  experience: result.experience.map((x, j) => (j === i ? { ...x, text: v } : x)),
                })
              }
            />
          ))}
          {result.skills.length > 0 && (
            <Card className="flex flex-col gap-2 p-5">
              <h2 className="font-semibold">{tx('Skills to add')}</h2>
              <ul className="flex flex-wrap gap-1.5" aria-label={tx('Skills')}>
                {result.skills.map((s) => (
                  <li key={s} className="bg-sunken rounded-full px-3 py-1 text-sm">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="text-ink-muted text-xs">
                {tx('Add these in LinkedIn under Skills, most important first.')}
              </p>
            </Card>
          )}
        </section>
      )}
    </>
  );
}
