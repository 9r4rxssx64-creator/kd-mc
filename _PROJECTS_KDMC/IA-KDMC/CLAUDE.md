# IA-KDMC — Guide assistant IA

Projet de Kevin DESARZENS (U11804 · kevind@monaco.mc).
Créé le 2026-04-13. **Pas encore commencé** — l'admin dira quand démarrer.

---

## 🎯 Objectif (à préciser avec l'admin au démarrage)

Projet IA personnel de Kevin DESARZENS. Nature exacte à définir :
- Agent IA personnel ?
- Automatisation d'un workflow métier ?
- Chatbot spécialisé casino/RH ?
- Outil IA intégré à CMCteams ?

**À demander au premier message** : périmètre, utilisateurs cibles, données
disponibles, intégrations attendues (Anthropic API, OpenAI, local LLM ?).

---

## 👤 Identité admin

- **Nom** : Kevin DESARZENS
- **Matricule SBM** : U11804
- **Email** : kevind@monaco.mc
- **Département** : Jeux de table / Black Jack — Casino de Monte-Carlo (SBM)
- **Préfix projets** : KDMC (Kevin DESARZENS Monte-Carlo)

Les méta-règles globales s'appliquent : voir `~/.claude/CLAUDE.md`.

---

## 🚨 MÉTA-RÈGLES PERMANENTES (à appliquer SANS que l'admin redemande)

Communes aux 3 projets de Kevin :

1. **Toute info métier = enregistrée immédiatement** dans ce CLAUDE.md
2. **Toute fonction nouvelle = auto + sur-vérifiée + bouton manuel secours**
3. **Priorité = fonctionnement correct, pas vitesse**
4. **Backup Firebase / cloud** des configs sensibles (clé API, etc.)
5. **Clé API Anthropic** : jamais stockée dans le repo, lien
   https://console.anthropic.com/settings/keys
6. **UX simple, visuel, ludique, compréhensible** (règle §1bis de CMCteams)
7. **Erreurs connues documentées** ici, ne jamais les reproduire
8. **TodoWrite obligatoire** pour chaque demande
9. **Validation post-commit** : syntax check + tests avant push
10. **Branche unique `main`** pour CE projet — pas d'autres branches.
    ⚠️ **« comme CMCteams » était FAUX** (corrigé 6.09.2026) : CMCteams travaille au contraire
    sur des branches `claude/*` (918 branches au 6.09.2026), jamais en poussant sur `main`
    directement. Ne pas copier ce point-là depuis CMCteams.

---

## 🧰 Outils à utiliser (réflexes)

- Claude API (modèle `claude-opus-5` ou `claude-haiku-4-5-20251001`)
- Prompt caching pour économiser tokens
- Tool use custom (fonctions métier)
- Web search si pertinent
- MCP server si intégration multi-outils

---

## 🛡 Erreurs à NE PAS reproduire (hérités de CMCteams)

1. **Pas de `\u{XXXX}` ES6** — utiliser surrogate pair `\uD83D\uDCF1` (Safari iOS)
2. **Pas d'escapes complexes dans onclick inline** → créer des helpers nommés
3. **Toujours `.catch()` sur `fetch()`** — Safari iOS crash Promise non-catchée
4. **Vérifier `r.ok` avant `r.json()`** — éviter crash sur HTML d'erreur
5. **`localStorage.clear()` NE DOIT PAS effacer la clé API** — préserver config admin
6. **Re-query DOM après `dc()`** si callback async (DOM orphelin sinon)
7. **Syntax check JS AVANT chaque commit** : `node --check`
8. **Chaque info admin = IMMÉDIATEMENT dans CLAUDE.md**

---

## 📋 Journal des décisions

*(à remplir au fil du projet)*

---

## 🔮 À préciser au démarrage

- [ ] Stack technique (HTML SPA ? Node.js ? Python ?)
- [ ] Hébergement (GitHub Pages ? Vercel ? Cloudflare ?)
- [ ] Modèle Claude cible (Haiku rapide ? Opus puissant ?)
- [ ] Intégration avec CMCteams ?
- [ ] Utilisateurs (admin seul ? équipe ?)
- [ ] Données source
- [ ] Budget tokens/mois

---

*Dernière mise à jour : 2026-04-13 (création initiale, projet pas encore démarré)*
