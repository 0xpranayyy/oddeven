"use client";
import type { BookSnapshot, Market, Outcome, Side } from "@oddeven/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, api, unwrap } from "@/lib/api";
import { ensureSession, usePortfolio } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Usd } from "./numbers";
import { perspective } from "./order-book";
import { Button } from "./ui/button";
import { Segmented } from "./ui/segmented";

type Mode = "market" | "limit";

/** Walk the book to estimate a market buy of `amount` mills. */
function estimateBuy(book: BookSnapshot | null, outcome: Outcome, amount: number) {
  if (!book || amount <= 0) return null;
  let left = amount;
  let shares = 0;
  let cost = 0;
  for (const l of perspective(book, outcome).asks) {
    const n = Math.min(l.shares, Math.floor(left / l.price));
    if (n <= 0) break;
    shares += n;
    cost += n * l.price;
    left -= n * l.price;
  }
  return shares ? { shares, cost, avg: cost / shares, payout: shares * 1000 } : null;
}

function estimateSell(book: BookSnapshot | null, outcome: Outcome, shares: number) {
  if (!book || shares <= 0) return null;
  let left = shares;
  let proceeds = 0;
  for (const l of perspective(book, outcome).bids) {
    const n = Math.min(l.shares, left);
    proceeds += n * l.price;
    left -= n;
    if (!left) break;
  }
  const filled = shares - left;
  return filled ? { shares: filled, proceeds, avg: proceeds / filled } : null;
}

