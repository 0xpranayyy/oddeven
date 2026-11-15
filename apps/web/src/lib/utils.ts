import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const pct = (ticks: number) => Math.round(ticks / 10);

export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function endsIn(iso: string) {
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d <= 0) return "Ends today";
  if (d === 1) return "Ends tomorrow";
  if (d < 60) return `Ends in ${d}d`;
  return `Ends ${new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}
