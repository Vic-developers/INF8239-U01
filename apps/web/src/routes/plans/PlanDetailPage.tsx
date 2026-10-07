/**
 * Plan detail: preview → approve → watch.
 *
 * This screen carries the product's central rule: nothing reaches Moodle
 * without an explicit confirmation that the impact was reviewed. The
 * approve button is therefore gated on a preview having been run *and* on
 * there being no missing capabilities — an approval that would fail anyway
 * is not a confirmation, it is a coin flip.
 *
 * Execution is polled rather than streamed: the plan is the durable record,
 * so re-reading it is both simpler and honest about what the UI is showing.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Eye,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { PlanPreview } from '@mcc/shared';
import {
  useApprovePlan,
  useCancelPlan,
  usePlan,
  usePreviewPlan,
} from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TONE_VARIANT = {
  neutral: 'secondary',
  warning: 'warning',
  danger: 'destructive',
} as const;

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();

  const plan = usePlan(id);
  const preview = usePreviewPlan();
  const approve = useApprovePlan();
  const cancel = useCancelPlan();

  const [previewData, setPreviewData] = useState<PlanPreview | null>(null);

  if (plan.isPending) return <LoadingState label="Cargando plan…" />;
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />;

  const detail = plan.data;
  const status = detail.status;

  // A preview stored with the plan wins over a fresh one: it is the
  // impact the operator is being asked to approve, and a newer response
  // would silently change what they are confirming.
  const effectivePreview =
    previewData ??
    (detail.preview !== null ? (detail.preview as unknown as PlanPreview) : null);

  const canExecute = can('plans.execute');
  const canRead = can('plans.read');
  const isDraft = status === 'draft' || status === 'previewed';
  const canBeApproved = canExecute && (isDraft || status === 'awaiting_approval');
  const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status);

  const runPreview = async (): Promise<void> => {
    try {
      const result = await preview.mutateAsync(detail.id);
      setPreviewData(result);
    } catch {
      // Surfaced through `preview.isError` below.
    }
  };

  const onApprove = async (): Promise<void> => {
    try {
      await approve.mutateAsync(detail.id);
      setPreviewData(null);
    } catch {
      // Surfaced through `approve.isError` below.
    }
  };

  const onCancel = async (): Promise<void> => {
    try {
      await cancel.mutateAsync(detail.id);
    } catch {
      // Surfaced through `cancel.isError` below.
    }
  };

  const blocked = effectivePreview !== null && effectivePreview.missingCapabilities.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          to="/plans"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Planes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <ClipboardList className="size-5" aria-hidden />
              {detail.kind}
              <StatusBadge kind="plan" value={status} />
            </h1>
            <p className="text-sm text-muted-foreground">
              Creado {formatDistanceToNow(new Date(detail.createdAt), { addSuffix: true, locale: es })} ·
              origen {detail.origin}
            </p>
          </div>
          <div className="flex gap-2">
            {canRead ? (
              <Button
                variant="outline"
                pending={preview.isPending}
                disabled={isTerminal}
                onClick={() => void runPreview()}
              >
                <Eye aria-hidden />
                {effectivePreview !== null ? 'Revalidar vista previa' : 'Ejecutar vista previa'}
              </Button>
            ) : null}
            {!isTerminal ? (
              <Button
                variant="ghost"
                pending={cancel.isPending}
                disabled={!canExecute}
                onClick={() => void onCancel()}
              >
                <XCircle aria-hidden />
                Cancelar plan
              </Button>
            ) : null}
          </div>
        </div>
        {preview.isError ? (
          <div className="mt-3">
            <InlineError error={preview.error} />
          </div>
        ) : null}
        {cancel.isError ? (
          <div className="mt-3">
            <InlineError error={cancel.error} />
          </div>
        ) : null}
        {approve.isError ? (
          <div className="mt-3">
            <InlineError error={approve.error} />
          </div>
        ) : null}
      </div>

      {effectivePreview === null && !isTerminal ? (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa pendiente</CardTitle>
            <CardDescription>
              Este plan aún no ha sido clasificado contra la instancia. La vista previa es un
              simulacro: no escribe nada en Moodle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button pending={preview.isPending} onClick={() => void runPreview()}>
              Ejecutar vista previa
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {effectivePreview !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>Impacto previsto</CardTitle>
            <CardDescription>
              Clasificación de cada elemento contra el estado actual de Moodle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Count label="Total" value={effectivePreview.counts.total} />
              <Count label="Se creará" value={effectivePreview.counts.create} tone="success" />
              <Count label="Sin cambios" value={effectivePreview.counts.unchanged} />
              <Count
                label="Conflicto / error"
                value={effectivePreview.counts.conflict + effectivePreview.counts.error}
                tone={
                  effectivePreview.counts.conflict + effectivePreview.counts.error > 0
                    ? 'danger'
                    : 'neutral'
                }
              />
            </div>

            {effectivePreview.impactSummary.length > 0 ? (
              <ul className="space-y-1">
                {effectivePreview.impactSummary.map((line) => (
                  <li key={line.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{line.label}</span>
                    <Badge
                      variant={TONE_VARIANT[line.tone]}
                    >
                      {line.value}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}

            {effectivePreview.errors.length > 0 ? (
              <Alert variant="destructive">
                <p>{effectivePreview.errors.length} elemento(s) no se podrán aplicar:</p>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {effectivePreview.errors.slice(0, 8).map((error) => (
                    <li key={error.naturalKey}>
                      <span className="font-mono">{error.naturalKey}</span>: {error.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {effectivePreview.missingCapabilities.length > 0 ? (
              <Alert variant="warning">
                <p className="flex items-center gap-2">
                  <ShieldAlert className="size-4" aria-hidden />
                  Faltan capacidades en la cuenta del token: la aprobación está bloqueada.
                </p>
                <p className="mt-1 text-sm">
                  {effectivePreview.missingCapabilities.join(', ')}
                </p>
              </Alert>
            ) : effectivePreview.requiredCapabilities.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Capacidades requeridas: {effectivePreview.requiredCapabilities.join(', ')}
              </p>
            ) : null}

            {effectivePreview.estimatedDurationSeconds !== null ? (
              <p className="text-xs text-muted-foreground">
                Duración estimada al límite de tasa configurado:{' '}
                {Math.ceil(effectivePreview.estimatedDurationSeconds)} s.
              </p>
            ) : null}

            {effectivePreview.requiresRevalidation ? (
              <Alert variant="warning">
                <p>
                  Los datos de Moodle cambiaron después de esta vista previa. Vuelve a validarla
                  antes de aprobar.
                </p>
              </Alert>
            ) : null}

            {canBeApproved ? (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Al aprobar se encola un trabajo que modificará la instancia. Solo procede si has
                  revisado el impacto.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    pending={approve.isPending}
                    disabled={blocked}
                    onClick={() => void onApprove()}
                  >
                    <CheckCircle2 aria-hidden />
                    Aprobar y ejecutar
                  </Button>
                  {blocked ? (
                    <span className="text-xs font-medium text-warning">
                      Corrige los permisos del token antes de aprobar.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Elementos</CardTitle>
          <CardDescription>
            {detail.items.length} elemento(s) · estado registrado por el executor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clave</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Id en Moodle</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.items.map((item) => (
                <TableRow key={item.naturalKey}>
                  <TableCell className="font-mono text-xs">{item.naturalKey}</TableCell>
                  <TableCell className="text-muted-foreground">{item.targetType}</TableCell>
                  <TableCell>
                    <StatusBadge kind="item" value={item.state} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {item.moodleId ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-xs text-destructive">
                    {item.errorMessage ?? item.errorCode ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opciones y política</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {renderEntries('Opciones', detail.options)}
            {renderEntries('Política', detail.policy)}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Count({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const className =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  );
}

function renderEntries(title: string, values: Record<string, unknown>) {
  const entries = Object.entries(values);
  if (entries.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</dt>
      <dd className="mt-1 space-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{key}</span>
            <span className="font-mono text-xs">{String(value)}</span>
          </div>
        ))}
      </dd>
    </div>
  );
}
