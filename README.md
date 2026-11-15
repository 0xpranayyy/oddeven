# OddEven

A real-time prediction market. It is currently in **play-money mode**: every new visitor gets $1,000 to trade with, and nothing is real.

![stack](https://img.shields.io/badge/Next.js-16-black) ![stack](https://img.shields.io/badge/React-19-149eca) ![stack](https://img.shields.io/badge/Tailwind-v4-38bdf8) ![stack](https://img.shields.io/badge/Hono-4-ff5b11)

## Quick start

```bash
pnpm install
pnpm dev          # API on :8787 (with market-maker bots) + web on :3000
```

Open http://localhost:3000.

No database setup is needed. Without `DATABASE_URL`, the API uses **PGlite**, an embedded Postgres stored in `apps/api/.data/`. To use real Postgres instead:

```bash
docker compose up -d
DATABASE_URL=postgres://oddeven:oddeven@localhost:5432/oddeven pnpm dev
```

Migrations run automatically on boot.

| Command                     | What it does                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                  | Runs the API and web app in watch mode                                            |
| `pnpm test`                 | Runs the engine tests, including a money-conservation test over random order flow |
| `pnpm typecheck`            | Type-checks every package                                                         |
| `pnpm lint` / `pnpm format` | Runs Biome                                                                        |
| `pnpm --filter @oddeven/api db:check` | Verifies the stored ledger is consistent (see below) |
| `pnpm --filter @oddeven/api db:reset` | Deletes the local PGlite database |
| `pnpm --filter @oddeven/db generate` | Generates a migration after a schema change |

## Layout

```
apps/
  web/        Next.js 16 (App Router, RSC, React Compiler), Tailwind v4, Radix, Motion
  api/        Hono REST + WebSocket gateway, seeded catalog, simulated liquidity bots
packages/
  db/         Drizzle schema, migrations, Postgres/PGlite client
  shared/     Domain types, zod schemas, integer money math, the `Exchange` interface
  engine/     PlayExchange: an in-memory central limit order book (CLOB) with price-time priority
  config/     Shared tsconfig
docs/PLAN.md  Product and technical plan
```

## How the exchange works

- **Integer money everywhere.** A price is a whole number of ticks from 1 to 999, where 1000 ticks = $1. Cash is held in mills (thousandths of a dollar), so price × shares = cash with no floating point.
- **One book per binary market, priced in YES terms.** "Buy NO at 38¢" sits in the book as an ask at 62¢. That lets three kinds of trade happen:
  - YES buyer + NO buyer → a new Yes/No pair is **minted** (together they pay $1).
  - YES seller + NO seller → a pair is **merged** back into $1.
  - Otherwise, shares simply transfer from seller to buyer.
- **Escrow:** buy orders lock cash and sell orders lock shares. Market buys are sized in dollars, and any unused amount is refunded.
- **Self-trade prevention:** if a new order would match your own resting order, the resting one is cancelled.
- **Swappable venue:** everything goes through the `Exchange` interface (`packages/shared/src/exchange.ts`). A real-money venue — a hybrid CLOB with on-chain settlement, or a HIP-4 adapter — can replace `PlayExchange` without changing the API or UI.

## Persistence

The engine keeps all live state in memory, so matching never waits on I/O. Postgres is the durable record behind it:

- **Batched writes.** Every engine change marks the affected rows as dirty. Every 250ms the store takes a synchronous snapshot of everything dirty, which is a consistent point in time, and writes it in **one transaction**. A crash loses at most that 250ms window and never leaves the database half-written.
- **Restore on boot.** Markets, price history, accounts, positions, open orders (with their exact reserved cash and queue position), sessions, and the ID counters are loaded back into the engine.
- **What's stored where.**
  - `accounts`: balances
  - `positions`: holdings
  - `orders`: human orders only; bot orders are recreated on boot
  - `trades`: every fill, with both order IDs
  - `price_points`: chart history
  - `sessions`: SHA-256 hashes of tokens, never the raw tokens
- **Shutdown.** On SIGTERM or SIGINT the store flushes before exiting. This is also what keeps hot reload safe.
- **Checking it.** `db:check` verifies four things against the database:
  - YES shares = NO shares in every open market
  - cash + collateral = all money ever granted
  - each user's locked cash equals what their open buy orders reserve
  - each user's locked shares equal what their open sell orders cover

  All four were tested after `kill -9` under load, on both PGlite and Postgres 16.

## API

The client is end-to-end typed: `apps/web` imports `AppType` from `apps/api` and calls it through `hono/client`. Main routes:

```
GET  /v1/events  /v1/events/:slug  /v1/markets/:id/{book,trades,history}
POST /v1/session          → guest play-money account
GET  /v1/me               → balances, positions, open orders
GET  /v1/me/history       → your fills, from your own side of each trade
POST /v1/orders   DELETE /v1/orders/:id
POST /v1/admin/markets/:id/resolve   (x-admin-key)
WS   /v1/ws   channels: markets · activity · book:<id> · trades:<id> · user
```

Environment variables: `DATABASE_URL`, `PGLITE_DIR`, `PORT`, `ADMIN_KEY`, `WEB_ORIGIN`, `BOTS=off` (API); `API_URL`, `NEXT_PUBLIC_WS_URL` (web).
