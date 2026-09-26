# 03 — FINDINGS CLASSÉS · Audit 2026-08-09

## ✅ Corrigé pendant cet audit (mergé sur `main`, PR #3280)

| # | Finding | Preuve | Correctif |
|---|---|---|---|
| F1 | **Code admin en clair dans 7 endroits servis** — dont le **texte visible de l'accueil public**, et le **prompt système d'Apex** (donc envoyé aux IA tierces à chaque requête) | 7 fichiers, vérifiés un par un | Retiré partout · **0 occurrence** dans le code servi (mesuré) · garde `test:no-pin-leak` par **empreinte** |
| F2 | **Règle absolue n°1 morte en silence** — `vVerify` faisait `.toUpperCase()` sur un objet → contrôle jamais exécuté, écran « ok » mensonger | `index.html:24660` vs écriture `:40194` | Lecture corrigée · échec rendu **visible** · test `test:planning-guarantee` qui **exécute** |
| F3 | Code famille dans le source de l'arbre | `arbre/index.html:261` | Commentaire retiré (**partiel** : le code est un nom présent 145× dans les données) |
| F4 | Cap de skills Apex à 45 pour 57 fichiers → **12 skills perdus en silence** | mesuré (270 Ko au total) | Cap relevé à 80 |

> ⚠️ **F1 impose une action que je ne peux pas faire** : le code a été **public**, donc il est **compromis**. Le retirer ne l'annule pas — **il doit être changé**, et il est réutilisé dans plusieurs apps.

---

## 🔴 P0 restants — à traiter en priorité (je n'ai pas patché à l'aveugle des workers live non testables)

| # | Où | Problème | Correctif proposé |
|---|---|---|---|
| P0-a | `sync-apex-secrets-to-cf-worker.yml:283` (apex-secrets-proxy, **live**) | Proxy vers **toutes** tes clés (dont l'**API Cloudflare** et Railway) derrière un PIN **sans limite de tentatives**, et **`return true` si le PIN n'est pas configuré** | Retirer `cloudflare`/`railway`/`jwt` du proxy · jeton aléatoire ≥128 bits · limite de tentatives · **supprimer le fail-open** |
| P0-b | `services/kdmc-crea-famille/worker.js:71` (**live**) | Devient admin quiconque **tape ton nom** → lit les photos/messages de **toutes** les familles | Dériver l'admin d'un **secret**, jamais du nom |
| P0-c | `messaging-app/workers/api-worker.js:692,759` | Porte dérobée OTP → JWT admin **30 jours** sans SMS | Supprimer la branche, vrai OTP + secret hors-bande |
| P0-d | `firebase-rules-apex.json:106,110,120,130,147` | `orders`, `products`, `logos`, `selection` **lisibles (et souvent inscriptibles) par tout le monde** → CA, commandes, catalogue et sourcing publics | Passer en `auth != null` + écriture via worker authentifié. **Attention** : durcir peut casser les boutiques → à faire avec un test avant/après |
| P0-e | `shops/la-detente/worker-order/worker.js:56,144,162` | Commande/paiement Printify déclenchables par un tiers ; `/cost` crée un vrai produit | Signature HMAC horodatée |
| P0-f | `chez-lolo/index.html:561` | Commande poussée en production **avant** encaissement | Ne créer la commande qu'au `payment_succeeded` |
| P0-g | `tools/departs/index.html:632` | Admin = une classe CSS → une ligne en console suffit | Adosser au SSO serveur |
| P0-h | `tools/approvals/index.html:500,507` | Le premier venu crée le code ; la clé du coffre est publique | Exiger l'extension PRF WebAuthn (comme le coffre-fort) |
| P0-i | `shops/dashboard` | Porte 100 % client alors que la donnée est publique en amont | Corrigé par P0-d |

## 🟠 P1
- Apex : **9,46 Mo de sourcemaps** publiées (code source lisible) — 1 ligne à changer dans le déploiement.
- Apex : passphrase du coffre en clair à côté du chiffré.
- Apex Chat : clé privée E2E en clair (le coffre PIN existe mais **son import est commenté**).
- CMCteams : `_postValidateImport` ne compare pas aux noms du PDF ; XSS stocké `index.html:4599` ; CSP avec `'unsafe-inline'`.
- Arbre : lecture possible sans passer par la page (auth anonyme).
- Coffre-fort : sauvegardes R2 écrasables/supprimables par un tiers.
- Pages : **aucune CSP** sur worldmonitor / osint / clone / outils.

## 🟡 P2 (extrait)
Leaflet/satellite.js sans `integrity` · 10 routes Apex sans entrée UI · 23 services Apex morts · budget bundle CI non bloquant · 92 boutons < 44 px sur CMCteams · `boards-gen.js` 257 Ko pour 2 lignes · « santé live des workers » = fichier statique · laissez-passer admin en `localStorage`.

---

## 🧭 À TRANCHER PAR TOI (pas un bug — un conflit entre deux de tes consignes)
**Apex : quelle IA par défaut ?**
- Ta règle absolue : « Anthropic reste l'IA principale, **ne jamais changer le défaut** ».
- Le code actuel (`ai-routing-policy.ts:255`) : défaut admin = « gratuit d'abord », mis en place **à ta demande** (« privilégie les IA gratuites suivant les questions »).
- **Comportement réel mesuré** : une question générique part chez **Gemini**, Anthropic en second.
- Deux options : (1) revenir à Anthropic toujours ; (2) garder « gratuit d'abord » et **mettre à jour la règle** pour qu'elles cessent de se contredire.
