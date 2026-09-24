# Security Considerations

This document describes the security model that is actually implemented and what is intentionally omitted for a time-boxed assessment. Header-based development identity is **not** production authentication.

## REST authentication

`DevAuthGuard` is assessment-only. In `development` and `test` it reads `x-trader-id` and `x-broker-id`, attaches `{ traderId, brokerId }` as server-side request context, and refuses the request if either header is missing.

That pair is a stand-in for verified claims. It is not a login, not a signed token and not a session. A client can send any header values; authorization happens after the guard, when data access requires the pair to exist as a real `Trader(id, brokerId)`.

Outside `development`/`test`, the guard fails closed (`401`). Production would validate a signed JWT or session during the request and derive identity from those verified claims, never from client-supplied trader/broker identifiers in the body, query string, or path.

## WebSocket authentication

Identity is established during the Socket.IO handshake, not per message. The gateway reads `handshake.auth.traderId` and `handshake.auth.brokerId`, looks up that pair server-side, and only then joins a room the **server** names (`broker:{brokerId}:trader:{traderId}`). The client cannot choose a room.

Missing or invalid identity disconnects immediately. The same `NODE_ENV` gate applies: the socket is refused outside `development`/`test`.

The emitted event is `{ asOf }` only — not positions, fills, balances, or a snapshot payload.

Production would verify a signed token/session in the handshake. Reconnect must reauthenticate; this implementation reconnects with the same development identity object.

## Tenant isolation

Ownership is a chain, not a post-filter:

`Broker` → `Trader(brokerId)` → `Account(traderId)` → `Fill(accountId)`

`SnapshotRepository.findSnapshotInput` starts with **both** `traderId` and `brokerId`. It never loads a trader by ID alone and then checks the broker afterward. A valid trader ID under the wrong broker returns the same generic `404` as an unknown trader (`Not Found`). Accounts are loaded only for that verified trader (`active` / `restricted`). Fills are loaded only for those account IDs.

`POST /dev/fills` repeats the same chain: authenticated pair → trader → account owned by that trader → then insert. A foreign `accountId` is `404`, not `403`.

Socket rooms are derived from the verified handshake pair. Events are emitted to that room only.

This is the IDOR / cross-tenant enumeration control: resource IDs are not queryable by themselves, and a mismatched tenant is indistinguishable from "does not exist".

The residual architectural risk is process, not the current queries. Prisma still accepts unscoped `findMany({ where: { accountId } })`. A later endpoint that forgets tenant scope would reintroduce cross-broker access. Production defenses that fit this codebase: tenant-aware repository APIs that require `AuthenticatedIdentity`, security tests on the ownership chain, and optionally PostgreSQL RLS as defense in depth. **RLS is not implemented.**

## PII handling

`traders.csv` contains regulated PII and unsanitized `notes` / `audit_notes`. The seed persists only `Trader.id` and `Trader.brokerId`. It does not ingest name, email, phone, DOB, SSN last four, address, notes, or audit notes. Broker `api_key_hash` is also not persisted.

Data the snapshot feature does not need should not enter the application database. That is deliberate minimization, not a claim that the CSVs are safe to log or copy elsewhere.

## Logging / redaction

Application code does not log PII, fills, positions, balances, or snapshot payloads. The seed prints row counts and session-date aggregates only.

Production structured logging should emit IDs only when operationally necessary, redact tokens and auth headers, never serialize domain or Prisma objects blindly, and never write unsanitized notes or audit fields. Access to logs and retention would still need controls; this assessment does not implement them.

## Threat model: one prevented vulnerability

Hypothetical vulnerable endpoint: `GET /positions/:accountId` with `where: { accountId }` and no ownership check. Any caller who can guess or leak an account ID reads another broker’s positions.

This design prevents that class of bug at the data-access boundary, not at the HTTP path:

1. Request identity is `{ brokerId, traderId }` from authenticated context.
2. The repository resolves the trader with **both** keys.
3. Accounts are reachable only through that trader.
4. Fills are reachable only through those accounts.
5. A mismatched tenant is a generic `404`.

There is no public `GET /positions/:accountId`. `GET /snapshot` has no trader/account path parameter. Query `traderId` / `brokerId` are ignored; the service uses header-derived identity.

## Development fill injector

`POST /dev/fills` is assessment/demo only. `DevAuthGuard` makes it unusable outside `development`/`test`. It still enforces tenant and account ownership.

The controller remains in the source tree; the guarantee is the env gate, not a separate
production build that strips the route. It must not be exposed in production. A production deployment should omit the controller or fail closed before it is reachable.

## Production omissions

Intentionally not implemented:

- real JWT / OIDC / session integration
- PostgreSQL RLS
- Redis or horizontally scaled socket fan-out
- rate limiting
- audit trail
- secrets management
- production CORS (HTTP CORS is localhost-only and off when `NODE_ENV === 'production'`; the socket gateway also lists `http://localhost:3001`)
- event replay / sequence IDs
- a complete exchange calendar
- full financial ledger / accounting semantics
