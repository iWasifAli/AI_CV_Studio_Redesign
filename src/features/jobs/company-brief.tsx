'use client';

import { useRepositoryVersion } from '@/features/account/account-context';

import { useWorkspaceState, useWorkspaceTask, useWorkspace } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
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
import { revisionOf } from './workspace-state';
import { ConflictNotice } from './conflict-notice';
import { JobsError, jobAiApi, type ConflictDetails } from './api';

/**
 * Company brief (spec §10.2): one page on the employer from the advert and anything the person
 * pastes from the company's own pages, with how their CV fits and questions to ask.
 */
export function CompanyBrief({ job, onJobChange }: { job: Job; onJobChange: (j: Job) => void }) {
  const t = useT();
  const { ent, refresh } = useEntitlements();
  const toast = useToast();
  const runTask = useWorkspaceTask();
  const { ownerUid } = useWorkspace();
  const [conflict, setConflict] = useWorkspaceState<ConflictDetails | null>(
    'jobs.CompanyBrief.conflict',
    null,
    { dirty: false },
  );
  const [pages, setPages] = useWorkspaceState('jobs.CompanyBrief.pages', '', { dirty: true });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'jobs.CompanyBrief.problem',
    null,
    { dirty: false },
  );
  const [preview, setPreview] = useWorkspaceState<Job['brief'] | null>(
    'jobs.CompanyBrief.preview',
    null,
    { dirty: false },
  );
  const repositoryVersion = useRepositoryVersion();
  const repo = typeof window === 'undefined' ? null : getRepository();
  const source = useMemo(() => {
    if (!repo) return null;
    const id = defaultSourceCv(repo.list());
    return (id && repo.get(id)) || null;
  }, [repo, repositoryVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- repository event revision
  if (ent && ent.features.companyBrief === false) return null;
  const b = preview ?? job.brief;
  const locked = !!ent && ent.limits['ai.action'] === 0;
  const short = job.advert.trim().length < 80;

  const make = async () => {
    if (!source) return;
    setBusy(true);
    setProblem(null);
    try {
      onJobChange(
        await runTask('jobs.CompanyBrief.make', (signal) =>
          jobAiApi.brief(job.id, source, pages, {
            signal,
            ownerUid,
            expectedRevision: revisionOf(job),
          }),
        ),
      );
      setPreview(null);
      refresh();
    } catch (e) {
      if (e instanceof JobsError && e.status === 409) setConflict(e.details ?? {});
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
        <Building2 aria-hidden size={20} className="text-primary" /> {t('Company brief')}
      </h2>
      {preview && (
        <Banner
          tone="info"
          title="Preview of the generated brief"
          action={
            <Button size="sm" onClick={() => setPreview(null)}>
              {t('Show saved brief')}
            </Button>
          }
        />
      )}
      {b ? (
        <div className="flex flex-col gap-4 text-[15px]" data-testid="brief-body">
          <p>{b.company}</p>
          {b.values.length > 0 && (
            <div>
              <h3 className="font-semibold">{t('What they value')}</h3>
              <ul className="list-disc pl-5">
                {b.values.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-semibold">{t('What the role needs most')}</h3>
            <ul className="list-disc pl-5">
              {b.needs.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
          {b.fit.length > 0 && (
            <div>
              <h3 className="font-semibold">{t('How you fit')}</h3>
              <ul className="list-disc pl-5">
                {b.fit.map((v, i) => (
                  <li key={i}>{v.point}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-semibold">{t('Questions to ask them')}</h3>
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
              {t('Copy the brief')}
            </Button>
          </div>
          <p className="text-ink-muted text-xs">
            {t(
              'Made from the advert and what you pasted, on{v} {v2}. Check anything important on their site.',
              { v: ' ', v2: new Date(b.at).toLocaleDateString('en-GB') },
            )}
          </p>
        </div>
      ) : (
        <p className="text-ink-muted text-sm">
          {t(
            'One page on the employer before you apply or go to the interview: what they do, what they value, what this role needs most, where your CV fits and good questions to ask.',
          )}
        </p>
      )}
      <TextArea
        label={
          b ? t('Add more from their website (optional)') : t('Text from their website (optional)')
        }
        hint={t('Paste their About or Careers page to give the brief more to work with.')}
        rows={3}
        maxLength={12_000}
        value={pages}
        onChange={(e) => setPages(e.target.value)}
      />
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
      />
      {conflict?.generated !== undefined && (
        <Button
          variant="secondary"
          onClick={() => {
            const generated = conflict.generated as Job & { job?: Job };
            setPreview((generated.job ?? generated).brief ?? null);
          }}
        >
          {t('Preview generated brief')}
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
      {locked ? (
        <p className="text-sm">
          {t('Company briefs are part of')}{' '}
          <Link href="/premium" className="text-primary font-semibold">
            {t('Premium')}
          </Link>
          .
        </p>
      ) : (
        <Button
          className="self-start"
          disabled={!source || short}
          loading={busy}
          title={short ? t('Add the job advert first') : undefined}
          onClick={make}
        >
          {b ? t('Make it again') : t('Make the brief')}
        </Button>
      )}
      {short && (
        <p className="text-ink-muted text-xs">
          {t('Add the job advert to this job to make a brief.')}
        </p>
      )}
    </Card>
  );
}
