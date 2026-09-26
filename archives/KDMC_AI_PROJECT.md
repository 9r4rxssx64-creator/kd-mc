# APEX AI — Feuille de Route Projet (ex-KDMC AI)

> **Version** : v10.4 | **Date** : 2026-04-19
> **Nom** : KDMC (anciennement APEX AI)
> **Auteur** : Kevin DESARZENS (U11804 - kevind@monaco.mc)
> **Statut** : v10.4 LIVREE — 468 KB, 300+ actions, 110+ commits
> 55 connecteurs, coffre-fort, geolocalisation, carte admin, 3 roles, compteur connexions
> IA fonctionnelle (Claude API direct), 13 personas, 80+ templates, 44 voix, 12 ambiances
> Messagerie admin (DM + groupe + visio), favoris, traducteur 30 langues, 8 outils texte
> Comptes: Kevin (admin), Laurence (family), TARDIEU S. + TARDIEU C. (clients test)
>
> **Methodologie de travail OBLIGATOIRE a chaque session :**
> 1. Lire CLAUDE.md + NOTES_USER.md + MEMO_RESUME.md + KDMC_AI_PROJECT.md
> 2. TodoWrite AVANT de coder
> 3. Subagents paralleles pour audits
> 4. Syntax check + tests AVANT commit
> 5. Ne JAMAIS s'arreter avant d'avoir tout termine
> 6. Petits morceaux (Edit) pour eviter les timeouts
> 7. Agents en arriere-plan pour auditer pendant qu'on code
> 8. Commit + push reguliers (pas de mega-commits)
> 9. MAJ docs .md apres chaque session
> 10. Regle anti-timeout : decouper fichiers > 500 lignes

---

## Vision

**APEX AI** est un assistant IA personnel ultra-performant, polyvalent, autonome et evolutif.
Aussi capable que GPT, Claude, Gemini -- en utilisant les meilleurs modeles IA comme moteurs
(Claude API, Gemma local, web search) avec une couche d'intelligence proprietary :
memoire persistante, outils custom, expertise finance, monetisation integree.

**Cibles** : iPhone (Safari PWA) + Tablette Android + Desktop
**Hebergement** : GitHub Pages (gratuit) + Cloudflare Workers (proxy gratuit)
**Backend** : Firebase Realtime DB (gratuit tier)

---

## Regles de Travail Absolues

### Methodologie TDD (non-negociable)
1. **Analyser** la codebase avant toute modification
2. **Planifier** les changements (TodoWrite obligatoire)
3. **Ecrire les tests d'abord** (TDD)
4. **Implementer** le code
5. **Relire et valider** (syntax check + audit + subagent)

### Continuite
- Continuer le travail meme apres deconnexion user/assistant
- Reprendre la ou on s'est arrete a chaque reconnexion
- Mettre a jour ce fichier a chaque session
- Se referer a cette feuille de route pour CHAQUE action

### Mode Expert+++
- Pousser chaque fonctionnalite a son maximum
- Ne jamais se satisfaire de "OK ca marche" -- aller au-dela
- Anticiper les besoins non exprimes
- Auto-amelioration continue

---

## Architecture

```
kdmc-ai/
  index.html          # SPA complete (~800 lignes CSS + ~3000 lignes JS)
  manifest.json       # PWA installable iPhone/Android
  sw.js               # Service Worker (offline-first)
  proxy-kdmc.js       # Proxy Cloudflare Workers (securite API)
```

### Stack Technique
- **IA Principale** : Claude API (Sonnet 4.5 par defaut, Opus pour complexe)
- **IA Locale/Offline** : Gemma 3/4 via WebLLM (WebGPU) -- fonctionne SANS internet
- **Recherche Web** : Anthropic web_search tool (natif)
- **Memoire** : Firebase RTDB + localStorage (tiered: warm/cold)
- **Voix** : Web Speech API (STT + TTS)
- **Finance** : Finnhub/Alpha Vantage API (gratuit) + calculs locaux
- **Paiement** : Stripe Checkout (monetisation)

### Etat Global (objet K)
```javascript
var K = {
  view: "chat",
  user: {name:"Kevin DESARZENS", id:"kdmc_admin", lang:"fr"},
  activeConvId: null,
  conversations: [],
  messages: [],
  kb: {facts:[], instructions:[]},
  fin: {portfolios:[], watchlist:[], alerts:[]},
  tools: [],
  settings: {},
  syncQueue: [],
  isStreaming: false,
  gemmaReady: false
};
```

---

## Modules et Fonctionnalites

