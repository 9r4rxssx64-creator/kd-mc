import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../server/config";
import { lireEnv } from "../../server/env-file";

describe("fichier .env", () => {
  it("lit clés, valeurs vides, guillemets, et ignore les commentaires", () => {
    const e = lireEnv('# commentaire\nPORT=4000\nGROQ_API_KEY=\nCUSTOM_AI_NAME="Mon IA"\n  SESSION_SECRET = abc#def  \n');
    expect(e).toEqual({ PORT: "4000", GROQ_API_KEY: "", CUSTOM_AI_NAME: "Mon IA", SESSION_SECRET: "abc#def" });
  });
  it("un « # » au milieu d'une valeur fait partie de la valeur (pas de commentaire en fin de ligne)", () => {
    expect(lireEnv("PORT=3000 # port").PORT).toBe("3000 # port");
  });
  it(".env.example se charge tel quel, sans erreur, avec des valeurs sûres par défaut", () => {
    const c = loadConfig(lireEnv(readFileSync(".env.example", "utf8")));
    expect(c.PORT).toBe(3000);
    expect(c.ALLOW_PAID_PROVIDERS).toBe(false);
    expect(c.BIBI_ALLOW_OPEN).toBe(false);
    expect(c.ENABLE_CLOUD_SYNC).toBe(false);
    expect(c.ENABLE_LOCAL_MEMORY).toBe(true);
    expect(c.GEMINI_API_KEY).toBe("");
  });
  it("chaque variable lue par le serveur est documentée dans .env.example (sauf les adresses de test)", () => {
    const doc = Object.keys(lireEnv(readFileSync(".env.example", "utf8")));
    const src = readFileSync("server/config.ts", "utf8");
    const noms = [...src.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*(?:z\.|bool)/gm)].map((m) => m[1]!);
    const manque = noms.filter((n) => !doc.includes(n) && !n.endsWith("_BASE_URL") || (n === "CUSTOM_AI_BASE_URL" && !doc.includes(n)));
    expect(manque).toEqual([]);
  });
  it("en production sans secret assez long, le serveur refuse de démarrer", () => {
    expect(() => loadConfig({ NODE_ENV: "production", SESSION_SECRET: "court", BIBI_ACCESS_CODE: "x" })).toThrow(/SESSION_SECRET/);
  });
  it("DATABASE_URL : seul SQLite est accepté, une adresse PostgreSQL est refusée (jamais ignorée en silence)", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://u:p@h/db" })).toThrow(/pas pris en charge/);
    expect(() => loadConfig({ DATABASE_URL: "postgresql://h/db" })).toThrow(/PostgreSQL/);
    expect(loadConfig({ DATABASE_URL: "sqlite:/tmp/x.db" }).dbPath).toBe("/tmp/x.db");
    expect(loadConfig({ DATABASE_URL: "" }).dbPath).toBe("data/bibi.db");
  });
});
