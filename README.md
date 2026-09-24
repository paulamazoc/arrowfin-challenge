# ArrowFin Technical Assessment

## Assessment Info

**Actual time spent:** Around 3 hours.

**AI / LLM use:** Cursor assistance was used for scaffolding, implementation assistance, tests and documentation/review. Architectural and security decisions were reviewed by myself.

## Background

### Stack Ratings

- React: 5
- TypeScript: 4
- Next.js: 3
- NestJS: 2
- Prisma: 2
- PostgreSQL: 3
- WebSockets: 3
- Tailwind CSS: 3
- JWT/Auth: 3
- Multi-tenant data isolation: 2

### Short Answers

1. What part of the stack are you strongest with?
   React and TypeScript. Most of my recent experience has been building frontend applications and frontend architecture with React, Typescript and modular architectures.

2. What part would be the steepest learning curve?
   Prisma and some of the deeper NestJS patterns. I have backend experience with Java and Node.js so the fundamental concepts are familiar, but I have less production experience with this specific stack.

3. Any technology outside the stack you consider a core strength?
   Frontend architecture and microfrontends, CI/CD, Docker and AWS. I also have experience working across the full delivery lifecycle, including testing, observability and infrastructure concerns.

4. What kind of work do you most want to do day-to-day?
   I enjoy solving architectural and product problems while still being hands-on with code. I especially like designing frontend/fullstack solutions, improving developer experience and delivery practices and mentoring engineers.

5. What do you most want to avoid?
   Work that is mostly repetitive implementation with little ownership or technical decision making. I prefer environments where engineers can understand the product problem, challenge assumptions and contribute to the solution.

## Running Locally

Requires local PostgreSQL. Create a database (for example `arrowfin`), copy `apps/api/.env.example` to `apps/api/.env`, and set `DATABASE_URL`.

```bash
npm install
npm run db:migrate --workspace=api
npm run db:seed --workspace=api
npm run dev:api
npm run dev:web
```

- API: [http://localhost:3000](http://localhost:3000)
- Web: [http://localhost:3001](http://localhost:3001)

Demo identity (not a login): `T-001` / `BRK-ARWP`. The web app sends those values as development headers / socket handshake auth.

```bash
curl -s http://localhost:3000/snapshot \
  -H "x-trader-id: T-001" \
  -H "x-broker-id: BRK-ARWP"
```

`POST /dev/fills` is assessment/demo only. The implemented body is camelCase. `accountId` must belong to the authenticated trader (`ACC-1001` is owned by `T-001`; the dataset sketch `ACC-1006` is not).

```bash
curl -s -X POST http://localhost:3000/dev/fills \
  -H "Content-Type: application/json" \
  -H "x-trader-id: T-001" \
  -H "x-broker-id: BRK-ARWP" \
  -d "{\"accountId\":\"ACC-1001\",\"instrumentSymbol\":\"MES\",\"side\":\"BUY\",\"quantity\":2,\"price\":5643.25,\"commissionUsd\":1.40}"
```

A successful inject emits a tenant-scoped `snapshot.updated` event. The open web page should refetch and move.

## Architecture

Next.js (`localhost:3001`) calls REST `GET /snapshot` on NestJS (`localhost:3000`). The controller takes identity from `DevAuthGuard` (not from the URL). `SnapshotService` loads data through a tenant-scoped Prisma repository, then `SnapshotCalculator` computes the result. The calculator is a pure, framework-independent class.

Realtime is invalidation, not a second state machine:

`POST /dev/fills` → persist Fill → emit tenant-scoped `{ asOf }` → TanStack Query invalidates `["snapshot"]` → REST refetch → UI update.

## Trading / Domain Assumptions

- Dataset clock is fixed at `2026-08-25T14:30:00Z`. The app does not use the machine clock.
- CME session date is derived at seed time from `filled_at`: session opens 17:00 `America/Chicago`. For this cut, the current session date is `2026-08-24`.
- Inventory is running weighted-average cost, all fills up to dataset now, per account + instrument. Shorts are signed quantity.
- Realized P&L and commissions included in the day figures are current-session only.
- Unrealized P&L uses the current mark and each instrument’s `pointValueUsd`.
- Day P&L is an assessment simplification: session realized + current unrealized − session commissions. It is not opening-equity / session-break ledger accounting.
- Risk score is `min(100, max(0, positionsNotional / accountBalance * 100))`. Zero balance with open notional is `100`; no exposure is `0`.
- `active` and `restricted` accounts are included; `closed` are excluded.
- A production trading calendar and financial ledger would need stronger semantics (holidays, early closes, overnight inventory, official P&L).

## WebSocket Reconnection Strategy

The UI shows `Live` / `Reconnecting` / `Disconnected`. On `connect` and on `snapshot.updated`, TanStack Query invalidates and refetches the REST snapshot. There is no event sequence, replay buffer, or gap detection.

If every missed event mattered in production, add sequence/version IDs or replay. This assessment does not implement that; reconnect recovers by refetching authoritative REST state.

## Tradeoffs / Known Limitations

Deliberate cuts for the time box:

- development header auth instead of login / JWT
- no Redis
- no event replay
- no Docker
- no charts
- no PostgreSQL RLS
- no full exchange calendar
- no production financial ledger

See [SECURITY.md](./SECURITY.md) for auth, tenant isolation, PII, and production omissions.

## Code Review

Reviewing the sample `GET /positions/:accountId` handler (`where: { accountId }`, `JSON.stringify(positions)`, inline `(markPrice - avgPrice) * qty`).

**Decision: Request changes**

**BLOCKER 1: Cross-tenant authorization / IDOR**

`where: { accountId }` trusts a resource identifier without verifying broker/trader ownership. On shared multi-broker infrastructure that is a P0: any caller who can name an account ID reads another tenant’s positions.

Fix this first. Derive `{ brokerId, traderId }` from authenticated server context and query through that ownership chain (trader pair → accounts → fills/positions). Do not look up by `accountId` alone.

**BLOCKER 2: Sensitive data logging**

`JSON.stringify(positions)` writes financial positions into logs. That is customer/trading data, often retained longer than the request, and routinely copied into support tools. Log IDs if needed; do not serialize position objects.

**COMMENT: P&L / domain correctness**

`(markPrice - avgPrice) * qty` ignores contract multiplier / point value and is wrong for shorts unless `qty` is signed. Real, but after the security blockers.

Would I approve? **No. Request changes.**  
What gets fixed first? **Tenant isolation.**

## Architecture & Handoff

The decision I am proudest of is treating REST as authoritative state and the WebSocket as an invalidation signal only. One `SnapshotCalculator` path means the socket payload stays `{ asOf }`, we do not duplicate calculation or snapshot shape on the wire, and a reconnect recovers by refetching `GET /snapshot`. The tradeoff is an extra REST request after each fill event.

On a second day I would replace development headers with real JWT or OIDC, add a stronger database tenant control such as PostgreSQL RLS plus ownership integration tests, and define a reconnect sequence/gap strategy if missed events mattered. If product required official P&L, I would replace the assessment day-P&L shortcut with a production trading calendar and ledger semantics (not a longer feature list).

Handoff splits naturally: one engineer on backend/security/data (auth, repository scope, seed/PII boundary), one on frontend/realtime UX (query cache, connection badge, empty/error states). Do not casually change the rule that authenticated tenant context is the root of all tenant-owned data access, do not let clients choose broker/trader rooms, and do not add a second snapshot calculation path unless that is an explicit architecture change.
