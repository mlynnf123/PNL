// Minimal CSV serializer for report exports — quotes any field containing a
// comma, quote, or newline, doubling embedded quotes per RFC 4180. Headers
// come from the first row's own keys, so every report just returns plain
// objects and this stays report-agnostic.
export function rowsToCsv(rows: unknown[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0] as Record<string, unknown>);

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape((row as Record<string, unknown>)[h])).join(',')),
  ];

  return lines.join('\n');
}
