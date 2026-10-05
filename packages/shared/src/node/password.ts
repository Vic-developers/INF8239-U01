/**
 * Password hashing.
 *
 * Lives under a separate subpath (`@mcc/shared/node/password`) because it
 * depends on Node's `crypto`. The browser bundle only imports the root entry
 * point, so none of this reaches the client.
 *
 * Algorithm: scrypt (RFC 7914) with explicit, versioned parameters.
 *
 * Why scrypt rather than Argon2id: both are memory-hard and acceptable, but
 * scrypt ships in Node's standard library, so there is no native module to
 * compile and no per-platform build failure in CI or in a customer's Docker
 * image. Argon2id remains the better choice where a native dependency is
 * acceptable, and the encoded format below is versioned precisely so it can be
 * swapped by re-hashing on next successful login.
 *
 * Stored format: `scrypt$N$r$p$<salt-b64>$<hash-b64>`. Parameters travel with
 * the hash, so raising N later does not invalidate existing credentials.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/**
 * N = 2^15, r = 8, p = 1 → ~32 MiB per hash.
 *
 * `maxmem` must be raised alongside N: Node's default cap is 32 MiB, which this
 * configuration sits exactly on, and a slightly different tuning would otherwise
 * fail at runtime instead of at boot.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 32_768, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAXMEM = 64 * 1024 * 1024;
const ALGORITHM = 'scrypt';

/**
 * Bcrypt-style work factor for the credential-stuffing case: hashing is the
 * cheapest part of a login, and a stolen hash table must be expensive to grind.
 */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...params,
    maxmem: MAXMEM,
  });

  return [
    ALGORITHM,
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false for any malformed input rather than throwing: a corrupt row must
 * read as "wrong password", not as a 500 that tells an attacker the account
 * exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6) return false;

  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  if (algorithm !== ALGORITHM) return false;
  if (rawN === undefined || rawR === undefined || rawP === undefined) return false;
  if (rawSalt === undefined || rawHash === undefined) return false;

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Guard the parameters themselves: a tampered hash must not be able to request
  // an unbounded memory allocation.
  if (N < 2 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  const salt = Buffer.from(rawSalt, 'base64');
  const expected = Buffer.from(rawHash, 'base64');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * True when a stored hash was produced with weaker parameters than the current
 * defaults. Callers re-hash on the next successful login, which upgrades
 * credentials gradually instead of requiring a reset campaign.
 */
export function needsRehash(stored: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6) return true;
  if (parts[0] !== ALGORITHM) return true;
  return Number(parts[1]) < params.N || Number(parts[2]) < params.r;
}
