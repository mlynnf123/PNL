import { describe, expect, it } from 'vitest';
import { Logger, describeError, instrument, redact } from './logger';

function collector() {
  const lines: string[] = [];
  const logger = new Logger({
    minLevel: 'debug',
    sink: (line) => lines.push(line),
    now: () => new Date('2026-07-22T00:00:00.000Z'),
    base: { service: 'test' },
  });
  const entries = () => lines.map((l) => JSON.parse(l));
  return { logger, entries };
}

describe('redact', () => {
  it('LOG-001: replaces sensitive keys anywhere in the tree', () => {
    const out = redact({
      email: 'a@b.com',
      passwordHash: 'scrypt$abc',
      nested: { token: 'xyz', ok: 1 },
      list: [{ secret: 's' }],
    }) as Record<string, unknown>;

    expect(out.email).toBe('a@b.com');
    expect(out.passwordHash).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).token).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect((out.list as Array<Record<string, unknown>>)[0].secret).toBe('[redacted]');
  });
});

describe('Logger', () => {
  it('LOG-002: emits one structured JSON line with time, level, msg, and base fields', () => {
    const { logger, entries } = collector();
    logger.info('job.created', { jobId: 'j1' });

    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toEqual({
      time: '2026-07-22T00:00:00.000Z',
      level: 'info',
      msg: 'job.created',
      service: 'test',
      jobId: 'j1',
    });
  });

  it('LOG-003: filters below the minimum level', () => {
    const lines: string[] = [];
    const logger = new Logger({ minLevel: 'warn', sink: (l) => lines.push(l) });
    logger.debug('nope');
    logger.info('also nope');
    logger.warn('yes');
    logger.error('yes');
    expect(lines).toHaveLength(2);
  });

  it('LOG-004: child loggers carry context without mutating the parent', () => {
    const { logger, entries } = collector();
    const scoped = logger.child({ correlationId: 'c1' });
    scoped.info('scoped');
    logger.info('unscoped');

    expect(entries()[0].correlationId).toBe('c1');
    expect(entries()[1].correlationId).toBeUndefined();
  });

  it('LOG-005: redacts sensitive fields on the emitted line', () => {
    const { logger, entries } = collector();
    logger.info('login', { email: 'a@b.com', password: 'hunter2' });
    expect(entries()[0].password).toBe('[redacted]');
    expect(entries()[0].email).toBe('a@b.com');
  });
});

describe('instrument', () => {
  it('LOG-006: logs op.ok with a duration and returns the result', async () => {
    const { logger, entries } = collector();
    const result = await instrument('report.export', { reportKey: 'x' }, async () => 42, logger);

    expect(result).toBe(42);
    expect(entries()[0].msg).toBe('report.export.ok');
    expect(typeof entries()[0].durationMs).toBe('number');
  });

  it('LOG-007: logs op.failed with the error and rethrows', async () => {
    const { logger, entries } = collector();
    await expect(
      instrument('report.export', { reportKey: 'x' }, async () => {
        throw new Error('boom');
      }, logger),
    ).rejects.toThrow('boom');

    expect(entries()[0].msg).toBe('report.export.failed');
    expect((entries()[0].error as { message: string }).message).toBe('boom');
  });
});

describe('describeError', () => {
  it('LOG-008: captures name and message for an Error', () => {
    const info = describeError(new TypeError('bad'));
    expect(info.name).toBe('TypeError');
    expect(info.message).toBe('bad');
  });
});
