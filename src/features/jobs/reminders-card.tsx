'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useState } from 'react';
import { Bell, BellRing, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { CheckboxField } from '@/features/editor/fields';
import { addDays, defaultNote, todayIn } from '@/modules/jobs/reminders';
import type { Job } from '@/modules/jobs/schema';
import { cn } from '@/lib/cn';
import { JobsError, jobsApi } from './api';

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const dayLabel = (on: string, today: string) => {
  if (on === today) return 'Today';
  if (on === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${on}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
};

const PRESETS = [
  { label: 'In 3 days', days: 3 },
  { label: 'In 1 week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

/**
 * Reminders on a job (R9.6): "Follow up with Acme in 3 days". Each is emailed at 8:00 on its day
 * (one daily digest per person), and shows on Home and the job board.
 */
export function RemindersCard({ job, onJobChange }: { job: Job; onJobChange: (j: Job) => void }) {
  const t = useT();
  const tz = zone();
  const today = todayIn(tz);
  const [on, setOn] = useState(addDays(today, 3));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = [...(job.reminders ?? [])].sort((a, b) => a.on.localeCompare(b.on));
  const open = list.filter((r) => !r.done);
  const done = list.filter((r) => r.done);
  const suggest = job.stage === 'applied' && open.length === 0;

  const act = async (key: string, f: () => Promise<Job>, rollback?: Job) => {
    setBusy(key);
    setError(null);
    try {
      onJobChange(await f());
    } catch (e) {
      if (rollback) onJobChange(rollback);
      setError(e instanceof JobsError ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(null);
    }
  };
  const add = (day: string, text = note) =>
    act('add', async () => {
      const j = await jobsApi.addReminder(job.id, { on: day, note: text.trim(), tz });
      setNote('');
      return j;
    });

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="reminders">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell aria-hidden size={18} /> {t('Reminders')}
        </h2>
        <Link href="/account#reminders" className="text-primary text-sm underline">
          {t('Email settings')}
        </Link>
      </div>

      {suggest && (
        <div className="bg-primary-soft/50 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm">
          <span>{t('You’ve applied. Most employers reply within a week or two.')}</span>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'add'}
            onClick={() => add(addDays(today, 7), defaultNote(job))}
          >
            {t('Remind me to follow up in a week')}
          </Button>
        </div>
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('Open reminders')}>
          {open.map((r) => {
            const due = r.on <= today;
            return (
              <li
                key={r.id}
                className={cn(
                  'border-line flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2',
                  due && 'border-warning bg-warning-soft/40',
                )}
                data-testid="reminder"
              >
                <CheckboxField
                  label={r.note}
                  checked={false}
                  onChange={() =>
                    act(r.id, () => jobsApi.updateReminder(job.id, r.id, { done: true }))
                  }
                />
                <span
                  className={cn('text-sm', due ? 'text-warning font-semibold' : 'text-ink-muted')}
                >
                  {due && <BellRing aria-hidden size={14} className="mr-1 inline" />}
                  {dayLabel(r.on, today)}
                  {r.emailedAt && !r.emailedAt.startsWith('off:') ? ' · emailed' : ''}
                </span>
                <button
                  type="button"
                  className="text-ink-muted hover:text-danger ml-auto rounded-sm p-1.5"
                  aria-label={t('Delete reminder “{note}”', { note: r.note })}
                  disabled={busy === r.id}
                  onClick={() => act(r.id, () => jobsApi.removeReminder(job.id, r.id))}
                >
                  <Trash2 aria-hidden size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <TextField
          label={t('Remind me to…')}
          optional
          placeholder={defaultNote(job)}
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap items-end gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant="secondary"
              disabled={busy === 'add'}
              onClick={() => add(addDays(today, p.days))}
            >
              {t(p.label)}
            </Button>
          ))}
          <TextField
            label={t('Or on')}
            type="date"
            min={today}
            max={addDays(today, 366)}
            value={on}
            onChange={(e) => setOn(e.target.value)}
            containerClassName="w-44"
          />
          <Button
            variant="secondary"
            loading={busy === 'add'}
            disabled={!on}
            onClick={() => add(on)}
          >
            {t('Add reminder')}
          </Button>
        </div>
        <p className="text-ink-muted text-xs">
          {t('We email you at 8:00 on the day (your time).')}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {t(error)}
        </p>
      )}

      {done.length > 0 && (
        <details className="text-sm">
          <summary className="text-ink-muted cursor-pointer">
            {t('Done ({length})', { length: done.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="text-ink-muted line-through">{r.note}</span>
                <span className="text-ink-muted">· {dayLabel(r.on, today)}</span>
                <button
                  type="button"
                  className="text-primary ml-auto text-xs underline"
                  onClick={() =>
                    act(r.id, () => jobsApi.updateReminder(job.id, r.id, { done: false }))
                  }
                >
                  {t('Not done')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
