import type { PlayExchange } from "@oddeven/engine";
import { type Market, wsClientMessageSchema } from "@oddeven/shared";
import type { WSContext } from "hono/ws";
import type { Services } from "./app";

/**
 * Channels:
 *   markets          — coalesced market updates (prices, best bid/ask, volume)
 *   activity         — every public trade
 *   book:<marketId>  — order book snapshots (coalesced, ≤10/s)
 *   trades:<marketId>
 *   user             — "account changed" pings for the authed user (refetch /me)
 */
export class RealtimeHub {
  private subs = new Map<WSContext, Set<string>>();
  private users = new Map<WSContext, string>();
  private dirtyMarkets = new Map<string, Market>();
  private dirtyBooks = new Set<string>();
  private dirtyUsers = new Set<string>();

  constructor(
    private ex: PlayExchange,
    private svc: Services,
  ) {
    ex.subscribe((e) => {
      switch (e.type) {
        case "market":
          this.dirtyMarkets.set(e.market.id, e.market);
          break;
        case "book":
          this.dirtyBooks.add(e.book.marketId);
          break;
        case "trade": {
          const t = this.svc.toPublic(e.trade);
          this.publish("activity", "trade", t);
          this.publish(`trades:${t.marketId}`, "trade", t);
          break;
        }
        case "account":
          this.dirtyUsers.add(e.userId);
          break;
      }
    });
    setInterval(() => this.flush(), 100);
  }

  private flush() {
    if (this.dirtyMarkets.size) {
      this.publish("markets", "markets", [...this.dirtyMarkets.values()]);
      this.dirtyMarkets.clear();
    }
    for (const id of this.dirtyBooks) this.publish(`book:${id}`, "book", this.ex.getBook(id));
    this.dirtyBooks.clear();
    if (this.dirtyUsers.size) {
      for (const [ws, userId] of this.users) {
        if (this.dirtyUsers.has(userId) && this.subs.get(ws)?.has("user")) {
          send(ws, { channel: "user", type: "account", data: null });
        }
      }
      this.dirtyUsers.clear();
    }
  }

  private publish(channel: string, type: string, data: unknown) {
    const msg = JSON.stringify({ channel, type, data });
    for (const [ws, chans] of this.subs) if (chans.has(channel)) ws.send(msg);
  }

  handlers() {
    return {
      onOpen: (_: Event, ws: WSContext) => {
        this.subs.set(ws, new Set());
      },
      onMessage: (ev: MessageEvent, ws: WSContext) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const msg = wsClientMessageSchema.safeParse(parsed);
        if (!msg.success) return;
        const chans = this.subs.get(ws);
        if (!chans) return;
        const m = msg.data;
        if (m.op === "ping") return send(ws, { channel: "system", type: "pong", data: Date.now() });
        if (m.op === "auth") {
          const s = this.svc.userFromToken(m.token);
          if (s) this.users.set(ws, s.userId);
          return send(ws, { channel: "system", type: "auth", data: { ok: !!s } });
        }
        if (m.op === "subscribe") {
          if (chans.size >= 64) return;
          chans.add(m.channel);
          // Snapshot on subscribe for book channels, so clients render immediately.
          if (m.channel.startsWith("book:")) {
            const id = m.channel.slice(5);
            if (this.ex.getMarket(id))
              send(ws, { channel: m.channel, type: "book", data: this.ex.getBook(id) });
          }
        } else chans.delete(m.channel);
      },
      onClose: (_: unknown, ws: WSContext) => {
        this.subs.delete(ws);
        this.users.delete(ws);
      },
    };
  }
}

const send = (ws: WSContext, msg: unknown) => ws.send(JSON.stringify(msg));
