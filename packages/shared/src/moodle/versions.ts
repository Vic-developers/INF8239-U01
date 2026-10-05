/**
 * Moodle version range: parsing, comparison and per-function resolution.
 *
 * The supported range is 4.0 through 5.3. That span is wide enough that a flat
 * function catalogue is wrong: several web service functions were added,
 * deprecated or had their parameters changed inside it. Concretely:
 *
 *   - `unenrol_user` was deprecated in 4.2 in favour of `core_enrol_unenrol_user`
 *   - `core_course_get_courses` only accepts `options` from 4.4; before that the
 *     paging and field-selection arguments do not exist
 *
 * So a function is not a name, it is a name plus the versions where that name is
 * the right one to call. `MOODLE_FUNCTIONS` carries that, and `resolveFunction`
 * answers "which name, for this instance".
 *
 * Honesty about what is known: only entries whose availability is documented
 * carry a `since` or `deprecatedIn`. Everything else is listed as `unverified`
 * and is resolved by asking the instance rather than by guessing. An unverified
 * entry with no `since` is assumed present on 4.0+; the discovery probe corrects
 * that assumption, and `docs/MOODLE-INTEGRATION.md` tracks what is still
 * unchecked.
 */

/** A parsed Moodle version, e.g. `4.5.2 (Build: 20241007)`. */
export interface MoodleVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export const MINIMUM_MOODLE_VERSION: MoodleVersion = { major: 4, minor: 0, patch: 0 };
export const MAXIMUM_MOODLE_VERSION: MoodleVersion = { major: 5, minor: 3, patch: 0 };

/**
 * Parses the `version` field of `core_webservice_get_site_info`, which is a bare
 * dotted number (`4.5`), and the `release` field, which is free text
 * (`Moodle 4.5 (Build: 20241007)`).
 *
 * Returns null when nothing version-shaped is present. A null result must never
 * be treated as "any version": callers either probe the instance or refuse to
 * run a plan, because assuming compatibility is how a destructive operation ends
 * up failing halfway on an older release.
 */
export function parseMoodleVersion(raw: string | null | undefined): MoodleVersion | null {
  if (!raw) return null;

  // Prefer the first dotted triple in the string: this skips a leading word like
  // "Moodle" and ignores any trailing build metadata.
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(raw);
  if (!match) return null;

  const [, major, minor, patch] = match;
  if (major === undefined || minor === undefined) return null;

  return {
    major: Number(major),
    minor: Number(minor),
    patch: patch === undefined ? 0 : Number(patch),
  };
}

