/**
 * GET /.netlify/functions/cards — 卡片列表（Supabase）
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

exports.handler = async (event) => {
  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...hdrs, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    const params = new URLSearchParams(event.queryStringParameters || '');
    const cardId = params.get('id');

    if (cardId) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
        headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${SUPABASE_SECRET_KEY}` },
      });
      const data = await res.json();
      if (!data[0]) return { statusCode: 404, headers: hdrs, body: JSON.stringify({ error: '卡片不存在' }) };
      return { statusCode: 200, headers: hdrs, body: JSON.stringify({ card: data[0] }) };
    }

    const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=*&order=timestamp.desc&limit=${limit}`, {
      headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${SUPABASE_SECRET_KEY}` },
    });
    const cards = await res.json();

    // 总数
    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=count`, {
      headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`, 'Prefer': 'count=exact' },
    });
    const total = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0');

    return { statusCode: 200, headers: hdrs, body: JSON.stringify({ cards, total }) };
  } catch (err) {
    console.error('Cards:', err);
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: '加载失败' }) };
  }
};
