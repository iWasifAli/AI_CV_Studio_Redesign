'use client';

import { useLang, useT } from '@/i18n/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FilePlus2, FileText, FileUp, Lock } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAccount } from '@/features/account/account-context';
import { createDocument } from '@/modules/resume/create';
import { isProfile, makeProfile } from '@/modules/resume/profile';
import { getRepository, type DocumentSummary } from '@/modules/storage/repository';

/** /profile: open the career profile, or create it from a CV, an import, or from scratch. */
export function ProfileSetup() {
  const lang = useLang();
  const t = useT();
  const account = useAccount();
  const router = useRouter();
  const [cvs, setCvs] = useState<DocumentSummary[] | null>(null);

  useEffect(() => {
    if (account.status !== 'signedIn') return;
    const repo = getRepository();
    const read = () => {
      const list = repo.list();
      const profile = list.find(isProfile);
      if (profile) router.replace(`/cv/${profile.id}`);
      else setCvs(list.filter((d) => !isProfile(d)));
    };
    read();
    return repo.subscribe(read);
  }, [account.status, router]);

  const create = (fromId?: string) => {
    const repo = getRepository();
    const base = fromId
      ? repo.get(fromId)
      : createDocument('general', { locale: lang === 'de' ? 'de-DE' : 'en-GB' });
    if (!base) return;
    const p = makeProfile(base);
    repo.save(p);
    router.push(`/cv/${p.id}?welcome=profile`);
  };

  if (account.status === 'signedOut')
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <Lock aria-hidden className="text-primary" />
        <h2 className="text-xl font-semibold">{t('Sign in to keep a career profile')}</h2>
        <p className="text-ink-muted">
          {t('Your profile lives in your account, so every CV you make can start from it.')}
        </p>
        <ButtonLink href="/signin?next=/profile">
          {t('Sign in or create a free account')}
        </ButtonLink>
      </Card>
    );
  if (!cvs)
    return <div className="skeleton h-64 rounded-lg" aria-busy="true" aria-label={t('Loading')} />;

  return (
    <div className="flex flex-col gap-6">
      {cvs.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <FileText aria-hidden size={20} className="text-primary" />{' '}
            {t('Start from one of your CVs')}
          </h2>
          <p className="text-ink-muted mb-3 text-sm">
            {t('We copy it into your profile; the CV itself stays as it is.')}
          </p>
          <ul className="divide-line divide-y">
            {cvs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{c.title || c.name || t('Untitled CV')}</span>
                <button
                  type="button"
                  className="text-primary min-h-10 shrink-0 font-semibold"
                  onClick={() => create(c.id)}
                >
                  {t('Use this')}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex flex-col items-start gap-2 p-5">
          <FileUp aria-hidden className="text-primary" />
          <h2 className="text-lg font-semibold">{t('Import a CV you have')}</h2>
          <p className="text-ink-muted text-sm">
            {t('Upload a PDF or Word file, then use it as your profile.')}
          </p>
          <Link href="/makeover" className="text-primary font-semibold">
            {t('Import a CV')}
          </Link>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-5">
          <FilePlus2 aria-hidden className="text-primary" />
          <h2 className="text-lg font-semibold">{t('Start from scratch')}</h2>
          <p className="text-ink-muted text-sm">{t('Add your experience step by step.')}</p>
          <button type="button" className="text-primary font-semibold" onClick={() => create()}>
            {t('Start an empty profile')}
          </button>
        </Card>
      </div>
    </div>
  );
}
