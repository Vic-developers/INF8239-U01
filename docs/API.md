# API Documentation

## Base URL
- Development: `http://127.0.0.1:3001/api`
- All endpoints prefixed with `/api`

## Authentication
- Cookie-based: httpOnly cookies for access/refresh tokens
- `credentials: 'include'` required
- Endpoints: `/auth/login`, `/auth/refresh`, `/auth/session`, `/auth/logout`

## Response Headers
- `Cache-Control: no-store` on all responses
- `Vary: Cookie` (merged with `Vary: Origin` from CORS)
- Global middleware enforces these

## Health
- `GET /health` - Public endpoint (no auth required), returns liveness status

## Permissions
Format: `<resource>.<action>`
- `plans: ['read','create','execute','delete']`
- `moodles: ['read','create','update','delete','manage','execute']`
- `jobs: ['read','manage']`
- etc.

## Common Error Envelope
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "remediation": "...",
    "details": [{"field": "...", "issue": "..."}]
  },
  "requestId": "..."
}
```

## Key Endpoints
- `/moodles` - CRUD for Moodle instances
- `/plans` - Plan management (preview, approve, execute)
- `/jobs` - Job tracking and logs

## Idempotency
Critical operations support idempotency keys to prevent duplicates.

## Rate Limiting
- Global rate limits
- Per-tenant rate limits  
- Special handling for Moodle API calls

## OpenAPI
OpenAPI documentation available at `/api/docs` in development.
