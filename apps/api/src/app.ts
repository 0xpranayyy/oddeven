import { randomBytes, randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { PlayExchange } from "@oddeven/engine";
import {
  dollarsToMills,
  ExchangeError,
  historyRangeSchema,
  type Market,
  type MarketEvent,
  outcomeSchema,
  PRICE_SCALE,
  placeOrderSchema,
  type Trade,
} from "@oddeven/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { z } from "zod";
import { isBot } from "./bots";

const STARTING_BALANCE = dollarsToMills(1_000);
const FAUCET_AMOUNT = dollarsToMills(1_000);
const RANGE_MS = { "1h": 3.6e6, "1d": 8.64e7, "1w": 6.048e8, "1m": 2.592e9, all: Number.POSITIVE_INFINITY };

export interface AppContext {
  ex: PlayExchange;
  events: Map<string, MarketEvent>;
  adminKey: string;
  webOrigin: string;
}

export interface PublicTrade extends Omit<Trade, "takerId" | "makerId"> {
  trader: string;
}

/** Session + market-data state that lives next to the exchange. */
export class Services {
  readonly sessions = new Map<string, { userId: string; deposited: number }>();
  readonly eventById = new Map<string, MarketEvent>();
  private recent = new Map<string, PublicTrade[]>();
  private global: PublicTrade[] = [];

  constructor(readonly ctx: AppContext) {
    for (const e of ctx.events.values()) this.eventById.set(e.id, e);
    ctx.ex.subscribe((e) => {
      if (e.type !== "trade") return;
      const t = this.toPublic(e.trade);
      const list = this.recent.get(t.marketId) ?? [];
      list.unshift(t);
      if (list.length > 100) list.pop();
      this.recent.set(t.marketId, list);
      this.global.unshift(t);
      if (this.global.length > 100) this.global.pop();
    });
  }

  toPublic(t: Trade): PublicTrade {
    const { takerId, makerId: _, ...rest } = t;
    return { ...rest, trader: this.ctx.ex.getAccount(takerId)?.name ?? "anon" };
  }

  trades(marketId?: string) {
    return marketId ? (this.recent.get(marketId) ?? []) : this.global;
  }

  createSession(name?: string) {
    const userId = `u_${randomUUID()}`;
    const token = randomBytes(24).toString("base64url");
    const handle = name?.trim() || `trader_${userId.slice(2, 7)}`;
    this.ctx.ex.createAccount(userId, handle, STARTING_BALANCE);
    this.sessions.set(token, { userId, deposited: STARTING_BALANCE });
    return { token, userId };
  }

  userFromToken(token: string | undefined) {
    return token ? this.sessions.get(token) : undefined;
  }

  eventWithMarkets(e: MarketEvent) {
    const markets = e.marketIds.map((id) => this.ctx.ex.getMarket(id)!).map((m) => ({ ...m }));
    const now = Date.now();
    return {
      ...e,
      markets,
      volume: markets.reduce((s, m) => s + m.volume, 0),
      volume24h: markets.reduce((s, m) => s + m.volume24h, 0),
      // Tiny 24h sparkline for cards (leading market only).
      spark: this.ctx.ex.history.range(e.marketIds[0]!, now - RANGE_MS["1d"], 32).map((p) => p.p),
    };
  }

  portfolio(userId: string) {
    const { ex } = this.ctx;
    const account = ex.getAccount(userId)!;
    const positions = ex
      .getPositions(userId)
      .filter((p) => p.shares > 0 || p.realizedPnl !== 0)
      .map((p) => {
        const m = ex.getMarket(p.marketId)!;
        const e = this.eventById.get(m.eventId)!;
        const px =
          m.status === "resolved"
            ? m.resolvedOutcome === p.outcome
              ? PRICE_SCALE
              : 0
            : p.outcome === "yes"
              ? m.lastPrice
              : PRICE_SCALE - m.lastPrice;
        const value = p.shares * px;
        return {
          ...p,
          price: px,
          value,
          avgPrice: p.shares > 0 ? Math.round(p.cost / p.shares) : 0,
          unrealizedPnl: value - p.cost,
          market: { id: m.id, label: m.label, status: m.status, resolvedOutcome: m.resolvedOutcome },
          event: { slug: e.slug, title: e.title, image: e.image, multi: e.marketIds.length > 1 },
        };
      });
    const positionsValue = positions.reduce((s, p) => s + p.value, 0);
    const deposited = [...this.sessions.values()].find((s) => s.userId === userId)?.deposited ?? 0;
    const orders = ex.getOpenOrders(userId).map((o) => {
      const m = ex.getMarket(o.marketId)!;
      const e = this.eventById.get(m.eventId)!;
      return { ...o, market: { label: m.label }, event: { slug: e.slug, title: e.title, image: e.image } };
    });
    return {
      account,
      equity: account.cash + positionsValue,
      positionsValue,
      pnl: account.cash + positionsValue - deposited,
      positions,
      orders,
    };
  }

  leaderboard() {
    const rows = [...this.sessions.values()].map((s) => {
      const p = this.portfolio(s.userId);
      return { name: p.account.name, equity: p.equity, pnl: p.pnl };
    });
    return rows.sort((a, b) => b.pnl - a.pnl).slice(0, 50);
  }
}

/** Validator that throws (→ onError) instead of returning, keeping RPC response types clean. */
const v = <T extends "json" | "query", S extends z.ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (r) => {
    if (!r.success) {
      throw new HTTPException(400, { message: r.error.issues[0]?.message ?? "Invalid request" });
    }
  });

