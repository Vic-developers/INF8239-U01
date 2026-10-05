/**
 * `LmsAdapter` port.
 *
 * Every LMS integration sits behind this interface. Application services depend
 * on the port, never on the Moodle web service client, which is what keeps
 * controllers free of integration detail and makes a future Canvas or
 * Blackboard adapter a drop-in addition.
 *
 * The interface is deliberately thin: it mirrors HTTP-call semantics rather
 * than domain semantics. Domain operations live in `MoodleService` on top of
 * this port, so a new LMS only needs to translate function calls.
 */

import type { MoodleSiteInfo } from './functions.js';

export interface MoodleInstanceConfig {
  readonly instanceId: string;
  readonly url: string;
  /** Decrypted token. Never logged, never returned by the API. */
  readonly token: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly rateLimitProfileName: string;
}

/** Options passed to every call. */
export interface CallOptions {
  /** Weight for the rate limiter; higher cost consumes more budget. */
  readonly cost?: number;
  /** Errors that are expected outcomes, not faults (e.g. already enrolled). */
  readonly expectError?: readonly string[];
  /** Suppresses the audit log for high-frequency reads inside a plan. */
  readonly quiet?: boolean;
}

export interface CapabilityProbeResult {
  readonly granted: readonly string[];
  readonly denied: readonly string[];
  /** True when the plugin function was unreachable, so nothing can be denied. */
  readonly probeAvailable: boolean;
}

/**
 * Raw web service port. Rate limiting, retries, circuit breaking, error
 * mapping and auditing are implemented once by the caller of this interface,
 * so adapters stay pure translation.
 */
export interface LmsAdapter {
  readonly provider: 'moodle';

  /** Site info: version, release, available functions. Cheap, cached. */
  getSiteInfo(options?: CallOptions): Promise<MoodleSiteInfo>;

  /**
   * Invoke a web service function by its fully-qualified name.
   * Throws `AppError` with a `MOODLE_*` code on failure.
   */
  call<TResponse>(
    fn: string,
    args: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<TResponse>;

  /**
   * Effective capabilities of the token account. Falls back to an empty probe
   * when `local_moodlecontrolcenter` is not installed.
   */
  probeCapabilities(options?: CallOptions): Promise<CapabilityProbeResult>;
}