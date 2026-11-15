import type { PlayExchange } from "@oddeven/engine";
import type { Category, MarketEvent, PricePoint } from "@oddeven/shared";

/**
 * Play-money catalog. Markets are fictional-forward questions for demo
 * purposes; prices/history are simulated.
 */
interface SeedEvent {
  slug: string;
  title: string;
  category: Category;
  image: string;
  description: string;
  rules: string;
  resolutionSource: string;
  endsInDays: number;
  featured?: boolean;
  /** Single-entry = binary event; multiple = multi-outcome event. */
  markets: { label: string; question?: string; price: number }[];
  volume: number; // dollars, simulated lifetime volume
}

const SEED: SeedEvent[] = [
  {
    slug: "fed-decision-december",
    title: "Fed decision in December?",
    category: "economy",
    image: "🏦",
    description: "What will the FOMC decide at its December meeting?",
    rules:
      "Resolves to the change in the federal funds target range announced at the conclusion of the December FOMC meeting. If no meeting is held, resolves to No change.",
    resolutionSource: "federalreserve.gov FOMC statement",
    endsInDays: 25,
    featured: true,
    markets: [
      { label: "25 bps cut", price: 610 },
      { label: "No change", price: 330 },
      { label: "50+ bps cut", price: 40 },
      { label: "Hike", price: 20 },
    ],
    volume: 48_200_000,
  },
  {
    slug: "btc-150k-2026",
    title: "Bitcoin above $150k on Dec 31?",
    category: "crypto",
    image: "₿",
    description: "Will BTC/USD trade above $150,000 at 23:59 UTC on December 31?",
    rules:
      "Resolves Yes if the Coinbase BTC-USD 1-minute candle closing at 23:59 UTC on Dec 31 is strictly above $150,000.",
    resolutionSource: "Coinbase BTC-USD",
    endsInDays: 46,
    featured: true,
    markets: [{ label: "Yes", price: 230 }],
    volume: 21_900_000,
  },
  {
    slug: "btc-up-or-down-today",
    title: "BTC up or down today?",
    category: "crypto",
    image: "📈",
    description: "Will Bitcoin close today higher than it opened? A new market every day.",
    rules: "Resolves Yes if the Coinbase BTC-USD daily candle (00:00–23:59 UTC) closes above its open.",
    resolutionSource: "Coinbase BTC-USD",
    endsInDays: 1,
    markets: [{ label: "Up", price: 520 }],
    volume: 3_400_000,
  },
  {
    slug: "eth-10k-2026",
    title: "ETH hits $10k in 2026?",
    category: "crypto",
    image: "Ξ",
    description: "Will Ether trade at or above $10,000 at any time before January 1?",
    rules:
      "Resolves Yes if any Coinbase ETH-USD 1-minute candle has a high ≥ $10,000 before Jan 1, 00:00 UTC.",
    resolutionSource: "Coinbase ETH-USD",
    endsInDays: 46,
    markets: [{ label: "Yes", price: 40 }],
    volume: 6_100_000,
  },
  {
    slug: "shutdown-before-february",
    title: "US government shutdown before February?",
    category: "politics",
    image: "🏛️",
    description: "Will a lapse in federal appropriations begin before February 1?",
    rules:
      "Resolves Yes if OPM announces a shutdown (lapse in appropriations) affecting federal agencies beginning before Feb 1, 00:00 ET.",
    resolutionSource: "opm.gov",
    endsInDays: 77,
    featured: true,
    markets: [{ label: "Yes", price: 270 }],
    volume: 12_700_000,
  },
  {
    slug: "unemployment-december-report",
    title: "Unemployment rate in the December jobs report?",
    category: "economy",
    image: "📊",
    description: "The headline U-3 unemployment rate in the next BLS Employment Situation release.",
    rules: "Resolves to the bracket containing the seasonally adjusted U-3 rate as first published by BLS.",
    resolutionSource: "bls.gov",
    endsInDays: 21,
    markets: [
      { label: "≤ 4.2%", price: 180 },
      { label: "4.3%", price: 310 },
      { label: "4.4%", price: 300 },
      { label: "≥ 4.5%", price: 210 },
    ],
    volume: 5_800_000,
  },
  {
    slug: "super-bowl-champion",
    title: "Super Bowl champion?",
    category: "sports",
    image: "🏈",
    description: "Which team will win the next Super Bowl?",
    rules:
      "Resolves to the team that wins the Super Bowl. Resolves No for all teams if the game is not played by March 31.",
    resolutionSource: "NFL.com",
    endsInDays: 90,
    featured: true,
    markets: [
      { label: "Kansas City", price: 160 },
      { label: "Philadelphia", price: 150 },
      { label: "Buffalo", price: 130 },
      { label: "Detroit", price: 120 },
      { label: "Baltimore", price: 100 },
      { label: "Other", price: 340 },
    ],
    volume: 64_300_000,
  },
  {
    slug: "champions-league-winner",
    title: "Champions League winner?",
    category: "sports",
    image: "⚽",
    description: "Which club will win this season's UEFA Champions League?",
    rules: "Resolves to the club that wins the final.",
    resolutionSource: "UEFA.com",
    endsInDays: 200,
    markets: [
      { label: "Real Madrid", price: 170 },
      { label: "Man City", price: 150 },
      { label: "Arsenal", price: 140 },
      { label: "Bayern", price: 110 },
      { label: "PSG", price: 100 },
      { label: "Other", price: 330 },
    ],
    volume: 18_500_000,
  },
  {
    slug: "top-ai-model-year-end",
    title: "Top AI model at year end?",
    category: "tech",
    image: "🤖",
    description: "Which lab will have the #1 model on the LMArena text leaderboard on December 31?",
    rules:
      "Resolves to the organization of the top-ranked model on the LMArena text leaderboard at 12:00 ET Dec 31. Ties resolve to the model released first.",
    resolutionSource: "lmarena.ai",
    endsInDays: 46,
    markets: [
      { label: "Google", price: 380 },
      { label: "OpenAI", price: 300 },
      { label: "Anthropic", price: 220 },
      { label: "xAI", price: 70 },
      { label: "Other", price: 30 },
    ],
    volume: 9_900_000,
  },
  {
    slug: "starship-orbit-crew-2027",
    title: "Crewed Starship orbital flight in 2027?",
    category: "tech",
    image: "🚀",
    description: "Will SpaceX fly humans to orbit aboard Starship before January 1, 2028?",
    rules:
      "Resolves Yes if a Starship vehicle carrying at least one person completes an orbit of Earth before Jan 1, 2028 UTC.",
    resolutionSource: "SpaceX, NASA",
    endsInDays: 412,
    markets: [{ label: "Yes", price: 180 }],
    volume: 2_300_000,
  },
  {
    slug: "box-office-december-opener",
    title: "December's biggest opening weekend above $200M?",
    category: "culture",
    image: "🎬",
    description: "Will any film released in December gross over $200M domestically in its opening weekend?",
    rules:
      "Resolves Yes if Box Office Mojo reports a Fri–Sun domestic opening above $200M for a film released in December.",
    resolutionSource: "boxofficemojo.com",
    endsInDays: 50,
    markets: [{ label: "Yes", price: 410 }],
    volume: 1_700_000,
  },
  {
    slug: "recession-2027",
    title: "US recession in 2027?",
    category: "economy",
    image: "📉",
    description: "Will the NBER declare a recession that begins in 2027?",
    rules: "Resolves Yes if, by Dec 31, 2028, NBER announces a business-cycle peak dated in 2027.",
    resolutionSource: "nber.org",
    endsInDays: 410,
    markets: [{ label: "Yes", price: 290 }],
    volume: 7_600_000,
  },
];

