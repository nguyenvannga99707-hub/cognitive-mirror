/**
 * GET /.netlify/functions/network — 知识网络（Supabase）
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async (event) => {
  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...hdrs, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=*&order=timestamp.desc&limit=200`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    const cards = await res.json();

    const nodes = [], links = [], tagFreq = {}, tagSet = new Set();

    for (const card of cards) {
      if (!card.tags || !Array.isArray(card.tags)) continue;
      nodes.push({
        id: card.id, type: 'card',
        question: (card.question || '').slice(0, 80),
        tags: card.tags, views: card.views || 1,
      });
      for (const tag of card.tags) {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
        tagSet.add(tag);
        links.push({ source: card.id, target: `tag:${tag}` });
      }
    }
    for (const tag of tagSet) {
      nodes.push({ id: `tag:${tag}`, type: 'tag', label: tag });
    }

    return { statusCode: 200, headers: hdrs, body: JSON.stringify({ nodes, links, tagFrequency: tagFreq }) };
  } catch (err) {
    console.error('Network:', err);
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: '加载失败' }) };
  }
};
