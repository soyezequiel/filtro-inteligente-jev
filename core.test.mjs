import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPPORTED_HOSTS, buildTypeSafeInput, normalizeSettings, normalizeTypeSafeKey, formatApiError, readProbability } from "./core.mjs";

test("permite clasificar desde todos los sitios donde se inyecta la extensión", () => {
  const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
  const hosts = manifest.content_scripts.flatMap(script => script.matches.map(match => new URL(match).hostname));
  assert.deepEqual([...new Set(hosts)].sort(), [...SUPPORTED_HOSTS].sort());
});

test("Jev recibe el criterio editable y devuelve una probabilidad válida", () => {
  const input = buildTypeSafeInput("Este post contiene información concreta", "Marcar posts útiles");
  assert.equal(input.model, "jev-latest");
  assert.equal(input.state.post, "Este post contiene información concreta");
  assert.equal(input.state.criterio, "Marcar posts útiles");
  assert.equal(input.questions.matches.type, "noul");
  assert.equal(readProbability({ success: true, result: { answers: { matches: { type: "noul", noul: 0.84 } } } }), 0.84);
  assert.throws(() => readProbability({ success: true, result: { answers: {} } }), /inesperada/);
  assert.throws(() => readProbability({ result: { answers: { matches: { noul: 1.2 } } } }), /inesperada/);
});

test("normaliza ajustes fuera de rango sin perder el cambio de criterio", () => {
  const settings = normalizeSettings({ prompt: "Marcar posts útiles", label: "ÚTIL", threshold: 5, enabled: false });
  assert.deepEqual(settings, { enabled: false, model: "typesafe", blurMatches: true, prompt: "Marcar posts útiles", label: "ÚTIL", threshold: 0.99 });
});

test("TypeSafe directo usa su endpoint y formato de respuesta", () => {
  const input = buildTypeSafeInput("Un post de prueba", "Marcar posts útiles");
  assert.equal(input.model, "jev-latest");
  assert.equal(input.state.criterio, "Marcar posts útiles");
  assert.equal(input.questions.matches.type, "noul");
  assert.equal(readProbability({ answers: { matches: { noul: 0.92 } } }), 0.92);
  assert.equal(normalizeSettings({ model: "free" }).model, "typesafe");
});

test("limpia el prefijo de variable de entorno y explica el 401", () => {
  assert.equal(normalizeTypeSafeKey('TYPESAFE_API_KEY="apikey_example"'), "apikey_example");
  assert.equal(normalizeTypeSafeKey("TYPESAFE\\_API\\_KEY=apikey\\_example"), "apikey_example");
  assert.match(formatApiError("TypeSafe", 401, { message: { error: "invalid" } }), /rechazó la clave/);
});
