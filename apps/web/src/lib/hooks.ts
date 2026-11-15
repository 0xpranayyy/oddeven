"use client";
import type { BookSnapshot, Market } from "@oddeven/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { ApiError, api, type PublicTradeDTO, unwrap } from "./api";
import { realtime } from "./realtime";
import { useSession } from "./session";

/* ----------------------------------------------------------- live markets */

interface MarketsState {
  markets: Record<string, Market>;
  upsert: (ms: Market[]) => void;
}

/** Live market state fed by the `markets` channel; RSC data seeds it. */
export const useMarkets = create<MarketsState>()((set) => ({
  markets: {},
  upsert: (ms) =>
    set((s) => {
      const next = { ...s.markets };
      for (const m of ms) next[m.id] = m;
      return { markets: next };
    }),
}));

export function useLiveMarket(initial: Market): Market {
  return useMarkets((s) => s.markets[initial.id]) ?? initial;
}

export function useLiveMarkets(initial: Market[]): Market[] {
  return useMarkets(useShallow((s) => initial.map((m) => s.markets[m.id] ?? m)));
}

export function useMarketsFeed() {
  useEffect(
    () => realtime.subscribe("markets", (_, data) => useMarkets.getState().upsert(data as Market[])),
    [],
  );
}

export function useConnected() {
  return useSyncExternalStore(
    (cb) => realtime.onStatus(cb),
    () => realtime.connected,
    () => false,
  );
}

/* ----------------------------------------------------------- book / trades */

export function useBook(marketId: string) {
  const [book, setBook] = useState<BookSnapshot | null>(null);
  useEffect(() => {
    setBook(null);
    return realtime.subscribe(`book:${marketId}`, (_, data) => setBook(data as BookSnapshot));
  }, [marketId]);
  return book;
}

export function useTrades(marketId?: string, limit = 40) {
  const key = marketId ? ["trades", marketId] : ["activity"];
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      marketId
        ? unwrap(api().markets[":id"].trades.$get({ param: { id: marketId } })).then((r) => r.trades)
        : unwrap(api().activity.$get()).then((r) => r.trades),
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(
    () =>
      realtime.subscribe(marketId ? `trades:${marketId}` : "activity", (_, t) =>
        qc.setQueryData<PublicTradeDTO[]>(key, (old) =>
          [t as PublicTradeDTO, ...(old ?? [])].slice(0, limit),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketId],
  );
  return q.data ?? [];
}

/* ----------------------------------------------------------- session / portfolio */

let creating: Promise<string> | null = null;

/** Lazily create a play-money guest session. */
export async function ensureSession(): Promise<string> {
  const existing = useSession.getState().token;
  if (existing) return existing;
  creating ??= unwrap(api().session.$post({ json: {} })).then((r) => {
    useSession.getState().setToken(r.token);
    creating = null;
    return r.token;
  });
  return creating;
}

export function usePortfolio() {
  const token = useSession((s) => s.token);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["me", token],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await unwrap(api().me.$get());
      } catch (e) {
        // Play-money server restarted: start a fresh session.
        if (e instanceof ApiError && e.status === 401) useSession.getState().setToken(null);
        throw e;
      }
    },
    retry: false,
  });
  useEffect(() => {
    if (!token) return;
    realtime.auth(token);
    return realtime.subscribe("user", () => qc.invalidateQueries({ queryKey: ["me", token] }));
  }, [token, qc]);
  return q;
}

/* ----------------------------------------------------------- misc */

/** Returns "up" | "down" for ~900ms after a value changes. */
export function useFlash(value: number) {
  const prev = useRef(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    setDir(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setDir(null), 900);
    return () => clearTimeout(t);
  }, [value]);
  return dir;
}
