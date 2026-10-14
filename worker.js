// Cloudflare Worker: proxy untuk Claude Signal Trading.
// API key disimpan sebagai SECRET di pengaturan Worker, bukan di kode ini.
// Secret yang wajib ditambahkan: ANTHROPIC_KEY dan TWELVE_DATA_KEY

const ALLOWED_ORIGINS = [
  "https://alutohawork.github.io",   // ganti dengan domain GitHub Pages kamu (tanpa path)
  "http://localhost:8080"         // untuk tes lokal, boleh dihapus
];
const ALLOWED_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
const ALLOWED_INTERVALS = ["1min", "5min", "15min", "1h", "4h", "1day"];
const MAX_BODY_CHARS = 20000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/candles") {
        return await candles(url, env, cors);
      }
      if (request.method === "POST" && url.pathname === "/claude") {
        return await claude(request, env, cors);
      }
      return json({ error: { message: "Not found" } }, 404, cors);
    } catch (e) {
      return json({ error: { message: "Proxy error" } }, 500, cors);
    }
  }
};

async function candles(url, env, cors) {
  const symbol = url.searchParams.get("symbol") || "";
  const interval = url.searchParams.get("interval") || "";
  const outputsize = Math.min(500, Math.max(60, Number(url.searchParams.get("outputsize")) || 100));

  if (!/^[A-Za-z0-9./-]{2,20}$/.test(symbol) || !ALLOWED_INTERVALS.includes(interval)) {
    return json({ status: "error", message: "Parameter tidak valid" }, 400, cors);
  }

  const td = new URL("https://api.twelvedata.com/time_series");
  td.searchParams.set("symbol", symbol);
  td.searchParams.set("interval", interval);
  td.searchParams.set("outputsize", String(outputsize));
  td.searchParams.set("format", "JSON");
  td.searchParams.set("apikey", env.TWELVE_DATA_KEY);

  const r = await fetch(td);
  return new Response(await r.text(), {
    status: r.status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

async function claude(request, env, cors) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return json({ error: { message: "Permintaan terlalu besar" } }, 413, cors);
  }
  const body = JSON.parse(raw);
  if (!ALLOWED_MODELS.includes(body.model)) {
    return json({ error: { message: "Model tidak diizinkan" } }, 400, cors);
  }

  const payload = {
    model: body.model,
    max_tokens: Math.min(600, Number(body.max_tokens) || 600),
    system: String(body.system || "").slice(0, 4000),
    messages: body.messages
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(payload)
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
