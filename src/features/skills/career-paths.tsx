'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useState } from 'react';
import { Compass } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Badge } from '@/components/ui/chip';
import { Button, ButtonLink } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useEntitlements } from '@/features/account/entitlements';
import { AskText } from '@/features/ai/suggestion';
import type { ResumeDocument } from '@/modules/resume/schema';

type Path = {
  role: string;
  why: string;
  have: string[];
  need: string[];
  step: string;
  reach: 'near' | 'stretch';
};

/** Kept while the page is open. */
let kept: { paths: Path[]; interests: string } | null = null;

/**
 * Career paths (spec §10.3): roles reachable from the CV, with what the person already has, what
 * they'd still need and a first step. "Plan the skills" fills the skill plan below.
 */
export function CareerPaths({
  source,
  onPlan,
}: {
  source: ResumeDocument | null;
  onPlan: (role: string) => void;
}) {
  const t = useT();
  const { ent, refresh } = useEntitlements();
  const [interests, setInterests] = useState(kept?.interests ?? '');
  const [paths, setPaths] = useState<Path[] | null>(kept?.paths ?? null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(null);
  if (!ent || ent.features.careerPaths === false) return null;
  const locked = ent.limits['ai.action'] === 0;

  const run = async () => {
    if (!source) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch('/api/coach/paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: source, interests }),
      });
      const j = (await r.json().catch(() => null)) as
        | { paths: Path[] }
        | { error: { message: string } }
        | null;
      if (!r.ok || !j || 'error' in j) {
        setProblem({
          message: (j && 'error' in j && j.error.message) || 'That didn’t work. Please try again.',
          premium: r.status === 402,
        });
        return;
      }
      setPaths(j.paths);
      kept = { paths: j.paths, interests };
      refresh();
    } catch {
      setProblem({ message: 'You seem to be offline. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="paths-h"
      className="border-line bg-surface flex flex-col gap-4 rounded-xl border p-5"
      data-testid="career-paths"
    >
      <h2 id="paths-h" className="flex items-center gap-2 text-lg font-semibold">
        <Compass aria-hidden size={20} className="text-primary" /> {t('Where could you go next?')}
      </h2>
      <p className="text-ink-muted text-sm">
        {t(
          'Roles your CV already points to, what you have for each, what you’d still need, and a first step. Nothing is added to your CV.',
        )}
      </p>
      {!paths && (
        <TextField
          label={t('Anything you’d like more of? (optional)')}
          hint={t('For example: “working with people”, “less driving”, “managing projects”.')}
          maxLength={300}
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
        />
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
      {paths && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="paths">
          {paths.map((p) => (
            <li key={p.role} className="border-line flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{p.role}</h3>
                <Badge tone={p.reach === 'near' ? 'success' : 'neutral'}>
                  {p.reach === 'near' ? t('Within reach') : t('A bigger step')}
                </Badge>
              </div>
              <p className="text-sm">
                <AskText text={p.why} />
              </p>
              {p.have.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{t('You have:')} </span>
                  {p.have.join(' · ')}
                </p>
              )}
              {p.need.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{t('You’d need:')} </span>
                  {p.need.join(' · ')}
                </p>
              )}
              <p className="text-ink-muted text-sm">
                <span className="font-semibold">{t('First step:')} </span>
                {p.step}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-auto self-start"
                onClick={() => onPlan(p.role)}
              >
                {t('Plan the skills for this role')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {locked ? (
        <p className="text-sm">
          {t('Career paths are part of')}{' '}
          <Link href="/premium" className="text-primary font-semibold">
            {t('Premium')}
          </Link>
          .
        </p>
      ) : (
        <Button
          className="self-start"
          variant={paths ? 'ghost' : 'primary'}
          disabled={!source}
          loading={busy}
          onClick={() => {
            if (paths) {
              setPaths(null);
              kept = null;
            } else void run();
          }}
        >
          {paths ? t('Ask again') : t('Show me')}
        </Button>
      )}
    </section>
  );
}
