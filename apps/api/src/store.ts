import { createHash } from "node:crypto";
import { type Db, schema } from "@oddeven/db";
import type { PlayExchange } from "@oddeven/engine";
import type { MarketEvent, Order, Trade } from "@oddeven/shared";
import { and, desc, eq, gte, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

const { accounts, events, markets, meta, orders, positions, pricePoints, sessions, trades } = schema;
const DAY = 86_400_000;
const HISTORY_WINDOW = 30 * DAY;

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** `excluded.<col>` for ON CONFLICT DO UPDATE. */
const excluded = (col: PgColumn) => sql.raw(`excluded."${col.name}"`);

/** Insert in chunks to stay under the Postgres parameter limit. */
async function insertChunked<T extends PgTable>(
  tx: Pick<Db, "insert">,
  table: T,
  rows: T["$inferInsert"][],
  onConflict?: (q: ReturnType<ReturnType<Db["insert"]>["values"]>) => unknown,
  size = 1000,
) {
  for (let i = 0; i < rows.length; i += size) {
    const q = tx.insert(table).values(rows.slice(i, i + size));
    await (onConflict ? onConflict(q) : q);
  }
}

export interface LoadedState {
  events: Map<string, MarketEvent>;
  /** tokenHash → userId */
  sessions: Map<string, string>;
  /** userId → deposited mills */
  deposited: Map<string, number>;
  recentTrades: Trade[];
}

export interface FlushStats {
  flushes: number;
  lastFlushMs: number;
  lastFlushAt: number;
  pendingTrades: number;
  errors: number;
}

/**
 * Write-behind persistence for the in-memory exchange.
 *
 * The engine is the hot path: matching is synchronous and never waits on I/O.
 * Engine events mark entities dirty; every `intervalMs` we snapshot the
 * current state of everything dirty (synchronously, so the snapshot is a
 * consistent point in time) and write it in a single transaction.
 * Worst case on crash: the last interval of activity is lost.
 *
 * Simulated-liquidity (bot) orders are not persisted; bots requote on boot.
 */
export class ExchangeStore {
  private dirtyUsers = new Set<string>();
  private dirtyOrders = new Map<string, Order>();
  private dirtyMarkets = new Set<string>();
  private newTrades: Trade[] = [];
  private persistedPointT = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private volTimer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly stats: FlushStats = { flushes: 0, lastFlushMs: 0, lastFlushAt: 0, pendingTrades: 0, errors: 0 };

  constructor(
    private readonly db: Db,
    private readonly ex: PlayExchange,
    private readonly opts: { isBot: (userId: string) => boolean; intervalMs?: number },
  ) {}

  // ------------------------------------------------------------ lifecycle

  start() {
    this.unsubscribe = this.ex.subscribe((e) => {
      switch (e.type) {
        case "trade":
          this.newTrades.push(e.trade);
          this.dirtyMarkets.add(e.trade.marketId);
          break;
        case "order":
          if (!this.opts.isBot(e.order.userId)) this.dirtyOrders.set(e.order.id, e.order);
          break;
        case "account":
          this.dirtyUsers.add(e.userId);
          break;
        case "market":
          this.dirtyMarkets.add(e.market.id);
          break;
      }
    });
    this.timer = setInterval(() => void this.flush(), this.opts.intervalMs ?? 250);
    this.volTimer = setInterval(() => void this.refreshVolume24h(), 60_000);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.volTimer) clearInterval(this.volTimer);
    this.unsubscribe?.();
    await this.flush();
  }

  // ------------------------------------------------------------ writes

  /** Flush dirty state. Concurrent calls coalesce; a call made mid-flush waits and flushes again. */
  async flush(): Promise<void> {
    while (this.flushing) await this.flushing;
    if (!this.hasDirty()) return;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private hasDirty() {
    return (
      this.dirtyUsers.size > 0 ||
      this.dirtyOrders.size > 0 ||
      this.dirtyMarkets.size > 0 ||
      this.newTrades.length > 0
    );
  }

  private async doFlush() {
    const started = performance.now();
    // 1) Synchronous snapshot — a consistent cut of engine state.
    const users = [...this.dirtyUsers];
    const orderEvents = [...this.dirtyOrders.values()];
    const marketIds = [...this.dirtyMarkets];
    const tradeBatch = this.newTrades;
    this.dirtyUsers = new Set();
    this.dirtyOrders = new Map();
    this.dirtyMarkets = new Set();
    this.newTrades = [];

    const accountRows: (typeof accounts.$inferInsert)[] = [];
    const positionRows: (typeof positions.$inferInsert)[] = [];
    for (const userId of users) {
      const a = this.ex.getAccount(userId);
      if (!a) continue;
      accountRows.push({
        userId,
        name: a.name,
        cash: a.cash,
        locked: a.locked,
        isBot: this.opts.isBot(userId),
      });
      for (const p of this.ex.getPositions(userId)) positionRows.push({ userId, ...p });
    }

    const orderRows = orderEvents.map((o): typeof orders.$inferInsert => {
      const live = this.ex.getOrderState(o.id); // still resting → exact escrow + priority
      const order = live?.order ?? o;
      return { ...order, reserved: live?.reserved ?? 0, seq: live?.seq ?? 0 };
    });

    const marketRows: (typeof markets.$inferInsert)[] = [];
    const pointRows: (typeof pricePoints.$inferInsert)[] = [];
    const nextPointT = new Map<string, number>();
    for (const id of marketIds) {
      const m = this.ex.getMarket(id);
      if (!m) continue;
      marketRows.push({
        id,
        eventId: m.eventId,
        label: m.label,
        question: m.question,
        status: m.status,
        tickSize: m.tickSize,
        resolvedOutcome: m.resolvedOutcome,
        lastPrice: m.lastPrice,
        volume: m.volume,
      });
      const pts = this.ex.history.since(id, this.persistedPointT.get(id) ?? Date.now() - HISTORY_WINDOW);
      for (const p of pts) pointRows.push({ marketId: id, t: p.t, p: p.p });
      const last = pts[pts.length - 1];
      if (last) nextPointT.set(id, last.t);
    }
    const counters = this.ex.getCounters();

    // 2) One transaction.
    try {
      await this.db.transaction(async (tx) => {
        if (accountRows.length) {
          await insertChunked(tx, accounts, accountRows, (q) =>
            q.onConflictDoUpdate({
              target: accounts.userId,
              set: {
                cash: excluded(accounts.cash),
                locked: excluded(accounts.locked),
                updatedAt: sql`now()`,
              },
            }),
          );
        }
        if (marketRows.length) {
          await insertChunked(tx, markets, marketRows, (q) =>
            q.onConflictDoUpdate({
              target: markets.id,
              set: {
                status: excluded(markets.status),
                resolvedOutcome: excluded(markets.resolvedOutcome),
                lastPrice: excluded(markets.lastPrice),
                volume: excluded(markets.volume),
                updatedAt: sql`now()`,
              },
            }),
          );
        }
        if (positionRows.length) {
          await insertChunked(tx, positions, positionRows, (q) =>
            q.onConflictDoUpdate({
              target: [positions.userId, positions.marketId, positions.outcome],
              set: {
                shares: excluded(positions.shares),
                locked: excluded(positions.locked),
                cost: excluded(positions.cost),
                realizedPnl: excluded(positions.realizedPnl),
                updatedAt: sql`now()`,
              },
            }),
          );
        }
        if (orderRows.length) {
          await insertChunked(tx, orders, orderRows, (q) =>
            q.onConflictDoUpdate({
              target: orders.id,
              set: {
                shares: excluded(orders.shares),
                filled: excluded(orders.filled),
                status: excluded(orders.status),
                reserved: excluded(orders.reserved),
                // Keep original priority once an order has rested.
                seq: sql`greatest(${orders.seq}, excluded."seq")`,
                updatedAt: sql`now()`,
              },
            }),
          );
        }
        if (tradeBatch.length) {
          await insertChunked(tx, trades, tradeBatch, (q) => q.onConflictDoNothing());
        }
        if (pointRows.length) {
          await insertChunked(tx, pricePoints, pointRows, (q) =>
            q.onConflictDoUpdate({
              target: [pricePoints.marketId, pricePoints.t],
              set: { p: excluded(pricePoints.p) },
            }),
          );
        }
        await tx
          .insert(meta)
          .values([
            { key: "ids", value: counters.ids },
            { key: "seq", value: counters.seq },
          ])
          .onConflictDoUpdate({ target: meta.key, set: { value: excluded(meta.value) } });
      });
      for (const [id, t] of nextPointT) this.persistedPointT.set(id, t);
      this.stats.flushes++;
      this.stats.lastFlushMs = Math.round(performance.now() - started);
      this.stats.lastFlushAt = Date.now();
    } catch (err) {
      // Re-queue so the next tick retries. Newer engine state wins on merge.
      this.stats.errors++;
      console.error("[store] flush failed, will retry:", (err as Error).message);
      for (const u of users) this.dirtyUsers.add(u);
      for (const o of orderEvents) if (!this.dirtyOrders.has(o.id)) this.dirtyOrders.set(o.id, o);
      for (const m of marketIds) this.dirtyMarkets.add(m);
      this.newTrades = tradeBatch.concat(this.newTrades);
    }
    this.stats.pendingTrades = this.newTrades.length;
  }

  /** First boot: write the seeded catalog and its simulated history. */
  async saveCatalog(catalog: Map<string, MarketEvent>) {
    const eventRows = [...catalog.values()].map((e, i) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      category: e.category,
      image: e.image,
      description: e.description,
      rules: e.rules,
      resolutionSource: e.resolutionSource,
      endsAt: new Date(e.endsAt),
      featured: e.featured,
      sort: i,
    }));
    const marketRows = [...catalog.values()].flatMap((e) =>
      e.marketIds.map((id, i) => {
        const m = this.ex.getMarket(id)!;
        return {
          id,
          eventId: e.id,
          label: m.label,
          question: m.question,
          sort: i,
          status: m.status,
          tickSize: m.tickSize,
          lastPrice: m.lastPrice,
          volume: m.volume,
        };
      }),
    );
    const now = Date.now();
    const pointRows = marketRows.flatMap((m) =>
      this.ex.history.since(m.id, now - HISTORY_WINDOW).map((p) => ({ marketId: m.id, t: p.t, p: p.p })),
    );
    await this.db.transaction(async (tx) => {
      await insertChunked(tx, events, eventRows);
      await insertChunked(tx, markets, marketRows);
      await insertChunked(tx, pricePoints, pointRows, (q) => q.onConflictDoNothing());
    });
    for (const m of marketRows) this.persistedPointT.set(m.id, now);
  }

  /** New guest account + session, written synchronously (the client is waiting on it). */
  async createUser(userId: string, name: string, cash: number, token: string) {
    await this.db.transaction(async (tx) => {
      await tx.insert(accounts).values({ userId, name, cash, deposited: cash });
      await tx.insert(sessions).values({ tokenHash: hashToken(token), userId });
    });
  }

  async addDeposit(userId: string, amount: number) {
    await this.db
      .update(accounts)
      .set({ deposited: sql`${accounts.deposited} + ${amount}` })
      .where(eq(accounts.userId, userId));
  }

  // ------------------------------------------------------------ reads

  /** Restore the engine from storage. Returns null on an empty database. */
  async load(): Promise<LoadedState | null> {
    const eventRows = await this.db.select().from(events).orderBy(events.sort);
    if (!eventRows.length) return null;
    const now = Date.now();

    const [marketRows, pointRows, accountRows, positionRows, openOrders, metaRows, sessionRows, vol24] =
      await Promise.all([
        this.db.select().from(markets).orderBy(markets.eventId, markets.sort),
        this.db
          .select()
          .from(pricePoints)
          .where(gte(pricePoints.t, now - HISTORY_WINDOW))
          .orderBy(pricePoints.marketId, pricePoints.t),
        this.db.select().from(accounts),
        this.db.select().from(positions),
        this.db
          .select()
          .from(orders)
          .where(inArray(orders.status, ["open", "partial"]))
          .orderBy(orders.seq),
        this.db.select().from(meta),
        this.db.select().from(sessions),
        this.volume24hByMarket(),
      ]);

    const pointsByMarket = groupBy(pointRows, (p) => p.marketId);
    for (const m of marketRows) {
      const history = (pointsByMarket.get(m.id) ?? []).map((p) => ({ t: p.t, p: p.p }));
      this.ex.restoreMarket(
        {
          id: m.id,
          eventId: m.eventId,
          label: m.label,
          question: m.question,
          status: m.status,
          tickSize: m.tickSize,
          resolvedOutcome: m.resolvedOutcome,
          lastPrice: m.lastPrice,
          volume: m.volume,
        },
        history,
        vol24.get(m.id) ?? 0,
      );
      this.persistedPointT.set(m.id, history[history.length - 1]?.t ?? now);
    }

    const posByUser = groupBy(positionRows, (p) => p.userId);
    const deposited = new Map<string, number>();
    for (const a of accountRows) {
      const bot = this.opts.isBot(a.userId);
      // Bot orders are ephemeral, so any escrow they held is released.
      this.ex.restoreAccount(
        { userId: a.userId, name: a.name, cash: a.cash, locked: bot ? 0 : a.locked },
        (posByUser.get(a.userId) ?? []).map((p) => ({
          marketId: p.marketId,
          outcome: p.outcome,
          shares: p.shares,
          locked: bot ? 0 : p.locked,
          cost: p.cost,
          realizedPnl: p.realizedPnl,
        })),
      );
      if (!bot) deposited.set(a.userId, a.deposited);
    }

    for (const o of openOrders) {
      const m = this.ex.getMarket(o.marketId);
      if (!m || m.status === "resolved") continue;
      this.ex.restoreOrder(
        {
          id: o.id,
          userId: o.userId,
          marketId: o.marketId,
          outcome: o.outcome,
          side: o.side,
          type: o.type,
          price: o.price,
          shares: o.shares,
          filled: o.filled,
          status: o.status,
          createdAt: o.createdAt,
        },
        o.reserved,
        o.seq,
      );
    }

    const counter = (k: string) => metaRows.find((r) => r.key === k)?.value ?? 0;
    this.ex.finishRestore({ ids: counter("ids"), seq: counter("seq") });

    const catalog = new Map<string, MarketEvent>();
    for (const e of eventRows) {
      catalog.set(e.slug, {
        id: e.id,
        slug: e.slug,
        title: e.title,
        category: e.category as MarketEvent["category"],
        image: e.image,
        description: e.description,
        rules: e.rules,
        resolutionSource: e.resolutionSource,
        endsAt: e.endsAt.toISOString(),
        featured: e.featured,
        marketIds: marketRows.filter((m) => m.eventId === e.id).map((m) => m.id),
      });
    }

    return {
      events: catalog,
      sessions: new Map(sessionRows.map((s) => [s.tokenHash, s.userId])),
      deposited,
      recentTrades: await this.recentTrades(),
    };
  }

  /** Last ~100 trades overall plus the last ~100 per market, newest first. */
  async recentTrades(): Promise<Trade[]> {
    const rows = await this.db.execute<typeof trades.$inferSelect & Record<string, unknown>>(sql`
      select id, market_id as "marketId", price, shares, taker_outcome as "takerOutcome",
             taker_side as "takerSide", taker_id as "takerId", maker_id as "makerId",
             coalesce(taker_order_id, '') as "takerOrderId", coalesce(maker_order_id, '') as "makerOrderId", ts
      from (
        select *, row_number() over (partition by market_id order by ts desc) as rn
        from ${trades}
        where ts > ${Date.now() - 7 * DAY}
      ) t
      where rn <= 100
      order by ts desc
    `);
    const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
    return (list as Trade[]).map((t) => ({ ...t, shares: Number(t.shares), ts: Number(t.ts) }));
  }

  /** A user's fills, each expressed from their own order's side. */
  async userFills(userId: string, limit = 50) {
    const mine = sql`case when ${trades.takerId} = ${userId} then ${trades.takerOrderId} else ${trades.makerOrderId} end`;
    return this.db
      .select({
        id: trades.id,
        ts: trades.ts,
        marketId: trades.marketId,
        yesPrice: trades.price,
        shares: trades.shares,
        outcome: orders.outcome,
        side: orders.side,
        role: sql<"taker" | "maker">`case when ${trades.takerId} = ${userId} then 'taker' else 'maker' end`,
      })
      .from(trades)
      .innerJoin(orders, eq(orders.id, mine))
      .where(or(eq(trades.takerId, userId), eq(trades.makerId, userId)))
      .orderBy(desc(trades.ts))
      .limit(limit);
  }

  async userOrderHistory(userId: string, limit = 50) {
    return this.db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), inArray(orders.status, ["filled", "cancelled"])))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  }

  private async volume24hByMarket(): Promise<Map<string, number>> {
    const notional: SQL<number> = sql<number>`coalesce(sum(
      (case when ${trades.takerOutcome} = 'yes' then ${trades.price} else 1000 - ${trades.price} end)
      * ${trades.shares}), 0)::bigint`;
    const rows = await this.db
      .select({ marketId: trades.marketId, v: notional })
      .from(trades)
      .where(gte(trades.ts, Date.now() - DAY))
      .groupBy(trades.marketId);
    return new Map(rows.map((r) => [r.marketId, Number(r.v)]));
  }

  private async refreshVolume24h() {
    try {
      const vols = await this.volume24hByMarket();
      for (const m of this.ex.listMarkets()) this.ex.setVolume24h(m.id, vols.get(m.id) ?? 0);
    } catch (err) {
      console.error("[store] volume refresh failed:", (err as Error).message);
    }
  }
}
