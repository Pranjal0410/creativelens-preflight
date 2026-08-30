# Preflight

A small working prototype of a rule-enforcement engine: paste a brand guideline, mark it up on a real creative, run the check, get a pass/fail with the exact number that decided it.

Live: https://creativelens-preflight.vercel.app

## Why

Built to explore the same problem [CreativeLens](https://creativelens.ai) solves — turning a brand/legal guideline into something that runs automatically instead of relying on a human to catch it. Not a clone of their product; a small end-to-end slice of the same shape of problem, built to show working code rather than describe it.

## What it actually does

- **Rule compiling** — the rulebook text is sent to Gemini (server-side, via `/api/extract-rules`), which extracts structured rules (`logo` margin, `contrast` ratio, `disclaimer` phrase) from arbitrary phrasing. If Gemini's unreachable, it falls back to a regex-based parser so the page never just breaks.
- **OCR** — Tesseract.js reads the text directly off the uploaded image's pixels, client-side. Editable, since OCR isn't perfect — it's reliable on bold, high-contrast ad copy (the bundled sample) and noticeably weaker on dense, small-text UI screenshots. That's a real limitation of a lightweight client-side OCR engine, not a bug; the correction box exists because of it.
- **Logo margin** — drag the logo overlay; margin to the nearest edge is computed live from real DOM geometry.
- **Contrast** — click two real pixels on the canvas (text, background), contrast ratio computed with the actual WCAG relative-luminance formula.

Everything measured is measured for real. Nothing here is a canned result.

## Architecture

Static HTML/CSS/vanilla JS frontend, one serverless function (`api/extract-rules.js`) as a thin proxy to Gemini so the API key never reaches the browser. No framework, no build step, no database — the smallest thing that's still honest about how a production version would be built.

## Getting from manual marking to automatic detection

Logo margin and contrast both require a human to mark the region right now (drag the logo, click two pixels) — that's real geometry and real WCAG math, but it's not automatic. The path to closing that gap: a vision-capable Gemini call that takes the image and returns bounding boxes for logo-like elements and body text regions, with the manual overlay kept as a fallback for low-confidence results rather than removed outright. Didn't build that here — it's a meaningfully bigger scope than a one-evening prototype, and I'd rather say that plainly than fake it with a canned detection result.

## API hardening

`/api/extract-rules` proxies Gemini so the key never reaches the browser, and has three deliberately modest protections on top of that:
- **Input cap** — rejects rulebook text over 4000 characters.
- **Origin check** — rejects requests whose `Origin`/`Referer` clearly belongs to another site (blocks a third-party page embedding a cross-origin fetch here); requests with no origin header at all — curl, Postman, direct testing — are let through, since blocking those would also block anyone reasonably checking the endpoint.
- **Rate limit** — a best-effort, in-memory per-IP limit (20 requests / 5 minutes). It lives only for the lifetime of one warm serverless instance and resets on cold start, so it's a soft deterrent against a casual abuse loop, not a real distributed limiter.

None of this is enterprise-grade, and it isn't pretending to be — a production version would use a real distributed rate limiter (Upstash/Redis) and short-lived signed tokens instead of an open POST route.

## Known simplifications

A real version of this would need, at minimum:
- A proper NLP/LLM pipeline for rule extraction with retries and confidence scoring, not a single unstructured-output call.
- The automatic detection described above, instead of a manually placed overlay.
- A real distributed rate limiter instead of the in-memory one described above.
- Persistence — nothing here is saved; every session starts fresh.

## Testing

Pure logic (rule parsing, contrast math) lives in `lib/rules.js`, isolated from the DOM specifically so it's testable:

```
npm test
```

## Running locally

```
vercel dev
```

Requires a `GEMINI_API_KEY` environment variable (falls back to the pattern-based parser without one).
