ALTER TABLE "users" ADD COLUMN "premium_requests_used" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_requests_limit" integer DEFAULT 150;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fast_requests_used" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "usage_last_reset_at" timestamp DEFAULT now();