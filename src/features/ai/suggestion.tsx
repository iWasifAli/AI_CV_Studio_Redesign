'use client';

import { useT } from '@/i18n/client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Check, Crown, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import { splitPlaceholders } from '@/modules/ai/placeholders';
import type { AiResponse, TaskId, TaskInput } from '@/modules/ai/schemas';
import { useWorkspace, useWorkspaceState, useWorkspaceTask } from '@/features/workspace/context';
import { useAiField } from './context';
import { callAi } from './client';
import { useEntitlements } from '@/features/account/entitlements';

const currentPath = () => (typeof window === 'undefined' ? '/' : window.location.pathname);

/** "Try again" is capped per field (docs/engineering/ai-architecture.md → Regeneration). */
export const MAX_ATTEMPTS = 5;

type State<T extends TaskId> =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'done'; data: AiResponse<T>; label: string }
  | { kind: 'error'; message: string; label: string; code: string };

/** Runs one AI task for a field and keeps the suggestion state. */
export function useSuggestion<T extends TaskId>(task: T, fieldKey = '') {
  const field = useAiField();
  const key = `ai.suggestion.${field}.${fieldKey}.${task}`;
  const { store, tabId, routeKey } = useWorkspace();
  const runTask = useWorkspaceTask();
  const [snapshot, setSnapshot] = useWorkspaceState<{
    state: State<T>;
    attempt: number;
    generation: string;
    last: { input: TaskInput<T>; label: string } | null;
  }>(key, { state: { kind: 'idle' }, attempt: 0, generation: '', last: null });
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // Visitor behavior remains cancellable on unmount; workspace requests outlive their UI.
  useEffect(
    () => () => {
      if (!store) abort.current?.abort();
    },
    [store],
  );
  const taskKey = `${routeKey}:${key}.${snapshot.generation}`;
  const getBusy = useCallback(
    () => !!(store && tabId && store.getTab(tabId)?.tasks[taskKey]?.status === 'running'),
    [store, tabId, taskKey],
  );
  const workspaceBusy = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    getBusy,
    () => false,
  );
  const run = useCallback(
    async (input: TaskInput<T>, label: string, nextAttempt = 0) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const generation = crypto.randomUUID();
      setSnapshot({
        state: { kind: 'idle' },
        attempt: nextAttempt,
        generation,
        last: { input, label },
      });
      setLoading(true);
      try {
        const r = await runTask(`${key}.${generation}`, (signal) =>
          callAi(task, input, nextAttempt, store ? signal : ctrl.signal),
        );
        if (ctrl.signal.aborted) return;
        setSnapshot((previous) =>
          previous.generation !== generation
            ? previous
            : {
                ...previous,
                state: r.ok
                  ? { kind: 'done', data: r.data, label }
                  : { kind: 'error', message: r.message, label, code: r.code },
              },
        );
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError'))
          setSnapshot((previous) =>
            previous.generation !== generation
              ? previous
              : {
                  ...previous,
                  state: {
                    kind: 'error',
                    message: 'Please try again.',
                    label,
                    code: 'REQUEST_FAILED',
                  },
                },
          );
      } finally {
        if (abort.current === ctrl) setLoading(false);
      }
    },
    [key, task, runTask, setSnapshot, store],
  );
  const tryAgain = useCallback(() => {
    if (snapshot.last) void run(snapshot.last.input, snapshot.last.label, snapshot.attempt + 1);
  }, [snapshot, run]);
  const dismiss = useCallback(() => {
    abort.current?.abort();
    setLoading(false);
    setSnapshot((previous) => ({ ...previous, generation: '', state: { kind: 'idle' } }));
  }, [setSnapshot]);
  const state: State<T> =
    (store ? workspaceBusy : loading) && snapshot.last
      ? { kind: 'loading', label: snapshot.last.label }
      : snapshot.state;
  return { state, run, tryAgain, dismiss, canRetry: snapshot.attempt + 1 < MAX_ATTEMPTS };
}

