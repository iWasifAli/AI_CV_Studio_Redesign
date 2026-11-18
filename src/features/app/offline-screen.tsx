'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Container } from '@/components/ui/misc';
import { getRepository } from '@/modules/storage/repository';
import { useAccount, useRepositoryVersion } from '@/features/account/account-context';

/**
 * Shown by the installed app when a page can't be reached without a connection. CVs are kept on
 * this device, so those opened before still open and edits save here until you're back online.
 */
export function OfflineScreen() {
  const tx = useT();
  const account = useAccount();
  const owner = account.user?.uid ?? null;
  const version = useRepositoryVersion();
  const [cached, setCached] = useState<{
    owner: string | null;
    docs: { id: string; title: string }[];
  } | null>(null);
  const docs = account.status !== 'loading' && cached?.owner === owner ? cached.docs : null;
  useEffect(() => {
    if (account.status === 'loading') return;
    // Read after the first paint (this device's storage isn't available on the server).
    const t = window.setTimeout(() => {
      try {
        setCached({
          owner,
          docs: getRepository()
            .list()
            .slice(0, 20)
            .map((d) => ({ id: d.id, title: d.title || d.name || 'Untitled CV' })),
        });
      } catch {
        setCached({ owner, docs: [] });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [owner, account.status, version]);
  return (
    <Container className="max-w-[640px] py-12">
      <WifiOff aria-hidden size={28} className="text-primary" />
      <h1 className="font-display mt-3 text-3xl font-semibold">{tx('You’re offline')}</h1>
      <p className="text-ink-muted mt-2 text-lg">
        {tx(
          'This page needs a connection. CVs you’ve opened on this device still open, and your edits are saved here and synced when you’re back online.',
        )}
      </p>
      {docs && docs.length > 0 && (
        <section className="mt-6" aria-labelledby="off-cvs">
          <h2 id="off-cvs" className="font-semibold">
            {tx('Your CVs on this device')}
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {docs.map((d) => (
              <li key={d.id}>
                <Link href={`/cv/${d.id}`} className="text-primary font-semibold hover:underline">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-6">
        <Link href="/studio" className="text-primary font-semibold hover:underline">
          {tx('Try the studio home again')}
        </Link>
      </p>
    </Container>
  );
}
