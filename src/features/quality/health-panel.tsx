'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, Lightbulb } from 'lucide-react';
import { healthCheck, type Finding } from '@/modules/quality/health';
import { scoreCv } from '@/modules/quality/score';
import type { ResumeDocument } from '@/modules/resume/schema';

/** CV health check: what to fix before sending, what could be stronger, and what is already good. */
export function HealthPanel({
  doc,
  pages,
  onShow,
}: {
  doc: ResumeDocument;
  pages?: number;
  /** Inside the editor: open the field in place instead of following a link. */
  onShow?: (ref: string) => void;
}) {
  const t = useT();
  const report = useMemo(() => healthCheck(doc, { pages }), [doc, pages]);
  const score = useMemo(() => scoreCv(doc, { pages }), [doc, pages]);
  const [showPassed, setShowPassed] = useState(false);
  const fixes = report.findings.filter((f) => f.severity === 'fix');
  const improve = report.findings.filter((f) => f.severity === 'improve');

  return (
    <section
      aria-labelledby="health-h"
      className="border-line bg-surface shadow-1 rounded-lg border p-5"
      data-testid="health"
    >
      <h2 id="health-h" className="font-semibold">
        {t('CV check')}
      </h2>
      <p className="text-ink-muted mb-4 text-sm" aria-live="polite">
        {fixes.length
          ? t('{length} thing{v1} to fix before you send it', {
              length: fixes.length,
              v1: fixes.length === 1 ? '' : 's',
            })
          : improve.length
            ? t('Ready to send. A few ideas could make it stronger.')
            : t('Ready to send. Nothing to fix.')}
      </p>
      <div className="bg-sunken mb-4 rounded-md p-3" data-testid="cv-score">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-bold" data-testid="cv-score-total">
            {score.total}
          </span>
          <span className="text-ink-muted text-sm">
            {t('out of 100')} · {t(score.grade)}
          </span>
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {score.parts.map((p) => (
            <li key={p.id} className="text-sm">
              <div className="flex justify-between">
                <span>{t(p.label)}</span>
                <span className="text-ink-muted">
                  {p.points} / {p.max}
                </span>
              </div>
              <div className="bg-line h-1.5 overflow-hidden rounded-full" aria-hidden>
                <div
                  className="bg-primary h-full"
                  style={{ width: `${Math.round((p.points / p.max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted mt-2 text-xs">
          {t('Worked out from the checks below. No AI, so the same CV always scores the same.')}
        </p>
      </div>
      {fixes.length > 0 && (
        <Group title={t('Fix before sending')} items={fixes} doc={doc} tone="fix" onShow={onShow} />
      )}
      {improve.length > 0 && (
        <Group
          title={t('Could be stronger')}
          items={improve}
          doc={doc}
          tone="improve"
          onShow={onShow}
        />
      )}
      {report.passed.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="text-primary text-sm font-semibold"
            aria-expanded={showPassed}
            onClick={() => setShowPassed((v) => !v)}
          >
            {showPassed ? t('Hide') : t('Show')}{' '}
            {t('what’s already good ({length})', { length: report.passed.length })}
          </button>
          {showPassed && (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {report.passed.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <CircleCheck aria-hidden size={18} className="text-success mt-0.5 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  items,
  doc,
  tone,
  onShow,
}: {
  title: string;
  items: Finding[];
  doc: ResumeDocument;
  tone: 'fix' | 'improve';
  onShow?: (ref: string) => void;
}) {
  const t = useT();
  const Icon = tone === 'fix' ? CircleAlert : Lightbulb;
  return (
    <div className="mb-4">
      <h3 className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      <ul className="flex flex-col gap-3">
        {items.map((f) => (
          <li key={f.id} className="flex items-start gap-2.5" data-finding={f.id}>
            <Icon
              aria-hidden
              size={20}
              className={
                tone === 'fix' ? 'text-danger mt-0.5 shrink-0' : 'text-warning mt-0.5 shrink-0'
              }
            />
            <div className="min-w-0">
              <p className="font-semibold">
                <span className="sr-only">{tone === 'fix' ? t('To fix: ') : t('Idea: ')}</span>
                {f.title}
              </p>
              <p className="text-ink-muted text-sm">{f.detail}</p>
              {f.examples && f.examples.length > 0 && (
                <ul className="text-ink-muted mt-1 text-sm">
                  {f.examples.map((e) => (
                    <li key={e} className="truncate">
                      “{e}”
                    </li>
                  ))}
                </ul>
              )}
              {onShow ? (
                <button
                  type="button"
                  onClick={() => onShow(f.ref ?? 'basics/contact')}
                  className="text-primary mt-1 inline-block text-sm font-semibold underline underline-offset-4"
                >
                  {t('Show me')}
                </button>
              ) : (
                <Link
                  href={`/cv/${doc.id}${f.ref ? `?focus=${encodeURIComponent(f.ref)}` : ''}`}
                  className="text-primary mt-1 inline-block text-sm font-semibold underline underline-offset-4"
                >
                  {t('Show me')}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
