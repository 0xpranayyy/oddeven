import { z } from "zod";
import { MAX_PRICE, MIN_PRICE } from "./money";

export const outcomeSchema = z.enum(["yes", "no"]);
export const sideSchema = z.enum(["buy", "sell"]);

export const placeOrderSchema = z.union([
  z.object({
    type: z.literal("limit"),
    marketId: z.string().min(1),
    outcome: outcomeSchema,
    side: sideSchema,
    price: z.int().min(MIN_PRICE).max(MAX_PRICE),
    shares: z.int().positive().max(10_000_000),
  }),
  z.object({
    type: z.literal("market"),
    marketId: z.string().min(1),
    outcome: outcomeSchema,
    side: z.literal("buy"),
    /** Dollars to spend, in mills. */
    amount: z.int().positive().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("market"),
    marketId: z.string().min(1),
    outcome: outcomeSchema,
    side: z.literal("sell"),
    shares: z.int().positive().max(10_000_000),
  }),
]);
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const historyRangeSchema = z.enum(["1h", "1d", "1w", "1m", "all"]);
export type HistoryRange = z.infer<typeof historyRangeSchema>;

/** Client -> server WebSocket messages. */
export const wsClientMessageSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("subscribe"), channel: z.string() }),
  z.object({ op: z.literal("unsubscribe"), channel: z.string() }),
  z.object({ op: z.literal("auth"), token: z.string() }),
  z.object({ op: z.literal("ping") }),
]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
