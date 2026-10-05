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

**Planificación — Fase 0.** El plan de arquitectura fue entregado y está
pendiente de validación antes de escribir código de aplicación.

Decisiones clave ya tomadas:

| Decisión | Elección |
|----------|----------|
| Layout | Monorepo pnpm + Turborepo |
| Backend | NestJS (TypeScript estricto) |
| Base de datos | PostgreSQL 16 con 3 esquemas: `mcc`, `dw`, `audit` |
| ORM | Drizzle ORM + migraciones SQL |
| Colas | BullMQ + Redis 7 |
| Auth | Sesión httpOnly + refresh rotativo con detección de reuso |
| Aislamiento | `tenant_id` + Row Level Security como segunda barrera |
| Integración | `LmsAdapter` → `MoodleAdapter` / `MockMoodleAdapter` |
| Plugin complementario | `local_moodlecontrolcenter` (solo donde el WS estándar no llega) |

## Documentación

| Documento | Estado |
|-----------|--------|
| `docs/ARCHITECTURE.md` | Pendiente de escritura (post-validación) |
| `docs/SECURITY.md` | Pendiente |
| `docs/DATABASE.md` | Pendiente |
| `docs/API.md` | Pendiente |
| `docs/MOODLE-INTEGRATION.md` | Pendiente (requiere probe contra Moodle real) |
| `docs/DEPLOYMENT.md` | Pendiente |
| `docs/TESTING.md` | Pendiente |
| `docs/CONTRIBUTING.md` | Pendiente |
| `docs/DECISIONS.md` | Pendiente (ADRs) |

## Estructura prevista

```
moodle-control-center/
├─ apps/
│  ├─ api/            NestJS REST API
│  ├─ worker/         BullMQ processors
│  └─ web/            Vite + React
├─ packages/
│  ├─ shared/         zod schemas, tipos, permisos, capabilities
│  ├─ ui/             design system
│  ├─ db/             drizzle schema, migraciones, seeds
│  ├─ config/         eslint, tsconfig, prettier, vitest, tailwind
│  └─ testing/        factories, MockMoodleAdapter, testcontainers
├─ plugin/moodle/local_moodlecontrolcenter/
├─ infra/             Dockerfiles, compose, migrate job
├─ docs/
└─ .github/workflows/
```

## Principio

Convertir procesos complejos de administración Moodle en operaciones simples,
masivas, auditables y automatizadas:

```
Buscar → Seleccionar → Previsualizar → Confirmar → Ejecutar → Supervisar
```

Nunca bombardear Moodle. Nunca fingir una capacidad que el Web Service no
soporta. Nunca ejecutar una operación destructiva sin dry-run y confirmación
explícita.

## Licencia

Propietario. Todos los derechos reservados.