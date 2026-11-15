'use client';

import { useLang, useT } from '@/i18n/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Lock, Sparkles, Trash2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { TextArea, TextField } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { JobsError } from '@/features/jobs/api';
import { saveBlob } from '@/lib/save-blob';
import { buildLetterHtml } from '@/modules/letters/build-letter';
import type { SavedLetter } from '@/modules/letters/schema';
import { LETTER_TYPE } from '@/modules/letters/types';
import { createDocument } from '@/modules/resume/create';
import type { ResumeDocument } from '@/modules/resume/schema';
import { ops } from '@/modules/resume/ops';
import type { DesignSpecV2 } from '@/modules/design/spec';
import { getRepository } from '@/modules/storage/repository';
import { lettersApi } from './api';
import { ScaledPage, resolvePage } from './scaled-page';
import { PackButton } from '@/features/export/pack-dialog';

type Editable = Pick<
  SavedLetter,
  'to' | 'subject' | 'greeting' | 'paragraphs' | 'closing' | 'documentId' | 'designId' | 'answers'
>;
const editable = (l: SavedLetter): Editable => ({
  to: l.to,
  subject: l.subject,
  greeting: l.greeting,
  paragraphs: l.paragraphs,
  closing: l.closing,
  documentId: l.documentId,
  designId: l.designId ?? '',
  answers: l.answers,
});
const key = (e: Editable) => JSON.stringify(e);

/** /letters/[id]: edit a library letter beside a live preview in the CV's design; PDF; AI redraft. */
export function LetterScreen({ id }: { id: string }) {
  const tx = useT();
  const account = useAccount();
  const [letter, setLetter] = useState<SavedLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (account.status !== 'signedIn') return;
    lettersApi.get(id).then(setLetter, (e: Error) => setError(e.message));
  }, [account.status, id]);
  if (account.status === 'signedOut')
    return (
      <Banner
        tone="info"
        title={tx('Sign in to see this letter')}
        action={
          <ButtonLink size="sm" href={`/signin?next=/letters/${id}`}>
            {tx('Sign in')}
          </ButtonLink>
        }
      />
    );
  if (error)
    return (
      <Banner
        tone="error"
        title={error}
        action={
          <ButtonLink size="sm" href="/documents?type=letters">
            {tx('Your letters')}
          </ButtonLink>
        }
      />
    );
  if (!letter) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <Editor key={letter.id} initial={letter} />;
}

