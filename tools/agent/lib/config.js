// Chargement centralisé de la configuration depuis variables d'environnement
// Priorité : process.env > .env local (pas commit) > defaults

export function loadConfig() {
  const cfg = {
    // Core
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    CLAUDE_MODEL: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",

    // Firebase RTDB CMC Teams
    FB_URL: process.env.FB_URL || "https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app",
    FB_PATH: process.env.FB_PATH || "/cmcteams",
    // Compte de service (auth REST : la base exige `auth != null` depuis 2026-06).
    // Sans ces 2 vars → appels non authentifiés → HTTP 401 (cf. lib/firebase.js + lib/gauth.js).
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || "",
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || "",

    // Notifications
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
    GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN || "",
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || "",
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || "",
    NOTIFY_EMAIL_TO: process.env.NOTIFY_EMAIL_TO || "kevind@monaco.mc",

    // Drive backup
    GDRIVE_FOLDER_ID: process.env.GDRIVE_FOLDER_ID || "",

    // GitHub pour commits auto
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
    GITHUB_REPO: process.env.GITHUB_REPO || "9r4rxssx64-creator/cmcteams",

    // Agent config
    AGENT_TIMEZONE: process.env.AGENT_TIMEZONE || "Europe/Monaco",
    AGENT_ADMIN_ID: process.env.AGENT_ADMIN_ID || "U11804",
    AGENT_SECRET: process.env.AGENT_SECRET || "", // pour protéger endpoint API
  };

  // Check minimums
  if (!cfg.ANTHROPIC_API_KEY) {
    console.warn("⚠ ANTHROPIC_API_KEY manquant — l'agent ne pourra pas utiliser Claude");
  }
  return cfg;
}
