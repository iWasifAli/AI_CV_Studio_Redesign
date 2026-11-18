'use client';

import { useLang, useT } from '@/i18n/client';
import { cvWords } from '@/modules/resume/cv-words';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { useDraft } from '@/features/workspace/use-draft';
import { ArrowLeft, Lock, PenLine, Sparkles } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea, TextField } from '@/components/ui/field';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { JobsError } from '@/features/jobs/api';
import { defaultSourceCv } from '@/modules/jobs/source-cv';
import {
  LETTER_TYPE,
  LETTER_TYPES,
  isLetterType,
  missingAnswers,
  starterLetter,
  withDefaults,
  type LetterType,
} from '@/modules/letters/types';
import { getRepository } from '@/modules/storage/repository';
import { lettersApi } from './api';

/** /letters/new: pick a letter type, answer its 3–5 questions, then write it with AI or yourself. */
export function NewLetter() {
  const tx = useT();
  const params = useSearchParams();
  const type = params.get('type');
  const account = useAccount();
  const { ent } = useEntitlements();
  if (account.status === 'signedOut')
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <Lock aria-hidden className="text-primary" />
        <h2 className="text-xl font-semibold">{tx('Sign in to write and keep letters')}</h2>
        <p className="text-ink-muted">
          {tx('Your letters are kept in your account, in the same design as your CV.')}
        </p>
        <ButtonLink
          href={`/signin?next=${encodeURIComponent(`/letters/new${type ? `?type=${type}` : ''}`)}`}
        >
          {tx('Sign in or create a free account')}
        </ButtonLink>
      </Card>
    );
  const hidden = new Set(ent?.hiddenLetterTypes ?? []);
  if (ent && !ent.features.letters)
    return <Banner tone="info" title={tx('Letters are switched off right now.')} />;
  if (isLetterType(type) && !hidden.has(type))
    return <LetterForm key={type} type={LETTER_TYPE[type]} />;
  const groups: [string, LetterType[]][] = [
    ['Letters', LETTER_TYPES.filter((t) => !hidden.has(t.id) && t.group !== 'about-you')],
    [
      'Statements and bios',
      LETTER_TYPES.filter((t) => !hidden.has(t.id) && t.group === 'about-you'),
    ],
  ];
  return (
    <div className="flex flex-col gap-6">
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <section key={title} aria-label={tx(title)} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{tx(title)}</h2>
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              aria-label={tx('{title}: types', { title: tx(title) })}
            >
              {list.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/letters/new?type=${t.id}`}
                    className="border-line bg-surface hover:border-primary flex h-full flex-col gap-1 rounded-xl border p-5"
                  >
                    <span className="font-semibold">{tx(t.title)}</span>
                    <span className="text-ink-muted text-sm">{tx(t.description)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function LetterForm({ type }: { type: LetterType }) {
  const tx = useT();
  const lang = useLang();
  const router = useRouter();
  const { ent } = useEntitlements();
  const repo = typeof window === 'undefined' ? null : getRepository();
  const cvs = useMemo(() => repo?.list() ?? [], [repo]);
  const [sourceId, setSourceId] = useState(() => defaultSourceCv(cvs));
  const [answers, setAnswers, clearAnswers] = useDraft<Record<string, string>>(
    `letter-new:${type.id}:answers`,
    {},
  );
  const [to, setTo, clearTo] = useDraft(`letter-new:${type.id}:to`, '');
  const [tone, setTone, clearTone] = useDraft<'warm' | 'formal'>(
    `letter-new:${type.id}:tone`,
    type.id === 'cover' ? 'warm' : 'formal',
  );
  const [busy, setBusy] = useState<null | 'ai' | 'self'>(null);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(null);
  const [touched, setTouched] = useState(false);
  const aiLocked = ent ? ent.limits['ai.action'] === 0 : false;
  const missing = missingAnswers(type, answers);

  async function create(withAi: boolean, e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (missing.length) return;
    const source = sourceId ? repo?.get(sourceId) : null;
    setBusy(withAi ? 'ai' : 'self');
    setProblem(null);
    try {
      const letterLocale = source?.locale ?? (lang === 'de' ? 'de-DE' : 'en-GB');
      const w = cvWords(letterLocale);
      const start = starterLetter(
        type,
        answers,
        {
          name: source?.basics.name ?? '',
          headline: source?.basics.headline ?? '',
          location: source?.basics.location ?? '',
        },
        letterLocale,
      );
      const statement = type.form === 'statement';
      const letter = await lettersApi.create({
        type: type.id,
        title: start.subject,
        to: to
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 5),
        subject: start.subject,
        answers: withDefaults(type, answers),
        paragraphs: start.paragraphs,
        greeting: statement ? '' : w('Dear Hiring Manager,'),
        closing: statement ? '' : w(tone === 'formal' ? 'Yours sincerely,' : 'Kind regards,'),
        tone,
        documentId: source?.id ?? '',
      });
      if (withAi && source) {
        try {
          await lettersApi.draft(letter.id, source, tone);
        } catch (err) {
          // The letter is kept with the starter draft; say why the AI draft is missing.
          clearAnswers();
          clearTo();
          clearTone();
          router.push(`/letters/${letter.id}?ai=${encodeURIComponent((err as Error).message)}`);
          return;
        }
      }
      clearAnswers();
      clearTo();
      clearTone();
      router.push(`/letters/${letter.id}`);
    } catch (err) {
      setProblem(
        err instanceof JobsError
          ? { message: err.message, premium: err.status === 402 }
          : { message: 'You seem to be offline. Please try again.' },
      );
      setBusy(null);
    }
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      onSubmit={(e) => create(!aiLocked && cvs.length > 0, e)}
      aria-label={tx(type.title)}
    >
      <Link
        href="/letters/new"
        className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {tx('All letter types')}
      </Link>
      <div>
        <h2 className="font-display text-2xl font-semibold">{tx(type.title)}</h2>
        <p className="text-ink-muted">{tx(type.description)}</p>
      </div>
      {type.id === 'cover' && (
        <Banner tone="info" title={tx('Applying for a specific advert?')}>
          {tx('Save the job in')}{' '}
          <Link href="/jobs?new=1" className="text-primary font-semibold">
            {tx('Jobs')}
          </Link>{' '}
          {tx('and write the letter there: it’s matched to what the advert asks for.')}
        </Banner>
      )}
      {type.questions.map((q) =>
        q.options ? (
          <label key={q.id} className="flex flex-col gap-1.5 text-sm font-semibold">
            {tx(q.label)}
            <select
              className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
              value={answers[q.id] || q.options[0]}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            >
              {q.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ) : q.long ? (
          <TextArea
            key={q.id}
            label={tx(q.label)}
            hint={tx(q.hint)}
            optional={!q.required}
            rows={3}
            maxLength={1500}
            value={answers[q.id] ?? ''}
            error={
              touched && q.required && !(answers[q.id] ?? '').trim()
                ? 'Please answer this.'
                : undefined
            }
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
          />
        ) : (
          <TextField
            key={q.id}
            label={tx(q.label)}
            hint={tx(q.hint)}
            optional={!q.required}
            maxLength={300}
            value={answers[q.id] ?? ''}
            error={
              touched && q.required && !(answers[q.id] ?? '').trim()
                ? 'Please answer this.'
                : undefined
            }
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
          />
        ),
      )}
      {type.form !== 'statement' && (
        <TextArea
          label={tx('Who it’s to')}
          hint={tx('One line each: name, organisation, address. Usually: {to}.', { to: type.to })}
          optional
          rows={2}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      )}
      {cvs.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {tx('Design and contact details from')}
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
      {touched && missing.length > 0 && (
        <p className="text-danger text-sm" role="alert">
          {tx('Answer “{label}” to continue.', { label: missing[0]!.label })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {cvs.length > 0 && (
          <Button
            type="button"
            icon={aiLocked ? <Lock aria-hidden size={18} /> : <Sparkles aria-hidden size={18} />}
            disabled={busy !== null || aiLocked}
            loading={busy === 'ai'}
            onClick={() => create(true)}
            title={aiLocked ? tx('AI drafts are part of Premium') : undefined}
          >
            {tx('Write it with AI')}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          icon={<PenLine aria-hidden size={18} />}
          disabled={busy !== null}
          loading={busy === 'self'}
          onClick={() => create(false)}
        >
          {tx('Write it myself')}
        </Button>
      </div>
      {aiLocked && cvs.length > 0 && (
        <p className="text-ink-muted text-sm">
          {tx(
            '“Write it myself” starts you with a draft made from your answers. AI drafts are part of',
          )}{' '}
          <Link href="/premium" className="text-primary font-semibold">
            {tx('Premium')}
          </Link>
          .
        </p>
      )}
      {cvs.length === 0 && (
        <p className="text-ink-muted text-sm">
          {tx('Tip:')}{' '}
          <Link href="/start" className="text-primary font-semibold">
            {tx('create a CV')}
          </Link>{' '}
          {tx('first, so the letter uses your name, contact details and design.')}
        </p>
      )}
    </form>
  );
}
