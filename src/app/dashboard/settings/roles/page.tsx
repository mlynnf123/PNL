import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSION_CATALOG, PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { createRole, setRolePermissions } from '@/server/commands/roles-admin';
import { listRolesWithPermissions } from '@/server/queries/settings-directory';
import { Field, NoAccessNotice, Section } from '../../jobs/ui';

export default async function RolesSettingsPage() {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-medium text-slate-900">Roles</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const roles = await listRolesWithPermissions(session.user.organizationId);

  async function addRole(formData: FormData) {
    'use server';
    await createRole({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      name: String(formData.get('name')),
    });
    redirect('/dashboard/settings/roles');
  }

  async function savePermissions(formData: FormData) {
    'use server';
    const permissionKeys = PERMISSION_CATALOG.map((entry) => entry.key).filter(
      (key) => formData.get(`perm:${key}`) === 'on',
    );
    await setRolePermissions({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      roleId: String(formData.get('roleId')),
      permissionKeys,
    });
    redirect('/dashboard/settings/roles');
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-medium text-slate-900">Roles &amp; permissions</h2>

      <Section title="Add a role">
        <form action={addRole} className="flex max-w-md items-end gap-3">
          <div className="flex-1">
            <Field label="Role name" name="name" required />
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
          >
            Create role
          </button>
        </form>
      </Section>

      {roles.map((role) => (
        <Section
          key={role.id}
          title={`${role.name} · ${role.memberCount} member${role.memberCount === 1 ? '' : 's'}`}
        >
          <form action={savePermissions} className="flex flex-col gap-3">
            <input type="hidden" name="roleId" value={role.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSION_CATALOG.map((entry) => (
                <label
                  key={entry.key}
                  className="flex items-start gap-2 text-sm font-normal text-slate-700"
                >
                  <input
                    type="checkbox"
                    name={`perm:${entry.key}`}
                    defaultChecked={role.permissionKeys.includes(entry.key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-slate-900">{entry.key}</span>
                    <span className="block text-xs text-slate-500">{entry.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-normal text-slate-700 hover:bg-slate-100"
              >
                Save permissions
              </button>
            </div>
          </form>
        </Section>
      ))}
    </div>
  );
}
