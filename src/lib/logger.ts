import { randomUUID } from 'node:crypto';

// docs/06 SS14 definition-of-done ("Observability: structured operational
// logging and failure path covered") and docs/02 SS10. One structured JSON line
// per event, with sensitive keys redacted so a log stream never leaks a
// password hash, token, or secret (.claude/rules/security-audit.md).

// One id per request/action, shared between the operational log line and the
// audit event's correlation_id so the two can be tied together.
export function newCorrelationId(): string {
  return randomUUID();
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Keys whose values are replaced with a placeholder wherever they appear.
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|hash|credential/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 6;

export type LogFields = Record<string, unknown>;

export interface LoggerOptions {
  minLevel?: LogLevel;
  // Where a formatted line goes. Default: stdout. Tests inject a collector.
  sink?: (line: string) => void;
  // Injectable clock so tests get a deterministic timestamp.
  now?: () => Date;
  base?: LogFields;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

export function describeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Stack is operational detail, not for production log noise.
      ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }),
    };
  }
  return { message: String(error) };
}

export class Logger {
  private readonly minLevel: number;
  private readonly sink: (line: string) => void;
  private readonly now: () => Date;
  private readonly base: LogFields;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = LEVEL_ORDER[options.minLevel ?? 'info'];
    this.sink = options.sink ?? ((line) => process.stdout.write(`${line}\n`));
    this.now = options.now ?? (() => new Date());
    this.base = options.base ?? {};
  }

  // Returns a logger that carries extra context (e.g. a correlation id) on
  // every line, without mutating the parent.
  child(fields: LogFields): Logger {
    return new Logger({
      minLevel: numberToLevel(this.minLevel),
      sink: this.sink,
      now: this.now,
      base: { ...this.base, ...fields },
    });
  }

  log(level: LogLevel, msg: string, fields: LogFields = {}): void {
    if (LEVEL_ORDER[level] < this.minLevel) {
      return;
    }
    const entry = {
      time: this.now().toISOString(),
      level,
      msg,
      ...(redact({ ...this.base, ...fields }) as LogFields),
    };
    this.sink(JSON.stringify(entry));
  }

  debug(msg: string, fields?: LogFields): void {
    this.log('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.log('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.log('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.log('error', msg, fields);
  }
}

function numberToLevel(n: number): LogLevel {
  return (Object.keys(LEVEL_ORDER) as LogLevel[]).find((k) => LEVEL_ORDER[k] === n) ?? 'info';
}

export const logger = new Logger({
  minLevel: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
  base: { service: 'jj-roofing' },
});

// Wraps an operation with start/success/failure logging and a duration, tagged
// with whatever context (correlation id, actor, entity) the caller passes. The
// failure path logs the error and rethrows — it never swallows.
export async function instrument<T>(
  op: string,
  fields: LogFields,
  fn: () => Promise<T>,
  log: Logger = logger,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    log.info(`${op}.ok`, { ...fields, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    log.error(`${op}.failed`, {
      ...fields,
      durationMs: Date.now() - startedAt,
      error: describeError(error),
    });
    throw error;
  }
}
