'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Languages } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { newId } from '@/modules/resume/create';
import type { ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';
import { applyPieces, LANGUAGES, languageOf } from '@/modules/translate/document';

type Piece = { id: string; original: string; text: string; kept: boolean };

const where = (id: string) =>
  id === 'b.headline'
    ? 'Job title you want'
    : id === 'b.summary'
      ? 'Profile'
      : /\.title$/.test(id) && !/\.i\d+\./.test(id)
        ? 'Section heading'
        : /bullets/.test(id)
          ? 'Point'
          : /keywords/.test(id)
            ? 'Skill'
            : '';

/**
 * Translate (spec §10.1): the CV in another language, reviewed side by side with the original,
 * saved as a new CV. Names, employers, places, numbers, dates and links are never changed.
 */
export function TranslateButton({ doc }: { doc: ResumeDocument }) {
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<string>(doc.locale.startsWith('de') ? 'en' : 'de');
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(null);
  if (account.status !== 'signedIn' || !ent || ent.features.translate === false) return null;
  const premiumOnly = ent.limits['ai.action'] === 0;
  const kept = pieces?.filter((p) => p.kept && !p.text.trim()).length ?? 0;

  const translate = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: doc, language: lang }),
      });
      const j = (await r.json().catch(() => null)) as
        { pieces: Piece[] } | { error: { message: string } } | null;
      if (!r.ok || !j || 'error' in j) {
        setProblem({
          message: (j && 'error' in j && j.error.message) || 'That didn’t work. Please try again.',
          premium: r.status === 402,
        });
        return;
      }
      setPieces(j.pieces.map((p) => ({ ...p, text: p.kept ? '' : p.text })));
      refresh();
    } catch {
      setProblem({ message: 'You seem to be offline. Please try again.' });
    } finally {
      setBusy(false);
    }
  };
  const create = () => {
    const l = languageOf(lang);
    if (!pieces || !l) return;
    const copy = applyPieces(
      doc,
      pieces.map((p) => ({ id: p.id, text: p.text.trim() || p.original })),
      { code: l[0], locale: l[3], name: l[2] },
      newId(),
    );
    getRepository().save(copy);
    setOpen(false);
    router.push(`/cv/${copy.id}`);
  };

  return (
    <>
      <IconButton
        label="Translate this CV"
        icon={<Languages aria-hidden size={20} />}
        onClick={() => setOpen(true)}
        data-testid="translate-open"
      />
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Translate this CV"
          className="w-[min(60rem,96vw)]!"
        >
          {!pieces ? (
            <div className="flex flex-col gap-4">
              <p className="text-ink-muted text-sm">
                You get a new CV in the language you choose, to check side by side before it’s
                saved. Your name, employers, places, dates, numbers and links stay exactly as they
                are. This one stays as it is.
              </p>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Translate into
                <select
                  className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                >
                  {LANGUAGES.filter((l) => !doc.locale.startsWith(l[0])).map((l) => (
                    <option key={l[0]} value={l[0]}>
                      {l[1]} — {l[2]}
                    </option>
                  ))}
                </select>
              </label>
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
              {premiumOnly ? (
                <p className="text-sm">
                  Translation is part of{' '}
                  <Link href="/premium" className="text-primary font-semibold">
                    Premium
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button loading={busy} loadingText="Translating…" onClick={translate}>
                    Translate
                  </Button>
                </div>
              )}
              <p className="text-ink-muted text-xs">
                Counts as {ent.aiWeights?.translate ?? 2} AI actions. A machine translation is a
                good start — have a native speaker read it before you send it if you can.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4" data-testid="translate-review">
              {kept > 0 && (
                <Banner tone="warning" title={`${kept} piece${kept === 1 ? '' : 's'} need you`}>
                  These couldn’t be translated safely (a name or number would have changed). Write
                  them yourself, or leave them empty to keep the original.
                </Banner>
              )}
              <div className="text-ink-muted grid grid-cols-2 gap-4 text-xs font-semibold uppercase">
                <span>Original</span>
                <span>{languageOf(lang)?.[2]}</span>
              </div>
              <ol className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
                {pieces.map((p, i) => (
                  <li key={p.id} className="grid grid-cols-2 gap-4 text-sm">
                    <p className="text-ink-muted">
                      {where(p.id) && (
                        <span className="text-ink-subtle block text-xs">{where(p.id)}</span>
                      )}
                      {p.original}
                    </p>
                    <textarea
                      aria-label={`Translation of: ${p.original.slice(0, 60)}`}
                      className={`bg-surface min-h-10 rounded-md border px-2 py-1.5 ${p.kept && !p.text.trim() ? 'border-warning' : 'border-line-strong'}`}
                      rows={Math.min(6, Math.max(1, Math.ceil(p.original.length / 60)))}
                      value={p.text}
                      placeholder={p.kept ? 'Write the translation (or keep the original)' : ''}
                      onChange={(e) =>
                        setPieces((all) =>
                          all!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                        )
                      }
                    />
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setPieces(null)}>
                  Start again
                </Button>
                <Button onClick={create} data-testid="translate-create">
                  Save as a new CV
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
