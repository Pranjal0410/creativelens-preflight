(function (exports) {
  "use strict";

  var DEFAULT_DISCLAIMER_KEYWORDS = [
    "terms apply",
    "not typical",
    "sponsored",
    "paid partnership",
    "see terms",
    "conditions apply",
    "disclaimer",
    "results may vary",
  ];

  function parseRules(text) {
    var lines = text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    var rules = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lower = line.toLowerCase();

      if (lower.indexOf("logo") !== -1 && /\d+\s*px/i.test(line)) {
        var px = parseInt(line.match(/(\d+)\s*px/i)[1], 10);
        rules.push({ type: "logo", raw: line, threshold: px, label: "LOGO_MARGIN ≥ " + px + "px" });
        continue;
      }

      if (lower.indexOf("contrast") !== -1 && /\d+(\.\d+)?\s*:\s*1/.test(line)) {
        var ratio = parseFloat(line.match(/(\d+(\.\d+)?)\s*:\s*1/)[1]);
        rules.push({ type: "contrast", raw: line, threshold: ratio, label: "CONTRAST ≥ " + ratio + " : 1" });
        continue;
      }

      if (lower.indexOf("disclaimer") !== -1) {
        var quotedMatches = line.match(/"([^"]+)"/g) || [];
        var quoted = quotedMatches.map(function (m) { return m.slice(1, -1).toLowerCase(); });
        var keywords = quoted.length ? quoted : DEFAULT_DISCLAIMER_KEYWORDS;
        rules.push({ type: "disclaimer", raw: line, keywords: keywords, label: "DISCLAIMER required" });
        continue;
      }
    }

    return rules;
  }

  function hexToRgb(hex) {
    var clean = hex.replace("#", "");
    var num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function relativeLuminance(rgb) {
    var channel = function (c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  function contrastRatio(hexA, hexB) {
    var lumA = relativeLuminance(hexToRgb(hexA));
    var lumB = relativeLuminance(hexToRgb(hexB));
    var lighter = Math.max(lumA, lumB);
    var darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  exports.DEFAULT_DISCLAIMER_KEYWORDS = DEFAULT_DISCLAIMER_KEYWORDS;
  exports.parseRules = parseRules;
  exports.hexToRgb = hexToRgb;
  exports.relativeLuminance = relativeLuminance;
  exports.contrastRatio = contrastRatio;
})(typeof module !== "undefined" && module.exports ? module.exports : (typeof window !== "undefined" ? (window.RulesLib = {}) : {}));
