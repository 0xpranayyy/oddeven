import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { connectDb } from "@oddeven/db";
import { PlayExchange } from "@oddeven/engine";
import { createApp, Services } from "./app";
import { isBot, startBots } from "./bots";
import { RealtimeHub } from "./realtime";
import { seedCatalog } from "./seed";
import { ExchangeStore } from "./store";

const port = Number(process.env.PORT ?? 8787);
const url = process.env.DATABASE_URL;

const db = await connectDb({ url, dataDir: url ? undefined : (process.env.PGLITE_DIR ?? ".data/pglite") });
console.log(`◆ Database: ${db.driver === "postgres" ? "Postgres" : "PGlite (embedded, .data/pglite)"}`);

const ex = new PlayExchange();
const store = new ExchangeStore(db.db, ex, { isBot });

const t0 = performance.now();
const loaded = await store.load();
let events = loaded?.events;
if (!events) {
  events = seedCatalog(ex);
  await store.saveCatalog(events);
  console.log(`◆ Seeded ${events.size} events`);
} else {
  console.log(
    `◆ Restored ${events.size} events, ${loaded!.sessions.size} sessions in ${Math.round(performance.now() - t0)}ms`,
  );
}
store.start();

const svc = new Services({
  ex,
  events,
  store,
  adminKey: process.env.ADMIN_KEY ?? "dev-admin-key",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
});
if (loaded) svc.hydrate(loaded);

const app = createApp(svc);
const hub = new RealtimeHub(ex, svc);
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
app.get(
  "/v1/ws",
  upgradeWebSocket(() => hub.handlers()),
);

const stopBots = process.env.BOTS !== "off" ? startBots(ex, events) : () => {};

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`▲ OddEven API (play money) on http://localhost:${info.port}`);
});
injectWebSocket(server);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n◆ ${signal}: flushing to database…`);
  stopBots();
  server.close();
  await store.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