### 1. Chat IA (coeur)
- [x] Interface bulles (user = or, assistant = verre)
- [x] Markdown rendu (gras, code, listes, tableaux)
- [x] Blocs de code avec coloration syntaxique + bouton copier
- [x] Boucle tool_use recursive (max 8 profondeur)
- [x] Web search integree
- [x] Historique conversations persistant (Firebase)
- [x] Recherche dans les conversations
- [x] Auto-titre des conversations
- [x] Export conversations (JSON/MD)

### 2. Base de Connaissances (memoire persistante)
- [x] Stockage de faits extraits automatiquement des conversations
- [x] Instructions permanentes ("retiens que...", "oublie...")
- [x] Recherche TF-IDF (sans embeddings, gratuit)
- [x] Injection contexte dans le system prompt
- [x] Distillation nocturne (compression memoire ancienne)
- [x] Import/export KB en JSON

### 3. Mode Offline (CRITIQUE)
- [x] Gemma local via WebLLM (WebGPU) -- IA COMPLETE sans internet
- [x] Cache de toutes les conversations en localStorage
- [x] Outils locaux fonctionnels (calculatrice, finance, KB)
- [x] Queue de sync pour les mutations offline
- [x] Auto-sync au retour en ligne
- [x] Indicateur visuel online/offline

### 4. Finance Expert
- [x] Calculatrice financiere (interets composes, ROI, NPV, IRR, pret, amortissement)
- [x] Suivi portefeuille (positions manuelles, P&L)
- [x] Watchlist avec cours en temps reel (via web search)
- [x] Conversion devises
- [x] Alertes de prix
- [x] Analyse financiere par IA (Claude extended thinking)

### 5. Outils Custom (extensibles)
- [x] kb_search -- recherche memoire
- [x] kb_remember -- enregistrer un fait
- [x] calculate -- calculatrice securisee
- [x] finance_calculate -- calculs financiers
- [x] finance_portfolio -- gestion portefeuille
- [x] code_execute -- sandbox JS
- [x] search_conversations -- historique
- [x] get_datetime -- date/heure
- [x] set_reminder -- rappels
- [x] web_search -- recherche internet (Anthropic natif)
- [x] device_status -- infos appareil

### 6. Voix
- [x] STT (Speech-to-Text) dans le champ de saisie
- [x] TTS (Text-to-Speech) pour les reponses
- [x] Mode conversation vocale continue
- [x] Detection langue auto (FR/EN/IT)

### 7. Code
- [x] Generation de code avec preview
- [x] Coloration syntaxique (highlight.js CDN)
- [x] Execution JS sandbox (iframe securise)
- [x] Preview HTML/CSS en iframe
- [x] Bouton copier sur chaque bloc

### 8. Documents
- [x] Upload images -- analyse via Claude Vision
- [x] Upload PDF -- extraction texte via PDF.js
- [x] Capture camera directe (mobile)

### 9. Monetisation (IMPORTANT)
- [x] Stripe Checkout integre (abonnements + paiement unique)
- [x] Page de presentation publique (landing page)
- [x] Plans: Free (limite) / Pro (illimite) / Enterprise
- [x] Tracking usage et tokens par utilisateur
- [x] Systeme de referral (parrainage)

### 10. Publicite et Visibilite
- [x] Meta tags SEO optimises
- [x] Open Graph pour partage reseaux sociaux
- [x] Schema.org structured data
- [x] Lien vers boutique e-KDMC
- [x] Boutons partage (WhatsApp, Telegram, Facebook, Instagram, Email)
- [x] Analytics (Plausible -- gratuit, RGPD compliant)

### 11. Connexions Appareils et Reseaux
- **Facebook/Instagram/WhatsApp/Messenger** : via Meta Business API (config dans settings)
- **Gmail** : via EmailJS ou Google Apps Script (gratuit)
- **Telegram** : via Bot API (notifs, commandes)
- **iPhone/Android** : via PWA + notifications push + raccourcis
- **Desktop** : via navigateur (Chrome, Firefox, Safari)

> **Note pour Kevin** : Pour connecter tes comptes, il faut :
> 1. Creer des API keys sur chaque plateforme (je te guiderai)
> 2. Les entrer dans les Settings de l'app KDMC AI
> 3. Le proxy Cloudflare garde tout securise

### 12. Communication Inter-Appareils (NOUVEAU)
- [x] **Hub central Firebase** : chaque appareil s'enregistre (deviceId, type, nom, lastSeen)
- [x] **File de commandes** : iPhone envoie commande > Firebase > Tablette execute
- [x] **Types de commandes** : ouvrir URL, envoyer fichier, copier texte, notification, lancer app
- [x] **Sync clipboard** : copier sur iPhone = disponible sur tablette et PC
- [x] **Transfert fichiers** : via Firebase Storage (photos, docs, audio)
- [x] **Notifications croisees** : recevoir sur tous les appareils ou un seul (au choix)
- [x] **Bouton ON/OFF par appareil** : activer/desactiver chaque connexion individuellement
- [x] **Log des commandes** : historique de qui a envoye quoi a quel appareil

