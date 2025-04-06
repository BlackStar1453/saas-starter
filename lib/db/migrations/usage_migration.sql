-- 添加用量统计相关字段
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "premium_requests_used" integer DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "premium_requests_limit" integer DEFAULT 50;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fast_requests_used" integer DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fast_requests_limit" integer DEFAULT 150;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "usage_last_reset_at" timestamp DEFAULT now(); 