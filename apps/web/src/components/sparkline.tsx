import { cn } from "@/lib/utils";

export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, 20);
  const w = 100;
  const h = 32;
  const xy = points.map(
    (p, i) => [(i / (points.length - 1)) * w, h - ((p - min) / span) * (h - 4) - 2] as const,
  );
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const up = points[points.length - 1]! >= points[0]!;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`sg-${up}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={up ? "var(--yes)" : "var(--no)"} stopOpacity="0.25" />
          <stop offset="1" stopColor={up ? "var(--yes)" : "var(--no)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${w},${h}L0,${h}Z`} fill={`url(#sg-${up})`} />
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--yes)" : "var(--no)"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
