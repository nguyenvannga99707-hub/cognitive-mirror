/**
 * GET /.netlify/functions/cards — 卡片列表 + 随机抽卡（Supabase）
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async (event) => {
  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...hdrs, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    const params = new URLSearchParams(event.queryStringParameters || '');
    const cardId = params.get('id');

    // 单张卡片
    if (cardId) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
      const data = await res.json();
      if (!data[0]) return { statusCode: 404, headers: hdrs, body: JSON.stringify({ error: '卡片不存在' }) };
      return { statusCode: 200, headers: hdrs, body: JSON.stringify({ card: data[0] }) };
    }

    // 随机抽卡：从全量随机取一张
    if (params.get('random') === 'true') {
      const countRes = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=count`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' },
      });
      const total = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0');
      if (total === 0) return { statusCode: 200, headers: hdrs, body: JSON.stringify({ card: null }) };

      const offset = Math.floor(Math.random() * total);
      const cardRes = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=*&limit=1&offset=${offset}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
      const cards = await cardRes.json();
      return { statusCode: 200, headers: hdrs, body: JSON.stringify({ card: cards[0] || null }) };
    }

    // 列表：取全量（用于卡片墙缓存）
    const limit = Math.min(parseInt(params.get('limit') || '9999'), 9999);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=*&order=timestamp.desc&limit=${limit}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    const cards = await res.json();

    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=count`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' },
    });
    const total = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0');

    return { statusCode: 200, headers: hdrs, body: JSON.stringify({ cards, total }) };
  } catch (err) {
    console.error('Cards:', err);
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: '加载失败' }) };
  }
};
