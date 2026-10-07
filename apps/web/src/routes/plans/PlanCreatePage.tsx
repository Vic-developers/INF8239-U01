/**
 * Create an Operation Plan.
 *
 * The kind selector only offers the plan kinds this build can actually
 * classify and execute. Offering all thirteen from the shared vocabulary
 * would produce a plan that fails at preview with "no existe un planner",
 * which is a dead end the user can only discover after filling in a form —
 * so the list is derived from what exists rather than from what is
 * conceivable.
 *
 * Items are entered in a grid, one row per Moodle resource, and can be
 * pasted in as delimited text for the bulk case. Nothing is sent to
 * Moodle here: creating a plan writes a row, and the preview that follows
 * is a dry run.
 */

import { useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, ClipboardList, Plus, Trash2, Upload } from 'lucide-react';
import { ON_CONFLICT, ROLLBACK_STRATEGY } from '@mcc/shared';
import { useCreatePlan, useMoodleInstances } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/states';

// ── Column definitions per executable plan kind ────────────────────────────

type ColumnType = 'text' | 'number';

interface Column {
  readonly key: string;
  readonly label: string;
  readonly type: ColumnType;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly defaultValue?: string;
}

type ExecutableKind = 'course.create' | 'user.create' | 'enrolment.create';

const KIND_COLUMNS: Record<ExecutableKind, readonly Column[]> = {
  'course.create': [
    { key: 'shortname', label: 'Nombre corto', type: 'text', required: true, placeholder: 'MAT101' },
    { key: 'fullname', label: 'Nombre completo', type: 'text', required: true, placeholder: 'Matemáticas I' },
    { key: 'categoryid', label: 'Categoría', type: 'number', required: true, defaultValue: '1', placeholder: '1' },
  ],
  'user.create': [
    { key: 'email', label: 'Correo', type: 'text', required: true, placeholder: 'alumno@escuela.edu' },
    { key: 'username', label: 'Usuario', type: 'text', required: true, placeholder: 'aperez' },
    { key: 'firstname', label: 'Nombre', type: 'text', required: true, placeholder: 'Ana' },
    { key: 'lastname', label: 'Apellidos', type: 'text', required: true, placeholder: 'Pérez Soto' },
    {
      key: 'password',
      label: 'Contraseña',
      type: 'text',
      required: true,
      hint: 'Se envía a Moodle y no se almacena en el control center.',
      placeholder: '••••••••••••',
    },
  ],
  'enrolment.create': [
    { key: 'courseid', label: 'Curso (id)', type: 'number', required: true, placeholder: '12' },
    { key: 'userid', label: 'Usuario (id)', type: 'number', required: true, placeholder: '345' },
    { key: 'roleid', label: 'Rol (id)', type: 'number', required: true, defaultValue: '5', placeholder: '5' },
  ],
};

const KIND_LABELS: Record<ExecutableKind, string> = {
  'course.create': 'Crear cursos',
  'user.create': 'Crear usuarios',
  'enrolment.create': 'Matricular en cursos',
};

const KIND_DESCRIPTIONS: Record<ExecutableKind, string> = {
  'course.create':
    'Crea cursos por su nombre corto. Si el curso ya existe, la vista previa lo clasifica como «sin cambios».',
  'user.create':
    'Crea cuentas por su correo. Un usuario existente se detecta antes de tocar Moodle.',
  'enrolment.create':
    'Matricula usuarios en cursos con un rol. Es idempotente: matricular dos veces no duplica.',
};

/**
 * The natural key is the idempotency anchor, so it is derived from the
 * business identity of each row rather than entered by the operator —
 * a user-chosen key would let two rows for the same course both run.
 */
function naturalKeyFor(kind: ExecutableKind, row: Record<string, string>): string {
  switch (kind) {
    case 'course.create':
      return `course:${row['shortname'] ?? ''}`;
    case 'user.create':
      return `user:${row['email'] ?? ''}`;
    case 'enrolment.create':
      return `enrolment:${row['courseid'] ?? ''}:${row['userid'] ?? ''}`;
  }
}

// ── Form schema ────────────────────────────────────────────────────────────

