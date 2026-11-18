'use client';

import { workspaceFetch } from '@/features/workspace/request';

import { useWorkspaceTask } from '@/features/workspace/context';

import { useWorkspaceState, useWorkspaceClean } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Send, Sparkles, Trash2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useAccount, useRepositoryVersion } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { AskText } from '@/features/ai/suggestion';
import { jobAiApi, JobsError } from '@/features/jobs/api';
import { newerConversation, type CoachConversation } from './snapshot';
import type { CoachAction, CoachThread } from '@/modules/coach/thread';
import { defaultSourceCv } from '@/modules/jobs/source-cv';
import type { Job } from '@/modules/jobs/schema';
import { LETTER_TYPE, isLetterType } from '@/modules/letters/types';
import { getRepository } from '@/modules/storage/repository';
import { cn } from '@/lib/cn';

const STARTERS = [
  'Which of my skills should I lead with?',
  'How do I explain a gap in my CV?',
  'What should I learn next for the jobs I want?',
  'How can I make my CV stronger?',
];

function label(a: CoachAction, jobs: Job[]): string {
  const j = jobs.find((x) => x.id === a.arg);
  const at = j ? `${j.title}${j.company ? ` at ${j.company}` : ''}` : '';
  switch (a.tool) {
    case 'tailor_cv':
      return `Make a CV tailored to ${at}`;
    case 'application_kit':
      return `Create the application kit for ${at}`;
    case 'cover_letter':
      return `Write a cover letter for ${at}`;
    case 'job_match':
      return `Check how my CV matches ${at}`;
    case 'mock_interview':
      return `Practise an interview for ${at}`;
    case 'write_letter':
      return isLetterType(a.arg)
        ? `Write a ${LETTER_TYPE[a.arg].title.toLowerCase()}`
        : 'Write a letter';
    case 'ats_check':
      return 'Run the ATS check on my CV';
    case 'add_job':
      return 'Add a job I want';
    case 'design':
      return 'Change my CV’s design';
    case 'skill_gap':
      return at ? `Make a learning plan for ${at}` : 'Make a learning plan for the role I want';
  }
}

/**
 * Career coach chat (spec §10.3): answers from the person's own CV and jobs, and offers studio
 * actions as buttons. Each action uses the same route as the rest of the studio, so the same plan
 * checks apply; nothing happens until the person chooses it.
 */
