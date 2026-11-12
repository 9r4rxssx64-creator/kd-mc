// Lance le serveur (tsx watch) et l'interface (vite) ensemble. Ctrl+C arrête les deux.
import { spawn } from "node:child_process";
const env = { ...process.env, PORT: process.env.PORT ?? "3000", NODE_ENV: process.env.NODE_ENV ?? "development" };
const lancer = (nom, cmd, args) => {
  const p = spawn(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  p.on("exit", (code) => { console.log(`[${nom}] arrêté (${code})`); stop(); });
  return p;
};
const enfants = [lancer("serveur", "npx", ["tsx", "watch", "server/index.ts"]), lancer("interface", "npx", ["vite"])];
let fin = false;
function stop() { if (fin) return; fin = true; for (const e of enfants) e.kill(); setTimeout(() => process.exit(0), 300); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
console.log(`\nBibi : interface sur http://localhost:5173 · serveur sur http://localhost:${env.PORT}\n`);
