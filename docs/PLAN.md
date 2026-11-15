# OddEven: Product & Technical Plan (v0.2)

> Working draft. This is the reference document for the scaffold.

## Decisions log

| Date       | Decision                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-15 | **Venue:** our own CLOB behind the `Exchange` interface (Option A). HIP-4 stays a possible future adapter.                                           |
| 2026-11-15 | **Launch mode:** play money first. Real money, contracts and compliance move to M3.                                                                  |
| 2026-11-15 | **Engine for play money:** TypeScript in-memory CLOB (`packages/engine`). The Rust engine is deferred until real money or measured load requires it. |
| 2026-11-15 | **Persistence:** in-memory engine with batched writes to Postgres every 250ms, one transaction per batch. Restore on boot. PGlite for zero-setup dev, real Postgres via `DATABASE_URL`. A crash can lose up to 250ms of activity; that's acceptable for play money and gets revisited for real money. |

## Status

- [x] **M0 scaffold:** monorepo, Biome, CI, design tokens, typed API client
- [x] **M1 (mostly done):** home, event pages (binary and multi-outcome), live charts, ⌘K search, WebSocket feeds
- [x] **M2 (partially done):** matching engine, orders, portfolio, admin resolution, leaderboard
- [x] **Persistence:** Postgres and PGlite via Drizzle, batched writes, full restore, invariant checker, migrations
- [ ] **Next:** admin UI (create, resolve, pause markets), real auth (Better Auth), Playwright e2e in CI, price-history compaction into candles, AI "why it moved" notes

## 1. What we're building

A prediction market built around **probability as the product**: every screen should answer three questions quickly. What are the odds, why did they move, and what does it cost me to take a side?

**References and what we take from each**

| Reference                          | Take                                                                                                   | Improve on                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Polymarket                         | Market grid, Yes/No price-as-probability, multi-outcome events, comments                               | Dense and noisy cards, weak "why did this move" context, clunky onboarding for non-crypto users |
| Outcome.xyz (HIP-4 on Hyperliquid) | Short-dated recurring markets (e.g. daily BTC binaries), fast on-chain settlement, a trader-grade feel | Mostly crypto-native; we can be just as fast and easier for mainstream users                    |
| world.xyz                          | Couldn't load it from this environment (see note at the end). I'll add notes once it's reachable.      |                                                                                                 |

**What makes OddEven different**

1. **A "why it moved" timeline.** Price chart annotations tied to news and large trades, with AI summaries.
2. **One-tap trading.** The amount is entered in dollars, and the "you win $X" payout is always visible. Shares and the order book live in a Pro mode.
3. **Live everything.** Prices, the order book, the activity feed and payouts stream in with no refresh.
4. **No crypto friction.** Sign up with email, passkey or social. Gas is sponsored. USDC sits behind a dollar balance.
5. **Resolution you can trust.** Each market shows its rules, sources and resolution status as a first-class panel.

## 2. Product surface (MVP → v1)

**MVP**

- Home: featured hero market, trending and new, categories (Politics, Crypto, Sports, Economy, Tech, Culture), live ticker
- Market page: chart (1H/1D/1W/ALL), trade panel, rules and resolution, activity, top holders, comments
- Multi-outcome events (one event, many binary markets, as in Polymarket)
- Portfolio: positions, open orders, P&L, history, claim winnings
- Auth: email, passkey or social, with an embedded wallet; deposit and withdraw USDC
- Search: ⌘K command palette
- Admin: create, edit, pause and resolve markets

**v1**

- Recurring short-dated markets (hourly and daily crypto binaries, Outcome-style)
- Pro mode: order book, limit orders, depth chart, keyboard shortcuts
- "Why it moved" AI annotations, watchlists, alerts (push and email)
- Leaderboards, public profiles, referrals
- Market creation proposals from the community

## 3. Design system