/** Text with `{{?…}}` markers shown as highlighted questions. */
export function AskText({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(text).map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.text}</span>
        ) : (
          <mark
            key={i}
            className="bg-warning-soft text-ink ring-warning/40 rounded-sm px-1 font-semibold ring-1"
          >
            [{p.text}]
          </mark>
        ),
      )}
    </>
  );
}

export function AiBadge({ demo }: { demo: boolean }) {
  const tx = useT();
  return (
    <span className="text-primary inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
      <Sparkles aria-hidden size={14} />
      {demo ? tx('Demo AI') : tx('AI suggestion')}
    </span>
  );
}

/** Suggestion card: Use this · Try again · Dismiss. Nothing changes until "Use this". */
export function SuggestionCard<T extends TaskId>({
  s,
  demo,
  children,
  onUse,
  useLabel = 'Use this',
}: {
  s: ReturnType<typeof useSuggestion<T>>;
  demo: boolean;
  children: (data: AiResponse<T>) => ReactNode;
  onUse?: (data: AiResponse<T>) => void;
  useLabel?: string;
}) {
  const tx = useT();
  const { state } = s;
  const { ent } = useEntitlements();
  const salesOpen = Boolean(ent?.features.sales);
  if (state.kind === 'idle') return null;
  return (
    <section
      aria-live="polite"
      aria-label={tx('AI suggestion')}
      data-ai-card={state.kind}
      className={cn(
        'mt-2 flex flex-col gap-3 rounded-md border p-3',
        state.kind === 'error'
          ? 'border-danger/30 bg-danger-soft'
          : 'border-primary/30 bg-primary-soft',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <AiBadge demo={demo} />
        <span className="text-ink-muted text-xs">{tx(state.label)}</span>
      </div>
      {state.kind === 'loading' && (
        <p className="text-ink-muted flex items-center gap-2 text-[15px]">
          <Spinner size={16} /> {tx('Writing a suggestion…')}
        </p>
      )}
      {state.kind === 'error' && <p className="text-ink text-[15px]">{tx(state.message)}</p>}
      {state.kind === 'error' && state.code === 'SIGN_IN_REQUIRED' && (
        <ButtonLink
          size="sm"
          href={`/signin?next=${encodeURIComponent(currentPath())}`}
          className="self-start"
        >
          {tx('Sign in')}
        </ButtonLink>
      )}
      {state.kind === 'error' && state.code === 'PREMIUM_REQUIRED' && salesOpen && (
        <ButtonLink
          size="sm"
          href={`/premium?next=${encodeURIComponent(currentPath())}`}
          className="self-start"
          icon={<Crown aria-hidden size={16} />}
        >
          {tx('See Premium')}
        </ButtonLink>
      )}
      {state.kind === 'done' && (
        <>
          <div className="text-ink text-[15px] leading-6">{children(state.data)}</div>
          {state.data.needsInput.length > 0 && (
            <p className="text-ink-muted text-sm">
              {tx(
                'Highlighted parts need a real detail from you — we never guess facts. Replace them after you use this.',
              )}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {state.kind === 'done' && onUse && (
          <Button
            size="sm"
            icon={<Check aria-hidden size={16} />}
            onClick={() => onUse(state.data)}
          >
            {useLabel}
          </Button>
        )}
        {state.kind !== 'loading' && s.canRetry && (
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw aria-hidden size={16} />}
            onClick={s.tryAgain}
          >
            {tx('Try again')}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<X aria-hidden size={16} />} onClick={s.dismiss}>
          {state.kind === 'loading' ? tx('Cancel') : tx('Dismiss')}
        </Button>
      </div>
    </section>
  );
}

/** Shown under a field whose text still contains `{{?…}}` markers. */
export function NeedsInputHint({ texts }: { texts: string[] }) {
  const tx = useT();
  const has = texts.some((t) => /\{\{\?[^{}]+\}\}/.test(t));
  if (!has) return null;
  return (
    <p className="text-ink bg-warning-soft rounded-sm px-2 py-1.5 text-sm" data-needs-input>
      {tx('Replace the parts in')} <strong>{'{{?…}}'}</strong>{' '}
      {tx('with your real details before you send your CV.')}
    </p>
  );
}