export function CoachChat({ jobs }: { jobs: Job[] }) {
  const runTask = useWorkspaceTask();
  const account = useAccount();
  const markClean = useWorkspaceClean();

  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { ent, refresh } = useEntitlements();
  const [conversation, setConversation] = useWorkspaceState<CoachConversation | null>(
    'coach.CoachChat.conversation',
    null,
    { dirty: false },
  );
  const thread = conversation?.thread;
  const [sourcePrompt, setSourcePrompt] = useWorkspaceState('coach.CoachChat.sourcePrompt', '', {
    dirty: true,
  });
  const [suggestion, setSuggestion] = useWorkspaceState<unknown>(
    'coach.CoachChat.suggestion',
    null,
    { dirty: false },
  );
  const [message, setMessage] = useWorkspaceState('coach.CoachChat.message', '', { dirty: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'coach.CoachChat.problem',
    null,
    { dirty: false },
  );
  const end = useRef<HTMLLIElement>(null);
  const repositoryVersion = useRepositoryVersion();
  const repo = typeof window === 'undefined' ? null : getRepository();
  const cvs = useMemo(() => repo?.list() ?? [], [repo, repositoryVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- repository event revision
  const sourceId = defaultSourceCv(cvs);
  const source = (sourceId && repo?.get(sourceId)) || null;
  const locked = ent ? ent.limits['ai.action'] === 0 : false;

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    workspaceFetch('/api/coach', {
      cache: 'no-store',
      signal: controller.signal,
      headers: account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : undefined,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load conversation.');
        return r.json() as Promise<CoachConversation>;
      })
      .then((j) => {
        if (live)
          setConversation((current) =>
            newerConversation(current, { thread: j.thread, revision: j.revision ?? 0 }),
          );
      })
      .catch(() => {
        if (live)
          setProblem({ message: 'Could not load the saved conversation. Please try again.' });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [account.user?.uid, setConversation, setProblem]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [thread?.messages.length]);

  const fail = (e: unknown) =>
    setProblem(
      e instanceof JobsError
        ? { message: e.message, premium: e.status === 402 }
        : { message: 'You seem to be offline. Please try again.' },
    );

  const send = async (text: string) => {
    return runTask('coach.CoachChat.send', async (signal) => {
      if (!source || !text.trim() || !conversation) return;
      setSourcePrompt(text);
      setBusy('send');
      setProblem(null);
      try {
        const r = await workspaceFetch('/api/coach', {
          signal,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : {}),
          },
          body: JSON.stringify({
            document: source,
            message: text,
            expectedRevision: conversation.revision,
          }),
        });
        signal.throwIfAborted();
        const j = (await r.json().catch(() => null)) as {
          thread?: CoachThread;
          revision?: number;
          error?: {
            message: string;
            details?: { current?: CoachConversation; generated?: unknown };
          };
          current?: CoachConversation;
          generated?: unknown;
        } | null;
        signal.throwIfAborted();
        if (r.status === 409) {
          const current = j?.current ?? j?.error?.details?.current;
          if (current) setConversation((previous) => newerConversation(previous, current));
          setSuggestion(j?.generated ?? j?.error?.details?.generated ?? null);
          setProblem({
            message:
              'The saved conversation changed. Your question and generated suggestion are kept; review the latest conversation before sending again.',
          });
          return;
        }
        if (!r.ok || !j?.thread)
          throw new JobsError(j?.error?.message ?? 'The coach couldn’t reply.', r.status);
        setConversation((current) =>
          newerConversation(current, {
            thread: j.thread!,
            revision: j.revision ?? conversation.revision + 1,
          }),
        );
        let unchanged = false;
        setMessage((current) => {
          unchanged = current === text;
          return unchanged ? '' : current;
        });
        if (unchanged) markClean();
        refresh();
      } catch (e) {
        signal.throwIfAborted();
        fail(e);
      } finally {
        setBusy(null);
      }
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  };

  const act = async (a: CoachAction) => {
    return runTask(`coach.CoachChat.act.${a.tool}.${a.arg}`, async (signal) => {
      const key = `${a.tool}:${a.arg}`;
      setBusy(key);
      setProblem(null);
      try {
        switch (a.tool) {
          case 'tailor_cv': {
            if (!source) return;
            const { document } = await jobAiApi.tailor(a.arg, source, {
              signal,
              ownerUid: account.user?.uid,
            });
            signal.throwIfAborted();
            getRepository().save(document);
            toast.show({ tone: 'success', message: 'Tailored CV created' });
            router.push(`/cv/${document.id}`);
            break;
          }
          case 'application_kit': {
            if (!source) return;
            const { document } = await jobAiApi.kit(a.arg, source, 'warm', {
              signal,
              ownerUid: account.user?.uid,
            });
            signal.throwIfAborted();
            getRepository().save(document);
            router.push(`/jobs/${a.arg}#kit`);
            break;
          }
          case 'cover_letter':
            if (!source) return;
            await jobAiApi.letter(a.arg, source, 'warm', { signal, ownerUid: account.user?.uid });
            signal.throwIfAborted();
            router.push(`/jobs/${a.arg}#letter`);
            break;
          case 'job_match':
            if (!source) return;
            await jobAiApi.match(a.arg, source, { signal, ownerUid: account.user?.uid });
            signal.throwIfAborted();
            router.push(`/jobs/${a.arg}`);
            break;
          case 'mock_interview':
            router.push(`/jobs/${a.arg}#mock`);
            break;
          case 'write_letter':
            router.push(`/letters/new?type=${a.arg}`);
            break;
          case 'ats_check':
            router.push(source ? `/cv/${source.id}?tab=check` : '/documents');
            break;
          case 'add_job':
            router.push('/jobs?new=1');
            break;
          case 'design':
            router.push(source ? `/cv/${source.id}?tab=design` : '/documents');
            break;
          case 'skill_gap':
            router.push(a.arg ? `/skills?job=${a.arg}` : '/skills');
            break;
        }
        refresh();
      } catch (e) {
        signal.throwIfAborted();
        fail(e);
      } finally {
        setBusy(null);
      }
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  };

  const clear = async () => {
    if (!conversation || !confirm('Clear the conversation?')) return;
    return runTask('coach.CoachChat.clear', async (signal) => {
      setBusy('clear');
      try {
        const r = await workspaceFetch('/api/coach', {
          signal,
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
            ...(account.user?.uid ? { 'X-Workspace-Owner': account.user.uid } : {}),
          },
          body: JSON.stringify({ expectedRevision: conversation.revision }),
        });
        const j = (await r.json()) as Partial<CoachConversation> & {
          error?: { message?: string; details?: { current?: CoachConversation } };
          current?: CoachConversation;
        };
        signal.throwIfAborted();
        if (!r.ok) {
          const current = j.current ?? j.error?.details?.current;
          if (current) setConversation((previous) => newerConversation(previous, current));
          setProblem({
            message: j.error?.message ?? 'The conversation changed. Review it before clearing.',
          });
          return;
        }
        setConversation((current) =>
          newerConversation(current, {
            thread: null,
            revision: j.revision ?? conversation.revision + 1,
          }),
        );
      } catch (error) {
        signal.throwIfAborted();
        fail(error);
      } finally {
        setBusy(null);
      }
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  };

  return (
    <section
      aria-labelledby="coach-h"
      className="border-line bg-surface flex flex-col gap-4 rounded-xl border p-5"
      data-testid="coach-chat"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="coach-h" className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles aria-hidden size={20} className="text-primary" /> {t('Ask your coach')}
        </h2>
        {thread && thread.messages.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={16} />} onClick={clear}>
            {t('Clear')}
          </Button>
        )}
      </div>
      <p className="text-ink-muted text-sm">
        {t('Advice from your own CV')}
        {source ? ` (“${source.title}”)` : ''}{' '}
        {t('and the jobs you track. It never makes up experience for you.')}
      </p>

      {suggestion != null && (
        <details className="border-line rounded-lg border p-3">
          <summary>{t('Retained Coach suggestion')}</summary>
          <p className="whitespace-pre-wrap">{sourcePrompt}</p>
          <pre className="text-sm whitespace-pre-wrap">
            {typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion, null, 2)}
          </pre>
        </details>
      )}
      {locked ? (
        <Banner
          tone="info"
          title={t('The career coach is part of Premium')}
          action={
            ent?.features.sales ? (
              <ButtonLink href="/premium?next=/coach" size="sm">
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        >
          {t(
            'Ask anything about your CV and applications, and let the coach set up the next step for you.',
          )}
        </Banner>
      ) : !source ? (
        <p className="text-ink-muted">
          {t('Create or upload a CV first, so the coach can read it.')}
        </p>
      ) : (
        <>
          {thread === undefined ? (
            <Spinner />
          ) : (
            <ol
              className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto"
              aria-label={t('Conversation')}
              aria-live="polite"
            >
              {(thread?.messages ?? []).map((m, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex max-w-[88%] flex-col gap-2 rounded-lg px-3 py-2 text-[15px] whitespace-pre-line',
                    m.role === 'user'
                      ? 'bg-primary text-on-primary self-end rounded-tr-sm'
                      : 'bg-sunken self-start rounded-tl-sm',
                  )}
                  data-role={m.role}
                >
                  {m.role === 'coach' ? <AskText text={m.text} /> : m.text}
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {m.actions.map((a) => (
                        <Button
                          key={`${a.tool}:${a.arg}`}
                          size="sm"
                          variant="secondary"
                          loading={busy === `${a.tool}:${a.arg}`}
                          disabled={busy !== null}
                          onClick={() => act(a)}
                        >
                          {label(a, jobs)}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              <li ref={end} aria-hidden="true" />
            </ol>
          )}
          {(!thread || thread.messages.length === 0) && (
            <ul className="flex flex-wrap gap-2" aria-label={t('Questions to start with')}>
              {STARTERS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => send(s)}
                    className="border-line-strong hover:bg-sunken min-h-10 rounded-full border px-3.5 text-sm font-semibold"
                  >
                    {t(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(message);
            }}
          >
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
              <span className="sr-only">{t('Message to your coach')}</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={message}
                placeholder={t('Ask anything about your CV, jobs or interviews…')}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(message);
                  }
                }}
                className="border-line-strong bg-surface focus-visible:border-primary w-full resize-y rounded-md border px-3 py-2 text-base font-normal focus-visible:outline-none"
              />
            </label>
            <Button
              type="submit"
              aria-label={t('Send')}
              icon={busy === 'send' ? undefined : <Send aria-hidden size={18} />}
              loading={busy === 'send'}
              disabled={busy !== null || !message.trim()}
            >
              {t('Send')}
            </Button>
          </form>
        </>
      )}
      {problem && (
        <Banner
          tone="error"
          title={problem.message}
          action={
            problem.premium ? (
              <ButtonLink
                href="/premium?next=/coach"
                size="sm"
                icon={<Lock aria-hidden size={14} />}
              >
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        />
      )}
    </section>
  );
}
