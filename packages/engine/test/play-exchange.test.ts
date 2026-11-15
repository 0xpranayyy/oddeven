import { PRICE_SCALE } from "@oddeven/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PlayExchange } from "../src";

const M = "m1";
const START = 1_000_000; // $1,000

let ex: PlayExchange;
const totalCash = () => ["alice", "bob", "carol"].reduce((s, u) => s + ex.getAccount(u)!.cash, 0);
const shares = (u: string, o: "yes" | "no") =>
  ex.getPositions(u).find((p) => p.marketId === M && p.outcome === o)?.shares ?? 0;

beforeEach(() => {
  ex = new PlayExchange({ now: () => 1_700_000_000_000 });
  ex.listMarket({ id: M, eventId: "e1", label: "Yes", question: "?", initialPrice: 500 });
  for (const u of ["alice", "bob", "carol"]) ex.createAccount(u, u, START);
});

describe("limit orders & escrow", () => {
  it("rests a bid and locks cash", () => {
    const { order, trades } = ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 600,
      shares: 100,
    });
    expect(trades).toHaveLength(0);
    expect(order.status).toBe("open");
    expect(ex.getAccount("alice")!.locked).toBe(60_000);
    expect(ex.getBook(M).bids).toEqual([{ price: 600, shares: 100 }]);
  });

  it("buy NO rests as a YES ask at the complement", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 380, shares: 50 });
    expect(ex.getBook(M).asks).toEqual([{ price: 620, shares: 50 }]);
    expect(ex.getAccount("bob")!.locked).toBe(380 * 50);
  });

  it("rejects off-tick prices and overspending", () => {
    expect(() =>
      ex.placeOrder("alice", {
        type: "limit",
        marketId: M,
        outcome: "yes",
        side: "buy",
        price: 605,
        shares: 1,
      }),
    ).toThrow(/multiple/);
    expect(() =>
      ex.placeOrder("alice", {
        type: "limit",
        marketId: M,
        outcome: "yes",
        side: "buy",
        price: 990,
        shares: 2000,
      }),
    ).toThrow(/Insufficient/);
  });

  it("cancel releases escrow", () => {
    const { order } = ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 600,
      shares: 100,
    });
    ex.cancelOrder("alice", order.id);
    expect(ex.getAccount("alice")!.locked).toBe(0);
    expect(ex.getBook(M).bids).toHaveLength(0);
  });
});

describe("matching", () => {
  it("mints: YES buyer vs NO buyer, at maker price, conserving $1 per pair", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 400, shares: 100 }); // ask 600
    const { trades } = ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 650,
      shares: 100,
    });
    expect(trades).toHaveLength(1);
    expect(trades[0]!.price).toBe(600); // maker price, alice gets improvement
    expect(ex.getAccount("alice")!.cash).toBe(START - 60_000);
    expect(ex.getAccount("alice")!.locked).toBe(0);
    expect(ex.getAccount("bob")!.cash).toBe(START - 40_000);
    expect(shares("alice", "yes")).toBe(100);
    expect(shares("bob", "no")).toBe(100);
    // Collateral in the system == shares minted * $1
    expect(3 * START - totalCash()).toBe(100 * PRICE_SCALE);
  });

  it("transfers: YES seller vs YES buyer", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 500, shares: 100 });
    ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 500,
      shares: 100,
    });
    // alice sells 40 YES to carol at 700
    ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "sell",
      price: 700,
      shares: 40,
    });
    ex.placeOrder("carol", { type: "market", marketId: M, outcome: "yes", side: "buy", amount: 28_000 });
    expect(shares("carol", "yes")).toBe(40);
    expect(shares("alice", "yes")).toBe(60);
    const alicePos = ex.getPositions("alice").find((p) => p.outcome === "yes")!;
    expect(alicePos.realizedPnl).toBe(40 * 200);
    expect(alicePos.cost).toBe(60 * 500);
  });

  it("merges: YES seller vs NO seller returns collateral", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 500, shares: 100 });
    ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 500,
      shares: 100,
    });
    ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "sell",
      price: 550,
      shares: 100,
    }); // ask 550
    ex.placeOrder("bob", {
      type: "limit",
      marketId: M,
      outcome: "no",
      side: "sell",
      price: 450,
      shares: 100,
    }); // bid 550
    expect(shares("alice", "yes")).toBe(0);
    expect(shares("bob", "no")).toBe(0);
    expect(totalCash()).toBe(3 * START); // all collateral returned
  });

  it("walks multiple levels with price-time priority", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 400, shares: 10 }); // ask 600
    ex.placeOrder("carol", {
      type: "limit",
      marketId: M,
      outcome: "no",
      side: "buy",
      price: 400,
      shares: 10,
    }); // ask 600, later
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 300, shares: 10 }); // ask 700
    const { trades } = ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 700,
      shares: 25,
    });
    expect(trades.map((t) => [t.makerId, t.price, t.shares])).toEqual([
      ["bob", 600, 10],
      ["carol", 600, 10],
      ["bob", 700, 5],
    ]);
  });

  it("market buy spends at most the amount and refunds the rest", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 400, shares: 10 }); // ask 600
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 300, shares: 100 }); // ask 700
    const { order } = ex.placeOrder("alice", {
      type: "market",
      marketId: M,
      outcome: "yes",
      side: "buy",
      amount: 10_000,
    });
    // 10 @ 600 = 6000, then floor(4000/700) = 5 @ 700 = 3500
    expect(order.filled).toBe(15);
    expect(ex.getAccount("alice")!.cash).toBe(START - 9_500);
    expect(ex.getAccount("alice")!.locked).toBe(0);
  });

  it("prevents self-trades by cancelling the resting order", () => {
    ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "no",
      side: "buy",
      price: 400,
      shares: 10,
    });
    const { trades } = ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 600,
      shares: 10,
    });
    expect(trades).toHaveLength(0);
    expect(ex.getBook(M).asks).toHaveLength(0);
    expect(ex.getAccount("alice")!.locked).toBe(600 * 10);
  });

  it("cannot sell shares you don't have", () => {
    expect(() =>
      ex.placeOrder("alice", {
        type: "limit",
        marketId: M,
        outcome: "yes",
        side: "sell",
        price: 500,
        shares: 1,
      }),
    ).toThrow(/enough shares/);
  });
});

