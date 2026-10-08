# Moodle Integration

## Approach
- Moodle Web Services API is the primary integration method
- `local_*` plugins only if Web Services API is insufficient
- Never fake unsupported capabilities
- Version-aware: Moodle 4.0 - 5.3 (selectable per instance)

## Version Support
- Function resolution adapts to Moodle API changes across 4.0-5.3
- Version bounds documented from published API
- Capability requirements validated where possible

## Adapter Architecture
- `LmsAdapter` port (domain interface)
- `MoodleWebServiceAdapter` (production)
- `MockMoodleAdapter` (dev/test with Redis state)

## Web Service Client
- Strict TypeScript, no `any`
- Handles pagination, errors, timeouts
- Rate limiting toward Moodle
- Request/response logging (no tokens)

## Mock Adapter
- Redis-backed shared state across processes
- Hash key: `mcc:mock:state:<instanceId>`
- Enables realistic testing without live Moodle
- State can be cleared between tests

## Security
- Web service tokens encrypted at rest
- Never logged in plain text
- Respect Moodle permissions model

## Limitations
- No real Moodle instance available in current environment - only MockMoodleAdapter
- WS catalogue not probe-verified against live Moodle instance
