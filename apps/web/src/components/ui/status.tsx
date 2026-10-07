/**
 * Status vocabulary.
 *
 * Backend values are mapped to a label and a tone in one place, so a status
 * the server adds cannot silently render as a bare grey string: an
 * unrecognised value falls back to an explicit "unknown" treatment rather
 * than being prettified into something that looks meaningful.
 *
 * The colours are semantic (success/warning/destructive), not decorative —
 * an operator should be able to scan a column without reading it.
 */

import type { VariantProps } from 'class-variance-authority';
import { Badge, type badgeVariants } from '@/components/ui/badge';

type Tone = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

interface Appearance {
  readonly label: string;
  readonly tone: Tone;
}

const PLAN_STATUS: Record<string, Appearance> = {
  draft: { label: 'Borrador', tone: 'secondary' },
  previewed: { label: 'Vista previa', tone: 'info' },
  awaiting_approval: { label: 'Esperando aprobación', tone: 'warning' },
  approved: { label: 'Aprobado', tone: 'info' },
  executing: { label: 'Ejecutando', tone: 'info' },
  completed: { label: 'Completado', tone: 'success' },
  completed_with_errors: { label: 'Completado con errores', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'secondary' },
  failed: { label: 'Fallido', tone: 'destructive' },
};

const ITEM_STATE: Record<string, Appearance> = {
  pending: { label: 'Pendiente', tone: 'secondary' },
  running: { label: 'En curso', tone: 'info' },
  done: { label: 'Hecho', tone: 'success' },
  failed: { label: 'Fallido', tone: 'destructive' },
  skipped: { label: 'Omitido', tone: 'secondary' },
  conflict: { label: 'Conflicto', tone: 'warning' },
  unknown: { label: 'Desconocido', tone: 'warning' },
};

const INSTANCE_STATUS: Record<string, Appearance> = {
  active: { label: 'Activo', tone: 'success' },
  disabled: { label: 'Desactivado', tone: 'secondary' },
  error: { label: 'Con errores', tone: 'destructive' },
  probing: { label: 'Sondeando', tone: 'info' },
  unknown: { label: 'Sin verificar', tone: 'secondary' },
};

/** Preview classifications — deliberately a separate vocabulary from item state. */
const CLASSIFICATION: Record<string, Appearance> = {
  create: { label: 'Se creará', tone: 'success' },
  update: { label: 'Se actualizará', tone: 'info' },
  unchanged: { label: 'Sin cambios', tone: 'secondary' },
  skipped: { label: 'Omitido', tone: 'secondary' },
  conflict: { label: 'Conflicto', tone: 'warning' },
  error: { label: 'Error', tone: 'destructive' },
};

const REGISTRIES = {
  plan: PLAN_STATUS,
  item: ITEM_STATE,
  instance: INSTANCE_STATUS,
  classification: CLASSIFICATION,
} as const;

export type StatusKind = keyof typeof REGISTRIES;

const UNKNOWN: Appearance = { label: 'Desconocido', tone: 'secondary' };

export function statusAppearance(kind: StatusKind, value: string): Appearance {
  return REGISTRIES[kind][value] ?? { ...UNKNOWN, label: value };
}

/**
 * The chart colour for a status, as a theme-following CSS value.
 *
 * Recharts takes literal colours, and hard-coding hex would divorce the
 * chart from the palette the rest of the screen uses — including the dark
 * theme, where a fixed hex is almost always wrong. `hsl(var(--x))` is
 * resolved by the browser, so the chart tracks the tokens for free.
 */
const TONE_COLORS: Record<Tone, string> = {
  default: 'hsl(var(--primary))',
  secondary: 'hsl(var(--muted-foreground))',
  outline: 'hsl(var(--foreground))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  info: 'hsl(var(--info))',
};

export function statusColor(kind: StatusKind, value: string): string {
  return TONE_COLORS[statusAppearance(kind, value).tone];
}

export function StatusBadge({
  kind,
  value,
  className,
}: {
  kind: StatusKind;
  value: string;
  className?: string;
}) {
  const { label, tone } = statusAppearance(kind, value);
  const known = REGISTRIES[kind][value] !== undefined;
  return (
    <Badge variant={tone} className={className} data-unknown={!known || undefined}>
      {label}
    </Badge>
  );
}
