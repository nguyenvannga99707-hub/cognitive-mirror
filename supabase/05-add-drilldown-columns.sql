-- 认知抓手 v3 · 分型层 + 内容记录
ALTER TABLE handle_events ADD COLUMN IF NOT EXISTS layer INT;
ALTER TABLE handle_events ADD COLUMN IF NOT EXISTS parent_card_title TEXT;
ALTER TABLE handle_events ADD COLUMN IF NOT EXISTS card_content JSONB;
