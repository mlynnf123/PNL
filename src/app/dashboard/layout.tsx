import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { signOut } from '@/auth';
import { SidebarNav } from './sidebar-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-shrink-0 flex-col justify-between bg-gradient-to-b from-zinc-900 to-black p-4">
        <div className="flex flex-col gap-6">
          <Link href="/dashboard" className="px-2 text-lg font-medium text-white">
            JJ Roofing
          </Link>
          <SidebarNav />
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <p className="truncate px-2 text-xs font-normal text-zinc-400">{session.user.email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-md border border-white/10 px-3 py-1.5 text-left text-sm font-normal text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gradient-to-b from-zinc-50 to-white p-8 dark:from-black dark:to-zinc-950">
        {children}
      </main>
    </div>
  );
}
