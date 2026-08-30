(() => {
  "use strict";

  const { parseRules, contrastRatio } = window.RulesLib;

  // ---------- DOM refs ----------

  const rulesInput = document.getElementById("rules-input");
  const gutter = document.getElementById("gutter");
  const compileBtn = document.getElementById("compile-btn");
  const chipsEl = document.getElementById("chips");
  const compileNote = document.getElementById("compile-note");
  const rulesStatus = document.getElementById("rules-status");
  const rulesBody = document.getElementById("rules-body");
  const rulesSummary = document.getElementById("rules-summary");
  const rulesSummaryText = document.getElementById("rules-summary-text");
  const editRulesBtn = document.getElementById("edit-rules-btn");
  const compileLoading = document.getElementById("compile-loading");
  const loadingStatus = document.getElementById("loading-status");

  const stepCreative = document.getElementById("step-creative");
  const creativeBody = document.getElementById("creative-body");
  const creativeSummary = document.getElementById("creative-summary");
  const creativeSummaryText = document.getElementById("creative-summary-text");
  const changeCreativeBtn = document.getElementById("change-creative-btn");
  const fileInput = document.getElementById("file-input");
  const sampleBtn = document.getElementById("sample-btn");

  const stepVerify = document.getElementById("step-verify");
  const creativeWrap = document.getElementById("creative-wrap");
  const canvas = document.getElementById("creative-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const logo = document.getElementById("logo");
  const marginReadout = document.getElementById("margin-readout");
  const logoStatus = document.getElementById("logo-status");
  const logoReadout = document.getElementById("logo-readout");

  const textStatus = document.getElementById("text-status");
  const detectedTextBox = document.getElementById("detected-text-box");
  const editTextBtn = document.getElementById("edit-text-btn");
  const extractedText = document.getElementById("extracted-text");

  const contrastStatus = document.getElementById("contrast-status");
  const pickTextBtn = document.getElementById("pick-text-btn");
  const pickBgBtn = document.getElementById("pick-bg-btn");
  const textSwatch = document.getElementById("text-swatch");
  const bgSwatch = document.getElementById("bg-swatch");
  const textHex = document.getElementById("text-hex");
  const bgHex = document.getElementById("bg-hex");
  const contrastReadout = document.getElementById("contrast-readout");
  const contrastRequired = document.getElementById("contrast-required");
  const pickHint = document.getElementById("pick-hint");

  const runBtn = document.getElementById("run-btn");
  const stepResult = document.getElementById("step-result");
  const scoreEl = document.getElementById("score");
  const reportEl = document.getElementById("report");

  let compiledRules = [];
  let lastCompiledText = null;
  let textColor = null;
  let bgColor = null;
  let pickMode = null;
  let imageReady = false;

  function getRule(type) {
    return compiledRules.find((r) => r.type === type);
  }

  function setStatus(el, state, label) {
    const prevState = el.dataset.state || "";
    el.className = "status-pill" + (state ? " " + state : "");
    el.textContent = label;
    el.dataset.state = state;
    if (state && state !== prevState && (state === "passed" || state === "failed")) {
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
  }

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

  function renderChips(rules) {
    chipsEl.innerHTML = "";
    if (!rules.length) {
      chipsEl.hidden = true;
      return;
    }
    chipsEl.hidden = false;
    rules.forEach((rule, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = rule.label;
      chip.dataset.index = i;
      chip.addEventListener("click", () => highlightReportRow(i));
      chipsEl.appendChild(chip);
    });
  }

  function highlightReportRow(index) {
    const row = reportEl.querySelector(`[data-index="${index}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
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

  const LOADING_MESSAGES = ["Extracting constraints…", "Normalising rule language…", "Building checks…"];

  function startLoadingCycle() {
    compileLoading.hidden = false;
    let i = 0;
    loadingStatus.textContent = LOADING_MESSAGES[0];
    return setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      loadingStatus.textContent = LOADING_MESSAGES[i];
    }, 900);
  }

  function collapseRulesStep(summaryText) {
    rulesBody.hidden = true;
    rulesSummary.hidden = false;
    rulesSummaryText.textContent = summaryText;
    setStatus(rulesStatus, "passed", "compiled");
    stepCreative.hidden = false;
  }

  editRulesBtn.addEventListener("click", () => {
    rulesBody.hidden = false;
    rulesSummary.hidden = true;
    setStatus(rulesStatus, "", "ready");
  });

  async function compile() {
    const text = rulesInput.value;
    if (text === lastCompiledText && compiledRules.length) {
      collapseRulesStep(`${compiledRules.length} rule${compiledRules.length === 1 ? "" : "s"} compiled`);
      return compiledRules;
    }

    compileBtn.disabled = true;
    setStatus(rulesStatus, "processing", "compiling");
    const cycle = startLoadingCycle();

    try {
      compiledRules = await compileWithGemini(text);
      compileNote.textContent = "Compiled by Gemini — reads whatever phrasing you throw at it.";
    } catch (err) {
      compiledRules = parseRules(text);
      compileNote.textContent = "Gemini unavailable — fell back to the pattern-based parser.";
    } finally {
      clearInterval(cycle);
      compileLoading.hidden = true;
      compileBtn.disabled = false;
    }

    lastCompiledText = text;
    compileNote.hidden = false;
    renderChips(compiledRules);

    if (compiledRules.length) {
      collapseRulesStep(`${compiledRules.length} rule${compiledRules.length === 1 ? "" : "s"} compiled`);
    } else {
      setStatus(rulesStatus, "failed", "no rules found");
    }

    refreshLiveStatuses();
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

  function resetVerifyState() {
    textColor = null;
    bgColor = null;
    pickMode = null;
    canvas.classList.remove("pick-mode");
    pickTextBtn.classList.remove("armed");
    pickBgBtn.classList.remove("armed");
    textSwatch.style.background = "var(--border)";
    bgSwatch.style.background = "var(--border)";
    textHex.textContent = "—";
    bgHex.textContent = "—";
    contrastReadout.textContent = "— : 1";
    pickHint.hidden = true;
    extractedText.value = "";
    extractedText.hidden = true;
    detectedTextBox.hidden = false;
    editTextBtn.hidden = true;
    stepResult.hidden = true;
  }

  function onImageLoaded(label) {
    resetVerifyState();
    creativeBody.hidden = true;
    creativeSummary.hidden = false;
    creativeSummaryText.textContent = label;
    stepVerify.hidden = false;
    imageReady = true;
    placeLogoInitial();
    runOcr();
    refreshLiveStatuses();
    stepVerify.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  changeCreativeBtn.addEventListener("click", () => {
    creativeBody.hidden = false;
    creativeSummary.hidden = true;
    stepVerify.hidden = true;
    imageReady = false;
  });

  function loadImageFromSrc(src, label) {
    const img = new Image();
    img.onload = () => {
      drawImageToCanvas(img);
      onImageLoaded(label);
    };
    img.src = src;
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadImageFromSrc(reader.result, file.name);
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
      drawImageToCanvas(img);
      onImageLoaded("Sample banner");
      setColor("text", sample.textColor);
      setColor("bg", sample.bgColor);
    };
    img.src = sample.dataUrl;
  });

  // ---------- OCR ----------

  async function runOcr() {
    setStatus(textStatus, "processing", "reading");
    detectedTextBox.textContent = "reading text off the image…";
    try {
      const { data } = await Tesseract.recognize(canvas.toDataURL("image/png"), "eng");
      const text = data.text.trim();
      extractedText.value = text;
      detectedTextBox.textContent = text || "(no text found)";
    } catch (err) {
      detectedTextBox.textContent = "couldn't read the image automatically — edit below to add the copy.";
      extractedText.value = "";
    }
    editTextBtn.hidden = false;
    refreshLiveStatuses();
  }

  editTextBtn.addEventListener("click", () => {
    detectedTextBox.hidden = true;
    editTextBtn.hidden = true;
    extractedText.hidden = false;
    extractedText.focus();
  });

  extractedText.addEventListener("input", () => refreshLiveStatuses());

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
    marginReadout.textContent = `${margin}px`;

    const logoRect = logo.getBoundingClientRect();
    const boxRect = creativeWrap.getBoundingClientRect();
    const readoutWidth = marginReadout.offsetWidth;

    let left = logoRect.left - boxRect.left;
    left = clamp(left, 4, boxRect.width - readoutWidth - 4);

    let top = logoRect.top - boxRect.top - 22;
    if (top < 4) top = logoRect.bottom - boxRect.top + 6;

    marginReadout.style.left = `${left}px`;
    marginReadout.style.top = `${top}px`;

    refreshLogoStatus(margin);
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
      textHex.textContent = hex;
    } else {
      bgColor = hex;
      bgSwatch.style.background = hex;
      bgHex.textContent = hex;
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

  function updateContrastPreview() {
    if (!textColor || !bgColor) {
      contrastReadout.textContent = "— : 1";
      refreshLiveStatuses();
      return;
    }
    const ratio = contrastRatio(textColor, bgColor);
    contrastReadout.textContent = `${ratio.toFixed(1)} : 1`;
    refreshLiveStatuses();
  }

  // ---------- Live per-field status ----------

  function refreshLogoStatus(margin) {
    const rule = getRule("logo");
    if (!rule) {
      setStatus(logoStatus, "", "—");
      logoReadout.textContent = `${margin}px from the nearest edge.`;
      marginReadout.classList.remove("pass", "fail");
      return;
    }
    const pass = margin >= rule.threshold;
    setStatus(logoStatus, pass ? "passed" : "failed", pass ? "passed" : "failed");
    logoReadout.textContent = `${margin}px measured · ${rule.threshold}px required`;
    marginReadout.classList.toggle("pass", pass);
    marginReadout.classList.toggle("fail", !pass);
  }

  function refreshTextStatus() {
    const rule = getRule("disclaimer");
    if (!rule) {
      setStatus(textStatus, "", "—");
      return;
    }
    const copy = extractedText.value.toLowerCase();
    const match = rule.keywords.find((k) => copy.includes(k.toLowerCase()));
    setStatus(textStatus, match ? "passed" : "failed", match ? "passed" : "failed");
  }

  function refreshContrastStatus() {
    const rule = getRule("contrast");
    if (!rule) {
      contrastRequired.hidden = true;
      setStatus(contrastStatus, "", "—");
      contrastReadout.classList.remove("pass", "fail");
      return;
    }
    contrastRequired.hidden = false;
    contrastRequired.textContent = `required ≥ ${rule.threshold} : 1`;
    if (!textColor || !bgColor) {
      setStatus(contrastStatus, "needs-input", "needs input");
      contrastReadout.classList.remove("pass", "fail");
      return;
    }
    const ratio = contrastRatio(textColor, bgColor);
    const pass = ratio >= rule.threshold;
    setStatus(contrastStatus, pass ? "passed" : "failed", pass ? "passed" : "failed");
    contrastReadout.classList.toggle("pass", pass);
    contrastReadout.classList.toggle("fail", !pass);
  }

  function refreshLiveStatuses() {
    if (!imageReady) return;
    refreshLogoStatus(currentMargin());
    refreshTextStatus();
    refreshContrastStatus();
  }

  // ---------- Run check ----------

  const FRIENDLY_NAME = {
    logo: "Logo spacing",
    contrast: "Contrast",
    disclaimer: "Disclaimer",
  };

  function evaluateRule(rule) {
    if (rule.type === "logo") {
      const margin = currentMargin();
      const pass = margin >= rule.threshold;
      return {
        pass,
        detail: pass
          ? `${margin}px measured — clears the ${rule.threshold}px minimum`
          : `${margin}px measured — needs ${rule.threshold}px`,
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
      li.dataset.index = i;

      const icon = document.createElement("span");
      icon.className = "report-icon";
      icon.textContent = result.pass ? "✓" : "×";

      const body = document.createElement("div");

      const title = document.createElement("p");
      title.className = "report-title";
      title.textContent = FRIENDLY_NAME[rule.type] || rule.type;

      const detail = document.createElement("p");
      detail.className = "report-detail";
      detail.textContent = result.detail;

      const source = document.createElement("p");
      source.className = "report-source";
      source.textContent = rule.raw;

      body.appendChild(title);
      body.appendChild(detail);
      body.appendChild(source);
      li.appendChild(icon);
      li.appendChild(body);
      reportEl.appendChild(li);
    });

    const allPass = passCount === rules.length;
    scoreEl.textContent = `${passCount} / ${rules.length} passed`;
    scoreEl.className = "score " + (allPass ? "all-pass" : "has-fail");
    if (allPass) {
      scoreEl.classList.remove("celebrate");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("celebrate");
    }

    stepResult.hidden = false;
    stepResult.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runCheck() {
    if (!imageReady) return;
    if (!compiledRules.length) await compile();
    if (!compiledRules.length) return;

    const results = compiledRules.map(evaluateRule);
    renderReport(compiledRules, results);
  }

  runBtn.addEventListener("click", () => runCheck());
})();
