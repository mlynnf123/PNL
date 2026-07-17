// Sign-flip on the decimal string itself — never round-trip money through a
// JS number, even for something as simple as negation.
export function negateDecimalString(value: string): string {
  return value.startsWith('-') ? value.slice(1) : `-${value}`;
}

// Forces a decimal string negative regardless of how it was entered — for a
// return/credit amount, which a user always types as a positive magnitude.
export function toNegativeDecimalString(value: string): string {
  return value.startsWith('-') ? value : `-${value}`;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
