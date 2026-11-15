'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAccount } from '@/features/account/account-context';
import { CheckboxField } from '@/features/editor/fields';
import { saveBlob } from '@/lib/save-blob';
import {
  businessCardHtml,
  qrDataUrl,
  signatureHtml,
  signatureText,
  type CardOptions,
} from '@/modules/presence/card';
import type { ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';

/** Email signature and business card (spec §10.1), from one of the person's CVs. */
export function CardStudio() {
  const account = useAccount();
  const toast = useToast();
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  const [docId, setDocId] = useState('');
  const [opts, setOpts] = useState<CardOptions>({
    phone: true,
    email: true,
    location: false,
    links: false,
    url: '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const list = getRepository()
        .list()
        .map((d) => ({ id: d.id, title: d.title || d.name || 'Untitled CV' }));
      setDocs(list);
      setDocId((cur) => cur || list[0]?.id || '');
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  // The portfolio page is the natural link for the card's QR code.
  useEffect(() => {
    if (account.status !== 'signedIn') return;
    let live = true;
    fetch('/api/portfolio', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { portfolio: { slug: string; published: boolean } | null } | null) => {
        if (live && j?.portfolio?.published)
          setOpts((o) =>
            o.url ? o : { ...o, url: `${window.location.origin}/p/${j.portfolio!.slug}` },
          );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account.status]);

  const doc: ResumeDocument | null = useMemo(
    () => (docId ? getRepository().get(docId) : null),
    [docId],
  );
  const urlOk = !opts.url || /^https:\/\/[\w.-]+(\/\S*)?$/i.test(opts.url);
  const sig = useMemo(() => (doc ? signatureHtml(doc, opts) : ''), [doc, opts]);
  const card = useMemo(
    () =>
      doc
        ? businessCardHtml(doc, opts, opts.url && urlOk ? qrDataUrl(opts.url) : null, {
            kind: 'url',
            baseUrl: window.location.origin,
          })
        : '',
    [doc, opts, urlOk],
  );

  if (account.status === 'signedOut')
    return (
      <Banner tone="info" title="Sign in to make your signature and card" className="mt-6">
        <ButtonLink size="sm" href="/signin?next=/presence/card">
          Sign in
        </ButtonLink>
      </Banner>
    );
  if (!docs.length)
    return (
      <p className="text-ink-muted mt-6">
        Make a CV first — the signature and card use its details and design.
      </p>
    );

  const copySignature = async () => {
    if (!doc) return;
    try {
      if ('ClipboardItem' in window)
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([sig], { type: 'text/html' }),
            'text/plain': new Blob([signatureText(doc, opts)], { type: 'text/plain' }),
          }),
        ]);
      else await navigator.clipboard.writeText(signatureText(doc, opts));
      toast.show({
        tone: 'success',
        message: 'Signature copied — paste it into your email settings',
      });
    } catch {
      toast.show({ tone: 'error', message: 'Couldn’t copy. Select the signature and copy it.' });
    }
  };
  const download = async () => {
    if (!doc) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch('/api/card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: doc, options: opts }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: { message: string } } | null;
        setProblem(j?.error?.message ?? 'We couldn’t create the card just now.');
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ??
        'Business-Card.pdf';
      saveBlob(await r.blob(), name);
    } catch {
      setProblem('You seem to be offline. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
      <div className="flex flex-col gap-3" data-testid="card-options">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Details from
          <select
            className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <CheckboxField
          label="Phone"
          checked={opts.phone}
          onChange={(v) => setOpts({ ...opts, phone: v })}
        />
        <CheckboxField
          label="Email"
          checked={opts.email}
          onChange={(v) => setOpts({ ...opts, email: v })}
        />
        <CheckboxField
          label="Town or city"
          checked={opts.location}
          onChange={(v) => setOpts({ ...opts, location: v })}
        />
        <CheckboxField
          label="Links from your CV"
          checked={opts.links}
          onChange={(v) => setOpts({ ...opts, links: v })}
        />
        <TextField
          label="Your page (for the QR code)"
          hint="Your portfolio page or a share link, starting with https://"
          optional
          value={opts.url}
          error={urlOk ? undefined : 'Use a full link starting with https://'}
          onChange={(e) => setOpts({ ...opts, url: e.target.value.trim() })}
        />
      </div>
      <div className="flex flex-col gap-8">
        <section aria-labelledby="sig-h" className="flex flex-col gap-3">
          <h2 id="sig-h" className="text-xl font-semibold">
            Email signature
          </h2>
          <div
            className="border-line bg-surface rounded-lg border p-5"
            data-testid="signature-preview"
            // Our own escaped HTML, made from the CV's details above.
            dangerouslySetInnerHTML={{ __html: sig }}
          />
          <div className="flex flex-wrap gap-2">
            <Button icon={<Copy aria-hidden size={18} />} onClick={copySignature}>
              Copy signature
            </Button>
          </div>
          <p className="text-ink-muted text-sm">
            Gmail: Settings → See all settings → Signature → paste. Outlook: Settings → Mail →
            Compose and reply → Email signature → paste.
          </p>
        </section>
        <section aria-labelledby="card-h" className="flex flex-col gap-3">
          <h2 id="card-h" className="text-xl font-semibold">
            Business card
          </h2>
          <iframe
            title="Business card preview, front and back"
            className="border-line h-[330px] w-full max-w-[520px] rounded-lg border bg-[#eef0f2]"
            sandbox="allow-scripts"
            srcDoc={card}
            data-testid="card-preview"
          />
          {problem && <Banner tone="error" title={problem} />}
          <Button
            className="self-start"
            variant="secondary"
            icon={<Download aria-hidden size={18} />}
            loading={busy}
            disabled={!urlOk}
            onClick={download}
          >
            Download the card (PDF)
          </Button>
          <p className="text-ink-muted text-sm">
            85 × 55 mm, front and back. Print shops can print straight from the PDF.
          </p>
        </section>
      </div>
    </div>
  );
}
