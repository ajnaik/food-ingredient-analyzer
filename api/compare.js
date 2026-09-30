// Optional AI sentence for the compare view. The winner itself is decided by rule-based scores on the client.
const { checkRateLimit } = require('../lib/ratelimit');
const MODEL = process.env.ANALYZE_MODEL || 'claude-haiku-4-5-20251001';
const clip = (v, n) => String(v ?? '').slice(0, n);

const SYSTEM = `You compare two packaged foods for a shopper. Write exactly 2 short plain-English sentences: which one is the better everyday choice and the main reasons.
Use ONLY the scores and factors provided. Do not invent ingredients or nutrition facts. If the scores are within 3 points, say they are similar. General information, not medical advice.`;

const side = x => `${clip(x?.name, 120)}: score ${Number(x?.score) || 0}/100. Factors: ` +
  (Array.isArray(x?.factors) ? x.factors.slice(0, 8).map(f => `${clip(f.label, 60)} (${Number(f.points) || 0})`).join('; ') : 'n/a');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const rl = await checkRateLimit(req);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
  const { a, b } = req.body || {};
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 200, temperature: 0, system: SYSTEM,
        messages: [{ role: 'user', content: `Product A - ${side(a)}\nProduct B - ${side(b)}` }]
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: d.error?.message || 'Upstream AI error' });
    const text = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach AI service' });
  }
};
