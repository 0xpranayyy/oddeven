import type { PlayExchange } from "@oddeven/engine";
import type { MarketEvent } from "@oddeven/shared";
import { mulberry32 } from "./seed";

const MM_ID = "bot_mm";
const TRADERS = [
  "quant_otter",
  "whale.eth",
  "degen_42",
  "paper_hands",
  "fomo_frank",
  "theta_gang",
  "base_rate",
  "superforecaster",
  "contrarian.sol",
  "macro_mia",
  "late_night_lp",
  "kelly_bet",
];
const BOT_CASH = 1_000_000_000_000;

export const isBot = (userId: string) => userId.startsWith("bot_");

/**
 * Simulated liquidity for play money:
 * - one market maker quoting a ladder around a latent "fair" probability
 *   (multi-outcome events stay normalized to ~100%)
 * - noise traders whose flow leans toward fair value, so prices drift realistically
 */
export function startBots(ex: PlayExchange, events: Map<string, MarketEvent>) {
  const rnd = mulberry32(Date.now() & 0xffff);
  // Accounts may already exist (restored from the database).
  if (!ex.hasAccount(MM_ID)) ex.createAccount(MM_ID, "OddEven MM", BOT_CASH);
  for (const t of TRADERS) if (!ex.hasAccount(`bot_${t}`)) ex.createAccount(`bot_${t}`, t, BOT_CASH);

  // Latent log-weights per market.
  const logw = new Map<string, number>();
  const groups = [...events.values()].map((e) => e.marketIds);
  for (const ids of groups) {
    for (const id of ids) {
      const p = ex.getMarket(id)!.lastPrice / 1000;
      logw.set(id, ids.length > 1 ? Math.log(p) : Math.log(p / (1 - p)));
    }
  }

  const fair = (ids: string[], id: string) => {
    if (ids.length === 1) return 1 / (1 + Math.exp(-logw.get(id)!));
    const total = ids.reduce((s, m) => s + Math.exp(logw.get(m)!), 0);
    return Math.exp(logw.get(id)!) / total;
  };
  const clampTick = (p: number) => Math.min(990, Math.max(10, Math.round(p / 10) * 10));

  const quote = (ids: string[]) => {
    for (const id of ids) {
      const m = ex.getMarket(id);
      if (m?.status !== "open") continue;
      ex.cancelAll(MM_ID, id);
      const f = clampTick(fair(ids, id) * 1000);
      for (let k = 0; k < 6; k++) {
        const bid = clampTick(f - 10 - k * 10);
        const ask = clampTick(f + 10 + k * 10);
        const size = () => Math.round((80 + rnd() * 900) * (1 + k * 0.35));
        try {
          if (bid < f)
            ex.placeOrder(MM_ID, {
              type: "limit",
              marketId: id,
              outcome: "yes",
              side: "buy",
              price: bid,
              shares: size(),
            });
          if (ask > f)
            ex.placeOrder(MM_ID, {
              type: "limit",
              marketId: id,
              outcome: "no",
              side: "buy",
              price: 1000 - ask,
              shares: size(),
            });
        } catch {}
      }
    }
  };

  for (const ids of groups) quote(ids);

  const tick = () => {
    // Drift latent beliefs; occasional news shock.
    for (const ids of groups) {
      for (const id of ids) {
        const shock = rnd() < 0.002 ? (rnd() - 0.5) * 0.8 : 0;
        logw.set(id, logw.get(id)! + (rnd() - 0.5) * 0.03 + shock);
      }
    }
    // Requote a few groups each tick.
    for (let i = 0; i < 3; i++) quote(groups[Math.floor(rnd() * groups.length)]!);

    // Noise flow.
    if (rnd() < 0.7) {
      const ids = groups[Math.floor(rnd() * groups.length)]!;
      const id = ids[Math.floor(rnd() * ids.length)]!;
      const m = ex.getMarket(id);
      if (m?.status !== "open") return;
      const trader = `bot_${TRADERS[Math.floor(rnd() * TRADERS.length)]}`;
      const f = fair(ids, id) * 1000;
      const lean = (f - m.lastPrice) / 100; // buy YES when cheap vs fair
      const outcome = rnd() < 0.5 + Math.max(-0.3, Math.min(0.3, lean)) ? "yes" : "no";
      const whale = rnd() < 0.05;
      const amount = Math.round((whale ? 2_000 + rnd() * 20_000 : 5 + rnd() * 400) * 1000);
      try {
        ex.placeOrder(trader, { type: "market", marketId: id, outcome, side: "buy", amount });
      } catch {}
    }
  };

  const timer = setInterval(tick, 600);
  const stats = setInterval(() => ex.refreshStats(), 60_000);
  return () => {
    clearInterval(timer);
    clearInterval(stats);
  };
}
