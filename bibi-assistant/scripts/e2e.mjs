// Tests de bout en bout dans un VRAI navigateur (Chromium) contre le VRAI serveur construit (dist + dist-server).
// Vérifie : affichage mobile et ordinateur, installation PWA (manifeste, icônes, service worker), mode hors ligne,
// données locales (notes/tâches), erreur honnête sans clé d'IA. Sortie 0 = tout est vert.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pw = require("playwright-core");
// Moteur choisi par variable (cloud-installer 2387) : chromium (défaut, Android/ordinateur), webkit (= Safari/iPhone), firefox.
// WEBKIT_PATH / FIREFOX_PATH facultatifs (sinon le navigateur installé par Playwright) ; CHROMIUM_PATH garde son rôle.
const MOTEUR = process.env.E2E_MOTEUR ?? "chromium";
if (!["chromium", "webkit", "firefox"].includes(MOTEUR)) { console.error(`E2E_MOTEUR inconnu : ${MOTEUR} (chromium | webkit | firefox)`); process.exit(2); }

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const SABOTAGE = process.env.SABOTAGE ?? ""; // "sw" : le test d'hors-ligne doit alors rougir
const tmp = mkdtempSync(join(tmpdir(), "bibi-e2e-"));
let ok = 0, ko = 0;
const verifier = (nom, cond, detail = "") => { if (cond) { ok++; console.log(`  ✓ ${nom}`); } else { ko++; console.log(`  ✗ ${nom} ${detail}`); } };

if (!existsSync("dist/index.html") || !existsSync("dist-server/server/index.js")) { console.error("Lance d'abord : npm run build"); process.exit(2); }

const env = { ...process.env, NODE_ENV: "production", PORT: String(PORT), HOST: "127.0.0.1", BIBI_ALLOW_OPEN: "true",
  SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret", DATABASE_URL: `sqlite:${join(tmp, "e2e.db")}`,
  GEMINI_API_KEY: "", GROQ_API_KEY: "", OPENROUTER_API_KEY: "", ELEVENLABS_API_KEY: "", ENABLE_CLOUD_SYNC: "false", ALLOW_PAID_PROVIDERS: "false" };
