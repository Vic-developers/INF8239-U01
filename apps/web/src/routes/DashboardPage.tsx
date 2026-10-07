/**
 * Dashboard.
 *
 * Every figure here comes from a real endpoint — there is no summarised
 * "analytics" payload that could drift from the lists behind it. When the
 * tenant has no instances yet, the cards say so and link to the screen
 * that creates them, rather than rendering zeroes that look like a
 * successful sync of nothing.
 */

import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Building2, ClipboardList, ShieldCheck } from 'lucide-react';
import { useMoodleInstances, usePlans } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { statusAppearance, statusColor, StatusBadge } from '@/components/ui/status';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function DashboardPage() {
  const { session, can } = useSession();
  const instances = useMoodleInstances();
  const plans = usePlans();

  const instanceList = instances.data ?? [];
  const planList = plans.data ?? [];

  const reachable = instanceList.filter((instance) => instance.lastProbeStatus === 'ok').length;
  const pendingApproval = planList.filter(
    (plan) => plan.status === 'awaiting_approval' || plan.status === 'previewed',
  ).length;
  const running = planList.filter(
    (plan) => plan.status === 'executing' || plan.status === 'approved',
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">
          {session?.tenantName ?? ''} · {session?.roles.join(', ') ?? ''}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Building2 className="size-4" aria-hidden />}
          label="Instancias Moodle"
          value={instances.isPending ? '…' : String(instanceList.length)}
          hint={
            instances.isError
              ? 'No se pudo cargar'
              : instanceList.length === 0
                ? 'Ninguna registrada'
                : `${reachable} verificadas`
          }
        />
        <MetricCard
          icon={<ClipboardList className="size-4" aria-hidden />}
          label="Planes registrados"
          value={plans.isPending ? '…' : String(planList.length)}
          hint={plans.isError ? 'No se pudo cargar' : `${running} en ejecución`}
        />
        <MetricCard
          icon={<ShieldCheck className="size-4" aria-hidden />}
          label="Esperando aprobación"
          value={plans.isPending ? '…' : String(pendingApproval)}
          hint={pendingApproval === 0 ? 'Nada pendiente' : 'Requieren confirmación'}
        />
        <MetricCard
          icon={<Activity className="size-4" aria-hidden />}
          label="Permisos de tu sesión"
          value={String(session?.permissions.length ?? 0)}
          hint={`${session?.roles.length ?? 0} rol(es) en esta organización`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Instancias</CardTitle>
            <CardDescription>Estado de las conexiones registradas con Moodle.</CardDescription>
          </CardHeader>
          <CardContent>
            {instances.isPending ? (
              <LoadingState label="Cargando instancias…" />
            ) : instances.isError ? (
              <ErrorState error={instances.error} onRetry={() => void instances.refetch()} />
            ) : instanceList.length === 0 ? (
              <EmptyState
                title="Todavía no hay instancias"
                description="Registra tu primera instancia Moodle para poder sondearla y ejecutar planes sobre ella."
                action={
                  can('moodles.create') ? (
                    <Link
                      to="/moodles/new"
                      className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                    >
                      Registrar instancia
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-2">
                {instanceList.slice(0, 5).map((instance) => (
                  <Link
                    key={instance.id}
                    to={`/moodles/${instance.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{instance.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{instance.baseUrl}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {instance.moodleVersion ?? 'sin versión'}
                      </span>
                      <StatusBadge kind="instance" value={instance.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planes recientes</CardTitle>
            <CardDescription>Últimas operaciones planificadas en esta organización.</CardDescription>
          </CardHeader>
          <CardContent>
            {plans.isPending ? (
              <LoadingState label="Cargando planes…" />
            ) : plans.isError ? (
              <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
            ) : planList.length === 0 ? (
              <EmptyState
                title="Sin planes todavía"
                description="Crea un plan para ejecutar cambios en bloque sobre Moodle con vista previa, aprobación y registro de auditoría."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planList.slice(0, 6).map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <Link
                          to={`/plans/${plan.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {plan.kind}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="plan" value={plan.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(plan.createdAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planes por estado</CardTitle>
          <CardDescription>
            Distribución de los planes de esta organización, contados a partir de la lista real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plans.isPending ? (
            <LoadingState label="Cargando planes…" />
          ) : plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : planList.length === 0 ? (
            <EmptyState
              title="Sin datos que graficar"
              description="Cuando existan planes en la organización, aquí se verá su distribución por estado."
            />
          ) : (
            <PlanStatusChart data={planList} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Statuses in a stable order, so the chart reads top-to-bottom the same way every render. */
const PLAN_STATUS_ORDER = [
  'draft',
  'previewed',
  'awaiting_approval',
  'approved',
  'executing',
  'completed',
  'completed_with_errors',
  'cancelled',
  'failed',
] as const;

function PlanStatusChart({ data }: { data: ReadonlyArray<{ status: string }> }) {
  const rows = PLAN_STATUS_ORDER.map((status) => ({
    status,
    label: statusAppearance('plan', status).label,
    count: data.filter((plan) => plan.status === status).length,
  })).filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--accent))' }}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
              color: 'hsl(var(--popover-foreground))',
              fontSize: 12,
            }}
            formatter={(value) => [String(value), 'Planes']}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} minPointSize={4}>
            {rows.map((row) => (
              <Cell key={row.status} fill={statusColor('plan', row.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
