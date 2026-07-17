import Link from 'next/link';
import { signOut } from '@/auth';

export function AppHeader() {
  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="text-xl font-medium text-zinc-900 dark:text-zinc-50">
          JJ Roofing
        </Link>
        <Link
          href="/dashboard/jobs"
          className="text-sm font-normal text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Jobs
        </Link>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
