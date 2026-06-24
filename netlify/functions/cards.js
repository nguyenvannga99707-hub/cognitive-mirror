/**
 * GET /.netlify/functions/cards — 卡片列表（Netlify Blob）
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
    const params = new URLSearchParams(event.queryStringParameters || '');
    const cardId = params.get('id');

    // 单张卡片
    if (cardId) {
      const raw = await cardsStore.get(`card:${cardId}`);
      if (!raw) return { statusCode: 404, headers, body: JSON.stringify({ error: '卡片不存在' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ card: JSON.parse(raw) }) };
    }

    // 列表
    const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
    const { blobs } = await cardsStore.list({ prefix: 'card:' });

    // 按时间倒序取最新 N 条
    const entries = [];
    for (const blob of blobs) {
      const raw = await cardsStore.get(blob.key);
      if (raw) entries.push(JSON.parse(raw));
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ cards: entries.slice(0, limit), total: entries.length }),
    };
  } catch (err) {
    console.error('Cards error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '加载失败' }) };
  }
};
