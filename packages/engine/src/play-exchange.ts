import {
  type Account,
  type BookLevel,
  type BookSnapshot,
  type Exchange,
  ExchangeError,
  type ExchangeEvent,
  MAX_PRICE,
  type Market,
  MIN_PRICE,
  type Mills,
  type Order,
  type Outcome,
  type PlaceOrderInput,
  type PlaceOrderResult,
  type Position,
  PRICE_SCALE,
  type PricePoint,
  type Side,
  type Ticks,
  type Trade,
} from "@oddeven/shared";
import { PriceHistory } from "./price-history";

type BookSide = "bid" | "ask";

interface Resting {
  order: Order;
  bookSide: BookSide;
  /** Price in YES terms. */
  bookPrice: Ticks;
  /** Cash still reserved for this order (buys only). */
  reserved: Mills;
  seq: number;
}

interface MarketState {
  market: Market;
  /** Sorted best-first: bids descending, asks ascending; FIFO within a price. */
  bids: Resting[];
  asks: Resting[];
  seq: number;
}

interface AccountState extends Account {
  positions: Map<string, Position>; // key: `${marketId}:${outcome}`
}

const DAY = 86_400_000;

/** Which side of the YES book an order rests on. Buy NO == sell YES at the complement. */
export const toBookSide = (outcome: Outcome, side: Side): BookSide =>
  (outcome === "yes") === (side === "buy") ? "bid" : "ask";

export const toBookPrice = (outcome: Outcome, price: Ticks): Ticks =>
  outcome === "yes" ? price : PRICE_SCALE - price;

/** Execution price from the perspective of the order's own outcome. */
const ownPrice = (outcome: Outcome, yesPrice: Ticks): Ticks =>
  outcome === "yes" ? yesPrice : PRICE_SCALE - yesPrice;

export interface PlayExchangeOptions {
  now?: () => number;
}

/**
 * In-memory, single-process central limit order book for play money.
 *
 * Price-time priority, maker-price execution, self-trade prevention
 * (cancel resting), complementary matching (YES buyer vs NO buyer mints a pair;
 * YES seller vs NO seller merges a pair). All arithmetic is integer.
 */
export class PlayExchange implements Exchange {
  private markets = new Map<string, MarketState>();
  private accounts = new Map<string, AccountState>();
  private orders = new Map<string, Resting>();
  private listeners = new Set<(e: ExchangeEvent) => void>();
  private ids = 0;
  private seq = 0;
  private readonly now: () => number;
  readonly history = new PriceHistory();

  constructor(opts: PlayExchangeOptions = {}) {
    this.now = opts.now ?? Date.now;
  }

  // ---------------------------------------------------------------- setup

  listMarket(
    m: Pick<Market, "id" | "eventId" | "label" | "question"> & {
      tickSize?: Ticks;
      initialPrice: Ticks;
      history?: PricePoint[];
      volume?: Mills;
    },
  ): Market {
    const market: Market = {
      id: m.id,
      eventId: m.eventId,
      label: m.label,
      question: m.question,
      status: "open",
      tickSize: m.tickSize ?? 10,
      resolvedOutcome: null,
      lastPrice: m.initialPrice,
      bestBid: null,
      bestAsk: null,
      price24hAgo: m.initialPrice,
      volume: m.volume ?? 0,
      volume24h: 0,
    };
    this.markets.set(m.id, { market, bids: [], asks: [], seq: 0 });
    if (m.history?.length) this.history.load(m.id, m.history);
    else this.history.record(m.id, this.now(), m.initialPrice);
    market.price24hAgo = this.history.priceAt(m.id, this.now() - DAY) ?? m.initialPrice;
    return market;
  }

  createAccount(userId: string, name: string, cash: Mills): Account {
    const acct: AccountState = { userId, name, cash, locked: 0, positions: new Map() };
    this.accounts.set(userId, acct);
    return publicAccount(acct);
  }

  /** Play-money top-up. A real-money venue would credit via deposits instead. */
  credit(userId: string, amount: Mills): void {
    const a = this.accounts.get(userId);
    if (!a) throw new ExchangeError("forbidden", "Unknown account");
    a.cash += amount;
    this.emit({ type: "account", userId });
  }

  listMarkets(): Market[] {
    return [...this.markets.values()].map((s) => s.market);
  }

