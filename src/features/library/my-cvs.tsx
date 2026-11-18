'use client';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  FileText,
  Globe,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { DocumentPreview } from '@/features/preview/document-preview';
import { duplicateDocument } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';
import { getTemplate } from '@/modules/templates/registry';
import { useAccount } from '@/features/account/account-context';
import { cvFromProfile, isProfile } from '@/modules/resume/profile';

function load(): ResumeDocument[] {
  const repo = getRepository();
  return repo
    .list()
    .map((s) => repo.get(s.id))
    .filter((d): d is ResumeDocument => d !== null);
}

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `only` narrows the list (Documents hub: CVs for one job). */
export function MyCvs({ only }: { only?: (doc: ResumeDocument) => boolean } = {}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [docs, setDocs] = useState<ResumeDocument[]>(load);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = () => setDocs(load());
  const repo = getRepository();
  // Account resolution replaces the repository; re-read and subscribe to that owner's records.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external repository snapshot
    setDocs(load());
    return repo.subscribe(() => setDocs(load()));
  }, [repo]);
  const account = useAccount();
  const signedIn = account.status === 'signedIn';
  const profile = docs.find(isProfile);
  const cvs = docs.filter((d) => !isProfile(d) && (!only || only(d)));

  const newFromProfile = () => {
    if (!profile) return;
    const cv = cvFromProfile(profile);
    repo.save(cv);
    router.push(`/cv/${cv.id}`);
  };

  const remove = (doc: ResumeDocument) => {
    repo.remove(doc.id);
    refresh();
    toast.show({
      message: `“${doc.title}” deleted`,
      action: {
        label: 'Undo',
        onAction: () => {
          repo.save(doc);
          refresh();
        },
      },
    });
  };

  const duplicate = (doc: ResumeDocument) => {
    repo.save(duplicateDocument(doc));
    refresh();
    toast.show({ message: 'Copy created', tone: 'success' });
  };

  const backupAll = () => {
    const blob = new Blob([JSON.stringify(repo.exportAll(), null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-cv-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const restore = async (file: File) => {
    try {
      if (file.size > 5_000_000) throw new Error('This file is too large to be a backup.');
      const result = repo.importAll(JSON.parse(await file.text()));
      refresh();
      toast.show({
        tone: result.added ? 'success' : 'error',
        message: result.added
          ? `${result.added} CV${result.added === 1 ? '' : 's'} restored${result.skipped ? ` (${result.skipped} could not be read)` : ''}`
          : 'No CVs could be read from this file',
      });
    } catch (e) {
      toast.show({
        tone: 'error',
        message:
          e instanceof Error && e.message.includes('backup')
            ? e.message
            : 'This file is not an AI CV Studio backup.',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Banner
        tone="info"
        title={
          signedIn
            ? t('Your CVs are saved to your account')
            : t('Your CVs are saved in this browser')
        }
        action={
          <div className="flex flex-wrap gap-2">
            {docs.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Download aria-hidden size={16} />}
                onClick={backupAll}
              >
                {t('Download a backup')}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<Upload aria-hidden size={16} />}
              onClick={() => fileInput.current?.click()}
            >
              {t('Restore from a backup')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = '';
              }}
            />
          </div>
        }
      >
        {signedIn ? (
          <>
            {t('They appear on every device where you sign in')}
            {account.sync === 'syncing'
              ? ' · Saving…'
              : account.sync === 'offline'
                ? ' · Offline, will save when you’re back online'
                : ''}
            .
          </>
        ) : (
          <>
            {t('Clearing your browser data removes them.')}{' '}
            <Link
              href="/signin?next=/cv"
              className="text-primary font-semibold underline underline-offset-4"
            >
              {t('Sign in')}
            </Link>{' '}
            {t('to keep them safe in your account and use them on other devices.')}
          </>
        )}
      </Banner>

      {signedIn && (
        <section
          aria-labelledby="profile-h"
          className="border-line bg-surface flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5"
          data-testid="profile-card"
        >
          <div className="flex items-start gap-3">
            <span className="bg-primary-soft text-primary inline-flex size-11 shrink-0 items-center justify-center rounded-full">
              <UserRound aria-hidden size={22} />
            </span>
            <div>
              <h2 id="profile-h" className="font-semibold">
                {t('Career profile')}
              </h2>
              <p className="text-ink-muted text-sm">
                {profile
                  ? t('Your master record · updated {v0}. New and tailored CVs start from it.', {
                      v0: when(profile.updatedAt),
                    })
                  : t(
                      'Keep all your experience in one master record, then make a CV for each job from it.',
                    )}
              </p>
            </div>
          </div>
          {profile ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/cv/${profile.id}`} variant="secondary" size="sm">
                {t('Edit profile')}
              </ButtonLink>
              <Button size="sm" onClick={newFromProfile}>
                {t('New CV from profile')}
              </Button>
            </div>
          ) : (
            <ButtonLink href="/profile" variant="secondary" size="sm">
              {t('Set up your profile')}
            </ButtonLink>
          )}
        </section>
      )}

      {signedIn && cvs.length > 0 && (
        <nav
          aria-label={t('Your presence')}
          className="flex flex-wrap gap-3"
          data-testid="presence-links"
        >
          <Link
            href="/portfolio"
            className="border-line bg-surface hover:border-primary inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
          >
            <Globe aria-hidden size={16} className="text-primary" /> {t('Portfolio page')}
          </Link>
          <Link
            href="/linkedin"
            className="border-line bg-surface hover:border-primary inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
          >
            <Sparkles aria-hidden size={16} className="text-primary" />{' '}
            {t('LinkedIn profile writer')}
          </Link>
        </nav>
      )}

      {cvs.length === 0 ? (
        <div className="border-line-strong bg-surface flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="bg-primary-soft text-primary inline-flex size-14 items-center justify-center rounded-full">
            <FileText aria-hidden size={26} />
          </span>
          <h2 className="text-xl font-semibold">
            {account.status === 'signedIn' ? t('No CVs yet') : t('No CVs on this device yet')}
          </h2>
          <p className="text-ink-muted max-w-md">
            {t('When you create a CV, it is saved here so you can come back to it.')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/start">{t('Create a CV')}</ButtonLink>
            <ButtonLink href="/makeover" variant="secondary">
              {t('Import a CV')}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cvs.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-3">
              <Link
                href={`/cv/${doc.id}`}
                className="group bg-surface shadow-page ring-primary block overflow-hidden rounded-[4px] transition-shadow hover:ring-2"
                aria-label={t('Open {title}', { title: doc.title })}
              >
                <div className="pointer-events-none">
                  <DocumentPreview
                    doc={doc}
                    firstPageOnly
                    decorative
                    debounceMs={0}
                    title={t('Thumbnail of {title}', { title: doc.title })}
                  />
                </div>
              </Link>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">
                    <Link href={`/cv/${doc.id}`} className="hover:underline">
                      {doc.title}
                    </Link>
                  </h2>
                  <p className="text-ink-muted text-sm">
                    {t('{name} · edited {when}', {
                      name: getTemplate(doc.design.templateId).name,
                      when: when(doc.updatedAt),
                    })}
                  </p>
                </div>
                <Menu
                  label={t('Options for {title}', { title: doc.title })}
                  items={[
                    {
                      label: 'Edit',
                      icon: <Pencil aria-hidden size={16} />,
                      onSelect: () => router.push(`/cv/${doc.id}`),
                    },
                    {
                      label: 'Download',
                      icon: <Download aria-hidden size={16} />,
                      onSelect: () => router.push(`/cv/${doc.id}/download`),
                    },
                    {
                      label: 'Make a copy',
                      icon: <Copy aria-hidden size={16} />,
                      onSelect: () => duplicate(doc),
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 aria-hidden size={16} />,
                      danger: true,
                      onSelect: () => remove(doc),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
