import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/admin-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Admin Console'), robots: { index: false } };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
