// docs/05 S4/S6: a "Sales Rep" cell such as "Ian/Justin" or "Ian/ Meranda"
// names more than one person and must never be collapsed to a single seller.
// This splits the raw string into candidate name tokens and reports whether the
// result is ambiguous (more than one) so the caller can raise an assignment
// exception rather than pick one.

export interface RepSplit {
  raw: string | null;
  tokens: string[];
  empty: boolean;
  ambiguous: boolean;
}

const SEPARATORS = /[/,&]/;

export function splitReps(raw: string | null): RepSplit {
  const trimmed = raw?.trim() ?? '';
  if (trimmed.length === 0 || trimmed === '-') {
    return { raw, tokens: [], empty: true, ambiguous: false };
  }

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of trimmed.split(SEPARATORS)) {
    const token = part.trim();
    if (token.length === 0 || token === '-') {
      continue;
    }
    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }

  return {
    raw,
    tokens,
    empty: tokens.length === 0,
    ambiguous: tokens.length > 1,
  };
}
