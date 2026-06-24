/**
 * GET /.netlify/functions/network — 知识网络（Netlify Blob）
 */
import { getStore } from "@netlify/blobs";

const cardsStore = getStore("cards");

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    const { blobs } = await cardsStore.list({ prefix: 'card:' });
    const cards = [];

    for (const blob of blobs) {
      const raw = await cardsStore.get(blob.key);
      if (raw) cards.push(JSON.parse(raw));
    }
    cards.sort((a, b) => b.timestamp - a.timestamp);
    const recent = cards.slice(0, 200);

    const nodes = [];
    const links = [];
    const tagSet = new Set();
    const tagFrequency = {};

    for (const card of recent) {
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
  } catch (err) {
    console.error('Network error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '加载失败' }) };
  }
};
