-- 认知镜后端 — 在 Supabase SQL Editor 运行
-- 1. 启用 http 扩展
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. 创建镜像函数（key 藏在数据库里）
CREATE OR REPLACE FUNCTION mirror(question text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ds_response text;
  raw_content text;
  json_match text;
  card_id text;
  result jsonb;
BEGIN
  -- 调 DeepSeek
  SELECT content INTO ds_response
  FROM http((
    'POST',
    'https://api.deepseek.com/v1/chat/completions',
    ARRAY[http_header('Content-Type','application/json'), http_header('Authorization','Bearer sk-394...f528')],
    'application/json',
    jsonb_build_object(
      'model', 'deepseek-chat',
      'messages', jsonb_build_array(
        jsonb_build_object('role','system','content','你是"认知镜"——帮人解耦思维纠缠。做三件事：1.解耦分析：找出问题中纠缠的不同层面，层层分开。保持锋利。2.一句金句≤25字，禅宗机锋风格。3.3-5个标签。只返回JSON：{"analysis":"...","quote":"...","tags":["..."]}'),
        jsonb_build_object('role','user','content', question)
      ),
      'temperature', 0.8,
      'max_tokens', 1024
    )::text
  ));

  -- 解析 DeepSeek 返回
  raw_content := (ds_response::jsonb -> 'choices' -> 0 -> 'message' ->> 'content');
  json_match := substring(raw_content from '\{[\s\S]*\}');
  
  IF json_match IS NOT NULL THEN
    result := json_match::jsonb;
  ELSE
    result := jsonb_build_object('analysis', raw_content, 'quote', '', 'tags', '[]'::jsonb);
  END IF;

  -- 生成 ID 并存卡片
  card_id := lower(replace(replace(gen_random_uuid()::text, '-', ''), '_', ''));
  
  INSERT INTO cards (id, timestamp, question, analysis, quote, tags, views)
  VALUES (
    card_id,
    extract(epoch from now())::bigint * 1000,
    question,
    result ->> 'analysis',
    result ->> 'quote',
    COALESCE((result -> 'tags')::text[]::text[], ARRAY[]::text[]),
    1
  );

  -- 返回卡片
  RETURN jsonb_build_object(
    'id', card_id,
    'question', question,
    'analysis', result ->> 'analysis',
    'quote', result ->> 'quote',
    'tags', COALESCE(result -> 'tags', '[]'::jsonb),
    'remaining', '∞'
  );
END;
$$;
