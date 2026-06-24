/**
 * 认知镜 — POST /.netlify/functions/mirror（Supabase 持久化）
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '3');

async function supabase(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
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
    // 诊断
    if (event.httpMethod === 'GET') {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=count`, {
          headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`, 'Prefer': 'count=exact' },
        });
        const text = await res.text();
        return { statusCode: 200, headers: hdrs, body: JSON.stringify({ 
          supabase_url: SUPABASE_URL?.slice(0,30)+'...',
          key_set: !!SUPABASE_SECRET_KEY, key_len: (SUPABASE_SECRET_KEY||'').length,
          status: res.status, body_preview: text.slice(0,200)
        })};
      } catch(e) {
        return { statusCode: 200, headers: hdrs, body: JSON.stringify({ error: e.message }) };
      }
    }
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
        messages: [{ role: 'user', content: `你是一个"认知镜"。用户问题：${question}\n任务：1.解耦分析200-400字 2.一句金句≤25字 3.3-5个标签。严格返回JSON：{"analysis":"...","quote":"...","tags":["..."]}` }],
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
