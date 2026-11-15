"use client";
import type { BookLevel, BookSnapshot, Outcome } from "@oddeven/shared";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

/** Re-express the YES book from the perspective of `outcome`. */
export function perspective(book: BookSnapshot, outcome: Outcome) {
  if (outcome === "yes") return { bids: book.bids, asks: book.asks };
  const flip = (l: BookLevel) => ({ price: 1000 - l.price, shares: l.shares });
  return { bids: book.asks.map(flip), asks: book.bids.map(flip) };
}

export function OrderBook({
  book,
  outcome,
  depth = 7,
}: {
  book: BookSnapshot | null;
  outcome: Outcome;
  depth?: number;
}) {
  if (!book) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    );
  }
  const { bids, asks } = perspective(book, outcome);
  const a = asks.slice(0, depth);
  const b = bids.slice(0, depth);
  const max = Math.max(1, ...a.map((l) => l.shares), ...b.map((l) => l.shares));
  const spread = a[0] && b[0] ? a[0].price - b[0].price : null;

  return (
    <div className="text-[13px]">
      <div className="grid grid-cols-3 px-2 pb-2 text-[11px] uppercase tracking-wider text-faint">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex flex-col-reverse">
        {a.map((l) => (
          <Row key={`a${l.price}`} level={l} max={max} tone="no" />
        ))}
      </div>
      <div className="my-1 flex items-center justify-between border-y px-2 py-1.5 text-xs text-muted">
        <span>Spread</span>
        <span className="tnum">{spread === null ? "—" : `${(spread / 10).toFixed(1)}¢`}</span>
      </div>
      {b.map((l) => (
        <Row key={`b${l.price}`} level={l} max={max} tone="yes" />
      ))}
    </div>
  );
}

function Row({ level, max, tone }: { level: BookLevel; max: number; tone: "yes" | "no" }) {
  return (
    <div className="relative grid h-7 grid-cols-3 items-center px-2 tnum">
      <motion.div
        className={cn(
          "absolute inset-y-0.5 right-0 rounded-md",
          tone === "yes" ? "bg-yes-soft" : "bg-no-soft",
        )}
        initial={false}
        animate={{ width: `${(level.shares / max) * 100}%` }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
      />
      <span className={cn("relative font-medium", tone === "yes" ? "text-yes" : "text-no")}>
        {(level.price / 10).toFixed(1)}¢
      </span>
      <span className="relative text-right">{level.shares.toLocaleString()}</span>
      <span className="relative text-right text-muted">
        ${((level.price * level.shares) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}
