/**
 * GET /api/network — 知识网络数据（节点 + 连线）
 */

export const runtime = 'edge';

export async function GET() {
  const store = globalThis.__mirrorStore || new Map();
  const allCards = Array.from(store.values()).sort((a, b) => b.timestamp - a.timestamp);
  const cards = allCards.slice(0, 200);

  const nodes = [];
  const links = [];
  const tagSet = new Set();
  const tagFrequency = {};

  for (const card of cards) {
    if (!card.tags || !Array.isArray(card.tags)) continue;

    nodes.push({
      id: card.id,
      type: 'card',
      question: card.question?.slice(0, 80) || '',
      tags: card.tags,
      views: card.views || 1,
    });

    for (const tag of card.tags) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      tagSet.add(tag);
      links.push({ source: card.id, target: `tag:${tag}` });
    }
  }

  // 标签节点
  for (const tag of tagSet) {
    nodes.push({
      id: `tag:${tag}`,
      type: 'tag',
      label: tag,
    });
  }

  return new Response(JSON.stringify({ nodes, links, tagFrequency }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