const bearer = (h: string | undefined) => h?.replace(/^Bearer\s+/i, "");

export function buildRoutes(svc: Services) {
  const { ex, events } = svc.ctx;

  const auth = (h: string | undefined) => {
    const s = svc.userFromToken(bearer(h));
    if (!s) throw new HTTPException(401, { message: "Session expired" });
    return s;
  };

  return new Hono()
    .get("/health", (c) => c.json({ ok: true, mode: "play-money" as const }))

    .get("/events", v("query", z.object({ category: z.string().optional() })), (c) => {
      const { category } = c.req.valid("query");
      const list = [...events.values()]
        .filter((e) => !category || e.category === category)
        .map((e) => svc.eventWithMarkets(e));
      return c.json({ events: list });
    })

    .get("/events/:slug", (c) => {
      const e = events.get(c.req.param("slug"));
      if (!e) throw new HTTPException(404, { message: "Event not found" });
      return c.json({ event: svc.eventWithMarkets(e) });
    })

    .get("/markets/:id/book", (c) => c.json({ book: ex.getBook(c.req.param("id")) }))

    .get("/markets/:id/trades", (c) => c.json({ trades: svc.trades(c.req.param("id")) }))

    .get("/markets/:id/history", v("query", z.object({ range: historyRangeSchema.default("1w") })), (c) => {
      const { range } = c.req.valid("query");
      const id = c.req.param("id");
      if (!ex.getMarket(id)) throw new HTTPException(404, { message: "Market not found" });
      return c.json({ points: ex.history.range(id, Date.now() - RANGE_MS[range]) });
    })

    .get("/activity", (c) => c.json({ trades: svc.trades() }))

    .get("/leaderboard", (c) => c.json({ rows: svc.leaderboard() }))

    .post("/session", v("json", z.object({ name: z.string().max(24).optional() }).default({})), (c) =>
      c.json(svc.createSession(c.req.valid("json").name)),
    )

    .get("/me", (c) => {
      const { userId } = auth(c.req.header("authorization"));
      return c.json(svc.portfolio(userId));
    })

    .post("/me/faucet", (c) => {
      const s = auth(c.req.header("authorization"));
      const acct = ex.getAccount(s.userId)!;
      if (acct.cash - acct.locked >= dollarsToMills(100)) {
        throw new HTTPException(400, { message: "Top-ups unlock when your balance is under $100" });
      }
      ex.credit(s.userId, FAUCET_AMOUNT);
      s.deposited += FAUCET_AMOUNT;
      return c.json({ ok: true });
    })

    .post("/orders", v("json", placeOrderSchema), (c) => {
      const { userId } = auth(c.req.header("authorization"));
      const res = ex.placeOrder(userId, c.req.valid("json"));
      return c.json({ order: res.order, trades: res.trades.map((t) => svc.toPublic(t)) });
    })

    .delete("/orders/:id", (c) => {
      const { userId } = auth(c.req.header("authorization"));
      return c.json({ order: ex.cancelOrder(userId, c.req.param("id")) });
    })

    .post("/admin/markets/:id/resolve", v("json", z.object({ outcome: outcomeSchema })), (c) => {
      if (c.req.header("x-admin-key") !== svc.ctx.adminKey) {
        throw new HTTPException(403, { message: "Forbidden" });
      }
      ex.resolve(c.req.param("id"), c.req.valid("json").outcome);
      return c.json({ market: ex.getMarket(c.req.param("id")) as Market });
    });
}

export type AppType = ReturnType<typeof buildRoutes>;

export function createApp(svc: Services) {
  const app = new Hono();
  if (process.env.LOG_HTTP) app.use("*", logger());
  app.use("/v1/*", cors({ origin: [svc.ctx.webOrigin], allowHeaders: ["content-type", "authorization"] }));
  app.onError((err, c) => {
    if (err instanceof ExchangeError) return c.json({ error: err.code, message: err.message }, 400);
    if (err instanceof HTTPException) return c.json({ error: "http", message: err.message }, err.status);
    console.error(err);
    return c.json({ error: "internal", message: "Something went wrong" }, 500);
  });
  app.route("/v1", buildRoutes(svc));
  return app;
}

export { isBot };
