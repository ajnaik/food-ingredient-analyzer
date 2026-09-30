// Per-IP fixed-window rate limiter.
// - If an Upstash/Vercel KV Redis is configured, counts are shared across all serverless instances.
// - Otherwise it falls back to in-memory counts, which are per warm instance (best effort only).
const WINDOW_SEC = Number(process.env.RATE_LIMIT_WINDOW_SEC) || 600;
const MAX = Number(process.env.RATE_LIMIT_MAX) || 30;

const mem = new Map();

// Pure function so it can be unit-tested.
function memHit(store, key, nowMs, windowSec = WINDOW_SEC, max = MAX) {
  if (store.size > 2000) for (const [k, v] of store) if (v.reset <= nowMs) store.delete(k);
  let e = store.get(key);
  if (!e || e.reset <= nowMs) { e = { count: 0, reset: nowMs + windowSec * 1000 }; store.set(key, e); }
  e.count += 1;
  return { allowed: e.count <= max, remaining: Math.max(0, max - e.count), retryAfter: Math.ceil((e.reset - nowMs) / 1000) };
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || req.socket?.remoteAddress || 'unknown';
}

async function redisHit(url, token, key) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, WINDOW_SEC, 'NX'], ['TTL', key]])
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  const count = Number(out[0]?.result);
  const ttl = Number(out[2]?.result);
  return { allowed: count <= MAX, remaining: Math.max(0, MAX - count), retryAfter: ttl > 0 ? ttl : WINDOW_SEC };
}

async function checkRateLimit(req) {
  const ip = clientIp(req);
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try { return await redisHit(url, token, `rl:analyze:${ip}`); }
    catch (e) { console.error('rate limit store error, falling back to memory:', e.message); }
  }
  return memHit(mem, ip, Date.now());
}

module.exports = { checkRateLimit, memHit, clientIp };
