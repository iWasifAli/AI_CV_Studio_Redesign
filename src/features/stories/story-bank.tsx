'use client';

import { sameSnapshotValue } from '@/features/workspace/equality';
import { useCurrentWorkspaceValue } from '@/features/workspace/use-current-value';

import { useWorkspaceTask } from '@/features/workspace/context';

import { useWorkspaceState, useWorkspaceClean } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, Chip } from '@/components/ui/chip';
import { TextArea, TextField } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAccount, useRepositoryVersion } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { JobsError } from '@/features/jobs/api';
import { profileDigest } from '@/modules/jobs/digest';
import { defaultSourceCv } from '@/modules/jobs/source-cv';
import { getRepository } from '@/modules/storage/repository';
import {
  isComplete,
  STORY_PART_LABEL,
  STORY_PARTS,
  type Story,
  type StoryInput,
} from '@/modules/stories/schema';
import { storyPoints } from '@/modules/stories/points';
import { storiesApi } from './api';

type Draft = {
  id?: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills: string[];
  source?: StoryInput['source'];
};
const EMPTY: Draft = { title: '', situation: '', task: '', action: '', result: '', skills: [] };
const QUESTION = /\{\{\?[^}]*\}\}/;

/**
 * Story bank (R9.3): achievement stories in the STAR shape, written once and tagged by skill.
 * Writing is free up to the plan's number; drafting one from a CV point is a Premium AI action.
 */
