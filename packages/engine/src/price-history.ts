import type { PricePoint, Ticks } from "@oddeven/shared";

/**
 * Per-market YES price series, downsampled to at most one point per
 * `resolutionMs` (last price in the bucket wins).
 */
export class PriceHistory {
  private series = new Map<string, PricePoint[]>();
  constructor(private readonly resolutionMs = 5_000) {}

  load(marketId: string, points: PricePoint[]): void {
    this.series.set(
      marketId,
      [...points].sort((a, b) => a.t - b.t),
    );
  }

  record(marketId: string, t: number, p: Ticks, force = false): void {
    let s = this.series.get(marketId);
    if (!s) {
      s = [];
      this.series.set(marketId, s);
    }
    const last = s[s.length - 1];
    if (!force && last && t - last.t < this.resolutionMs) last.p = p;
    else s.push({ t, p });
  }

  /** Points since `from`, downsampled to roughly `maxPoints`. */
  range(marketId: string, from: number, maxPoints = 300): PricePoint[] {
    const s = this.series.get(marketId) ?? [];
    let i = s.length;
    while (i > 0 && s[i - 1]!.t >= from) i--;
    // Include the last point before the window so the line starts at the left edge.
    const window = s.slice(Math.max(0, i - 1));
    if (window.length <= maxPoints) return window;
    const step = window.length / maxPoints;
    const out: PricePoint[] = [];
    for (let k = 0; k < maxPoints; k++) out.push(window[Math.floor(k * step)]!);
    out.push(window[window.length - 1]!);
    return out;
  }

  /** Last known price at or before `t`. */
  priceAt(marketId: string, t: number): Ticks | undefined {
    const s = this.series.get(marketId);
    if (!s?.length) return undefined;
    let lo = 0;
    let hi = s.length - 1;
    if (s[0]!.t > t) return s[0]!.p;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid]!.t <= t) lo = mid;
      else hi = mid - 1;
    }
    return s[lo]!.p;
  }
}
