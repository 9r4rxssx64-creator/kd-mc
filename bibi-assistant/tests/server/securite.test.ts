import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../server/config.js";
import { H, monter } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof monter>>;
afterEach(async () => { await ctx?.fermer(); });

const cookie = (r: { headers: Record<string, unknown> }) => String(([] as string[]).concat(r.headers["set-cookie"] as string | string[])[0]).split(";")[0]!;

describe("mode ouvert (usage personnel local)", () => {
  it("santé et état de session répondent, sans jamais afficher de clé", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_never_shown_1234" });
    const s = (await ctx.app.inject({ url: "/api/session" })).json();
    expect(s).toMatchObject({ mode: "open", authenticated: true });
    expect(JSON.stringify(s)).not.toContain("gsk_never_shown_1234");
    expect((await ctx.app.inject({ url: "/api/health" })).json()).toMatchObject({ ok: true, name: "bibi" });
  });

  it("refuse une requête d'écriture sans l'en-tête de protection (CSRF)", async () => {
    ctx = await monter();
    const r = await ctx.app.inject({ method: "PUT", url: "/api/settings/ai", headers: { "content-type": "application/json" }, payload: { fallback: [] } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("csrf");
  });

  it("refuse une requête venue d'un autre site", async () => {
    ctx = await monter();
    const r = await ctx.app.inject({ method: "PUT", url: "/api/settings/ai", headers: { ...H, origin: "https://evil.example" }, payload: { fallback: [] } });
    expect(r.statusCode).toBe(403);
  });

  it("une erreur interne ne montre ni chemin ni pile d'appels", async () => {
    ctx = await monter();
    const r = await ctx.app.inject({ method: "POST", url: "/api/chat", headers: H, payload: "{pas du json" });
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toMatch(/\/home\/|node_modules|at .*\(/);
    const inconnu = await ctx.app.inject({ url: "/api/nexiste-pas" });
    expect(inconnu.statusCode).toBe(404);
  });

  it("envoie les en-têtes de sécurité", async () => {
    ctx = await monter();
    const r = await ctx.app.inject({ url: "/api/health" });
    expect(String(r.headers["content-security-policy"])).toContain("frame-ancestors 'none'");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("mode code d'accès", () => {
  it("ferme l'API tant que le code n'est pas donné, puis l'ouvre avec le bon code", async () => {
    ctx = await monter({ BIBI_ACCESS_CODE: "sesame-bibi" });
    expect((await ctx.app.inject({ url: "/api/providers" })).statusCode).toBe(401);
    expect((await ctx.app.inject({ url: "/api/session" })).json()).toMatchObject({ mode: "code", authenticated: false });
    const mauvais = await ctx.app.inject({ method: "POST", url: "/api/auth/code", headers: H, payload: { code: "faux" } });
    expect(mauvais.statusCode).toBe(401);
    const bon = await ctx.app.inject({ method: "POST", url: "/api/auth/code", headers: H, payload: { code: "sesame-bibi" } });
    expect(bon.statusCode).toBe(200);
    const c = cookie(bon);
    expect(String(bon.headers["set-cookie"])).toMatch(/HttpOnly/i);
    expect(String(bon.headers["set-cookie"])).toMatch(/SameSite=Strict/i);
    const ouvert = await ctx.app.inject({ url: "/api/providers", headers: { cookie: c } });
    expect(ouvert.statusCode).toBe(200);
    await ctx.app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...H, cookie: c } });
    expect((await ctx.app.inject({ url: "/api/providers", headers: { cookie: c } })).statusCode).toBe(401);
  });

  it("limite les essais de code (anti-devinette)", async () => {
    ctx = await monter({ BIBI_ACCESS_CODE: "sesame-bibi" });
    let dernier = 0;
    for (let i = 0; i < 14; i++) {
      dernier = (await ctx.app.inject({ method: "POST", url: "/api/auth/code", headers: H, payload: { code: "x" + i } })).statusCode;
    }
    expect(dernier).toBe(429);
  });
});

describe("mode comptes (synchronisation)", () => {
  const env = { ENABLE_CLOUD_SYNC: "true" };
  const inscrire = (e: string, p = "motdepasse-long") =>
    ctx.app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { email: e, password: p } });

  it("le premier compte est propriétaire, les inscriptions se ferment ensuite", async () => {
    ctx = await monter(env);
    const a = await inscrire("moi@exemple.fr");
    expect(a.json()).toEqual({ ok: true, owner: true });
    const b = await inscrire("autre@exemple.fr");
    expect(b.statusCode).toBe(403);
    expect(b.json().error.code).toBe("registration_closed");
  });

  it("mot de passe trop court ou e-mail invalide : refusé ; stocké haché, jamais en clair", async () => {
    ctx = await monter(env);
    expect((await inscrire("moi@exemple.fr", "court")).statusCode).toBe(400);
    expect((await inscrire("pas-un-email")).statusCode).toBe(400);
    await inscrire("moi@exemple.fr", "motdepasse-long");
    const h = (ctx.db.prepare("SELECT password_hash FROM users").get() as { password_hash: string }).password_hash;
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("motdepasse-long");
  });

  it("connexion : mauvais mot de passe et compte inconnu reçoivent la même réponse", async () => {
    ctx = await monter(env);
    await inscrire("moi@exemple.fr");
    const login = (email: string, password: string) =>
      ctx.app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { email, password } });
    const a = await login("moi@exemple.fr", "mauvais-mot-de-passe");
    const b = await login("inconnu@exemple.fr", "mauvais-mot-de-passe");
    expect(a.statusCode).toBe(401);
    expect(b.json()).toEqual(a.json());
    expect((await login("MOI@exemple.fr", "motdepasse-long")).statusCode).toBe(200);
  });

  it("deux utilisateurs ne voient jamais les données l'un de l'autre", async () => {
    ctx = await monter({ ...env, ALLOW_REGISTRATION: "true" });
    const ca = cookie(await inscrire("a@exemple.fr"));
    const cb = cookie(await inscrire("b@exemple.fr"));
    const sync = (c: string, payload: object) =>
      ctx.app.inject({ method: "POST", url: "/api/sync", headers: { ...H, cookie: c }, payload });
    await sync(ca, { changes: [{ collection: "notes", id: "n1", updatedAt: 10, data: { text: "secret de A" } }] });
    const vueB = (await sync(cb, { since: 0 })).json();
    expect(vueB.changes).toEqual([]);
    const vueA = (await sync(ca, { since: 0 })).json();
    expect(vueA.changes).toHaveLength(1);
    expect(JSON.stringify(vueB)).not.toContain("secret de A");
    // B écrit le même identifiant : cela ne touche pas la note de A.
    await sync(cb, { changes: [{ collection: "notes", id: "n1", updatedAt: 99, data: { text: "note de B" } }] });
    expect(JSON.stringify((await sync(ca, { since: 0 })).json())).toContain("secret de A");
  });

  it("synchronisation : la dernière écriture gagne, les suppressions voyagent, l'effacement total marche", async () => {
    ctx = await monter(env);
    const c = cookie(await inscrire("moi@exemple.fr"));
    const sync = (payload: object) => ctx.app.inject({ method: "POST", url: "/api/sync", headers: { ...H, cookie: c }, payload });
    await sync({ changes: [{ collection: "tasks", id: "t1", updatedAt: 100, data: { title: "récent" } }] });
    const vieux = (await sync({ changes: [{ collection: "tasks", id: "t1", updatedAt: 50, data: { title: "ancien" } }] })).json();
    expect(vieux).toMatchObject({ accepted: 0, rejected: 1 });
    expect(vieux.changes[0].data.title).toBe("récent");
    const sup = (await sync({ since: vieux.seq, changes: [{ collection: "tasks", id: "t1", updatedAt: 200, deleted: true, data: null }] })).json();
    expect(sup.changes[0]).toMatchObject({ id: "t1", deleted: true });
    expect((await sync({ changes: [{ collection: "pirate", id: "x", updatedAt: 1, data: 1 }] })).statusCode).toBe(400);
    await ctx.app.inject({ method: "DELETE", url: "/api/sync", headers: { ...H, cookie: c } });
    expect((await sync({ since: 0 })).json().changes).toEqual([]);
  });

  it("l'API reste fermée sans compte connecté", async () => {
    ctx = await monter(env);
    expect((await ctx.app.inject({ method: "POST", url: "/api/sync", headers: H, payload: {} })).statusCode).toBe(401);
  });
});

