"use client";
import type { HistoryRange, Market, PricePoint } from "@oddeven/shared";
import { useQueries } from "@tanstack/react-query";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  LineType,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { useMarkets } from "@/lib/hooks";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";

export const SERIES_COLORS = ["#7c6cff", "#22c38e", "#f5a524", "#f0567a", "#3ab7f0", "#a3d13f"];

/** Resolve any CSS color (incl. oklch) to rgb() via canvas, for the chart lib. */
function cssColor(varName: string, alpha = 1) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${((a / 255) * alpha).toFixed(3)})`;
}

const toData = (pts: PricePoint[]) => {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (const p of pts) {
    const time = Math.floor(p.t / 1000) as UTCTimestamp;
    const last = out[out.length - 1];
    if (last && last.time >= time) last.value = p.p / 10;
    else out.push({ time, value: p.p / 10 });
  }
  return out;
};

export function PriceChart({ markets, focusId }: { markets: Market[]; focusId: string }) {
  const [range, setRange] = useState<HistoryRange>("1w");
  const multi = markets.length > 1;
  const shown = multi ? [...markets].sort((a, b) => b.lastPrice - a.lastPrice).slice(0, 4) : markets;

  const queries = useQueries({
    queries: shown.map((m) => ({
      queryKey: ["history", m.id, range],
      queryFn: () =>
        unwrap(api().markets[":id"].history.$get({ param: { id: m.id }, query: { range } })).then(
          (r) => r.points,
        ),
      staleTime: 30_000,
    })),
  });

  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef(new Map<string, ISeriesApi<"Area" | "Line">>());
  const { resolvedTheme } = useTheme();
  const ready = queries.every((q) => q.data);

  // Build chart once data for this range is ready.
  useEffect(() => {
    if (!el.current || !ready) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssColor("--faint"),
        fontFamily: "var(--font-geist-mono), ui-monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: cssColor("--border") } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: {
        borderVisible: false,
        timeVisible: range === "1h" || range === "1d",
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: cssColor("--border-strong"), labelBackgroundColor: cssColor("--surface-3") },
        horzLine: { color: cssColor("--border-strong"), labelBackgroundColor: cssColor("--surface-3") },
      },
      handleScroll: false,
      handleScale: false,
    });
    shown.forEach((m, i) => {
      const color = multi ? SERIES_COLORS[i % SERIES_COLORS.length]! : cssColor("--brand");
      const opts = {
        lineWidth: 2 as const,
        lineType: LineType.Simple,
        priceFormat: { type: "custom" as const, formatter: (v: number) => `${v.toFixed(0)}%`, minMove: 0.1 },
        lastValueVisible: true,
        priceLineVisible: false,
      };
      const s = multi
        ? c.addSeries(LineSeries, { ...opts, color })
        : c.addSeries(AreaSeries, {
            ...opts,
            lineColor: color,
            topColor: cssColor("--brand", 0.28),
            bottomColor: cssColor("--brand", 0),
          });
      s.setData(toData(queries[i]!.data!));
      series.current.set(m.id, s);
    });
    c.timeScale().fitContent();
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, range, resolvedTheme, shown.map((m) => m.id).join()]);

  // Stream live prices onto the last bar.
  useEffect(
    () =>
      useMarkets.subscribe((s) => {
        for (const [id, ser] of series.current) {
          const m = s.markets[id];
          try {
            if (m)
              ser.update({ time: Math.floor(Date.now() / 1000) as UTCTimestamp, value: m.lastPrice / 10 });
          } catch {}
        }
      }),
    [],
  );

  return (
    <div>
      <div className="relative h-72 sm:h-80">
        {!ready && <Skeleton className="absolute inset-0" />}
        <div ref={el} className="absolute inset-0" data-focus={focusId} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {multi ? (
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            {shown.map((m, i) => (
              <span key={m.id} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                {m.label}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Segmented<HistoryRange>
          size="sm"
          value={range}
          onChange={setRange}
          options={(["1h", "1d", "1w", "1m", "all"] as const).map((r) => ({
            value: r,
            label: r.toUpperCase(),
          }))}
        />
      </div>
    </div>
  );
}
