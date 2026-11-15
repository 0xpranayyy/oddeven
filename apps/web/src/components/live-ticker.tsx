"use client";
import { AnimatePresence, motion } from "motion/react";
import { useTrades } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Live tape of the latest fills across all markets. */
export function LiveTicker({ labels }: { labels: Record<string, string> }) {
  const trades = useTrades(undefined, 12);
  return (
    <div className="relative flex h-9 w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border bg-surface px-3 text-xs">
      <span className="flex shrink-0 items-center gap-1.5 font-medium text-muted">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-yes" /> Live
      </span>
      <div className="relative flex min-w-0 flex-1 gap-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_2%,black_90%,transparent)]">
        <AnimatePresence initial={false} mode="popLayout">
          {trades.slice(0, 8).map((t) => {
            const yes = t.takerOutcome === "yes";
            const px = yes ? t.price : 1000 - t.price;
            return (
              <motion.span
                key={t.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted"
              >
                <span className="text-fg">{t.trader}</span>
                bought
                <span className={cn("font-medium", yes ? "text-yes" : "text-no")}>
                  {yes ? "Yes" : "No"} {Math.round(px / 10)}¢
                </span>
                <span className="max-w-48 truncate text-faint">{labels[t.marketId]}</span>
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
