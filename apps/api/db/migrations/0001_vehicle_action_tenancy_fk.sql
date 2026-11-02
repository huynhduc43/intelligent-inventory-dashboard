ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_id_dealership_uq" UNIQUE("id","dealership_id");--> statement-breakpoint
ALTER TABLE "vehicle_action" DROP CONSTRAINT "vehicle_action_vehicle_id_vehicle_id_fk";--> statement-breakpoint
ALTER TABLE "vehicle_action" ADD CONSTRAINT "vehicle_action_vehicle_dealership_fk" FOREIGN KEY ("vehicle_id","dealership_id") REFERENCES "public"."vehicle"("id","dealership_id") ON DELETE no action ON UPDATE no action;
