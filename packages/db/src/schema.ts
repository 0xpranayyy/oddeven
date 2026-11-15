import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Money columns are bigint mills (1/1000 USD), read as JS numbers
 * (safe to 9e15 mills = $9 trillion). Prices are smallint ticks 0..1000.
 */
const mills = (name: string) => bigint(name, { mode: "number" });
const ms = (name: string) => bigint(name, { mode: "number" }); // epoch millis
const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const outcomeEnum = pgEnum("outcome", ["yes", "no"]);
export const sideEnum = pgEnum("side", ["buy", "sell"]);
export const orderTypeEnum = pgEnum("order_type", ["limit", "market"]);
export const orderStatusEnum = pgEnum("order_status", ["open", "partial", "filled", "cancelled"]);
export const marketStatusEnum = pgEnum("market_status", ["open", "paused", "closed", "resolved"]);

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  image: text("image").notNull(),
  description: text("description").notNull(),
  rules: text("rules").notNull(),
  resolutionSource: text("resolution_source").notNull(),
  endsAt: tz("ends_at").notNull(),
  featured: boolean("featured").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const markets = pgTable(
  "markets",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    label: text("label").notNull(),
    question: text("question").notNull(),
    sort: integer("sort").notNull().default(0),
    status: marketStatusEnum("status").notNull().default("open"),
    tickSize: smallint("tick_size").notNull().default(10),
    resolvedOutcome: outcomeEnum("resolved_outcome"),
    lastPrice: smallint("last_price").notNull(),
    volume: mills("volume").notNull().default(0),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("markets_event_idx").on(t.eventId)],
);

export const accounts = pgTable("accounts", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  cash: mills("cash").notNull(),
  locked: mills("locked").notNull().default(0),
  /** Total play money granted (starting balance + top-ups), for P&L. */
  deposited: mills("deposited").notNull().default(0),
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) — raw tokens are never stored. */
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => accounts.userId, { onDelete: "cascade" }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const positions = pgTable(
  "positions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => accounts.userId, { onDelete: "cascade" }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    outcome: outcomeEnum("outcome").notNull(),
    shares: bigint("shares", { mode: "number" }).notNull(),
    locked: bigint("locked", { mode: "number" }).notNull().default(0),
    cost: mills("cost").notNull(),
    realizedPnl: mills("realized_pnl").notNull().default(0),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.marketId, t.outcome] }),
    index("positions_market_idx").on(t.marketId),
  ],
);

/** Human orders only; simulated-liquidity orders are ephemeral. */
export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => accounts.userId, { onDelete: "cascade" }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    outcome: outcomeEnum("outcome").notNull(),
    side: sideEnum("side").notNull(),
    type: orderTypeEnum("type").notNull(),
    price: smallint("price").notNull(),
    shares: bigint("shares", { mode: "number" }).notNull(),
    filled: bigint("filled", { mode: "number" }).notNull().default(0),
    status: orderStatusEnum("status").notNull(),
    /** Cash still escrowed for a resting buy (needed to restore exactly). */
    reserved: mills("reserved").notNull().default(0),
    /** Book time priority. */
    seq: bigint("seq", { mode: "number" }).notNull(),
    createdAt: ms("created_at").notNull(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_open_idx").on(t.marketId, t.seq).where(sql`${t.status} in ('open', 'partial')`),
  ],
);

export const trades = pgTable(
  "trades",
  {
    id: text("id").primaryKey(),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    /** Executed YES price. */
    price: smallint("price").notNull(),
    shares: bigint("shares", { mode: "number" }).notNull(),
    takerOutcome: outcomeEnum("taker_outcome").notNull(),
    takerSide: sideEnum("taker_side").notNull(),
    takerId: text("taker_id").notNull(),
    makerId: text("maker_id").notNull(),
    /** Nullable: rows written before migration 0001 don't have them. */
    takerOrderId: text("taker_order_id"),
    makerOrderId: text("maker_order_id"),
    ts: ms("ts").notNull(),
  },
  (t) => [
    index("trades_market_ts_idx").on(t.marketId, t.ts),
    index("trades_ts_idx").on(t.ts),
    index("trades_taker_idx").on(t.takerId, t.ts),
    index("trades_maker_idx").on(t.makerId, t.ts),
  ],
);

/** Downsampled YES price series for charts. */
export const pricePoints = pgTable(
  "price_points",
  {
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    t: ms("t").notNull(),
    p: smallint("p").notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.t] })],
);

/** Small key/value store for engine counters etc. */
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: bigint("value", { mode: "number" }).notNull(),
});
