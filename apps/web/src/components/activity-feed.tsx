"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTrades } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";

export function ActivityFeed({ marketId, labels }: { marketId?: string; labels?: Record<string, string> }) {
  const trades = useTrades(marketId, 30);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (!trades.length) return <p className="py-8 text-center text-sm text-muted">No trades yet.</p>;
  return (
    <ul className="text-[13px]">
      <AnimatePresence initial={false}>
        {trades.map((t) => {
          const yes = t.takerOutcome === "yes";
          const px = yes ? t.price : 1000 - t.price;
          const notional = (px * t.shares) / 1000;
          return (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold uppercase text-muted">
                  {t.trader.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{t.trader}</span>{" "}
                  <span className="text-muted">{t.takerSide === "buy" ? "bought" : "sold"}</span>{" "}
                  <span className={cn("font-medium", yes ? "text-yes" : "text-no")}>
                    {t.shares.toLocaleString()} {yes ? "Yes" : "No"}
                  </span>{" "}
                  <span className="text-muted">at {(px / 10).toFixed(0)}¢</span>
                  {labels?.[t.marketId] && <span className="text-faint"> · {labels[t.marketId]}</span>}
                </span>
                <span className="tnum shrink-0 text-muted">
                  ${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="w-8 shrink-0 text-right text-xs text-faint">{timeAgo(t.ts)}</span>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
