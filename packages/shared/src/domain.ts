import type { Mills, Ticks } from "./money";

export type Outcome = "yes" | "no";
export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "open" | "partial" | "filled" | "cancelled";
export type MarketStatus = "open" | "paused" | "closed" | "resolved";
export type Category = "politics" | "crypto" | "sports" | "economy" | "tech" | "culture";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "politics", label: "Politics" },
  { id: "crypto", label: "Crypto" },
  { id: "sports", label: "Sports" },
  { id: "economy", label: "Economy" },
  { id: "tech", label: "Tech" },
  { id: "culture", label: "Culture" },
];

export interface Market {
  id: string;
  eventId: string;
  /** Short label used inside multi-outcome events, e.g. "25 bps cut". */
  label: string;
  question: string;
  status: MarketStatus;
  tickSize: Ticks;
  resolvedOutcome: Outcome | null;
  /** Last traded YES price. */
  lastPrice: Ticks;
  bestBid: Ticks | null;
  bestAsk: Ticks | null;
  /** YES price 24h ago, for change display. */
  price24hAgo: Ticks;
  volume: Mills;
  volume24h: Mills;
}

export interface MarketEvent {
  id: string;
  slug: string;
  title: string;
  category: Category;
  image: string;
  description: string;
  rules: string;
  resolutionSource: string;
  endsAt: string;
  featured: boolean;
  marketIds: string[];
}

export interface Order {
  id: string;
  userId: string;
  marketId: string;
  outcome: Outcome;
  side: Side;
  type: OrderType;
  /** Limit price in terms of the order's own outcome. */
  price: Ticks;
  shares: number;
  filled: number;
  status: OrderStatus;
  createdAt: number;
}

export interface Trade {
  id: string;
  marketId: string;
  /** Executed YES price. */
  price: Ticks;
  shares: number;
  /** Taker's perspective, for activity feeds. */
  takerOutcome: Outcome;
  takerSide: Side;
  takerId: string;
  makerId: string;
  takerOrderId: string;
  makerOrderId: string;
  ts: number;
}

export interface BookLevel {
  price: Ticks;
  shares: number;
}

/** Order book, always expressed in YES-price terms. */
export interface BookSnapshot {
  marketId: string;
  bids: BookLevel[];
  asks: BookLevel[];
  seq: number;
}

export interface Position {
  marketId: string;
  outcome: Outcome;
  shares: number;
  /** Shares reserved by resting sell orders. */
  locked: number;
  /** Total cost basis of held shares. */
  cost: Mills;
  realizedPnl: Mills;
}

export interface Account {
  userId: string;
  name: string;
  cash: Mills;
  /** Cash reserved by resting buy orders. */
  locked: Mills;
}

export interface PricePoint {
  t: number;
  p: Ticks;
}
