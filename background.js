import { SUPPORTED_HOSTS, DEFAULTS, normalizeSettings, normalizeTypeSafeKey, formatApiError, buildTypeSafeInput, readProbability } from "./core.mjs";

const cache = new Map();
const MAX_CACHE = 400;
const ALLOWED_HOSTS = new Set(SUPPORTED_HOSTS);

chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULTS });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !["settings", "typesafeApiKey"].some(key => changes[key])) return;
  cache.clear();
  chrome.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "settingsChanged" }).catch(() => {});
    }
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "getSettings") {
    chrome.storage.local.get("settings").then(({ settings }) => sendResponse(normalizeSettings(settings)));
    return true;
  }
  if (message?.type !== "classify") return;
  const isPopup = sender.url?.startsWith(chrome.runtime.getURL("popup.html"));
  let isSupportedPage = false;
  try { isSupportedPage = ALLOWED_HOSTS.has(new URL(sender.url).hostname); } catch { /* ignore */ }
  if (!isPopup && !isSupportedPage) {
    sendResponse({ error: "Origen no permitido." });
    return;
  }
  classify(message.text).then(sendResponse).catch(error => sendResponse({ error: error.message }));
  return true;
});

async function classify(rawText) {
  const text = String(rawText || "").replace(/\s+/g, " ").trim().slice(0, 3000);
  if (text.length < 5) return { skipped: true };
  const { settings: stored, typesafeApiKey } = await chrome.storage.local.get(["settings", "typesafeApiKey"]);
  const settings = normalizeSettings(stored);
  if (!settings.enabled) return { skipped: true };
  const cleanTypeSafeKey = normalizeTypeSafeKey(typesafeApiKey);
  if (!cleanTypeSafeKey) return { error: "Configurá tu clave de TypeSafe en la extensión." };

  const cacheKey = JSON.stringify([settings.model, settings.prompt, text]);
  if (!cache.has(cacheKey)) {
    const request = askModel(cleanTypeSafeKey, text, settings);
    cache.set(cacheKey, request);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    request.catch(() => cache.delete(cacheKey));
  }
  const probability = await cache.get(cacheKey);
  return { probability, matches: probability >= settings.threshold, label: settings.label, model: settings.model };
}

async function askModel(typesafeApiKey, text, settings) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const url = "https://api.typesafe.ai/v1/systemone";
  const body = buildTypeSafeInput(text, settings.prompt);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${typesafeApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success === false) {
      throw new Error(formatApiError("TypeSafe", response.status, data));
    }
    return readProbability(data);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("El modelo tardó demasiado en responder.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
