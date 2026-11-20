CREATE TABLE "pet_invite_pets" (
	"invite_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	CONSTRAINT "pet_invite_pets_invite_id_pet_id_pk" PRIMARY KEY("invite_id","pet_id")
);
--> statement-breakpoint
CREATE TABLE "pet_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"role" "pet_role" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "pet_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "pet_invite_pets" ADD CONSTRAINT "pet_invite_pets_invite_id_pet_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."pet_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_invite_pets" ADD CONSTRAINT "pet_invite_pets_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_invites" ADD CONSTRAINT "pet_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_invites" ADD CONSTRAINT "pet_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_invites_created_by_idx" ON "pet_invites" USING btree ("created_by");