"use client";
import { formatCompactUsd, type Market } from "@oddeven/shared";
import { motion } from "motion/react";
import Link from "next/link";
import type { EventDTO } from "@/lib/api";
import { useLiveMarket, useLiveMarkets } from "@/lib/hooks";
import { cn, endsIn } from "@/lib/utils";
import { Odds } from "./numbers";
import { ProbabilityRing } from "./probability-ring";
import { Sparkline } from "./sparkline";

type CardEvent = EventDTO;

export function EventIcon({ image, className }: { image: string; className?: string }) {
  return (
    <div
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-surface-3 to-surface-2 text-xl ring-1 ring-border",
        className,
      )}
    >
      {image}
    </div>
  );
}

export function MarketCard({ event }: { event: CardEvent }) {
  const multi = event.markets.length > 1;
  const lead = useLiveMarket(event.markets[0]! as Market);
  return (
    <motion.article
      layout
      whileHover={{ y: -2 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
      className="group relative flex flex-col rounded-[var(--radius-card)] border bg-surface p-4 shadow-card transition-colors hover:border-border-strong"
    >
      <Link
        href={`/event/${event.slug}`}
        className="absolute inset-0 z-0 rounded-[inherit]"
        aria-label={event.title}
      />
      <div className="flex items-start gap-3">
        <EventIcon image={event.image} />
        <h3 className="line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-balance">
          {event.title}
        </h3>
        {!multi && <ProbabilityRing ticks={lead.lastPrice} />}
      </div>

      <div className="mt-4 flex-1">
        {multi ? <MultiRows event={event} /> : <BinaryButtons event={event} />}
      </div>

      <footer className="mt-4 flex items-center justify-between text-xs text-faint">
        <span className="tnum">{formatCompactUsd(event.volume)} vol</span>
        {!multi && <Sparkline points={event.spark} className="mx-3 h-5 w-20 opacity-80" />}
        <span>{endsIn(event.endsAt)}</span>
      </footer>
    </motion.article>
  );
}

function BinaryButtons({ event }: { event: CardEvent }) {
  const m = useLiveMarket(event.markets[0]! as Market);
  const yes = m.bestAsk ?? m.lastPrice;
  const no = 1000 - (m.bestBid ?? m.lastPrice);
  const yesLabel = m.label === "Yes" ? "Yes" : m.label;
  return (
    <div className="relative z-10 grid grid-cols-2 gap-2">
      <TradeLink
        slug={event.slug}
        marketId={m.id}
        outcome="yes"
        tone="yes"
        label={`Buy ${yesLabel}`}
        ticks={yes}
      />
      <TradeLink
        slug={event.slug}
        marketId={m.id}
        outcome="no"
        tone="no"
        label={yesLabel === "Up" ? "Buy Down" : "Buy No"}
        ticks={no}
      />
    </div>
  );
}

function TradeLink(props: {
  slug: string;
  marketId: string;
  outcome: "yes" | "no";
  tone: "yes" | "no";
  label: string;
  ticks: number;
}) {
  return (
    <Link
      href={`/event/${props.slug}?market=${props.marketId}&outcome=${props.outcome}`}
      className={cn(
        "flex h-10 items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors",
        props.tone === "yes"
          ? "bg-yes-soft text-yes hover:bg-yes hover:text-[oklch(0.2_0.05_155)]"
          : "bg-no-soft text-no hover:bg-no hover:text-white",
      )}
    >
      <span className="truncate">{props.label}</span>
      <span className="tnum opacity-80">{Math.round(props.ticks / 10)}¢</span>
    </Link>
  );
}

function MultiRows({ event }: { event: CardEvent }) {
  const live = useLiveMarkets(event.markets as Market[]);
  const top = [...live].sort((a, b) => b.lastPrice - a.lastPrice).slice(0, 3);
  return (
    <ul className="relative z-10 space-y-2">
      {top.map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-sm">
          <div className="relative flex h-8 flex-1 items-center overflow-hidden rounded-lg bg-surface-2 px-2.5">
            <motion.div
              className="absolute inset-y-0 left-0 bg-brand/12"
              initial={false}
              animate={{ width: `${m.lastPrice / 10}%` }}
              transition={{ type: "spring", bounce: 0, duration: 0.6 }}
            />
            <span className="relative truncate">{m.label}</span>
          </div>
          <Odds ticks={m.lastPrice} className="w-11 text-right font-semibold" />
          <Link
            href={`/event/${event.slug}?market=${m.id}&outcome=yes`}
            className="grid h-8 w-11 place-items-center rounded-lg bg-yes-soft text-xs font-semibold text-yes hover:bg-yes hover:text-[oklch(0.2_0.05_155)]"
          >
            Yes
          </Link>
          <Link
            href={`/event/${event.slug}?market=${m.id}&outcome=no`}
            className="grid h-8 w-11 place-items-center rounded-lg bg-no-soft text-xs font-semibold text-no hover:bg-no hover:text-white"
          >
            No
          </Link>
        </li>
      ))}
    </ul>
  );
}
