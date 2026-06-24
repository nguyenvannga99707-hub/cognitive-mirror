/**
 * 认知镜 — Supabase Edge Function（mirror）
 * 部署：supabase functions deploy mirror
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DAILY_LIMIT = parseInt(Deno.env.get("DAILY_LIMIT") || "3");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function ipHash(headers: Headers): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  let hash = 0;
  for (let i = 0; i < ip.length; i++) hash = ((hash << 5) - hash) + ip.charCodeAt(i);
  return Math.abs(hash).toString(36);
}

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

serve(async (req) => {
  const hdrs = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...hdrs, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: hdrs });
  }

  try {
    const { question } = await req.json();
    if (!question || question.length < 3) {
      return new Response(JSON.stringify({ error: "问题太短了" }), { status: 400, headers: hdrs });
    }

    // 限流
    const today = new Date().toISOString().slice(0, 10);
    const ip = ipHash(req.headers);
    const { data: rateData } = await supabase.from("ratelimit").select("count").eq("rkey", `${today}:${ip}`).maybeSingle();
    const current = rateData?.count || 0;
    if (current >= DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: `今天 ${DAILY_LIMIT} 次用完了，明天再来。`, remaining: 0 }), { status: 429, headers: hdrs });
    }
    await supabase.from("ratelimit").upsert({ rkey: `${today}:${ip}`, count: current + 1 }, { onConflict: "rkey" });

    // DeepSeek
    const dsRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: `你是"认知镜"——帮人解耦思维纠缠。做三件事：1.解耦分析：找出问题中纠缠的不同层面，层层分开。保持锋利。2.一句金句≤25字，禅宗机锋风格。3.3-5个标签。只返回JSON：{"analysis":"...","quote":"...","tags":["..."]}` },
          { role: "user", content: question },
        ],
        temperature: 0.8, max_tokens: 1024,
      }),
    });
    if (!dsRes.ok) return new Response(JSON.stringify({ error: "AI 调用失败" }), { status: 502, headers: hdrs });

    const dsData = await dsRes.json();
    const raw = dsData.choices?.[0]?.message?.content || "";
    const m = raw.match(/\{[\s\S]*\}/);
    const cd = m ? JSON.parse(m[0]) : { analysis: raw, quote: "", tags: [] };

    // 存 Supabase
    const cardId = genId();
    const card = { id: cardId, timestamp: Date.now(), question, views: 1, ...cd };
    await supabase.from("cards").insert(card);

    return new Response(JSON.stringify({ ...card, remaining: DAILY_LIMIT - current - 1 }), { status: 200, headers: hdrs });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "镜子碎了" }), { status: 500, headers: hdrs });
  }
});
