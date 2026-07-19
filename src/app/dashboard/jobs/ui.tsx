export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="font-normal text-zinc-900 dark:text-zinc-50">${value}</p>
    </div>
  );
}

export function NoAccessNotice() {
  return (
    <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
      You don&apos;t have access to view this yet. Ask an owner to grant you access.
    </p>
  );
}

const STATUS_PILL_TONE_CLASSES = {
  strong: 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900',
  medium: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  soft: 'border border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400',
} as const;

export function StatusPill({
  tone,
  children,
}: {
  tone: keyof typeof STATUS_PILL_TONE_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-normal ${STATUS_PILL_TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 dark:border-zinc-800 dark:from-zinc-950 dark:to-black">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</h3>
      {children}
    </div>
  );
}

export function RowTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">None yet.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {headers.map((h) => (
            <th key={h} className="px-2 py-2 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
            {row.map((cell, j) => (
              <td key={j} className="px-2 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  step,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
      {label}
      <select
        name={name}
        required
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function UserSelectField({
  label,
  name,
  users,
}: {
  label: string;
  name: string;
  users: { id: string; displayName: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
      {label}
      <select
        name={name}
        required
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
    >
      {children}
    </button>
  );
}

export function SmallButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}
