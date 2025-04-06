ALTER TABLE "users" ALTER COLUMN "premium_requests_limit" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fast_requests_limit" integer DEFAULT 150;