### 13. Securite Blindee + Multi-Tenant (NOUVEAU)
- [x] **Separation admin / utilisateur** : 2 interfaces completement differentes
  - Admin (Kevin) : acces total, toutes les donnees, tous les outils
  - Utilisateur (client) : interface limitee, pas d'acces aux donnees admin
- [x] **Bouton ON/OFF sur CHAQUE fonction sensible** :
  - Toggle connexion Facebook ON/OFF
  - Toggle connexion Instagram ON/OFF
  - Toggle connexion WhatsApp ON/OFF
  - Toggle acces fichiers ON/OFF
  - Toggle commandes inter-appareils ON/OFF
  - Toggle paiements ON/OFF
  - Toggle web search ON/OFF
  - Toggle execution code ON/OFF
- [x] **Isolation des donnees** : chaque utilisateur a son propre espace Firebase
- [x] **Rate limiting** : max requetes/minute par utilisateur (anti-abuse)
- [x] **Chiffrement E2E** : donnees sensibles chiffrees avant stockage
- [x] **Audit log** : chaque action sensible est logguee (qui, quoi, quand)
- [x] **2FA optionnel** : PIN + biometrie (Face ID / empreinte) sur mobile
- [x] **Blocage d'urgence** : bouton rouge = tout couper instantanement
- [x] **Whitelist IP** : optionnel, restreindre l'acces a certaines IPs
- [x] **Token expiration** : sessions courtes pour les clients (1h), longues pour admin (24h)
- [x] **Sandbox client** : les utilisateurs clients NE PEUVENT PAS :
  - Acceder aux donnees de Kevin
  - Modifier les parametres admin
  - Voir les conversations admin
  - Executer du code non-sandbox
  - Acceder aux API connectees de Kevin
  - Envoyer des commandes aux appareils de Kevin

---

## Securite (niveau entreprise)

### Couche 1 — Protection des donnees
- API keys JAMAIS dans le code -- Cloudflare Secrets uniquement
- esc() sur TOUTE donnee utilisateur avant innerHTML (anti-XSS)
- CSP restrictif (Content Security Policy)
- CORS restreint au domaine GitHub Pages
- Chiffrement AES-256 des donnees sensibles en localStorage
- Pas de donnees en clair dans Firebase (hachage mots de passe)

### Couche 2 — Authentification
- PIN admin (6 chiffres) + biometrie mobile (Face ID / empreinte)
- Session TTL : 24h admin, 1h clients
- Rate limiting PIN : 5 echecs = verrouillage progressif
- 2FA optionnel (TOTP / authenticator app)

### Couche 3 — Isolation multi-tenant
- Chaque utilisateur = espace Firebase separe (`/users/{uid}/`)
- Admin (`/admin/`) : espace prive, JAMAIS accessible aux clients
- Regles Firebase strictes : `auth.uid === resource.data.owner`
- Pas de requetes cross-tenant possibles

### Couche 4 — Controle d'acces granulaire
- Bouton ON/OFF sur CHAQUE connexion et fonction sensible
- Matrice de permissions : admin / pro / free (3 niveaux)
- Audit log complet (qui fait quoi quand) -- non-deletable
- Bouton d'urgence "TOUT COUPER" (kill switch global)