describe("synchronisation désactivée", () => {
  it("répond « sync_disabled » plutôt que de faire semblant", async () => {
    ctx = await monter();
    const r = await ctx.app.inject({ method: "POST", url: "/api/sync", headers: H, payload: {} });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("sync_disabled");
  });
});

describe("démarrage en production : refus des réglages dangereux", () => {
  it("exige un secret de session long", () => {
    expect(() => loadConfig({ NODE_ENV: "production", SESSION_SECRET: "court", BIBI_ACCESS_CODE: "x" })).toThrow(/SESSION_SECRET/);
  });
  it("refuse d'ouvrir à tout le monde sans le dire clairement", () => {
    const base = { NODE_ENV: "production", SESSION_SECRET: "s".repeat(40) };
    expect(() => loadConfig(base)).toThrow(/BIBI_ACCESS_CODE/);
    expect(() => loadConfig({ ...base, BIBI_ACCESS_CODE: "ok" })).not.toThrow();
    expect(() => loadConfig({ ...base, BIBI_ALLOW_OPEN: "true" })).not.toThrow();
  });
});

describe("https forcé en production, relâché seulement pour l'essai local (Safari plantait sur http://127.0.0.1)", () => {
  const csp = async (env: Record<string, string>) => String((await ctx.app.inject({ url: "/api/health" })).headers["content-security-policy"]);
  it("production normale : la page force https et l'HSTS est envoyé", async () => {
    ctx = await monter({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), BIBI_ALLOW_OPEN: "true" });
    expect(await csp({})).toContain("upgrade-insecure-requests");
    expect((await ctx.app.inject({ url: "/api/health" })).headers["strict-transport-security"]).toBeTruthy();
  });
  it("essai local (BIBI_HTTP_LOCAL + 127.0.0.1) : plus de forçage https", async () => {
    ctx = await monter({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), BIBI_ALLOW_OPEN: "true", BIBI_HTTP_LOCAL: "true", HOST: "127.0.0.1" });
    expect(await csp({})).not.toContain("upgrade-insecure-requests");
  });
  it("BIBI_HTTP_LOCAL sur une adresse publique est ignoré (0.0.0.0 garde https)", async () => {
    ctx = await monter({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), BIBI_ALLOW_OPEN: "true", BIBI_HTTP_LOCAL: "true", HOST: "0.0.0.0" });
    expect(await csp({})).toContain("upgrade-insecure-requests");
  });
});
