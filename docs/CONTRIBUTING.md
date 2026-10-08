# Contributing

## Development Workflow
1. Create feature branch from `main`
2. Make changes following code style
3. Add/update tests
4. Typecheck, lint, build
5. Commit with clear messages
6. Open PR

## Code Style
- **TypeScript**: Strict mode, no `any` types
- **Imports**: Use path aliases where configured
- **Formatting**: Prettier
- **Linting**: ESLint with max-warnings 0
- **Naming**: Follow existing conventions (PascalCase classes, camelCase functions/vars)

## Architecture Rules
- Follow layer separation: Controller → Service → Adapter
- Implement ports/adapters (dependency inversion)
- All bulk/heavy ops must create Jobs
- Destructive ops require dry-run + confirmation
- Multi-tenant isolation must be respected
- Use `scopeOf(context)` for HTTP→TenantScope mapping
- Load plan before markRunning; enqueue after transaction commit

## Commits
- Clear, descriptive commit messages
- Reference issue numbers if applicable
- Keep commits focused

## Testing Requirements
- Unit tests for business logic
- Integration tests for critical flows
- Maintain test isolation (respect singleFork setting)
- Never skip isolation tests

## Security
- No secrets in code
- Never log sensitive data (tokens, passwords)
- Use `127.0.0.1` not `localhost`
- Follow security guidelines in SECURITY.md
