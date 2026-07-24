import { requireSession } from '@/lib/require-session';
import { signOut } from '@/auth';
import { CommandPalette } from './command-palette';
import { Topbar } from './topbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar email={session.user.email ?? ''} logout={logout} />
      <main className="mx-auto w-full max-w-7xl flex-1 overflow-auto p-4 md:p-8">{children}</main>
      <CommandPalette />
    </div>
  );
}