const serveur = spawn("node", ["dist-server/server/index.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
let journal = "";
serveur.stdout.on("data", (d) => (journal += d)); serveur.stderr.on("data", (d) => (journal += d));

async function attendre() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* pas encore */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error("Le serveur ne démarre pas :\n" + journal.slice(-1500));
}

let browser;
try {
  await attendre();
  const chemin = MOTEUR === "chromium" ? (process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium") : process.env[MOTEUR.toUpperCase() + "_PATH"];
  browser = await pw[MOTEUR].launch({ ...(chemin ? { executablePath: chemin } : {}), ...(MOTEUR === "chromium" ? { args: ["--no-sandbox"] } : {}) });
  console.log(`Moteur : ${MOTEUR}`);

  console.log("\n▸ Affichage téléphone (375 px, tactile)");
  {
    // iPhone 13 réel pour WebKit ; Firefox ne gère pas isMobile.
    const ctx = await browser.newContext(MOTEUR === "webkit" ? { ...pw.devices["iPhone 13"], viewport: { width: 375, height: 700 } } : { viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: MOTEUR === "chromium", deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const erreursJs = []; page.on("pageerror", (e) => erreursJs.push(String(e)));
    await page.goto(BASE + "/"); await page.waitForSelector(".menu");
    const m = await page.evaluate(() => ({
      debord: document.documentElement.scrollWidth > window.innerWidth + 1,
      menu: [...document.querySelectorAll(".menu a")].map((a) => { const r = a.getBoundingClientRect(); return { t: a.textContent.trim(), w: r.width, h: r.height, bas: r.bottom <= innerHeight + 1 }; }),
      titre: document.title, lang: document.documentElement.lang, theme: document.documentElement.dataset.theme,
    }));
    verifier("aucun débordement horizontal à 375 px", !m.debord);
    verifier("les 8 entrées du menu sont là", m.menu.length === 8, JSON.stringify(m.menu.map((x) => x.t)));
    verifier("chaque entrée du menu fait au moins 44 px", m.menu.every((x) => x.h >= 44 && x.w >= 44), JSON.stringify(m.menu.filter((x) => x.h < 44 || x.w < 44)));
    verifier("le menu reste visible en bas de l'écran", m.menu.every((x) => x.bas));
    verifier("page en français", m.lang === "fr");
    const petits = await page.evaluate(() => [...document.querySelectorAll("button, a, input, textarea, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5) && !e.closest(".saut"); }).map((e) => (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 25)));
    verifier("aucun bouton de l'accueil ne fait moins de 44 px", petits.length === 0, JSON.stringify(petits));
    verifier("aucune erreur JavaScript", erreursJs.length === 0, erreursJs.join(" | "));
    // chaque page s'ouvre sans débordement ni erreur
    for (const p of ["conversations", "memoire", "notes", "taches", "rappels", "voix", "parametres"]) {
      await page.goto(`${BASE}/#/${p}`); await page.waitForSelector("h1");
      const d = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      verifier(`page « ${p} » sans débordement`, !d);
    }
    verifier("aucune erreur JavaScript sur toutes les pages", erreursJs.length === 0, erreursJs.join(" | "));
    await ctx.close();
  }

  console.log("\n▸ Affichage ordinateur (1200 px)");
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/"); await page.waitForSelector(".menu");
    const m = await page.evaluate(() => { const r = document.querySelector(".menu").getBoundingClientRect(); const main = document.querySelector("main").getBoundingClientRect(); return { gauche: r.left, larg: r.width, haut: r.height, mainMax: main.width, debord: document.documentElement.scrollWidth > innerWidth + 1 }; });
    verifier("menu latéral à gauche sur grand écran", m.gauche === 0 && m.larg < 260 && m.haut >= 790, JSON.stringify(m));
    verifier("contenu limité en largeur (lisible)", m.mainMax <= 830);
    verifier("aucun débordement horizontal", !m.debord);
    await ctx.close();
  }

  console.log("\n▸ Installation (PWA)");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/"); await page.waitForSelector(".menu");
    const man = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    verifier("manifeste : nom, start_url, mode autonome", man.name && man.start_url === "/" && man.display === "standalone");
    verifier("manifeste : icônes 192 et 512 + maskable", ["192x192", "512x512"].every((s) => man.icons.some((i) => i.sizes === s)) && man.icons.some((i) => i.purpose === "maskable"));
    for (const i of man.icons) { const r = await fetch(BASE + i.src); verifier(`icône ${i.src} servie en image`, r.ok && (r.headers.get("content-type") ?? "").startsWith("image/png")); }
    const apple = await fetch(`${BASE}/icons/apple-touch-icon.png`); verifier("icône Apple servie", apple.ok);
    const sw = await fetch(`${BASE}/service-worker.js`); const swTxt = await sw.text();
    verifier("service worker servi sans cache navigateur", /no-cache|no-store|max-age=0/.test(sw.headers.get("cache-control") ?? ""));
    verifier("service worker : version et liste de fichiers injectées au build", !swTxt.includes("__BIBI_BUILD__") && !swTxt.includes("__BIBI_PRECACHE__") && swTxt.includes("/assets/"));
    await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error("service worker jamais prêt")), 10000))]));
    const ctrl = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); });
    verifier("service worker actif", ctrl);
    const meta = await page.evaluate(() => ({ viewport: !!document.querySelector('meta[name=viewport]'), apple: !!document.querySelector('link[rel=apple-touch-icon]'), theme: document.querySelector('meta[name=theme-color]')?.content }));
    verifier("balises d'installation iPhone / Android présentes", meta.viewport && meta.apple && !!meta.theme);
    await ctx.close();
  }

  console.log("\n▸ Hors ligne, données locales, honnêteté");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/"); await page.waitForSelector(".menu");
    await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error("service worker jamais prêt")), 10000))]));
    if (SABOTAGE === "sw") await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); });
    // 1. Message sans clé d'IA : erreur honnête, jamais de fausse réponse
    await page.goto(`${BASE}/#/accueil`); await page.waitForSelector("textarea");
    await page.fill("textarea", "Bonjour Bibi"); await page.keyboard.press("Enter").catch(() => undefined);
    const envoi = page.getByRole("button", { name: /envoyer/i }); if (await envoi.count()) await envoi.first().click().catch(() => undefined);
    await page.waitForSelector(".msg-erreur", { timeout: 8000 }).catch(() => undefined);
    const txtErr = await page.locator(".msg-erreur").first().textContent().catch(() => "");
    verifier("sans clé d'IA : message d'erreur clair (pas de fausse réponse)", /clé|configur|fournisseur/i.test(txtErr ?? ""), txtErr ?? "");
    const reponsesFausses = await page.locator(".msg-assistant:not(.msg-erreur)").count();
    verifier("sans clé d'IA : aucune réponse inventée", reponsesFausses === 0, String(reponsesFausses));
    // 2. Note locale
    await page.goto(`${BASE}/#/notes`); await page.waitForSelector("h1");
    await page.getByRole("button", { name: /nouvelle note|ajouter|\+/i }).first().click();
    const champs = page.locator("textarea, input[type=text]");
    await champs.last().fill("Acheter du miel"); if ((await champs.count()) > 1) await champs.first().fill("Courses");
    await page.getByRole("button", { name: /enregistrer|garder|sauver/i }).first().click();
    await page.waitForSelector("text=Acheter du miel", { timeout: 5000 }).catch(() => undefined);
    verifier("note créée et affichée", await page.locator("text=Acheter du miel").count() > 0);
    // 3. Hors ligne : rechargement complet
    await ctx.setOffline(true);
    await page.goto(`${BASE}/#/notes`).catch(() => undefined);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    const horsLigne = await page.waitForSelector(".menu", { timeout: 8000 }).then(() => true).catch(() => false);
    verifier("hors ligne : l'application se recharge", horsLigne);
    if (horsLigne) {
      await page.waitForSelector("h1");
      verifier("hors ligne : la note est toujours là (stockage local)", await page.locator("text=Acheter du miel").count() > 0);
      verifier("hors ligne : bandeau d'information visible", await page.locator(".bandeau-hors").count() > 0);
    } else { verifier("hors ligne : la note est toujours là (stockage local)", false); verifier("hors ligne : bandeau d'information visible", false); }
    await ctx.setOffline(false);
    // 4. Persistance après rechargement
    await page.reload(); await page.waitForSelector(".menu");
    verifier("la note survit au rechargement", await page.locator("text=Acheter du miel").count() > 0);
    await ctx.close();
  }
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}`);
} finally {
  await browser?.close().catch(() => undefined);
  serveur.kill();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${ko === 0 ? "✅" : "❌"} e2e : ${ok} vérifications réussies, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
