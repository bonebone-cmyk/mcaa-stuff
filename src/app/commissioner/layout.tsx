import Link from 'next/link';
import { getActor } from '@/lib/auth/session';
import { EmptyState } from '@/components/ui';
import { CommissionerNav } from './nav';

export const metadata = { title: 'Commissioner Panel' };

export default async function CommissionerLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (actor?.role !== 'commissioner') {
    return (
      <div className="mx-auto max-w-xl pt-8">
        <EmptyState title="Commissioner access required">
          {actor ? 'Your account does not have commissioner permissions.' : <><Link href="/login" className="font-semibold text-accent">Sign in</Link> with the commissioner account.</>}
        </EmptyState>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-5 flex items-center gap-2"><span className="rounded-md bg-accent px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">Commissioner</span><h1 className="font-display text-2xl font-black uppercase">Control Center</h1></div>
      <CommissionerNav />
      {children}
    </div>
  );
}
