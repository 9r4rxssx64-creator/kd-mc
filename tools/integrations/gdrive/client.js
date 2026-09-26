// kdmc-gdrive — Client Google Drive (ES Module)
// Auteur : Kevin DESARZENS (U11804) — Casino de Monte-Carlo
//
// Variables d'environnement requises :
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI
//   GOOGLE_OAUTH_TOKEN  (JSON stringifié des tokens OAuth obtenus via setup)
//
// Scope minimum : https://www.googleapis.com/auth/drive.file
// (accès uniquement aux fichiers créés/ouverts par cette app — RGPD friendly)

import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";

// ---------- Auth ----------
function _getAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback";
  const tokenJson = process.env.GOOGLE_OAUTH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error("[gdrive] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants — voir setup.md");
  }
  if (!tokenJson) {
    throw new Error("[gdrive] GOOGLE_OAUTH_TOKEN manquant — lancer le flow OAuth (voir setup.md)");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  try {
    oauth2.setCredentials(JSON.parse(tokenJson));
  } catch (e) {
    throw new Error("[gdrive] GOOGLE_OAUTH_TOKEN invalide (JSON attendu) : " + e.message);
  }
  return oauth2;
}

function _drive() {
  return google.drive({ version: "v3", auth: _getAuthClient() });
}

// ---------- Helpers ----------
async function _findFolderId(folderName, parentId = null) {
  if (!folderName) return null;
  const drive = _drive();
  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${folderName.replace(/'/g, "\\'")}'`,
    `trashed=false`,
    parentId ? `'${parentId}' in parents` : null,
  ].filter(Boolean).join(" and ");

  const res = await drive.files.list({ q, fields: "files(id, name)", pageSize: 1 });
  return res.data.files?.[0]?.id || null;
}

// ---------- Public API ----------

/**
 * Upload un fichier local vers Google Drive.
 * @param {string} localPath - chemin local du fichier
 * @param {string} [folderName] - nom du dossier destination (créé si absent)
 * @returns {Promise<{id, name, webViewLink}>}
 */
export async function uploadFile(localPath, folderName) {
  try {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Fichier introuvable : ${localPath}`);
    }
    const drive = _drive();
    let parents;
    if (folderName) {
      let folderId = await _findFolderId(folderName);
      if (!folderId) {
        const created = await createFolder(folderName);
        folderId = created.id;
      }
      parents = [folderId];
    }

    const res = await drive.files.create({
      requestBody: {
        name: path.basename(localPath),
        parents,
      },
      media: { body: fs.createReadStream(localPath) },
      fields: "id, name, webViewLink, size",
    });
    return res.data;
  } catch (e) {
    throw new Error(`[gdrive.uploadFile] ${e.message}`);
  }
}

/**
 * Liste les fichiers d'un dossier (ou racine).
 * @param {string} [folderName]
 * @returns {Promise<Array<{id,name,mimeType,modifiedTime}>>}
 */
export async function listFiles(folderName) {
  try {
    const drive = _drive();
    let q = "trashed=false";
    if (folderName) {
      const folderId = await _findFolderId(folderName);
      if (!folderId) return [];
      q += ` and '${folderId}' in parents`;
    }
    const res = await drive.files.list({
      q,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      pageSize: 100,
      orderBy: "modifiedTime desc",
    });
    return res.data.files || [];
  } catch (e) {
    throw new Error(`[gdrive.listFiles] ${e.message}`);
  }
}

/**
 * Télécharge un fichier Drive vers un chemin local.
 * @param {string} fileId
 * @param {string} outputPath
 * @returns {Promise<string>} chemin du fichier écrit
 */
export async function downloadFile(fileId, outputPath) {
  try {
    if (!fileId || !outputPath) {
      throw new Error("fileId et outputPath requis");
    }
    const drive = _drive();
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    return await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(outputPath);
      res.data
        .on("end", () => resolve(outputPath))
        .on("error", reject)
        .pipe(dest);
    });
  } catch (e) {
    throw new Error(`[gdrive.downloadFile] ${e.message}`);
  }
}

/**
 * Crée un dossier (option : sous-dossier).
 * @param {string} name
 * @param {string} [parentId]
 * @returns {Promise<{id,name,webViewLink}>}
 */
export async function createFolder(name, parentId) {
  try {
    if (!name) throw new Error("name requis");
    const drive = _drive();
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      },
      fields: "id, name, webViewLink",
    });
    return res.data;
  } catch (e) {
    throw new Error(`[gdrive.createFolder] ${e.message}`);
  }
}

/**
 * Partage un fichier avec un email donné.
 * @param {string} fileId
 * @param {string} email
 * @param {"reader"|"commenter"|"writer"} [role="reader"]
 */
export async function shareFile(fileId, email, role = "reader") {
  try {
    if (!fileId || !email) throw new Error("fileId et email requis");
    const drive = _drive();
    const res = await drive.permissions.create({
      fileId,
      requestBody: { type: "user", role, emailAddress: email },
      sendNotificationEmail: true,
      fields: "id, role, emailAddress",
    });
    return res.data;
  } catch (e) {
    throw new Error(`[gdrive.shareFile] ${e.message}`);
  }
}

export default { uploadFile, listFiles, downloadFile, createFolder, shareFile };
