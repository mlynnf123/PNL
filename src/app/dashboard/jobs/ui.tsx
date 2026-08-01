export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-normal text-slate-500">{label}</p>
      <p className="font-normal text-slate-900">${value}</p>
    </div>
  );
}

export function NoAccessNotice() {
  return (
    <p className="text-sm font-normal text-slate-600">
      You don&apos;t have access to view this yet. Ask an owner to grant you access.
    </p>
  );
}

const STATUS_PILL_TONE_CLASSES = {
  strong: 'bg-slate-900 text-white',
  medium: 'bg-slate-200 text-slate-700',
  soft: 'border border-slate-200 bg-slate-100 text-slate-500',
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
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-[550] tracking-[0.015em] text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

export function RowTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm font-normal text-slate-600">None yet.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-slate-600">
          {headers.map((h) => (
            <th key={h} className="px-2 py-2 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            {row.map((cell, j) => (
              <td key={j} className="px-2 py-2 font-normal text-slate-900">
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
    <label className="flex flex-col gap-1 text-xs text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
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
    <label className="flex flex-col gap-1 text-xs text-slate-700">
      {label}
      <select
        name={name}
        required
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
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
    <label className="flex flex-col gap-1 text-xs text-slate-700">
      {label}
      <select
        name={name}
        required
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
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
      className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
    >
      {children}
    </button>
  );
}

export function SmallButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-normal text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
