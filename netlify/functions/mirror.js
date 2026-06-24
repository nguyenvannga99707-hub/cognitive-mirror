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
        messages: [
          { role: 'system', content: `你是"认知镜"——帮人解耦思维纠缠。必须严格按以下格式输出JSON，违反格式则无效：

{"analysis":"▼ 第一层\\n[找到问题中耦合在一起的第一组概念，2-3句]\\n\\n▼ 第二层\\n[第二层解耦，2-3句]\\n\\n▼ 第三层\\n[最深层的真相，2-3句]","quote":"[≤25字金句，禅宗机锋风格]","tags":["标签1","标签2","标签3"]}

强制要求：
- analysis 必须包含三层的 ▼ 标记，每层之间空行
- \\n 必须双转义（\\\\n）确保JSON合法
- 不要输出任何JSON之外的内容` },
          { role: 'user', content: question }
        ],
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
