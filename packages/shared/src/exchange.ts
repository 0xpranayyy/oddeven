import type { Account, BookSnapshot, Market, Order, Outcome, Position, Trade } from "./domain";
import type { PlaceOrderInput } from "./schemas";

export type ExchangeEvent =
  | { type: "trade"; trade: Trade }
  | { type: "book"; book: BookSnapshot }
  | { type: "market"; market: Market }
  | { type: "order"; order: Order }
  | { type: "account"; userId: string };

export interface PlaceOrderResult {
  order: Order;
  trades: Trade[];
}

export class ExchangeError extends Error {
  constructor(
    public readonly code:
      | "market_not_found"
      | "market_not_open"
      | "invalid_price"
      | "insufficient_funds"
      | "insufficient_shares"
      | "no_liquidity"
      | "order_not_found"
      | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

/**
 * The venue abstraction. The play-money engine implements it today; a
 * real-money hybrid CLOB (or a HIP-4 adapter) can implement it later
 * without the API or UI changing.
 */
export interface Exchange {
  placeOrder(userId: string, input: PlaceOrderInput): PlaceOrderResult;
  cancelOrder(userId: string, orderId: string): Order;
  getBook(marketId: string, depth?: number): BookSnapshot;
  getMarket(marketId: string): Market | undefined;
  getAccount(userId: string): Account | undefined;
  getPositions(userId: string): Position[];
  getOpenOrders(userId: string): Order[];
  resolve(marketId: string, outcome: Outcome): void;
  subscribe(listener: (e: ExchangeEvent) => void): () => void;
}
