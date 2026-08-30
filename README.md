# Preflight

A small working prototype of a rule-enforcement engine: paste a brand guideline, mark it up on a real creative, run the check, get a pass/fail with the exact number that decided it.

Live: https://creativelens-preflight.vercel.app

## Why

Built to explore the same problem [CreativeLens](https://creativelens.ai) solves — turning a brand/legal guideline into something that runs automatically instead of relying on a human to catch it. Not a clone of their product; a small end-to-end slice of the same shape of problem, built to show working code rather than describe it.

## What it actually does

- **Rule compiling** — the rulebook text is sent to Gemini (server-side, via `/api/extract-rules`), which extracts structured rules (`logo` margin, `contrast` ratio, `disclaimer` phrase) from arbitrary phrasing. If Gemini's unreachable, it falls back to a regex-based parser so the page never just breaks.
- **OCR** — Tesseract.js reads the text directly off the uploaded image's pixels, client-side. Editable, since OCR isn't perfect.
- **Logo margin** — drag the logo overlay; margin to the nearest edge is computed live from real DOM geometry.
- **Contrast** — click two real pixels on the canvas (text, background), contrast ratio computed with the actual WCAG relative-luminance formula.

Everything measured is measured for real. Nothing here is a canned result.

## Architecture

Static HTML/CSS/vanilla JS frontend, one serverless function (`api/extract-rules.js`) as a thin proxy to Gemini so the API key never reaches the browser. No framework, no build step, no database — the smallest thing that's still honest about how a production version would be built.

## Known simplifications

A real version of this would need, at minimum:
- A proper NLP/LLM pipeline for rule extraction with retries and confidence scoring, not a single unstructured-output call.
- Server-side image analysis (real computer vision for logo/element detection) instead of a manually placed overlay.
- Rate limiting and caching on the Gemini route — this repo has a client-side dedupe (skip re-compiling unchanged rulebook text) but no server-side protection.
- Persistence — nothing here is saved; every session starts fresh.

## Running locally

```
vercel dev
```

Requires a `GEMINI_API_KEY` environment variable (falls back to the pattern-based parser without one).
