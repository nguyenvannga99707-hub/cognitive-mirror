/**
 * 认知镜 — POST /.netlify/functions/mirror（Supabase 持久化）
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '3');

async function supabase(path, options = {}) {
  const { headers: extraHeaders = {}, ...rest } = options;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    ...rest,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  return res;
}

function ipHash(h) {
  const ip = h['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  let hash = 0;
  for (let i = 0; i < ip.length; i++) hash = ((hash << 5) - hash) + ip.charCodeAt(i);
  return Math.abs(hash).toString(36);
}

function generateCardId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

exports.handler = async (event) => {
  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...hdrs, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: hdrs, body: JSON.stringify({ error: 'POST only' }) };
  }

  try {
    const { question } = JSON.parse(event.body || '{}');
    if (!question || question.length < 3) {
      return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: '问题太短了' }) };
    }

    // 限流
    const today = new Date().toISOString().slice(0, 10);
    const ip = ipHash(event.headers);
    const rkey = `${today}:${ip}`;
    const rateRes = await supabase(`ratelimit?rkey=eq.${encodeURIComponent(rkey)}`);
    const rateData = await rateRes.json();
    const current = rateData[0]?.count || 0;
    if (current >= DAILY_LIMIT) {
      return { statusCode: 429, headers: hdrs, body: JSON.stringify({ error: `今天 ${DAILY_LIMIT} 次用完了，明天再来。`, remaining: 0 }) };
    }
    // Upsert 限流
    await supabase('ratelimit', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ rkey, count: current + 1 }),
    });

    // DeepSeek
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: '未配置 API key' }) };

    const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: `你是"认知镜"——帮人解耦思维纠缠。用户问题：${question}

严格按以下格式输出JSON，不要有任何额外内容：

1. **analysis**：解耦分析（150-300字，用「▼ 第一层」「▼ 第二层」「▼ 第三层」分3层，每层2-3句话，层与层之间空行）
2. **quote**：一句金句（≤25字，像禅宗机锋，让人顿一下）
3. **tags**：3-5个关键词标签

格式示例：
{"analysis":"▼ 第一层\\n你把X和Y耦合了...\\n\\n▼ 第二层\\n真正的问题其实是...\\n\\n▼ 第三层\\n解开之后你会发现...","quote":"你不缺答案，你缺停下来的勇气","tags":["认知解耦","选择恐惧","自我觉察"]}

注意：analysis 中的 \\n 必须转义，确保是合法JSON字符串。` }],
        temperature: 0.8, max_tokens: 1024,
      }),
    });
    if (!dsRes.ok) return { statusCode: 502, headers: hdrs, body: JSON.stringify({ error: 'AI 调用失败' }) };

    const dsData = await dsRes.json();
    const raw = dsData.choices?.[0]?.message?.content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    const cd = m ? JSON.parse(m[0]) : { analysis: raw, quote: '', tags: [] };

    // 存 Supabase
    const cardId = generateCardId();
    const card = { id: cardId, timestamp: Date.now(), question, views: 1, ...cd };
    await supabase('cards', { method: 'POST', body: JSON.stringify(card) });

    return {
      statusCode: 200,
      headers: { ...hdrs, 'X-Mirror-Remaining': String(DAILY_LIMIT - current - 1), 'X-Mirror-CardId': cardId },
      body: JSON.stringify({ ...card, remaining: DAILY_LIMIT - current - 1 }),
    };
  } catch (err) {
    console.error('Mirror:', err);
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: '镜子碎了' }) };
  }
};
