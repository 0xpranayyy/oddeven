import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export type Db = Awaited<ReturnType<typeof connectPostgres>>["db"];

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

export interface DbHandle {
  db: Db;
  driver: "postgres" | "pglite";
  close: () => Promise<void>;
}

async function connectPostgres(url: string) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, migrate: () => migrate(db, { migrationsFolder }), close: () => client.end() };
}

async function connectPglite(dataDir?: string) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, migrate: () => migrate(db, { migrationsFolder }), close: () => client.close() };
}

/**
 * - `DATABASE_URL` set → real Postgres (postgres-js)
 * - otherwise → embedded PGlite at `dataDir` (or in-memory when omitted)
 * Migrations are applied on connect.
 */
export async function connectDb(opts: { url?: string; dataDir?: string } = {}): Promise<DbHandle> {
  if (opts.url) {
    const c = await connectPostgres(opts.url);
    await c.migrate();
    return { db: c.db, driver: "postgres", close: c.close };
  }
  const c = await connectPglite(opts.dataDir);
  await c.migrate();
  // Same query-builder surface; cast keeps one Db type across drivers.
  return { db: c.db as unknown as Db, driver: "pglite", close: c.close };
}
