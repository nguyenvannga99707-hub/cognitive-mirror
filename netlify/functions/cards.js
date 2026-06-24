/**
 * GET /.netlify/functions/cards — 卡片列表
 * GET /.netlify/functions/cards?id=xxx — 单张卡片
 */

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  const store = globalThis.__mirrorStore || new Map();
  const params = new URLSearchParams(event.queryStringParameters || '');
  const cardId = params.get('id');

  // 单张卡片
  if (cardId) {
    const card = store.get(cardId);
    if (!card) return { statusCode: 404, headers, body: JSON.stringify({ error: '卡片不存在' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ card }) };
  }

  // 列表
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const allCards = Array.from(store.values());
  allCards.sort((a, b) => b.timestamp - a.timestamp);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ cards: allCards.slice(0, limit), total: allCards.length }),
  };
};
