/**
 * Envelope encryption for Moodle web service tokens.
 *
 * A Moodle token is a long-lived credential: whoever holds it can act as that
 * service account across the whole site. Storing it reversibly under a single key
 * means one key compromise exposes every instance at once, so each record gets
 * its own data key.
 *
 *   master key (env, versioned)
 *     └── wraps a per-record DEK (AES-256-GCM)
 *           └── encrypts the token
 *
 * `key_version` on the record is what makes rotation possible: the master key
 * can be swapped and records re-wrapped in the background, without touching the
 * payloads and without downtime.
 *
 * Column mapping, one row of `mcc.moodle_credentials`:
 *
 *   iv                 record IV
 *   secret_ciphertext  payload ciphertext
 *   auth_tag           payload authentication tag
 *   wrapped_dek        wrapped DEK || auth tag of the key wrap
 *
 * The master key never enters the database, and ciphertext never leaves it in a
 * readable form.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { AppError } from '@mcc/shared';
import { config } from '../config/configuration.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Injection token for the master key.
 *
 * A constructor parameter typed as `string` cannot be injected: Nest
 * would look for a provider for `String` and find none, failing the
 * whole application at startup. An explicit token is the correct form,
 * and it is what lets a test construct the service with a different
 * key.
 */
export const MASTER_KEY = Symbol('mcc:master-key');

export interface SealedSecret {
  readonly secretCiphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly wrappedDek: string;
  readonly keyVersion: number;
  /** Last four characters, so an operator can identify a stored token. */
  readonly last4: string;
}

@Injectable()
export class CryptoService {
  private readonly masterKey: Buffer;

  /**
   * The key arrives through the `MASTER_KEY` token rather than being
   * read from the environment directly, so a rotation test can
   * construct a service with a different key. The provider supplies
   * the configured value at runtime.
   */
  constructor(@Inject(MASTER_KEY) masterKeyBase64: string) {
    this.masterKey = Buffer.from(masterKeyBase64, 'base64');
    if (this.masterKey.length !== KEY_LENGTH) {
      // Guarded here as well as in the environment schema: a base64 string of
      // the wrong length would otherwise be accepted and fail on the first seal.
      throw new AppError({
        code: 'ENCRYPTION_KEY_MISSING',
        message: 'La clave maestra no tiene el tamaño esperado.',
      });
    }
  }

  /**
   * Derives the IV used to wrap the data key.
   *
   * Distinct from the payload IV on purpose. Reusing one IV across two ciphers is
   * only safe because the keys differ, and that is a property worth not relying
   * on: deriving a second IV from the record IV via HKDF makes the separation
   * structural, and keeps the row to the four columns the schema already has.
   */
  private wrapIv(recordIv: Buffer): Buffer {
    return Buffer.from(
      hkdfSync('sha256', recordIv, Buffer.alloc(0), Buffer.from('mcc:dek-wrap'), IV_LENGTH),
    );
  }

  /** Wraps `secret` with a fresh data key. */
  seal(secret: string): SealedSecret {
    if (secret.length === 0) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'El secreto a cifrar no puede estar vacío.',
      });
    }

    const iv = randomBytes(IV_LENGTH);
    const dek = randomBytes(KEY_LENGTH);

    const payloadCipher = createCipheriv(ALGORITHM, dek, iv);
    const ciphertext = Buffer.concat([
      payloadCipher.update(secret, 'utf8'),
      payloadCipher.final(),
    ]);
    const payloadTag = payloadCipher.getAuthTag();

    const keyCipher = createCipheriv(ALGORITHM, this.masterKey, this.wrapIv(iv));
    const wrappedDek = Buffer.concat([keyCipher.update(dek), keyCipher.final()]);
    const keyTag = keyCipher.getAuthTag();

    return {
      secretCiphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: payloadTag.toString('base64'),
      // One column for both halves: they are only ever read together, and a
      // separate column would let an operator update one and not the other.
      wrappedDek: Buffer.concat([wrappedDek, keyTag]).toString('base64'),
      keyVersion: config.MCC_MASTER_KEY_VERSION,
      last4: secret.slice(-4),
    };
  }

  /**
   * Reverses `seal`.
   *
   * Every failure returns `SECRET_DECRYPT_FAILED` with no detail about which
   * check failed: telling an attacker whether the key or the ciphertext was
   * wrong tells them which half of the attack worked.
   */
  open(sealed: SealedSecret): string {
    try {
      const iv = Buffer.from(sealed.iv, 'base64');
      const payloadTag = Buffer.from(sealed.authTag, 'base64');
      const packed = Buffer.from(sealed.wrappedDek, 'base64');
      const ciphertext = Buffer.from(sealed.secretCiphertext, 'base64');

      if (iv.length !== IV_LENGTH || payloadTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('malformed envelope');
      }
      if (packed.length !== KEY_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('malformed wrapped key');
      }

      const keyTag = packed.subarray(KEY_LENGTH);
      const wrappedDek = packed.subarray(0, KEY_LENGTH);

      const keyDecipher = createDecipheriv(ALGORITHM, this.masterKey, this.wrapIv(iv));
      keyDecipher.setAuthTag(keyTag);
      const dek = Buffer.concat([keyDecipher.update(wrappedDek), keyDecipher.final()]);

      const payloadDecipher = createDecipheriv(ALGORITHM, dek, iv);
      payloadDecipher.setAuthTag(payloadTag);
      return Buffer.concat([
        payloadDecipher.update(ciphertext),
        payloadDecipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new AppError({
        code: 'SECRET_DECRYPT_FAILED',
        message: 'No se pudo descifrar la credencial de Moodle.',
        remediation: {
          action: 'Vuelve a registrar el token del servicio en esta instancia',
          href: '/moodles',
        },
        context: { reason: error instanceof Error ? error.message : 'unknown' },
      });
    }
  }

  /**
   * Re-wraps a sealed secret under the current master key. Used by the rotation
   * job: the payload is decrypted and re-sealed, and only the wrapper changes.
   */
  rotate(sealed: SealedSecret): SealedSecret {
    return this.seal(this.open(sealed));
  }
}

/**
 * SHA-256 over a peppered value, for secrets that must be looked up by equality
 * but never recovered: refresh tokens, API keys, password reset tokens.
 *
 * Deliberately not scrypt: these are high-entropy random values, so there is
 * nothing to brute force and the lookup has to stay a single index probe.
 * Passwords are a different case and use the KDF in `@mcc/shared/node/password`.
 */
export function hashOpaqueToken(value: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex');
}