export function TradePanel({
  market,
  book,
  outcome,
  onOutcome,
  yesLabel = "Yes",
  noLabel = "No",
  title,
}: {
  market: Market;
  book: BookSnapshot | null;
  outcome: Outcome;
  onOutcome: (o: Outcome) => void;
  yesLabel?: string;
  noLabel?: string;
  title?: string;
}) {
  const [side, setSide] = useState<Side>("buy");
  const [mode, setMode] = useState<Mode>("market");
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [limit, setLimit] = useState("");
  const qc = useQueryClient();
  const { data: me } = usePortfolio();

  const persp = book ? perspective(book, outcome) : null;
  const yesPx = market.bestAsk ?? market.lastPrice;
  const noPx = 1000 - (market.bestBid ?? market.lastPrice);
  const held = me?.positions.find((p) => p.marketId === market.id && p.outcome === outcome);
  const available = held ? held.shares - held.locked : 0;
  const cash = me ? me.account.cash - me.account.locked : 0;

  const amountMills = Math.round(Number(amount || 0) * 1000);
  const sharesN = Math.floor(Number(shares || 0));
  const limitTicks = Math.round(Number(limit || 0) * 10);

  const buyEst = side === "buy" && mode === "market" ? estimateBuy(book, outcome, amountMills) : null;
  const sellEst = side === "sell" && mode === "market" ? estimateSell(book, outcome, sharesN) : null;
  const limitCost = mode === "limit" ? limitTicks * sharesN : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      await ensureSession();
      const json =
        mode === "limit"
          ? { type: "limit" as const, marketId: market.id, outcome, side, price: limitTicks, shares: sharesN }
          : side === "buy"
            ? {
                type: "market" as const,
                marketId: market.id,
                outcome,
                side: "buy" as const,
                amount: amountMills,
              }
            : {
                type: "market" as const,
                marketId: market.id,
                outcome,
                side: "sell" as const,
                shares: sharesN,
              };
      return unwrap(api().orders.$post({ json }));
    },
    onSuccess: ({ order }) => {
      const label = outcome === "yes" ? yesLabel : noLabel;
      if (order.status === "open" || order.status === "partial") {
        toast.success(`Limit order placed`, {
          description: `${side === "buy" ? "Buy" : "Sell"} ${order.shares - order.filled} ${label} @ ${order.price / 10}¢${order.filled ? ` · ${order.filled} filled` : ""}`,
        });
      } else if (order.filled > 0) {
        toast.success(`${side === "buy" ? "Bought" : "Sold"} ${order.filled.toLocaleString()} ${label}`, {
          description: title,
        });
      } else {
        toast.error("Order not filled");
      }
      setAmount("");
      setShares("");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const canSubmit =
    !mutation.isPending &&
    (mode === "limit"
      ? limitTicks >= 1 && limitTicks <= 999 && sharesN > 0
      : side === "buy"
        ? amountMills > 0 && !!buyEst
        : sharesN > 0 && !!sellEst);

  const outcomeLabel = outcome === "yes" ? yesLabel : noLabel;
  const cta = `${side === "buy" ? "Buy" : "Sell"} ${outcomeLabel}`;

  return (
    <div className="rounded-3xl border bg-surface p-4 shadow-card sm:p-5">
      {title && <div className="mb-3 truncate text-sm font-medium text-muted">{title}</div>}
      <div className="flex items-center justify-between gap-3">
        <Segmented<Side>
          size="sm"
          className="w-36"
          value={side}
          onChange={setSide}
          options={[
            { value: "buy", label: "Buy" },
            { value: "sell", label: "Sell" },
          ]}
        />
        <Segmented<Mode>
          size="sm"
          className="w-36"
          value={mode}
          onChange={setMode}
          options={[
            { value: "market", label: "Market" },
            { value: "limit", label: "Limit" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((o) => {
          const active = outcome === o;
          const px = o === "yes" ? yesPx : noPx;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onOutcome(o)}
              className={cn(
                "flex h-12 items-center justify-between rounded-xl px-4 text-[15px] font-semibold transition-all",
                o === "yes"
                  ? active
                    ? "bg-yes text-[oklch(0.2_0.05_155)] shadow-[0_8px_24px_-12px_var(--yes)]"
                    : "bg-yes-soft text-yes hover:bg-yes/20"
                  : active
                    ? "bg-no text-white shadow-[0_8px_24px_-12px_var(--no)]"
                    : "bg-no-soft text-no hover:bg-no/20",
              )}
            >
              <span className="truncate">{o === "yes" ? yesLabel : noLabel}</span>
              <span className="tnum font-medium opacity-90">{(px / 10).toFixed(0)}¢</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-4">
        {mode === "limit" && (
          <Field
            label="Limit price"
            hint={persp?.asks[0] ? `Best ask ${(persp.asks[0].price / 10).toFixed(1)}¢` : undefined}
          >
            <NumberInput
              value={limit}
              onChange={setLimit}
              suffix="¢"
              placeholder={`${(outcome === "yes" ? yesPx : noPx) / 10}`}
              step={1}
            />
          </Field>
        )}

        {side === "buy" && mode === "market" ? (
          <Field
            label="Amount"
            hint={
              me ? (
                <>
                  Cash <Usd mills={cash} />
                </>
              ) : (
                "Start with $1,000 play money"
              )
            }
          >
            <NumberInput value={amount} onChange={setAmount} prefix="$" placeholder="0" big />
            <div className="mt-2 flex gap-1.5">
              {[1, 10, 50, 100].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAmount(String(Number(amount || 0) + d))}
                  className="h-7 flex-1 rounded-lg bg-surface-2 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                >
                  +${d}
                </button>
              ))}
              <button
                type="button"
                disabled={!me}
                onClick={() => setAmount(String(Math.floor(cash / 10) / 100))}
                className="h-7 flex-1 rounded-lg bg-surface-2 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40"
              >
                Max
              </button>
            </div>
          </Field>
        ) : (
          <Field
            label="Shares"
            hint={side === "sell" ? `${available.toLocaleString()} available` : undefined}
          >
            <NumberInput value={shares} onChange={setShares} placeholder="0" big step={1} />
            {side === "sell" && available > 0 && (
              <div className="mt-2 flex gap-1.5">
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setShares(String(Math.floor(available * f)))}
                    className="h-7 flex-1 rounded-lg bg-surface-2 text-xs font-medium text-muted hover:bg-surface-3 hover:text-fg"
                  >
                    {f === 1 ? "Max" : `${f * 100}%`}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
      </div>

      <AnimatePresence initial={false}>
        {(buyEst || sellEst || limitCost > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="overflow-hidden"
          >
            <dl className="mt-4 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
              {buyEst && (
                <>
                  <Row k="Avg price" v={`${(buyEst.avg / 10).toFixed(1)}¢`} />
                  <Row k="Shares" v={buyEst.shares.toLocaleString()} />
                  <div className="flex items-end justify-between pt-1">
                    <dt className="text-muted">To win</dt>
                    <dd className="text-right">
                      <Usd mills={buyEst.payout} className="text-2xl font-semibold text-yes" />
                      <div className="text-xs text-yes">
                        +{(((buyEst.payout - buyEst.cost) / buyEst.cost) * 100).toFixed(0)}% if {outcomeLabel}
                      </div>
                    </dd>
                  </div>
                </>
              )}
              {sellEst && (
                <>
                  <Row k="Avg price" v={`${(sellEst.avg / 10).toFixed(1)}¢`} />
                  <div className="flex items-end justify-between pt-1">
                    <dt className="text-muted">You receive</dt>
                    <dd>
                      <Usd mills={sellEst.proceeds} className="text-2xl font-semibold" />
                    </dd>
                  </div>
                </>
              )}
              {limitCost > 0 && (
                <>
                  <Row k={side === "buy" ? "Cost" : "Proceeds"} v={`$${(limitCost / 1000).toFixed(2)}`} />
                  {side === "buy" && <Row k="To win" v={`$${sharesN.toLocaleString()}`} tone="yes" />}
                </>
              )}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        size="lg"
        variant={outcome === "yes" ? "yes" : "no"}
        className="mt-4 w-full"
        disabled={!canSubmit || market.status !== "open"}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <Loader2 className="animate-spin" />
        ) : market.status !== "open" ? (
          "Market closed"
        ) : (
          cta
        )}
      </Button>
      <p className="mt-3 text-center text-[11px] text-faint">Play money · no real funds at risk</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        {hint && <span className="tnum text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "yes" }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className={cn("tnum font-medium", tone === "yes" && "text-yes")}>{v}</dd>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  big,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  big?: boolean;
  step?: number;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-1 rounded-xl border bg-background px-4 transition-colors focus-within:border-brand",
        big ? "h-14" : "h-11",
      )}
    >
      {prefix && <span className={cn("text-faint", big && "text-2xl")}>{prefix}</span>}
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        step={step}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, "");
          if (/^\d*\.?\d{0,2}$/.test(v)) onChange(v);
        }}
        className={cn(
          "tnum w-full bg-transparent text-right font-semibold outline-none placeholder:text-faint",
          big ? "text-2xl" : "text-base",
        )}
      />
      {suffix && <span className="text-faint">{suffix}</span>}
    </label>
  );
}
