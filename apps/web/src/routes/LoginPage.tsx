/**
 * Sign-in.
 *
 * The form is driven by react-hook-form with the API's own `loginSchema`
 * as the resolver, so client and server validate against one definition
 * and the messages match what the API would have said.
 *
 * A server-side rejection is rendered through the same error slot as a
 * client-side one. The API deliberately answers the same body for a wrong
 * password and an unknown account, and the UI does not add a hint that
 * would let an attacker tell them apart either.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { loginSchema, type LoginInput } from '@mcc/shared';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';

export function LoginPage() {
  const { session, isLoading, login, isLoggingIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // Sending the user back to where they were interrupted, once the session
  // is known to exist — not before, or the guard would bounce them again.
  useEffect(() => {
    if (session !== null && !isLoading) {
      navigate(from, { replace: true });
    }
  }, [session, isLoading, navigate, from]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  if (session !== null) return <Navigate to={from} replace />;

  const onSubmit = async (values: LoginInput): Promise<void> => {
    setServerError(null);
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (error) {
      // The message is the server's: it distinguishes a disabled account
      // from a lockout, which the client cannot know.
      setServerError(ApiError.is(error) ? error.message : 'No se pudo iniciar sesión.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
            <Building2 className="size-4" aria-hidden />
          </span>
          <div>
            <h1 className="font-semibold leading-tight">Moodle Control Center</h1>
            <p className="text-xs text-muted-foreground">Inicia sesión para continuar</p>
          </div>
        </div>

        {serverError !== null ? (
          <Alert variant="destructive">
            <p>{serverError}</p>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@demo.local"
              aria-invalid={errors.email !== undefined}
              {...register('email')}
            />
            {errors.email !== undefined ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password !== undefined}
              {...register('password')}
            />
            {errors.password !== undefined ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" pending={isLoggingIn}>
            {isLoggingIn ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
