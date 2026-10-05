# Moodle Control Center

> Control Plane para ecosistemas Moodle.

Plataforma externa de **administración, automatización, gobernanza y analítica**
sobre una o múltiples instancias de Moodle. Moodle sigue siendo el LMS; este
sistema es la capa de control que lo opera.

```
                    Moodle Control Center
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
      Moodle A           Moodle B          Moodle C
          │                 │                 │
       Moodle            Moodle            Moodle
```

## Estado

**Fase 0 cerrada. Fase 1 en curso.**

Verificado y ejecutándose en esta máquina:

| Entregable | Estado |
|------------|--------|
| Monorepo pnpm + Turborepo, TS estricto | ✅ |
| Catálogo de permisos + matriz de 9 roles | ✅ 128 permisos, 551 filas |
| Esquemas `mcc` / `dw` / `audit` (39 tablas) | ✅ migración aplicada |
| Aislamiento por RLS con `FORCE` | ✅ 11 tests contra PostgreSQL real |
| Migraciones idempotentes + runner con advisory lock | ✅ |
| Seed (roles + tenant demo + admin) | ✅ idempotente |
| Hash de contraseñas scrypt versionado | ✅ 7 tests |
| Mapeo de errores de Moodle a errores accionables | ✅ |
| Catálogo de funciones WS + capacidades requeridas | ✅ tabla, sin verificar contra Moodle real |
| Rango de versiones 4.0 – 5.3 y resolución por versión | ✅ 23 tests, pendiente de probe real |
| `LmsAdapter` + datos del mock adapter | ✅ contrato, sin adaptador real |
| Contratos del Plan Engine | ✅ zod, sin ejecutor |
| `apps/api`, `apps/worker`, `apps/web` | ⬜ no iniciada |
| `local_moodlecontrolcenter` | ⬜ no iniciado |

Decisiones clave ya tomadas:

| Decisión | Elección |
|----------|----------|
| Layout | Monorepo pnpm + Turborepo |
| Backend | NestJS (TypeScript estricto) |
| Base de datos | PostgreSQL 16 con 3 esquemas: `mcc`, `dw`, `audit` |
| ORM | Drizzle ORM + migraciones SQL escritas a mano |
| Colas | BullMQ + Redis 7 |
| Auth | Sesión httpOnly + refresh rotativo con detección de reuso |
| Contraseñas | scrypt (N=2^15) con parámetros versionados en el hash |
| Aislamiento | `tenant_id` + `FORCE ROW LEVEL SECURITY` como segunda barrera |
| Integración | `LmsAdapter` → `MoodleAdapter` / `MockMoodleAdapter` |
| Versiones de Moodle | 4.0 – 5.3, elegible por instancia |
| Plugin complementario | `local_moodlecontrolcenter` (solo donde el WS estándar no llega) |

### Los tres roles de base de datos

El aislamiento no es una convención de la aplicación: son tres roles con
privilegios distintos.

| Rol | BYPASSRLS | Uso |
|-----|-----------|-----|
| `mcc_owner` | no | Corre migraciones. Nunca en runtime. |
| `mcc_app` | **no** | Rol que atiende peticiones. Un tenant por transacción. |
| `mcc_platform` | **sí** | Excepción acotada: alta de tenants, búsqueda de identidad en el login, jobs cross-tenant. |
| `mcc_ro` | no | Solo lectura, para BI y soporte. |

`FORCE ROW LEVEL SECURITY` impide que el dueño de las tablas lea fuera de su
tenant, y por eso el alta del primer tenant de un tenant no puede hacerla el rol
de peticiones: la fila que se inserta *es* el ámbito. Esa operación, y solo esa
clase de operaciones, usa `mcc_platform`.

### Moodle 4.0 – 5.3 en una sola ruta de código

El rango soportado es amplio a propósito: un solo producto administra varias
instancias, y cada una puede estar en una versión distinta. Eso descarta un
catálogo plano de funciones, porque dentro del rango hay cambios reales:

- `unenrol_user` quedó obsoleta en 4.2 en favor de `core_enrol_unenrol_user`
- `core_course_get_courses` solo acepta `options` (paginación y selección de
  campos) desde 4.4; antes, esos argumentos producen un error

