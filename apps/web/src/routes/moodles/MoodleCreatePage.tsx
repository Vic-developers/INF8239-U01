/**
 * Register a Moodle instance.
 *
 * The token is the one field that is write-only: it is sent once,
 * encrypted server-side, and never returned by any route. The form says so
 * explicitly, because an operator who cannot find the value afterwards
 * will assume it was lost rather than protected.
 *
 * The rate-limit profile is presented as a choice of behaviour, not as
 * raw requests-per-second numbers: those come from the server's profiles
 * and the operator is choosing between being gentle and being fast.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, Building2 } from 'lucide-react';
import { useCreateInstance } from '@/lib/queries';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';

/**
 * Mirrors the API's `createInstanceSchema`. Kept as its own schema rather
 * than imported because the API module is not browser-safe (it pulls in
 * database and crypto); the field list is duplicated in one place here and
 * covered by the API's own tests.
 */
const createInstanceForm = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(128, 'Máximo 128 caracteres'),
  baseUrl: z.string().url('Debe ser una URL válida, por ejemplo https://moodle.escuela.edu'),
  token: z
    .string()
    .min(8, 'El token debe tener al menos 8 caracteres')
    .max(2048, 'El token es demasiado largo'),
  rateLimitProfile: z.enum(['default', 'conservative', 'aggressive']),
});

type CreateInstanceForm = z.infer<typeof createInstanceForm>;

const RATE_PROFILES: ReadonlyArray<{
  value: CreateInstanceForm['rateLimitProfile'];
  label: string;
  description: string;
}> = [
  {
    value: 'conservative',
    label: 'Conservador',
    description: 'Menos peticiones por segundo. Recomendado para Moodle con pocos recursos.',
  },
  {
    value: 'default',
    label: 'Predeterminado',
    description: 'Equilibrio entre velocidad y carga sobre la instancia.',
  },
  {
    value: 'aggressive',
    label: 'Agresivo',
    description: 'Más paralelismo. Útil cuando la instancia es grande y está dedicada.',
  },
];

export function MoodleCreatePage() {
  const navigate = useNavigate();
  const create = useCreateInstance();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateInstanceForm>({
    resolver: zodResolver(createInstanceForm),
    defaultValues: { name: '', baseUrl: '', token: '', rateLimitProfile: 'default' },
  });

  const onSubmit = async (values: CreateInstanceForm): Promise<void> => {
    setServerError(null);
    try {
      const created = await create.mutateAsync(values);
      navigate(`/moodles/${created.id}`, { replace: true });
    } catch (error) {
      if (ApiError.is(error)) {
        // A 409 names the field that collided, so the user can fix the
        // name instead of guessing that a duplicate is the problem.
        const nameIssue = error.issueFor('name');
        if (nameIssue !== undefined) {
          setError('name', { message: nameIssue });
          return;
        }
        setServerError(error.message);
        return;
      }
      setServerError('No se pudo registrar la instancia.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to="/moodles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Instancias
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Registrar instancia Moodle</h1>
        <p className="text-sm text-muted-foreground">
          Conecta una instancia existente mediante su API de servicios web.
        </p>
      </div>

      {serverError !== null ? (
        <Alert variant="destructive">
          <p>{serverError}</p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" aria-hidden />
            Datos de conexión
          </CardTitle>
          <CardDescription>
            El token se cifra antes de guardarse y no vuelve a mostrarse. Guárdalo en tu gestor de
            credenciales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
            <Field label="Nombre" required error={errors.name?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  placeholder="Moodle Principal"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  {...register('name')}
                />
              )}
            </Field>

            <Field
              label="URL base"
              required
              error={errors.baseUrl?.message}
              hint="Sin barra al final y sin /my: por ejemplo https://moodle.escuela.edu"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="url"
                  placeholder="https://moodle.escuela.edu"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  {...register('baseUrl')}
                />
              )}
            </Field>

            <Field
              label="Token de servicio web"
              required
              error={errors.token?.message}
              hint="Se cifra con AES-256-GCM y solo se almacena su últimas cuatro caracteres para poder distinguirlos."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  {...register('token')}
                />
              )}
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Perfil de límite de tasa</legend>
              <p className="text-xs text-muted-foreground">
                Controla cuántas peticiones hace el control center hacia esta instancia.
              </p>
              <div className="space-y-2 pt-1">
                {RATE_PROFILES.map((profile) => (
                  <label
                    key={profile.value}
                    className="flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
                  >
                    <input
                      type="radio"
                      value={profile.value}
                      className="mt-0.5 size-4 accent-primary"
                      {...register('rateLimitProfile')}
                    />
                    <span>
                      <span className="block text-sm font-medium">{profile.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {profile.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-3 pt-2">
              <Button type="submit" pending={create.isPending}>
                {create.isPending ? 'Registrando…' : 'Registrar instancia'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/moodles')}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
