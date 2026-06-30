-- 认知抓手 · 事件收集表
-- 2026-07-01
CREATE TABLE IF NOT EXISTS handle_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,      -- search / card_expand / card_collapse
  topic TEXT,                     -- 用户搜的领域
  card_title TEXT,                -- 被点/展开的卡片标题
  card_type TEXT,                 -- 知识 / 能力
  card_index INT,                 -- 1-3
  source TEXT,                    -- api / demo / demo_fallback / fallback
  cards_generated TEXT[],         -- 本次生成的三个卡片标题
  card_count INT,                 -- 生成卡片数
  has_ability_alert BOOLEAN,      -- 是否有能力提醒
  client_ts BIGINT,               -- 客户端时间戳
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 允许浏览器匿名写入
ALTER TABLE handle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_insert_handle_events" ON handle_events
  FOR INSERT WITH CHECK (true);

-- 允许读取自己 session 的数据（后续分析用）
CREATE POLICY "public_read_handle_events" ON handle_events
  FOR SELECT USING (true);