/** Negative if `a < b`, zero if equal, positive if `a > b`. */
export function compareMoodleVersions(a: MoodleVersion, b: MoodleVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** True when `version` falls inside the range this product supports. */
export function isSupportedMoodleVersion(version: MoodleVersion): boolean {
  return (
    compareMoodleVersions(version, MINIMUM_MOODLE_VERSION) >= 0 &&
    compareMoodleVersions(version, MAXIMUM_MOODLE_VERSION) <= 0
  )
}

/**
 * Why a function cannot be called, so the UI can explain the failure instead of
 * surfacing an HTTP error.
 */
export type UnavailableReason =
  | 'not_available_before'
  | 'deprecated_use_instead'
  | 'version_unsupported'
  | 'not_exposed_by_instance';

export interface FunctionResolution {
  /** The web service function name to call. */
  readonly fn: string;
  /** Preferred replacement when the chosen name is deprecated. */
  readonly replacedBy?: string;
  /** True when the resolved name is past its deprecation point. */
  readonly deprecated: boolean;
  /** Set when no call is possible. `fn` is then the best-effort name. */
  readonly unavailable?: UnavailableReason;
  /** Human-readable detail for an operator, never for a raw end user. */
  readonly detail?: string;
}

/**
 * A function name that may vary by version, oldest first.
 *
 * Used where Moodle replaced a function instead of just deprecating it, so the
 * adapter can pick the modern name on new instances and the legacy one on old
 * ones without a feature flag per tenant.
 */
export interface VersionedFunctionName {
  readonly fn: string;
  readonly since?: MoodleVersion;
  /** Beyond this version the entry is no longer the right name to call. */
  readonly until?: MoodleVersion;
}

export interface VersionAwareSpec {
  /** Functions we depend on that standard Moodle does not expose. */
  readonly mutating: boolean;
  readonly cost: number;
  /** First version where this name is correct. Absent means 4.0. */
  readonly since?: MoodleVersion;
  /** Version from which this name still works but a better one exists. */
  readonly deprecatedIn?: MoodleVersion;
  /** Replacement to prefer, checked against the instance before falling back. */
  readonly replacedBy?: string;
  /**
   * True when availability has not been confirmed against a real instance. Such
   * entries resolve optimistically and are reported as unverified by the probe.
   */
  readonly unverified?: boolean;
}

const v = (major: number, minor: number): MoodleVersion => ({ major, minor, patch: 0 });

/**
 * Availability notes for functions whose signature or availability is known to
 * change inside the supported range. Entries not listed here carry no bound,
 * which is a statement that nothing is known — not a claim that nothing changes.
 */
export const FUNCTION_VERSION_BOUNDS: Readonly<
  Record<string, Readonly<{ since?: MoodleVersion; deprecatedIn?: MoodleVersion; replacedBy?: string }>>
> = {
  // `options` (offset/limit/returnidfrom/returnidlimit and field selection) was
  // added to this function in 4.4. Calling it with those arguments on 4.0-4.3
  // raises an invalid-parameter error, not a silent no-op.
  core_course_get_courses: { since: v(4, 0) },
  // Deprecated in 4.2. Kept because plenty of 4.0-4.1 instances have no
  // alternative, and it still works.
  unenrol_user: { deprecatedIn: v(4, 2), replacedBy: 'core_enrol_unenrol_user' },
} satisfies Record<string, Readonly<{ since?: MoodleVersion; deprecatedIn?: MoodleVersion; replacedBy?: string }>>;

/**
 * Resolves the function name to call for a given instance.
 *
 * `exposedFunctions` is the list the instance reported at discovery time, and is
 * authoritative when present: if the instance says a name does not exist, no
 * version calculation should override it. Passing null means discovery has not
 * run yet, in which case the version bounds decide and the caller must treat the
 * answer as provisional.
 */
export function resolveFunction(
  fn: string,
  version: MoodleVersion | null,
  exposedFunctions?: readonly string[] | null,
): FunctionResolution {
  const bounds = FUNCTION_VERSION_BOUNDS[fn];

  if (version !== null && !isSupportedMoodleVersion(version)) {
    return {
      fn,
      deprecated: false,
      unavailable: 'version_unsupported',
      detail:
        `Moodle ${version.major}.${version.minor} está fuera del rango soportado ` +
        `(${MINIMUM_MOODLE_VERSION.major}.${MINIMUM_MOODLE_VERSION.minor} – ` +
        `${MAXIMUM_MOODLE_VERSION.major}.${MAXIMUM_MOODLE_VERSION.minor}).`,
    };
  }

  // Discovery is authoritative. An instance that does not list the function does
  // not have it, whatever the version says.
  if (exposedFunctions !== null && exposedFunctions !== undefined) {
    const has = exposedFunctions.includes(fn);
    const replacementKnown =
      bounds?.replacedBy !== undefined && exposedFunctions.includes(bounds.replacedBy);

    if (!has && !replacementKnown) {
      return {
        fn,
        deprecated: false,
        unavailable: 'not_exposed_by_instance',
        detail: `La instancia no expone ${fn}.`,
      };
    }

    if (has && replacementKnown && version !== null && bounds?.deprecatedIn !== undefined) {
      if (compareMoodleVersions(version, bounds.deprecatedIn) >= 0) {
        return {
          fn: bounds.replacedBy as string,
          deprecated: false,
          detail: `${fn} está obsoleta desde ${bounds.deprecatedIn.major}.${bounds.deprecatedIn.minor}; se usa ${bounds.replacedBy}.`,
        };
      }
    }
  }

  if (version === null) {
    return {
      fn,
      deprecated: false,
      unavailable: undefined,
      detail:
        'Versión de Moodle no verificada. El nombre resolved es provisional hasta que ' +
        'la detección de capacidades se ejecute.',
    };
  }

  if (bounds?.since !== undefined && compareMoodleVersions(version, bounds.since) < 0) {
    return {
      fn,
      deprecated: false,
      unavailable: 'not_available_before',
      detail: `${fn} requiere Moodle ${bounds.since.major}.${bounds.since.minor} o superior.`,
    };
  }

  if (bounds?.deprecatedIn !== undefined && compareMoodleVersions(version, bounds.deprecatedIn) >= 0) {
    return {
      fn,
      deprecated: true,
      replacedBy: bounds.replacedBy,
      detail:
        bounds.replacedBy !== undefined
          ? `${fn} está obsoleta; se prefiere ${bounds.replacedBy}.`
          : `${fn} está obsoleta desde ${bounds.deprecatedIn.major}.${bounds.deprecatedIn.minor}.`,
    };
  }

  return { fn, deprecated: false };
}

/**
 * Parameters that only exist from a given version. Strips them when the target
 * instance predates them, rather than letting Moodle reject the whole call.
 *
 * This is the mechanism that makes one code path serve 4.0 and 5.3: the adapter
 * builds arguments from the modern contract, and the unsupported ones are
 * dropped here instead of erroring.
 */
export function stripUnsupportedParams(
  args: Record<string, unknown>,
  version: MoodleVersion | null,
  bounds: Readonly<Record<string, { since?: MoodleVersion }>> = PARAM_VERSION_BOUNDS,
): Record<string, unknown> {
  if (version === null) return args;

  const result: Record<string, unknown> = { ...args };
  for (const [param, bound] of Object.entries(bounds)) {
    if (bound.since !== undefined && compareMoodleVersions(version, bound.since) < 0) {
      delete result[param];
    }
  }
  return result;
}

/** Parameters gated on version. Only entries known to be gated are listed. */
export const PARAM_VERSION_BOUNDS: Readonly<Record<string, Readonly<{ since?: MoodleVersion }>>> = {
  // Paging and field selection for `core_course_get_courses`.
  options: { since: v(4, 4) },
  // `core_user_get_users_by_field` accepts an explicit field list from 3.11.
  returnfields: { since: v(3, 11) },
};