const planFormSchema = z.object({
  moodleInstanceId: z.string().min(1, 'Selecciona una instancia'),
  kind: z.enum(['course.create', 'user.create', 'enrolment.create']),
  rows: z.array(z.record(z.string())).min(1, 'Añade al menos una fila'),
  requireApproval: z.boolean(),
  onConflict: z.enum(ON_CONFLICT),
  rollback: z.enum(ROLLBACK_STRATEGY),
  maxRetries: z.number().int().min(0).max(10),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

export function PlanCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can } = useSession();
  const instances = useMoodleInstances();
  const create = useCreatePlan();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const instanceList = instances.data ?? [];
  const preselected = searchParams.get('instanceId');

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      moodleInstanceId: preselected ?? '',
      kind: 'course.create',
      rows: [
        {
          shortname: '',
          fullname: '',
          categoryid: '1',
        },
      ],
      requireApproval: true,
      onConflict: 'skip',
      rollback: 'compensating',
      maxRetries: 3,
    },
  });

  const kind = watch('kind');
  const rows = watch('rows');
  const columns = KIND_COLUMNS[kind];
  const { fields, append, remove } = useFieldArray({ control, name: 'rows' });

  /** Switching kind resets the grid: the columns are a different shape. */
  const onKindChange = (next: ExecutableKind): void => {
    setValue('kind', next);
    setValue('rows', [
      Object.fromEntries(KIND_COLUMNS[next].map((c) => [c.key, c.defaultValue ?? ''])),
    ]);
  };

  const emptyRow = useMemo(
    () =>
      Object.fromEntries(columns.map((column) => [column.key, column.defaultValue ?? ''])) as Record<
        string,
        string
      >,
    [columns],
  );

  /** Fills the grid from pasted delimited text, one row per line. */
  const applyPaste = (): void => {
    const parsed = pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) =>
        Object.fromEntries(
          columns.map((column, index) => {
            const raw = line.split(/[,;\t]/)[index] ?? '';
            return [column.key, raw.trim()];
          }),
        ),
      );

    if (parsed.length > 0) {
      setValue('rows', parsed, { shouldValidate: true });
      setPasteOpen(false);
      setPasteText('');
    }
  };

  const onSubmit = async (values: PlanFormValues): Promise<void> => {
    setServerError(null);

    // Per-column validation is done here rather than in the schema: which
    // fields are required depends on the selected kind, and a static
    // schema cannot express a rule that changes with another field.
    const missing = values.rows.findIndex((row) =>
      columns.some((column) => column.required && (row[column.key] ?? '').trim().length === 0),
    );
    if (missing >= 0) {
      setServerError(`La fila ${missing + 1} tiene campos obligatorios vacíos.`);
      return;
    }

    const seen = new Set<string>();
    for (const row of values.rows) {
      const key = naturalKeyFor(values.kind, row);
      if (seen.has(key)) {
        setServerError(`Hay filas repetidas: «${key}». Cada recurso debe aparecer una sola vez.`);
        return;
      }
      seen.add(key);
    }

    try {
      const created = await create.mutateAsync({
        kind: values.kind,
        moodleInstanceId: values.moodleInstanceId,
        origin: 'ui',
        items: values.rows.map((row) => ({
          naturalKey: naturalKeyFor(values.kind, row),
          targetType: values.kind === 'user.create' ? 'user' : values.kind === 'course.create' ? 'course' : 'enrolment',
          desired: Object.fromEntries(
            columns.map((column) => [
              column.key,
              column.type === 'number' ? Number(row[column.key]) : row[column.key],
            ]),
          ),
        })),
        options: {
          dryRun: true,
          onConflict: values.onConflict,
          rollback: values.rollback,
          checkpointEvery: 25,
        },
        policy: {
          maxRetries: values.maxRetries,
          rateLimitProfile: 'default',
          requireApproval: values.requireApproval,
          priority: 'normal',
        },
      });
      navigate(`/plans/${created.id}`, { replace: true });
    } catch (error) {
      setServerError(ApiError.is(error) ? error.message : 'No se pudo crear el plan.');
    }
  };

  if (instances.isPending) return <LoadingState label="Cargando instancias…" />;

  if (instances.isError) {
    return (
      <Alert variant="destructive">
        <p>No se pudieron cargar las instancias: {instances.error.message}</p>
      </Alert>
    );
  }

  if (instanceList.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Crear plan</h1>
        <Alert variant="info">
          <p>
            Primero registra una instancia Moodle:{' '}
            <Link to="/moodles/new" className="font-medium underline underline-offset-4">
              registrar instancia
            </Link>
            .
          </p>
        </Alert>
      </div>
    );
  }

  if (!can('plans.create')) {
    return (
      <Alert variant="warning">
        <p>Tu sesión no tiene el permiso plans.create.</p>
      </Alert>
    );
  }

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
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardList className="size-5" aria-hidden />
          Crear plan
        </h1>
        <p className="text-sm text-muted-foreground">
          Nada se envía a Moodle todavía. Después verás la vista previa del impacto antes de
          aprobar.
        </p>
      </div>

      {serverError !== null ? (
        <Alert variant="destructive">
          <p>{serverError}</p>
        </Alert>
      ) : null}

      <form className="space-y-6" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Alcance</CardTitle>
            <CardDescription>Qué se va a hacer y sobre qué instancia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Instancia Moodle" required error={errors.moodleInstanceId?.message}>
              {({ id, describedBy, invalid }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register('moodleInstanceId')}
                >
                  <option value="">Selecciona una instancia…</option>
                  {instanceList.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.name} — {instance.baseUrl}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tipo de operación</legend>
              <div className="grid gap-2 pt-1 sm:grid-cols-3">
                {(Object.keys(KIND_LABELS) as ExecutableKind[]).map((value) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-md border p-3 transition-colors ${
                      kind === value ? 'border-primary bg-accent' : 'hover:bg-accent'
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      value={value}
                      // Driven by `setValue` rather than `register`: the
                      // handler has to reset the grid too, and letting
                      // react-hook-form attach its own onChange here would
                      // mean two owners of the same field.
                      checked={kind === value}
                      onChange={() => onKindChange(value)}
                    />
                    <span className="block text-sm font-medium">{KIND_LABELS[value]}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {KIND_DESCRIPTIONS[value]}
                    </span>
                  </label>
                ))}
              </div>
              {errors.kind !== undefined ? (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {errors.kind.message}
                </p>
              ) : null}
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Elementos</CardTitle>
                <CardDescription>
                  Una fila por recurso. La clave de idempotencia se deriva de los campos, no se
                  escribe.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen((v) => !v)}>
                  <Upload aria-hidden />
                  Pegar lista
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(emptyRow)}
                >
                  <Plus aria-hidden />
                  Añadir fila
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {pasteOpen ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="paste">
                  Pega una fila por línea, separada por comas, en el orden de las columnas:{' '}
                  {columns.map((column) => column.label).join(' · ')}
                </Label>
                <textarea
                  id="paste"
                  className="min-h-[96px] w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs"
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={columns.map((column) => column.placeholder ?? column.key).join(', ')}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={applyPaste}>
                    Importar
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPasteOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Fila {index + 1}
                    </span>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        aria-label={`Eliminar fila ${index + 1}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {columns.map((column) => (
                      <div key={column.key} className="space-y-1">
                        <Label htmlFor={`${field.id}-${column.key}`} className="text-xs">
                          {column.label}
                          {column.required ? (
                            <span className="ml-0.5 text-destructive" aria-hidden>
                              *
                            </span>
                          ) : null}
                        </Label>
                        <Input
                          id={`${field.id}-${column.key}`}
                          type={column.type === 'number' ? 'number' : 'text'}
                          placeholder={column.placeholder ?? ''}
                          {...register(`rows.${index}.${column.key}`)}
                        />
                        {column.hint !== undefined ? (
                          <p className="text-[11px] text-muted-foreground">{column.hint}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {naturalKeyFor(kind, rows[index] ?? {})}
                  </p>
                </div>
              ))}
            </div>

            {errors.rows !== undefined ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.rows.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Política de ejecución</CardTitle>
            <CardDescription>
              Cómo se comporta el executor cuando algo no va como se previó.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Si el recurso ya existe"
              hint="«Omitir» deja Moodle como está; «Actualizar» lo alinea con lo deseado."
            >
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register('onConflict')}
                >
                  <option value="skip">Omitir</option>
                  <option value="update">Actualizar</option>
                  <option value="fail">Fallar el elemento</option>
                </select>
              )}
            </Field>

            <Field
              label="Rollback"
              hint="«Compensatorio» deja acciones de deshacer registradas por elemento."
            >
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register('rollback')}
                >
                  <option value="compensating">Compensatorio</option>
                  <option value="none">Sin rollback</option>
                </select>
              )}
            </Field>

            <Field label="Reintentos por elemento" hint="Entre 0 y 10.">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={10}
                  {...register('maxRetries', { valueAsNumber: true })}
                />
              )}
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                {...register('requireApproval')}
              />
              <span>
                <span className="block text-sm font-medium">Requiere aprobación explícita</span>
                <span className="block text-xs text-muted-foreground">
                  Recomendado: nadie puede ejecutar sin confirmar la vista previa.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" pending={create.isPending}>
            {create.isPending ? 'Creando…' : 'Crear y ver vista previa'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/plans')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
