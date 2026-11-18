'use client';

import { useRepositoryVersion } from '@/features/account/account-context';

import {
  useWorkspaceState,
  useWorkspaceTask,
  useWorkspace,
  useWorkspaceDownload,
} from '@/features/workspace/context';

import { useWorkspaceAcknowledge } from '@/features/workspace/use-acknowledge';
import { sameSnapshotValue } from '@/features/workspace/equality';
import { useCurrentWorkspaceValue } from '@/features/workspace/use-current-value';
import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Copy,
  Download,
  FileText,
  Lock,
  Mail,
  MessagesSquare,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useEntitlements } from '@/features/account/entitlements';
import { ScaledPage, resolvePage } from '@/features/letters/scaled-page';
import type { InterviewKind } from '@/modules/jobs/interview';
import type { MatchResult } from '@/modules/jobs/match';
import { defaultSourceCv } from '@/modules/jobs/source-cv';
import type { Job } from '@/modules/jobs/schema';
import { buildLetterHtml } from '@/modules/letters/build-letter';
import type { Letter } from '@/modules/letters/schema';
import type { ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';
import { jobAiApi, jobsApi, JobsError, type ConflictDetails } from './api';
import { revisionOf } from './workspace-state';
import { ConflictNotice } from './conflict-notice';
import { KitSection } from './kit-section';
import { MockInterview } from './mock-interview';

type Busy = null | 'kit' | 'match' | 'tailor' | 'letter' | 'save' | 'pdf' | 'interview' | 'notes';
const MIN_ADVERT = 80;

/** Problem shown under the tools, with the right next step for sign-in or Premium denials. */
type Problem = { message: string; premium?: boolean; details?: ConflictDetails };
const toProblem = (e: unknown): Problem =>
  e instanceof JobsError
    ? {
        message: e.message,
        premium: e.status === 402,
        details: e.status === 409 ? (e.details ?? {}) : undefined,
      }
    : { message: 'You seem to be offline. Please try again.' };

/**
 * AI help for one job: match the CV to the advert, make a tailored copy, and write a cover letter.
 * Everything uses the person's own facts; the server checks each claim against their CV.
 */
export function JobTools({ job, onJobChange }: { job: Job; onJobChange: (j: Job) => void }) {
  const tx = useT();
  const router = useRouter();
  const toast = useToast();
  const runTask = useWorkspaceTask();
  const { ownerUid } = useWorkspace();
  const { ent, refresh } = useEntitlements();
  const repositoryVersion = useRepositoryVersion();
  const repo = typeof window === 'undefined' ? null : getRepository();
  const cvs = useMemo(() => repo?.list() ?? [], [repo, repositoryVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- repository event revision
  const [sourceId, setSourceId] = useWorkspaceState(
    'jobs.JobTools.sourceId',
    () => defaultSourceCv(cvs),
    { dirty: true },
  );
  useEffect(() => {
    const next = defaultSourceCv(cvs);
    // A sync may supply the first CV after this form has mounted.
    if (!sourceId && next) setSourceId((current) => current || next);
  }, [cvs, sourceId, setSourceId]);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useWorkspaceState<Problem | null>('jobs.JobTools.problem', null, {
    dirty: false,
  });

  const source = (sourceId && repo?.get(sourceId)) || null;
  const aiLocked = ent ? ent.limits['ai.action'] === 0 : false;
  const advertShort = job.advert.trim().length < MIN_ADVERT;

  async function run(
    kind: Exclude<Busy, null>,
    fn: (doc: ResumeDocument, signal: AbortSignal) => Promise<void>,
  ) {
    if (!source) return;
    setBusy(kind);
    setProblem(null);
    try {
      await runTask(`jobs.JobTools.${kind}`, (signal) => fn(source, signal));
      refresh();
    } catch (e) {
      setProblem(toProblem(e));
    } finally {
      setBusy(null);
    }
  }

  const checkMatch = () =>
    run('match', async (doc, signal) => {
      onJobChange(
        await jobAiApi.match(job.id, doc, { signal, ownerUid, expectedRevision: revisionOf(job) }),
      );
    });

  const tailor = () =>
    run('tailor', async (doc, signal) => {
      const { document } = await jobAiApi.tailor(job.id, doc, {
        signal,
        ownerUid,
        expectedRevision: revisionOf(job),
      });
      repo?.save(document);
      onJobChange(
        await jobsApi.update(
          job.id,
          {
            documentIds: [...job.documentIds.filter((x) => x !== document.id), document.id].slice(
              -10,
            ),
          },
          { signal, ownerUid, expectedRevision: revisionOf(job) },
        ),
      );
      toast.show({ tone: 'success', message: 'Tailored CV created' });
      router.push(`/cv/${document.id}`);
    });

  const makeKit = () =>
    run('kit', async (doc, signal) => {
      if (
        job.kit &&
        !confirm('Make a new kit? Your letter is replaced; the earlier tailored CV is kept.')
      )
        return;
      const { document, job: next } = await jobAiApi.kit(job.id, doc, job.letter?.tone ?? 'warm', {
        signal,
        ownerUid,
        expectedRevision: revisionOf(job),
      });
      repo?.save(document);
      onJobChange(next);
      toast.show({
        tone: 'success',
        message: 'Your kit is ready. Read it through and make it yours.',
      });
    });

  return (
    <Card className="flex flex-col gap-5 p-5" data-testid="job-tools">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles aria-hidden size={18} className="text-primary" /> {tx('Get ready to apply')}
          </h2>
          <p className="text-ink-muted text-sm">
            {tx('Uses only what’s in your CV. Nothing is invented.')}
          </p>
        </div>
      </div>

      {aiLocked ? (
        <Banner
          tone="info"
          title={tx('Job match, tailoring and cover letters are part of Premium')}
          action={
            <ButtonLink size="sm" href={`/premium?next=/jobs/${job.id}`}>
              {tx('See Premium')}
            </ButtonLink>
          }
        >
          {tx(
            'See how well your CV fits this job, get a copy that puts your most relevant experience first, and a cover letter in the same design.',
          )}
        </Banner>
      ) : null}
      {aiLocked ? (
        // A kit made earlier (e.g. while Premium was active) stays yours to see and download.
        job.kit && (
          <KitSection
            job={job}
            disabled
            loading={false}
            onCreate={() => {}}
            onProblem={setProblem}
            refresh={refresh}
          />
        )
      ) : cvs.length === 0 ? (
        <p className="text-ink-muted text-sm">
          <Link href="/start" className="text-primary font-semibold">
            {tx('Create a CV')}
          </Link>{' '}
          {tx('first, then come back here.')}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {tx('Use this CV')}
            <select
              className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
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

          {advertShort && (
            <Banner tone="info" title={tx('Paste the job advert first')}>
              {tx('Add the full advert in “The job” and save. It’s what we compare your CV with.')}
            </Banner>
          )}

          {ent?.features.kit !== false && (
            <KitSection
              job={job}
              weight={ent?.aiWeights.kit}
              disabled={advertShort || !source || busy !== null}
              loading={busy === 'kit'}
              onCreate={makeKit}
              onProblem={setProblem}
              refresh={refresh}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<CircleCheck aria-hidden size={18} />}
              disabled={advertShort || !source || busy !== null}
              loading={busy === 'match'}
              onClick={checkMatch}
            >
              {job.match ? tx('Check again') : tx('Check how my CV matches')}
            </Button>
            <Button
              variant="secondary"
              icon={<Wand2 aria-hidden size={18} />}
              disabled={advertShort || !source || busy !== null}
              loading={busy === 'tailor'}
              onClick={tailor}
            >
              {tx('Make a tailored CV')}
            </Button>
          </div>

          <ConflictNotice
            details={problem?.details}
            onKeepDraft={
              problem?.details?.current
                ? () => {
                    onJobChange(problem.details!.current as Job);
                    setProblem(null);
                  }
                : undefined
            }
          />
          {problem && (
            <Banner
              tone="error"
              title={tx('That didn’t work')}
              onDismiss={() => setProblem(null)}
              action={
                problem.premium ? (
                  <ButtonLink size="sm" href={`/premium?next=/jobs/${job.id}`}>
                    {tx('See Premium')}
                  </ButtonLink>
                ) : undefined
              }
            >
              {tx(problem.message)}
            </Banner>
          )}

          {job.match && <MatchView match={job.match} cvId={sourceId} />}
          {job.match && ent?.features.skillGap !== false && (
            <p className="text-sm">
              {tx('Missing some of it?')}{' '}
              <Link href={`/skills?job=${job.id}`} className="text-primary font-semibold underline">
                {tx('Make a learning plan for this job')}
              </Link>
            </p>
          )}

          <LetterEditor
            job={job}
            source={source}
            disabled={advertShort || !source}
            busy={busy}
            setBusy={setBusy}
            onProblem={setProblem}
            onJobChange={onJobChange}
            refresh={refresh}
          />

          <InterviewPrepSection
            job={job}
            source={source}
            disabled={advertShort || !source}
            busy={busy}
            setBusy={setBusy}
            onProblem={setProblem}
            onJobChange={onJobChange}
            refresh={refresh}
          />

          {ent?.features.mockInterview !== false && (
            <MockInterview
              job={job}
              source={source}
              disabled={advertShort || !source || busy !== null}
              onJobChange={onJobChange}
              onError={(e) => setProblem(toProblem(e))}
              refresh={refresh}
            />
          )}
        </>
      )}
    </Card>
  );
}

/** Order-independent identity of the editable parts of a letter (for "unsaved changes"). */
const letterKey = (l: Letter | null) =>
  l
    ? JSON.stringify([
        l.greeting,
        l.paragraphs,
        l.closing,
        l.tone,
        l.email?.subject ?? '',
        l.email?.body ?? '',
      ])
    : '';

/** The short covering email: edit, copy, or open in the person's mail app. */
function ApplicationEmail({
  email,
  onChange,
}: {
  email: Letter['email'];
  onChange: (e: Letter['email']) => void;
}) {
  const tx = useT();
  const toast = useToast();
  const text = `${email.subject}\n\n${email.body}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: 'success', message: 'Email copied' });
    } catch {
      toast.show({ tone: 'error', message: 'Couldn’t copy. Select the text and copy it instead.' });
    }
  };
  const mailto = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  return (
    <div className="bg-sunken flex flex-col gap-3 rounded-md p-4" data-testid="application-email">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Mail aria-hidden size={16} /> {tx('Application email')}
      </h4>
      <p className="text-ink-muted -mt-2 text-xs">
        {tx(
          'To send with your CV and letter attached. Add the employer’s address in your email app.',
        )}
      </p>
      <TextField
        label={tx('Subject')}
        value={email.subject}
        maxLength={160}
        onChange={(e) => onChange({ ...email, subject: e.target.value })}
      />
      <TextArea
        label={tx('Email')}
        rows={7}
        value={email.body}
        maxLength={1500}
        onChange={(e) => onChange({ ...email, body: e.target.value })}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Copy aria-hidden size={16} />} onClick={copy}>
          {tx('Copy email')}
        </Button>
        <a
          href={mailto}
          className="text-primary inline-flex min-h-9 items-center gap-1.5 px-2 text-sm font-semibold"
        >
          {tx('Open in my email app')}
        </a>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<InterviewKind, string> = {
  experience: 'Your experience',
  skills: 'Skills',
  situation: 'Tell me about a time…',
  motivation: 'Why this job',
  gap: 'Something your CV doesn’t show',
};

/** Likely questions for this job, with notes from the CV and space for the person's own answer. */
function InterviewPrepSection({
  job,
  source,
  disabled,
  busy,
  setBusy,
  onProblem,
  onJobChange,
  refresh,
}: {
  job: Job;
  source: ResumeDocument | null;
  disabled: boolean;
  busy: Busy;
  setBusy: (b: Busy) => void;
  onProblem: (p: Problem | null) => void;
  onJobChange: (j: Job) => void;
  refresh: () => void;
}) {
  const tx = useT();
  const toast = useToast();
  const [conflict, setConflict] = useWorkspaceState<ConflictDetails | null>(
    'jobs.InterviewPrepSection.conflict',
    null,
    { dirty: false },
  );
  const runTask = useWorkspaceTask();
  const { ownerUid, store, tabId, routeKey } = useWorkspace();
  const [suggestion, setSuggestion] = useWorkspaceState<Job | null>(
    'jobs.InterviewPrepSection.suggestion',
    null,
    { dirty: false },
  );
  const acknowledgeNotes = useWorkspaceAcknowledge<string[]>('jobs.InterviewPrepSection.notes');
  const prep = job.interview;
  const [notes, setNotes] = useWorkspaceState<string[]>(
    'jobs.InterviewPrepSection.notes',
    job.interviewNotes ?? [],
    { dirty: true },
  );
  const dirty = JSON.stringify(notes) !== JSON.stringify(job.interviewNotes ?? []);
  const cvId = source?.id ?? '';
  const latestInputs = useRef({ notes, sourceId: cvId, job });
  useEffect(() => {
    latestInputs.current = { notes, sourceId: cvId, job };
  }, [notes, cvId, job]);
  const generationInputs = () =>
    JSON.stringify(
      store && tabId
        ? {
            notes: store.readFeature(tabId, `${routeKey}:jobs.InterviewPrepSection.notes`) ?? notes,
            sourceId: store.readFeature(tabId, `${routeKey}:jobs.JobTools.sourceId`) ?? cvId,
            job: store.readFeature(tabId, `${routeKey}:jobs.JobDetail.job`) ?? job,
            jobDraft: store.readFeature(tabId, `${routeKey}:jobs.JobDetail.draft`),
          }
        : latestInputs.current,
    );

  async function act(kind: Exclude<Busy, null>, fn: (signal: AbortSignal) => Promise<void>) {
    setBusy(kind);
    onProblem(null);
    try {
      await runTask(`jobs.InterviewPrepSection.${kind}`, fn);
    } catch (e) {
      if (e instanceof JobsError && e.status === 409) {
        setConflict(e.details ?? {});
        onProblem({ message: e.message });
      } else onProblem(toProblem(e));
    } finally {
      setBusy(null);
    }
  }
  const prepare = () => {
    if (
      (job.interviewNotes ?? []).some((n) => n.trim()) &&
      !confirm('New questions replace the current ones and your notes on them. Continue?')
    )
      return;
    void act('interview', async (signal) => {
      if (!source) return;
      const submitted = generationInputs();
      const next = await jobAiApi.interview(job.id, source, {
        signal,
        ownerUid,
        expectedRevision: revisionOf(job),
      });
      if (generationInputs() === submitted) {
        onJobChange(next);
        setNotes(next.interviewNotes ?? []);
        acknowledgeNotes(next.interviewNotes ?? []);
        setSuggestion(null);
      } else setSuggestion(next);
      refresh();
    });
  };
  const save = () =>
    act('notes', async (signal) => {
      onJobChange(
        await jobsApi.update(
          job.id,
          { interviewNotes: notes },
          { signal, ownerUid, expectedRevision: revisionOf(job) },
        ),
      );
      acknowledgeNotes(notes);
      toast.show({ tone: 'success', message: 'Notes saved' });
    });

  return (
    <section
      id="interview"
      aria-label={tx('Interview preparation')}
      className="border-line flex scroll-mt-20 flex-col gap-4 border-t pt-5"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <MessagesSquare aria-hidden size={18} /> {tx('Interview preparation')}
      </h3>
      <Button
        variant={prep ? 'ghost' : 'secondary'}
        icon={<Sparkles aria-hidden size={18} />}
        disabled={disabled || busy !== null}
        loading={busy === 'interview'}
        onClick={prepare}
        className="self-start"
      >
        {prep ? tx('New questions') : tx('Prepare for the interview')}
      </Button>
      <ConflictNotice
        details={conflict}
        onKeepDraft={
          conflict?.current
            ? () => {
                onJobChange(conflict.current as Job);
                setConflict(null);
              }
            : undefined
        }
        onApply={
          conflict?.generated
            ? () => {
                const generated = conflict.generated as Job & { job?: Job };
                setSuggestion(generated.job ?? generated);
                if (conflict.current) onJobChange(conflict.current as Job);
                setConflict(null);
              }
            : undefined
        }
      />
      {suggestion && (
        <Banner
          tone="info"
          title="New interview questions are ready"
          action={
            <Button
              size="sm"
              onClick={() => {
                onJobChange(suggestion);
                setNotes(suggestion.interviewNotes ?? []);
                setSuggestion(null);
              }}
            >
              {tx('Use new questions')}
            </Button>
          }
        >
          <details>
            <summary>{tx('Review new questions')}</summary>
            {suggestion.interview?.questions.map((q, i) => (
              <p key={i}>{q.question}</p>
            ))}
          </details>
        </Banner>
      )}
      {prep && (
        <div className="flex flex-col gap-3" data-testid="interview">
          <ol className="flex flex-col gap-3">
            {prep.questions.map((q, i) => (
              <li key={i} className="border-line rounded-md border p-4">
                <p className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
                  {KIND_LABEL[q.kind]}
                </p>
                <p className="mt-1 font-semibold">{tx(q.question)}</p>
                {q.why && <p className="text-ink-muted mt-1 text-sm">{q.why}</p>}
                {q.points.length > 0 && (
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                    {q.points.map((p, j) => (
                      <li key={j}>
                        <AskInline text={p} />
                      </li>
                    ))}
                  </ul>
                )}
                {q.evidence.length > 0 && (
                  <p className="text-ink-muted mt-2 text-xs">
                    {tx('From your CV:')}{' '}
                    {q.evidence.map((ev, j) => (
                      <span key={j}>
                        {j > 0 && ' · '}
                        {cvId ? (
                          <Link
                            href={`/cv/${cvId}?focus=${encodeURIComponent(ev.ref)}`}
                            className="text-primary font-semibold"
                          >
                            {ev.text.length > 60 ? `${ev.text.slice(0, 57)}…` : ev.text}
                          </Link>
                        ) : (
                          ev.text
                        )}
                      </span>
                    ))}
                  </p>
                )}
                <TextArea
                  label={tx('My answer notes')}
                  optional
                  rows={3}
                  maxLength={2000}
                  containerClassName="mt-3"
                  value={notes[i] ?? ''}
                  onChange={(e) => {
                    const next = [...notes];
                    while (next.length < prep.questions.length) next.push('');
                    next[i] = e.target.value;
                    setNotes(next);
                  }}
                />
              </li>
            ))}
          </ol>
          {prep.tips.length > 0 && (
            <div className="bg-sunken rounded-md p-4 text-sm">
              <p className="font-semibold">{tx('Tips for this interview')}</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {prep.tips.map((t, i) => (
                  <li key={i}>
                    <AskInline text={t} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            disabled={!dirty || busy !== null}
            loading={busy === 'notes'}
            onClick={save}
            className="self-start"
          >
            {tx('Save my notes')}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Highlights `{{?…}}` markers as [brackets] the person should check. */
function AskInline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{\{\?[^{}]*\}\})/g).map((part, i) =>
        part.startsWith('{{?') ? (
          <mark key={i} className="bg-warning-soft rounded-sm px-1">
            [{part.slice(3, -2)}]
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const STATUS = {
  met: { label: 'You show this', Icon: CircleCheck, cls: 'text-success' },
  partial: { label: 'Partly shown', Icon: CircleDashed, cls: 'text-warning' },
  missing: { label: 'Not in your CV', Icon: CircleX, cls: 'text-danger' },
} as const;

function MatchView({ match, cvId }: { match: MatchResult; cvId: string }) {
  const tx = useT();
  const groups = (['missing', 'partial', 'met'] as const)
    .map((s) => ({ s, items: match.requirements.filter((r) => r.status === s) }))
    .filter((g) => g.items.length);
  const met = match.requirements.filter((r) => r.status === 'met').length;
  return (
    <section
      aria-label={tx('How your CV matches')}
      className="flex flex-col gap-4"
      data-testid="match"
    >
      <div className="bg-sunken rounded-md p-4">
        <p className="font-semibold">
          {tx('{met} of {length} requirements clearly shown', {
            met: met,
            length: match.requirements.length,
          })}
        </p>
        {match.summary && <p className="text-ink-muted mt-1 text-sm">{match.summary}</p>}
        <p className="text-ink-muted mt-1 text-xs">
          {tx('Checked against “{sourceTitle}” on{v} {v2}', {
            sourceTitle: match.sourceTitle,
            v: ' ',
            v2: new Date(match.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          })}
        </p>
      </div>
      {groups.map(({ s, items }) => {
        const { label, Icon, cls } = STATUS[s];
        return (
          <div key={s} className="flex flex-col gap-2">
            <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${cls}`}>
              <Icon aria-hidden size={16} /> {label} ({items.length})
            </h3>
            <ul className="flex flex-col gap-2">
              {items.map((r, i) => (
                <li key={i} className="border-line rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    {r.text}
                    {r.importance === 'must' && (
                      <span className="text-ink-muted ml-2 text-xs font-normal">
                        {tx('Essential')}
                      </span>
                    )}
                  </p>
                  {r.evidence.map((ev, j) => (
                    <p key={j} className="text-ink-muted mt-1.5 flex gap-2">
                      <span className="border-line-strong border-l-2 pl-2 italic">{ev.text}</span>
                      {ev.ref && cvId && (
                        <Link
                          href={`/cv/${cvId}?focus=${encodeURIComponent(ev.ref)}`}
                          className="text-primary shrink-0 font-semibold not-italic"
                        >
                          {tx('Show me')}
                        </Link>
                      )}
                    </p>
                  ))}
                  {r.note && <p className="text-ink-muted mt-1.5">{r.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {match.keywords.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{tx('Words from the advert')}</h3>
          <ul className="flex flex-wrap gap-1.5" aria-label={tx('Keywords')}>
            {match.keywords.map((k) => (
              <li
                key={k.term}
                className={
                  k.found
                    ? 'bg-success-soft text-success rounded-full px-2.5 py-1 text-xs font-semibold'
                    : 'border-line-strong text-ink-muted rounded-full border border-dashed px-2.5 py-1 text-xs'
                }
              >
                {k.found ? '✓ ' : ''}
                {k.term}
                <span className="sr-only">
                  {k.found ? tx(' (in your CV)') : tx(' (not in your CV)')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted text-xs">
            {tx('Only add a missing word if it’s true for you. Employers check.')}
          </p>
        </div>
      )}
    </section>
  );
}

function LetterEditor({
  job,
  source,
  disabled,
  busy,
  setBusy,
  onProblem,
  onJobChange,
  refresh,
}: {
  job: Job;
  source: ResumeDocument | null;
  disabled: boolean;
  busy: Busy;
  setBusy: (b: Busy) => void;
  onProblem: (p: Problem | null) => void;
  onJobChange: (j: Job) => void;
  refresh: () => void;
}) {
  const tx = useT();
  const toast = useToast();
  const [conflict, setConflict] = useWorkspaceState<ConflictDetails | null>(
    'jobs.LetterEditor.conflict',
    null,
    { dirty: false },
  );
  const runTask = useWorkspaceTask();
  const { ownerUid, store, tabId, routeKey } = useWorkspace();
  const [tone, setTone] = useWorkspaceState<'warm' | 'formal'>(
    'jobs.LetterEditor.tone',
    job.letter?.tone ?? 'warm',
    { dirty: true },
  );
  const [draft, setDraft] = useWorkspaceState<Letter | null>(
    'jobs.LetterEditor.draft',
    job.letter ?? null,
    { dirty: true },
  );

  const [suggestion, setSuggestion] = useWorkspaceState<Letter | null>(
    'jobs.LetterEditor.suggestion',
    null,
    { dirty: false },
  );
  const downloadFile = useWorkspaceDownload();
  const latestInputs = useRef({ draft, tone, sourceId: source?.id ?? '' });
  useEffect(() => {
    latestInputs.current = { draft, tone, sourceId: source?.id ?? '' };
  }, [draft, tone, source]);
  const generationInputs = () =>
    JSON.stringify(
      store && tabId
        ? {
            draft: store.readFeature(tabId, `${routeKey}:jobs.LetterEditor.draft`) ?? draft,
            tone: store.readFeature(tabId, `${routeKey}:jobs.LetterEditor.tone`) ?? tone,
            sourceId:
              store.readFeature(tabId, `${routeKey}:jobs.JobTools.sourceId`) ?? source?.id ?? '',
            jobDraft: store.readFeature(tabId, `${routeKey}:jobs.JobDetail.draft`),
          }
        : latestInputs.current,
    );

  const currentDraft = useCurrentWorkspaceValue('jobs.LetterEditor.draft', draft);
  const acknowledgeLetter = useWorkspaceAcknowledge<Letter | null>('jobs.LetterEditor.draft');
  const previousLetter = useRef(job.letter ?? null);
  useEffect(() => {
    const fullKey = `${routeKey}:jobs.LetterEditor.draft`;
    const feature = store && tabId ? store.getTab(tabId)?.features[fullKey] : undefined;
    const baseline = feature?.baseline ? feature.baseline.value : previousLetter.current;
    const next = job.letter ?? null;
    // A kit or another saved server operation can replace the canonical letter.
    // Refresh only an untouched draft; keep personal edits available for comparison.
    if (sameSnapshotValue(currentDraft(), baseline)) {
      setDraft(next);
      if (store && tabId) {
        const updated = store.getTab(tabId)?.features[fullKey];
        if (updated) store.markClean(tabId, fullKey, { [fullKey]: { ...updated, value: next } });
      }
    }
    previousLetter.current = next;
  }, [job.letter, currentDraft, setDraft, store, tabId, routeKey]);

  // The letter uses the design of the CV it was written from (or the chosen one).
  const design = (draft?.documentId && getRepository().get(draft.documentId)) || source || null;
  const html = useMemo(
    () =>
      draft && design
        ? buildLetterHtml(design, draft, job, {
            fonts: { kind: 'url', baseUrl: window.location.origin },
          })
        : '',
    [draft, design, job],
  );
  const dirty = letterKey(draft) !== letterKey(job.letter ?? null);
  const asks = draft
    ? ([draft.greeting, ...draft.paragraphs, draft.closing].join(' ').match(/\{\{\?/g)?.length ?? 0)
    : 0;

  async function act(kind: Exclude<Busy, null>, fn: (signal: AbortSignal) => Promise<void>) {
    setBusy(kind);
    onProblem(null);
    try {
      await runTask(`jobs.LetterEditor.${kind}`, fn);
    } catch (e) {
      if (e instanceof JobsError && e.status === 409) {
        setConflict(e.details ?? {});
        onProblem({ message: e.message });
      } else onProblem(toProblem(e));
    } finally {
      setBusy(null);
    }
  }

  const write = () =>
    act('letter', async (signal) => {
      if (!source) return;
      const submitted = generationInputs();
      const r = await jobAiApi.letter(job.id, source, tone, {
        signal,
        ownerUid,
        expectedRevision: revisionOf(job),
      });
      const unchanged = generationInputs() === submitted;
      onJobChange(r.job);
      if (unchanged) {
        setDraft(r.job.letter ?? null);
        acknowledgeLetter(r.job.letter ?? null);
        setSuggestion(null);
      } else setSuggestion(r.job.letter ?? null);
      refresh();
      toast.show({ tone: 'success', message: 'Draft ready. Read it through and make it yours.' });
    });
  const save = () =>
    act('save', async (signal) => {
      if (!draft) return;
      const next = await jobsApi.update(
        job.id,
        { letter: { ...draft, paragraphs: draft.paragraphs.filter((p) => p.trim()) } },
        { signal, ownerUid, expectedRevision: revisionOf(job) },
      );
      onJobChange(next);
      if (sameSnapshotValue(currentDraft(), draft)) setDraft(next.letter ?? null);
      acknowledgeLetter(next.letter ?? null);
      toast.show({ tone: 'success', message: 'Letter saved' });
    });
  const pdf = () =>
    act('pdf', async (signal) => {
      if (!design) return;
      const blob = await jobAiApi.letterPdf(job.id, design, { signal, ownerUid });
      const name = (design.basics.name || 'Cover').replace(/[^\p{L}\p{N}]+/gu, '-');
      downloadFile(blob, `${name}-Cover-Letter.pdf`);
      refresh();
    });

  const setPara = (i: number, v: string) =>
    setDraft((d) => d && { ...d, paragraphs: d.paragraphs.map((p, j) => (j === i ? v : p)) });

  return (
    <section
      id="letter"
      aria-label={tx('Cover letter')}
      className="border-line flex scroll-mt-20 flex-col gap-4 border-t pt-5"
    >
      <ConflictNotice
        details={conflict}
        onKeepDraft={
          conflict?.current
            ? () => {
                onJobChange(conflict.current as Job);
                setConflict(null);
              }
            : undefined
        }
        onApply={
          conflict?.generated
            ? () => {
                const generated = conflict.generated as Job & { job?: Job };
                const letter = (generated.job ?? generated).letter;
                if (letter) setDraft(letter);
                if (conflict.current) onJobChange(conflict.current as Job);
                setConflict(null);
              }
            : undefined
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <FileText aria-hidden size={18} /> {tx('Cover letter')}
        </h3>
        <div role="radiogroup" aria-label={tx('Tone')} className="flex gap-2">
          {(['warm', 'formal'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tone === t}
              onClick={() => setTone(t)}
              className={
                tone === t
                  ? 'border-primary bg-primary-soft text-primary min-h-10 rounded-full border-2 px-3.5 text-sm font-semibold'
                  : 'border-line-strong bg-surface hover:bg-sunken min-h-10 rounded-full border px-3.5 text-sm font-semibold'
              }
            >
              {t === 'warm' ? tx('Warm') : tx('Formal')}
            </button>
          ))}
        </div>
      </div>
      <Button
        variant={draft ? 'ghost' : 'secondary'}
        icon={<Sparkles aria-hidden size={18} />}
        disabled={disabled || busy !== null}
        loading={busy === 'letter'}
        onClick={() => {
          if (dirty && !confirm('Replace your edited letter with a new draft?')) return;
          void write();
        }}
        className="self-start"
      >
        {draft ? tx('Write a new draft') : tx('Write a cover letter')}
      </Button>

      {(suggestion || (!draft && job.letter)) && (
        <Banner
          tone="info"
          title="Your generated letter is ready"
          action={
            <Button
              size="sm"
              onClick={() => {
                setDraft(suggestion ?? job.letter ?? null);
                setSuggestion(null);
              }}
            >
              {tx('Use generated letter')}
            </Button>
          }
        >
          <details>
            <summary>{tx('Review generated letter')}</summary>
            <p className="whitespace-pre-wrap">
              {(suggestion ?? job.letter)?.paragraphs.join('\n\n')}
            </p>
          </details>
        </Banner>
      )}
      {draft && (
        <div className="flex flex-col gap-3" data-testid="letter-editor">
          {asks > 0 && (
            <Banner
              tone="warning"
              title={tx('{asks} detail{v1} to fill in', { asks: asks, v1: asks > 1 ? 's' : '' })}
            >
              {tx('Replace the highlighted [brackets] with your own details before sending.')}
            </Banner>
          )}
          <TextField
            label={tx('Greeting')}
            value={draft.greeting}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
          />
          {draft.paragraphs.map((p, i) => (
            <TextArea
              key={i}
              label={tx('Paragraph {v0}', { v0: i + 1 })}
              rows={5}
              value={p}
              maxLength={1500}
              onChange={(e) => setPara(i, e.target.value)}
            />
          ))}
          {draft.paragraphs.length < 8 && (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => setDraft({ ...draft, paragraphs: [...draft.paragraphs, ''] })}
            >
              {tx('Add a paragraph')}
            </Button>
          )}
          <TextField
            label={tx('Sign-off')}
            value={draft.closing}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, closing: e.target.value })}
          />
          {(draft.email?.subject || draft.email?.body) && (
            <ApplicationEmail
              email={draft.email}
              onChange={(email) => setDraft({ ...draft, email })}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!dirty || busy !== null} loading={busy === 'save'} onClick={save}>
              {tx('Save letter')}
            </Button>
            <Button
              variant="secondary"
              icon={dirty ? <Lock aria-hidden size={18} /> : <Download aria-hidden size={18} />}
              disabled={dirty || busy !== null || !design}
              loading={busy === 'pdf'}
              onClick={pdf}
              title={dirty ? tx('Save the letter first') : undefined}
            >
              {tx('Download PDF')}
            </Button>
          </div>
          {html && design && (
            <ScaledPage
              html={html}
              widthMm={resolvePage(design).widthMm}
              heightMm={resolvePage(design).heightMm}
            />
          )}
        </div>
      )}
    </section>
  );
}
