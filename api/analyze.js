// Vercel serverless function: keeps the Anthropic key server-side.
const { computeScore } = require('../lib/score');
const MODEL = process.env.ANALYZE_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a food ingredients analyst. Given a product's ingredients, nutrition data and a precomputed health score, call the report_analysis tool.
Rules:
- The score and verdict are computed by rules and given to you. Do not change them; write a summary that is consistent with them.
- Only flag ingredients that literally appear in the provided ingredient list. Never invent ingredients.
- If no ingredient list is provided, say so in the summary and return no flags.
- Keep explanations short, factual, and non-alarmist. This is general information, not medical advice.`;

const TOOL = {
  name: 'report_analysis',
  description: 'Report the ingredient analysis of a food product.',
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string' },
      summary: { type: 'string', description: '2 plain-English sentences' },
      flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ingredient: { type: 'string' },
            category: { type: 'string', enum: ['Seed Oil', 'Artificial Color', 'Preservative', 'Hidden Sugar', 'Artificial Sweetener', 'Emulsifier', 'Flavor Enhancer', 'Allergen'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            explanation: { type: 'string' }
          },
          required: ['ingredient', 'category', 'severity', 'explanation']
        }
      },
      positives: { type: 'array', items: { type: 'string' } },
      alternatives: { type: 'array', items: { type: 'string' } },
      tip: { type: 'string' },
      allergens: { type: 'array', items: { type: 'string' } }
    },
    required: ['productName', 'summary', 'flags', 'positives', 'alternatives', 'tip', 'allergens']
  }
};

const clip = (v, n) => String(v ?? '').slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });

  const b = req.body || {};
  const n = b.nutri || {};
  const ingredients = clip(b.ingredients, 4000);
  const result = computeScore({
    nutriscore: clip(b.nutriscore, 3), nova: b.nova, additivesCount: b.additivesCount,
    nutri: { sugars: n.sugars, satFat: n.satFat, salt: n.salt }, hasIngredients: ingredients.length > 0
  });
  const prompt =
    `Computed score: ${result.score}/100 (${result.verdict}). Scoring factors: ` +
    result.breakdown.map(x => `${x.label} (${x.points})`).join('; ') + `
` +
    `Product: ${clip(b.name, 200)}\nBrand: ${clip(b.brand, 200)}\n` +
    `Ingredients: ${clip(b.ingredients, 4000) || 'Not provided'}\n` +
    `Nutri-Score: ${clip(b.nutriscore, 3) || '?'} | NOVA group: ${clip(b.nova, 3) || '?'}\n` +
    `Nutrition per 100g: sugars ${Number(n.sugars) || '?'}g, fat ${Number(n.fat) || '?'}g, ` +
    `sat fat ${Number(n.satFat) || '?'}g, salt ${Number(n.salt) || '?'}g`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_analysis' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (!r.ok) {
      const code = r.status === 429 ? 429 : 502;
      return res.status(code).json({ error: d.error?.message || 'Upstream AI error' });
    }
    const block = (d.content || []).find(c => c.type === 'tool_use');
    if (!block) return res.status(502).json({ error: 'AI returned no analysis' });
    return res.status(200).json({ ...block.input, ...result });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach AI service' });
  }
};