function Editor({ initial }: { initial: SavedLetter }) {
  const lang = useLang();
  const tx = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const type = LETTER_TYPE[initial.type];
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Editable>(() => editable(initial));
  const [tone, setTone] = useState(initial.tone);
  const [busy, setBusy] = useState<null | 'save' | 'ai' | 'pdf' | 'delete'>(null);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(() => {
    const ai = params.get('ai');
    return ai ? { message: `The AI draft didn’t work: ${ai} Your answers are kept below.` } : null;
  });
  const aiLocked = ent ? ent.limits['ai.action'] === 0 : false;
  const dirty = key(draft) !== key(editable(saved));

  const repo = typeof window === 'undefined' ? null : getRepository();
  const cvs = useMemo(() => repo?.list() ?? [], [repo]);
  // The design and contact details come from the chosen CV, or a plain page with the account name.
  const statement = type.form === 'statement';
  // Saved designs ("My designs", spec §7.4): a letter can use one instead of the CV's own design.
  const [savedDesigns, setSavedDesigns] = useState<
    { id: string; name: string; spec: DesignSpecV2 }[]
  >([]);
  useEffect(() => {
    if (account.status !== 'signedIn') return;
    let live = true;
    fetch('/api/designs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { designs: [] }))
      .then((j: { designs: typeof savedDesigns }) => live && setSavedDesigns(j.designs ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account.status]);
  const design: ResumeDocument = useMemo(() => {
    let doc = draft.documentId ? repo?.get(draft.documentId) : null;
    if (!doc) {
      doc = createDocument('general', { locale: lang === 'de' ? 'de-DE' : 'en-GB' });
      doc.basics.name = account.user?.name ?? '';
      doc.basics.email = account.user?.email ?? '';
    }
    const mine = draft.designId ? savedDesigns.find((d) => d.id === draft.designId) : null;
    return mine ? ops.setSpec(doc, mine.spec) : doc;
  }, [draft.documentId, draft.designId, savedDesigns, repo, account.user, lang]);
  const html = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : buildLetterHtml(
            design,
            draft,
            {
              title: '',
              company: '',
              to: draft.to,
              subject: draft.subject,
              kind: type.title.toLowerCase(),
              form: type.form,
            },
            { fonts: { kind: 'url', baseUrl: window.location.origin } },
          ),
    [design, draft, type],
  );
  const asks =
    [draft.greeting, ...draft.paragraphs, draft.closing].join(' ').match(/\{\{\?/g)?.length ?? 0;

  async function act(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(
        e instanceof JobsError
          ? { message: e.message, premium: e.status === 402 }
          : { message: 'You seem to be offline. Please try again.' },
      );
    } finally {
      setBusy(null);
    }
  }
  const save = () =>
    act('save', async () => {
      const next = await lettersApi.update(saved.id, {
        ...draft,
        title: draft.subject || type.title,
        paragraphs: draft.paragraphs.filter((p) => p.trim()),
        tone,
      });
      setSaved(next);
      setDraft(editable(next));
      toast.show({ tone: 'success', message: 'Letter saved' });
    });
  const redraft = () =>
    act('ai', async () => {
      if (dirty) await lettersApi.update(saved.id, { ...draft, tone });
      const r = await lettersApi.draft(saved.id, design, tone);
      setSaved(r.letter);
      setDraft(editable(r.letter));
      refresh();
      toast.show({ tone: 'success', message: 'Draft ready. Read it through and make it yours.' });
    });
  const pdf = () =>
    act('pdf', async () => {
      const blob = await lettersApi.pdf(saved.id, design);
      const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      saveBlob(blob, `${slug(design.basics.name || 'My')}-${slug(type.title)}.pdf`);
      refresh();
    });
  const remove = () =>
    act('delete', async () => {
      if (!confirm('Delete this letter? This can’t be undone.')) return;
      await lettersApi.remove(saved.id);
      toast.show({ message: 'Letter deleted' });
      router.push('/documents?type=letters');
    });

  const setPara = (i: number, v: string) =>
    setDraft((d) => ({ ...d, paragraphs: d.paragraphs.map((p, j) => (j === i ? v : p)) }));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4" data-testid="letter-form">
        <Link
          href="/documents?type=letters"
          className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          <ArrowLeft aria-hidden size={16} /> {tx('Your letters')}
        </Link>
        <div>
          <p className="text-ink-muted text-sm font-semibold">{tx(type.title)}</p>
          <h1 className="font-display text-[28px] leading-tight font-semibold">
            {draft.subject || type.title}
          </h1>
        </div>
        {problem && (
          <Banner
            tone="error"
            title={problem.message}
            action={
              problem.premium ? (
                <ButtonLink href="/premium" size="sm">
                  {tx('See Premium')}
                </ButtonLink>
              ) : undefined
            }
          />
        )}
        {asks > 0 && (
          <Banner
            tone="warning"
            title={tx('{asks} detail{v1} to fill in', { asks: asks, v1: asks > 1 ? 's' : '' })}
          >
            {tx('Replace the highlighted [brackets] with your own details before sending.')}
          </Banner>
        )}

        <details className="border-line bg-surface rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">
            {tx('Your answers and a new AI draft')}
          </summary>
          <div className="mt-4 flex flex-col gap-3">
            {type.questions.map((q) =>
              q.options ? (
                <label key={q.id} className="flex flex-col gap-1.5 text-sm font-semibold">
                  {tx(q.label)}
                  <select
                    className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
                    value={draft.answers[q.id] || q.options[0]}
                    onChange={(e) =>
                      setDraft({ ...draft, answers: { ...draft.answers, [q.id]: e.target.value } })
                    }
                  >
                    {q.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <TextField
                  key={q.id}
                  label={tx(q.label)}
                  optional={!q.required}
                  value={draft.answers[q.id] ?? ''}
                  maxLength={1500}
                  onChange={(e) =>
                    setDraft({ ...draft, answers: { ...draft.answers, [q.id]: e.target.value } })
                  }
                />
              ),
            )}
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
            <Button
              variant="secondary"
              className="self-start"
              icon={aiLocked ? <Lock aria-hidden size={18} /> : <Sparkles aria-hidden size={18} />}
              disabled={busy !== null || aiLocked || !draft.documentId}
              loading={busy === 'ai'}
              onClick={() => {
                if (!confirm('Replace the letter text with a new AI draft?')) return;
                void redraft();
              }}
            >
              {tx('Write a new AI draft')}
            </Button>
            {aiLocked && (
              <p className="text-ink-muted text-sm">
                {tx('AI drafts are part of')}{' '}
                <Link href="/premium" className="text-primary font-semibold">
                  {tx('Premium')}
                </Link>
                {tx('. You can always write and download the letter yourself.')}
              </p>
            )}
          </div>
        </details>

        {cvs.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {tx('Design and contact details from')}
            <select
              className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
              value={draft.documentId}
              onChange={(e) => setDraft({ ...draft, documentId: e.target.value })}
            >
              {!draft.documentId && <option value="">{tx('A plain page')}</option>}
              {cvs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.role === 'profile'
                    ? tx('Career profile')
                    : c.title || c.name || tx('Untitled CV')}
                </option>
              ))}
            </select>
          </label>
        )}
        {savedDesigns.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {tx('Design')}
            <select
              className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
              value={draft.designId}
              onChange={(e) => setDraft({ ...draft, designId: e.target.value })}
              data-testid="letter-design"
            >
              <option value="">{draft.documentId ? tx('The CV’s design') : tx('Plain')}</option>
              {savedDesigns.map((d) => (
                <option key={d.id} value={d.id}>
                  {tx('My design: {name}', { name: d.name })}
                </option>
              ))}
            </select>
          </label>
        )}
        {!statement && (
          <>
            <TextArea
              label={tx('Who it’s to')}
              hint={tx('One line each.')}
              optional
              rows={2}
              value={draft.to.join('\n')}
              onChange={(e) => setDraft({ ...draft, to: e.target.value.split('\n').slice(0, 5) })}
            />
          </>
        )}
        <TextField
          label={statement ? tx('Title') : tx('Subject')}
          value={draft.subject}
          maxLength={160}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
        />
        {!statement && (
          <>
            <TextField
              label={tx('Greeting')}
              value={draft.greeting}
              maxLength={80}
              onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
            />
          </>
        )}
        {draft.paragraphs.map((p, i) => (
          <TextArea
            key={i}
            label={tx('Paragraph {v0}', { v0: i + 1 })}
            rows={4}
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
        {!statement && (
          <TextField
            label={tx('Sign-off')}
            value={draft.closing}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, closing: e.target.value })}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || busy !== null} loading={busy === 'save'} onClick={save}>
            {tx('Save letter')}
          </Button>
          <Button
            variant="secondary"
            icon={<Download aria-hidden size={18} />}
            disabled={dirty || busy !== null || !draft.paragraphs.some((p) => p.trim())}
            loading={busy === 'pdf'}
            onClick={pdf}
            title={dirty ? tx('Save the letter first') : undefined}
          >
            {tx('Download PDF')}
          </Button>
          {!dirty && draft.paragraphs.some((p) => p.trim()) && (
            <PackButton
              cv={design}
              letter={`letter:${saved.id}`}
              label={tx('With CV and certificates')}
            />
          )}
          <Button
            variant="ghost"
            icon={<Trash2 aria-hidden size={18} />}
            disabled={busy !== null}
            onClick={remove}
          >
            {tx('Delete')}
          </Button>
        </div>
      </div>
      <div className="lg:sticky lg:top-6 lg:self-start">
        {html && (
          <ScaledPage
            title={tx('Letter preview')}
            html={html}
            widthMm={resolvePage(design).widthMm}
            heightMm={resolvePage(design).heightMm}
          />
        )}
      </div>
    </div>
  );
}