const DAY = 86_400_000;

/** Seeded PRNG so simulated history is stable across restarts. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Brownian bridge in logit space ending at `end`. */
function simulateHistory(key: string, end: number, now: number): PricePoint[] {
  const rnd = mulberry32(hash(key));
  const n = 30 * 96; // 30 days @ 15 min
  const logit = (p: number) => Math.log(p / (1 - p));
  const inv = (x: number) => 1 / (1 + Math.exp(-x));
  const target = logit(end / 1000);
  const start = target + (rnd() - 0.5) * 2.2;
  const walk: number[] = [0];
  for (let i = 1; i <= n; i++) {
    const shock = rnd() < 0.004 ? (rnd() - 0.5) * 1.2 : 0; // rare news jumps
    walk.push(walk[i - 1]! + (rnd() - 0.5) * 0.09 + shock);
  }
  const drift = walk[n]!;
  const pts: PricePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const x = start + (target - start) * (i / n) + walk[i]! - drift * (i / n);
    const p = Math.min(990, Math.max(10, Math.round(inv(x) * 1000)));
    pts.push({ t: now - (n - i) * (DAY / 96), p });
  }
  pts[pts.length - 1]!.p = end;
  return pts;
}

export function seedCatalog(exchange: PlayExchange, now = Date.now()): Map<string, MarketEvent> {
  const events = new Map<string, MarketEvent>();
  SEED.forEach((e, ei) => {
    const eventId = `e${ei + 1}`;
    const marketIds = e.markets.map((m, mi) => {
      const id = `${eventId}m${mi + 1}`;
      exchange.listMarket({
        id,
        eventId,
        label: m.label,
        question: m.question ?? (e.markets.length > 1 ? `${e.title} — ${m.label}` : e.title),
        initialPrice: m.price,
        history: simulateHistory(id, m.price, now),
        volume: Math.round((e.volume * 1000 * (m.price / 1000 + 0.1)) / e.markets.length),
      });
      return id;
    });
    events.set(e.slug, {
      id: eventId,
      slug: e.slug,
      title: e.title,
      category: e.category,
      image: e.image,
      description: e.description,
      rules: e.rules,
      resolutionSource: e.resolutionSource,
      endsAt: new Date(now + e.endsInDays * DAY).toISOString(),
      featured: e.featured ?? false,
      marketIds,
    });
  });
  return events;
}
