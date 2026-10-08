# Security

## Multi-Tenancy & Data Isolation
- All tenant-scoped tables have `FORCE ROW LEVEL SECURITY` enabled
- Application sets tenant context per request via middleware/guards
- Only `mcc_platform` role has `BYPASSRLS` (limited to tenant provisioning, identity lookup, cross-tenant jobs)
- Row-level policies enforce tenant_id filtering on all CRUD operations
- Cross-tenant access is denied by default

## Authentication & Sessions
- Access tokens: HMAC-SHA256 (not JWT) - signed, short-lived
- Refresh tokens: Opaque SHA-256(pepper||token), stored hashed in DB
- Refresh token rotation on use
- Family reuse detection: reuse of a rotated token revokes entire chain
- HttpOnly, Secure (in prod), SameSite cookies
- Session tracking with device info and IP (logged for audit)

## Password Security
- scrypt v2 for password hashing
- No plaintext passwords stored
- Password reset tokens are single-use, time-limited

## Encryption
- Envelope encryption: AES-256-GCM for sensitive fields
- Versioned Data Encryption Keys (DEK)
- HKDF for IV derivation
- KEK management strategy documented in deployment

## API Security
- Input validation via Zod schemas
- Authorization via permission-based access control: `<resource>.<action>` format
- Rate limiting (global and per-tenant)
- CORS configured with explicit origins
- Security headers via Helmet
- Request ID tracking
- Audit logging for sensitive operations

## Moodle Integration Security
- Moodle Web Service tokens stored encrypted
- Rate limiting toward Moodle endpoints to avoid abuse
- Respect Moodle's version-specific capabilities
- Never log raw Moodle tokens

## Infrastructure Security
- Services in isolated network (Docker)
- Secrets via environment variables, never committed
- Database connections use TLS in production
- Redis access restricted
- Minimal port exposure

## Development Security Notes
- Use `127.0.0.1` (not `localhost`) for all connections
- `.env` files never committed (`.gitignore`)
- Test secrets are development-only
- Mock Moodle adapter for local dev (no external calls)
