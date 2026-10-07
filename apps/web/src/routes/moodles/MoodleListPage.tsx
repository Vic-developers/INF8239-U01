/**
 * Moodle instance list.
 *
 * Probing is exposed here because it is the operation an operator reaches
 * for when an instance misbehaves, and it is deliberately not destructive:
 * it reads the site and refreshes the cached version and capabilities.
 *
 * Deregistration is on the detail screen, not in this row menu, so a
 * mis-click while scanning a list cannot disconnect a production Moodle.
 */

import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Building2, Plus, Radar } from 'lucide-react';
import { useMoodleInstances, useProbeInstance } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function MoodleListPage() {
  const { can } = useSession();
  const instances = useMoodleInstances();
  const probe = useProbeInstance();

  const list = instances.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Instancias Moodle</h1>
          <p className="text-sm text-muted-foreground">
            Cada instancia se conecta por Web Services con su propio token cifrado.
          </p>
        </div>
        {can('moodles.create') ? (
          <Link
            to="/moodles/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Plus className="size-4" aria-hidden />
            Registrar instancia
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conexiones registradas</CardTitle>
          <CardDescription>
            La sonda descubre la versión, el plugin local y el conjunto de capacidades del token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {instances.isPending ? (
            <LoadingState label="Cargando instancias…" />
          ) : instances.isError ? (
            <ErrorState error={instances.error} onRetry={() => void instances.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              title="No hay instancias registradas"
              description="Registra la URL de tu Moodle y un token de servicio web para empezar a operar sobre él."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última sonda</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell>
                      <Link
                        to={`/moodles/${instance.id}`}
                        className="flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
                      >
                        <Building2 className="size-4 text-muted-foreground" aria-hidden />
                        {instance.name}
                      </Link>
                      {probe.isPending && probe.variables === instance.id ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Sondeando…
                        </span>
                      ) : null}
                      {probe.isError && probe.variables === instance.id ? (
                        <InlineError error={probe.error} />
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                      {instance.baseUrl}
                    </TableCell>
                    <TableCell>
                      {instance.moodleRelease ?? instance.moodleVersion ? (
                        <div className="flex flex-col gap-1">
                          <span className="tabular-nums">
                            {instance.moodleRelease ?? instance.moodleVersion}
                          </span>
                          {!instance.pluginInstalled ? (
                            <Badge variant="warning">Plugin ausente</Badge>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sin verificar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="instance" value={instance.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {instance.lastProbeAt !== null
                        ? formatDistanceToNow(new Date(instance.lastProbeAt), {
                            addSuffix: true,
                            locale: es,
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!can('moodles.execute')}
                        pending={probe.isPending && probe.variables === instance.id}
                        onClick={() => probe.mutate(instance.id)}
                        title={
                          can('moodles.execute')
                            ? 'Sondear la instancia'
                            : 'Requiere el permiso moodles.execute'
                        }
                      >
                        <Radar aria-hidden />
                        Sondear
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
