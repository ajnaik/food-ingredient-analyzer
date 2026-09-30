# 🌿 Ingredient Lens

Scan a food barcode, pull the product's real ingredient data, and get a plain-English AI analysis: a score, flagged ingredients, positives, and healthier swaps. It runs as an installable mobile web app (PWA).

**Live demo:** https://ingredient-lens-pearl.vercel.app (open on a phone, tap *Start Camera*, scan any packaged food)

## How it works

```mermaid
flowchart LR
    A["Phone camera or manual barcode"] --> B["Browser PWA"]
    B -->|"barcode"| C["Open Food Facts API"]
    C -->|"ingredients, Nutri-Score, NOVA, nutrition"| B
    B -->|"product data"| D["Vercel function: api/analyze"]
    D -->|"structured data"| G["Rule-based scorer"]
    G -->|"score and breakdown"| D
    D -->|"forced tool call, temperature 0"| E["Claude Haiku 4.5"]
    E -->|"schema-validated explanation"| D
    D -->|"score and explanation"| B
    B --> F["Score, flags, positives, swaps"]
```

1. **Scan:** the browser's native `BarcodeDetector` reads the barcode (Chrome on Android). Browsers without it fall back to ZXing.
2. **Ground the AI in real data:** ingredients and nutrition come from [Open Food Facts](https://world.openfoodfacts.org), a crowd-sourced food database, so the model analyses a real label instead of guessing from a product name.
3. **Score, then explain, on the server:** `/api/analyze` computes the 0–100 score with deterministic rules (`lib/score.js`), then asks Claude to explain it: a summary, flagged ingredients, positives and swaps.
4. **Render:** the result is shown as a score ring, categorised concerns, positives, swaps and a **Score tab** that lists exactly how the number was built.

## Design decisions

| Decision | Why |
|---|---|
| **API key lives on the server**, not in the page | A browser-side key can be copied from DevTools by anyone. The serverless function holds it as an environment variable and validates and size-limits input. |
| **Forced tool call for structured output** | Claude must call a `report_analysis` tool with a JSON schema (score range, verdict enum, flag categories). This replaces parsing free text with regexes and removes malformed-JSON failures. |
| **Score is computed in code, not by the LLM** | An earlier version let Claude set the score and it bunched bad products together (Oreo, Coca-Cola and Nutella all got 28). Rules over Nutri-Score, NOVA, sugar, saturated fat, salt and additive count make it repeatable, unit-tested and explainable. The LLM only explains it. |
| **Grounding rules in the system prompt** | The model may flag only ingredients that literally appear in the supplied list. With no list, it returns a neutral score and says so instead of inventing flags. |
| **Temperature 0** | Keeps results as repeatable as possible for a demo and for testing. |
| **Haiku 4.5 by default** | The task is short and structured, so a small fast model gives ~5 s responses at a fraction of a cent per scan. The model can be changed with the `ANALYZE_MODEL` environment variable. |
| **All rendered text is HTML-escaped** | Open Food Facts is crowd-edited, and model output is untrusted. Both are escaped before display to prevent script injection. |
| **Network-first service worker, with a versioned cache** | Deployed updates show up immediately, and the app shell still loads offline. API and data calls are never cached. |
| **No build step** | One static page plus one function keeps it easy to read, deploy and explain. |

## Tested behaviour

- `npm test` runs 8 unit tests on the scoring module: determinism, clamping to 0–100, missing data, garbage input, and that different bad products no longer collapse to one score.
- Live API tested against real Open Food Facts products: every flagged ingredient was found in the real ingredient list.
- Example scores: Oreo 13, Kraft Mac 24, Nutella 25, Coca-Cola 26, Doritos 48, plain oats 95. A product with no data returns a neutral 50 with low confidence.
- Camera scanning tested on Chrome for Android.

## Known limitations (honest list)

- **The scoring weights are my judgment**, loosely modelled on Nutri-Score ideas, not a validated clinical standard. They are simple, visible in the Score tab and easy to change.
- **Data quality depends on Open Food Facts.** Some products lack ingredients, Nutri-Score or NOVA, and some are in other languages. Low-data products get a low-confidence label.
- **The AI explanation isn't machine-verified.** I checked flagged ingredients against the source list by hand on sample products; there is no automated evaluation yet.
- **No authentication or rate limiting** on `/api/analyze` beyond input-size limits, so it isn't production-hardened.
- **Not medical or dietary advice.** It is general information only.

## Roadmap

1. **Evaluation script:** run ~20 fixed barcodes and check schema validity and that every flagged ingredient appears in the source text.
2. **Provider-pluggable model layer** (for example an OpenAI-compatible gateway) for fallback and cost control.
3. **Allergy and diet profile:** highlight products that conflict with the user's restrictions.
4. **Per-barcode caching and rate limiting** for lower cost and abuse protection.
5. **Compare mode:** scan two products side by side.

## Run it yourself

```bash
npm i -g vercel
vercel login
vercel env add ANTHROPIC_API_KEY      # your key from console.anthropic.com
vercel dev                             # local, http://localhost:3000
vercel deploy --prod
```

Camera access needs HTTPS (or `localhost`). Get an API key at <https://console.anthropic.com>. Never commit keys; `.env` is git-ignored.

## Project layout

```
index.html        UI, scanner, Open Food Facts lookup, rendering
api/analyze.js    Serverless function: prompt, tool schema, Claude call
lib/score.js      Deterministic scoring rules
test/             Unit tests (npm test)
sw.js             Service worker (network-first, versioned cache)
manifest.json     PWA manifest
icons/            App icons
```

## Tech

Vanilla HTML/CSS/JS · Node test runner · Vercel serverless (Node) · Anthropic Claude API · Open Food Facts API · BarcodeDetector API with ZXing fallback · PWA
