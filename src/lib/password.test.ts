import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the correct password against its hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a different hash for the same password on each call', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');
    expect(first).not.toBe(second);
  });

  it('rejects a malformed stored hash', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-hash')).resolves.toBe(false);
  });
});