export function StoryBank() {
  const runTask = useWorkspaceTask();
  const markClean = useWorkspaceClean();

  const t = useT();
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const toast = useToast();
  const [stories, setStories] = useWorkspaceState<Story[]>('stories.StoryBank.stories', [], {
    dirty: false,
  });
  const [access, setAccess] = useState<{ max: number; enabled: boolean } | null>(null);
  const data = access ? { ...access, stories } : null;
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useWorkspaceState<Draft | null>('stories.StoryBank.editing', null, {
    dirty: true,
  });
  const currentEditing = useCurrentWorkspaceValue('stories.StoryBank.editing', editing);
  const [suggestion, setSuggestion] = useWorkspaceState<Draft | null>(
    'stories.StoryBank.suggestion',
    null,
    { dirty: false },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'stories.StoryBank.problem',
    null,
    { dirty: false },
  );

  const repositoryVersion = useRepositoryVersion();
  const repo = typeof window === 'undefined' ? null : getRepository();
  const source = useMemo(() => {
    const cvs = repo?.list() ?? [];
    const id = defaultSourceCv(cvs);
    return (id && repo?.get(id)) || null;
  }, [repo, repositoryVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- repository event revision
  const digest = useMemo(() => (source ? profileDigest(source) : null), [source]);
  const points = useMemo(
    () => (source && digest ? storyPoints(source, digest) : []),
    [source, digest],
  );

  useEffect(() => {
    if (account.status !== 'signedIn') return;
    const baseline = stories;
    let live = true;
    const controller = new AbortController();
    storiesApi.list({ signal: controller.signal, ownerUid: account.user?.uid }).then(
      (data) => {
        if (!live) return;
        setStories((current) => (current === baseline ? data.stories : current));
        setAccess({ max: data.max, enabled: data.enabled });
      },
      (e: Error) => {
        if (live) setError(e.message);
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
    // Revalidate on arrival/account change; a late GET cannot replace completed task writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status, account.user?.uid, setStories]);

  const fail = (e: unknown) =>
    setProblem(
      e instanceof JobsError
        ? { message: e.message, premium: e.status === 402 }
        : { message: 'You seem to be offline. Please try again.' },
    );

  if (account.status === 'signedOut')
    return (
      <div className="border-line bg-surface flex flex-col items-start gap-3 rounded-xl border p-6">
        <p className="text-lg font-semibold">{t('Sign in to keep your stories')}</p>
        <p className="text-ink-muted">
          {t('Write your best work stories once, then use them in interviews and letters.')}
        </p>
        <ButtonLink href="/signin?next=/stories">{t('Sign in')}</ButtonLink>
      </div>
    );
  if (error) return <Banner tone="error" title={error} />;
  if (!data) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!data.enabled)
    return <Banner tone="info" title={t('The story bank is switched off right now.')} />;

  const full = data.max !== -1 && data.stories.length >= data.max;
  const aiLocked = ent ? ent.limits['ai.action'] === 0 : false;

  const save = async () => {
    return runTask('stories.StoryBank.save', async (signal) => {
      if (!editing) return;
      setBusy('save');
      setProblem(null);
      try {
        const input: StoryInput = {
          title: editing.title,
          situation: editing.situation,
          task: editing.task,
          action: editing.action,
          result: editing.result,
          skills: editing.skills,
          ...(editing.source ? { source: editing.source } : {}),
        };
        const saved = editing.id
          ? await storiesApi.update(editing.id, input, { signal, ownerUid: account.user?.uid })
          : await storiesApi.create(input, { signal, ownerUid: account.user?.uid });
        signal.throwIfAborted();
        setStories((current) => [saved, ...current.filter((s) => s.id !== saved.id)]);
        let unchanged = false;
        setEditing((current) => {
          unchanged = JSON.stringify(current) === JSON.stringify(editing);
          return unchanged ? null : current;
        });
        if (unchanged) markClean();
        toast.show({ tone: 'success', message: 'Story saved' });
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

  const remove = async (s: Story) => {
    return runTask(`stories.StoryBank.remove.${s.id}`, async (signal) => {
      if (!confirm(`Delete “${s.title}”?`)) return;
      try {
        await storiesApi.remove(s.id, { signal, ownerUid: account.user?.uid });
        signal.throwIfAborted();
        setStories((current) => current.filter((x) => x.id !== s.id));
      } catch (e) {
        signal.throwIfAborted();
        fail(e);
      }
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="story-bank">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-muted text-sm" data-testid="story-count">
          {data.max === -1
            ? `${data.stories.length} ${data.stories.length === 1 ? 'story' : 'stories'}`
            : t('{length} of {max} stories', { length: data.stories.length, max: data.max })}
        </p>
        {!editing && (
          <Button
            icon={<Plus aria-hidden size={18} />}
            disabled={full}
            onClick={() => {
              setProblem(null);
              setEditing({ ...EMPTY });
            }}
          >
            {t('New story')}
          </Button>
        )}
      </div>
      {full && !editing && (
        <Banner
          tone="info"
          title={
            data.max === 0
              ? t('The story bank isn’t part of your plan.')
              : t('Your plan keeps up to {max} stories.', { max: data.max })
          }
          action={
            ent?.features.sales ? (
              <ButtonLink href="/premium?next=/stories" size="sm">
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        >
          {t('Delete a story you no longer need')}
          {ent?.features.sales ? ', or get Premium to keep more' : ''}.
        </Banner>
      )}
      {problem && (
        <Banner
          tone={problem.premium ? 'info' : 'error'}
          title={problem.message}
          onDismiss={() => setProblem(null)}
          action={
            problem.premium && ent?.features.sales ? (
              <ButtonLink href="/premium?next=/stories" size="sm">
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      {suggestion && (
        <section className="border-line rounded-lg border p-4">
          <h2 className="font-semibold">
            {t('Suggested story: {title}', { title: suggestion.title })}
          </h2>
          <p>{suggestion.situation}</p>
          <p>{suggestion.task}</p>
          <p>{suggestion.action}</p>
          <p>{suggestion.result}</p>
          <Button
            onClick={() => {
              setEditing(suggestion);
              setSuggestion(null);
            }}
          >
            {t('Use this story')}
          </Button>
        </section>
      )}
      {editing && (
        <StoryEditor
          key={editing.id ?? 'new'}
          draft={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
          saving={busy === 'save'}
          skills={digest?.skills ?? []}
          points={editing.id ? [] : points}
          aiLocked={aiLocked}
          drafting={busy === 'draft'}
          onDraft={async (point, notes, inputsUnchanged) => {
            return runTask('stories.StoryBank.onDraft', async (signal) => {
              if (!source) return;
              setBusy('draft');
              setProblem(null);
              try {
                const d = await storiesApi.draft(source, point, notes, {
                  signal,
                  ownerUid: account.user?.uid,
                });
                signal.throwIfAborted();
                const next = { ...d, source: d.source };
                if (
                  inputsUnchanged() &&
                  sameSnapshotValue(currentEditing(), editing) &&
                  sameSnapshotValue(repo?.get(source.id), source)
                ) {
                  setEditing(next);
                  setSuggestion(null);
                } else setSuggestion(next);
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
          }}
        />
      )}

      {data.stories.length === 0 && !editing ? (
        <div className="border-line bg-surface flex flex-col items-start gap-3 rounded-xl border p-6">
          <BookOpen aria-hidden size={26} className="text-primary" />
          <p className="text-lg font-semibold">{t('Your first story')}</p>
          <p className="text-ink-muted max-w-xl">
            {t(
              'Interviewers ask “Tell me about a time…”. Write a few real examples now — a problem you solved, something you improved, a time you helped someone — and they’ll be ready in mock interviews, the coach and your letters.',
            )}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label={t('Your stories')}>
          {data.stories.map((s) => (
            <li
              key={s.id}
              className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4"
              data-testid="story"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{s.title}</h3>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="text-ink-muted hover:bg-sunken hover:text-ink rounded-sm p-2"
                    aria-label={t('Edit “{title}”', { title: s.title })}
                    onClick={() => {
                      setProblem(null);
                      setEditing({ ...s });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <Pencil aria-hidden size={16} />
                  </button>
                  <button
                    type="button"
                    className="text-ink-muted hover:bg-sunken hover:text-danger rounded-sm p-2"
                    aria-label={t('Delete “{title}”', { title: s.title })}
                    onClick={() => remove(s)}
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.skills.map((k) => (
                  <Badge key={k} tone="primary">
                    {k}
                  </Badge>
                ))}
                {!isComplete(s) && <Badge tone="warning">{t('Add what you did')}</Badge>}
                {STORY_PARTS.some((p) => QUESTION.test(s[p])) && (
                  <Badge tone="warning">{t('Has questions to answer')}</Badge>
                )}
                {s.source.kind === 'mock' && <Badge>{t('From a mock interview')}</Badge>}
              </div>
              <dl className="text-ink-muted flex flex-col gap-1 text-sm">
                {STORY_PARTS.filter((p) => s[p].trim()).map((p) => (
                  <div key={p}>
                    <dt className="text-ink inline font-semibold">
                      {t(STORY_PART_LABEL[p].title)}:{' '}
                    </dt>
                    <dd className="inline">{s[p]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StoryEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  skills,
  points,
  aiLocked,
  drafting,
  onDraft,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  skills: string[];
  points: { id: string; text: string; role: string }[];
  aiLocked: boolean;
  drafting: boolean;
  onDraft: (point: string, notes: string, inputsUnchanged: () => boolean) => void;
}) {
  const t = useT();
  const [point, setPoint] = useWorkspaceState(
    `stories.StoryEditor.point.${draft.id ?? 'new'}`,
    points[0]?.id ?? '',
    {
      dirty: true,
    },
  );
  useEffect(() => {
    const next = points[0]?.id;
    if (!point && next) setPoint((current) => current || next);
  }, [points, point, setPoint]);
  const [notes, setNotes] = useWorkspaceState(
    `stories.StoryEditor.notes.${draft.id ?? 'new'}`,
    '',
    { dirty: true },
  );
  const [tag, setTag] = useWorkspaceState(`stories.StoryEditor.tag.${draft.id ?? 'new'}`, '', {
    dirty: true,
  });
  const currentPoint = useCurrentWorkspaceValue(
    `stories.StoryEditor.point.${draft.id ?? 'new'}`,
    point,
  );
  const currentNotes = useCurrentWorkspaceValue(
    `stories.StoryEditor.notes.${draft.id ?? 'new'}`,
    notes,
  );
  // Open the "draft from my CV" panel for a new, empty story; decided once, so typing never closes it.
  const [draftOpen] = useWorkspaceState(
    `stories.StoryEditor.draftOpen.${draft.id ?? 'new'}`,
    !draft.title,
    {
      dirty: false,
    },
  );
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const addTag = (t: string) => {
    const v = t.trim().slice(0, 40);
    if (!v || draft.skills.some((k) => k.toLowerCase() === v.toLowerCase())) return;
    if (draft.skills.length >= 8) return;
    set({ skills: [...draft.skills, v] });
  };
  const roles = [...new Set(points.map((p) => p.role))];
  const questions = STORY_PARTS.some((p) => QUESTION.test(draft[p]));

  return (
    <section
      aria-labelledby="story-editor-h"
      className="border-line bg-surface flex flex-col gap-4 rounded-xl border p-5"
      data-testid="story-editor"
    >
      <h2 id="story-editor-h" className="text-lg font-semibold">
        {draft.id ? t('Edit story') : t('New story')}
      </h2>

      {points.length > 0 && (
        <details className="border-primary/40 rounded-lg border p-4" open={draftOpen}>
          <summary className="cursor-pointer font-semibold">
            <Sparkles aria-hidden size={16} className="mr-1 inline" />{' '}
            {t('Draft it from a point in my CV')}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t('Point from your CV')}
              <select
                className="border-line-strong bg-surface h-11 rounded-sm border px-2 font-normal"
                value={point}
                onChange={(e) => setPoint(e.target.value)}
              >
                {roles.map((r) => (
                  <optgroup key={r} label={r.slice(0, 80)}>
                    {points
                      .filter((p) => p.role === r)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.text.length > 110 ? `${p.text.slice(0, 107)}…` : p.text}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <TextArea
              label={t('Anything to add?')}
              optional
              hint={t('What happened, what you did, how it turned out — in your own words.')}
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              variant="secondary"
              className="self-start"
              icon={aiLocked ? <Lock aria-hidden size={16} /> : <Sparkles aria-hidden size={16} />}
              loading={drafting}
              disabled={!point || drafting}
              onClick={() =>
                onDraft(point, notes, () => currentPoint() === point && currentNotes() === notes)
              }
            >
              {t('Draft with AI')}
            </Button>
            <p className="text-ink-muted text-xs">
              {t(
                'Uses only what your CV point and your notes say; anything missing becomes a question for you.',
              )}{' '}
              {aiLocked && t('Drafting is part of Premium; writing it yourself is free.')}
            </p>
          </div>
        </details>
      )}

      <TextField
        label={t('Title')}
        hint={t('A few words, e.g. “Kept deliveries on time after a depot closed”.')}
        maxLength={120}
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
      />
      {STORY_PARTS.map((p) => (
        <TextArea
          key={p}
          label={t(STORY_PART_LABEL[p].title)}
          hint={t(STORY_PART_LABEL[p].hint)}
          optional={p !== 'action'}
          rows={p === 'action' ? 4 : 2}
          maxLength={1200}
          value={draft[p]}
          onChange={(e) => set({ [p]: e.target.value })}
        />
      ))}
      {questions && (
        <Banner
          tone="warning"
          title={t('Answer the questions in {{? }} before you use this story.')}
        >
          {t('Replace each one with the real detail, or delete it.')}
        </Banner>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold" id="story-skills-l">
          {t('Skills it shows')}
        </p>
        <div className="flex flex-wrap gap-1.5" aria-labelledby="story-skills-l">
          {draft.skills.map((k) => (
            <Chip
              key={k}
              mode="remove"
              aria-label={t('Remove {k}', { k: k })}
              onClick={() => set({ skills: draft.skills.filter((x) => x !== k) })}
            >
              {k}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <TextField
            label={t('Add a skill')}
            containerClassName="flex-1"
            maxLength={40}
            value={tag}
            list="story-skill-options"
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(tag);
                setTag('');
              }
            }}
          />
          <datalist id="story-skill-options">
            {skills.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <Button
            variant="secondary"
            className="self-end"
            disabled={!tag.trim()}
            onClick={() => {
              addTag(tag);
              setTag('');
            }}
          >
            {t('Add')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button loading={saving} disabled={saving || !draft.title.trim()} onClick={onSave}>
          {t('Save story')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
      <p className="text-ink-muted text-xs">
        {t('Your stories are used as your own facts in')}{' '}
        <Link href="/coach" className="text-primary underline">
          {t('mock interviews and the coach')}
        </Link>{' '}
        {t('and in AI letters. Keep them true.')}
      </p>
    </section>
  );
}
