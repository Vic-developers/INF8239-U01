/**
 * Loading, empty and error states.
 *
 * A control plane that shows a blank rectangle while a list loads teaches
 * operators to distrust it, so each of the three states a query can be in
 * has a distinct, labelled rendering. The error state shows the server's
 * own message and remediation — those are written for a person — rather
 * than a generic "something went wrong".
 */

import type { ReactNode } from 'react';
import { Inbox, Loader2, TriangleAlert } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span role="status">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action !== undefined ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const api = ApiError.is(error) ? error : null;
  const message =
    api?.message ?? (error instanceof Error ? error.message : 'No se pudo cargar la información.');

  return (
    <div className="space-y-3">
      <Alert variant="destructive">
        <p>{message}</p>
        {api?.remediation !== undefined ? (
          <p className="mt-1 text-sm opacity-90">{api.remediation.action}</p>
        ) : null}
        {api?.requestId !== undefined ? (
          <p className="mt-1 font-mono text-xs opacity-70">Solicitud: {api.requestId}</p>
        ) : null}
      </Alert>
      {onRetry !== undefined ? (
        <div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Renders the right one of the three for a query result. */
export function QueryState({
  isPending,
  isError,
  error,
  isEmpty,
  onRetry,
  empty,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  onRetry?: (() => void) | undefined;
  empty: ReactNode;
  children: ReactNode;
}) {
  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} {...(onRetry !== undefined ? { onRetry } : {})} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}

export function InlineError({ error }: { error: unknown }) {
  const api = ApiError.is(error) ? error : null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {api?.message ?? 'La operación falló.'}
    </p>
  );
}

export { TriangleAlert };
