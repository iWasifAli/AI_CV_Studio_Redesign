'use client';

import { useT } from '@/i18n/client';
import { useState } from 'react';
import { Download, Redo2, Trash2, Undo2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, SelectableCard } from '@/components/ui/card';
import { Badge, Chip } from '@/components/ui/chip';
import { TextArea, TextField } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Container, Skeleton, Stepper } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Tabs, tabId, tabPanelId } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const COLORS = [
  'paper',
  'surface',
  'sunken',
  'line',
  'line-strong',
  'ink',
  'ink-muted',
  'ink-subtle',
  'primary',
  'primary-hover',
  'primary-soft',
  'accent',
  'accent-soft',
  'accent-ink',
  'success',
  'warning',
  'danger',
  'info',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line flex flex-col gap-4 border-t pt-8">
      <h2 className="text-[22px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Showcase() {
  const tx = useT();
  const toast = useToast();
  const [tab, setTab] = useState<'content' | 'design'>('content');
  const [density, setDensity] = useState<'compact' | 'balanced' | 'airy'>('balanced');
  const [skills, setSkills] = useState<string[]>(['Customer service']);
  const [selected, setSelected] = useState(1);

  return (
    <main id="main">
      <Container className="flex flex-col gap-10 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-semibold">{tx('Paper & Ink — components')}</h1>
          <p className="text-ink-muted">
            {tx('Internal reference. Tokens mirror docs/ux/design-system.md.')}
          </p>
        </header>

        <Section title={tx('Colour')}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {COLORS.map((c) => (
              <li key={c} className="flex flex-col gap-1.5 text-sm">
                <span
                  className="border-line h-14 rounded-md border"
                  style={{ background: `var(--color-${c})` }}
                />
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={tx('Typography')}>
          <p className="font-display text-5xl font-semibold">{tx('Display — Fraunces')}</p>
          <p className="font-display text-[32px] font-semibold">{tx('Page title — Fraunces 32')}</p>
          <p className="text-[22px] font-semibold">{tx('Section — Figtree 22')}</p>
          <p className="text-lg font-semibold">{tx('Card title — Figtree 18')}</p>
          <p>{tx('Body — Figtree 16. Plain words for everyone, from drivers to directors.')}</p>
          <p className="text-ink-muted text-sm">{tx('Helper — Figtree 14 muted.')}</p>
        </Section>

        <Section title={tx('Buttons')}>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{tx('Primary')}</Button>
            <Button variant="secondary">{tx('Secondary')}</Button>
            <Button variant="ghost">{tx('Ghost')}</Button>
            <Button variant="danger" icon={<Trash2 aria-hidden size={16} />}>
              {tx('Delete')}
            </Button>
            <Button loading loadingText={tx('Preparing your PDF…')}>
              {tx('Download PDF')}
            </Button>
            <Button size="sm">{tx('Small')}</Button>
            <Button size="lg" icon={<Download aria-hidden size={18} />}>
              {tx('Large')}
            </Button>
            <IconButton label={tx('Undo')} icon={<Undo2 aria-hidden size={20} />} />
            <IconButton
              label={tx('Redo')}
              variant="outlined"
              icon={<Redo2 aria-hidden size={20} />}
            />
          </div>
        </Section>

        <Section title={tx('Form fields')}>
          <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <TextField label={tx('Full name')} placeholder={tx('e.g. Imran Qureshi')} />
            <TextField
              label={tx('Email')}
              optional
              hint={tx('Employers will use this to reply.')}
              placeholder={tx('name@example.com')}
            />
            <TextField
              label={tx('Phone')}
              error="This number looks too short"
              defaultValue="0300"
            />
            <TextField label={tx('Disabled')} disabled defaultValue="Can't edit" />
            <TextArea
              containerClassName="sm:col-span-2"
              label={tx('What did you do there?')}
              hint={tx(
                'One thing per line. For example: Delivered 120 parcels a day across north London.',
              )}
            />
          </div>
          <Segmented
            label={tx('Spacing')}
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'airy', label: 'Airy' },
            ]}
            className="max-w-sm"
          />
        </Section>

        <Section title={tx('Chips and badges')}>
          <div className="flex flex-wrap gap-2">
            {['Customer service', 'Route planning', 'Forklift', 'First aid'].map((s) => (
              <Chip
                key={s}
                selected={skills.includes(s)}
                onClick={() =>
                  setSkills((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]))
                }
              >
                {s}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{tx('Neutral')}</Badge>
            <Badge tone="primary">{tx('Saved')}</Badge>
            <Badge tone="accent">{tx('Suggested')}</Badge>
            <Badge tone="success">{tx('Ready')}</Badge>
            <Badge tone="warning">{tx('Needs your input')}</Badge>
            <Badge tone="danger">{tx('Error')}</Badge>
          </div>
        </Section>

        <Section title={tx('Cards')}>
          <div className="grid gap-4 sm:grid-cols-3">
            {['Calm & classic', 'Modern & clear', 'Bold sidebar'].map((t, i) => (
              <SelectableCard key={t} selected={selected === i} onClick={() => setSelected(i)}>
                <span className="font-semibold">{t}</span>
                <span className="text-ink-muted text-sm">
                  {tx('A short description of the style.')}
                </span>
              </SelectableCard>
            ))}
          </div>
          <Card className="max-w-md p-5">
            <p className="font-semibold">{tx('Static card')}</p>
            <p className="text-ink-muted text-sm">{tx('Used for grouped content.')}</p>
          </Card>
        </Section>

        <Section title={tx('Tabs and stepper')}>
          <div className="max-w-md">
            <Tabs
              label={tx('Editor')}
              idBase="ds-tabs"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'content', label: 'Content' },
                { value: 'design', label: 'Design' },
              ]}
            />
            <div
              role="tabpanel"
              id={tabPanelId('ds-tabs', tab)}
              aria-labelledby={tabId('ds-tabs', tab)}
              className="text-ink-muted py-4"
            >
              {tab === 'content' ? tx('Content panel') : tx('Design panel')}
            </div>
          </div>
          <div className="max-w-md">
            <Stepper current={2} total={6} label={tx('Work history')} />
          </div>
        </Section>

        <Section title={tx('Feedback')}>
          <div className="flex max-w-2xl flex-col gap-3">
            <Banner tone="info" title={tx('Saved on this device')}>
              {tx('Download a backup to keep your CVs safe.')}
            </Banner>
            <Banner tone="success" title={tx('Your CV is ready')} />
            <Banner tone="warning" title={tx('2 details need your input')} />
            <Banner
              tone="error"
              title={tx("We couldn't create the PDF")}
              action={
                <Button size="sm" variant="secondary">
                  {tx('Try again')}
                </Button>
              }
            >
              {tx('You can also use Print to save it as a PDF.')}
            </Banner>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => toast.show({ message: 'Saved', tone: 'success' })}
            >
              {tx('Show toast')}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({
                  message: 'Work entry removed',
                  action: { label: 'Undo', onAction: () => {} },
                })
              }
            >
              {tx('Toast with undo')}
            </Button>
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Section>
      </Container>
    </main>
  );
}