- **Look:** dark-first with a true light mode, calm neutral surfaces, and two semantic accents (Yes = green, No = red/rose) plus one brand accent. Use OKLCH tokens so contrast holds in both themes.
- **Type:** variable sans for the UI (e.g. Inter Variable or Geist) and a mono with tabular numerals for all prices and odds. Numbers never shift width.
- **Motion:** micro-interactions only. Price ticks flash and roll (number-flow style), tabs and sheets use spring transitions, and everything honors `prefers-reduced-motion`.
- **Components:** shadcn/ui (Radix primitives) owned in-repo, extended with market-specific pieces such as `OutcomeBar`, `ProbabilityGauge`, `PriceTicker`, `TradePanel`, `MarketCard`, `Sparkline` and `OrderBook`.
- **Layout:** cards in a responsive grid. On the market page, the trade panel is sticky on desktop and becomes a bottom sheet on mobile. Mobile is a first-class target, not an afterthought.
- **Quality bar:** WCAG 2.2 AA, LCP < 2.0s, INP < 200ms, CLS ≈ 0, skeleton states everywhere, optimistic UI on orders.
- Prototype the key screens (home, market, trade sheet, portfolio) in Claude Design first, then lock the tokens into code.

## 4. Architecture

```
            ┌───────────── apps/web (Next.js) ─────────────┐
 browser ──▶│ RSC pages · server actions · edge caching    │
            └──────┬──────────────────────────┬────────────┘
                   │ REST/RPC (typed)          │ WebSocket
            ┌──────▼──────────┐        ┌──────▼──────────┐
            │ apps/api        │◀──────▶│ apps/realtime   │
            │ (Hono, TS)      │  pub/  │ (WS gateway)    │
            └──┬────────┬─────┘  sub   └─────────────────┘
               │        │ orders          ▲ fills, book deltas
               │   ┌────▼──────────────┐  │
               │   │ services/matching │──┘  (in-memory CLOB,
               │   │ (Rust)            │      event-sourced)
               │   └────┬──────────────┘
               │        │ settled fills (batched)
          ┌────▼───┐ ┌──▼────────────┐   ┌───────────────┐
          │Postgres│ │ services/     │──▶│ Chain (USDC,  │
          │ + Redis│ │ settlement    │   │ conditional   │
          └────────┘ └───────────────┘   │ tokens)       │
               ▲                         └───────────────┘
          ┌────┴─────────┐
          │ services/    │  indexer · oracle/resolution · AI annotations
          │ workers      │  (queues, cron)
          └──────────────┘
```

**The key architectural decision (needs your call):**

- **Option A: our own hybrid CLOB.** Matching happens off-chain and settlement happens on-chain (the Polymarket model, with conditional tokens on an L2 such as Base). We own the whole stack and the UX. It's more work, and we have to handle custody and contract audits.
- **Option B: build on Hyperliquid HIP-4 (the Outcome model).** Matching and settlement are native to HyperCore, so we only build the frontend, indexer and market ops. It's much faster to ship, but we're tied to their primitives, liquidity and policies.
- **Recommendation:** design the backend behind an `Exchange` interface. Ship the MVP on Option A with a **play-money/testnet mode** so product and design can iterate without regulatory or contract risk. Keep Option B as a pluggable venue adapter.

## 5. Tech stack (latest stable, pinned at scaffold time)

**Monorepo:** pnpm workspaces + Turborepo · TypeScript strict · Biome (lint and format) · Changesets

**Frontend (`apps/web`)**

- Next.js (App Router, RSC, server actions, Turbopack, React Compiler) + React 19
- Tailwind CSS v4 + shadcn/ui + Radix · Motion (framer-motion) · `number-flow` for animated numbers
- TanStack Query (server state) + Zustand (UI state) · nuqs (URL state) · react-hook-form + Zod
- Charts: TradingView Lightweight Charts (price) + Recharts/visx (small charts)
- Wallet/auth: Privy (or Dynamic) embedded wallets + wagmi/viem, passkeys, gas sponsorship via ERC-4337 paymaster
- i18n: next-intl · Analytics: PostHog · Errors: Sentry

**Backend**

- `apps/api`: Hono on Node/Bun, with a typed client via oRPC or tRPC (end-to-end types into web)
- `apps/realtime`: WebSocket gateway (uWebSockets.js), with fan-out over Redis/Valkey pub/sub or NATS
- `services/matching`: Rust price-time-priority CLOB, single writer per market, event-sourced to a log (NATS JetStream/Redpanda) so it can be replayed
- `services/settlement`: batches matched fills to the chain, with idempotent retries
- `services/workers`: BullMQ or Inngest for indexing, resolution, notifications and AI annotations
- Data: Postgres (Neon/Supabase) + Drizzle ORM · Redis/Valkey · ClickHouse later for candles and analytics
- Auth: sessions via Better Auth, bound to the wallet (SIWE)

