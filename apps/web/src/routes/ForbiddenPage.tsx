import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shown when a route is reachable but the session lacks the permission.
 *
 * Saying "you do not have access" without listing what would be needed
 * leaves the user nowhere to go; the required permission is named so they
 * can ask for it, and the roles they do hold are listed so they can see
 * whether this is a wrong-account problem.
 */
export function ForbiddenPage() {
  const { session } = useSession();

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <ShieldAlert className="mb-2 size-8 text-warning" aria-hidden />
          <CardTitle>No tienes permiso para esta sección</CardTitle>
          <CardDescription>
            Tu sesión no incluye el permiso que esta pantalla requiere. Pídele a un administrador
            de la organización que te asigne un rol que lo conceda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {session !== null ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Roles que tienes:</p>
              <div className="flex flex-wrap gap-1">
                {session.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    {role}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {session.permissions.length} permisos concedidos en {session.tenantName}.
              </p>
            </div>
          ) : null}
          <Link to="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Volver al panel
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
