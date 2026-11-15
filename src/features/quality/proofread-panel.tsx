'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, SpellCheck } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import {
  fixPatch,
  ISSUE_LABEL,
  proofLines,
  type Issue,
  type ProofLine,
} from '@/modules/quality/proofread';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';

type State = 'open' | 'fixed' | 'left' | 'stale';
type Result = { issues: Issue[]; lines: ProofLine[]; checked: number };

/**
 * The last result per CV for this visit to the editor: "Show me" switches to the Content tab
 * (which unmounts the Check tab), and the list must still be there on the way back.
 */
const kept = new Map<string, { result: Result; state: Record<number, State> }>();

/**
 * Proofread the whole CV (spec §9.3): AI lists spelling, grammar and punctuation mistakes; the
 * person fixes or leaves each one. A fix changes only the quoted words, as one undo step.
 */
export function ProofreadPanel({
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
  const { ent, refresh } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(() => kept.get(doc.id)?.result ?? null);
  const [state, setState] = useState<Record<number, State>>(() => kept.get(doc.id)?.state ?? {});
  useEffect(() => {
    if (result) kept.set(doc.id, { result, state });
  }, [doc.id, result, state]);
  if (ent && ent.features.proofread === false) return null;
  const signedIn = account.status === 'signedIn';
  // Free accounts have no AI actions: say so up front instead of a button that can only fail.
  const premiumOnly = !!ent && ent.plan !== 'premium' && ent.limits['ai.action'] === 0;

  const run = async () => {
    setBusy(true);
    setProblem(null);
    const lines = proofLines(doc);
    try {
      const r = await fetch('/api/quality/proofread', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: doc }),
      });
      const j = (await r.json().catch(() => null)) as {
        issues?: Issue[];
        checked?: number;
        error?: { message: string };
      } | null;
      if (!r.ok || !j?.issues) {
        setProblem({
          message: j?.error?.message ?? 'We couldn’t proofread this CV just now.',
          premium: r.status === 402,
        });
        return;
      }
      setResult({ issues: j.issues, lines, checked: j.checked ?? lines.length });
      setState({});
      refresh();
    } catch {
      setProblem({ message: 'You seem to be offline. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const fix = (n: number, issue: Issue) => {
    if (!result) return;
    // Check against the CV as it is now: the words may have changed since the check.
    if (!fixPatch(doc, issue, result.lines)) {
      setState((s) => ({ ...s, [n]: 'stale' }));
      return;
    }
    apply((d) => {
      const p = fixPatch(d, issue, result.lines);
      if (!p) return d;
      return 'basics' in p
        ? ops.updateBasics(d, p.basics)
        : ops.updateItem(d, p.sectionId, p.itemId, p.patch);
    });
    setState((s) => ({ ...s, [n]: 'fixed' }));
  };

  const open = result?.issues.filter((_, n) => !state[n] || state[n] === 'open').length ?? 0;
  return (
    <section
      aria-labelledby="proof-h"
      className="border-line bg-surface shadow-1 flex flex-col gap-4 rounded-lg border p-5"
      data-testid="proofread"
    >
      <div>
        <h2 id="proof-h" className="flex items-center gap-2 font-semibold">
          <SpellCheck aria-hidden size={18} className="text-primary" /> {t('Proofread')}
        </h2>
        <p className="text-ink-muted text-sm">
          {t(
            'AI reads every line of your CV for spelling, grammar and punctuation mistakes. You choose which fixes to make; nothing changes on its own.',
          )}
        </p>
      </div>
      {!signedIn ? (
        <p className="text-ink-muted text-sm">
          <Link
            href={`/signin?next=/cv/${doc.id}?tab=check`}
            className="text-primary font-semibold"
          >
            {t('Sign in')}
          </Link>{' '}
          {t('to proofread your CV.')}
        </p>
      ) : premiumOnly ? (
        <p className="text-ink-muted text-sm" data-testid="proofread-premium">
          {t('Proofreading is part of')}{' '}
          <Link href="/premium" className="text-primary font-semibold">
            {t('Premium')}
          </Link>
          .
        </p>
      ) : (
        <Button
          className="self-start"
          variant={result ? 'secondary' : 'primary'}
          icon={<SpellCheck aria-hidden size={18} />}
          loading={busy}
          onClick={run}
        >
          {result ? t('Proofread again') : t('Proofread my CV')}
        </Button>
      )}
      {problem && (
        <Banner
          tone="error"
          title={problem.message}
          action={
            problem.premium ? (
              <ButtonLink href="/premium" size="sm">
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      {result && (
        <div className="flex flex-col gap-3" aria-live="polite" data-testid="proofread-result">
          <p className="font-semibold">
            {result.issues.length === 0
              ? t('No mistakes found in {checked} lines.', { checked: result.checked })
              : open === 0
                ? t('All done.')
                : t('{open} thing{v1} to look at', { open: open, v1: open === 1 ? '' : 's' })}
          </p>
          <ul className="flex flex-col gap-3">
            {result.issues.map((issue, n) => {
              const st = state[n] ?? 'open';
              return (
                <li
                  key={n}
                  className="border-line flex flex-col gap-2 rounded-md border p-3 text-sm"
                  data-state={st}
                >
                  <p className="text-ink-muted">
                    <span className="text-ink font-semibold">{ISSUE_LABEL[issue.kind]}</span> ·{' '}
                    {issue.where}
                  </p>
                  <p className="break-words">
                    <Context text={issue.text} quote={issue.quote} fix={issue.fix} />
                  </p>
                  {issue.why && <p className="text-ink-muted">{t(issue.why)}</p>}
                  {st === 'open' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => fix(n, issue)}>
                        {t('Fix it')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setState((s) => ({ ...s, [n]: 'left' }))}
                      >
                        {t('Leave it')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onShow(issue.ref)}>
                        {t('Show me')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-ink-muted flex items-center gap-1.5">
                      {st === 'fixed' && <Check aria-hidden size={16} className="text-success" />}
                      {st === 'fixed'
                        ? t('Fixed. Undo puts it back.')
                        : st === 'left'
                          ? t('Left as it is.')
                          : t('This text has changed since the check, so it was not changed.')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The line around the mistake, with the quoted words struck through and the fix after them. */
function Context({ text, quote, fix }: { text: string; quote: string; fix: string }) {
  const i = text.indexOf(quote);
  if (i < 0) return <>{text}</>;
  const before = text.slice(Math.max(0, i - 60), i);
  const after = text.slice(i + quote.length, i + quote.length + 60);
  return (
    <>
      {i > 60 && '…'}
      {before}
      <del className="text-danger">{quote}</del>{' '}
      <ins className="text-success font-semibold no-underline">{fix}</ins>
      {after}
      {i + quote.length + 60 < text.length && '…'}
    </>
  );
}