describe("resolution", () => {
  it("pays winners $1/share, cancels orders, conserves cash", () => {
    ex.placeOrder("bob", { type: "limit", marketId: M, outcome: "no", side: "buy", price: 300, shares: 100 });
    ex.placeOrder("alice", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 700,
      shares: 100,
    });
    ex.placeOrder("carol", {
      type: "limit",
      marketId: M,
      outcome: "yes",
      side: "buy",
      price: 100,
      shares: 50,
    });
    ex.resolve(M, "yes");
    expect(ex.getAccount("alice")!.cash).toBe(START + 30_000);
    expect(ex.getAccount("bob")!.cash).toBe(START - 30_000);
    expect(ex.getAccount("carol")!.locked).toBe(0);
    expect(totalCash()).toBe(3 * START);
    expect(ex.getMarket(M)!.status).toBe("resolved");
    expect(() =>
      ex.placeOrder("alice", {
        type: "limit",
        marketId: M,
        outcome: "yes",
        side: "buy",
        price: 500,
        shares: 1,
      }),
    ).toThrow(/not accepting/);
  });
});

describe("fuzz: invariants hold under random flow", () => {
  it("cash + collateral is conserved and nothing goes negative", () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const users = ["alice", "bob", "carol"];
    for (let i = 0; i < 3000; i++) {
      const u = users[Math.floor(rnd() * 3)]!;
      const outcome = rnd() < 0.5 ? "yes" : "no";
      const side = rnd() < 0.6 ? "buy" : "sell";
      const price = 10 * (1 + Math.floor(rnd() * 99));
      try {
        if (rnd() < 0.15) {
          const open = ex.getOpenOrders(u);
          if (open[0]) ex.cancelOrder(u, open[0].id);
        } else if (rnd() < 0.2 && side === "buy") {
          ex.placeOrder(u, {
            type: "market",
            marketId: M,
            outcome,
            side,
            amount: 1 + Math.floor(rnd() * 20_000),
          });
        } else {
          ex.placeOrder(u, {
            type: "limit",
            marketId: M,
            outcome,
            side,
            price,
            shares: 1 + Math.floor(rnd() * 50),
          });
        }
      } catch {}
      for (const v of users) {
        const a = ex.getAccount(v)!;
        expect(a.cash).toBeGreaterThanOrEqual(0);
        expect(a.locked).toBeGreaterThanOrEqual(0);
        expect(a.locked).toBeLessThanOrEqual(a.cash);
        for (const p of ex.getPositions(v)) {
          expect(p.shares).toBeGreaterThanOrEqual(0);
          expect(p.locked).toBeGreaterThanOrEqual(0);
          expect(p.locked).toBeLessThanOrEqual(p.shares);
        }
      }
      // Outstanding YES == outstanding NO, and collateral backs them exactly.
      const yes = users.reduce((s, v) => s + shares(v, "yes"), 0);
      const no = users.reduce((s, v) => s + shares(v, "no"), 0);
      expect(yes).toBe(no);
      expect(3 * START - totalCash()).toBe(yes * PRICE_SCALE);
    }
    ex.resolve(M, rnd() < 0.5 ? "yes" : "no");
    expect(totalCash()).toBe(3 * START);
  });
});
