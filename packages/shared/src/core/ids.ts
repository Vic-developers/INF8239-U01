/**
 * IDs, pagination and tenancy helpers shared across layers.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** PostgreSQL session variable that carries the active tenant for RLS. */
export const TENANT_SETTING = 'app.tenant_id';

/** Session variable carrying the actor, for audit triggers. */
export const ACTOR_SETTING = 'app.actor_id';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/** Opaque cursor: base64url of `{"createdAt":iso,"id":uuid}`. */
export interface Cursor {
  readonly createdAt: string;
  readonly id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as { createdAt?: unknown }).createdAt === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      const record = parsed as { createdAt: string; id: string };
      return { createdAt: record.createdAt, id: record.id };
    }
    return null;
  } catch {
    return null;
  }
}

export type SortDirection = 'asc' | 'desc';

export function clampLimit(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.trunc(value)), MAX_PAGE_SIZE);
}