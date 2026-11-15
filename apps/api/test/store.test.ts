import { connectDb, type DbHandle } from "@oddeven/db";
import { PlayExchange } from "@oddeven/engine";
import type { MarketEvent } from "@oddeven/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExchangeStore, hashToken } from "../src/store";

const isBot = (id: string) => id.startsWith("bot_");
const START = 1_000_000;

function catalog(ex: PlayExchange): Map<string, MarketEvent> {
  const base = {
    category: "crypto" as const,
    image: "₿",
    description: "d",
    rules: "r",
    resolutionSource: "s",
  };
  ex.listMarket({ id: "m1", eventId: "e1", label: "Yes", question: "Binary?", initialPrice: 500 });
  ex.listMarket({ id: "m2", eventId: "e2", label: "A", question: "Multi A", initialPrice: 400 });
  ex.listMarket({ id: "m3", eventId: "e2", label: "B", question: "Multi B", initialPrice: 600 });
  return new Map([
    [
      "binary",
      {
        ...base,
        id: "e1",
        slug: "binary",
        title: "Binary?",
        endsAt: new Date().toISOString(),
        featured: true,
        marketIds: ["m1"],
      },
    ],
    [
      "multi",
      {
        ...base,
        id: "e2",
        slug: "multi",
        title: "Multi",
        endsAt: new Date().toISOString(),
        featured: false,
        marketIds: ["m2", "m3"],
      },
    ],
  ]);
}

/** Everything that must survive a restart, in a comparable shape. */
function snapshot(ex: PlayExchange, users: string[]) {
  return {
    accounts: users.map((u) => ex.getAccount(u)),
    positions: users.map((u) =>
      ex
        .getPositions(u)
        .sort((a, b) => `${a.marketId}${a.outcome}`.localeCompare(`${b.marketId}${b.outcome}`)),
    ),
    orders: users.map((u) => ex.getOpenOrders(u)),
    books: ["m1", "m2", "m3"].map((m) => {
      const { seq: _, ...book } = ex.getBook(m, 50);
      return book;
    }),
    markets: ex.listMarkets().map(({ price24hAgo: _, volume24h: __, ...m }) => m),
  };
}

let h: DbHandle;
beforeEach(async () => {
  h = await connectDb(); // in-memory PGlite, migrations applied
});
afterEach(async () => {
  await h.close();
});

async function boot() {
  const ex = new PlayExchange();
  const store = new ExchangeStore(h.db, ex, { isBot });
  const loaded = await store.load();
  return { ex, store, loaded };
}

describe("ExchangeStore", () => {
  it("restores accounts, positions, escrow, book priority and sessions exactly", async () => {
    const { ex, store } = await boot();
    await store.saveCatalog(catalog(ex));
    store.start();
    for (const u of ["alice", "bob", "carol"]) {
      await store.createUser(u, u, START, `tok_${u}`);
      ex.createAccount(u, u, START);
    }
    // Resting orders at the same price: bob first, then carol (FIFO must survive).
    ex.placeOrder("bob", {
      type: "limit",
      marketId: "m1",
      outcome: "no",
      side: "buy",
      price: 400,
      shares: 30,
    });
    ex.placeOrder("carol", {
      type: "limit",
      marketId: "m1",
      outcome: "no",
      side: "buy",
      price: 400,
      shares: 30,
    });
    // Partial fill with price improvement (leaves leftover escrow on alice's resting order).
    ex.placeOrder("alice", {
      type: "limit",
      marketId: "m1",
      outcome: "yes",
      side: "buy",
      price: 650,
      shares: 10,
    });
    ex.placeOrder("alice", {
      type: "limit",
      marketId: "m1",
      outcome: "yes",
      side: "sell",
      price: 900,
      shares: 10,
    });
    const { order } = ex.placeOrder("carol", {
      type: "limit",
      marketId: "m3",
      outcome: "yes",
      side: "buy",
      price: 100,
      shares: 5,
    });
    ex.cancelOrder("carol", order.id);
    // Market maker liquidity, then resolve m2.
    ex.createAccount("bot_mm", "mm", 10 ** 12);
    ex.placeOrder("bot_mm", {
      type: "limit",
      marketId: "m2",
      outcome: "no",
      side: "buy",
      price: 500,
      shares: 100,
    });
    ex.placeOrder("bob", { type: "market", marketId: "m2", outcome: "yes", side: "buy", amount: 5_000 });
    ex.placeOrder("alice", {
      type: "limit",
      marketId: "m2",
      outcome: "yes",
      side: "buy",
      price: 500,
      shares: 20,
    });
    ex.placeOrder("bot_mm", {
      type: "limit",
      marketId: "m3",
      outcome: "yes",
      side: "buy",
      price: 300,
      shares: 100,
    }); // ephemeral
    ex.resolve("m2", "yes");

    await store.stop();
    // Bot orders are ephemeral: compare against the state without them.
    ex.cancelAll("bot_mm");
    const before = snapshot(ex, ["alice", "bob", "carol"]);

    const { ex: ex2, loaded } = await boot();
    expect(loaded).not.toBeNull();
    expect(snapshot(ex2, ["alice", "bob", "carol"])).toEqual(before);
    expect(loaded!.sessions.get(hashToken("tok_alice"))).toBe("alice");
    expect(loaded!.deposited.get("bob")).toBe(START);
    expect(loaded!.events.get("multi")!.marketIds).toEqual(["m2", "m3"]);
    expect(loaded!.recentTrades.length).toBeGreaterThan(0);
    expect(ex2.getAccount("bot_mm")!.locked).toBe(0);

    // Ids continue past persisted ones; matching still works against restored orders.
    const res = ex2.placeOrder("alice", {
      type: "limit",
      marketId: "m1",
      outcome: "yes",
      side: "buy",
      price: 600,
      shares: 25,
    });
    expect(Number(res.order.id.slice(2))).toBeGreaterThan(Number(order.id.slice(2)));
    // bob had 20 left, carol 30: FIFO at the same price must hit bob first.
    expect(res.trades.map((t) => [t.makerId, t.shares])).toEqual([
      ["bob", 20],
      ["carol", 5],
    ]);
  });

  it("survives randomized flow with flushes at arbitrary points", async () => {
    const { ex, store } = await boot();
    await store.saveCatalog(catalog(ex));
    store.start();
    const users = ["u1", "u2", "u3", "u4"];
    for (const u of users) {
      await store.createUser(u, u, START, `t_${u}`);
      ex.createAccount(u, u, START);
    }
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 600; i++) {
      const u = users[Math.floor(rnd() * users.length)]!;
      const marketId = ["m1", "m2", "m3"][Math.floor(rnd() * 3)]!;
      const outcome = rnd() < 0.5 ? "yes" : "no";
      try {
        if (rnd() < 0.15) {
          const open = ex.getOpenOrders(u);
          if (open[0]) ex.cancelOrder(u, open[0].id);
        } else if (rnd() < 0.2) {
          ex.placeOrder(u, {
            type: "market",
            marketId,
            outcome,
            side: "buy",
            amount: 1 + Math.floor(rnd() * 30_000),
          });
        } else {
          const side = rnd() < 0.65 ? "buy" : "sell";
          ex.placeOrder(u, {
            type: "limit",
            marketId,
            outcome,
            side,
            price: 10 * (1 + Math.floor(rnd() * 99)),
            shares: 1 + Math.floor(rnd() * 60),
          });
        }
      } catch {}
      if (rnd() < 0.05) await store.flush();
    }
    await store.stop();
    const { ex: ex2 } = await boot();
    expect(snapshot(ex2, users)).toEqual(snapshot(ex, users));
  });
});
