"use client";
import { motion } from "motion/react";
import { Odds } from "./numbers";

export function ProbabilityRing({ ticks, size = 56 }: { ticks: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const p = ticks / 1000;
  const color = p >= 0.5 ? "var(--yes)" : "var(--no)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ type: "spring", bounce: 0, duration: 0.8 }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <Odds ticks={ticks} className="text-[15px] font-semibold" flash={false} />
        <div className="mt-0.5 text-[9px] uppercase tracking-wider text-faint">chance</div>
      </div>
    </div>
  );
}
