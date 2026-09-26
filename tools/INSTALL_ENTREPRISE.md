# 🏢 Installation CMC Teams en entreprise fermée (offline / intranet)

Guide pour déployer l'app dans un système sans accès internet ou sur intranet d'entreprise.

---

## 📦 Contenu du package

Le ZIP contient :
```
CMCteams_v9.118_YYYYMMDD_HHMM/
├── index.html          ← l'app entière (~1.3 MB, monofichier)
├── sw.js               ← Service Worker (offline)
├── manifest.json       ← PWA installable
├── favicon.ico         ← (optionnel)
├── README.md           ← description
├── NOTES_USER.md       ← infos métier admin
├── INSTALL.md          ← ce guide
└── BUILD_INFO.txt      ← date/version/hash
```

---

## 🚀 3 méthodes d'installation

### Méthode 1 — **Simple (ordinateur perso)**
Pas besoin de serveur. Juste un navigateur moderne.

1. Extraire le ZIP
2. **Double-cliquer sur `index.html`** → s'ouvre dans le navigateur
3. Fonctionne immédiatement

⚠️ Limitations mode `file://` :
- Pas de Service Worker (pas d'install PWA)
- Pas de sync Firebase (pas grave en offline)
- L'app fonctionne mais sans notifications navigateur

### Méthode 2 — **Serveur web local (recommandé)**
Pour plusieurs utilisateurs sur le même intranet.

**Prérequis** : un serveur web léger (au choix)
- Apache / Nginx : copier le dossier dans `/var/www/html/cmcteams/`
- IIS (Windows) : copier dans `C:\inetpub\wwwroot\cmcteams\`
- Serveur Python intégré (test rapide) :
  ```bash
  cd CMCteams_v9.118_*
  python3 -m http.server 8080
  ```
  Puis ouvrir `http://localhost:8080/index.html`
- Serveur Node intégré :
  ```bash
  npx http-server -p 8080
  ```

**Accès réseau local** :
- URL : `http://IP_SERVEUR:8080/` ou `http://intranet.entreprise.mc/cmcteams/`
- Chaque employé installe via son navigateur
- Option PWA : "Ajouter à l'écran d'accueil" sur mobile / "Installer l'app" sur desktop

### Méthode 3 — **PWA installable (mobile & desktop)**
Avec un serveur HTTPS (même auto-signé intranet).

1. Serveur avec HTTPS (Caddy recommandé : auto-HTTPS en 2 lignes)
   ```
   # Caddyfile
   cmcteams.intranet {
     root * /var/www/cmcteams
     file_server
   }
   ```
2. L'utilisateur visite l'URL une fois
3. Icône "Installer" dans la barre d'adresse → l'app devient une app standalone
4. Fonctionne offline après le premier chargement (Service Worker cache tout)

---

## 🔌 Configuration selon l'environnement

### Entreprise **100% fermée** (aucun internet)
Désactiver tout ce qui tente du réseau externe :
1. Se connecter en admin (U11804)
2. Panneau Admin → **"Synchronisation temps réel"**
3. Laisser l'URL Firebase **vide** → pas de sync cloud
4. **IA (Claude)** : désactiver dans l'onglet 🤖 IA (sinon erreurs réseau toutes les requêtes)
5. Tout reste dans `localStorage` du navigateur de chaque utilisateur

**Sauvegardes** : auto quotidiennes + manuelles via Admin → Export JSON
⚠️ Sur un seul device : seul ce device a les données. **Faire des exports réguliers**.

### Entreprise **intranet avec Firebase privé**
Vous avez un projet Firebase (compte SBM par exemple) :
1. Admin → Firebase → coller votre URL RTDB
2. Les devices de tous les employés se synchronisent via Firebase
3. Fonctionne en offline (queue locale, flush au retour)

### Entreprise avec **proxy IA Claude interne**
Pour avoir l'IA sans exposer la clé API côté client :
1. Déployer un proxy Cloudflare Worker OU Nginx reverse proxy
2. Exemple Worker fourni : `proxy-anthropic-cloudflare.js`
3. Admin → IA → 🔗 Proxy → coller l'URL
4. La clé API reste côté serveur

---

## 🛡 Sécurité en entreprise fermée

### Ce qui est stocké localement
- `localStorage` de chaque navigateur : employés, planning, messages, mots de passe **hashés** (v2 sel dynamique 15k rounds)
- **Aucune donnée sensible en clair** dans le code
- PIN admin : hash argon-like, jamais sync cloud
- Clé API Claude : `FB_LOCAL` (jamais envoyée à Firebase)

### Audit & conformité
- Journal admin : `Admin → 🛡 Journal sécurité admin` (200 entrées)
- Stats connexions : `Admin → 📊 Statistiques connexion` (500 entrées, IP/navigateur/lieu)
- Modifications : `Admin → 📝 Journal modifications` (500 entrées)
- Export CSV pour tous les journaux

### Suppression employé
- Les données restent sauf si admin fait "Reset compte" (Admin → Mots de passe → 🗑 Reset)
- Purge totale : Admin → Reset complet (préserve la clé API mais vide le reste)

---

## 📞 Support quand déconnecté

L'assistant IA (Claude) ne fonctionne que si le device a accès à `api.anthropic.com` ou à un proxy.

**En environnement fermé** :
- L'IA locale fonctionne toujours (règles métier, stats, convention SBM, plans casino) — **sans internet**
- La communication avec Claude cloud nécessite au minimum un accès proxy HTTPS
- Si besoin de support Claude : reconnexion temporaire au réseau + mode IA activé

---

## 🔄 Mise à jour de l'app

Chaque nouvelle version = nouveau ZIP.

**Procédure** :
1. Télécharger le nouveau ZIP
2. Remplacer `index.html` dans le dossier d'installation (seul ce fichier change la plupart du temps)
3. Si `sw.js` a bougé : l'utilisateur verra un bandeau "nouvelle version disponible" après ~5 min
4. Recharger l'app (Ctrl+Shift+R ou ⌘+Shift+R pour forcer)

**Automatiquement géré** :
- Le Service Worker détecte la nouvelle version et propose le reload
- Les données localStorage sont préservées (migration auto via `DATA_VER`)
- Les préférences admin (thème, clé API) sont conservées

---

## 📁 Fichiers de configuration (optionnels)

Créer un fichier `config.json` à côté de `index.html` :
```json
{
  "firebaseUrl": "",
  "iaProxyUrl": "https://proxy.intranet.mc/anthropic",
  "defaultTheme": "dark",
  "defaultLang": "fr",
  "disableIA": false,
  "disableFirebase": false
}
```
⚠️ Non implémenté actuellement — à faire en futur si besoin (v9.120+).

---

## ✅ Checklist post-install

- [ ] Extraire le ZIP dans le bon emplacement
- [ ] Serveur web accessible (HTTP ou HTTPS)
- [ ] Premier login admin U11804 OK
- [ ] Vérifier : Admin → Version doit afficher v9.118+
- [ ] Configurer Firebase URL (ou laisser vide si fermé)
- [ ] Configurer IA proxy (ou désactiver si pas d'internet)
- [ ] Tester : importer un PDF planning → vérification auto s'affiche
- [ ] Tester : envoyer un message chat → reçu sur autre device (si Firebase)
- [ ] Faire un premier export JSON backup pour archivage

---

## 📧 Contact

- Admin : Kevin DESARZENS (kevind@monaco.mc · U11804)
- Source : https://github.com/9r4rxssx64-creator/cmcteams
- Projet : SBM Monte-Carlo

*Dernière mise à jour : v9.118 (2026-04-13)*
