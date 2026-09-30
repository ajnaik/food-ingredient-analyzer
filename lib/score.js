// Deterministic 0-100 health score (higher = better) built from structured
// Open Food Facts data. The LLM explains the result; it never sets the number.

const NUTRI_BASE = { a: 92, b: 78, c: 62, d: 45, e: 30 };
const NOVA_ADJ = { 1: 4, 2: 0, 3: -4, 4: -10 };

const num = v => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null);
const round1 = x => Math.round(x * 10) / 10;

function computeScore({ nutriscore, nova, additivesCount, nutri = {}, hasIngredients = false } = {}) {
  const grade = String(nutriscore || '').toLowerCase();
  const novaN = num(nova);
  const parts = [];

  const hasBase = grade in NUTRI_BASE;
  const hasSignal = hasBase || NOVA_ADJ[novaN] !== undefined || num(nutri.sugars) !== null;
  if (!hasSignal && !hasIngredients) {
    return { score: 50, verdict: 'MODERATE', confidence: 'low',
      breakdown: [{ label: 'Not enough data', points: 0, note: 'No Nutri-Score, NOVA or ingredient list' }] };
  }

  let score = hasBase ? NUTRI_BASE[grade] : 50;
  parts.push({ label: hasBase ? `Nutri-Score ${grade.toUpperCase()}` : 'Baseline (no Nutri-Score)', points: score, note: 'starting point' });

  if (NOVA_ADJ[novaN] !== undefined) {
    const p = NOVA_ADJ[novaN];
    score += p;
    parts.push({ label: `NOVA group ${novaN}`, points: p, note: novaN === 4 ? 'ultra-processed' : novaN === 1 ? 'unprocessed' : 'processing level' });
  }

  const sugars = num(nutri.sugars);
  if (sugars !== null && sugars > 0) {
    const p = -round1(Math.min(10, sugars / 4));
    if (p) { score += p; parts.push({ label: `Sugars ${sugars}g/100g`, points: p, note: 'capped at -10' }); }
  }
  const sat = num(nutri.satFat);
  if (sat !== null && sat > 0) {
    const p = -round1(Math.min(6, sat * 0.6));
    if (p) { score += p; parts.push({ label: `Saturated fat ${sat}g/100g`, points: p, note: 'capped at -6' }); }
  }
  const salt = num(nutri.salt);
  if (salt !== null && salt > 0) {
    const p = -round1(Math.min(4, salt * 2));
    if (p) { score += p; parts.push({ label: `Salt ${salt}g/100g`, points: p, note: 'capped at -4' }); }
  }
  const adds = num(additivesCount);
  if (adds !== null && adds > 0) {
    const p = -Math.min(10, adds * 2);
    score += p;
    parts.push({ label: `${adds} additive${adds > 1 ? 's' : ''}`, points: p, note: '-2 each, capped at -10' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 70 ? 'CLEAN' : score >= 40 ? 'MODERATE' : 'AVOID';
  const confidence = hasBase && NOVA_ADJ[novaN] !== undefined ? 'high' : hasBase || NOVA_ADJ[novaN] !== undefined ? 'medium' : 'low';
  return { score, verdict, confidence, breakdown: parts };
}

module.exports = { computeScore };
