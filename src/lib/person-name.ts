// The single shown name for a person-or-company record: the company if there is
// one, otherwise "First Last". Used everywhere the app stores/displays a name so
// the structured fields (first/last/company) stay the source of truth.
export function displayNameFrom(opts: {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}): string {
  const company = opts.company?.trim();
  if (company) return company;
  return [opts.firstName?.trim(), opts.lastName?.trim()].filter(Boolean).join(' ');
}
