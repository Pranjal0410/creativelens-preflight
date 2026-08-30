const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRules, contrastRatio, relativeLuminance, hexToRgb } = require("../lib/rules.js");

test("parseRules extracts a logo margin rule", () => {
  const rules = parseRules("Logo must keep at least 24px clear space from every edge.");
  assert.equal(rules.length, 1);
  assert.equal(rules[0].type, "logo");
  assert.equal(rules[0].threshold, 24);
});

test("parseRules extracts a contrast rule", () => {
  const rules = parseRules("Text over the creative must hold a contrast ratio of at least 4.5:1.");
  assert.equal(rules.length, 1);
  assert.equal(rules[0].type, "contrast");
  assert.equal(rules[0].threshold, 4.5);
});

test("parseRules uses a quoted phrase for disclaimer keywords", () => {
  const rules = parseRules('Every ad must include a disclaimer line ("terms apply" or similar).');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].type, "disclaimer");
  assert.deepEqual(rules[0].keywords, ["terms apply"]);
});

test("parseRules falls back to default keywords with no quoted phrase", () => {
  const rules = parseRules("Every ad must include a disclaimer.");
  assert.equal(rules[0].keywords.includes("terms apply"), true);
});

test("parseRules skips lines that aren't a recognised rule type", () => {
  const rules = parseRules("All creative must be reviewed by legal before publishing.");
  assert.equal(rules.length, 0);
});

test("parseRules handles multiple lines together", () => {
  const rules = parseRules(
    [
      "Logo must keep at least 24px clear space from every edge.",
      "Every ad must include a disclaimer line (\"terms apply\" or similar).",
      "Text over the creative must hold a contrast ratio of at least 4.5:1.",
    ].join("\n")
  );
  assert.equal(rules.length, 3);
});

test("contrastRatio: black on white is close to 21:1", () => {
  const ratio = contrastRatio("#000000", "#ffffff");
  assert.ok(Math.abs(ratio - 21) < 0.1, `expected ~21, got ${ratio}`);
});

test("contrastRatio: identical colours give a ratio of 1:1", () => {
  const ratio = contrastRatio("#336699", "#336699");
  assert.ok(Math.abs(ratio - 1) < 0.001);
});

test("contrastRatio is symmetric regardless of argument order", () => {
  const a = contrastRatio("#111111", "#eeeeee");
  const b = contrastRatio("#eeeeee", "#111111");
  assert.equal(a, b);
});

test("relativeLuminance of white is 1, of black is 0", () => {
  assert.ok(Math.abs(relativeLuminance(hexToRgb("#ffffff")) - 1) < 0.001);
  assert.ok(Math.abs(relativeLuminance(hexToRgb("#000000")) - 0) < 0.001);
});

test("hexToRgb parses channels correctly", () => {
  assert.deepEqual(hexToRgb("#ff8000"), { r: 255, g: 128, b: 0 });
});
