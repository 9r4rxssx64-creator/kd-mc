import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

try {
  // charge .env si présent (les variables déjà définies dans l'environnement gagnent)
  const { existsSync, readFileSync } = await import("node:fs");
  const { lireEnv } = await import("./env-file.js");
  if (existsSync(".env")) {
    for (const [k, v] of Object.entries(lireEnv(readFileSync(".env", "utf8")))) if (process.env[k] === undefined) process.env[k] = v;
  }
  const config = loadConfig();
  const { app, hub } = await buildApp(config, { logger: true });
  await app.listen({ port: config.PORT, host: config.HOST });
  const prets = hub.status().filter((s) => s.configured).map((s) => s.name);
  app.log.info(
    prets.length
      ? `Bibi est prête. Fournisseurs d'IA configurés : ${prets.join(", ")}.`
      : "Bibi est prête, mais aucune clé d'IA n'est configurée : ouvre Paramètres › Intelligence artificielle.",
  );
  const arret = async () => { await app.close(); process.exit(0); };
  process.on("SIGINT", arret);
  process.on("SIGTERM", arret);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
