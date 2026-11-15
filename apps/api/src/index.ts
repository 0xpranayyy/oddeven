import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { PlayExchange } from "@oddeven/engine";
import { createApp, Services } from "./app";
import { startBots } from "./bots";
import { RealtimeHub } from "./realtime";
import { seedCatalog } from "./seed";

const port = Number(process.env.PORT ?? 8787);
const ex = new PlayExchange();
const events = seedCatalog(ex);
const svc = new Services({
  ex,
  events,
  adminKey: process.env.ADMIN_KEY ?? "dev-admin-key",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
});

const app = createApp(svc);
const hub = new RealtimeHub(ex, svc);
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
app.get(
  "/v1/ws",
  upgradeWebSocket(() => hub.handlers()),
);

if (process.env.BOTS !== "off") startBots(ex, events);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`▲ OddEven API (play money) on http://localhost:${info.port}`);
});
injectWebSocket(server);
