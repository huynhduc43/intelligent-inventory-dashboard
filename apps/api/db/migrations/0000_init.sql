CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "app_user_status_chk" CHECK ("app_user"."status" IN ('ACTIVE','DISABLED'))
);
--> statement-breakpoint
CREATE TABLE "dealership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"watch_days" smallint DEFAULT 60 NOT NULL,
	"aging_days" smallint DEFAULT 90 NOT NULL,
	CONSTRAINT "dealership_thresholds_chk" CHECK ("dealership"."watch_days" >= 1 AND "dealership"."watch_days" < "dealership"."aging_days" AND "dealership"."aging_days" <= 3650)
);
--> statement-breakpoint
CREATE TABLE "user_dealership" (
	"user_id" uuid NOT NULL,
	"dealership_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_dealership_pkey" PRIMARY KEY("user_id","dealership_id"),
	CONSTRAINT "user_dealership_role_chk" CHECK ("user_dealership"."role" IN ('ADMIN','MANAGER','VIEWER'))
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"vin" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"model_year" smallint NOT NULL,
	"mileage" integer NOT NULL,
	"list_price" numeric(12, 2),
	"status" text DEFAULT 'IN_STOCK' NOT NULL,
	"stocked_on" date NOT NULL,
	"sold_at" timestamp with time zone,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_vin_chk" CHECK ("vehicle"."vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
	CONSTRAINT "vehicle_mileage_chk" CHECK ("vehicle"."mileage" >= 0),
	CONSTRAINT "vehicle_price_chk" CHECK ("vehicle"."list_price" IS NULL OR "vehicle"."list_price" >= 0),
	CONSTRAINT "vehicle_status_chk" CHECK ("vehicle"."status" IN ('IN_STOCK','RESERVED','SOLD')),
	CONSTRAINT "vehicle_sold_at_chk" CHECK (("vehicle"."status" = 'SOLD') = ("vehicle"."sold_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "vehicle_action" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vehicle_action_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"vehicle_id" uuid NOT NULL,
	"dealership_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_action_type_chk" CHECK ("vehicle_action"."action_type" IN ('PRICE_REDUCTION_PLANNED','TRANSFER','AUCTION','PROMOTION','MONITOR','OTHER')),
	CONSTRAINT "vehicle_action_note_chk" CHECK ("vehicle_action"."note" IS NULL OR char_length("vehicle_action"."note") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "user_dealership" ADD CONSTRAINT "user_dealership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dealership" ADD CONSTRAINT "user_dealership_dealership_id_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_dealership_id_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_action" ADD CONSTRAINT "vehicle_action_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_action" ADD CONSTRAINT "vehicle_action_dealership_id_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_action" ADD CONSTRAINT "vehicle_action_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_lower_uq" ON "app_user" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_dealership_vin_open_uq" ON "vehicle" USING btree ("dealership_id","vin") WHERE "vehicle"."status" <> 'SOLD';--> statement-breakpoint
CREATE INDEX "vehicle_dealership_status_stocked_idx" ON "vehicle" USING btree ("dealership_id","status","stocked_on");--> statement-breakpoint
CREATE INDEX "vehicle_dealership_make_model_idx" ON "vehicle" USING btree ("dealership_id",lower("make"),lower("model"));--> statement-breakpoint
CREATE INDEX "vehicle_action_vehicle_id_idx" ON "vehicle_action" USING btree ("vehicle_id","id" DESC NULLS FIRST);