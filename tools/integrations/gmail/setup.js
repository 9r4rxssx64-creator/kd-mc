/**
 * setup.js — OAuth 2.0 interactif pour Gmail API
 *
 * Usage : node setup.js
 *
 * Pré-requis :
 *   - credentials.json présent dans ce dossier (téléchargé depuis Google Cloud Console)
 *
 * Sortie :
 *   - token.json contenant access_token + refresh_token
 *
 * Auteur : Kevin DESARZENS (U11804) — projet KDMC
 */

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

// Scope Gmail : lecture + envoi + modification (suffisant pour tous nos usages)
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  // 1. Lire credentials.json
  let credentials;
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, "utf8");
    credentials = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Impossible de lire credentials.json");
    console.error("   Place le fichier ici :", CREDENTIALS_PATH);
    console.error("   Voir setup.md étapes 1-4");
    process.exit(1);
  }

  const cfg = credentials.installed || credentials.web;
  if (!cfg) {
    console.error("❌ credentials.json invalide : pas de section 'installed' ou 'web'");
    process.exit(1);
  }

  const { client_id, client_secret, redirect_uris } = cfg;
  const redirectUri =
    (redirect_uris && redirect_uris[0]) || "urn:ietf:wg:oauth:2.0:oob";

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  // 2. Générer URL d'autorisation
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n=== Setup Gmail OAuth ===\n");
  console.log("1. Ouvre cette URL dans ton navigateur :\n");
  console.log("   " + authUrl + "\n");
  console.log("2. Connecte-toi avec ton compte Google");
  console.log("3. Autorise l'accès Gmail");
  console.log("4. Copie le code affiché\n");

  const code = await ask("Colle le code ici : ");
  if (!code) {
    console.error("❌ Code vide, abandon");
    process.exit(1);
  }

  // 3. Échanger code → tokens
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    console.log("\n✅ Token sauvegardé :", TOKEN_PATH);

    if (tokens.refresh_token) {
      console.log("\n📋 Ajoute ces variables à ton ~/.bashrc :\n");
      console.log(`export GMAIL_CLIENT_ID="${client_id}"`);
      console.log(`export GMAIL_CLIENT_SECRET="${client_secret}"`);
      console.log(`export GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`);
      console.log("");
    } else {
      console.warn("\n⚠️  Pas de refresh_token reçu. Si l'app était déjà autorisée,");
      console.warn("   révoque-la sur https://myaccount.google.com/permissions");
      console.warn("   puis relance setup.js");
    }

    // Test rapide
    oAuth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    console.log("✅ Connecté à :", profile.data.emailAddress);
    console.log("   Total messages :", profile.data.messagesTotal);
  } catch (err) {
    console.error("❌ Erreur lors de l'échange du code :", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Erreur fatale :", err.message);
  process.exit(1);
});
