# kdmc-gdrive

Module Google Drive pour CMCteams (Kevin DESARZENS / U11804).

Upload, download, list, create folder, share — via API Google Drive v3 (scope `drive.file`).

## Installation

```bash
cd tools/integrations/gdrive
npm install
```

Configuration : voir [`setup.md`](./setup.md).

## Exemples

### Node.js (ES Modules)

```js
import {
  uploadFile,
  listFiles,
  downloadFile,
  createFolder,
  shareFile,
} from "./client.js";

// 1. Upload d'un backup CMCteams
const up = await uploadFile("/home/user/CMCteams/backup.json", "CMCteams-Backups");
console.log("Uploade :", up.webViewLink);

// 2. Lister le contenu du dossier
const files = await listFiles("CMCteams-Backups");
files.forEach(f => console.log(f.name, "-", f.modifiedTime));

// 3. Telecharger un fichier
await downloadFile(up.id, "/tmp/restore.json");

// 4. Creer un dossier racine
const folder = await createFolder("CMCteams-2026");

// 5. Partager avec un collegue SBM
await shareFile(up.id, "collegue@monaco.mc", "reader");
```

### Automatisation — backup quotidien

```bash
# crontab -e
0 2 * * * cd /home/user/CMCteams/tools/integrations/gdrive && node -e "import('./client.js').then(m=>m.uploadFile('/home/user/CMCteams/backup-'+new Date().toISOString().slice(0,10)+'.json','CMCteams-Backups'))"
```

### Exemple curl (accès direct API, sans module)

```bash
# Upload simple (avec access_token deja obtenu)
curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'metadata={"name":"backup.json"};type=application/json' \
  -F "file=@/tmp/backup.json" \
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
```

## API

| Fonction | Signature | Retour |
|----------|-----------|--------|
| `uploadFile` | `(localPath, folderName?)` | `{id, name, webViewLink}` |
| `listFiles` | `(folderName?)` | `Array<{id,name,mimeType,modifiedTime}>` |
| `downloadFile` | `(fileId, outputPath)` | `string` (chemin) |
| `createFolder` | `(name, parentId?)` | `{id, name, webViewLink}` |
| `shareFile` | `(fileId, email, role='reader')` | `{id, role, emailAddress}` |

## Sécurité

- Scope `drive.file` uniquement (l'app voit seulement ses propres fichiers)
- Aucun secret dans le code — tout via `process.env.*`
- Try/catch robuste sur chaque fonction — erreurs préfixées `[gdrive.xxx]`

## Cas d'usage SBM

- Backup quotidien `localStorage` CMCteams vers Drive
- Archivage mensuel des plannings PDF importés
- Partage de documents RH avec les chefs de table
