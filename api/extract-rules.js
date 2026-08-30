const RULE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      type: { type: "STRING", enum: ["logo", "contrast", "disclaimer"] },
      raw: { type: "STRING" },
      threshold: { type: "NUMBER" },
      keywords: { type: "ARRAY", items: { type: "STRING" } },
      label: { type: "STRING" },
    },
    required: ["type", "raw", "label"],
  },
};

const PROMPT = `You turn brand/marketing guideline sentences into structured, enforceable rules for an automated content checker.

For each line in the rulebook below, decide if it is one of these three checkable rule types:
- "logo": a rule about how far a logo/brand mark must sit from the edges of a creative. threshold = the required margin in pixels (a plain number).
- "contrast": a rule about text-to-background contrast ratio. threshold = the required ratio as a plain number (e.g. 4.5 for "4.5:1").
- "disclaimer": a rule that some disclaimer/legal/sponsorship text must appear. keywords = a lowercase array of short phrases that would satisfy the rule (use any phrase quoted in the line; otherwise infer 3-6 reasonable equivalents like "terms apply", "sponsored", "results may vary").

Skip any line that isn't one of these three types — do not invent a rule for it.

For every rule you keep, also produce "label": a short compiled-code-style tag, e.g. "LOGO_MARGIN ≥ 24px", "CONTRAST ≥ 4.5 : 1", or "DISCLAIMER required".

Return only the JSON array matching the schema. "raw" must be the original line, unmodified.

Rulebook:
`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(501).json({ error: "no api key configured" });
    return;
  }

  let rulesText;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    rulesText = body.rulesText;
  } catch {
    res.status(400).json({ error: "bad request body" });
    return;
  }

  if (!rulesText || typeof rulesText !== "string") {
    res.status(400).json({ error: "missing rulesText" });
    return;
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT + rulesText }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RULE_SCHEMA,
            temperature: 0,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      res.status(502).json({ error: "gemini request failed", detail: detail.slice(0, 400) });
      return;
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: "empty response from gemini" });
      return;
    }

    const rules = JSON.parse(text);
    if (!Array.isArray(rules)) {
      res.status(502).json({ error: "unexpected response shape" });
      return;
    }

    res.status(200).json({ rules });
  } catch (err) {
    res.status(500).json({ error: "server error", detail: String(err).slice(0, 400) });
  }
};
