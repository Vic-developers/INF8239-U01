/**
 * Plan list.
 *
 * Plans are the unit of work in this product, so this screen answers one
 * question first: what is stuck. A plan awaiting approval or executing is
 * surfaced by status rather than by creation time, because an operator
 * opening this list cares about what needs them, not about what is newest.
 */

import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { createColumnHelper } from '@tanstack/react-table';
import { ClipboardList, Plus } from 'lucide-react';
import { usePlans, type PlanSummary } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

/** Statuses that mean a human still has to act. */
const NEEDS_ATTENTION = new Set(['awaiting_approval', 'previewed', 'draft']);

const columnHelper = createColumnHelper<PlanSummary>();

const COLUMNS = [
  columnHelper.accessor('kind', {
    header: 'Tipo',
    cell: (context) => (
      <Link
        to={`/plans/${context.row.original.id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {String(context.getValue())}
      </Link>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Estado',
    cell: (context) => <StatusBadge kind="plan" value={context.getValue() as any} />,
  }),
  columnHelper.accessor('origin', {
    header: 'Origen',
    cell: (context) => (
      <span className="text-muted-foreground">{String(context.getValue())}</span>
    ),
  }),
  columnHelper.accessor('createdAt', {
    header: 'Creado',
    cell: (context) => (
      <span className="text-muted-foreground">
        {formatDistanceToNow(new Date(String(context.getValue())), { addSuffix: true, locale: es })}
      </span>
    ),
  }),
  columnHelper.display({
    id: 'actions',
    enableSorting: false,
    header: '',
    cell: (context) => (
      <Link
        to={`/plans/${context.row.original.id}`}
        className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent hover:text-primary"
      >
        Abrir
      </Link>
    ),
  }),
] as any;

export function PlanListPage() {
  const { can } = useSession();
  const plans = usePlans();
  const list = plans.data ?? [];

  const attention = list.filter((plan) => NEEDS_ATTENTION.has(plan.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planes</h1>
          <p className="text-sm text-muted-foreground">
            Cada operación sobre Moodle pasa por aquí: vista previa, aprobación y ejecución
            registrada.
          </p>
        </div>
        {can('plans.create') ? (
          <Link
            to="/plans/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Plus className="size-4" aria-hidden />
            Crear plan
          </Link>
        ) : null}
      </div>

      {attention.length > 0 ? (
        <Card className="border-warning/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Requieren tu atención</CardTitle>
            <CardDescription>
              {attention.length} plan(es) sin ejecutar esperan revisión o aprobación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {attention.map((plan) => (
                <li key={plan.id}>
                  <Link
                    to={`/plans/${plan.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
                  >
                    <span className="text-sm font-medium">{plan.kind}</span>
                    <StatusBadge kind="plan" value={plan.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" aria-hidden />
            Todos los planes
          </CardTitle>
          <CardDescription>Historial completo de operaciones planificadas.</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.isPending ? (
            <LoadingState label="Cargando planes…" />
          ) : plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : (
            <DataTable
              data={list}
              columns={COLUMNS}
              getRowId={(plan) => plan.id}
              // Newest first by default: the list answers "what is
              // happening", and the oldest plan is the least likely answer.
              initialSorting={[{ id: 'createdAt', desc: true }]}
              empty={
                <EmptyState
                  title="No hay planes"
                  description="Crea un plan para aplicar cambios en bloque con vista previa del impacto antes de ejecutar nada."
                  action={
                    can('plans.create') ? (
                      <Link
                        to="/plans/new"
                        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                      >
                        Crear plan
                      </Link>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
