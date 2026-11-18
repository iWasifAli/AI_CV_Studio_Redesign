'use client';

import { workspaceFetch as fetch } from '@/features/workspace/request';

import { useWorkspaceState, useWorkspaceTask } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useMemo, useState } from 'react';
import { Check, Hash } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { AskText, NeedsInputHint } from '@/features/ai/suggestion';
import { quantifyPatch, unmeasured, type Unmeasured } from '@/modules/quality/quantify';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';

type Question = { question: string; hint: string };
type Step =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'questions'; questions: Question[]; answers: string[] }
  | { kind: 'adding'; questions: Question[]; answers: string[] }
  | { kind: 'review'; questions: Question[]; answers: string[]; next: string }
  | { kind: 'done' }
  | { kind: 'stale' };

/** Steps per point, kept while the editor is open (Show me switches tabs). */
const keyOf = (p: Unmeasured) => `${p.sectionId}/${p.itemId}/${p.index}/${p.text}`;

async function post<T>(body: unknown, signal: AbortSignal): Promise<T> {
  const r = await fetch('/api/quality/quantify', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  signal.throwIfAborted();
  if (!r.ok || !j)
    throw Object.assign(new Error(j?.error?.message || 'That didn’t work. Please try again.'), {
      premium: r.status === 402,
    });
  return j;
}

/**
 * Quantify prompts (spec §9.3): points with no number, a question or two each, and only the
 * person's answers added to the point. Asking is one AI action; adding the answers is free.
 */
export function QuantifyPanel({
  doc,
  onShow,
  apply,
}: {
  doc: ResumeDocument;
  onShow: (ref: string) => void;
  apply: (fn: (d: ResumeDocument) => ResumeDocument) => void;
}) {
  const t = useT();
  const account = useAccount();
  const runTask = useWorkspaceTask();
  const [busySteps, setBusySteps] = useState<Record<string, Step>>({});
  const { ent, refresh } = useEntitlements();
  const points = useMemo(() => unmeasured(doc), [doc]);
  const [steps, setSteps] = useWorkspaceState<Record<string, Step>>(
    'quality.quantifypanel.steps',
    {},
  );
  const [answerDrafts, setAnswerDrafts] = useWorkspaceState<Record<string, string[]>>(
    'quality.quantify.answers',
    {},
    { dirty: true },
  );
  const [problem, setProblem] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'quality.quantifypanel.problem',
    null,
  );
  const [showAll, setShowAll] = useWorkspaceState('quality.quantifypanel.showAll', false);
  if (ent && ent.features.quantify === false) return null;
  const signedIn = account.status === 'signedIn';
  const premiumOnly = !!ent && ent.plan !== 'premium' && ent.limits['ai.action'] === 0;
  const clearBusy = (k: string) =>
    setBusySteps((all) => {
      const next = { ...all };
      delete next[k];
      return next;
    });
  const set = (k: string, s: Step) => {
    if (s.kind === 'asking' || s.kind === 'adding') setBusySteps((all) => ({ ...all, [k]: s }));
    else {
      clearBusy(k);
      setSteps((all) => ({ ...all, [k]: s }));
    }
  };

  const ask = async (p: Unmeasured) => {
    const k = keyOf(p);
    set(k, { kind: 'asking' });
    setProblem(null);
    try {
      const r = await runTask(`quality.quantify.ask.${k}`, (signal) =>
        post<{ questions: Question[] }>({ mode: 'ask', point: p.text, job: p.job }, signal),
      );
      set(k, { kind: 'questions', questions: r.questions, answers: r.questions.map(() => '') });
      refresh();
    } catch (e) {
      clearBusy(k);
      if (e instanceof Error && e.name === 'AbortError') return;
      set(k, { kind: 'idle' });
      setProblem({ message: (e as Error).message, premium: (e as { premium?: boolean }).premium });
    }
  };
  const add = async (p: Unmeasured, questions: Question[], answers: string[]) => {
    const k = keyOf(p);
    set(k, { kind: 'adding', questions, answers });
    setProblem(null);
    try {
      const r = await runTask(`quality.quantify.add.${k}`, (signal) =>
        post<{ point: string }>(
          {
            mode: 'insert',
            point: p.text,
            job: p.job,
            answers: questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' })),
          },
          signal,
        ),
      );
      clearBusy(k);
      setSteps((all) => ({
        ...all,
        [k]: {
          kind: 'review',
          questions,
          answers: all[k] && 'answers' in all[k] ? all[k].answers : answers,
          next: r.point,
        },
      }));
    } catch (e) {
      clearBusy(k);
      if (e instanceof Error && e.name === 'AbortError') return;
      set(k, { kind: 'questions', questions, answers });
      setProblem({ message: (e as Error).message });
    }
  };
  const use = (p: Unmeasured, next: string) => {
    const k = keyOf(p);
    if (!quantifyPatch(doc, p, next)) return set(k, { kind: 'stale' });
    apply((d) => {
      const patch = quantifyPatch(d, p, next);
      return patch && !('basics' in patch)
        ? ops.updateItem(d, patch.sectionId, patch.itemId, patch.patch)
        : d;
    });
    set(keyOf({ ...p, text: next }), { kind: 'done' });
  };

  // Points just improved stay listed (as done) until the person leaves the editor.
  const doneKeys = Object.entries(steps).filter(([, s]) => s.kind === 'done' || s.kind === 'stale');
  const shown = showAll ? points : points.slice(0, 5);
  return (
    <section
      aria-labelledby="quant-h"
      className="border-line bg-surface shadow-1 flex flex-col gap-4 rounded-lg border p-5"
      data-testid="quantify"
    >
      <div>
        <h2 id="quant-h" className="flex items-center gap-2 font-semibold">
          <Hash aria-hidden size={18} className="text-primary" /> {t('Add numbers to your points')}
        </h2>
        <p className="text-ink-muted text-sm">
          {t(
            'Points with a number (how many, how often, what changed) stand out. We ask; you answer with what’s true; only your answer is added.',
          )}
        </p>
      </div>
      {points.length === 0 ? (
        <p className="text-sm" data-testid="quantify-none">
          {doneKeys.length
            ? t('Every point now has a number. Well done.')
            : t('Every point on your CV already has a number.')}
        </p>
      ) : !signedIn ? (
        <p className="text-ink-muted text-sm">
          <Link
            href={`/signin?next=/cv/${doc.id}?tab=check`}
            className="text-primary font-semibold"
          >
            {t('Sign in')}
          </Link>{' '}
          {t('to get questions for your points.')}
        </p>
      ) : premiumOnly ? (
        <p className="text-ink-muted text-sm" data-testid="quantify-premium">
          {points.length} {points.length === 1 ? 'point has' : 'points have'}{' '}
          {t('no number. Questions that help are part of')}{' '}
          <Link href="/premium" className="text-primary font-semibold">
            {t('Premium')}
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold">
            {points.length} {points.length === 1 ? 'point has' : 'points have'} {t('no number')}
          </p>
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
            {shown.map((p) => {
              const k = keyOf(p);
              const baseStep = busySteps[k] ?? steps[k] ?? { kind: 'idle' };
              const st: Step =
                'answers' in baseStep
                  ? { ...baseStep, answers: answerDrafts[k] ?? baseStep.answers }
                  : baseStep;
              return (
                <li
                  key={k}
                  className="border-line flex flex-col gap-2 rounded-md border p-3 text-sm"
                >
                  <p className="text-ink-muted">{p.where}</p>
                  <p>{p.text}</p>
                  {(st.kind === 'idle' || st.kind === 'asking') && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" loading={st.kind === 'asking'} onClick={() => void ask(p)}>
                        {t('Ask me')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onShow(p.ref)}>
                        {t('Show me')}
                      </Button>
                    </div>
                  )}
                  {(st.kind === 'questions' || st.kind === 'adding') && (
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void add(p, st.questions, st.answers);
                      }}
                    >
                      {st.questions.map((q, i) => (
                        <label key={i} className="flex flex-col gap-1">
                          <span className="font-semibold">{t(q.question)}</span>
                          <input
                            className="border-line-strong bg-surface h-10 rounded-md border px-3"
                            value={st.answers[i] ?? ''}
                            maxLength={200}
                            onChange={(e) =>
                              setAnswerDrafts((all) => ({
                                ...all,
                                [k]: st.answers.map((a, j) => (j === i ? e.target.value : a)),
                              }))
                            }
                          />
                          {q.hint && <span className="text-ink-muted text-xs">{t(q.hint)}</span>}
                        </label>
                      ))}
                      <p className="text-ink-muted text-xs">
                        {t('Only answer what’s true. Leave a question empty if you don’t know.')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          type="submit"
                          loading={st.kind === 'adding'}
                          disabled={!st.answers.some((a) => a.trim())}
                        >
                          {t('Add to my point')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => set(k, { kind: 'idle' })}
                        >
                          {t('Cancel')}
                        </Button>
                      </div>
                    </form>
                  )}
                  {st.kind === 'review' && (
                    <div
                      className="bg-sunken flex flex-col gap-2 rounded-md p-3"
                      data-testid="quantify-review"
                    >
                      <p className="text-ink-muted text-xs font-semibold uppercase">
                        {t('New point')}
                      </p>
                      <p>
                        <AskText text={st.next} />
                      </p>
                      <NeedsInputHint texts={[st.next]} />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => use(p, st.next)}>
                          {t('Use this')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            set(k, {
                              kind: 'questions',
                              questions: st.questions,
                              answers: st.answers,
                            })
                          }
                        >
                          {t('Change my answers')}
                        </Button>
                      </div>
                    </div>
                  )}
                  {st.kind === 'stale' && (
                    <p className="text-ink-muted">
                      {t('This point has changed since you asked, so it was not changed.')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {points.length > 5 && !showAll && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => setShowAll(true)}
            >
              {t('Show all {length}', { length: points.length })}
            </Button>
          )}
        </>
      )}
      {doneKeys.some(([, s]) => s.kind === 'done') && (
        <p className="text-success flex items-center gap-1.5 text-sm" data-testid="quantify-done">
          <Check aria-hidden size={16} /> {t('Point updated. Undo puts it back.')}
        </p>
      )}
    </section>
  );
}
