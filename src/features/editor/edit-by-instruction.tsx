'use client';

import { useT } from '@/i18n/client';
import { useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAi } from '@/features/ai/client';
import { AskText, SuggestionCard, useSuggestion } from '@/features/ai/suggestion';
import {
  applyChanges,
  describeChange,
  editPrompt,
  type EditChange,
} from '@/modules/resume/instruction-edit';
import type { ResumeDocument } from '@/modules/resume/schema';
import type { DocumentEditor } from './use-document-editor';

const EXAMPLES = [
  'Make my profile shorter',
  'Put Education above Work history',
  'Rewrite my points in the past tense',
];

type Raw = { op: string; target: string; text: string; before: string; why: string };
const toChange = (c: Raw): EditChange =>
  c.op === 'move'
    ? { op: 'move', target: c.target, before: c.before || 'end', why: c.why }
    : c.op === 'remove' || c.op === 'hide' || c.op === 'show'
      ? { op: c.op, target: c.target, why: c.why }
      : { op: c.op as 'set' | 'add' | 'rename', target: c.target, text: c.text, why: c.why };

/**
 * "Ask AI to edit" (gap audit S-01): the person writes what they want changed; the AI proposes
 * small, named changes; each one is shown before → after with a tick box, and the ticked ones are
 * applied together as one undo step. Parts it could not do are listed with the reason.
 */
export function EditByInstruction({ editor }: { editor: DocumentEditor }) {
  const tx = useT();
  const ai = useAi();
  const s = useSuggestion('cv.edit');
  const [text, setText] = useState('');
  const [skip, setSkip] = useState<Set<number>>(new Set());
  // The CV the changes were made against: they apply only while it is unchanged.
  const [asked, setAsked] = useState<ResumeDocument | null>(null);

  const result = s.state.kind === 'done' ? s.state.data.result : null;
  const rows = useMemo(() => {
    const base = asked;
    if (!result || !base) return [];
    return result.changes.map((raw) => {
      const change = toChange(raw);
      return { change, d: describeChange(base, change) };
    });
  }, [result, asked]);

  if (!ai.show) return null;
  const run = () => {
    if (text.trim().length < 3) return;
    setAsked(editor.doc);
    setSkip(new Set());
    void s.run({ instruction: text.trim(), cv: editPrompt(editor.doc) }, 'Edit by instruction');
  };
  // Changes point at list positions, so they apply only while the content is as it was.
  const stale =
    asked !== null &&
    asked !== editor.doc &&
    JSON.stringify([asked.basics, asked.sections]) !==
      JSON.stringify([editor.doc.basics, editor.doc.sections]);

  return (
    <section
      className="border-line bg-surface shadow-1 flex flex-col gap-3 rounded-lg border p-4"
      aria-labelledby="edit-by-instruction"
      data-testid="edit-by-instruction"
    >
      <h3 id="edit-by-instruction" className="flex items-center gap-2 text-[17px] font-semibold">
        <Wand2 aria-hidden size={18} className="text-primary" /> {tx('Ask AI to edit your CV')}
      </h3>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">
          {tx('Say what to change. You will see every change before it is made.')}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder={tx(EXAMPLES[0]!)}
          className="border-line-strong bg-surface rounded-md border px-3 py-2 text-[15px]"
          data-testid="edit-instruction"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={run}
          disabled={text.trim().length < 3 || s.state.kind === 'loading'}
          data-testid="edit-run"
        >
          {tx('Suggest changes')}
        </Button>
        {EXAMPLES.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setText(tx(x))}
            className="text-primary text-sm underline-offset-2 hover:underline"
          >
            {tx(x)}
          </button>
        ))}
      </div>

      <SuggestionCard
        s={s}
        demo={ai.demo}
        useLabel={tx('Apply the ticked changes')}
        onUse={() => {
          const base = asked;
          if (!base || stale) return;
          const chosen = rows.filter((r, i) => r.d.ok && !skip.has(i)).map((r) => r.change);
          if (!chosen.length) return;
          // One undo step for the whole set.
          editor.update((d) => applyChanges(d, chosen), `ai-edit.${Date.now()}`);
          s.dismiss();
          setText('');
        }}
      >
        {() => (
          <div className="flex flex-col gap-3" data-testid="edit-changes">
            {rows.length === 0 && <p>{tx('No change was needed or possible.')}</p>}
            {rows.length > 0 && (
              <ul className="flex flex-col gap-2">
                {rows.map((r, i) =>
                  r.d.ok ? (
                    <li key={i} className="bg-surface border-line rounded-md border p-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={!skip.has(i)}
                          onChange={(e) =>
                            setSkip((cur) => {
                              const n = new Set(cur);
                              if (e.target.checked) n.delete(i);
                              else n.add(i);
                              return n;
                            })
                          }
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-ink-muted text-xs">
                            {r.d.view.where}
                            {r.d.view.why ? ` · ${r.d.view.why}` : ''}
                          </span>
                          {r.d.view.before && (
                            <span className="text-ink-muted line-through">{r.d.view.before}</span>
                          )}
                          {r.d.view.after ? (
                            <span>
                              <AskText text={r.d.view.after} />
                            </span>
                          ) : (
                            <span className="text-danger text-sm">{tx('Removed')}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ) : (
                    <li key={i} className="text-ink-muted text-sm">
                      {tx('Left out a suggestion:')} {tx(r.d.reason)}
                    </li>
                  ),
                )}
              </ul>
            )}
            {result && result.notDone.length > 0 && (
              <div className="text-sm" data-testid="edit-not-done">
                <p className="font-semibold">{tx('Not done')}</p>
                <ul className="text-ink-muted list-disc pl-5">
                  {result.notDone.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {stale && (
              <p className="text-warning text-sm">
                {tx('Your CV changed since these were suggested. Ask again to apply them.')}
              </p>
            )}
          </div>
        )}
      </SuggestionCard>
    </section>
  );
}
