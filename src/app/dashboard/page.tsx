import { requireSession } from '@/lib/require-session';
import { AppHeader } from './app-header';

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-zinc-50 to-white p-8 dark:from-black dark:to-zinc-950">
      <AppHeader />

      <div className="rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 dark:border-zinc-800 dark:from-zinc-950 dark:to-black">
        <p className="font-normal text-zinc-900 dark:text-zinc-50">
          Signed in as {session.user.email}
        </p>
        <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
          Role: {session.user.userType}
        </p>
      </div>
    </div>
  );
}