**Contracts (`packages/contracts`)**

- Foundry · Gnosis Conditional Tokens Framework (CTF)-style ERC-1155 outcome tokens · exchange contract for signed-order settlement · USDC collateral
- Resolution: UMA Optimistic Oracle for subjective markets, Chainlink/Pyth for price markets, admin multisig as a fallback with a dispute window

**AI**

- The Claude API powers market-rule drafting, "why it moved" summaries, comment moderation and resolution-source checks. Agents propose; humans approve resolutions.

**Infra**

- Web on Vercel. Services on Fly.io or Railway (later AWS/K8s). Postgres on Neon. Redis on Upstash or self-hosted Valkey.
- GitHub Actions CI (typecheck, lint, test, Playwright e2e, contract tests), preview deploys per PR
- OpenTelemetry → Grafana/Honeycomb

## 6. Repo layout

```
oddeven/
├─ apps/
│  ├─ web/            # Next.js app
│  ├─ api/            # Hono API
│  ├─ realtime/       # WS gateway
│  └─ admin/          # (or /admin route in web for MVP)
├─ services/
│  ├─ matching/       # Rust CLOB
│  ├─ settlement/
│  └─ workers/
├─ packages/
│  ├─ ui/             # design system (shadcn-based) + tokens
│  ├─ db/             # Drizzle schema + migrations
│  ├─ contracts/      # Foundry
│  ├─ sdk/            # typed client shared by web/admin/bots
│  ├─ config/         # tsconfig, biome, tailwind preset
│  └─ shared/         # zod schemas, money/price math (integer ticks!)
└─ docs/
```

## 7. Core domain model (first pass)

- `Event` (title, category, image, end date) → has many `Market`
- `Market` (question, rules, resolution source, status: draft|open|paused|closed|resolved|disputed, tick size, outcomes)
- `Outcome` (Yes/No or named) → token id
- `Order` (user, market, side, outcome, price in ticks, size, type: limit|market, TIF, status)
- `Fill` / `Trade` (maker, taker, price, size, settlement tx)
- `Position` (user, outcome, shares, avg price, realized P&L)
- `Balance`, `Deposit`, `Withdrawal`, `Resolution` (proposed, disputed, final), `Comment`, `PriceCandle`

**Rules:** prices are integer ticks (1 tick = $0.001), sizes are integer share units, and money is never stored as floats. Yes + No = $1.00 per pair, and a Yes buy can match against a No buy via **mint matching**, which deepens liquidity.

## 8. Milestones

| #   | Milestone                            | Outcome                                                                          |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- |
| M0  | Scaffold (week 1)                    | Monorepo, CI, design tokens, shadcn setup, DB schema, auth stub, Storybook/Ladle |
| M1  | Read-only product (weeks 2–3)        | Home, market page, charts, search, all wired to seeded data and live WS mock     |
| M2  | Play-money trading (weeks 4–6)       | Matching engine, orders, portfolio, real-time book, admin resolution             |
| M3  | Real money on testnet (weeks 7–9)    | Contracts, embedded wallets, deposits, on-chain settlement, indexer              |
| M4  | Polish and launch prep (weeks 10–12) | Pro mode, AI annotations, notifications, perf/a11y pass, audit, geo-compliance   |

## 9. Compliance (don't skip)

Real-money prediction markets are regulated in many places. In the US, that means the CFTC (DCM or no-action relief), which is why Polymarket ran an offshore entity with US geo-blocking. Decide the jurisdiction strategy before M3, and build in geo-fencing, KYC hooks (e.g. Persona/Sumsub) and terms from day one. Play-money mode avoids this while we build.

## 10. Open questions for you

1. Venue: our own CLOB + contracts (A), HIP-4 (B), or A with B as an adapter?
2. Chain for Option A: Base, Polygon or another?
3. Target users: crypto traders, mainstream users, or both (default UX = simple, Pro mode = trader)?
4. Launch: play money first, or straight to real money?
5. Launch categories and the first ~20 markets?
6. Brand: name, colors, logo. Do the slides already define these?

---

_Note: outcome.xyz and world.xyz couldn't be fetched from this cloud session, so their domains aren't in the session's network allowlist. Notes on Outcome come from public directory listings. The presentation you mentioned wasn't in the repo or the session; please commit it to `docs/` or attach it again._
