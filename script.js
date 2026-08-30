(() => {
  "use strict";

  const rulesInput = document.getElementById("rules-input");
  const gutter = document.getElementById("gutter");
  const compileBtn = document.getElementById("compile-btn");
  const chipsEl = document.getElementById("chips");
  const compileNote = document.getElementById("compile-note");
  const runBtn = document.getElementById("run-btn");

  const fileInput = document.getElementById("file-input");
  const sampleBtn = document.getElementById("sample-btn");
  const assetEmpty = document.getElementById("asset-empty");
  const creativeWrap = document.getElementById("creative-wrap");
  const canvas = document.getElementById("creative-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const logo = document.getElementById("logo");
  const marginReadout = document.getElementById("margin-readout");
  const dragHint = document.getElementById("drag-hint");

  const ocrBlock = document.getElementById("ocr-block");
  const ocrStatus = document.getElementById("ocr-status");
  const extractedText = document.getElementById("extracted-text");

  const controls = document.getElementById("controls");
  const pickTextBtn = document.getElementById("pick-text-btn");
  const pickBgBtn = document.getElementById("pick-bg-btn");
  const textSwatch = document.getElementById("text-swatch");
  const bgSwatch = document.getElementById("bg-swatch");
  const contrastReadout = document.getElementById("contrast-readout");
  const pickHint = document.getElementById("pick-hint");

  const verdictEmpty = document.getElementById("verdict-empty");
  const verdictContent = document.getElementById("verdict-content");
  const scoreEl = document.getElementById("score");
  const reportEl = document.getElementById("report");

  let compiledRules = [];
  let textColor = null;
  let bgColor = null;
  let pickMode = null;
  let imageReady = false;

  // ---------- Line numbers ----------

  function syncGutter() {
    const lines = rulesInput.value.split("\n").length;
    const nums = [];
    for (let i = 1; i <= lines; i++) nums.push(i);
    gutter.textContent = nums.join("\n");
  }

  rulesInput.addEventListener("input", syncGutter);
  rulesInput.addEventListener("scroll", () => {
    gutter.scrollTop = rulesInput.scrollTop;
  });
  syncGutter();

  // ---------- Rule compiling ----------

  const DEFAULT_DISCLAIMER_KEYWORDS = [
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
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const rules = [];

    for (const line of lines) {
      const lower = line.toLowerCase();

      if (lower.includes("logo") && /\d+\s*px/i.test(line)) {
        const px = parseInt(line.match(/(\d+)\s*px/i)[1], 10);
        rules.push({
          type: "logo",
          raw: line,
          threshold: px,
          label: `LOGO_MARGIN ≥ ${px}px`,
        });
        continue;
      }

      if (lower.includes("contrast") && /\d+(\.\d+)?\s*:\s*1/.test(line)) {
        const ratio = parseFloat(line.match(/(\d+(\.\d+)?)\s*:\s*1/)[1]);
        rules.push({
          type: "contrast",
          raw: line,
          threshold: ratio,
          label: `CONTRAST ≥ ${ratio} : 1`,
        });
        continue;
      }

      if (lower.includes("disclaimer")) {
        const quoted = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
        const keywords = quoted.length ? quoted : DEFAULT_DISCLAIMER_KEYWORDS;
        rules.push({
          type: "disclaimer",
          raw: line,
          keywords,
          label: "DISCLAIMER required",
        });
        continue;
      }
    }

    return rules;
  }

  function renderChips(rules) {
    chipsEl.innerHTML = "";
    if (!rules.length) {
      chipsEl.hidden = true;
      return;
    }
    chipsEl.hidden = false;
    for (const rule of rules) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = rule.label;
      chipsEl.appendChild(chip);
    }
  }

  function normaliseRule(r) {
    const out = { type: r.type, raw: r.raw, label: r.label };
    if (r.type === "logo" || r.type === "contrast") out.threshold = Number(r.threshold);
    if (r.type === "disclaimer") out.keywords = (r.keywords || []).map((k) => String(k).toLowerCase());
    return out;
  }

  async function compileWithGemini(text) {
    const res = await fetch("/api/extract-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rulesText: text }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.rules) || !data.rules.length) throw new Error("empty rules");
    return data.rules.map(normaliseRule);
  }

  let lastCompiledText = null;

  async function compile() {
    const text = rulesInput.value;
    if (text === lastCompiledText && compiledRules.length) {
      renderChips(compiledRules);
      return compiledRules;
    }

    compileBtn.disabled = true;
    compileBtn.textContent = "Compiling…";
    try {
      compiledRules = await compileWithGemini(text);
      compileNote.textContent = "Compiled by Gemini — reads whatever phrasing you throw at it.";
    } catch (err) {
      compiledRules = parseRules(text);
      compileNote.textContent = "Gemini unavailable — fell back to the pattern-based parser.";
    } finally {
      compileBtn.disabled = false;
      compileBtn.textContent = "Compile rules";
    }
    lastCompiledText = text;
    renderChips(compiledRules);
    return compiledRules;
  }

  compileBtn.addEventListener("click", () => compile());

  // ---------- Image loading (upload or sample) ----------

  const MAX_DIM = 900;

  function drawImageToCanvas(img) {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  }

  function resetAssetState() {
    textColor = null;
    bgColor = null;
    pickMode = null;
    canvas.classList.remove("pick-mode");
    pickTextBtn.classList.remove("armed");
    pickBgBtn.classList.remove("armed");
    textSwatch.style.background = "var(--line)";
    bgSwatch.style.background = "var(--line)";
    contrastReadout.textContent = "contrast — : 1";
    pickHint.hidden = true;
    extractedText.value = "";
    verdictEmpty.hidden = false;
    verdictContent.hidden = true;
    assetEmpty.hidden = true;
  }

  function loadImageFromSrc(src) {
    const img = new Image();
    img.onload = () => {
      resetAssetState();
      drawImageToCanvas(img);
      creativeWrap.hidden = false;
      dragHint.hidden = false;
      controls.hidden = false;
      ocrBlock.hidden = false;
      imageReady = true;
      runBtn.disabled = false;
      placeLogoInitial();
      runOcr();
    };
    img.src = src;
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadImageFromSrc(reader.result);
    reader.readAsDataURL(file);
  });

  function buildSampleCreative() {
    const off = document.createElement("canvas");
    off.width = 900;
    off.height = 460;
    const c = off.getContext("2d");

    c.fillStyle = "#f2a76b";
    c.fillRect(0, 0, off.width, off.height);

    c.fillStyle = "#14181c";
    c.font = "bold 26px Arial";
    c.fillText("SUMMER SALE", 48, 90);

    c.font = "bold 58px Arial";
    c.fillText("30% OFF EVERYTHING", 48, 200);
    c.fillText("THIS WEEK ONLY", 48, 270);

    c.font = "28px Arial";
    c.fillText("Shop now before it's gone.", 48, 340);

    return { dataUrl: off.toDataURL("image/png"), textColor: "#14181c", bgColor: "#f2a76b" };
  }

  sampleBtn.addEventListener("click", () => {
    const sample = buildSampleCreative();
    const img = new Image();
    img.onload = () => {
      resetAssetState();
      drawImageToCanvas(img);
      creativeWrap.hidden = false;
      dragHint.hidden = false;
      controls.hidden = false;
      ocrBlock.hidden = false;
      imageReady = true;
      runBtn.disabled = false;
      placeLogoInitial();
      setColor("text", sample.textColor);
      setColor("bg", sample.bgColor);
      runOcr();
    };
    img.src = sample.dataUrl;
  });

  // ---------- OCR ----------

  async function runOcr() {
    ocrStatus.hidden = false;
    ocrStatus.textContent = "reading text off the image…";
    try {
      const { data } = await Tesseract.recognize(canvas.toDataURL("image/png"), "eng");
      extractedText.value = data.text.trim();
      ocrStatus.textContent = "done — edit below if it missed anything";
      setTimeout(() => {
        ocrStatus.hidden = true;
      }, 2500);
    } catch (err) {
      ocrStatus.textContent = "couldn't read the image automatically — type the copy in below";
      extractedText.value = "";
    }
  }

  // ---------- Logo drag + margin ----------

  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function currentMargin() {
    const box = creativeWrap.getBoundingClientRect();
    const logoBox = logo.getBoundingClientRect();
    const left = logoBox.left - box.left;
    const top = logoBox.top - box.top;
    const right = box.right - logoBox.right;
    const bottom = box.bottom - logoBox.bottom;
    return Math.max(0, Math.round(Math.min(left, top, right, bottom)));
  }

  function updateMarginReadout() {
    const margin = currentMargin();
    marginReadout.hidden = false;
    marginReadout.textContent = `margin ${margin}px`;

    const logoRect = logo.getBoundingClientRect();
    const boxRect = creativeWrap.getBoundingClientRect();
    const readoutWidth = marginReadout.offsetWidth;

    let left = logoRect.left - boxRect.left;
    left = clamp(left, 4, boxRect.width - readoutWidth - 4);

    let top = logoRect.top - boxRect.top - 22;
    if (top < 4) top = logoRect.bottom - boxRect.top + 6;

    marginReadout.style.left = `${left}px`;
    marginReadout.style.top = `${top}px`;
    return margin;
  }

  function placeLogoInitial() {
    const box = creativeWrap.getBoundingClientRect();
    const size = logo.offsetWidth;
    logo.style.left = `${box.width - 8 - size}px`;
    logo.style.top = `${box.height - 8 - size}px`;
    logo.style.right = "auto";
    logo.style.bottom = "auto";
    updateMarginReadout();
  }

  function startDrag(clientX, clientY) {
    dragging = true;
    const logoRect = logo.getBoundingClientRect();
    dragOffsetX = clientX - logoRect.left;
    dragOffsetY = clientY - logoRect.top;
  }

  function moveDrag(clientX, clientY) {
    if (!dragging) return;
    const box = creativeWrap.getBoundingClientRect();
    const size = logo.offsetWidth;
    let left = clientX - box.left - dragOffsetX;
    let top = clientY - box.top - dragOffsetY;
    left = clamp(left, 0, box.width - size);
    top = clamp(top, 0, box.height - size);
    logo.style.left = `${left}px`;
    logo.style.top = `${top}px`;
    updateMarginReadout();
  }

  logo.addEventListener("pointerdown", (e) => {
    logo.setPointerCapture(e.pointerId);
    startDrag(e.clientX, e.clientY);
  });
  logo.addEventListener("pointermove", (e) => moveDrag(e.clientX, e.clientY));
  logo.addEventListener("pointerup", () => {
    dragging = false;
  });

  const NUDGE = 6;
  logo.addEventListener("keydown", (e) => {
    const box = creativeWrap.getBoundingClientRect();
    const size = logo.offsetWidth;
    let left = logo.offsetLeft;
    let top = logo.offsetTop;
    if (e.key === "ArrowLeft") left -= NUDGE;
    else if (e.key === "ArrowRight") left += NUDGE;
    else if (e.key === "ArrowUp") top -= NUDGE;
    else if (e.key === "ArrowDown") top += NUDGE;
    else return;
    e.preventDefault();
    logo.style.left = `${clamp(left, 0, box.width - size)}px`;
    logo.style.top = `${clamp(top, 0, box.height - size)}px`;
    updateMarginReadout();
  });

  window.addEventListener("resize", () => {
    if (imageReady) placeLogoInitial();
  });

  // ---------- Pixel colour picking ----------

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function setColor(which, hex) {
    if (which === "text") {
      textColor = hex;
      textSwatch.style.background = hex;
    } else {
      bgColor = hex;
      bgSwatch.style.background = hex;
    }
    updateContrastPreview();
  }

  function armPick(which) {
    pickMode = which;
    canvas.classList.add("pick-mode");
    pickHint.hidden = false;
    pickTextBtn.classList.toggle("armed", which === "text");
    pickBgBtn.classList.toggle("armed", which === "bg");
  }

  function disarmPick() {
    pickMode = null;
    canvas.classList.remove("pick-mode");
    pickHint.hidden = true;
    pickTextBtn.classList.remove("armed");
    pickBgBtn.classList.remove("armed");
  }

  pickTextBtn.addEventListener("click", () => armPick("text"));
  pickBgBtn.addEventListener("click", () => armPick("bg"));

  canvas.addEventListener("click", (e) => {
    if (!pickMode || !imageReady) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    setColor(pickMode, rgbToHex(pixel[0], pixel[1], pixel[2]));
    disarmPick();
  });

  // ---------- Contrast ----------

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  function relativeLuminance({ r, g, b }) {
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function contrastRatio(hexA, hexB) {
    const lumA = relativeLuminance(hexToRgb(hexA));
    const lumB = relativeLuminance(hexToRgb(hexB));
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function updateContrastPreview() {
    if (!textColor || !bgColor) {
      contrastReadout.textContent = "contrast — : 1";
      return;
    }
    const ratio = contrastRatio(textColor, bgColor);
    contrastReadout.textContent = `contrast ${ratio.toFixed(1)} : 1`;
  }

  // ---------- Run check ----------

  function evaluateRule(rule) {
    if (rule.type === "logo") {
      const margin = currentMargin();
      const pass = margin >= rule.threshold;
      return {
        pass,
        detail: pass
          ? `logo sits ${margin}px from the nearest edge — clears the ${rule.threshold}px minimum`
          : `logo sits ${margin}px from the nearest edge — needs ${rule.threshold}px`,
      };
    }

    if (rule.type === "contrast") {
      if (!textColor || !bgColor) {
        return { pass: false, detail: "pick a text colour and a background colour on the image first" };
      }
      const ratio = contrastRatio(textColor, bgColor);
      const pass = ratio >= rule.threshold;
      return {
        pass,
        detail: pass
          ? `${ratio.toFixed(1)}:1 measured — clears the ${rule.threshold}:1 minimum`
          : `${ratio.toFixed(1)}:1 measured — needs ${rule.threshold}:1`,
      };
    }

    if (rule.type === "disclaimer") {
      const copy = extractedText.value.toLowerCase();
      const match = rule.keywords.find((k) => copy.includes(k.toLowerCase()));
      return {
        pass: Boolean(match),
        detail: match
          ? `found "${match}" in the text read off the creative`
          : "no disclaimer phrase found in the text read off the creative",
      };
    }

    return { pass: false, detail: "unrecognised rule" };
  }

  function renderReport(rules, results) {
    reportEl.innerHTML = "";
    let passCount = 0;

    rules.forEach((rule, i) => {
      const result = results[i];
      if (result.pass) passCount++;

      const li = document.createElement("li");
      li.className = result.pass ? "pass" : "fail";

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = result.pass ? "PASS" : "FAIL";

      const body = document.createElement("div");
      body.className = "report-body";

      const ruleText = document.createElement("p");
      ruleText.className = "rule-text";
      ruleText.textContent = rule.raw;

      const detail = document.createElement("p");
      detail.className = "detail";
      detail.textContent = result.detail;

      body.appendChild(ruleText);
      body.appendChild(detail);
      li.appendChild(badge);
      li.appendChild(body);
      reportEl.appendChild(li);
    });

    scoreEl.textContent = `${passCount} / ${rules.length} passed`;
    scoreEl.className = "score " + (passCount === rules.length ? "all-pass" : "has-fail");

    verdictEmpty.hidden = true;
    verdictContent.hidden = false;
  }

  async function runCheck() {
    if (!imageReady) return;
    if (!compiledRules.length) await compile();
    if (!compiledRules.length) return;

    const results = compiledRules.map(evaluateRule);
    renderReport(compiledRules, results);
    document.getElementById("verdict").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  runBtn.addEventListener("click", () => runCheck());
})();
