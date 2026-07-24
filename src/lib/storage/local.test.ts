import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorage } from './local';

describe('LocalStorage', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jjstore-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('STORE-001: put/get/delete roundtrip with nested keys', async () => {
    const s = new LocalStorage(dir);
    await s.put('org/lead/abc.txt', Buffer.from('hello world'));
    const got = await s.get('org/lead/abc.txt');
    expect(got?.toString()).toBe('hello world');

    await s.delete('org/lead/abc.txt');
    expect(await s.get('org/lead/abc.txt')).toBeNull();
  });

  it('STORE-002: get returns null for a missing object', async () => {
    const s = new LocalStorage(dir);
    expect(await s.get('nope')).toBeNull();
  });

  it('STORE-003: rejects keys that escape the base directory', async () => {
    const s = new LocalStorage(dir);
    await expect(s.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
  });
});