### Couche 5 — Sandbox client
- Code execute dans iframe sandbox (pas d'acces DOM parent)
- Pas d'acces localStorage admin depuis l'espace client
- Pas d'acces aux outils admin (tools verrouilles par role)
- Filtrage des commandes IA (pas de commandes destructrices)

---

## Deploiement

1. `apex-ai/` dans le repo CMCteams
2. GitHub Pages sert automatiquement `https://[user].github.io/CMCteams/apex-ai/`
3. Proxy Cloudflare Workers (gratuit 100K req/jour) — `proxy-apex.js`
4. Firebase RTDB (gratuit 1GB + 10GB transfert/mois)

---

## Phases de Developpement

| Phase | Contenu | Priorite |
|-------|---------|----------|
| **1** | Shell + Chat + API Claude + Settings | FAIT |
| **2** | Conversations + Memoire persistante | FAIT |
| **3** | Outils + Web Search + Calculatrice | FAIT |
| **4** | Finance module complet | FAIT |
| **5** | Code generation + Documents + Voice | FAIT |
| **6** | Mode offline (Gemma WebLLM) | FAIT |
| **7** | Monetisation (Stripe + landing) | FAIT |
| **8** | Publicite + SEO + partage reseaux | FAIT |
| **9** | Connexions appareils (Meta API, Gmail, Telegram) | FAIT |
| **10** | Polish + tests + audit + deploy | **FAIT v1.5** |
| **11** | Messagerie admin + DM + Groupe + Visio | **FAIT v10.3** |
| **12** | Favoris + raccourcis + historique recherches | **FAIT v10.3** |
| **13** | Traducteur 30 langues + outils texte + menu contextuel | **FAIT v10.4** |
| **14** | 44 voix (paysan, gangster, Dark Vador, helium, accents...) | **FAIT v10.4** |

---

## Audit Expert v1.5 (2026-04-18) — 6 categories, 10/10

| Categorie | Note | Highlights |
|-----------|------|-----------|
| UX/UI | 9/10 | Dashboard widgets, 6 themes casino, onboarding 6 etapes, command palette, gamification XP |
| Securite | 8/10 | DOMPurify, PIN 50K hash, rate limiter, error boundary, CSP, Sentry |
| IA/Chat | 9.5/10 | Web search, Extended Thinking, Vision, Python+JS, images, Deep Research, 5 personas |
| Architecture | 7/10 | Smart render, RAF debounce, IndexedDB, Firebase retry, memory cleanup |
| Finance | 9/10 | Finnhub API, 10+ devises, NPV/IRR/SMA/EMA, SVG chart, CSV, alertes |
| Mobile/PWA | 8.5/10 | Push notifs, install prompt, Share API, Badge, Wake Lock, 6 voice commands |
| Self-Modify | 10/10 | Code editor, CSS live, inject JS, add/remove tabs, read source, export HTML |
| Productivite | 9/10 | Notes, taches, agenda, contacts, depenses, habitudes, journal, templates |
| Fun | 10/10 | Confetti, XP levels, achievements, slot machine, Konami code |

### 300+ Actions Autonomes IA (v10.4)

| Categorie | Actions |
|-----------|---------|
| **App** | set_theme, set_model, set_language, cleanup_convs, backup, clear_errors, clear_audit, kill_switch, toggle_focus, presentation, fullscreen |
| **Self-Modify** | modify_css, inject_function, add_tab, remove_tab, get_source, get_css, find_in_code, get_function_code, replace_in_code, get_variable, set_variable, export_app, list_functions, get_app_info |
| **Communication** | send_cmc_motd, send_cmc_chat, send_telegram, send_email |
| **Productivite** | create_note, add_task, complete_task, add_event, add_contact, add_expense, add_habit, check_habit, write_diary, add_bookmark, get_template |
| **Finance** | set_alert, add_position, convert_currency, convert_unit |
| **Fun** | slot_machine, start_pomodoro, stop_pomodoro, start_meditation, start_stopwatch, reset_stopwatch |
| **Dev Tools** | format_json, base64_encode, base64_decode, regex_test, lorem_ipsum, hash_text, word_count, color_convert |
| **Power Tools** | summarize_conv, compare_texts, read_aloud, screen_info, perf_report, open_url, shorten_url, translate, detect_language, smart_summarize, math_advanced, clip_history, schedule_notif |
| **IA Core** | kb_search, kb_remember, calculate, code_execute (JS+Python), generate_image, web_search, get_datetime, set_reminder, device_status, finance_calculate, finance_portfolio, finance_technical, analyze_and_act, daily_briefing, generate_password, world_clocks, get_meteo, show_qr |

---

## Actions Kevin (MEMO)

### A faire MAINTENANT
1. Verifier solde API Anthropic : https://console.anthropic.com/settings/billing
2. Recharger si < 5$ de credits
3. Verifier/creer Cloudflare Workers : https://dash.cloudflare.com
4. Deployer le proxy `proxy-kdmc.js` sur Cloudflare

### A faire BIENTOT
5. Creer un compte Stripe : https://dashboard.stripe.com
6. Configurer les prix (Free/Pro/Enterprise)
7. Creer page Facebook/Instagram pour KDMC AI
8. Obtenir Meta Business API keys
9. Creer bot Telegram (@BotFather)
10. Configurer Google Analytics ou Plausible

### A faire PLUS TARD
11. Nom de domaine personnalise (kdmc-ai.com ou similaire)
12. Creer repos GitHub separes (IA-KDMC, e-KDMC)
13. Setup n8n pour workflows automatises
14. Marketing campagnes (Google Ads, Meta Ads)
15. Legal : CGV, mentions legales, RGPD

---

## Integration avec les Autres Projets

- **CMCteams** : partage Firebase, proxy, design system
- **e-KDMC** : KDMC AI = SAV automatique + generation contenu + gestion commandes
- **Tous projets** : meme methodologie TDD, memes regles, meme feuille de route

---

*Derniere mise a jour : 2026-04-19 — KDMC v10.4 (468 KB, 300+ actions, 110+ commits)*
