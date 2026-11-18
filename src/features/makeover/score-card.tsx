'use client';

import { useT } from '@/i18n/client';
import { useMemo, useRef } from 'react';
import { Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { scoreCv, type CvScore } from '@/modules/quality/score';
import type { ResumeDocument } from '@/modules/resume/schema';
import { STANDARDS, standardOf, type StandardId } from '@/modules/resume/standards';

const SITE = 'https://aicvstudio.app';

/** The text shared with a score. It holds the score only: no name, employer or CV text. */
export function shareText(total: number): string {
  return `My CV scored ${total}/100 on AI CV Studio. Check yours free, no sign-up: ${SITE}/makeover`;
}

/** Draw the score image (score and four parts only, nothing from the CV itself). */
export function drawScoreImage(score: CvScore): HTMLCanvasElement {
  const W = 1080;
  const H = 1080;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f5f1ea';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f4e8c';
  g.fillRect(0, 0, W, 16);
  g.fillStyle = '#1b1b1f';
  g.font = '600 44px system-ui, sans-serif';
  g.fillText('My CV score', 80, 140);
  g.font = '700 300px system-ui, sans-serif';
  g.fillText(String(score.total), 80, 430);
  const w = g.measureText(String(score.total)).width;
  g.fillStyle = '#5b5b66';
  g.font = '500 64px system-ui, sans-serif';
  g.fillText('/ 100', 80 + w + 20, 430);
  g.fillStyle = '#1f4e8c';
  g.font = '600 56px system-ui, sans-serif';
  g.fillText(score.grade, 80, 520);
  score.parts.forEach((p, i) => {
    const y = 620 + i * 100;
    g.fillStyle = '#1b1b1f';
    g.font = '500 34px system-ui, sans-serif';
    g.fillText(p.label, 80, y);
    g.textAlign = 'right';
    g.fillText(`${p.points} / ${p.max}`, W - 80, y);
    g.textAlign = 'left';
    g.fillStyle = '#ddd6c8';
    g.fillRect(80, y + 14, W - 160, 14);
    g.fillStyle = '#1f4e8c';
    g.fillRect(80, y + 14, Math.round(((W - 160) * p.points) / p.max), 14);
  });
  g.fillStyle = '#5b5b66';
  g.font = '500 32px system-ui, sans-serif';
  g.fillText('Free CV score · aicvstudio.app', 80, H - 50);
  return c;
}

/**
 * The free CV score on the makeover result: a number out of 100, its four parts, the three
 * fixes that matter most, and a share that carries the score only. Worked out in the browser from
 * the CV the visitor just uploaded, so nothing extra is sent anywhere.
 */
export function ScoreCard({
  doc,
  firstScore,
  onStandard,
}: {
  doc: ResumeDocument;
  /** The score when the CV was first read, to show what the changes added. */
  firstScore: number | null;
  onStandard: (id: StandardId) => void;
}) {
  const t = useT();
  const score = useMemo(() => scoreCv(doc), [doc]);
  const shared = useRef(false);
  const std = standardOf(doc);
  const gain = firstScore !== null ? score.total - firstScore : 0;

  const png = () =>
    new Promise<Blob | null>((res) => drawScoreImage(score).toBlob((b) => res(b), 'image/png'));
  const track = (what: string) => {
    if (shared.current) return;
    shared.current = true;
    void fetch('/api/metrics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: what }),
      keepalive: true,
    }).catch(() => undefined);
  };
  const share = async () => {
    const blob = await png();
    const text = shareText(score.total);
    try {
      const file = blob ? new File([blob], 'my-cv-score.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        track('score_share');
        return;
      }
    } catch {
      return; // the person closed the share sheet
    }
    track('score_share');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const save = async () => {
    const blob = await png();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-cv-score.png';
    a.click();
    URL.revokeObjectURL(a.href);
    track('score_share');
  };

  return (
    <section
      aria-labelledby="mk-score"
      className="border-line bg-surface shadow-1 flex min-w-0 flex-col gap-3 rounded-lg border p-5"
      data-testid="cv-score-card"
    >
      <h3 id="mk-score" className="font-semibold">
        {t('Your CV score')}
      </h3>
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-bold" data-testid="score-total">
          {score.total}
        </span>
        <span className="text-ink-muted">
          {t('out of 100')} · {t(score.grade)}
        </span>
        {gain > 0 && (
          <span className="text-success text-sm font-semibold" data-testid="score-gain">
            +{gain}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-2">
        {score.parts.map((p) => (
          <li key={p.id} className="text-sm">
            <div className="flex justify-between">
              <span>{t(p.label)}</span>
              <span className="text-ink-muted">
                {p.points} / {p.max}
              </span>
            </div>
            <div className="bg-sunken h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-primary h-full"
                style={{ width: `${Math.round((p.points / p.max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
        {t('Scored for')}
        <select
          className="border-line-strong bg-surface min-h-11 w-full max-w-full min-w-0 truncate rounded-md border px-3 text-[15px] font-normal"
          value={std?.id ?? ''}
          onChange={(e) => e.target.value && onStandard(e.target.value as StandardId)}
          data-testid="score-standard"
        >
          <option value="">{t('Any employer')}</option>
          {STANDARDS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.name)}
            </option>
          ))}
        </select>
      </label>

      {score.top.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">{t('Fix these first')}</h4>
          <ol className="text-ink-muted mt-1 list-decimal pl-5 text-sm" data-testid="score-top">
            {score.top.map((f) => (
              <li key={f.id} className="mt-1">
                <span className="text-ink font-semibold">{f.title}.</span> {f.detail}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void share()}
          data-testid="score-share"
        >
          <Share2 aria-hidden size={16} /> {t('Share my score')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void save()}>
          <Download aria-hidden size={16} /> {t('Save as image')}
        </Button>
      </div>
      <p className="text-ink-muted text-xs">
        {t(
          'Only the score is shared, never your name or CV text. Worked out on your device, no AI, so the same CV always scores the same.',
        )}
      </p>
    </section>
  );
}
