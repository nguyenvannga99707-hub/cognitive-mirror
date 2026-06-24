/**
 * 认知镜 — Netlify Function
 * POST /.netlify/functions/mirror
 */

// 内存存储
if (!globalThis.__mirrorStore) globalThis.__mirrorStore = new Map();
if (!globalThis.__rateStore) globalThis.__rateStore = new Map();
const store = globalThis.__mirrorStore;
const rateStore = globalThis.__rateStore;

function ipHash(headers) {
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i); hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function checkRateLimit(ipKey, limit = 3) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${ipKey}`;
  const current = rateStore.get(key) || 0;
  if (current >= limit) return { blocked: true, remaining: 0 };
  rateStore.set(key, current + 1);
  return { blocked: false, remaining: limit - current - 1 };
}

function generateCardId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    // 诊断模式：GET 返回环境变量状态
    if (event.httpMethod === 'GET') {
      const envKeys = Object.keys(process.env).filter(k => k.includes('DEEPSEEK') || k.includes('DAILY'));
      return { statusCode: 200, headers, body: JSON.stringify({ 
        envKeys, 
        apiKeySet: !!process.env.DEEPSEEK_API_KEY,
        apiKeyLen: (process.env.DEEPSEEK_API_KEY || '').length,
        dailyLimit: process.env.DAILY_LIMIT || '未设置',
      })};
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  try {
    const { question } = JSON.parse(event.body || '{}');
    if (!question || question.length < 3) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '问题太短了' }) };
    }

    // 限流
    const limit = parseInt(process.env.DAILY_LIMIT || '3');
    const { blocked, remaining } = checkRateLimit(ipHash(event.headers), limit);
    if (blocked) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: `今天 ${limit} 次用完了，明天再来。`, remaining: 0 }) };
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: '未配置 API key' }) };
    }

    // 调用 DeepSeek（非流式）
    const prompt = `你是一个"认知镜"——专门帮人解耦思维中的纠缠。

用户问题：${question}

任务：
1. **解耦分析**：找出问题中耦合在一起的不同事情，分开它们。不解决，只是让真相浮现。200-400字。
2. **一句金句**：≤25字，像禅宗机锋。
3. **标签**：3-5个关键词。

严格返回JSON：{"analysis":"...","quote":"...","tags":["..."]}`;

    const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1024,
      }),
    });

    if (!dsRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: `AI 调用失败 (${dsRes.status})` }) };
    }

    const dsData = await dsRes.json();
    const rawContent = dsData.choices?.[0]?.message?.content || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const cardData = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: rawContent, quote: '', tags: [] };

    // 存卡片
    const cardId = generateCardId();
    const card = {
      id: cardId,
      timestamp: Date.now(),
      question,
      views: 1,
      ...cardData,
    };
    store.set(cardId, card);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-Mirror-Remaining': String(remaining),
        'X-Mirror-CardId': cardId,
      },
      body: JSON.stringify({ ...card, remaining }),
    };
  } catch (err) {
    console.error('Mirror error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '镜子碎了，稍等再试' }) };
  }
};
