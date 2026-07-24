import type { ReactNode } from 'react';

// Reference list pattern: a bordered rounded-xl card wrapping a table with a
// slate-50 header row and uppercase micro-labels.
export function DataTable({
  headers,
  rows,
  empty = 'None yet.',
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.length === 0 ? (
        <p className="p-6 text-sm font-normal text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="px-6 py-3 text-xs font-medium tracking-wider text-slate-500 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {row.map((cell, c) => (
                    <td key={c} className="px-6 py-3 align-middle font-normal text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
