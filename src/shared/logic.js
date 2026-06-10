(function initSheinMaterialFilterLogic(root) {
  "use strict";

  const STORAGE_KEYS = {
    settings: "smf:settings",
    productCache: "smf:productCache",
    materialIndex: "smf:materialIndex"
  };

  const COMMON_MATERIALS = [
    { key: "rayon", label: "Rayon / Viscose" },
    { key: "cotton", label: "Cotton" },
    { key: "polyester", label: "Polyester" },
    { key: "elastane", label: "Elastane / Spandex" },
    { key: "linen", label: "Linen" },
    { key: "polyamide", label: "Polyamide / Nylon" },
    { key: "wool", label: "Wool" },
    { key: "acrylic", label: "Acrylic" },
    { key: "tpu", label: "TPU" },
    { key: "polycarbonate", label: "Polycarbonate / PC" },
    { key: "pu-leather", label: "PU Leather" },
    { key: "silicone", label: "Silicone" },
    { key: "tempered-glass", label: "Tempered Glass" },
    { key: "plastic", label: "Plastic" },
    { key: "metal", label: "Metal" },
    { key: "zinc-alloy", label: "Zinc Alloy" },
    { key: "aluminum", label: "Aluminum" },
    { key: "resin", label: "Resin" },
    { key: "rubber", label: "Rubber" }
  ];

  const DEFAULT_SETTINGS = {
    enabled: true,
    cardMode: "viewer",
    displayMode: "dim",
    productPageScanMode: "manual",
    otherPageScanMode: "manual",
    scanDelaySeconds: 8,
    scanRandomnessSeconds: 2,
    combineMode: "all",
    rules: [{ material: "rayon", comparator: ">", value: 30 }]
  };

  const PRESETS = {
    rayon30: {
      label: "Rayon/Viscose > 30%",
      combineMode: "all",
      rules: [{ material: "rayon", comparator: ">", value: 30 }]
    },
    cotton100: {
      label: "100% Cotton",
      combineMode: "all",
      rules: [{ material: "cotton", comparator: "=", value: 100 }]
    },
    polyesterRayon: {
      label: "Polyester + Rayon",
      combineMode: "all",
      rules: [
        { material: "polyester", comparator: "contains", value: null },
        { material: "rayon", comparator: "contains", value: null }
      ]
    },
    noPolyester: {
      label: "No Polyester",
      combineMode: "all",
      rules: [{ material: "polyester", comparator: "not contains", value: null }]
    }
  };

  const COMPARATORS = [">", ">=", "=", "<=", "<", "contains", "not contains"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function titleCase(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }

  function normalizeMaterialName(name) {
    let normalized = normalizeWhitespace(name)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\bfibers?\b/g, "")
      .replace(/\bfibre?s?\b/g, "")
      .replace(/\bfabric\b/g, "")
      .replace(/\bblend\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return "";
    if (/\b(viscose|rayon|modal|lyocell)\b/.test(normalized)) return "rayon";
    if (/\b(spandex|elastane|elastodiene)\b/.test(normalized)) return "elastane";
    if (/\b(polyamide|nylon)\b/.test(normalized)) return "polyamide";
    if (/\bpolyester\b/.test(normalized)) return "polyester";
    if (/\bcotton\b/.test(normalized)) return "cotton";
    if (/\blinen\b/.test(normalized)) return "linen";
    if (/\bwool\b/.test(normalized)) return "wool";
    if (/\bacrylic\b/.test(normalized)) return "acrylic";
    if (/\b(tpu|thermoplastic polyurethane)\b/.test(normalized)) return "tpu";
    if (/\b(pc|polycarbonate)\b/.test(normalized)) return "polycarbonate";
    if (/\b(pu leather|polyurethane leather|faux leather|vegan leather)\b/.test(normalized)) return "pu-leather";
    if (/\b(pu|polyurethane)\b/.test(normalized)) return "polyurethane";
    if (/\bsilicone\b/.test(normalized)) return "silicone";
    if (/\btempered glass\b/.test(normalized)) return "tempered-glass";
    if (/\bglass\b/.test(normalized)) return "glass";
    if (/\bzinc alloy\b/.test(normalized)) return "zinc-alloy";
    if (/\b(aluminum|aluminium)\b/.test(normalized)) return "aluminum";
    if (/\bplastic\b/.test(normalized)) return "plastic";
    if (/\bmetal\b/.test(normalized)) return "metal";
    if (/\bresin\b/.test(normalized)) return "resin";
    if (/\brubber\b/.test(normalized)) return "rubber";
    return normalized;
  }

  function displayMaterialName(name) {
    const normalized = normalizeMaterialName(name);
    const common = COMMON_MATERIALS.find((item) => item.key === normalized);
    return common ? common.label : titleCase(name || normalized);
  }

  function createMaterialEntry(rawName, percentage) {
    const cleanedRaw = normalizeWhitespace(rawName)
      .replace(/^[:\-–—]+|[:\-–—]+$/g, "")
      .replace(/\b(main|shell|body|lining|contrast|composition|material|case material|strap material)\s*[:\-–—]/i, "")
      .trim();
    const key = normalizeMaterialName(cleanedRaw);
    if (!key || /^\d+$/.test(key)) return null;
    return {
      key,
      rawName: cleanedRaw || key,
      displayName: displayMaterialName(cleanedRaw || key),
      percentage: Number.isFinite(percentage) ? percentage : null,
      present: true
    };
  }

  function mergeMaterialEntries(entries) {
    const byKey = new Map();
    for (const entry of entries.filter(Boolean)) {
      const existing = byKey.get(entry.key);
      if (!existing) {
        byKey.set(entry.key, { ...entry, rawNames: [entry.rawName] });
        continue;
      }
      if (!existing.rawNames.includes(entry.rawName)) existing.rawNames.push(entry.rawName);
      if (existing.percentage === null && entry.percentage !== null) {
        existing.percentage = entry.percentage;
      } else if (existing.percentage !== null && entry.percentage !== null && entry.percentage > existing.percentage) {
        existing.percentage = entry.percentage;
      }
    }
    return Array.from(byKey.values()).map((entry) => ({
      key: entry.key,
      rawName: entry.rawNames.join(" / "),
      displayName: entry.displayName,
      percentage: entry.percentage,
      present: true
    }));
  }

  function stripCompositionLabels(value) {
    return normalizeWhitespace(value)
      .replace(/\b(composition|material|case material|strap material|shell|body|main|fabric|lining|contrast|outer|inner)\s*[:：]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseCompositionString(value) {
    const raw = normalizeWhitespace(value);
    if (!raw) return [];
    const text = stripCompositionLabels(raw)
      .replace(/％/g, "%")
      .replace(/\u00a0/g, " ")
      .replace(/[，、]/g, ",")
      .replace(/[；]/g, ";");

    const entries = [];
    const percentBefore = /(\d+(?:\.\d+)?)\s*%\s*([A-Za-z][A-Za-z\s/&().+-]*?)(?=(?:[,;|]|\d+(?:\.\d+)?\s*%|$))/g;
    const nameBefore = /([A-Za-z][A-Za-z\s/&().+-]*?)\s*(\d+(?:\.\d+)?)\s*%/g;

    let match;
    while ((match = percentBefore.exec(text))) {
      entries.push(createMaterialEntry(match[2], Number(match[1])));
    }
    while ((match = nameBefore.exec(text))) {
      entries.push(createMaterialEntry(match[1], Number(match[2])));
    }

    if (entries.length === 0) {
      const parts = text
        .split(/[,;|/]+|\s+\+\s+|\s+and\s+/i)
        .map((part) => normalizeWhitespace(part))
        .filter(Boolean);
      for (const part of parts) entries.push(createMaterialEntry(part, null));
    }

    return mergeMaterialEntries(entries);
  }

  function canonicalProductUrl(url) {
    try {
      const parsed = new URL(url, "https://www.shein.com/");
      const mallCode = parsed.searchParams.get("mallCode") || parsed.searchParams.get("mall_code") || "1";
      const attrIds = parsed.searchParams.get("attr_ids") || "";
      parsed.search = "";
      parsed.hash = "";
      parsed.searchParams.set("mallCode", mallCode);
      if (attrIds) parsed.searchParams.set("attr_ids", attrIds);
      return parsed.href;
    } catch (error) {
      return url;
    }
  }

  function productIdFromUrl(url) {
    const match = String(url || "").match(/-p-(\d+)\.html/i);
    return match ? match[1] : "";
  }

  function productCacheKeyFromUrl(url, fallbackId) {
    const productId = productIdFromUrl(url) || String(fallbackId || "");
    if (!productId) return "";
    try {
      const parsed = new URL(url, "https://www.shein.com/");
      const attrIds = normalizeWhitespace(parsed.searchParams.get("attr_ids") || "");
      return attrIds ? `${productId}:attr_ids=${attrIds}` : productId;
    } catch (error) {
      return productId;
    }
  }

  function findJsonObjectEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    return -1;
  }

  function parseMaterialExposedFromHtml(html) {
    const source = String(html || "");
    const keyIndex = source.indexOf('"materialExposed"');
    const looseKeyIndex = keyIndex >= 0 ? keyIndex : source.indexOf("materialExposed");
    if (looseKeyIndex < 0) return null;
    const objectStart = source.indexOf("{", looseKeyIndex);
    if (objectStart < 0) return null;
    const objectEnd = findJsonObjectEnd(source, objectStart);
    if (objectEnd < 0) return null;
    const rawJson = source.slice(objectStart, objectEnd);
    try {
      return JSON.parse(rawJson);
    } catch (error) {
      return null;
    }
  }

  function extractCompositionValues(materialExposed) {
    const values = [];
    const list = materialExposed && Array.isArray(materialExposed.materialInfoList)
      ? materialExposed.materialInfoList
      : [];
    for (const item of list) {
      const name = normalizeWhitespace(item.attrName || item.attr_name || "");
      const value = normalizeWhitespace(item.attrValue || item.attr_value || "");
      if (!value) continue;
      if (/composition|material|fabric|case|strap/i.test(name)) values.push(value);
    }
    return values;
  }

  function fallbackCompositionValuesFromHtml(html) {
    const text = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    const values = [];
    const patterns = [
      /Composition\s*[:：]?\s*([A-Za-z0-9%,.;/\s&()+-]{3,180})/gi,
      /Material\s*[:：]?\s*([A-Za-z0-9%,.;/\s&()+-]{3,120})/gi,
      /Case Material\s*[:：]?\s*([A-Za-z0-9%,.;/\s&()+-]{3,120})/gi,
      /Strap Material\s*[:：]?\s*([A-Za-z0-9%,.;/\s&()+-]{3,120})/gi
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text))) values.push(normalizeWhitespace(match[1]));
    }
    return values.slice(0, 4);
  }

  function extractMaterialsFromHtml(html) {
    const materialExposed = parseMaterialExposedFromHtml(html);
    let compositionValues = extractCompositionValues(materialExposed);
    let source = "materialExposed";
    if (compositionValues.length === 0) {
      compositionValues = fallbackCompositionValuesFromHtml(html);
      source = "fallback";
    }
    const rawComposition = compositionValues.join("; ");
    const materials = mergeMaterialEntries(compositionValues.flatMap(parseCompositionString));
    return {
      source,
      rawComposition,
      materials,
      materialExposedFound: Boolean(materialExposed)
    };
  }

  function materialMap(materials) {
    const map = new Map();
    for (const material of materials || []) map.set(material.key, material);
    return map;
  }

  function compareNumber(left, comparator, right) {
    const epsilon = 0.0001;
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (comparator === ">") return left > right;
    if (comparator === ">=") return left >= right;
    if (comparator === "=") return Math.abs(left - right) < epsilon;
    if (comparator === "<=") return left <= right;
    if (comparator === "<") return left < right;
    return false;
  }

  function evaluateRule(product, rule) {
    const key = normalizeMaterialName(rule.material);
    const materials = materialMap(product.materials || []);
    const found = materials.get(key);
    const comparator = rule.comparator || "contains";
    if (comparator === "contains") return Boolean(found && found.present);
    if (comparator === "not contains") return !found;
    if (!found || found.percentage === null || found.percentage === undefined) return false;
    return compareNumber(Number(found.percentage), comparator, Number(rule.value));
  }

  function evaluateProduct(product, settings) {
    const activeSettings = normalizeSettings(settings);
    const rules = activeSettings.rules.filter((rule) => rule.material && rule.comparator);
    if (!activeSettings.enabled || rules.length === 0) return true;
    if (!product || product.error || !Array.isArray(product.materials)) return false;
    const results = rules.map((rule) => evaluateRule(product, rule));
    return activeSettings.combineMode === "any"
      ? results.some(Boolean)
      : results.every(Boolean);
  }

  function normalizeSettings(settings) {
    const legacyScanMode = settings && settings.scanMode === "auto-slow" ? "auto-slow" : "manual";
    const merged = { ...clone(DEFAULT_SETTINGS), ...(settings || {}) };
    merged.cardMode = merged.cardMode === "filter" ? "filter" : "viewer";
    merged.displayMode = ["hide", "dim", "badge"].includes(merged.displayMode) ? merged.displayMode : "dim";
    merged.productPageScanMode = normalizeScanMode(settings && settings.productPageScanMode ? settings.productPageScanMode : "manual");
    merged.otherPageScanMode = normalizeScanMode(settings && settings.otherPageScanMode ? settings.otherPageScanMode : legacyScanMode);
    delete merged.scanMode;
    merged.scanDelaySeconds = clampNumber(merged.scanDelaySeconds, 0, 300, DEFAULT_SETTINGS.scanDelaySeconds);
    merged.scanRandomnessSeconds = clampNumber(merged.scanRandomnessSeconds, 0, 120, DEFAULT_SETTINGS.scanRandomnessSeconds);
    merged.combineMode = merged.combineMode === "any" ? "any" : "all";
    merged.enabled = merged.enabled !== false;
    merged.rules = Array.isArray(merged.rules) && merged.rules.length
      ? merged.rules.map((rule) => ({
          material: normalizeMaterialName(rule.material),
          comparator: COMPARATORS.includes(rule.comparator) ? rule.comparator : "contains",
          value: rule.value === "" || rule.value === null || rule.value === undefined ? null : Number(rule.value)
        }))
      : clone(DEFAULT_SETTINGS.rules);
    return merged;
  }

  function normalizeScanMode(value) {
    return value === "auto-slow" ? "auto-slow" : "manual";
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function summarizeMaterials(materials) {
    if (!materials || materials.length === 0) return "No composition found";
    return materials
      .map((material) => material.percentage === null
        ? material.displayName
        : `${material.percentage}% ${material.displayName}`)
      .join(", ");
  }

  function discoveredMaterialOptions(materialIndex) {
    const byKey = new Map(COMMON_MATERIALS.map((item) => [item.key, item.label]));
    for (const [key, value] of Object.entries(materialIndex || {})) {
      const normalized = normalizeMaterialName(key);
      if (!normalized) continue;
      byKey.set(normalized, value && value.label ? value.label : displayMaterialName(key));
    }
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function productToExportRows(products) {
    return Object.values(products || {}).map((product) => ({
      id: product.id || "",
      productId: product.productId || productIdFromUrl(product.url) || product.id || "",
      title: product.title || "",
      url: product.url || "",
      price: product.price || "",
      rawComposition: product.rawComposition || "",
      parsedComposition: summarizeMaterials(product.materials || []),
      source: product.source || "",
      scannedAt: product.scannedAt || "",
      error: product.error || ""
    }));
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function rowsToCsv(rows) {
    const columns = ["id", "productId", "title", "url", "price", "rawComposition", "parsedComposition", "source", "scannedAt", "error"];
    const lines = [columns.join(",")];
    for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
    return lines.join("\n");
  }

  root.SheinMaterialFilter = {
    STORAGE_KEYS,
    COMMON_MATERIALS,
    DEFAULT_SETTINGS,
    PRESETS,
    COMPARATORS,
    normalizeMaterialName,
    normalizeWhitespace,
    displayMaterialName,
    parseCompositionString,
    canonicalProductUrl,
    productIdFromUrl,
    productCacheKeyFromUrl,
    parseMaterialExposedFromHtml,
    extractMaterialsFromHtml,
    evaluateProduct,
    evaluateRule,
    normalizeSettings,
    summarizeMaterials,
    discoveredMaterialOptions,
    productToExportRows,
    rowsToCsv
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.SheinMaterialFilter;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
