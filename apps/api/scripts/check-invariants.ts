/**
 * Verifies the persisted ledger is internally consistent:
 *  1. Every market: outstanding YES shares == outstanding NO shares (each pair is $1 of collateral)
 *  2. Total cash + collateral backing open pairs == total play money ever granted (bots included at their grant)
 *  3. Human cash locks == escrow of their open buy orders
 *  4. Human share locks == shares on their open sell orders
 * Usage: tsx scripts/check-invariants.ts   (honours DATABASE_URL / PGLITE_DIR)
 */
import { connectDb } from "@oddeven/db";
import { sql } from "drizzle-orm";

const url = process.env.DATABASE_URL;
const { db, close } = await connectDb({
  url,
  dataDir: url ? undefined : (process.env.PGLITE_DIR ?? ".data/pglite"),
});

const rows = async <T>(q: ReturnType<typeof sql>) => {
  const r = (await db.execute(q)) as unknown;
  return (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];
};

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const pairs = await rows<{ market_id: string; yes: string; no: string }>(sql`
  select market_id,
    coalesce(sum(shares) filter (where outcome = 'yes'), 0) as yes,
    coalesce(sum(shares) filter (where outcome = 'no'), 0) as no
  from positions p join markets m on m.id = p.market_id
  where m.status <> 'resolved'
  group by market_id`);
const bad = pairs.filter((p) => p.yes !== p.no);
check(
  "YES shares == NO shares in every open market",
  bad.length === 0,
  bad.length ? JSON.stringify(bad) : `${pairs.length} markets`,
);

const [money] = await rows<{ cash: string; collateral: string; granted: string; bots: string }>(sql`
  select
    (select coalesce(sum(cash), 0) from accounts) as cash,
    (select coalesce(sum(shares), 0) * 1000 from positions p join markets m on m.id = p.market_id
       where m.status <> 'resolved' and outcome = 'yes') as collateral,
    (select coalesce(sum(deposited), 0) from accounts where not is_bot) as granted,
    (select count(*) from accounts where is_bot) as bots`);
const BOT_CASH = 1_000_000_000_000;
const expected = BigInt(money!.granted) + BigInt(money!.bots) * BigInt(BOT_CASH);
const actual = BigInt(money!.cash) + BigInt(money!.collateral);
check("cash + collateral == money granted", actual === expected, `diff ${actual - expected} mills`);

const locks = await rows<{ user_id: string; locked: string; escrow: string }>(sql`
  select a.user_id, a.locked, coalesce(sum(o.reserved) filter (where o.side = 'buy'), 0) as escrow
  from accounts a left join orders o on o.user_id = a.user_id and o.status in ('open', 'partial')
  where not a.is_bot group by a.user_id, a.locked having a.locked <> coalesce(sum(o.reserved) filter (where o.side = 'buy'), 0)`);
check("human cash locks == open buy escrow", locks.length === 0, locks.length ? JSON.stringify(locks) : "");

const shareLocks = await rows<{ user_id: string }>(sql`
  select p.user_id from positions p join accounts a on a.user_id = p.user_id
  left join orders o on o.user_id = p.user_id and o.market_id = p.market_id and o.outcome = p.outcome
    and o.side = 'sell' and o.status in ('open', 'partial')
  where not a.is_bot group by p.user_id, p.market_id, p.outcome, p.locked
  having p.locked <> coalesce(sum(o.shares - o.filled), 0)`);
check(
  "human share locks == open sell size",
  shareLocks.length === 0,
  shareLocks.length ? JSON.stringify(shareLocks) : "",
);

const [counts] = await rows<{ trades: string; orders: string; accounts: string }>(sql`
  select (select count(*) from trades) as trades, (select count(*) from orders) as orders,
         (select count(*) from accounts) as accounts`);
console.log(`  ${counts!.trades} trades · ${counts!.orders} orders · ${counts!.accounts} accounts`);
await close();
process.exit(failures ? 1 : 0);
