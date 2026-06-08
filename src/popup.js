(function initSheinMaterialFilterPopup() {
  "use strict";

  const logic = window.SheinMaterialFilter;
  const els = {};
  let status = null;
  let settings = logic.normalizeSettings();
  let materialOptions = logic.discoveredMaterialOptions({});
  let activeTabId = null;
  let saveTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function initElements() {
    [
      "statusText",
      "enabledInput",
      "enabledWrap",
      "cardModeInput",
      "presetSelect",
      "presetSection",
      "combineModeInput",
      "displayModeInput",
      "filterControlsSection",
      "productPageScanModeInput",
      "otherPageScanModeInput",
      "scanDelayInput",
      "scanRandomnessInput",
      "rulesSection",
      "rulesList",
      "addRuleButton",
      "cardCount",
      "scannedCount",
      "materialCount",
      "errorCount",
      "refreshButton",
      "clearCacheButton",
      "matchExportSection",
      "exportMatchesCsvButton",
      "exportMatchesJsonButton",
      "exportScannedCsvButton",
      "exportScannedJsonButton"
    ].forEach((id) => {
      els[id] = byId(id);
    });
  }

  function sendToTab(message) {
    return new Promise((resolve) => {
      if (!activeTabId) {
        resolve(null);
        return;
      }
      chrome.tabs.sendMessage(activeTabId, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  async function loadInitialState() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tabs && tabs[0] ? tabs[0].id : null;
    const pageStatus = await sendToTab({ type: "SMF_GET_STATUS" });
    if (pageStatus) {
      status = pageStatus;
      settings = logic.normalizeSettings(pageStatus.settings);
      materialOptions = pageStatus.materials || materialOptions;
      return;
    }
    const values = await storageGet([logic.STORAGE_KEYS.settings, logic.STORAGE_KEYS.materialIndex]);
    settings = logic.normalizeSettings(values[logic.STORAGE_KEYS.settings]);
    materialOptions = logic.discoveredMaterialOptions(values[logic.STORAGE_KEYS.materialIndex] || {});
  }

  function renderPresets() {
    els.presetSelect.innerHTML = '<option value="">Choose a preset</option>';
    for (const [key, preset] of Object.entries(logic.PRESETS)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = preset.label;
      els.presetSelect.appendChild(option);
    }
  }

  function renderRule(rule, index) {
    const row = document.createElement("div");
    row.className = "rule";
    row.dataset.index = String(index);

    const material = document.createElement("select");
    material.className = "rule-material";
    for (const optionData of materialOptions) {
      const option = document.createElement("option");
      option.value = optionData.key;
      option.textContent = optionData.label;
      material.appendChild(option);
    }
    if (!materialOptions.some((option) => option.key === rule.material)) {
      const option = document.createElement("option");
      option.value = rule.material;
      option.textContent = logic.displayMaterialName(rule.material);
      material.appendChild(option);
    }
    material.value = rule.material;

    const comparator = document.createElement("select");
    comparator.className = "rule-comparator";
    for (const comparatorValue of logic.COMPARATORS) {
      const option = document.createElement("option");
      option.value = comparatorValue;
      option.textContent = comparatorValue;
      comparator.appendChild(option);
    }
    comparator.value = rule.comparator;

    const value = document.createElement("input");
    value.className = "rule-value";
    value.type = "number";
    value.min = "0";
    value.max = "100";
    value.step = "0.1";
    value.placeholder = "%";
    value.value = rule.value === null || rule.value === undefined ? "" : String(rule.value);
    value.disabled = rule.comparator === "contains" || rule.comparator === "not contains";

    const remove = document.createElement("button");
    remove.className = "rule-remove";
    remove.type = "button";
    remove.title = "Remove rule";
    remove.textContent = "X";

    row.append(material, comparator, value, remove);
    return row;
  }

  function renderRules() {
    els.rulesList.innerHTML = "";
    settings.rules.forEach((rule, index) => els.rulesList.appendChild(renderRule(rule, index)));
  }

  function renderControls() {
    els.enabledInput.checked = settings.enabled;
    els.cardModeInput.value = settings.cardMode;
    els.combineModeInput.value = settings.combineMode;
    els.displayModeInput.value = settings.displayMode;
    els.productPageScanModeInput.value = settings.productPageScanMode;
    els.otherPageScanModeInput.value = settings.otherPageScanMode;
    els.scanDelayInput.value = String(settings.scanDelaySeconds);
    els.scanRandomnessInput.value = String(settings.scanRandomnessSeconds);
    for (const element of document.querySelectorAll(".filter-only")) {
      element.classList.toggle("is-hidden", settings.cardMode !== "filter");
    }
    renderRules();
  }

  function renderStatus() {
    els.statusText.textContent = status
      ? `${status.pendingCount || 0} pending`
      : "Open a SHEIN listing page";
    els.cardCount.textContent = status ? status.cardCount : 0;
    els.scannedCount.textContent = status ? status.scannedCount : 0;
    els.materialCount.textContent = status ? status.materialCount || 0 : 0;
    els.errorCount.textContent = status ? status.errorCount : 0;
  }

  function render() {
    renderControls();
    renderStatus();
  }

  function readRulesFromDom() {
    return Array.from(els.rulesList.querySelectorAll(".rule")).map((row) => {
      const comparator = row.querySelector(".rule-comparator").value;
      const rawValue = row.querySelector(".rule-value").value;
      return {
        material: row.querySelector(".rule-material").value,
        comparator,
        value: comparator === "contains" || comparator === "not contains" ? null : Number(rawValue)
      };
    });
  }

  async function persistSettings(immediate) {
    settings = logic.normalizeSettings({
      enabled: els.enabledInput.checked,
      cardMode: els.cardModeInput.value,
      combineMode: els.combineModeInput.value,
      displayMode: els.displayModeInput.value,
      productPageScanMode: els.productPageScanModeInput.value,
      otherPageScanMode: els.otherPageScanModeInput.value,
      scanDelaySeconds: els.scanDelayInput.value,
      scanRandomnessSeconds: els.scanRandomnessInput.value,
      rules: readRulesFromDom()
    });

    const save = async () => {
      await storageSet({ [logic.STORAGE_KEYS.settings]: settings });
      const pageStatus = await sendToTab({ type: "SMF_UPDATE_SETTINGS", settings });
      if (pageStatus) {
        status = pageStatus;
        materialOptions = pageStatus.materials || materialOptions;
        renderStatus();
      }
    };

    if (immediate) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
      await save();
    } else {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 250);
    }
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportProducts(matchesOnly, format) {
    const response = await sendToTab({ type: "SMF_EXPORT", matchesOnly });
    if (!response) return;
    const date = new Date().toISOString().slice(0, 10);
    const scope = matchesOnly ? "matches" : "scanned";
    if (format === "csv") {
      downloadText(`shein-material-${scope}-${date}.csv`, response.csv || "", "text/csv");
    } else {
      downloadText(`shein-material-${scope}-${date}.json`, response.json || "[]", "application/json");
    }
  }

  function bindEvents() {
    els.enabledInput.addEventListener("change", () => persistSettings(true));
    els.cardModeInput.addEventListener("change", async () => {
      await persistSettings(true);
      renderControls();
    });
    els.combineModeInput.addEventListener("change", () => persistSettings(true));
    els.displayModeInput.addEventListener("change", () => persistSettings(true));
    els.productPageScanModeInput.addEventListener("change", () => persistSettings(true));
    els.otherPageScanModeInput.addEventListener("change", () => persistSettings(true));
    els.scanDelayInput.addEventListener("change", () => persistSettings(true));
    els.scanRandomnessInput.addEventListener("change", () => persistSettings(true));
    els.scanDelayInput.addEventListener("input", () => persistSettings(false));
    els.scanRandomnessInput.addEventListener("input", () => persistSettings(false));

    els.presetSelect.addEventListener("change", () => {
      const preset = logic.PRESETS[els.presetSelect.value];
      if (!preset) return;
      settings = logic.normalizeSettings({
        ...settings,
        combineMode: preset.combineMode,
        rules: preset.rules
      });
      els.presetSelect.value = "";
      render();
      persistSettings(true);
    });

    els.addRuleButton.addEventListener("click", () => {
      settings.rules = readRulesFromDom();
      settings.rules.push({ material: "rayon", comparator: "contains", value: null });
      renderRules();
      persistSettings(true);
    });

    els.rulesList.addEventListener("change", (event) => {
      if (event.target.classList.contains("rule-comparator")) {
        const row = event.target.closest(".rule");
        const value = row.querySelector(".rule-value");
        value.disabled = event.target.value === "contains" || event.target.value === "not contains";
        if (value.disabled) value.value = "";
      }
      persistSettings(false);
    });

    els.rulesList.addEventListener("input", () => persistSettings(false));
    els.rulesList.addEventListener("click", (event) => {
      if (!event.target.classList.contains("rule-remove")) return;
      settings.rules = readRulesFromDom();
      const index = Number(event.target.closest(".rule").dataset.index);
      settings.rules.splice(index, 1);
      if (!settings.rules.length) settings.rules.push({ material: "rayon", comparator: "contains", value: null });
      renderRules();
      persistSettings(true);
    });

    els.refreshButton.addEventListener("click", async () => {
      status = await sendToTab({ type: "SMF_REFRESH_VISIBLE" }) || status;
      renderStatus();
    });

    els.clearCacheButton.addEventListener("click", async () => {
      status = await sendToTab({ type: "SMF_CLEAR_CACHE" }) || status;
      renderStatus();
    });

    els.exportMatchesCsvButton.addEventListener("click", () => exportProducts(true, "csv"));
    els.exportMatchesJsonButton.addEventListener("click", () => exportProducts(true, "json"));
    els.exportScannedCsvButton.addEventListener("click", () => exportProducts(false, "csv"));
    els.exportScannedJsonButton.addEventListener("click", () => exportProducts(false, "json"));

    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== "SMF_STATUS") return;
      status = message.status;
      materialOptions = status.materials || materialOptions;
      renderStatus();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initElements();
    renderPresets();
    await loadInitialState();
    render();
    bindEvents();
  });
})();
