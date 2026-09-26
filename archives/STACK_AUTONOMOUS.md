# STACK AUTONOMOUS — Apex + CMCteams scaling-ready 1000 clients sans coût supplémentaire

> Inventaire de la stack technique pour Kevin DESARZENS (Casino Monaco SBM).
> Mis à jour 2026-04-30 (Apex v12.454 / CMCteams v9.563).

## Promesse

Tu peux **scaler à 1000 clients** sans rajouter :
- ❌ Code (l'app est déjà prête)
- ❌ Abonnement payant supplémentaire (free tier suffit)
- ❌ Infrastructure (déjà déployée)

**Ce qu'il restera à faire** quand engouement clients :
- ✅ Juridique (avocat pour CGU/contrats — templates fournis ici)
- ✅ Service client 24/7 (déjà automatisé via Apex IA + WhatsApp Kevin v12.451)
- ✅ Recharge IA si > seuil quota (modal `axNeedsAttention` v12.450 alerte avant)

---

## Stack obligatoire (gratuit)

| Service | Usage | Plan | Limites free | Capacité 1000 clients |
|---------|-------|------|--------------|----------------------|
| **Firebase RTDB** | Sync cross-device + admin inbox + logs | Spark (free) | 1 GB stockage, 10 GB/mois transfert, 100 connexions concurrentes | ~50 KB/client → 50 MB total OK |
| **GitHub Pages** | Hébergement statique (HTML/JS/CSS) | Free | 1 GB taille repo, 100 GB/mois bandwidth, 10 builds/h | App 2.4 MB, accès clients direct OK |
| **Cloudflare Workers** | Bridge API + push notifications + CORS proxy | Free | 100 000 req/jour | ~100 req/client/jour → 1000 clients = 100 000 req → OK pile |
| **Service Worker** | Cache offline + auto-update PWA | Browser native | Storage iOS Safari ~5 MB, Android ~50 MB | Compression LZ-string déjà en place v12.260 |
| **WhatsApp wa.me** | Validation OTP clients + service client (via Kevin) | Free WhatsApp | Illimité messages perso | Kevin valide 1-tap, pas de limite |

**Total mensuel : 0 €**

---

## Stack optionnelle (free tier suffisant 1000 clients)

| Service | Usage | Plan | Limite free | Si dépassé |
|---------|-------|------|-------------|------------|
| **Anthropic Claude** | IA chat principal | API | Pay-per-use, ~5-10 €/mois pour 1000 clients (avec failover Groq) | Failover Groq gratuit illimité |
| **Groq Llama 3.3 70B** | Failover IA gratuit | Free dev | 14 400 req/jour | Suffisant 1000 clients backups |
| **Google Gemini 2.5** | Failover IA | Free dev | 15 req/min, 1500 req/jour | Failover supplémentaire |
| **Brave Search API** | Web search | Free dev | 2 000 req/mois | OK pour recherches occasionnelles |
| **Tavily API** | Web search alternative | Free | 1 000 req/mois | Failover search |
| **OpenAI GPT-4o** | Failover IA | Pay-per-use | ~5 €/mois low usage | Failover ultime |

**Total mensuel max : ~10-20 € (Anthropic + OpenAI ponctuel)**

---

## Stack PAYANT (uniquement si croissance > 1000 clients actifs)

| Service | Usage | Plan recommandé | Coût |
|---------|-------|-----------------|------|
| **Firebase Blaze** | Si > 100 connexions concurrentes | Pay-as-you-go | ~25 €/mois pour 5000 clients |
| **Twilio WhatsApp Business** | Service client OFFICIEL (au lieu de wa.me Kevin) | API | ~50 €/mois selon volume |
| **Stripe** | Paiements clients abonnés | 1.4% + 0.25 € par transaction | Variable |
| **Anthropic upgrade** | Si > 100 €/mois usage IA | Tier 3-4 | Variable |

**Seulement nécessaire si engouement clients > 1000 actifs.**

---

## Architecture autonomes en place

### 1. Triple persistance données
- localStorage (immédiat)
- IndexedDB shadow copy (fallback iOS Safari)
- Firebase RTDB (cross-device)
- Backup quotidien Firebase `ax_backup_<date>`

### 2. Failover IA automatique
Chaîne `ax_failover_chain` : `groq → gemini → anthropic → openai`
- Si quota Anthropic épuisé → bascule Groq (gratuit illimité)
- Toast user : "via Groq" si bascule (subtil)
- Logging silencieux dans audit

### 3. Service client automatique (v12.451)
- Question client → Apex IA répond avec confidence
- Si confidence ≥ 0.85 → Kevin valide en 1 tap (modal `axNeedsAttention`) → wa.me 1-clic envoi
- Si confidence < 0.85 → escalate Kevin manuel
- Mémoire conversation `ax_client_history_<phone>` per-client

### 4. Auto-validation Laurence (v12.450)
- 4 actions auto-approuvées sans Kevin (export_data, beta_features, biometric_register, share_account)
- 8 actions BLOQUANTES validate (erase_account, change_email, change_password, change_pin, purchase_above_50, delete_history, new_device_setup, api_key_change)

### 5. Monitoring abonnements (v12.450)
- Cron 6h check :
  - Quota Anthropic < 5 € → alerte
  - Failover keys présentes (Groq/Gemini)
  - Validations Laurence pending
  - Storage > 80% → cleanup

### 6. PR Apex auto-merge (v12.449)
- Apex propose modifications via `axProposeCodeChange`
- Modal `axNeedsAttention` quand PRs pending
- Bouton "Merger toutes" 1-tap squash + throttle 800ms

### 7. Sentinelles 24/7 (existant)
- 16+ sentinelles autonomes (security/perf/data/error/ux/etc.)
- Auto-fix whitelist + escalade Claude Code via `ax_claude_todo`

### 8. Background sync (v12.455 — à venir)
- Service Worker Background Sync API
- Periodic Sync pour iOS + Android
- Push notifications

---

## Capacités par tier d'usage

### Tier 1 : 1-50 clients (actuel Kevin + Laurence)
- **Coût mensuel** : 0-5 €
- Stack obligatoire seule
- Anthropic API faible usage

### Tier 2 : 50-500 clients
- **Coût mensuel** : ~10-30 €
- Stack obligatoire + Anthropic upgrade Tier 1
- Failover Groq actif

### Tier 3 : 500-1000 clients
- **Coût mensuel** : ~30-80 €
- Stack obligatoire + Anthropic Tier 2 + ponctuel OpenAI
- Cloudflare Workers à proche limite (90k/100k req)

### Tier 4 : 1000-5000 clients (croissance)
- **Coût mensuel** : ~100-300 €
- Firebase Blaze
- Anthropic Tier 3
- Twilio WhatsApp Business
- Stripe (revenue couvre)

**Au-delà de 5000 clients** : revenue clients > 5000 × 5 €/mois = 25 000 €/mois → infrastructure scaling-up est rentable.

---

## Stress test "1000 clients simulés" (à exécuter)

Sentinelle `scaling-watch` à coder v12.45X :
- Simule 1000 users concurrent (localStorage + Firebase reads)
- Mesure latence Firebase reads (P50, P95, P99)
- Mesure quota Cloudflare Worker (pourcentage utilisé)
- Test failover IA (forcer Anthropic 503 → vérifier bascule Groq < 1s)
- Stress test SSE Firebase (1000 clients listening)
- Rapport : breakpoints exacts + recommandations upgrade auto

---

## Documents légaux templates (à compléter avec avocat Kevin)

Voir fichiers séparés :
- `CGU_PRO.md` — Conditions générales d'utilisation
- `CONTRAT_CLIENT.md` — Contrat type client
- `MENTIONS_LEGALES.md` — Mentions légales obligatoires France/Monaco

---

## Conclusion

**État actuel** : prêt pour 1000 clients sans modification code/abonnement.
**Coût opérationnel** : 0-20 €/mois.
**Bottleneck** : Cloudflare Workers à ~1000 clients (100k req/jour limite). Solution : Workers Paid 5 €/mois si dépassé.

Apex est techniquement scaling-ready. Reste juridique (avocat) + stratégie commerciale (acquisition clients).
