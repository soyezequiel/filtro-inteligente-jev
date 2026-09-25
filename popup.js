import { DEFAULTS, normalizeSettings, normalizeTypeSafeKey } from "./core.mjs";

const $ = id => document.getElementById(id);
const form = $("settingsForm");
const status = $("status");
const testResult = $("testResult");

function say(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}

async function load() {
  try {
    const { settings: stored, typesafeApiKey } = await chrome.storage.local.get(["settings", "typesafeApiKey"]);
    const settings = normalizeSettings(stored);
    $("enabled").checked = settings.enabled;
    $("prompt").value = settings.prompt;
    $("label").value = settings.label;
    $("threshold").value = String(settings.threshold);
    $("blurMatches").checked = settings.blurMatches;
    $("typesafeApiKey").value = typesafeApiKey || "";
    const ready = Boolean(typesafeApiKey);
    say(status, ready ? "Clave guardada. Usá la prueba para verificar el acceso." : "Pegá tu clave de TypeSafe para empezar.");
  } catch (error) {
    say(status, `No se pudo leer la configuración: ${error.message}`, true);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const typesafeApiKey = normalizeTypeSafeKey($("typesafeApiKey").value);
  if (!typesafeApiKey) {
    say(status, "Pegá tu clave de TypeSafe.", true);
    return;
  }
  const settings = normalizeSettings({
    enabled: $("enabled").checked,
    prompt: $("prompt").value,
    label: $("label").value,
    threshold: $("threshold").value,
    blurMatches: $("blurMatches").checked,
    model: "typesafe"
  });
  $("save").disabled = true;
  try {
    await chrome.storage.local.set({ settings, typesafeApiKey });
    $("typesafeApiKey").value = typesafeApiKey;
    say(status, "Guardado. Usá la prueba para verificar la clave y el criterio.");
    say(testResult, "");
  } catch (error) {
    say(status, `No se pudo guardar: ${error.message}`, true);
  } finally {
    $("save").disabled = false;
  }
});

$("resetPrompt").addEventListener("click", () => { $("prompt").value = DEFAULTS.prompt; });
$("enabled").addEventListener("change", async () => {
  try {
    const { settings: stored } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...normalizeSettings(stored), enabled: $("enabled").checked } });
    say(status, $("enabled").checked ? "Filtro activado." : "Filtro pausado.");
  } catch (error) {
    say(status, `No se pudo cambiar el estado: ${error.message}`, true);
  }
});
$("toggleTypesafeToken").addEventListener("click", () => {
  const input = $("typesafeApiKey");
  const revealing = input.type === "password";
  input.type = revealing ? "text" : "password";
  $("toggleTypesafeToken").textContent = revealing ? "Ocultar" : "Mostrar";
  $("toggleTypesafeToken").setAttribute("aria-label", revealing ? "Ocultar clave" : "Mostrar clave");
});

$("test").addEventListener("click", async () => {
  const sample = $("sample").value.trim();
  if (sample.length < 5) { say(testResult, "Pegá al menos 5 caracteres de un post.", true); return; }
  $("test").disabled = true;
  say(testResult, "Consultando el modelo…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "classify", text: sample });
    if (result.error) throw new Error(result.error);
    if (result.skipped) { say(testResult, "El filtro está pausado."); return; }
    say(testResult, `${result.matches ? `Se marcaría como ${result.label}` : "No se marcaría"} · ${Math.round(result.probability * 100)} % de coincidencia.`);
  } catch (error) {
    say(testResult, error.message, true);
  } finally {
    $("test").disabled = false;
  }
});

load();
