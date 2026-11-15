/**
 * All money is integer. Never floats.
 *
 * - Price: integer "ticks" in [1, 999]; 1000 ticks = $1.00 = certainty.
 *   A YES price of 620 means 62.0% / $0.62 per share.
 * - Shares: integer whole shares. Each winning share pays 1000 ticks ($1).
 * - Cash: integer "mills" (1/1000 of a dollar), so price * shares = cash.
 */
export const PRICE_SCALE = 1000;
export const MIN_PRICE = 1;
export const MAX_PRICE = PRICE_SCALE - 1;
export const MILLS_PER_DOLLAR = 1000;

export type Ticks = number;
export type Mills = number;

export const complement = (p: Ticks): Ticks => PRICE_SCALE - p;

export const isValidPrice = (p: number, tickSize = 1): boolean =>
  Number.isInteger(p) && p >= MIN_PRICE && p <= MAX_PRICE && p % tickSize === 0;

export const dollarsToMills = (d: number): Mills => Math.round(d * MILLS_PER_DOLLAR);
export const millsToDollars = (m: Mills): number => m / MILLS_PER_DOLLAR;

/** 620 -> 62 (percent). */
export const ticksToPercent = (p: Ticks): number => (p / PRICE_SCALE) * 100;

/** 620 -> "62¢" ; 625 -> "62.5¢" */
export const formatCents = (p: Ticks): string => {
  const c = p / 10;
  return `${Number.isInteger(c) ? c : c.toFixed(1)}¢`;
};

export const formatUsd = (m: Mills, opts: Intl.NumberFormatOptions = {}): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  }).format(millsToDollars(m));

export const formatCompactUsd = (m: Mills): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(millsToDollars(m));
