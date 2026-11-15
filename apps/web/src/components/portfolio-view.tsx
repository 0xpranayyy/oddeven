"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, api, unwrap } from "@/lib/api";
import { ensureSession, usePortfolio } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { cn, timeAgo } from "@/lib/utils";
import { EventIcon } from "./market-card";
import { Usd } from "./numbers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";

type Tab = "positions" | "orders" | "settled";

export function PortfolioView() {
  const token = useSession((s) => s.token);
  const { data, isLoading } = usePortfolio();
  const [tab, setTab] = useState<Tab>("positions");
  const qc = useQueryClient();

  const start = useMutation({
    mutationFn: ensureSession,
    onSuccess: () => toast.success("You've got $1,000 in play money", { description: "Go make some calls." }),
  });
  const faucet = useMutation({
    mutationFn: () => unwrap(api().me.faucet.$post()),
    onSuccess: () => {
      toast.success("+$1,000 play money");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => unwrap(api().orders[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  if (!token) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-24 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Wallet className="size-7" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Start trading with $1,000</h1>
        <p className="mt-2 text-muted">
          OddEven is in play-money mode. No sign-up, no wallet. Just your read on the world.
        </p>
        <Button variant="brand" size="lg" className="mt-8 w-full" onClick={() => start.mutate()}>
          Get play money
        </Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const open = data.positions.filter((p) => p.shares > 0);
  const settled = data.positions.filter((p) => p.shares === 0);
  const unrealized = open.reduce((s, p) => s + p.unrealizedPnl, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Portfolio value" big>
          <Usd mills={data.equity} />
        </Stat>
        <Stat label="Cash">
          <Usd mills={data.account.cash - data.account.locked} />
        </Stat>
        <Stat label="Positions">
          <Usd mills={data.positionsValue} />
        </Stat>
        <Stat label="All-time P&L">
          <span className={cn(data.pnl >= 0 ? "text-yes" : "text-no")}>
            {data.pnl >= 0 ? "+" : "−"}
            <Usd mills={Math.abs(data.pnl)} />
          </span>
        </Stat>
      </section>
      <div className="mt-3 flex items-center justify-between text-xs text-faint">
        <span>
          {data.account.name} · Unrealized{" "}
          <span className={unrealized >= 0 ? "text-yes" : "text-no"}>
            {unrealized >= 0 ? "+" : "−"}${Math.abs(unrealized / 1000).toFixed(2)}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => faucet.mutate()}>
          Top up play money
        </Button>
      </div>

      <div className="mt-8">
        <Segmented<Tab>
          className="max-w-md"
          value={tab}
          onChange={setTab}
          options={[
            { value: "positions", label: `Positions ${open.length || ""}` },
            { value: "orders", label: `Open orders ${data.orders.length || ""}` },
            { value: "settled", label: "History" },
          ]}
        />
        <div className="mt-4 overflow-hidden rounded-2xl border bg-surface">
          {tab === "positions" &&
            (open.length ? (
              <ul className="divide-y">
                {open.map((p) => (
                  <li key={`${p.marketId}${p.outcome}`}>
                    <Link
                      href={`/event/${p.event.slug}?market=${p.marketId}&outcome=${p.outcome}`}
                      className="flex items-center gap-4 p-4 hover:bg-surface-2/60"
                    >
                      <EventIcon image={p.event.image} className="size-10" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.event.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <Badge tone={p.outcome === "yes" ? "yes" : "no"} className="uppercase">
                            {p.outcome}
                          </Badge>
                          {p.event.multi && <span>{p.market.label}</span>}
                          <span className="tnum">
                            {p.shares.toLocaleString()} @ {(p.avgPrice / 10).toFixed(1)}¢ →{" "}
                            {(p.price / 10).toFixed(1)}¢
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <Usd mills={p.value} className="font-semibold" />
                        <div className={cn("tnum text-xs", p.unrealizedPnl >= 0 ? "text-yes" : "text-no")}>
                          {p.unrealizedPnl >= 0 ? "+" : "−"}${Math.abs(p.unrealizedPnl / 1000).toFixed(2)}
                          {p.cost > 0 && ` (${((p.unrealizedPnl / p.cost) * 100).toFixed(1)}%)`}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                No positions yet.{" "}
                <Link href="/" className="text-brand">
                  Browse markets →
                </Link>
              </Empty>
            ))}

          {tab === "orders" &&
            (data.orders.length ? (
              <ul className="divide-y">
                {data.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-4 p-4">
                    <EventIcon image={o.event.image} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{o.event.title}</div>
                      <div className="mt-0.5 text-xs text-muted tnum">
                        {o.side === "buy" ? "Buy" : "Sell"}{" "}
                        <span className={o.outcome === "yes" ? "text-yes" : "text-no"}>
                          {o.outcome.toUpperCase()}
                        </span>{" "}
                        {o.market.label !== "Yes" && `${o.market.label} · `}
                        {o.filled}/{o.shares} @ {(o.price / 10).toFixed(1)}¢ · {timeAgo(o.createdAt)} ago
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancel.mutate(o.id)}
                      aria-label="Cancel order"
                    >
                      <X /> Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No open orders.</Empty>
            ))}

          {tab === "settled" && <Fills />}
          {tab === "settled" && settled.length > 0 && (
            <ul className="divide-y">
              {settled.map((p) => (
                <li key={`${p.marketId}${p.outcome}`} className="flex items-center gap-4 p-4">
                  <EventIcon image={p.event.image} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.event.title}</div>
                    <div className="text-xs text-muted">
                      {p.outcome.toUpperCase()} {p.event.multi && `· ${p.market.label}`}{" "}
                      {p.market.status === "resolved"
                        ? `· Resolved ${p.market.resolvedOutcome?.toUpperCase()}`
                        : "· Closed out"}
                    </div>
                  </div>
                  <span className={cn("tnum font-semibold", p.realizedPnl >= 0 ? "text-yes" : "text-no")}>
                    {p.realizedPnl >= 0 ? "+" : "−"}${Math.abs(p.realizedPnl / 1000).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, children, big }: { label: string; children: React.ReactNode; big?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-card",
        big && "sm:bg-gradient-to-br sm:from-brand/10 sm:to-transparent",
      )}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 font-semibold tracking-tight", big ? "text-3xl" : "text-xl")}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-10 text-center text-sm text-muted">{children}</p>;
}

function Fills() {
  const token = useSession((s) => s.token);
  const { data, isLoading } = useQuery({
    queryKey: ["history", token],
    queryFn: () => unwrap(api().me.history.$get()),
    enabled: !!token,
    refetchInterval: 5_000,
  });
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (!data?.fills.length) return <Empty>Your trades will show up here.</Empty>;
  return (
    <ul className="divide-y border-b">
      {data.fills.map((f) => (
        <li key={`${f.id}${f.role}`}>
          <Link
            href={`/event/${f.event.slug}?market=${f.market.id}&outcome=${f.outcome}`}
            className="flex items-center gap-4 p-4 hover:bg-surface-2/60"
          >
            <EventIcon image={f.event.image} className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{f.event.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span className={f.side === "buy" ? "text-fg" : "text-muted"}>
                  {f.side === "buy" ? "Bought" : "Sold"}
                </span>
                <Badge tone={f.outcome === "yes" ? "yes" : "no"} className="uppercase">
                  {f.outcome}
                </Badge>
                {f.event.multi && <span>{f.market.label}</span>}
                <span className="tnum">
                  {f.shares.toLocaleString()} @ {(f.price / 10).toFixed(1)}¢
                </span>
                {f.role === "maker" && <span className="text-faint">· limit</span>}
              </div>
            </div>
            <div className="text-right">
              <Usd mills={f.notional} className="font-medium" />
              <div className="text-xs text-faint">{timeAgo(f.ts)} ago</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
