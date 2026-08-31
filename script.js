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
  const loadingChecklist = document.getElementById("loading-checklist");
  const fallbackAlert = document.getElementById("fallback-alert");
  const retryCompileBtn = document.getElementById("retry-compile-btn");
  const ruleInspector = document.getElementById("rule-inspector");
  const inspectorHint = document.getElementById("inspector-hint");
  const ocrConfidenceNote = document.getElementById("ocr-confidence-note");

  const stepCreative = document.getElementById("step-creative");
  const creativeBody = document.getElementById("creative-body");
  const creativeSummary = document.getElementById("creative-summary");
  const creativeSummaryText = document.getElementById("creative-summary-text");
  const changeCreativeBtn = document.getElementById("change-creative-btn");
  const fileInput = document.getElementById("file-input");
  const sampleBtn = document.getElementById("sample-btn");
  const assetMeta = document.getElementById("asset-meta");

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
  const validateLoading = document.getElementById("validate-loading");
  const validateChecklist = document.getElementById("validate-checklist");
  const stepResult = document.getElementById("step-result");
  const scoreEl = document.getElementById("score");
  const verdictBanner = document.getElementById("verdict-banner");
  const verdictHeadline = document.getElementById("verdict-headline");
  const verdictSub = document.getElementById("verdict-sub");
  const verdictProgressBar = document.getElementById("verdict-progress-bar");
  const issueNav = document.getElementById("issue-nav");
  const reportEl = document.getElementById("report");
  const runHistoryEl = document.getElementById("run-history");
  const runHistoryList = document.getElementById("run-history-list");
  const runDetailsToggle = document.getElementById("run-details-toggle");
  const runDetails = document.getElementById("run-details");
  const systemNotesToggle = document.getElementById("system-notes-toggle");
  const systemNotesBody = document.getElementById("system-notes-body");

  systemNotesToggle.addEventListener("click", () => {
    systemNotesBody.hidden = !systemNotesBody.hidden;
    systemNotesToggle.textContent = systemNotesBody.hidden ? "System notes →" : "Hide system notes";
  });

  let compiledRules = [];
  let lastCompiledText = null;
  let textColor = null;
  let bgColor = null;
  let pickMode = null;
  let imageReady = false;
  let runHistory = [];
  const runStats = { compileMs: null, usedFallback: false, ocrMs: null, assetLabel: null, assetMeta: null };

  // ---------- Pipeline stage indicator ----------

  function setPipelineStage(stage) {
    const order = ["policy", "asset", "validation", "results"];
    const idx = order.indexOf(stage);
    order.forEach((s, i) => {
      const el = document.getElementById(`pipeline-${s}`);
      el.classList.remove("active", "done");
      if (i < idx) el.classList.add("done");
      else if (i === idx) el.classList.add("active");
    });
  }

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

  const METHOD_LABEL = {
    logo: "Deterministic — measured from cursor position on the canvas",
    contrast: "Deterministic — WCAG relative-luminance formula on sampled pixels",
    disclaimer: "Deterministic match against AI-assisted (OCR) or human-corrected text",
  };

  function buildInspectorFields(rule) {
    if (rule.type === "logo") {
      return [
        ["type", "geometric"],
        ["target", "logo"],
        ["operator", "≥"],
        ["threshold", `${rule.threshold}px`],
        ["source", `"${rule.raw}"`],
        ["validation", METHOD_LABEL.logo],
      ];
    }
    if (rule.type === "contrast") {
      return [
        ["type", "visual"],
        ["target", "text / background"],
        ["operator", "≥"],
        ["threshold", `${rule.threshold}:1`],
        ["source", `"${rule.raw}"`],
        ["validation", METHOD_LABEL.contrast],
      ];
    }
    return [
      ["type", "textual"],
      ["target", "disclaimer text"],
      ["requirement", "phrase match"],
      ["matcher", rule.keywords.map((k) => `"${k}"`).join(", ")],
      ["source", `"${rule.raw}"`],
      ["validation", METHOD_LABEL.disclaimer],
    ];
  }

  function renderInspector(rule, index) {
    const title = document.createElement("p");
    title.className = "inspector-title";
    title.textContent = `RULE-${String(index + 1).padStart(3, "0")} · ${rule.label}`;

    const dl = document.createElement("dl");
    buildInspectorFields(rule).forEach(([key, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });

    ruleInspector.innerHTML = "";
    ruleInspector.appendChild(title);
    ruleInspector.appendChild(dl);
    ruleInspector.hidden = false;
  }

  let inspectedIndex = null;

  function renderChips(rules, unsupported) {
    chipsEl.innerHTML = "";
    ruleInspector.hidden = true;
    inspectedIndex = null;
    if (!rules.length && !(unsupported && unsupported.length)) {
      chipsEl.hidden = true;
      inspectorHint.hidden = true;
      return;
    }
    chipsEl.hidden = false;
    inspectorHint.hidden = !rules.length;
    rules.forEach((rule, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = rule.label;
      chip.dataset.index = i;
      chip.addEventListener("click", () => onChipClick(i));
      chipsEl.appendChild(chip);
    });
    (unsupported || []).forEach((line) => {
      const chip = document.createElement("span");
      chip.className = "chip manual-review";
      const truncated = line.length > 34 ? line.slice(0, 34).trim() + "…" : line;
      chip.title = `"${line}" — not automatically checkable in this prototype`;
      chip.textContent = `MANUAL REVIEW · "${truncated}"`;
      chipsEl.appendChild(chip);
    });
  }

  function onChipClick(index) {
    if (!stepResult.hidden) {
      highlightReportRow(index);
      return;
    }
    const isReopening = inspectedIndex === index;
    inspectedIndex = isReopening ? null : index;
    [...chipsEl.children].forEach((c, i) => c.classList.toggle("active", i === inspectedIndex));
    if (inspectedIndex === null) {
      ruleInspector.hidden = true;
    } else {
      renderInspector(compiledRules[index], index);
    }
  }

  function highlightReportRow(index) {
    const row = reportEl.querySelector(`[data-index="${index}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
  }

  const EVIDENCE_TARGET = { logo: "verify-logo", contrast: "verify-contrast", disclaimer: "verify-text" };

  function jumpToEvidence(type) {
    const block = document.getElementById(EVIDENCE_TARGET[type]);
    if (!block) return;
    block.scrollIntoView({ behavior: "smooth", block: "center" });
    block.classList.remove("flash-highlight");
    void block.offsetWidth;
    block.classList.add("flash-highlight");
  }

  function computeUnsupportedLines(text, rules) {
    const inputLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const matchedRaw = new Set(rules.map((r) => r.raw.trim()));
    return inputLines.filter((line) => !matchedRaw.has(line));
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

  function setChecklistStep(el, activeIndex) {
    [...el.children].forEach((li, i) => {
      li.className = i < activeIndex ? "item-done" : i === activeIndex ? "item-active" : "item-pending";
    });
  }

  function startLoadingCycle() {
    compileLoading.hidden = false;
    setChecklistStep(loadingChecklist, 0);
    const timers = [
      setTimeout(() => setChecklistStep(loadingChecklist, 1), 600),
      setTimeout(() => setChecklistStep(loadingChecklist, 2), 1800),
    ];
    return { timers };
  }

  function stopLoadingCycle(cycle) {
    cycle.timers.forEach(clearTimeout);
    setChecklistStep(loadingChecklist, 3);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runValidateAnimation() {
    validateLoading.hidden = false;
    setChecklistStep(validateChecklist, 0);
    await sleep(180);
    setChecklistStep(validateChecklist, 1);
    await sleep(180);
    setChecklistStep(validateChecklist, 2);
    await sleep(180);
    setChecklistStep(validateChecklist, 3);
    validateLoading.hidden = true;
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
    setPipelineStage("policy");
  });

  async function compile() {
    const text = rulesInput.value;
    if (text === lastCompiledText && compiledRules.length) {
      collapseRulesStep(`${compiledRules.length} rule${compiledRules.length === 1 ? "" : "s"} compiled`);
      return compiledRules;
    }

    compileBtn.disabled = true;
    setStatus(rulesStatus, "processing", "compiling");
    fallbackAlert.hidden = true;
    compileNote.hidden = true;
    const cycle = startLoadingCycle();

    let usedFallback = false;
    const compileStart = performance.now();
    try {
      compiledRules = await compileWithGemini(text);
      compileNote.textContent = "Natural-language policy → structured checks.";
    } catch (err) {
      compiledRules = parseRules(text);
      usedFallback = true;
    } finally {
      runStats.compileMs = Math.round(performance.now() - compileStart);
      runStats.usedFallback = usedFallback;
      stopLoadingCycle(cycle);
      compileLoading.hidden = true;
      compileBtn.disabled = false;
    }

    lastCompiledText = text;
    if (usedFallback) {
      fallbackAlert.hidden = false;
    } else {
      compileNote.hidden = false;
    }

    const unsupported = computeUnsupportedLines(text, compiledRules);
    renderChips(compiledRules, unsupported);

    if (compiledRules.length) {
      const ambiguous = unsupported.length ? ` · ${unsupported.length} ambiguous` : "";
      collapseRulesStep(`${compiledRules.length} rule${compiledRules.length === 1 ? "" : "s"} compiled${ambiguous}`);
      setPipelineStage("asset");
    } else {
      setStatus(rulesStatus, "failed", "no rules found");
    }

    refreshLiveStatuses();
    return compiledRules;
  }

  compileBtn.addEventListener("click", () => compile());
  retryCompileBtn.addEventListener("click", () => {
    lastCompiledText = null;
    compile();
  });

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
    runHistory = [];
    runHistoryEl.hidden = true;
    runHistoryList.innerHTML = "";
    assetMeta.hidden = true;
    runDetailsToggle.hidden = true;
    runDetails.hidden = true;
    runDetails.innerHTML = "";
    runStats.ocrMs = null;
  }

  function onImageLoaded(label, meta) {
    resetVerifyState();
    creativeBody.hidden = true;
    creativeSummary.hidden = false;
    creativeSummaryText.textContent = label;
    if (meta) {
      assetMeta.hidden = false;
      assetMeta.textContent = `${meta.width} × ${meta.height}px${meta.type ? " · " + meta.type : ""}`;
    }
    runStats.assetLabel = label;
    runStats.assetMeta = meta;
    stepVerify.hidden = false;
    imageReady = true;
    placeLogoInitial();
    runOcr();
    refreshLiveStatuses();
    setPipelineStage("validation");
    stepVerify.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  changeCreativeBtn.addEventListener("click", () => {
    creativeBody.hidden = false;
    creativeSummary.hidden = true;
    stepVerify.hidden = true;
    imageReady = false;
    setPipelineStage("asset");
  });

  function loadImageFromSrc(src, label, type) {
    const img = new Image();
    img.onload = () => {
      drawImageToCanvas(img);
      onImageLoaded(label, { width: img.naturalWidth, height: img.naturalHeight, type });
    };
    img.src = src;
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadImageFromSrc(reader.result, file.name, file.type || "image");
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
      onImageLoaded("Sample banner", { width: img.naturalWidth, height: img.naturalHeight, type: "image/png" });
      setColor("text", sample.textColor);
      setColor("bg", sample.bgColor);
    };
    img.src = sample.dataUrl;
  });

  // ---------- OCR ----------

  const OCR_CONFIDENCE_THRESHOLD = 70;

  async function runOcr() {
    setStatus(textStatus, "processing", "reading");
    detectedTextBox.textContent = "reading text off the image…";
    ocrConfidenceNote.hidden = true;
    const ocrStart = performance.now();
    try {
      const { data } = await Tesseract.recognize(canvas.toDataURL("image/png"), "eng");
      const text = data.text.trim();
      extractedText.value = text;
      detectedTextBox.textContent = text || "(no text found)";
      if (typeof data.confidence === "number" && data.confidence < OCR_CONFIDENCE_THRESHOLD) {
        ocrConfidenceNote.hidden = false;
        ocrConfidenceNote.textContent = `Low OCR confidence (${Math.round(data.confidence)}%) — check the text below before relying on it.`;
      }
    } catch (err) {
      detectedTextBox.textContent = "couldn't read the image automatically — edit below to add the copy.";
      extractedText.value = "";
    }
    runStats.ocrMs = Math.round(performance.now() - ocrStart);
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

  const SEVERITY = {
    logo: "error",
    contrast: "warning",
    disclaimer: "critical",
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
        recommendation: pass ? null : `Move the logo at least ${rule.threshold - margin}px further from the nearest edge.`,
        expected: `≥ ${rule.threshold}px`,
        measured: `${margin}px`,
        method: METHOD_LABEL.logo,
      };
    }

    if (rule.type === "contrast") {
      if (!textColor || !bgColor) {
        return {
          pass: false,
          detail: "pick a text colour and a background colour on the image first",
          recommendation: "Use the Contrast panel above to sample the text and background colours.",
          expected: `≥ ${rule.threshold}:1`,
          measured: "not sampled yet",
          method: METHOD_LABEL.contrast,
        };
      }
      const ratio = contrastRatio(textColor, bgColor);
      const pass = ratio >= rule.threshold;
      return {
        pass,
        detail: pass
          ? `${ratio.toFixed(1)}:1 measured — clears the ${rule.threshold}:1 minimum`
          : `${ratio.toFixed(1)}:1 measured — needs ${rule.threshold}:1`,
        recommendation: pass
          ? null
          : `Darken the text or lighten the background until the ratio reaches at least ${rule.threshold}:1.`,
        expected: `≥ ${rule.threshold}:1`,
        measured: `${ratio.toFixed(1)}:1`,
        method: METHOD_LABEL.contrast,
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
        recommendation: match ? null : `Add one of the required phrases (e.g. "${rule.keywords[0]}") to the creative's copy.`,
        expected: rule.keywords.map((k) => `"${k}"`).join(" or "),
        measured: match ? `found "${match}"` : "no match in OCR text",
        method: METHOD_LABEL.disclaimer,
      };
    }

    return { pass: false, detail: "unrecognised rule", recommendation: null, expected: "—", measured: "—", method: "—" };
  }

  function applyFix(rule) {
    if (rule.type === "logo") {
      const box = creativeWrap.getBoundingClientRect();
      const size = logo.offsetWidth;
      logo.style.left = `${Math.round((box.width - size) / 2)}px`;
      logo.style.top = `${Math.round((box.height - size) / 2)}px`;
      updateMarginReadout();
      jumpToEvidence("logo");
      return true;
    }
    if (rule.type === "disclaimer") {
      const phrase = rule.keywords[0];
      extractedText.value = `${extractedText.value.trim()} ${phrase}`.trim();
      detectedTextBox.textContent = extractedText.value;
      extractedText.hidden = false;
      detectedTextBox.hidden = true;
      editTextBtn.hidden = true;
      refreshLiveStatuses();
      jumpToEvidence("disclaimer");
      return true;
    }
    jumpToEvidence(rule.type);
    return false;
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
      if (!result.pass) {
        const severity = document.createElement("span");
        severity.className = `severity-tag ${SEVERITY[rule.type] || "error"}`;
        severity.textContent = SEVERITY[rule.type] || "error";
        title.appendChild(severity);
      }
      title.appendChild(document.createTextNode(FRIENDLY_NAME[rule.type] || rule.type));

      const detail = document.createElement("p");
      detail.className = "report-detail";
      detail.textContent = result.detail;

      const source = document.createElement("p");
      source.className = "report-source";
      source.textContent = rule.raw;

      const evidencePanel = document.createElement("dl");
      evidencePanel.className = "evidence-panel";
      evidencePanel.hidden = true;
      [
        ["Expected", result.expected],
        ["Measured", result.measured],
        ["Method", result.method],
        ["Confidence", rule.type === "disclaimer" ? "Deterministic match; source text is AI-assisted (OCR)" : "Deterministic"],
      ].forEach(([key, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = key;
        const dd = document.createElement("dd");
        dd.textContent = value;
        evidencePanel.appendChild(dt);
        evidencePanel.appendChild(dd);
      });

      const evidenceBtn = document.createElement("button");
      evidenceBtn.className = "link-btn evidence-link";
      evidenceBtn.textContent = "View evidence →";
      evidenceBtn.addEventListener("click", () => {
        evidencePanel.hidden = !evidencePanel.hidden;
        evidenceBtn.textContent = evidencePanel.hidden ? "View evidence →" : "Hide evidence";
        if (!evidencePanel.hidden) jumpToEvidence(rule.type);
      });

      body.appendChild(title);
      body.appendChild(detail);
      if (!result.pass && result.recommendation) {
        const rec = document.createElement("p");
        rec.className = "report-recommendation";
        rec.textContent = result.recommendation;
        body.appendChild(rec);

        const fixBtn = document.createElement("button");
        fixBtn.className = "btn btn-tiny report-fix-btn";
        fixBtn.textContent = rule.type === "contrast" ? "Show me →" : "Fix this →";
        fixBtn.addEventListener("click", () => applyFix(rule));
        body.appendChild(fixBtn);
      }
      body.appendChild(source);
      body.appendChild(evidenceBtn);
      body.appendChild(evidencePanel);
      li.appendChild(icon);
      li.appendChild(body);
      reportEl.appendChild(li);
    });

    const allPass = passCount === rules.length;
    const failCount = rules.length - passCount;
    scoreEl.textContent = `${passCount} / ${rules.length} passed`;
    scoreEl.className = "score " + (allPass ? "all-pass" : "has-fail");
    stepResult.classList.toggle("result-pass", allPass);
    stepResult.classList.toggle("result-fail", !allPass);

    verdictBanner.className = "verdict-banner " + (allPass ? "pass" : "fail");
    verdictHeadline.textContent = allPass ? "✓ READY TO SHIP" : "✕ NOT READY TO SHIP";
    verdictSub.textContent = allPass
      ? `${rules.length} / ${rules.length} checks passed`
      : `${failCount} issue${failCount === 1 ? "" : "s"} need${failCount === 1 ? "s" : ""} attention — fix them below, then run the check again.`;
    verdictProgressBar.style.width = `${Math.round((passCount / rules.length) * 100)}%`;

    issueNav.innerHTML = "";
    rules.forEach((rule, i) => {
      const chip = document.createElement("button");
      chip.className = `issue-chip ${results[i].pass ? "pass" : "fail"}`;
      chip.textContent = `${results[i].pass ? "✓" : String(i + 1)} ${FRIENDLY_NAME[rule.type] || rule.type}`;
      chip.addEventListener("click", () => highlightReportRow(i));
      issueNav.appendChild(chip);
    });

    if (allPass) {
      scoreEl.classList.remove("celebrate");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("celebrate");
    }

    stepResult.hidden = false;
    stepResult.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function logRun(passCount, total) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    runHistory.push({ run: runHistory.length + 1, passCount, total, time });

    runHistoryList.innerHTML = "";
    runHistory.forEach((entry) => {
      const li = document.createElement("li");
      if (entry.passCount === entry.total) li.className = "all-pass";
      const left = document.createElement("span");
      left.textContent = `Run ${entry.run} · ${entry.time}`;
      const right = document.createElement("span");
      right.textContent = `${entry.passCount} / ${entry.total} passed${entry.passCount === entry.total ? " ✓" : ""}`;
      li.appendChild(left);
      li.appendChild(right);
      runHistoryList.appendChild(li);
    });
    runHistoryEl.hidden = runHistory.length < 2;
  }

  function renderRunDetails(results) {
    const passCount = results.filter((r) => r.pass).length;
    const fields = [
      ["Policy", `${compiledRules.length} rule${compiledRules.length === 1 ? "" : "s"} extracted${runStats.usedFallback ? " (pattern fallback)" : " (Gemini)"}`],
      ["Asset", `${runStats.assetLabel || "—"}${runStats.assetMeta ? ` · ${runStats.assetMeta.width} × ${runStats.assetMeta.height}px` : ""}`],
      ["Rule extraction", runStats.compileMs !== null ? `${runStats.compileMs}ms` : "cached, not re-run"],
      ["OCR", runStats.ocrMs !== null ? `${runStats.ocrMs}ms` : "not run"],
      ["Checks evaluated", `${results.length} — ${passCount} passed, ${results.length - passCount} failed`],
      ["Rule parser", runStats.usedFallback ? "Gemini unavailable → regex fallback used" : "Gemini (falls back to regex if unreachable)"],
      ["Rate limiting", "20 requests / 5 minutes / IP, best-effort in-memory"],
      ["Persistence", "None — state resets on reload, this run's history is in-memory only"],
      ["Known limitation", "Logo detection is manual region selection, not automatic vision detection"],
    ];

    runDetails.innerHTML = "";
    const dl = document.createElement("dl");
    fields.forEach(([key, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    runDetails.appendChild(dl);
    runDetailsToggle.hidden = false;
  }

  runDetailsToggle.addEventListener("click", () => {
    runDetails.hidden = !runDetails.hidden;
    runDetailsToggle.textContent = runDetails.hidden ? "View run details →" : "Hide run details";
  });

  async function runCheck() {
    if (!imageReady) return;
    if (!compiledRules.length) await compile();
    if (!compiledRules.length) return;

    runBtn.disabled = true;
    await runValidateAnimation();
    runBtn.disabled = false;

    const results = compiledRules.map(evaluateRule);
    renderReport(compiledRules, results);
    logRun(results.filter((r) => r.pass).length, results.length);
    renderRunDetails(results);
    setPipelineStage("results");
  }

  runBtn.addEventListener("click", () => runCheck());

  // Auto-compile the default policy so the first thing a visitor does
  // is upload a creative, not paste rules into a textarea.
  compile();
})();
