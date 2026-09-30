// Deterministic 0-100 health score (higher = better) built from structured
// Open Food Facts data. The LLM explains the result; it never sets the number.

const NUTRI_BASE = { a: 92, b: 80, c: 65, d: 50, e: 38 };
const NOVA_ADJ = { 1: 4, 2: 0, 3: -3, 4: -7 };

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
  parts.push({ key: 'nutri', label: hasBase ? `Nutri-Score ${grade.toUpperCase()}` : 'Baseline (no Nutri-Score)', points: score, note: 'starting point' });

  if (NOVA_ADJ[novaN] !== undefined) {
    const p = NOVA_ADJ[novaN];
    score += p;
    parts.push({ key: 'nova', label: `NOVA group ${novaN}`, points: p, note: novaN === 4 ? 'ultra-processed' : novaN === 1 ? 'unprocessed' : 'processing level' });
  }

  const sugars = num(nutri.sugars);
  if (sugars !== null && sugars > 0) {
    const p = -round1(Math.min(8, sugars / 5));
    if (p) { score += p; parts.push({ key: 'sugars', label: `Sugars ${sugars}g/100g`, points: p, note: 'capped at -8' }); }
  }
  const sat = num(nutri.satFat);
  if (sat !== null && sat > 0) {
    const p = -round1(Math.min(5, sat * 0.5));
    if (p) { score += p; parts.push({ key: 'satFat', label: `Saturated fat ${sat}g/100g`, points: p, note: 'capped at -5' }); }
  }
  const salt = num(nutri.salt);
  if (salt !== null && salt > 0) {
    const p = -round1(Math.min(3, salt * 1.5));
    if (p) { score += p; parts.push({ key: 'salt', label: `Salt ${salt}g/100g`, points: p, note: 'capped at -3' }); }
  }
  const adds = num(additivesCount);
  if (adds !== null && adds > 0) {
    const p = -Math.min(8, Math.round(adds * 1.5 * 10) / 10);
    score += p;
    parts.push({ key: 'additives', label: `${adds} additive${adds > 1 ? 's' : ''}`, points: p, note: '-1.5 each, capped at -8' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 70 ? 'CLEAN' : score >= 40 ? 'MODERATE' : 'AVOID';
  const confidence = hasBase && NOVA_ADJ[novaN] !== undefined ? 'high' : hasBase || NOVA_ADJ[novaN] !== undefined ? 'medium' : 'low';
  return { score, verdict, confidence, breakdown: parts };
}

module.exports = { computeScore };