Por eso `resolveFunction()` no devuelve un nombre sino una decisión: versión +
funciones que la instancia dice exponer → nombre a llamar, o el motivo por el que
no se puede llamar. `stripUnsupportedParams()` elimina los argumentos que la
versión destino aún no soporta en lugar de dejar que Moodle rechace la llamada
completa.

Cuando la versión o la lista de funciones son desconocidas, la resolución se
marca como **provisional** en lugar de asumir compatibilidad. Asumirla es
precisamente cómo una operación destructiva falla a mitad de camino en una
instancia antigua.

Consecuencia deliberada: leer una tabla de tenant sin ámbito activo devuelve **cero
filas**, no todas. Un `where tenant_id = ?` olvidado es un no-op silencioso, no
una fuga.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env          # ajustar si el puerto 5434 está ocupado
pnpm infra:up                 # postgres + redis + mailpit
pnpm db:migrate
pnpm db:seed                  # crea el tenant `demo` y su administrador
pnpm test                     # incluye los tests de RLS contra PostgreSQL real
```

El seed imprime las credenciales de desarrollo. `SEED_ADMIN_PASSWORD` las
sobrescribe.

> **Nota de puerto:** `POSTGRES_PORT` es 5434 y no 5432 porque esta máquina tiene
> un PostgreSQL nativo escuchando en 5432, que sombrea el puerto publicado por
> Docker. Cambia ambas referencias juntas si 5434 está ocupado.

## Documentación

| Documento | Estado |
|-----------|--------|
| `docs/ARCHITECTURE.md` | Pendiente de escritura (el plan vive hoy en la conversación) |
| `docs/SECURITY.md` | Pendiente |
| `docs/DATABASE.md` | Pendiente |
| `docs/API.md` | Pendiente |
| `docs/MOODLE-INTEGRATION.md` | Pendiente (requiere probe contra Moodle real) |

> **Lo que aún no está verificado.** No hay ninguna instancia real de Moodle
> conectada. El catálogo de funciones, los límites de versión y los requisitos de
> capacidades provienen de la API documentada de Moodle, no de un probe. El
> adaptador de desarrollo es `MockMoodleAdapter`; el real se escribirá cuando
> haya una instancia a la que apuntar.
| `docs/DEPLOYMENT.md` | Pendiente |
| `docs/TESTING.md` | Pendiente |
| `docs/CONTRIBUTING.md` | Pendiente |
| `docs/DECISIONS.md` | Pendiente (ADRs) |

## Estructura

```
moodle-control-center/
├─ apps/
│  ├─ api/            NestJS REST API          ⬜
│  ├─ worker/         BullMQ processors        ⬜
│  └─ web/            Vite + React             ⬜
├─ packages/
│  ├─ shared/         contratos, permisos, planes, catálogo WS, scrypt   ✅
│  ├─ db/             esquema Drizzle, migraciones, RLS, seed              ✅
│  ├─ config/         eslint, tsconfig                                       ✅
│  ├─ ui/             design system                                        ⬜
│  └─ testing/        factories, MockMoodleAdapter, testcontainers          ⬜
├─ plugin/moodle/local_moodlecontrolcenter/                               ⬜
├─ infra/             compose + scripts de arranque de PostgreSQL          ✅
└─ docs/                                                                 ⬜
```

## Principio

Convertir procesos complejos de administración Moodle en operaciones simples,
masivas, auditables y automatizadas:

```
Buscar → Seleccionar → Previsualizar → Confirmar → Ejecutar → Supervisar
```

Toda escritura del producto pasa por un `OperationPlan` → `Planner` →
`PlanPreview` → aprobación → `Job` → ejecutor con registro de compensación. De ahí
salen gratis el dry-run, la idempotencia por `naturalKey`, la auditoría y el
rollback, y de ahí seguirán saliendo las importaciones, los periodos académicos,
el clonado de cursos, la matriculación masiva y el copiloto de IA.

Nunca bombardear Moodle. Nunca fingir una capacidad que el Web Service no
soporta. Nunca ejecutar una operación destructiva sin dry-run y confirmación
explícita.

## Licencia

Propietario. Todos los derechos reservados.