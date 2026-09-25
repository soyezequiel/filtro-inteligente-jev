export const SUPPORTED_HOSTS = Object.freeze([
  "x.com", "twitter.com", "www.reddit.com", "old.reddit.com",
  "www.linkedin.com", "bsky.app", "www.threads.net", "threads.net",
  "www.threads.com", "threads.com", "www.facebook.com", "facebook.com",
  "www.instagram.com", "instagram.com"
]);

export const DEFAULTS = Object.freeze({
  enabled: true,
  model: "typesafe",
  blurMatches: true,
  label: "SLOP",
  prompt: "Marcá un post si es contenido genérico, repetitivo, vacío o escrito para captar atención sin aportar una idea, dato o experiencia concreta. No lo marques solo por ser breve, informal o haber usado IA.",
  threshold: 0.75
});

export function normalizeSettings(value = {}) {
  return {
    enabled: value.enabled !== false,
    model: "typesafe",
    blurMatches: value.blurMatches !== false,
    label: String(value.label || DEFAULTS.label).trim().slice(0, 30),
    prompt: String(value.prompt || DEFAULTS.prompt).trim().slice(0, 3000),
    threshold: Math.min(0.99, Math.max(0.5, Number(value.threshold) || DEFAULTS.threshold))
  };
}

export function buildTypeSafeInput(postText, prompt) {
  const state = {
    post: String(postText).slice(0, 3000),
    criterio: String(prompt).slice(0, 3000)
  };
  const questions = {
    matches: {
      type: "noul",
      instructions: "¿El post cumple el criterio indicado? Evaluá únicamente el texto del post. Respondé sí cuando lo cumpla y no cuando no lo cumpla o falte información.",
      criteria: {
        true: "El post cumple el criterio y debe llevar la etiqueta.",
        false: "El post no cumple el criterio o no hay suficiente información."
      }
    }
  };
  return { model: "jev-latest", state, questions };
}

export function normalizeTypeSafeKey(raw) {
  let key = String(raw || "").trim();
  key = key.replace(/\\_/g, "_");
  key = key.replace(/^export\s+/i, "");
  key = key.replace(/^TYPESAFE_API_KEY\s*=\s*/i, "");
  return key.replace(/^["']|["']$/g, "").trim();
}

export function formatApiError(provider, status, data) {
  if (provider === "TypeSafe" && status === 401) {
    return "TypeSafe 401: la API rechazó la clave. Pegá solo el valor de la clave desde la consola de TypeSafe; si ya lo hiciste, generá una nueva.";
  }
  const findMessage = (value, depth = 0) => {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object" || depth > 3) return "";
    if (Array.isArray(value)) return value.map(item => findMessage(item, depth + 1)).find(Boolean) || "";
    for (const key of ["message", "detail", "error", "errors", "description"]) {
      const found = findMessage(value[key], depth + 1);
      if (found) return found;
    }
    return "";
  };
  const detail = findMessage(data);
  return `${provider} ${status}: ${detail || "No se pudo consultar el modelo."}`;
}

export function readProbability(payload) {
  const value = payload?.result?.answers?.matches?.noul ?? payload?.answers?.matches?.noul;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Jev devolvió una respuesta inesperada.");
  }
  return value;
}