  getMarket(marketId: string): Market | undefined {
    return this.markets.get(marketId)?.market;
  }

  getAccount(userId: string): Account | undefined {
    const a = this.accounts.get(userId);
    return a && publicAccount(a);
  }

  getPositions(userId: string): Position[] {
    const a = this.accounts.get(userId);
    return a ? [...a.positions.values()].map((p) => ({ ...p })) : [];
  }

  getOpenOrders(userId: string): Order[] {
    return [...this.orders.values()]
      .filter((r) => r.order.userId === userId)
      .map((r) => ({ ...r.order }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getBook(marketId: string, depth = 12): BookSnapshot {
    const s = this.mustMarket(marketId);
    return {
      marketId,
      bids: aggregate(s.bids, depth),
      asks: aggregate(s.asks, depth),
      seq: s.seq,
    };
  }

  subscribe(listener: (e: ExchangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------- trading

  placeOrder(userId: string, input: PlaceOrderInput): PlaceOrderResult {
    const acct = this.accounts.get(userId);
    if (!acct) throw new ExchangeError("forbidden", "Unknown account");
    const s = this.mustMarket(input.marketId);
    if (s.market.status !== "open") {
      throw new ExchangeError("market_not_open", "This market is not accepting orders");
    }

    const { outcome, side } = input;
    const bookSide = toBookSide(outcome, side);
    let limit: Ticks; // own-outcome limit price
    let shares: number;
    let reserved = 0;

    if (input.type === "limit") {
      if (input.price % s.market.tickSize !== 0) {
        throw new ExchangeError("invalid_price", `Price must be a multiple of ${s.market.tickSize / 10}¢`);
      }
      limit = input.price;
      shares = input.shares;
    } else if (input.side === "buy") {
      // Spend up to `amount`: walk the book to find size and worst price.
      const plan = this.planMarketBuy(s, userId, outcome, input.amount);
      if (plan.shares === 0) throw new ExchangeError("no_liquidity", "Not enough liquidity");
      limit = plan.worst;
      shares = plan.shares;
      reserved = input.amount;
    } else {
      const opposite = bookSide === "bid" ? s.asks : s.bids;
      if (!opposite.some((r) => r.order.userId !== userId)) {
        throw new ExchangeError("no_liquidity", "No buyers right now");
      }
      limit = MIN_PRICE; // sell into any bid
      shares = input.shares;
    }

    if (side === "buy") {
      if (input.type === "limit") reserved = limit * shares;
      if (acct.cash - acct.locked < reserved) {
        throw new ExchangeError("insufficient_funds", "Insufficient balance");
      }
      acct.locked += reserved;
    } else {
      const pos = acct.positions.get(posKey(input.marketId, outcome));
      const available = pos ? pos.shares - pos.locked : 0;
      if (available < shares) {
        throw new ExchangeError("insufficient_shares", "You don't have enough shares to sell");
      }
      pos!.locked += shares;
    }

    const order: Order = {
      id: `o_${++this.ids}`,
      userId,
      marketId: input.marketId,
      outcome,
      side,
      type: input.type,
      price: limit,
      shares,
      filled: 0,
      status: "open",
      createdAt: this.now(),
    };
    const taker: Resting = {
      order,
      bookSide,
      bookPrice: toBookPrice(outcome, limit),
      reserved,
      seq: ++this.seq,
    };

    const trades = this.match(s, taker);
    const remaining = order.shares - order.filled;

    if (remaining > 0 && order.type === "limit") {
      this.rest(s, taker);
      order.status = order.filled > 0 ? "partial" : "open";
    } else {
      // Filled, or IOC remainder of a market order: release what's left.
      this.release(taker);
      order.status = order.filled > 0 ? "filled" : "cancelled";
      if (order.type === "market" && order.filled > 0) order.shares = order.filled;
    }

    this.afterChange(s, [userId, ...trades.map((t) => t.makerId)]);
    this.emit({ type: "order", order: { ...order } });
    return { order: { ...order }, trades };
  }

  cancelOrder(userId: string, orderId: string): Order {
    const r = this.orders.get(orderId);
    if (!r) throw new ExchangeError("order_not_found", "Order not found");
    if (r.order.userId !== userId) throw new ExchangeError("forbidden", "Not your order");
    const s = this.mustMarket(r.order.marketId);
    this.unrest(s, r);
    this.release(r);
    r.order.status = "cancelled";
    this.afterChange(s, [userId]);
    this.emit({ type: "order", order: { ...r.order } });
    return { ...r.order };
  }

  cancelAll(userId: string, marketId?: string): void {
    for (const r of [...this.orders.values()]) {
      if (r.order.userId === userId && (!marketId || r.order.marketId === marketId)) {
        this.cancelOrder(userId, r.order.id);
      }
    }
  }

  resolve(marketId: string, outcome: Outcome): void {
    const s = this.mustMarket(marketId);
    if (s.market.status === "resolved") return;
    const affected = new Set<string>();
    for (const r of [...s.bids, ...s.asks]) {
      this.unrest(s, r);
      this.release(r);
      r.order.status = "cancelled";
      affected.add(r.order.userId);
    }
    for (const acct of this.accounts.values()) {
      for (const o of ["yes", "no"] as const) {
        const pos = acct.positions.get(posKey(marketId, o));
        if (!pos || pos.shares === 0) continue;
        const payout = o === outcome ? pos.shares * PRICE_SCALE : 0;
        acct.cash += payout;
        pos.realizedPnl += payout - pos.cost;
        pos.shares = 0;
        pos.locked = 0;
        pos.cost = 0;
        affected.add(acct.userId);
      }
    }
    s.market.status = "resolved";
    s.market.resolvedOutcome = outcome;
    s.market.lastPrice = outcome === "yes" ? PRICE_SCALE : 0;
    this.history.record(marketId, this.now(), s.market.lastPrice, true);
    this.afterChange(s, [...affected]);
  }

  setStatus(marketId: string, status: "open" | "paused" | "closed"): void {
    const s = this.mustMarket(marketId);
    if (s.market.status === "resolved") return;
    s.market.status = status;
    this.emit({ type: "market", market: { ...s.market } });
  }

  // ---------------------------------------------------------------- internals

  private match(s: MarketState, taker: Resting): Trade[] {
    const trades: Trade[] = [];
    const book = taker.bookSide === "bid" ? s.asks : s.bids;
    const crosses = (p: Ticks) => (taker.bookSide === "bid" ? p <= taker.bookPrice : p >= taker.bookPrice);

    while (taker.order.filled < taker.order.shares && book.length > 0) {
      const maker = book[0]!;
      if (!crosses(maker.bookPrice)) break;

      if (maker.order.userId === taker.order.userId) {
        // Self-trade prevention: cancel the resting order.
        this.unrest(s, maker);
        this.release(maker);
        maker.order.status = "cancelled";
        this.emit({ type: "order", order: { ...maker.order } });
        continue;
      }

      const qty = Math.min(taker.order.shares - taker.order.filled, maker.order.shares - maker.order.filled);
      const yesPrice = maker.bookPrice;
      this.settle(taker, yesPrice, qty);
      this.settle(maker, yesPrice, qty);

      const trade: Trade = {
        id: `t_${++this.ids}`,
        marketId: s.market.id,
        price: yesPrice,
        shares: qty,
        takerOutcome: taker.order.outcome,
        takerSide: taker.order.side,
        takerId: taker.order.userId,
        makerId: maker.order.userId,
        ts: this.now(),
      };
      trades.push(trade);

      const notional = ownPrice(taker.order.outcome, yesPrice) * qty;
      s.market.lastPrice = yesPrice;
      s.market.volume += notional;
      s.market.volume24h += notional;
      this.history.record(s.market.id, trade.ts, yesPrice);

      if (maker.order.filled === maker.order.shares) {
        this.unrest(s, maker);
        this.release(maker);
        maker.order.status = "filled";
      } else {
        maker.order.status = "partial";
      }
      this.emit({ type: "order", order: { ...maker.order } });
      this.emit({ type: "trade", trade });
    }
    return trades;
  }

  /** Apply a fill to one party. Integer-exact; conserves cash across both legs. */
  private settle(r: Resting, yesPrice: Ticks, qty: number): void {
    const acct = this.accounts.get(r.order.userId)!;
    const o = r.order;
    const px = ownPrice(o.outcome, yesPrice);
    const pos = this.position(acct, o.marketId, o.outcome);
    if (o.side === "buy") {
      const cost = px * qty;
      r.reserved -= cost;
      acct.locked -= cost;
      acct.cash -= cost;
      pos.shares += qty;
      pos.cost += cost;
    } else {
      const proceeds = px * qty;
      const basis = pos.shares > 0 ? Math.round((pos.cost * qty) / pos.shares) : 0;
      acct.cash += proceeds;
      pos.shares -= qty;
      pos.locked -= qty;
      pos.cost -= basis;
      pos.realizedPnl += proceeds - basis;
    }
    o.filled += qty;
  }

  private planMarketBuy(s: MarketState, userId: string, outcome: Outcome, amount: Mills) {
    const book = toBookSide(outcome, "buy") === "bid" ? s.asks : s.bids;
    let left = amount;
    let shares = 0;
    let worst: Ticks = ownPrice(outcome, book[0]?.bookPrice ?? MAX_PRICE);
    for (const r of book) {
      if (r.order.userId === userId) continue;
      const px = ownPrice(outcome, r.bookPrice);
      const n = Math.min(r.order.shares - r.order.filled, Math.floor(left / px));
      if (n <= 0) break;
      shares += n;
      left -= n * px;
      worst = px;
    }
    return { shares, worst };
  }

  private rest(s: MarketState, r: Resting): void {
    const book = r.bookSide === "bid" ? s.bids : s.asks;
    const better = (a: Ticks, b: Ticks) => (r.bookSide === "bid" ? a > b : a < b);
    let i = book.length;
    while (i > 0 && better(r.bookPrice, book[i - 1]!.bookPrice)) i--;
    book.splice(i, 0, r);
    this.orders.set(r.order.id, r);
  }

  private unrest(s: MarketState, r: Resting): void {
    const book = r.bookSide === "bid" ? s.bids : s.asks;
    const i = book.indexOf(r);
    if (i >= 0) book.splice(i, 1);
    this.orders.delete(r.order.id);
  }

  /** Release whatever an order still holds in escrow. */
  private release(r: Resting): void {
    const acct = this.accounts.get(r.order.userId)!;
    if (r.order.side === "buy") {
      acct.locked -= r.reserved;
      r.reserved = 0;
    } else {
      const pos = acct.positions.get(posKey(r.order.marketId, r.order.outcome));
      if (pos) pos.locked -= r.order.shares - r.order.filled;
    }
  }

  private position(acct: AccountState, marketId: string, outcome: Outcome): Position {
    const k = posKey(marketId, outcome);
    let p = acct.positions.get(k);
    if (!p) {
      p = { marketId, outcome, shares: 0, locked: 0, cost: 0, realizedPnl: 0 };
      acct.positions.set(k, p);
    }
    return p;
  }

  private afterChange(s: MarketState, userIds: Iterable<string>): void {
    s.seq++;
    s.market.bestBid = s.bids[0]?.bookPrice ?? null;
    s.market.bestAsk = s.asks[0]?.bookPrice ?? null;
    this.emit({ type: "book", book: this.getBook(s.market.id) });
    this.emit({ type: "market", market: { ...s.market } });
    for (const userId of new Set(userIds)) this.emit({ type: "account", userId });
  }

  /** Roll 24h stats; call periodically. */
  refreshStats(): void {
    const now = this.now();
    for (const s of this.markets.values()) {
      s.market.price24hAgo = this.history.priceAt(s.market.id, now - DAY) ?? s.market.lastPrice;
    }
  }

  private mustMarket(id: string): MarketState {
    const s = this.markets.get(id);
    if (!s) throw new ExchangeError("market_not_found", "Market not found");
    return s;
  }

  private emit(e: ExchangeEvent): void {
    for (const l of this.listeners) l(e);
  }
}

const posKey = (marketId: string, outcome: Outcome) => `${marketId}:${outcome}`;

const publicAccount = (a: AccountState): Account => ({
  userId: a.userId,
  name: a.name,
  cash: a.cash,
  locked: a.locked,
});

function aggregate(book: Resting[], depth: number): BookLevel[] {
  const levels: BookLevel[] = [];
  for (const r of book) {
    const remaining = r.order.shares - r.order.filled;
    const last = levels[levels.length - 1];
    if (last && last.price === r.bookPrice) last.shares += remaining;
    else {
      if (levels.length === depth) break;
      levels.push({ price: r.bookPrice, shares: remaining });
    }
  }
  return levels;
}
