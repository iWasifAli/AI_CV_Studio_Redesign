'use client';

import { workspaceFetch as fetch } from '@/features/workspace/request';

import { useWorkspaceState, useWorkspaceTask } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useMemo, useState } from 'react';
import { CalendarClock, Check, Copy } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import {
  addCareerBreak,
  findGaps,
  gapLength,
  GAP_REASONS,
  plainWording,
  type Gap,
  type GapReason,
} from '@/modules/quality/gaps';
import { newId } from '@/modules/resume/create';
import type { ResumeDocument } from '@/modules/resume/schema';

type Draft = { reason: GapReason | null; answer: string };
type Wording = { cvLine: string; interviewLine: string; ai: boolean };

const monthName = (ym: string) => {
  if (!ym) return 'now';
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** Kept while the editor is open, so switching tabs doesn't lose an answer. */

/**
 * Explain a gap (spec §9.3): breaks of more than six months, what happened (in the person's own
 * words) and calm wording for the CV and for interviews. Nothing goes on the CV without "Add".
 */
export function GapPanel({
  doc,
  apply,
}: {
  doc: ResumeDocument;
  apply: (fn: (d: ResumeDocument) => ResumeDocument) => void;
}) {
  const t = useT();
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const gaps = useMemo(() => findGaps(doc), [doc]);
  const [drafts, setDrafts] = useWorkspaceState<Record<string, Draft>>(
    'quality.gappanel.drafts',
    {},
    { dirty: true },
  );
  const [words, setWords] = useWorkspaceState<Record<string, Wording>>(
    'quality.gappanel.words',
    {},
    { dirty: true },
  );
  const runTask = useWorkspaceTask();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'quality.gappanel.problem',
    null,
  );
  const [added, setAdded] = useWorkspaceState<string | null>('quality.gappanel.added', null);
  if (ent && ent.features.gapCoach === false) return null;
  if (!gaps.length && !added) return null;

  const signedIn = account.status === 'signedIn';
  const canAi = signedIn && !!ent && ent.limits['ai.action'] !== 0;
  const setDraft = (k: string, d: Draft) => setDrafts((all) => ({ ...all, [k]: d }));
  const setWording = (k: string, w: Wording | null) =>
    setWords((all) => {
      const next = { ...all };
      if (w) next[k] = w;
      else delete next[k];
      return next;
    });

  const word = async (g: Gap, d: Draft, ai: boolean) => {
    if (!d.reason) return;
    setProblem(null);
    if (!ai) {
      const line = plainWording(d.reason, d.answer);
      setWording(g.key, {
        cvLine: line,
        interviewLine: `${line}. I’m ready for my next role.`,
        ai: false,
      });
      return;
    }
    setBusy(g.key);
    try {
      await runTask(`quality.gap.word.${g.key}`, async (signal) => {
        const r = await fetch('/api/coach/gap', {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            reason: d.reason,
            answer: d.answer,
            length: gapLength(g.months),
            after: g.after,
            before: g.before,
          }),
        });
        const j = (await r.json().catch(() => null)) as
          (Wording & { error?: undefined }) | { error: { message: string } } | null;
        signal.throwIfAborted();
        if (!r.ok || !j || 'error' in j) {
          setProblem({
            message:
              (j && 'error' in j && j.error?.message) || 'That didn’t work. Please try again.',
            premium: r.status === 402,
          });
          return;
        }
        setWording(g.key, { cvLine: j.cvLine, interviewLine: j.interviewLine, ai: true });
        refresh();
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setProblem({ message: 'You seem to be offline. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const add = (g: Gap, w: Wording) => {
    if (!addCareerBreak(doc, g, w.cvLine, 'check')) {
      setProblem({ message: 'Add an Experience section first, then try again.' });
      return;
    }
    const id = newId();
    apply((d) => addCareerBreak(d, g, w.cvLine, id) ?? d);
    setAdded(g.key);
    setWording(g.key, null);
  };

  return (
    <section
      aria-labelledby="gap-h"
      className="border-line bg-surface shadow-1 flex flex-col gap-4 rounded-lg border p-5"
      data-testid="gaps"
    >
      <div>
        <h2 id="gap-h" className="flex items-center gap-2 font-semibold">
          <CalendarClock aria-hidden size={18} className="text-primary" /> {t('Gaps in your dates')}
        </h2>
        <p className="text-ink-muted text-sm">
          {t(
            'Breaks are common and nothing to hide. A short, calm line answers the question before it’s asked. Only what you tell us is used.',
          )}
        </p>
      </div>
      {added && (
        <p className="flex items-center gap-1.5 text-sm" role="status" data-testid="gap-added">
          <Check aria-hidden size={16} className="text-primary" />{' '}
          {t('Added as a career break in Experience. Undo takes it out.')}
        </p>
      )}
      {problem && (
        <Banner
          tone="error"
          title={problem.message}
          onDismiss={() => setProblem(null)}
          action={
            problem.premium ? (
              <ButtonLink href="/premium" size="sm">
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      <ul className="flex flex-col gap-3">
        {gaps.map((g) => {
          const d = drafts[g.key] ?? { reason: null, answer: '' };
          const w = words[g.key];
          return (
            <li
              key={g.key}
              className="border-line flex flex-col gap-3 rounded-md border p-3 text-sm"
              data-testid="gap"
            >
              <div>
                <p className="font-semibold">
                  {monthName(g.from)} – {monthName(g.to)} ({gapLength(g.months)})
                </p>
                <p className="text-ink-muted">
                  {g.before
                    ? t('Between {after} and {before}', { after: g.after, before: g.before })
                    : t('Since {after}', { after: g.after })}
                </p>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-semibold">{t('What was this time for?')}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {GAP_REASONS.map(([k, label]) => (
                    <label
                      key={k}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 ${d.reason === k ? 'border-primary bg-primary-soft text-primary font-semibold' : 'border-line-strong'}`}
                    >
                      <input
                        type="radio"
                        name={`gap-${g.key}`}
                        value={k}
                        className="sr-only"
                        checked={d.reason === k}
                        onChange={() => setDraft(g.key, { ...d, reason: k })}
                      />
                      {t(label)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1">
                <span className="font-semibold">{t('In a few words (optional)')}</span>
                <input
                  className="border-line-strong bg-surface h-10 rounded-md border px-3"
                  value={d.answer}
                  maxLength={400}
                  placeholder={t('For example: looked after my father after his operation')}
                  onChange={(e) => setDraft(g.key, { ...d, answer: e.target.value })}
                />
                <span className="text-ink-muted text-xs">
                  {t('Share only what you’re happy for an employer to read.')}
                </span>
              </label>
              {!w && (
                <div className="flex flex-wrap gap-2">
                  {canAi && (
                    <Button
                      size="sm"
                      disabled={!d.reason}
                      loading={busy === g.key}
                      onClick={() => void word(g, d, true)}
                    >
                      {t('Suggest wording')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={canAi ? 'ghost' : 'secondary'}
                    disabled={!d.reason}
                    onClick={() => void word(g, d, false)}
                  >
                    {canAi ? t('Simple wording (no AI)') : t('Suggest wording')}
                  </Button>
                  {!signedIn && (
                    <span className="text-ink-muted self-center text-xs">
                      <Link
                        href={`/signin?next=/cv/${doc.id}?tab=check`}
                        className="text-primary font-semibold"
                      >
                        {t('Sign in')}
                      </Link>{' '}
                      {t('for AI wording.')}
                    </span>
                  )}
                </div>
              )}
              {w && (
                <div
                  className="bg-sunken flex flex-col gap-3 rounded-md p-3"
                  data-testid="gap-wording"
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-ink-muted text-xs font-semibold uppercase">
                      {t('On your CV')}
                    </span>
                    <input
                      className="border-line-strong bg-surface h-10 rounded-md border px-3"
                      value={w.cvLine}
                      maxLength={200}
                      onChange={(e) => setWording(g.key, { ...w, cvLine: e.target.value })}
                    />
                  </label>
                  <div>
                    <p className="text-ink-muted text-xs font-semibold uppercase">
                      {t('If you’re asked in an interview')}
                    </p>
                    <p data-testid="gap-interview">{w.interviewLine}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={!w.cvLine.trim()} onClick={() => add(g, w)}>
                      {t('Add as a career break')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Copy aria-hidden size={16} />}
                      onClick={() => void navigator.clipboard?.writeText(w.interviewLine)}
                    >
                      {t('Copy interview answer')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setWording(g.key, null)}>
                      {t('Start again')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
