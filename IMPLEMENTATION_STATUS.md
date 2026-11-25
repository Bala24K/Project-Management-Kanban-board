# Implementation status

_Last updated: 2026-11-25_

## Completed requirements

| Requirement | Status | Verified by |
| --- | --- | --- |
| 4 columns in order (Backlog, Todo, In Progress, Done) | Done | web App test, e2e |
| Fetch board, grouped by status | Done | API + web tests |
| Create / edit / delete tasks (real DB) | Done | API tests, web App tests, e2e |
| Drag between columns, reorder within column | Done | e2e (pointer + keyboard) |
| Persist status + position (dense, transactional) | Done | API tests incl. concurrent moves; e2e reload |
| Search by title, filter by priority + assignee, combined | Done | web unit + App tests, e2e |
| Task detail drawer (title, description, priority, assignee, status) | Done | web App test, e2e |
| Optimistic updates + rollback + error toast | Done | reducer tests, App tests, e2e (forced failure) |
| Overlapping mutations (older failure can't undo newer success) | Done | reducer tests |
| Real-time SSE (created/updated/deleted), heartbeat, reconnect + replay | Done | API SSE tests, e2e two contexts |
| Mutation-aware reconciliation (client/mutation ids, revisions, tombstones) | Done | reducer + App tests, e2e |
| Server-side conflict detection (field-level CAS → 409) | Done | API tests, e2e |
| URL query params, refresh restore, back/forward | Done | App tests, e2e |
| Dev-only failure simulation | Done | API + App tests, e2e |
| Loading skeleton, empty states, responsive layout, presence | Done | manual screenshots (desktop + 390px mobile) |
| Production build served by API; Docker image; Render blueprint | Done | Docker image run locally against Postgres |

## In progress

- None.

## Remaining work

- **Deploy to a public URL.** This needs a hosting account (Render blueprint included), and the URL then goes in the README.

## Known bugs / limitations

- Single-instance SSE hub. Horizontal scaling would need Postgres LISTEN/NOTIFY or Redis.
- The presence count is connections (tabs), not distinct users.
- dnd-kit ignores a new drag for about 200ms after a drop while the drop animation settles. Humans don't notice, but e2e tests wait for it.
- `npm audit` lists advisories in dev and migration-time dependencies (Vitest `tinypool`, Prisma CLI config loader). Fixing them needs major upgrades.

## Test results (latest run)

| Suite | Result |
| --- | --- |
| `npm run typecheck` | pass (shared, api, web) |
| API (Vitest + Supertest, real Postgres) | 41 / 41 pass |
| Web (Vitest + Testing Library) | 45 / 45 pass |
| E2E (Playwright, real API + Postgres, 2 browser contexts) | 7 / 7 pass (also 14/14 with `--repeat-each=2`) |
| Production build (`npm run build`) | pass |
| Docker image build + run + migrate on a fresh DB | pass |

## Deployment status

Not deployed. The artefacts are ready and verified locally: the `Dockerfile`, `render.yaml`, and `npm run db:deploy && npm start`.
