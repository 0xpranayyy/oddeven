"use client";
import NumberFlow from "@number-flow/react";
import { useFlash } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Animated probability, e.g. 62%. Ticks in, percent out. */
export function Odds({
  ticks,
  className,
  flash = true,
}: {
  ticks: number;
  className?: string;
  flash?: boolean;
}) {
  const dir = useFlash(ticks);
  return (
    <span
      className={cn(
        "tnum rounded-md transition-colors",
        flash && dir === "up" && "text-yes",
        flash && dir === "down" && "text-no",
        className,
      )}
    >
      <NumberFlow value={Math.round(ticks / 10)} suffix="%" willChange />
    </span>
  );
}

/** Animated cents, e.g. 62¢ or 62.5¢. */
export function Cents({ ticks, className }: { ticks: number; className?: string }) {
  return (
    <NumberFlow
      className={cn("tnum", className)}
      value={ticks / 10}
      format={{ maximumFractionDigits: 1 }}
      suffix="¢"
    />
  );
}

/** Animated dollars from mills. */
export function Usd({ mills, className, compact }: { mills: number; className?: string; compact?: boolean }) {
  return (
    <NumberFlow
      className={cn("tnum", className)}
      value={mills / 1000}
      format={{
        style: "currency",
        currency: "USD",
        ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : { minimumFractionDigits: 2 }),
      }}
    />
  );
}

export function Change({ from, to, className }: { from: number; to: number; className?: string }) {
  const d = Math.round((to - from) / 10);
  if (d === 0) return <span className={cn("tnum text-faint", className)}>0%</span>;
  return (
    <span className={cn("tnum", d > 0 ? "text-yes" : "text-no", className)}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}%
    </span>
  );
}
