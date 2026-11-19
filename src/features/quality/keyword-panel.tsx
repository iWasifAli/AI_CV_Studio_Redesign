'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n/client';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { remaining, useEntitlements } from '@/features/account/entitlements';
import { useAccount } from '@/features/account/account-context';
import { useRequestScope } from '@/features/account/use-request-scope';
import { useAi } from '@/features/ai/client';
import type { DocumentEditor } from '@/features/editor/use-document-editor';
import { digestPlain, profileDigest } from '@/modules/jobs/digest';
import { cvHasTerm } from '@/modules/jobs/match';
import {
  applyKeywordPatches,
  checkKeywordRewrite,
  keywordFields,
  keywordRewriteResult,
} from '@/modules/quality/keyword-rewrite';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';
import type { AtsWorkspace } from './ats-workspace';

export function KeywordPanel({
  doc,
  editor,
  state,
  setState,
  onShow,
  busyCheck,
}: {
  doc: ResumeDocument;
  editor?: DocumentEditor;
  state: AtsWorkspace;
  setState: Dispatch<SetStateAction<AtsWorkspace>>;
  onShow: (ref: string) => void;
  busyCheck: boolean;
}) {
  const tx = useT();
  const { user } = useAccount();
  const { ent, refresh } = useEntitlements();
  const ai = useAi();
  const kw = state.report!.keywords!;
  const identity = `${user?.uid}:${doc.id}:${state.jobId}:${kw.jobId}:${kw.advertFingerprint}:${state.report?.at}:${busyCheck}`;
  const { begin, cancel } = useRequestScope(identity);
  const [pending, setPending] = useState<string | null>(null);
  if (pending !== null && pending !== identity) setPending(null);
  const busy = pending === identity;
  const setBusy = (value: boolean) => setPending(value ? identity : null);
  const [problem, setProblem] = useState<string | null>(null);
  const plain = digestPlain(profileDigest(doc));
  const all = [...new Set([...kw.present, ...kw.missing.map((k) => k.term)])];
  const present = all.filter((t) => cvHasTerm(plain, t));
  const missing = all.filter((t) => !cvHasTerm(plain, t));
  const picked = state.picked.filter((t) => missing.includes(t));
  const premium = ent?.plan === 'premium';
  const permitted = premium && ent?.features.ai !== false && ai.show;
  const left = ent ? remaining(ent, 'ai.action') : 0;
  const ready = state.verified && kw.jobId === state.jobId && !!kw.advertFingerprint;

  async function rewrite() {
    if (!editor || !picked.length || !ready || !permitted) return;
    const captured = editor.captureSnapshot();
    if (!captured) {
      setProblem(
        tx('Your CV changed in another window or could not be saved. Reload it before rewriting.'),
      );
      return;
    }
    const request = begin();
    const selected = [...picked];
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch('/api/quality/keywords/rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
        body: JSON.stringify({
          document: captured.document,
          jobId: kw.jobId,
          advertFingerprint: kw.advertFingerprint,
          keywords: selected,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!request.valid()) return;
      if (!response.ok) {
        setProblem(
          json?.error?.message ?? tx('We couldn’t rewrite this CV just now. Please try again.'),
        );
        if (response.status === 409) setState((s) => ({ ...s, verified: false }));
        return;
      }
      const parsed = keywordRewriteResult.safeParse(json);
      if (!parsed.success) {
        setProblem(tx('We couldn’t safely apply this response. Please try again.'));
        return;
      }
      const fields = new Map(keywordFields(captured.document).map((f) => [f.target, f]));
      if (parsed.data.patches.some((p) => fields.get(p.target)?.before !== p.before)) {
        setProblem(tx('We couldn’t safely apply this response. Please try again.'));
        return;
      }
      // Recheck the server's batch at the client boundary, resolving targets and coverage locally.
      const result = checkKeywordRewrite(captured.document, selected, {
        changes: parsed.data.patches.map((p) => ({
          target: p.target,
          after: p.after,
          keywords: selected.filter((t) => cvHasTerm(p.after, t)),
        })),
        skipped: parsed.data.skipped,
      });
      if (
        result.patches.length &&
        !editor.commitSnapshot(captured.snapshot, (d) => applyKeywordPatches(d, result.patches))
      ) {
        setProblem(
          tx(
            'Your CV changed while rewriting. Your edits are safe. Select keywords and try again.',
          ),
        );
        return;
      }
      setState((s) => ({
        ...s,
        result,
        picked: s.picked.filter((t) => !result.included.includes(t)),
      }));
      refresh();
    } catch {
      if (request.valid())
        setProblem(tx('The rewrite could not finish. Check your connection and try again.'));
    } finally {
      if (request.valid()) {
        setBusy(false);
        refresh();
      }
    }
  }

  return (
    <div
      id="ats-keywords"
      className="border-line flex scroll-mt-24 flex-col gap-4 border-t pt-4"
      data-testid="ats-keywords"
    >
      <div>
        <h3 className="font-semibold">
          {tx('Keywords for {jobTitle}', { jobTitle: kw.jobTitle })}
        </h3>
        <p className="text-ink-muted mt-1 text-sm">
          {tx(
            'Select only skills and qualifications that are true for you. Selecting a keyword confirms you have it.',
          )}
        </p>
      </div>
      {present.length > 0 && (
        <div>
          <p className="text-ink-muted mb-2 text-sm">
            {tx('In your CV ({length})', { length: present.length })}
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label={tx('Keywords in your CV')}>
            {present.map((t) => (
              <li
                key={t}
                className="bg-success-soft text-success rounded-full px-2.5 py-1 text-sm font-semibold"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <div>
          <p className="text-ink-muted mb-2 text-sm">
            {tx('Not in your CV ({length}). Add a word only where it’s true for you.', {
              length: missing.length,
            })}
          </p>
          <ul className="flex flex-col gap-2" aria-label={tx('Keywords not in your CV')}>
            {missing.map((term) => {
              const line = kw.missing.find((m) => m.term === term)?.line;
              return (
                <li key={term} className="text-sm">
                  <label className="bg-sunken border-line hover:border-primary/40 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors">
                    <input
                      type="checkbox"
                      checked={picked.includes(term)}
                      disabled={
                        !editor ||
                        busy ||
                        busyCheck ||
                        (!picked.includes(term) && picked.length >= 25)
                      }
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          picked: e.target.checked
                            ? [...picked, term]
                            : picked.filter((t) => t !== term),
                        }))
                      }
                      data-testid="keyword-pick"
                    />
                    <span className="font-semibold">{term}</span>
                  </label>
                  {line && (
                    <p className="text-ink-muted mt-1 text-sm">
                      {tx('You may already show this: “{text}”{v}', { text: line.text, v: ' ' })}
                      <button
                        type="button"
                        className="text-primary font-semibold underline underline-offset-4"
                        onClick={() => onShow(line.ref)}
                      >
                        {tx('Show me')}
                      </button>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {editor && (
            <div className="mt-4 flex flex-col gap-2">
              {!ready && (
                <p className="text-ink-muted text-sm" role="status">
                  {tx('Run the ATS check again to confirm the current job keywords.')}
                </p>
              )}
              {permitted ? (
                <>
                  <div className="bg-primary-soft border-primary/15 flex flex-col gap-3 rounded-lg border p-3">
                    <p className="text-sm">
                      {tx(
                        'Rewrite your profile and relevant work or project bullets. Changes save together in one Undo step.',
                      )}
                    </p>
                    <Button
                      icon={<Sparkles aria-hidden size={16} />}
                      onClick={rewrite}
                      loading={busy}
                      loadingText={tx('Rewriting your CV…')}
                      disabled={!picked.length || busyCheck || !ready || left === 0}
                      className="h-auto min-h-11 py-2 whitespace-normal"
                      data-testid="keyword-rewrite"
                    >
                      {tx('Rewrite with selected keywords')}
                    </Button>
                    <p className="text-ink-muted text-xs">
                      {tx('{count} selected · 1 AI action for usable changes', {
                        count: picked.length,
                      })}
                    </p>
                    {busy && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          cancel();
                          setBusy(false);
                          setProblem(tx('Rewrite cancelled.'));
                        }}
                        className="self-start"
                      >
                        {tx('Cancel')}
                      </Button>
                    )}
                  </div>
                </>
              ) : !premium ? (
                <p className="text-ink-muted text-sm">
                  {tx('Keyword rewriting is part of Premium.')}{' '}
                  <ButtonLink href="/premium" variant="ghost" size="sm">
                    {tx('See Premium')}
                  </ButtonLink>
                </p>
              ) : (
                <p className="text-ink-muted text-sm">
                  {tx('Turn on AI help to rewrite with keywords.')}
                </p>
              )}
              <Button
                variant="secondary"
                disabled={!picked.length || busy || busyCheck}
                onClick={() => {
                  editor.update((d) => ops.addKeywords(d, picked), `keywords.${Date.now()}`);
                  setState((s) => ({ ...s, picked: [] }));
                }}
                className="h-auto min-h-11 py-2 whitespace-normal"
                data-testid="keyword-add"
              >
                {tx('Add ticked words to my skills')}
              </Button>
            </div>
          )}
        </div>
      )}
      {problem && <Banner tone="error" title={problem} onDismiss={() => setProblem(null)} />}
      {state.result && (
        <div
          className="bg-sunken flex flex-col gap-3 rounded-lg p-4"
          aria-live="polite"
          data-testid="keyword-result"
        >
          <h4 className="font-semibold">
            {state.result.patches.length
              ? tx('Keyword rewrite result')
              : tx('No changes were applied')}
          </h4>
          {state.result.included.length > 0 && (
            <p className="text-sm">
              {tx('Included: {terms}', { terms: state.result.included.join(', ') })}
            </p>
          )}
          {state.result.patches.length > 0 && (
            <p className="text-ink-muted text-xs">
              {tx('Keyword coverage above follows your current CV, including Undo and Redo.')}
            </p>
          )}
          {state.result.patches.map((p) => (
            <details key={p.target} className="text-sm">
              <summary className="text-primary min-h-9 cursor-pointer py-1 font-semibold">
                {p.where}
              </summary>
              <p className="text-ink-muted mt-2 text-xs font-semibold">{tx('Before')}</p>
              <p className="mt-1 whitespace-pre-wrap">{p.before || tx('(empty)')}</p>
              <p className="text-ink-muted mt-3 text-xs font-semibold">{tx('After')}</p>
              <p className="mt-1 whitespace-pre-wrap">{p.after}</p>
              <button
                type="button"
                onClick={() => onShow(p.ref)}
                className="text-primary mt-2 min-h-9 font-semibold underline underline-offset-4"
              >
                {tx('Show me')}
              </button>
            </details>
          ))}
          {state.result.skipped.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold">{tx('Not inserted')}</h5>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {state.result.skipped.map((s) => (
                  <li key={s.term}>
                    <span className="font-semibold">{s.term}</span> — {tx(s.reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
