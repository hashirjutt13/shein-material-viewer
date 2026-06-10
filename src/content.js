(function initSheinMaterialFilterContent() {
  "use strict";

  const logic = window.SheinMaterialFilter;
  if (!logic || !window.chrome || !chrome.storage) return;

  const state = {
    settings: logic.normalizeSettings(),
    cache: {},
    sessionResults: {},
    materialIndex: {},
    cards: new Map(),
    queue: [],
    activeFetches: 0,
    observer: null,
    intersectionObserver: null,
    scanScheduled: false,
    stopped: false,
    timers: new Set(),
    lastQueueRun: 0
  };

  const MAX_CONCURRENT_FETCHES = 1;
  const CARD_SELECTOR = 'a[href*="-p-"][href*=".html"]';

  function storageGet(keys) {
    if (!extensionContextValid()) return Promise.resolve({});
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (values) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(values || {});
        });
      } catch (error) {
        stopAfterInvalidContext(error);
        resolve({});
      }
    });
  }

  function storageSet(values) {
    if (!extensionContextValid()) return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(values, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (error) {
        stopAfterInvalidContext(error);
        resolve(false);
      }
    });
  }

  function extensionContextValid() {
    return !state.stopped && Boolean(window.chrome && chrome.runtime && chrome.runtime.id);
  }

  function stopAfterInvalidContext(error) {
    if (error && !/Extension context invalidated/i.test(String(error.message || error))) {
      console.warn("SHEIN Material Viewer stopped after script error:", error);
    }
    state.stopped = true;
    state.queue = [];
    for (const timer of state.timers) window.clearTimeout(timer);
    state.timers.clear();
    if (state.observer) state.observer.disconnect();
    if (state.intersectionObserver) state.intersectionObserver.disconnect();
  }

  function schedule(callback, delay) {
    if (state.stopped) return 0;
    const timer = window.setTimeout(() => {
      state.timers.delete(timer);
      if (state.stopped) return;
      try {
        callback();
      } catch (error) {
        stopAfterInvalidContext(error);
      }
    }, delay);
    state.timers.add(timer);
    return timer;
  }

  async function loadState() {
    const values = await storageGet([
      logic.STORAGE_KEYS.settings,
      logic.STORAGE_KEYS.productCache,
      logic.STORAGE_KEYS.materialIndex
    ]);
    state.settings = logic.normalizeSettings(values[logic.STORAGE_KEYS.settings]);
    const cachedProducts = values[logic.STORAGE_KEYS.productCache] || {};
    state.cache = Object.fromEntries(
      Object.entries(cachedProducts).filter((entry) => {
        const product = entry[1];
        return product
          && product.source !== "listing-hint"
          && !product.error
          && Array.isArray(product.materials)
          && product.materials.length;
      })
    );
    if (Object.keys(state.cache).length !== Object.keys(cachedProducts).length) {
      storageSet({ [logic.STORAGE_KEYS.productCache]: state.cache });
    }
    state.materialIndex = values[logic.STORAGE_KEYS.materialIndex] || {};
  }

  function debounceScan() {
    if (state.scanScheduled) return;
    state.scanScheduled = true;
    schedule(() => {
      state.scanScheduled = false;
      discoverCards();
      applyAllCards();
      sendStatus();
    }, 250);
  }

  function normalizeUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch (error) {
      return url;
    }
  }

  function getProductIdFromUrl(url) {
    return logic.productIdFromUrl ? logic.productIdFromUrl(url) : "";
  }

  function nextScanDelayMs() {
    const baseMs = Math.max(0, Number(state.settings.scanDelaySeconds || 0) * 1000);
    const jitterMs = Math.max(0, Number(state.settings.scanRandomnessSeconds || 0) * 1000);
    if (!jitterMs) return baseMs;
    const offset = (Math.random() * 2 - 1) * jitterMs;
    return Math.max(0, Math.round(baseMs + offset));
  }

  function likelyProductCard(anchor) {
    let node = anchor;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const text = node.innerText || "";
      if (node.querySelectorAll && node.querySelectorAll('a[href*="-p-"]').length > 0 && /Rs|\$|sold|Estimated|Bestseller|%|SHEIN/i.test(text)) {
        return node;
      }
      if (node.getAttribute && /product|goods|item/i.test(`${node.className || ""} ${node.id || ""}`)) {
        return node;
      }
    }
    return anchor.closest("li, article, section, div") || anchor;
  }

  function getTitle(anchor, card) {
    return logic.normalizeWhitespace
      ? logic.normalizeWhitespace(anchor.dataset.title || anchor.getAttribute("aria-label") || anchor.title || anchor.textContent || card.textContent || "")
      : String(anchor.dataset.title || anchor.textContent || "").trim();
  }

  function getPrice(card) {
    const text = (card.innerText || "").replace(/\s+/g, " ");
    const match = text.match(/(?:Rs|PKR|\$|€|£)\s?[0-9,.]+/i);
    return match ? match[0] : "";
  }

  function getImage(card) {
    const img = card.querySelector("img");
    return img ? (img.currentSrc || img.src || img.dataset.src || "") : "";
  }

  function ensureBadge(card) {
    cleanupCardBadges(card);
    let badge = card.querySelector(":scope > .smf-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "smf-badge smf-badge--pending";
      badge.innerHTML = '<span class="smf-badge__state">Unscanned</span><span class="smf-badge__composition">Waiting for material data</span><button class="smf-badge__action" type="button" data-smf-action="scan">Scan</button>';
      card.classList.add("smf-card");
      card.appendChild(badge);
    }
    return badge;
  }

  function cleanupCardBadges(card, keepBadge = null) {
    if (!card || !card.querySelectorAll) return;
    const badges = Array.from(card.querySelectorAll(".smf-badge"));
    const firstDirectBadge = badges.find((badge) => badge.parentElement === card);
    const badgeToKeep = keepBadge || firstDirectBadge || null;
    for (const badge of badges) {
      if (badge === badgeToKeep && badge.parentElement === card) continue;
      badge.remove();
    }
  }

  function removeExtensionBadge(card) {
    if (!card || !card.querySelectorAll) return;
    for (const badge of card.querySelectorAll(".smf-badge")) badge.remove();
    card.classList.remove("smf-card", "smf-hidden", "smf-dimmed");
    if (card.dataset) delete card.dataset.smfProductId;
  }

  function setBadge(card, status, message, options = {}) {
    const badge = ensureBadge(card);
    badge.className = `smf-badge smf-badge--${status}`;
    const fallbackLabels = {
      material: "Material",
      unknown: "Material unknown",
      match: "Match",
      miss: "No match",
      error: "Error",
      pending: "Scanning"
    };
    const label = options.label || fallbackLabels[status] || "Scanning";
    const action = options.action
      ? `<button class="smf-badge__action" type="button" data-smf-action="${escapeHtml(options.action)}">${escapeHtml(options.actionLabel || options.action)}</button>`
      : "";
    badge.innerHTML = `<span class="smf-badge__state">${label}</span><span class="smf-badge__composition">${escapeHtml(message)}</span>${action}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function registerMaterialIndex(product) {
    let changed = false;
    for (const material of product.materials || []) {
      if (!state.materialIndex[material.key]) {
        state.materialIndex[material.key] = { label: material.displayName, firstSeenAt: new Date().toISOString() };
        changed = true;
      }
    }
    if (changed) storageSet({ [logic.STORAGE_KEYS.materialIndex]: state.materialIndex });
  }

  async function persistProduct(product) {
    if (!product || product.error) return false;
    delete state.sessionResults[product.id];
    state.cache[product.id] = product;
    registerMaterialIndex(product);
    await storageSet({ [logic.STORAGE_KEYS.productCache]: state.cache });
    return true;
  }

  function showDetailToast(message) {
    let toast = document.querySelector(".smf-detail-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "smf-detail-toast";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<strong>SHEIN Material Viewer</strong><span>${escapeHtml(message)}</span>`;
  }

  async function harvestCurrentDetailPage() {
    const id = logic.productCacheKeyFromUrl(location.href);
    if (!id || location.pathname.includes("/risk/challenge")) return;
    const extracted = logic.extractMaterialsFromHtml(document.documentElement.innerHTML);
    if (!extracted.materials.length) return;
    const product = {
      id,
      productId: getProductIdFromUrl(location.href),
      title: logic.normalizeWhitespace(document.title.replace(/\|\s*SHEIN.*$/i, "")),
      url: logic.canonicalProductUrl(location.href),
      price: getPrice(document.body),
      image: getImage(document.body),
      rawComposition: extracted.rawComposition,
      materials: extracted.materials,
      source: `opened-detail:${extracted.source}`,
      scannedAt: new Date().toISOString(),
      error: ""
    };
    await persistProduct(product);
    showDetailToast(`Cached ${logic.summarizeMaterials(product.materials)}`);
  }

  function applyCard(record) {
    const product = state.sessionResults[record.id] || state.cache[record.id];
    record.card.classList.remove("smf-hidden", "smf-dimmed");

    if (!product) {
      setBadge(record.card, "pending", "Waiting for material data", { action: "scan", actionLabel: "Scan", label: "Unscanned" });
      return;
    }

    const summary = product.error ? product.error : logic.summarizeMaterials(product.materials);
    if (state.settings.cardMode !== "filter") {
      if (product.error) {
        const status = product.source === "no-material" ? "unknown" : "error";
        setBadge(record.card, status, summary, { action: "scan", actionLabel: "Retry" });
      } else {
        setBadge(record.card, "material", summary);
      }
      return;
    }

    const matches = logic.evaluateProduct(product, state.settings);
    setBadge(record.card, product.error ? "error" : matches ? "match" : "miss", summary, product.error ? { action: "scan", actionLabel: "Retry" } : {});
    if (!state.settings.enabled || matches) return;
    if (state.settings.displayMode === "hide") {
      record.card.classList.add("smf-hidden");
    } else if (state.settings.displayMode === "dim") {
      record.card.classList.add("smf-dimmed");
    }
  }

  function applyAllCards() {
    for (const record of state.cards.values()) applyCard(record);
  }

  function cardIsConnected(card) {
    return Boolean(card && document.documentElement.contains(card));
  }

  function pruneMissingCards() {
    for (const [id, record] of state.cards.entries()) {
      if (cardIsConnected(record.card)) continue;
      if (state.intersectionObserver) state.intersectionObserver.unobserve(record.card);
      state.cards.delete(id);
    }
    for (const badge of document.querySelectorAll(".smf-badge")) {
      const card = badge.closest(".smf-card");
      const id = card && card.dataset ? card.dataset.smfProductId : "";
      if (!id || !state.cards.has(id)) badge.remove();
    }
  }

  function updateRecordFromAnchor(record, anchor, card, href) {
    if (record.card !== card) {
      if (record.card && state.intersectionObserver) state.intersectionObserver.unobserve(record.card);
      removeExtensionBadge(record.card);
      record.card = card;
      card.dataset.smfProductId = record.id;
      ensureBadge(card);
      if (state.intersectionObserver) state.intersectionObserver.observe(card);
    }
    record.url = logic.canonicalProductUrl(href);
    record.productId = getProductIdFromUrl(href);
    record.title = getTitle(anchor, card);
    record.price = getPrice(card);
    record.image = getImage(card);
  }

  function discoverCards() {
    pruneMissingCards();
    const anchors = Array.from(document.querySelectorAll(CARD_SELECTOR));
    const seenThisPass = new Set();
    for (const anchor of anchors) {
      const href = normalizeUrl(anchor.href);
      const productId = anchor.dataset.id || getProductIdFromUrl(href);
      const id = logic.productCacheKeyFromUrl(href, productId);
      if (!id || !productId || /twitter\.com|facebook\.com|pinterest\.com/i.test(href)) continue;
      if (seenThisPass.has(id)) continue;
      seenThisPass.add(id);
      const card = likelyProductCard(anchor);
      let record = state.cards.get(id);
      if (record) {
        updateRecordFromAnchor(record, anchor, card, href);
      } else {
        record = {
          id,
          productId,
          url: logic.canonicalProductUrl(href),
          title: getTitle(anchor, card),
          price: getPrice(card),
          image: getImage(card),
          card,
          queued: false
        };
        state.cards.set(id, record);
        card.dataset.smfProductId = id;
        ensureBadge(card);
        state.intersectionObserver.observe(card);
      }
      cleanupCardBadges(card);
      if (state.cache[id] || state.sessionResults[id]) applyCard(record);
    }
  }

  function enqueue(record, forceRefresh) {
    if (!record || record.queued) return;
    if (!forceRefresh && (state.sessionResults[record.id] || state.cache[record.id])) {
      applyCard(record);
      return;
    }
    record.queued = true;
    state.queue.push({ id: record.id, forceRefresh: Boolean(forceRefresh) });
    setBadge(record.card, "pending", "Waiting for scan slot", { label: "Queued" });
    drainQueue();
  }

  function drainQueue() {
    if (state.stopped) return;
    const now = Date.now();
    if (state.activeFetches >= MAX_CONCURRENT_FETCHES) return;
    const elapsed = now - state.lastQueueRun;
    const waitMs = state.lastQueueRun ? Math.max(0, nextScanDelayMs() - elapsed) : 0;
    if (waitMs > 0) {
      schedule(drainQueue, waitMs);
      return;
    }
    const next = state.queue.shift();
    if (!next) return;
    const record = state.cards.get(next.id);
    if (!record) {
      drainQueue();
      return;
    }
    state.lastQueueRun = now;
    state.activeFetches += 1;
    scanProduct(record, next.forceRefresh)
      .catch(() => {})
      .finally(() => {
        record.queued = false;
        state.activeFetches -= 1;
        schedule(drainQueue, nextScanDelayMs());
      });
    drainQueue();
  }

  async function scanProduct(record, forceRefresh) {
    if (!extensionContextValid()) return;
    if (!forceRefresh && (state.sessionResults[record.id] || state.cache[record.id])) {
      applyCard(record);
      return;
    }
    setBadge(record.card, "pending", "Fetching product details", { label: "Scanning" });
    let product;
    try {
      const response = await fetch(record.url, { credentials: "include" });
      if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
      const html = await response.text();
      if (response.url.includes("/risk/challenge") || /risk\/challenge|captcha_type|g-recaptcha/i.test(html)) {
        state.queue = [];
        throw new Error("SHEIN challenge detected; solve it, then retry");
      }
      const extracted = logic.extractMaterialsFromHtml(html);
      product = {
        id: record.id,
        productId: record.productId || getProductIdFromUrl(record.url),
        title: record.title,
        url: record.url,
        price: record.price,
        image: record.image,
        rawComposition: extracted.rawComposition,
        materials: extracted.materials,
        source: extracted.source,
        scannedAt: new Date().toISOString(),
        error: extracted.materials.length ? "" : "No material found"
      };
      if (!extracted.materials.length) product.source = "no-material";
    } catch (error) {
      product = {
        id: record.id,
        productId: record.productId || getProductIdFromUrl(record.url),
        title: record.title,
        url: record.url,
        price: record.price,
        image: record.image,
        rawComposition: "",
        materials: [],
        source: "error",
        scannedAt: new Date().toISOString(),
        error: error && error.message ? error.message : "Failed to scan product"
      };
    }
    if (product.error || !product.materials.length) {
      state.sessionResults[record.id] = product;
      delete state.cache[record.id];
    } else {
      await persistProduct(product);
    }
    applyCard(record);
    sendStatus();
  }

  function visibleRecords() {
    return Array.from(state.cards.values()).filter((record) => {
      const rect = record.card.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0;
    });
  }

  function refreshVisible() {
    for (const record of visibleRecords()) {
      delete state.cache[record.id];
      delete state.sessionResults[record.id];
      enqueue(record, true);
    }
    storageSet({ [logic.STORAGE_KEYS.productCache]: state.cache });
    sendStatus();
  }

  function clearCache() {
    state.cache = {};
    state.sessionResults = {};
    storageSet({ [logic.STORAGE_KEYS.productCache]: state.cache });
    applyAllCards();
    sendStatus();
  }

  function currentProducts(matchesOnly) {
    pruneMissingCards();
    const products = {};
    for (const id of state.cards.keys()) {
      const product = state.sessionResults[id] || state.cache[id];
      if (!product) continue;
      if (matchesOnly && state.settings.cardMode !== "filter") continue;
      if (matchesOnly && !logic.evaluateProduct(product, state.settings)) continue;
      products[id] = product;
    }
    return products;
  }

  function getStatus() {
    const scannedProducts = currentProducts(false);
    const matchProducts = state.settings.cardMode === "filter" ? currentProducts(true) : {};
    const errors = Object.values(scannedProducts).filter((product) => product.error).length;
    const materialCount = Object.values(scannedProducts).filter((product) => Array.isArray(product.materials) && product.materials.length).length;
    return {
      cardCount: state.cards.size,
      scannedCount: Object.keys(scannedProducts).length,
      materialCount,
      matchCount: Object.keys(matchProducts).length,
      pendingCount: state.queue.length + state.activeFetches,
      errorCount: errors,
      settings: state.settings,
      materials: logic.discoveredMaterialOptions(state.materialIndex)
    };
  }

  function sendStatus() {
    if (!extensionContextValid()) return;
    try {
      chrome.runtime.sendMessage({ type: "SMF_STATUS", status: getStatus() }, () => {
        void chrome.runtime.lastError;
      });
    } catch (error) {
      stopAfterInvalidContext(error);
    }
  }

  function actionRecordFromEvent(event) {
    const button = event.target && event.target.closest ? event.target.closest(".smf-badge__action") : null;
    if (!button) return null;
    const card = button.closest(".smf-card");
    const id = card && card.dataset ? card.dataset.smfProductId : "";
    const record = id ? state.cards.get(id) : null;
    return record ? { id, record } : null;
  }

  function blockActionNavigation(event) {
    const action = actionRecordFromEvent(event);
    if (!action) return null;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    return action;
  }

  function runManualScan(action) {
    const now = Date.now();
    if (action.record.lastRetryAt && now - action.record.lastRetryAt < 1000) return;
    action.record.lastRetryAt = now;
    action.record.queued = false;
    state.queue = state.queue.filter((item) => item.id !== action.id);
    delete state.sessionResults[action.id];
    delete state.cache[action.id];
    setBadge(action.record.card, "pending", "Queued for scan", { label: "Queued" });
    enqueue(action.record, true);
    storageSet({ [logic.STORAGE_KEYS.productCache]: state.cache });
    sendStatus();
  }

  function handleActionInteraction(event) {
    const action = blockActionNavigation(event);
    if (!action) return;
    runManualScan(action);
  }

  function setupObservers() {
    state.intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.dataset.smfProductId;
        if (state.settings.otherPageScanMode === "auto-slow") enqueue(state.cards.get(id), false);
      }
    }, { root: null, rootMargin: "300px 0px", threshold: 0.01 });

    state.observer = new MutationObserver(debounceScan);
    state.observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", debounceScan, { passive: true });
    document.addEventListener("pointerdown", handleActionInteraction, true);
    document.addEventListener("mousedown", blockActionNavigation, true);
    document.addEventListener("touchstart", blockActionNavigation, true);
    document.addEventListener("auxclick", blockActionNavigation, true);
    document.addEventListener("click", handleActionInteraction, true);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;
    if (message.type === "SMF_GET_STATUS") {
      sendResponse(getStatus());
      return false;
    }
    if (message.type === "SMF_UPDATE_SETTINGS") {
      state.settings = logic.normalizeSettings(message.settings);
      storageSet({ [logic.STORAGE_KEYS.settings]: state.settings }).then(() => {
        applyAllCards();
        if (state.settings.otherPageScanMode === "auto-slow") {
          for (const record of visibleRecords()) enqueue(record, false);
        }
        sendStatus();
        sendResponse(getStatus());
      });
      return true;
    }
    if (message.type === "SMF_REFRESH_VISIBLE") {
      refreshVisible();
      sendResponse(getStatus());
      return false;
    }
    if (message.type === "SMF_CLEAR_CACHE") {
      clearCache();
      sendResponse(getStatus());
      return false;
    }
    if (message.type === "SMF_EXPORT") {
      const products = currentProducts(Boolean(message.matchesOnly));
      sendResponse({
        rows: logic.productToExportRows(products),
        json: JSON.stringify(Object.values(products), null, 2),
        csv: logic.rowsToCsv(logic.productToExportRows(products))
      });
      return false;
    }
    return false;
  });

  loadState().then(() => {
    if (state.stopped) return;
    setupObservers();
    const detailHarvest = state.settings.productPageScanMode === "auto-slow"
      ? harvestCurrentDetailPage()
      : Promise.resolve();
    detailHarvest.finally(() => {
      if (state.stopped) return;
      discoverCards();
      applyAllCards();
      sendStatus();
    });
  });
})();
