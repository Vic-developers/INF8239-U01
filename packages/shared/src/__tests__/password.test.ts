import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRYPT_PARAMS,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../node/password.js';

// Deliberately expensive (~32 MiB per call), so the suite stays small.
describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('Correct horse battery staple', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('salts each hash, so equal passwords never produce equal rows', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);

    expect(a).not.toBe(b);
    await expect(verifyPassword('same-password', a)).resolves.toBe(true);
    await expect(verifyPassword('same-password', b)).resolves.toBe(true);
  });

  it('never stores the password in the encoded value', async () => {
    const stored = await hashPassword('hunter2-hunter2');
    expect(stored).not.toContain('hunter2');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('treats a malformed or foreign hash as a failed login, not an error', async () => {
    for (const garbage of ['', 'not-a-hash', 'scrypt$1$2$3', 'bcrypt$10$x$y$a$b', 'scrypt$a$b$c$d$e']) {
      await expect(verifyPassword('anything', garbage)).resolves.toBe(false);
    }
  });

  it('refuses parameters that would allocate unbounded memory', async () => {
    // A tampered row must not be able to request a 1 TiB allocation.
    const tampered = `scrypt$${2 ** 25}$8$1$${randomUUID()}$${randomUUID()}`;
    await expect(verifyPassword('anything', tampered)).resolves.toBe(false);
  });

  it('flags hashes weaker than the current defaults for rehashing', async () => {
    const weak = await hashPassword('legacy-password', { N: 1024, r: 8, p: 1 });
    expect(needsRehash(weak)).toBe(true);

    const current = await hashPassword('modern-password', DEFAULT_SCRYPT_PARAMS);
    expect(needsRehash(current)).toBe(false);
  });

  it('normalises unicode so equivalent inputs behave identically', async () => {
    // NFC and NFD forms of the same accented name must not be two passwords.
    const composed = await hashPassword('José Muñoz');
    await expect(verifyPassword('José Muñoz', composed)).resolves.toBe(true);
  });
});
