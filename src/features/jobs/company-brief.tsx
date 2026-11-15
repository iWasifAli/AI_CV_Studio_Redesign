'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Copy } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useEntitlements } from '@/features/account/entitlements';
import type { Job } from '@/modules/jobs/schema';
import { defaultSourceCv } from '@/modules/jobs/source-cv';
import { getRepository } from '@/modules/storage/repository';
import { JobsError, jobAiApi } from './api';

/**
 * Company brief (spec §10.2): one page on the employer from the advert and anything the person
 * pastes from the company's own pages, with how their CV fits and questions to ask.
 */
export function CompanyBrief({ job, onJobChange }: { job: Job; onJobChange: (j: Job) => void }) {
  const { ent, refresh } = useEntitlements();
  const toast = useToast();
  const [pages, setPages] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(null);
  const source = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const repo = getRepository();
    const id = defaultSourceCv(repo.list());
    return (id && repo.get(id)) || null;
  }, []);
  if (ent && ent.features.companyBrief === false) return null;
  const b = job.brief;
  const locked = !!ent && ent.limits['ai.action'] === 0;
  const short = job.advert.trim().length < 80;

  const make = async () => {
    if (!source) return;
    setBusy(true);
    setProblem(null);
    try {
      onJobChange(await jobAiApi.brief(job.id, source, pages));
      refresh();
    } catch (e) {
      setProblem(
        e instanceof JobsError
          ? { message: e.message, premium: e.status === 402 }
          : { message: 'You seem to be offline. Please try again.' },
      );
    } finally {
      setBusy(false);
    }
  };
  const asText = () =>
    b
      ? [
          `${job.company || 'The company'} — brief for ${job.title}`,
          '',
          b.company,
          b.values.length ? `\nWhat they value:\n${b.values.map((v) => `• ${v}`).join('\n')}` : '',
          `\nWhat the role needs most:\n${b.needs.map((v) => `• ${v}`).join('\n')}`,
          b.fit.length ? `\nHow you fit:\n${b.fit.map((v) => `• ${v.point}`).join('\n')}` : '',
          `\nQuestions to ask:\n${b.questions.map((v) => `• ${v}`).join('\n')}`,
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="company-brief">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Building2 aria-hidden size={20} className="text-primary" /> Company brief
      </h2>
      {b ? (
        <div className="flex flex-col gap-4 text-[15px]" data-testid="brief-body">
          <p>{b.company}</p>
          {b.values.length > 0 && (
            <div>
              <h3 className="font-semibold">What they value</h3>
              <ul className="list-disc pl-5">
                {b.values.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-semibold">What the role needs most</h3>
            <ul className="list-disc pl-5">
              {b.needs.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
          {b.fit.length > 0 && (
            <div>
              <h3 className="font-semibold">How you fit</h3>
              <ul className="list-disc pl-5">
                {b.fit.map((v, i) => (
                  <li key={i}>{v.point}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-semibold">Questions to ask them</h3>
            <ul className="list-disc pl-5">
              {b.questions.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy aria-hidden size={16} />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(asText());
                  toast.show({ tone: 'success', message: 'Brief copied' });
                } catch {
                  toast.show({ tone: 'error', message: 'Couldn’t copy. Select the text instead.' });
                }
              }}
            >
              Copy the brief
            </Button>
          </div>
          <p className="text-ink-muted text-xs">
            Made from the advert and what you pasted, on{' '}
            {new Date(b.at).toLocaleDateString('en-GB')}. Check anything important on their site.
          </p>
        </div>
      ) : (
        <p className="text-ink-muted text-sm">
          One page on the employer before you apply or go to the interview: what they do, what they
          value, what this role needs most, where your CV fits and good questions to ask.
        </p>
      )}
      <TextArea
        label={b ? 'Add more from their website (optional)' : 'Text from their website (optional)'}
        hint="Paste their About or Careers page to give the brief more to work with."
        rows={3}
        maxLength={12_000}
        value={pages}
        onChange={(e) => setPages(e.target.value)}
      />
      {problem && (
        <Banner
          tone="error"
          title={problem.message}
          action={
            problem.premium ? (
              <ButtonLink href="/premium" size="sm">
                See Premium
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      {locked ? (
        <p className="text-sm">
          Company briefs are part of{' '}
          <Link href="/premium" className="text-primary font-semibold">
            Premium
          </Link>
          .
        </p>
      ) : (
        <Button
          className="self-start"
          disabled={!source || short}
          loading={busy}
          title={short ? 'Add the job advert first' : undefined}
          onClick={make}
        >
          {b ? 'Make it again' : 'Make the brief'}
        </Button>
      )}
      {short && (
        <p className="text-ink-muted text-xs">Add the job advert to this job to make a brief.</p>
      )}
    </Card>
  );
}
