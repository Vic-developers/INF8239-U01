/**
 * Instance detail: what the probe discovered, and the two operations that
 * change or remove the connection.
 *
 * Deregistration requires typing the instance name. That is the
 * confirmation pattern this product uses everywhere something is
 * irreversible — the operator proves they are looking at *this* instance,
 * not that they clicked the first red button in a list.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Plug, Radar, Trash2 } from 'lucide-react';
import {
  useDeleteInstance,
  useMoodleInstance,
  useProbeInstance,
  type ProbeResult,
} from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { DetailRow } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/states';

export function MoodleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useSession();

  const instance = useMoodleInstance(id);
  const probe = useProbeInstance();
  const remove = useDeleteInstance();

  const [confirmName, setConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

  if (instance.isPending) return <LoadingState label="Cargando instancia…" />;
  if (instance.isError) {
    return <ErrorState error={instance.error} onRetry={() => void instance.refetch()} />;
  }

  const data = instance.data;
  const canProbe = can('moodles.execute');
  const canDelete = can('moodles.delete');

  const onProbe = async (): Promise<void> => {
    setProbeResult(null);
    try {
      const result = await probe.mutateAsync(data.id);
      setProbeResult(result);
    } catch {
      // The hook exposes the error; the inline message next to the button
      // renders it, so it is not duplicated here.
    }
  };

  const onDelete = async (): Promise<void> => {
    try {
      await remove.mutateAsync(data.id);
      navigate('/moodles', { replace: true });
    } catch {
      // Rendered by the inline error under the confirmation field.
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/moodles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Instancias
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {data.name}
              <StatusBadge kind="instance" value={data.status} />
            </h1>
            <p className="text-sm text-muted-foreground">{data.baseUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!canProbe}
              pending={probe.isPending}
              onClick={() => void onProbe()}
              title={canProbe ? 'Sondear la instancia' : 'Requiere moodles.execute'}
            >
              <Radar aria-hidden />
              Sondear
            </Button>
            <Button
              variant="destructive"
              disabled={!canDelete}
              onClick={() => setShowDelete((value) => !value)}
              title={canDelete ? 'Desregistrar la instancia' : 'Requiere moodles.delete'}
            >
              <Trash2 aria-hidden />
              Desregistrar
            </Button>
          </div>
        </div>
        {probe.isError ? <div className="mt-3"><InlineError error={probe.error} /></div> : null}
      </div>

      {probeResult !== null ? (
        <Alert variant={probeResult.supported ? 'success' : 'warning'}>
          <p>
            {probeResult.reachable
              ? `Alcanzable · ${probeResult.sitename} · ${probeResult.release || probeResult.version}`
              : 'La instancia no responde.'}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {probeResult.supported
              ? 'Versión compatible con el rango soportado (4.0 – 5.3).'
              : 'La versión está fuera del rango soportado.'}
            {' · '}
            {probeResult.pluginInstalled
              ? 'Plugin local instalado.'
              : 'Falta el plugin local (local_moodlecontrolcenter).'}
            {' · '}
            {probeResult.latencyP50Ms} ms de latencia.
          </p>
          {probeResult.deniedCapabilities.length > 0 ? (
            <p className="mt-1 text-sm opacity-90">
              Capacidades denegadas: {probeResult.deniedCapabilities.join(', ')}
            </p>
          ) : null}
        </Alert>
      ) : null}

      {showDelete ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Desregistrar instancia</CardTitle>
            <CardDescription>
              Se elimina la conexión y su credencial cifrada. Las operaciones ya ejecutadas en
              Moodle no se revierten. Escribe el nombre exacto para confirmar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={data.name}
              aria-label="Nombre de la instancia a confirmar"
              autoComplete="off"
            />
            {remove.isError ? <InlineError error={remove.error} /> : null}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                pending={remove.isPending}
                disabled={confirmName.trim() !== data.name}
                onClick={() => void onDelete()}
              >
                Desregistrar definitivamente
              </Button>
              <Button variant="outline" onClick={() => setShowDelete(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4" aria-hidden />
            Conexión
          </CardTitle>
          <CardDescription>Datos que el sondeo ha descubierto de la instancia.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Versión">{data.moodleRelease ?? data.moodleVersion ?? '—'}</DetailRow>
            <DetailRow label="Sitio">{data.sitename ?? '—'}</DetailRow>
            <DetailRow label="Perfil de límite de tasa">
              <Badge variant="outline">{data.rateLimitProfile}</Badge>
            </DetailRow>
            <DetailRow label="Plugin local">
              {data.pluginInstalled ? (
                <Badge variant="success">Instalado</Badge>
              ) : (
                <Badge variant="warning">No detectado</Badge>
              )}
            </DetailRow>
            <DetailRow label="Último sondeo">
              {data.lastProbeAt !== null
                ? `${formatDistanceToNow(new Date(data.lastProbeAt), { addSuffix: true, locale: es })} · ${data.lastLatencyP50Ms ?? '—'} ms`
                : 'Sin sondear todavía'}
            </DetailRow>
            <DetailRow label="Registrada el">
              {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true, locale: es })}
            </DetailRow>
            <DetailRow label="Identificador">
              <span className="font-mono text-xs">{data.id}</span>
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operar sobre esta instancia</CardTitle>
          <CardDescription>
            Los cambios en bloque se hacen mediante planes con vista previa y aprobación.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            to={`/plans/new?instanceId=${data.id}`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Crear plan para esta instancia
          </Link>
          <Link
            to="/plans"
            className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
          >
            Ver planes
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
