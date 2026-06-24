/**
 * GET /.netlify/functions/network — 知识网络数据
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
  const allCards = Array.from(store.values()).sort((a, b) => b.timestamp - a.timestamp);
  const cards = allCards.slice(0, 200);

  const nodes = [];
  const links = [];
  const tagSet = new Set();
  const tagFrequency = {};

  for (const card of cards) {
    if (!card.tags || !Array.isArray(card.tags)) continue;
    nodes.push({
      id: card.id, type: 'card',
      question: card.question?.slice(0, 80) || '',
      tags: card.tags, views: card.views || 1,
    });
    for (const tag of card.tags) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      tagSet.add(tag);
      links.push({ source: card.id, target: `tag:${tag}` });
    }
  }

  for (const tag of tagSet) {
    nodes.push({ id: `tag:${tag}`, type: 'tag', label: tag });
  }

  return { statusCode: 200, headers, body: JSON.stringify({ nodes, links, tagFrequency }) };
};
