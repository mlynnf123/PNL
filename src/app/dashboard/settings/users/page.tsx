import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { registerUser } from '@/server/commands/register-user';
import { deactivateUser } from '@/server/commands/deactivate-user';
import { assignRole, reactivateUser, revokeRole } from '@/server/commands/user-roles';
import { listRolesWithPermissions, listUsersWithRoles } from '@/server/queries/settings-directory';
import { Field, NoAccessNotice, Section, StatusPill } from '../../jobs/ui';

export default async function UsersSettingsPage() {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Users</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const orgId = session.user.organizationId;
  const [users, roles] = await Promise.all([
    listUsersWithRoles(orgId),
    listRolesWithPermissions(orgId),
  ]);

  async function createUser(formData: FormData) {
    'use server';
    await registerUser({
      displayName: String(formData.get('displayName')),
      email: String(formData.get('email')),
      password: String(formData.get('password')),
    });
    redirect('/dashboard/settings/users');
  }

  async function assign(formData: FormData) {
    'use server';
    await assignRole({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      targetUserId: String(formData.get('targetUserId')),
      roleId: String(formData.get('roleId')),
    });
    redirect('/dashboard/settings/users');
  }

  async function unassign(formData: FormData) {
    'use server';
    await revokeRole({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      targetUserId: String(formData.get('targetUserId')),
      roleId: String(formData.get('roleId')),
    });
    redirect('/dashboard/settings/users');
  }

  async function setActive(formData: FormData) {
    'use server';
    const targetUserId = String(formData.get('targetUserId'));
    if (formData.get('activate') === 'true') {
      await reactivateUser({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        targetUserId,
      });
    } else {
      await deactivateUser({
        actorUserId: session.user.id,
        targetUserId,
        reason: String(formData.get('reason') || 'Deactivated from settings'),
      });
    }
    redirect('/dashboard/settings/users');
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Users</h2>

      <Section title="Add a user">
        <form action={createUser} className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <Field label="Display name" name="displayName" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Temporary password" name="password" type="password" required />
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
            >
              Create user
            </button>
          </div>
        </form>
      </Section>

      <Section title={`Users (${users.length})`}>
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-3 border-b border-zinc-100 pb-3 last:border-0 dark:border-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-normal text-zinc-900 dark:text-zinc-50">
                    {user.displayName}{' '}
                    <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                      {user.email} · {user.userType}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={user.active ? 'strong' : 'soft'}>
                    {user.active ? 'Active' : 'Inactive'}
                  </StatusPill>
                  <form action={setActive}>
                    <input type="hidden" name="targetUserId" value={user.id} />
                    <input type="hidden" name="activate" value={user.active ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      {user.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </form>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {user.roles.length === 0 ? (
                  <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                    No roles
                  </span>
                ) : (
                  user.roles.map((role) => (
                    <form key={role.id} action={unassign} className="inline-flex">
                      <input type="hidden" name="targetUserId" value={user.id} />
                      <input type="hidden" name="roleId" value={role.id} />
                      <button
                        type="submit"
                        title="Remove role"
                        className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-700 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        {role.name}
                        <span className="ml-1 text-zinc-400 dark:text-zinc-600">remove</span>
                      </button>
                    </form>
                  ))
                )}
                <form action={assign} className="inline-flex items-center gap-1">
                  <input type="hidden" name="targetUserId" value={user.id} />
                  <select
                    name="roleId"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Add role
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
