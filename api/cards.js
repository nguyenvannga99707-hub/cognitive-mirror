/**
 * GET /api/cards — 卡片列表
 * GET /api/cards/:id — 单张卡片
 */

export const runtime = 'edge';

export async function GET(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 获取存储
  const store = globalThis.__mirrorStore || new Map();

  // 单张卡片：/api/cards/xxx
  const cardIdMatch = path.match(/^\/api\/cards\/(.+)$/);
  if (cardIdMatch) {
    const card = store.get(cardIdMatch[1]);
    if (!card) {
      return new Response(JSON.stringify({ error: '卡片不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response(JSON.stringify({ card }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 卡片列表
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const allCards = Array.from(store.values());
  allCards.sort((a, b) => b.timestamp - a.timestamp);
  const cards = allCards.slice(0, limit);

  return new Response(JSON.stringify({ cards, total: allCards.length }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
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
