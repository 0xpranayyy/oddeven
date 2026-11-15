import type { AppType } from "@oddeven/api";
import { hc, type InferResponseType } from "hono/client";
import { useSession } from "./session";

const base = () =>
  typeof window === "undefined"
    ? `${process.env.API_URL ?? "http://localhost:8787"}/v1`
    : `${window.location.origin}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** End-to-end typed client generated from the API's route definitions. */
export const api = () =>
  hc<AppType>(base(), {
    headers: (): Record<string, string> => {
      const token = typeof window === "undefined" ? null : useSession.getState().token;
      return token ? { authorization: `Bearer ${token}` } : {};
    },
  });

/** Unwrap a typed response, throwing ApiError on non-2xx. */
export async function unwrap<T extends Response & { json(): Promise<unknown> }>(
  p: Promise<T>,
): Promise<Extract<Awaited<ReturnType<T["json"]>>, object>> {
  const res = await p;
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? "http", body.message ?? res.statusText);
  return body as never;
}

type Client = ReturnType<typeof api>;
export type EventDTO = InferResponseType<Client["events"][":slug"]["$get"], 200>["event"];
export type PortfolioDTO = InferResponseType<Client["me"]["$get"], 200>;
export type PublicTradeDTO = InferResponseType<Client["activity"]["$get"], 200>["trades"][number];

/** Server-side fetch with ISR-friendly caching for RSC pages. */
export async function serverGet<T>(path: string, revalidate = 2): Promise<T | null> {
  const res = await fetch(`${process.env.API_URL ?? "http://localhost:8787"}/v1${path}`, {
    next: { revalidate },
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as T;
}
