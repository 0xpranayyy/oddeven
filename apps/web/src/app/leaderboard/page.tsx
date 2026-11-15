import { Trophy } from "lucide-react";
import { serverGet } from "@/lib/api";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const data = await serverGet<{ rows: { name: string; equity: number; pnl: number }[] }>("/leaderboard", 5);
  const rows = data?.rows ?? [];
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Trophy className="size-6 text-brand" /> Leaderboard
      </h1>
      <p className="mt-1 text-sm text-muted">Top play-money traders by all-time profit.</p>
      <ol className="mt-6 divide-y overflow-hidden rounded-2xl border bg-surface">
        {rows.length === 0 && (
          <li className="p-10 text-center text-sm text-muted">No traders yet. Be the first.</li>
        )}
        {rows.map((r, i) => (
          <li key={`${r.name}${i}`} className="flex items-center gap-4 px-4 py-3">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-xs font-semibold tnum",
                i === 0 ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted",
              )}
            >
              {i + 1}
            </span>
            <span className="flex-1 font-medium">{r.name}</span>
            <span className={cn("tnum font-semibold", r.pnl >= 0 ? "text-yes" : "text-no")}>
              {r.pnl >= 0 ? "+" : "−"}$
              {Math.abs(r.pnl / 1000).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
