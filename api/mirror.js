/**
 * 认知镜 — Vercel Edge Function
 * POST /api/mirror — 限流 → DeepSeek → 流式返回 → 存储
 */

// ========== 内存存储（跨部署丢失，接入 Vercel KV 后替换） ==========
// 用 globalThis 确保在 Edge Function 多实例间尽量共享
if (!globalThis.__mirrorStore) globalThis.__mirrorStore = new Map();
if (!globalThis.__rateLimitStore) globalThis.__rateLimitStore = new Map();
const store = globalThis.__mirrorStore;
const rateStore = globalThis.__rateLimitStore;

// ========== 工具 ==========
function ipHash(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i); hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ========== 限流 ==========
function checkRateLimit(ipKey, limit = 3) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${ipKey}`;
  const current = rateStore.get(key) || 0;

  if (current >= limit) return { blocked: true, remaining: 0 };

  rateStore.set(key, current + 1);
  return { blocked: false, remaining: limit - current - 1 };
}

// ========== 卡片存取 ==========
function generateCardId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}${rand}`;
}

function saveCard(cardId, question, cardData) {
  const card = {
    id: cardId,
    timestamp: Date.now(),
    question,
    views: 1,
    ...cardData,
  };
  store.set(cardId, card);
  return card;
}

// ========== DeepSeek API ==========
async function callDeepSeek(question, apiKey) {
  const prompt = `你是一个「认知镜」——专门帮人解耦思维中的纠缠。

用户把困扰自己的问题丢给你，你的任务：

1. **解耦分析**：找出用户问题中耦合在一起的几件不同的事，把它们分开。不解决问题，只是让真正的真相从耦合中浮现。风格：冷静、锋利、不废话。200-400字。

2. **一句金句**：给一句不超过25字的点醒，像禅宗的机锋——让你跟你的问题隔一层，你就自己悟了。

3. **标签**：提取3-5个关键词标签，反映问题的核心主题领域。

严格按以下JSON格式输出，不要有任何其他内容：

{"analysis":"...","quote":"...","tags":["..."]}

用户问题：${question}`;

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0.8,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error: ${res.status}`);
  }

  return res;
}

// ========== 主函数 ==========
export const runtime = 'edge';

export async function POST(request) {
  try {
    const body = await request.json();
    const question = body.question?.trim();
    if (!question || question.length < 3) {
      return json({ error: '问题太短了，多说点吧。' }, 400);
    }

    // 限流
    const limit = parseInt(process.env.DAILY_LIMIT || '3');
    const { blocked, remaining } = checkRateLimit(ipHash(request), limit);
    if (blocked) {
      return json({ error: `今天的 ${limit} 次镜子已经照完了。明天再来。`, remaining: 0 }, 429);
    }

    // API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return json({ error: '还没配置 API key。' }, 500);
    }

    // 调用 DeepSeek
    const deepSeekStream = await callDeepSeek(question, apiKey);
    const cardId = generateCardId();

    // 流式转发 + 收集内容
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 异步收集并存储
    const collectAndStore = (async () => {
      const reader = deepSeekStream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          await writer.write(value);
        }
        await writer.close();

        // 提取 JSON
        const jsonMatch = buffer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const card = JSON.parse(jsonMatch[0]);
          saveCard(cardId, question, card);
        }
      } catch (err) {
        console.error('Stream error:', err);
        await writer.abort(err);
      }
    })();

    const response = new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Mirror-Remaining': String(remaining),
        'X-Mirror-CardId': cardId,
      },
    });

    return response;
  } catch (err) {
    console.error('Mirror error:', err);
    return json({ error: '镜子碎了，稍等再试。' }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
