// Client léger pour Firebase RTDB (REST API) — pas de dépendance
// Lit et écrit les mêmes clés que l'app CMC Teams.
//
// v2 (Kevin 2026-06-16 « répare Firebase / Agent KDMC crash 401 ») : la base exige
// désormais `auth != null`. On authentifie chaque appel REST avec un access_token
// de compte de service (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY). Fail-open :
// si les creds manquent, on appelle sans token (comportement historique).

import { getFirebaseAccessToken } from "./gauth.js";

/** Construit le suffixe d'auth (?/&access_token=...) ou '' si pas de creds. */
async function authQS(hasQuery) {
  const token = await getFirebaseAccessToken(
    process.env.FIREBASE_CLIENT_EMAIL || "",
    process.env.FIREBASE_PRIVATE_KEY || "",
  );
  if (!token) return "";
  return `${hasQuery ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
}

export async function fbGet(fbUrl, key, basePath = "/cmcteams") {
  const url = `${fbUrl}${basePath}/${encodeURIComponent(key)}.json${await authQS(false)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Firebase GET ${key}: HTTP ${r.status}`);
  return r.json();
}

export async function fbSet(fbUrl, key, value, basePath = "/cmcteams") {
  const url = `${fbUrl}${basePath}/${encodeURIComponent(key)}.json${await authQS(false)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`Firebase PUT ${key}: HTTP ${r.status}`);
  return true;
}

export async function fbGetAll(fbUrl, basePath = "/cmcteams") {
  const url = `${fbUrl}${basePath}.json${await authQS(false)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Firebase GETALL: HTTP ${r.status}`);
  return r.json();
}

/**
 * Snapshot complet de l'état CMC Teams (utilisé par l'agent).
 */
export async function fetchCmcState(fbUrl) {
  const all = await fbGetAll(fbUrl);
  return all || {};
}

export async function saveCmcState(fbUrl, key, value) {
  return fbSet(fbUrl, key, value);
}
