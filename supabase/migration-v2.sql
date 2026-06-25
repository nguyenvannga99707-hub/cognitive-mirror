-- 认知镜 v2 数据迁移
-- 在 Supabase Dashboard → SQL Editor 运行

ALTER TABLE cards ADD COLUMN IF NOT EXISTS question_depth text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS tension_score integer;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS domain_hint text;
