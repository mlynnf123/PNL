import { requireSession } from '@/lib/require-session';
import { signOut } from '@/auth';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  // App-shell layout: fixed collapsible dark rail on the left (primary nav); the
  // right column is a top bar (search / settings / account) over the scrolling
  // content on the light page surface.
  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F6FC]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar email={session.user.email ?? ''} logout={logout} />
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
