'use client';

import { useT } from '@/i18n/client';
import { Plus, Trash2 } from 'lucide-react';
import { TextField } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { getPreset } from '@/modules/resume/presets';
import { ops } from '@/modules/resume/ops';
import { newId } from '@/modules/resume/create';
import type { ResumeDocument } from '@/modules/resume/schema';
import { MARKETS } from '@/modules/resume/markets';
import { PhotoField } from './photo-field';
import type { DocumentEditor } from './use-document-editor';

export function BasicsForm({
  editor,
  showLinks = true,
}: {
  editor: DocumentEditor;
  showLinks?: boolean;
}) {
  const t = useT();
  const { doc, update } = editor;
  const b = doc.basics;
  const preset = getPreset(doc.presetId);
  const set = (patch: Partial<ResumeDocument['basics']>, key: string) =>
    update((d) => ops.updateBasics(d, patch), `basics.${key}`);
  const emailInvalid =
    b.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email.trim());

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      <TextField
        containerClassName="col-span-2"
        label={t('Full name')}
        autoComplete="name"
        value={b.name}
        placeholder={t('e.g. Imran Qureshi')}
        onChange={(e) => set({ name: e.target.value }, 'name')}
        data-field="basics.name"
      />
      <TextField
        containerClassName="col-span-2"
        label={t('Job title you want')}
        hint={t('Shown under your name.')}
        value={b.headline}
        placeholder={`e.g. ${preset.headlineExample}`}
        onChange={(e) => set({ headline: e.target.value }, 'headline')}
      />
      <TextField
        containerClassName="col-span-2 sm:col-span-1"
        label={t('Phone')}
        type="tel"
        autoComplete="tel"
        value={b.phone}
        onChange={(e) => set({ phone: e.target.value }, 'phone')}
      />
      <TextField
        containerClassName="col-span-2 sm:col-span-1"
        label={t('Email')}
        type="email"
        autoComplete="email"
        value={b.email}
        error={emailInvalid ? 'This email address looks incomplete' : undefined}
        onChange={(e) => set({ email: e.target.value }, 'email')}
      />
      <TextField
        containerClassName="col-span-2"
        label={t('Town or city')}
        hint={t('Your full address is not needed.')}
        autoComplete="address-level2"
        value={b.location}
        onChange={(e) => set({ location: e.target.value }, 'location')}
      />
      <label className="col-span-2 flex flex-col gap-1.5 text-sm font-semibold">
        {t('Where you’re applying')}
        <span className="text-ink-muted font-normal">
          {t('For advice that fits the country (photo, date of birth). Optional.')}
        </span>
        <select
          className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
          value={doc.market ?? ''}
          onChange={(e) => update((d) => ({ ...d, market: e.target.value || undefined }), 'market')}
          data-testid="market"
        >
          <option value="">{t('Not saying / several countries')}</option>
          {MARKETS.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2">
        <PhotoField editor={editor} />
      </div>
      <div className="col-span-2 flex flex-col gap-2" data-testid="key-numbers">
        <p className="text-sm font-semibold">
          {t('Key numbers')} <span className="text-ink-muted font-normal">{t('(optional)')}</span>
        </p>
        <p className="text-ink-muted text-sm">
          {t(
            'Up to three figures you can stand behind, shown large by the graphic designs — for example “12+” and “Years teaching”. Without them, designs show counts from your CV.',
          )}
        </p>
        {b.stats.map((k) => (
          <div key={k.id} className="grid grid-cols-[6.5rem_1fr_auto] items-end gap-2">
            <TextField
              label={t('Number')}
              value={k.value}
              maxLength={12}
              placeholder="e.g. 12+"
              onChange={(e) =>
                update(
                  (d) =>
                    ops.updateBasics(d, {
                      stats: d.basics.stats.map((x) =>
                        x.id === k.id ? { ...x, value: e.target.value } : x,
                      ),
                    }),
                  `stat.${k.id}.value`,
                )
              }
            />
            <TextField
              label={t('What it counts')}
              value={k.label}
              maxLength={40}
              placeholder={t('e.g. Years teaching')}
              onChange={(e) =>
                update(
                  (d) =>
                    ops.updateBasics(d, {
                      stats: d.basics.stats.map((x) =>
                        x.id === k.id ? { ...x, label: e.target.value } : x,
                      ),
                    }),
                  `stat.${k.id}.label`,
                )
              }
            />
            <IconButton
              label={t('Remove this number')}
              icon={<Trash2 aria-hidden size={18} />}
              onClick={() =>
                update((d) =>
                  ops.updateBasics(d, { stats: d.basics.stats.filter((x) => x.id !== k.id) }),
                )
              }
            />
          </div>
        ))}
        {b.stats.length < 3 && (
          <button
            type="button"
            onClick={() =>
              update((d) =>
                ops.updateBasics(d, {
                  stats: [...d.basics.stats, { id: newId(), value: '', label: '' }],
                }),
              )
            }
            className="text-primary hover:bg-primary-soft inline-flex min-h-11 items-center gap-2 self-start rounded-md px-2 text-[15px] font-semibold"
          >
            <Plus aria-hidden size={18} /> {t('Add a key number')}
          </button>
        )}
      </div>
      {showLinks && (
        <div className="col-span-2 flex flex-col gap-3">
          {b.links.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_1.6fr_auto] items-end gap-2">
              <TextField
                label={t('Link name')}
                value={l.label}
                placeholder={t('e.g. LinkedIn')}
                onChange={(e) =>
                  update(
                    (d) => ops.updateLink(d, l.id, { label: e.target.value }),
                    `link.${l.id}.label`,
                  )
                }
              />
              <TextField
                label={t('Web address')}
                value={l.url}
                placeholder={t('e.g. linkedin.com/in/you')}
                onChange={(e) =>
                  update(
                    (d) => ops.updateLink(d, l.id, { url: e.target.value }),
                    `link.${l.id}.url`,
                  )
                }
              />
              <IconButton
                label={t('Remove link')}
                icon={<Trash2 aria-hidden size={18} />}
                onClick={() => update((d) => ops.removeLink(d, l.id))}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => update((d) => ops.addLink(d))}
            className="text-primary hover:bg-primary-soft inline-flex min-h-11 items-center gap-2 self-start rounded-md px-2 text-[15px] font-semibold"
          >
            <Plus aria-hidden size={18} /> {t('Add a link (LinkedIn, website…)')}
          </button>
        </div>
      )}
    </div>
  );
}
