CREATE TYPE "public"."market_status" AS ENUM('open', 'paused', 'closed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('open', 'partial', 'filled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('limit', 'market');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cash" bigint NOT NULL,
	"locked" bigint DEFAULT 0 NOT NULL,
	"deposited" bigint DEFAULT 0 NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"image" text NOT NULL,
	"description" text NOT NULL,
	"rules" text NOT NULL,
	"resolution_source" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"label" text NOT NULL,
	"question" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" "market_status" DEFAULT 'open' NOT NULL,
	"tick_size" smallint DEFAULT 10 NOT NULL,
	"resolved_outcome" "outcome",
	"last_price" smallint NOT NULL,
	"volume" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome" "outcome" NOT NULL,
	"side" "side" NOT NULL,
	"type" "order_type" NOT NULL,
	"price" smallint NOT NULL,
	"shares" bigint NOT NULL,
	"filled" bigint DEFAULT 0 NOT NULL,
	"status" "order_status" NOT NULL,
	"reserved" bigint DEFAULT 0 NOT NULL,
	"seq" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome" "outcome" NOT NULL,
	"shares" bigint NOT NULL,
	"locked" bigint DEFAULT 0 NOT NULL,
	"cost" bigint NOT NULL,
	"realized_pnl" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_user_id_market_id_outcome_pk" PRIMARY KEY("user_id","market_id","outcome")
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"market_id" text NOT NULL,
	"t" bigint NOT NULL,
	"p" smallint NOT NULL,
	CONSTRAINT "price_points_market_id_t_pk" PRIMARY KEY("market_id","t")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"price" smallint NOT NULL,
	"shares" bigint NOT NULL,
	"taker_outcome" "outcome" NOT NULL,
	"taker_side" "side" NOT NULL,
	"taker_id" text NOT NULL,
	"maker_id" text NOT NULL,
	"ts" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "markets_event_idx" ON "markets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_open_idx" ON "orders" USING btree ("market_id","seq") WHERE "orders"."status" in ('open', 'partial');--> statement-breakpoint
CREATE INDEX "positions_market_idx" ON "positions" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_market_ts_idx" ON "trades" USING btree ("market_id","ts");--> statement-breakpoint
CREATE INDEX "trades_ts_idx" ON "trades" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "trades_taker_idx" ON "trades" USING btree ("taker_id","ts");--> statement-breakpoint
CREATE INDEX "trades_maker_idx" ON "trades" USING btree ("maker_id","ts");