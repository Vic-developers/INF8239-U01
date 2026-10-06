/**
 * Envelope encryption tests.
 *
 * These matter more than most unit tests in the repo: a broken seal that throws
 * is visible, but a broken open that returns the wrong plaintext, or a tamper
 * that goes undetected, is a credential leak with no symptom.
 *
 * `test/setup-env.ts` supplies the environment before this file is imported,
 * because the configuration module validates on import.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@mcc/shared';
import { CryptoService, hashOpaqueToken } from './crypto.service.js';

describe('envelope encryption', () => {
  const service = new CryptoService(randomBytes(32).toString('base64'));

  it('round-trips a token', () => {
    expect(service.open(service.seal('moodle-token-abc123'))).toBe('moodle-token-abc123');
  });

  it('round-trips a token containing non-ASCII characters', () => {
    const token = 'ñandú-contraseña-🔐-секрет';
    expect(service.open(service.seal(token))).toBe(token);
  });

  it('round-trips a token long enough to span several AES blocks', () => {
    const token = 'x'.repeat(5000);
    expect(service.open(service.seal(token))).toBe(token);
  });

  it('never stores the plaintext anywhere in the record', () => {
    const sealed = service.seal('super-secret-token');

    expect(JSON.stringify(sealed)).not.toContain('super-secret-token');
    expect(sealed.last4).toBe('oken');
  });

  it('produces a different envelope every time for the same input', () => {
    // A repeated ciphertext would mean a repeated IV, which would leak that two
    // tenants hold the same token.
    const a = service.seal('identical');
    const b = service.seal('identical');

    expect(a.secretCiphertext).not.toBe(b.secretCiphertext);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
    expect(service.open(a)).toBe('identical');
    expect(service.open(b)).toBe('identical');
  });

  it('rejects a tampered ciphertext', () => {
    const sealed = service.seal('original-value');
    expect(() => service.open({ ...sealed, secretCiphertext: flip(sealed.secretCiphertext) })).toThrow(
      AppError,
    );
  });

  it('rejects a tampered authentication tag', () => {
    const sealed = service.seal('original-value');
    expect(() => service.open({ ...sealed, authTag: flip(sealed.authTag) })).toThrow(AppError);
  });

  it('rejects a tampered wrapped key', () => {
    const sealed = service.seal('original-value');
    expect(() => service.open({ ...sealed, wrappedDek: flip(sealed.wrappedDek) })).toThrow(AppError);
  });

  it('reports a malformed envelope without saying which part is wrong', () => {
    const sealed = service.seal('original-value');

    // The message must be identical whatever is broken: which check failed is
    // exactly what an attacker probing the envelope wants to learn.
    const failures = [
      capture(() => service.open({ ...sealed, iv: 'AAAA' })),
      capture(() => service.open({ ...sealed, authTag: 'AAAA' })),
      capture(() => service.open({ ...sealed, wrappedDek: 'AAAA' })),
      capture(() => service.open({ ...sealed, secretCiphertext: '' })),
      capture(() => service.open({ ...sealed, iv: '' })),
    ];

    for (const failure of failures) {
      expect(failure.code).toBe('SECRET_DECRYPT_FAILED');
      expect(failure.message).toBe('No se pudo descifrar la credencial de Moodle.');
    }
  });

  it('refuses to seal an empty secret', () => {
    expect(() => service.seal('')).toThrow(AppError);
  });

  it('refuses a master key of the wrong length', () => {
    expect(() => new CryptoService(randomBytes(16).toString('base64'))).toThrow(AppError);
  });

  it('re-wraps under a fresh envelope while keeping the plaintext', () => {
    const first = service.seal('rotate-me');
    const rotated = service.rotate(first);

    expect(rotated.wrappedDek).not.toBe(first.wrappedDek);
    expect(rotated.iv).not.toBe(first.iv);
    expect(service.open(rotated)).toBe('rotate-me');
    // The old envelope still opens under the original key: rotation is additive,
    // so records can be re-wrapped in the background without a cutover moment.
    expect(service.open(first)).toBe('rotate-me');
  });

  it('cannot open an envelope sealed under a different master key', () => {
    const sealed = service.seal('cross-key');
    const other = new CryptoService(randomBytes(32).toString('base64'));

    expect(() => other.open(sealed)).toThrow(AppError);
  });
});

describe('hashOpaqueToken', () => {
  it('produces the same hash for the same value and pepper', () => {
    expect(hashOpaqueToken('token', 'pepper')).toBe(hashOpaqueToken('token', 'pepper'));
  });

  it('produces a different hash under a different pepper', () => {
    // Without this, a stolen token table would be directly usable, because the
    // pepper is what makes the stored hash useless on its own.
    expect(hashOpaqueToken('token', 'pepper-a')).not.toBe(hashOpaqueToken('token', 'pepper-b'));
  });

  it('cannot be reversed by containing the input', () => {
    expect(hashOpaqueToken('token-value', 'pepper')).not.toContain('token-value');
  });

  it('does not collide on trivially different inputs', () => {
    // Concatenation without a separator would make `ab`+`c` and `a`+`bc` equal.
    expect(hashOpaqueToken('ab', 'c')).not.toBe(hashOpaqueToken('a', 'bc'));
  });
});

function flip(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytes.toString('base64');
}

function capture(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw new Error(`Expected an AppError, received ${String(error)}.`);
  }
  throw new Error('Expected the operation to fail.');
}
