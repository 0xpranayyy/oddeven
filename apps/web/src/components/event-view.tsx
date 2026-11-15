"use client";
import { formatCompactUsd, type Market, type Outcome } from "@oddeven/shared";
import { CalendarClock, ChevronLeft, ShieldCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState } from "react";
import type { EventDTO } from "@/lib/api";
import { useBook, useLiveMarkets, usePortfolio } from "@/lib/hooks";
import { cn, endsIn } from "@/lib/utils";
import { ActivityFeed } from "./activity-feed";
import { EventIcon } from "./market-card";
import { Change, Odds, Usd } from "./numbers";
import { OrderBook } from "./order-book";
import { PriceChart } from "./price-chart";
import { TradePanel } from "./trade-panel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Segmented } from "./ui/segmented";

type Tab = "book" | "activity" | "rules";

export function EventView({ event }: { event: EventDTO }) {
  const params = useSearchParams();
  const router = useRouter();
  const markets = useLiveMarkets(event.markets as Market[]);
  const multi = markets.length > 1;
  const sorted = multi ? [...markets].sort((a, b) => b.lastPrice - a.lastPrice) : markets;

  const [marketId, setMarketId] = useState(
    () => markets.find((m) => m.id === params.get("market"))?.id ?? sorted[0]!.id,
  );
  const [outcome, setOutcome] = useState<Outcome>(params.get("outcome") === "no" ? "no" : "yes");
  const [tab, setTab] = useState<Tab>("book");
  const [sheet, setSheet] = useState(false);

  const market = markets.find((m) => m.id === marketId) ?? sorted[0]!;
  const book = useBook(market.id);
  const labels = Object.fromEntries(markets.map((m) => [m.id, m.label]));

  const select = (id: string, o: Outcome, openSheet = false) => {
    setMarketId(id);
    setOutcome(o);
    router.replace(`/event/${event.slug}?market=${id}&outcome=${o}`, { scroll: false });
    if (openSheet) setSheet(true);
  };

  const yesLabel = multi ? "Yes" : market.label === "Yes" ? "Yes" : market.label;
  const noLabel = !multi && market.label === "Up" ? "Down" : "No";
  const panel = (
    <TradePanel
      market={market}
      book={book}
      outcome={outcome}
      onOutcome={setOutcome}
      yesLabel={yesLabel}
      noLabel={noLabel}
      title={multi ? market.label : undefined}
    />
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:pb-16">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Markets
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0">
          <header className="flex items-start gap-4">
            <EventIcon image={event.image} className="size-16 rounded-2xl text-3xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge className="capitalize">{event.category}</Badge>
                <span className="tnum">{formatCompactUsd(event.volume)} vol</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" /> {endsIn(event.endsAt)}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {event.title}
              </h1>
            </div>
          </header>

          {!multi && (
            <div className="mt-6 flex items-end gap-3">
              <Odds ticks={market.lastPrice} className="text-5xl font-semibold tracking-tighter" />
              <span className="pb-1.5 text-sm text-muted">chance</span>
              <Change from={market.price24hAgo} to={market.lastPrice} className="pb-1.5 text-sm" />
            </div>
          )}

          <section className="mt-6">
            <PriceChart markets={markets} focusId={market.id} />
          </section>

          {multi && (
            <section className="mt-8 overflow-hidden rounded-2xl border">
              <div className="grid grid-cols-[1fr_auto] border-b bg-surface-2/50 px-4 py-2 text-[11px] uppercase tracking-wider text-faint">
                <span>Outcome</span>
                <span>Chance</span>
              </div>
              <ul className="divide-y">
                {sorted.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors",
                      m.id === market.id ? "bg-surface-2" : "hover:bg-surface-2/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => select(m.id, outcome)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium">{m.label}</div>
                      <div className="text-xs text-faint tnum">{formatCompactUsd(m.volume)} vol</div>
                    </button>
                    <div className="w-20 text-right">
                      <Odds ticks={m.lastPrice} className="text-lg font-semibold" />
                      <Change from={m.price24hAgo} to={m.lastPrice} className="block text-[11px]" />
                    </div>
                    <div className="hidden gap-2 sm:flex">
                      <OutcomeButton
                        tone="yes"
                        ticks={m.bestAsk ?? m.lastPrice}
                        active={m.id === market.id && outcome === "yes"}
                        onClick={() => select(m.id, "yes")}
                      />
                      <OutcomeButton
                        tone="no"
                        ticks={1000 - (m.bestBid ?? m.lastPrice)}
                        active={m.id === market.id && outcome === "no"}
                        onClick={() => select(m.id, "no")}
                      />
                    </div>
                    <div className="flex gap-2 sm:hidden">
                      <OutcomeButton
                        tone="yes"
                        ticks={m.bestAsk ?? m.lastPrice}
                        active={false}
                        onClick={() => select(m.id, "yes", true)}
                      />
                      <OutcomeButton
                        tone="no"
                        ticks={1000 - (m.bestBid ?? m.lastPrice)}
                        active={false}
                        onClick={() => select(m.id, "no", true)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <Segmented<Tab>
                className="w-full max-w-sm"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "book", label: "Order book" },
                  { value: "activity", label: "Activity" },
                  { value: "rules", label: "Rules" },
                ]}
              />
              {tab === "book" && (
                <Segmented<Outcome>
                  size="sm"
                  value={outcome}
                  onChange={setOutcome}
                  options={[
                    { value: "yes", label: yesLabel, tone: "yes" },
                    { value: "no", label: noLabel, tone: "no" },
                  ]}
                />
              )}
            </div>
            <div className="mt-4 rounded-2xl border bg-surface p-3 sm:p-4">
              {tab === "book" && <OrderBook book={book} outcome={outcome} />}
              {tab === "activity" && (
                <ActivityFeed marketId={multi ? undefined : market.id} labels={multi ? labels : undefined} />
              )}
              {tab === "rules" && <Rules event={event} />}
            </div>
          </section>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            {panel}
            <YourPosition eventMarkets={markets} />
          </div>
        </aside>
      </div>

      {/* Mobile: bottom action bar + sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Button variant="yes" size="lg" onClick={() => select(market.id, "yes", true)}>
            Buy {yesLabel} {((market.bestAsk ?? market.lastPrice) / 10).toFixed(0)}¢
          </Button>
          <Button variant="no" size="lg" onClick={() => select(market.id, "no", true)}>
            Buy {noLabel} {((1000 - (market.bestBid ?? market.lastPrice)) / 10).toFixed(0)}¢
          </Button>
        </div>
      </div>
      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <AnimatePresence>
          {sheet && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild aria-describedby={undefined}>
                <motion.div
                  className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-background p-3 pb-6 lg:hidden"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.6 }}
                  onDragEnd={(_, i) => i.offset.y > 120 && setSheet(false)}
                >
                  <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3" />
                  <div className="mb-2 flex items-center justify-between px-1">
                    <Dialog.Title className="truncate text-sm font-semibold">{event.title}</Dialog.Title>
                    <Dialog.Close className="rounded-full p-1 text-muted hover:bg-surface-2">
                      <X className="size-5" />
                    </Dialog.Close>
                  </div>
                  {panel}
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  );
}

function OutcomeButton({
  tone,
  ticks,
  active,
  onClick,
}: {
  tone: "yes" | "no";
  ticks: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 w-[4.5rem] rounded-lg text-sm font-semibold tnum transition-colors",
        tone === "yes"
          ? active
            ? "bg-yes text-[oklch(0.2_0.05_155)]"
            : "bg-yes-soft text-yes hover:bg-yes/20"
          : active
            ? "bg-no text-white"
            : "bg-no-soft text-no hover:bg-no/20",
      )}
    >
      {tone === "yes" ? "Yes" : "No"} {(ticks / 10).toFixed(0)}¢
    </button>
  );
}

function Rules({ event }: { event: EventDTO }) {
  return (
    <div className="space-y-4 p-1 text-sm leading-relaxed">
      <p className="text-muted">{event.description}</p>
      <p>{event.rules}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-surface-2 p-3 text-xs">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-brand" />
          <span className="text-muted">Resolution source</span> {event.resolutionSource}
        </span>
        <span>
          <span className="text-muted">Closes</span>{" "}
          {new Date(event.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
    </div>
  );
}

function YourPosition({ eventMarkets }: { eventMarkets: Market[] }) {
  const { data } = usePortfolio();
  const ids = new Set(eventMarkets.map((m) => m.id));
  const rows = data?.positions.filter((p) => ids.has(p.marketId) && p.shares > 0) ?? [];
  if (!rows.length) return null;
  return (
    <div className="rounded-3xl border bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold">Your position</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((p) => (
          <li key={`${p.marketId}${p.outcome}`} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              <Badge tone={p.outcome === "yes" ? "yes" : "no"} className="mr-2 uppercase">
                {p.outcome}
              </Badge>
              {p.event.multi && <span className="text-muted">{p.market.label} · </span>}
              <span className="tnum">{p.shares.toLocaleString()}</span>
              <span className="text-faint"> @ {(p.avgPrice / 10).toFixed(1)}¢</span>
            </span>
            <span className="text-right">
              <Usd mills={p.value} className="block font-medium" />
              <span className={cn("tnum text-xs", p.unrealizedPnl >= 0 ? "text-yes" : "text-no")}>
                {p.unrealizedPnl >= 0 ? "+" : "−"}${Math.abs(p.unrealizedPnl / 1000).toFixed(2)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
