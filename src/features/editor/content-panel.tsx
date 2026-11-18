'use client';

import { useWorkspaceState } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import { useSelectionAssist } from '@/features/ai/selection-assist';
import { forwardRef, useImperativeHandle } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { TextArea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { getPreset } from '@/modules/resume/presets';
import { ops } from '@/modules/resume/ops';
import { SECTION_KINDS, type SectionKind } from '@/modules/resume/schema';
import { SummaryAssist } from '@/features/ai/assist';
import { NeedsInputHint } from '@/features/ai/suggestion';
import { BasicsForm } from './basics-form';
import { KIND_INFO } from './item-fields';
import { SectionCard } from './section-card';
import { EditByInstruction } from './edit-by-instruction';
import type { DocumentEditor } from './use-document-editor';

export type ContentPanelHandle = { reveal: (ref: string) => void };

function Collapsible({
  title,
  defaultOpen = true,
  children,
  id,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  id: string;
}) {
  const tx = useT();
  const [open, setOpen] = useWorkspaceState(`editor.collapsible.${id}.open`, defaultOpen);
  return (
    <section className="border-line bg-surface shadow-1 rounded-lg border" id={id}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between px-4 text-left text-[17px] font-semibold"
        >
          {tx(title)}
          <ChevronDown
            aria-hidden
            size={18}
            className={cn('text-ink-subtle transition-transform', open && 'rotate-180')}
          />
        </button>
      </h3>
      {open && <div className="border-line border-t px-4 pt-3 pb-5">{children}</div>}
    </section>
  );
}

export const ContentPanel = forwardRef<ContentPanelHandle, { editor: DocumentEditor }>(
  function ContentPanel({ editor }, ref) {
    const t = useT();
    const { doc, update } = editor;
    const preset = getPreset(doc.presetId);
    const [expanded, setExpanded] = useWorkspaceState<Set<string>>(
      'editor.contentpanel.expanded',
      () => new Set(),
    );
    const [adding, setAdding] = useWorkspaceState('editor.contentpanel.adding', false);
    const [filter, setFilter] = useWorkspaceState('editor.contentpanel.filter', '');
    const summaryAssist = useSelectionAssist(doc.basics.summary, (summary) =>
      update((d) => ops.updateBasics(d, { summary }), `basics.summary.ai.${Date.now()}`),
    );

    const toggle = (itemId: string, open?: boolean) =>
      setExpanded((s) => {
        const n = new Set(s);
        if (open ?? !n.has(itemId)) n.add(itemId);
        else n.delete(itemId);
        return n;
      });

    useImperativeHandle(ref, () => ({
      reveal(target: string) {
        const [sectionId, itemId] = target.split('/');
        let el: HTMLElement | null = null;
        if (sectionId === 'basics') el = document.getElementById('editor-summary');
        else if (itemId) {
          toggle(itemId, true);
          el = document.getElementById(`item-${itemId}`);
        } else
          el = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(sectionId!)}"]`);
        window.setTimeout(() => {
          const node = itemId ? document.getElementById(`item-${itemId}`) : el;
          node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          node
            ?.querySelector<HTMLElement>('input, textarea, select')
            ?.focus({ preventScroll: true });
        }, 60);
      },
    }));

    const present = new Set(doc.sections.map((s) => s.kind));
    const suggested = preset.suggestedExtras.filter((s) => !present.has(s.kind));
    const others = SECTION_KINDS.filter(
      (k) => k === 'custom' || (!present.has(k) && !suggested.some((s) => s.kind === k)),
    );
    const addSection = (kind: SectionKind, title: string) => {
      let newItem = '';
      update((d) => {
        const r = ops.addSection(d, kind, title);
        const sec = r.doc.sections.find((s) => s.id === r.sectionId);
        newItem = sec?.items[0]?.id ?? '';
        return r.doc;
      });
      if (newItem) toggle(newItem, true);
      setAdding(false);
    };

    return (
      <div className="flex flex-col gap-4">
        <EditByInstruction editor={editor} />
        <Collapsible title={t('About you')} id="editor-basics">
          <BasicsForm editor={editor} />
        </Collapsible>
        <Collapsible title={t('Profile')} id="editor-summary">
          <TextArea
            label={t('A short introduction')}
            hint={t(
              'Two or three sentences about you and the work you want. Optional, but recommended.',
            )}
            placeholder={t(preset.hints.summary)}
            rows={4}
            value={doc.basics.summary}
            onChange={(e) =>
              update((d) => ops.updateBasics(d, { summary: e.target.value }), 'basics.summary')
            }
            onSelect={summaryAssist.onSelect}
            onMouseUp={summaryAssist.onMouseUp}
            onKeyUp={summaryAssist.onKeyUp}
          />
          <div className="mt-2 flex flex-col gap-2">
            {summaryAssist.toolbar}
            <NeedsInputHint texts={[doc.basics.summary]} />
            <SummaryAssist
              summary={doc.basics.summary}
              onApply={(text) =>
                update(
                  (d) => ops.updateBasics(d, { summary: text }),
                  `basics.summary.ai.${Date.now()}`,
                )
              }
            />
          </div>
        </Collapsible>
        {doc.sections.map((s, i) => (
          <SectionCard
            key={s.id}
            editor={editor}
            section={s}
            index={i}
            count={doc.sections.length}
            preset={preset}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
        {adding ? (
          <section
            aria-label={t('Add a section')}
            className="border-line-strong bg-surface rounded-lg border border-dashed p-4"
          >
            <p className="mb-3 font-semibold">{t('What would you like to add?')}</p>
            <input
              type="search"
              aria-label={t('Find a section type')}
              placeholder={t('Find a section — e.g. references')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border-line-strong bg-surface focus-visible:border-primary mb-3 h-11 w-full rounded-md border px-3 text-[15px]"
            />
            <ul className="grid gap-2" aria-label={t('Section types')}>
              {[
                ...suggested.map((s) => ({ kind: s.kind, title: s.title })),
                ...others.map((k) => ({ kind: k, title: KIND_INFO[k].title })),
              ]
                .filter((opt) =>
                  `${t(opt.title)} ${KIND_INFO[opt.kind].description}`
                    .toLowerCase()
                    .includes(filter.trim().toLowerCase()),
                )
                .map((opt) => (
                  <li key={`${opt.kind}-${t(opt.title)}`}>
                    <button
                      type="button"
                      onClick={() => {
                        addSection(opt.kind, opt.title);
                        setFilter('');
                      }}
                      className="border-line hover:border-primary hover:bg-primary-soft flex min-h-12 w-full flex-col items-start rounded-md border px-3 py-2 text-left"
                    >
                      <span className="font-semibold">{t(opt.title)}</span>
                      <span className="text-ink-muted text-sm">
                        {t(KIND_INFO[opt.kind].description)}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFilter('');
              }}
              className="text-ink-muted hover:bg-sunken mt-3 min-h-11 rounded-md px-3 font-semibold"
            >
              {t('Cancel')}
            </button>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="border-line-strong bg-surface text-primary hover:border-primary hover:bg-primary-soft inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed font-semibold"
          >
            <Plus aria-hidden size={18} /> {t('Add a section')}
          </button>
        )}
      </div>
    );
  },
);
