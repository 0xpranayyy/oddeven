"use client";
import { CATEGORIES, type Category, formatCompactUsd, type Market } from "@oddeven/shared";
import { ArrowUpRight, Flame, Sparkles, Timer, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventDTO } from "@/lib/api";
import { useLiveMarkets, useMarkets } from "@/lib/hooks";
import { cn, endsIn } from "@/lib/utils";
import { LiveTicker } from "./live-ticker";
import { EventIcon, MarketCard } from "./market-card";
import { Change, Odds } from "./numbers";
import { Sparkline } from "./sparkline";
import { Segmented } from "./ui/segmented";

type Sort = "trending" | "new" | "ending";

export function HomeView({ events }: { events: EventDTO[] }) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [sort, setSort] = useState<Sort>("trending");
  const labels = useMemo(
    () =>
      Object.fromEntries(
        events.flatMap((e) =>
          e.markets.map((m) => [m.id, e.markets.length > 1 ? `${e.title} · ${m.label}` : e.title]),
        ),
      ),
    [events],
  );

  const list = useMemo(() => {
    const filtered = events.filter((e) => category === "all" || e.category === category);
    const by = {
      trending: (a: EventDTO, b: EventDTO) => b.volume - a.volume,
      new: (a: EventDTO, b: EventDTO) => Number(b.id.slice(1)) - Number(a.id.slice(1)),
      ending: (a: EventDTO, b: EventDTO) => a.endsAt.localeCompare(b.endsAt),
    }[sort];
    return [...filtered].sort(by);
  }, [events, category, sort]);

  const featured = events.find((e) => e.featured) ?? events[0];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <div className="pt-4">
        <LiveTicker labels={labels} />
      </div>

      {featured && (
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Hero event={featured} />
          <TopMovers events={events} />
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            {[{ id: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
                  category === c.id ? "bg-fg text-background" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Segmented<Sort>
            size="sm"
            className="w-full sm:w-auto"
            value={sort}
            onChange={setSort}
            options={[
              {
                value: "trending",
                label: (
                  <span className="flex items-center gap-1">
                    <Flame className="size-3.5" />
                    Trending
                  </span>
                ),
              },
              {
                value: "new",
                label: (
                  <span className="flex items-center gap-1">
                    <Sparkles className="size-3.5" />
                    New
                  </span>
                ),
              },
              {
                value: "ending",
                label: (
                  <span className="flex items-center gap-1">
                    <Timer className="size-3.5" />
                    Ending
                  </span>
                ),
              },
            ]}
          />
        </div>

        <motion.div layout className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {list.map((e) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              >
                <MarketCard event={e} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>
    </div>
  );
}

function Hero({ event }: { event: EventDTO }) {
  const markets = useLiveMarkets(event.markets as Market[]);
  const multi = markets.length > 1;
  const lead = markets.reduce((a, b) => (b.lastPrice > a.lastPrice ? b : a));
  return (
    <Link
      href={`/event/${event.slug}`}
      className="group relative min-w-0 overflow-hidden rounded-3xl border bg-surface p-5 shadow-card transition-colors hover:border-border-strong sm:p-8"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative flex items-center gap-2 text-xs font-medium text-muted">
        <span className="rounded-full bg-brand/12 px-2 py-0.5 text-brand">Featured</span>
        <span className="capitalize">{event.category}</span>
        <span>·</span>
        <span>{endsIn(event.endsAt)}</span>
      </div>
      <div className="relative mt-4 flex items-start gap-4">
        <EventIcon image={event.image} className="size-14 text-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{event.title}</h1>
        <ArrowUpRight className="ml-auto size-5 shrink-0 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
      </div>

      <div className="relative mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <div className="text-sm text-muted">{multi ? lead.label : "Chance"}</div>
          <Odds ticks={lead.lastPrice} className="text-6xl font-semibold tracking-tighter" />
          <div className="mt-1 text-sm">
            <Change from={lead.price24hAgo} to={lead.lastPrice} /> <span className="text-faint">24h</span>
          </div>
        </div>
        <Sparkline points={event.spark} className="h-24" />
      </div>

      {multi && (
        <div className="relative mt-6 flex flex-wrap gap-2">
          {[...markets]
            .sort((a, b) => b.lastPrice - a.lastPrice)
            .map((m) => (
              <span
                key={m.id}
                className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm"
              >
                {m.label} <Odds ticks={m.lastPrice} className="font-semibold" />
              </span>
            ))}
        </div>
      )}
      <div className="relative mt-6 text-xs text-faint tnum">{formatCompactUsd(event.volume)} volume</div>
    </Link>
  );
}

function TopMovers({ events }: { events: EventDTO[] }) {
  const live = useMarkets((s) => s.markets);
  const rows = events
    .flatMap((e) => e.markets.map((m) => ({ e, m: (live[m.id] ?? m) as Market })))
    .filter((r) => r.m.status === "open")
    .sort((a, b) => Math.abs(b.m.lastPrice - b.m.price24hAgo) - Math.abs(a.m.lastPrice - a.m.price24hAgo))
    .slice(0, 6);
  return (
    <aside className="rounded-3xl border bg-surface p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="size-4 text-brand" /> Top movers{" "}
        <span className="font-normal text-faint">24h</span>
      </h2>
      <ul className="mt-3 divide-y">
        {rows.map(({ e, m }) => (
          <li key={m.id}>
            <Link
              href={`/event/${e.slug}?market=${m.id}`}
              className="flex items-center gap-3 py-2.5 hover:opacity-80"
            >
              <EventIcon image={e.image} className="size-8 rounded-lg text-sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{e.title}</span>
                {e.markets.length > 1 && <span className="block truncate text-xs text-faint">{m.label}</span>}
              </span>
              <span className="text-right">
                <Odds ticks={m.lastPrice} className="block text-sm font-semibold" />
                <Change from={m.price24hAgo} to={m.lastPrice} className="text-xs" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
