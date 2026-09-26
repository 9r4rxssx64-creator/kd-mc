# Politique de Cookies — Apex AI

**Version :** v13.0.82
**Dernière mise à jour :** 2026-05-04
**Conformité :** Directive ePrivacy 2002/58/CE, Loi Informatique et Libertés Art. 82, Lignes directrices CNIL 2020-091

---

## 1. Qu'est-ce qu'un cookie ?

Un cookie est un petit fichier texte stocké par votre navigateur lorsque vous visitez un site web. Il permet au site de mémoriser des informations (préférences, session, panier, etc.) entre les visites.

Apex AI utilise également des technologies similaires : **localStorage**, **IndexedDB**, **Service Worker cache**, **Session Storage**.

## 2. Catégories de cookies utilisés

### 2.1 Cookies essentiels (techniques)
**Pas de consentement requis** (exemption Art. 82 LIL — strictement nécessaires au service).

| Nom | Type | Finalité | Durée |
|-----|------|----------|-------|
| `apex_v13_user` | localStorage | Identité utilisateur connecté | Session |
| `apex_v13_uid` | localStorage | UID utilisateur | Session |
| `apex_v13_lastact` | localStorage | Heartbeat session (anti-timeout) | 8h |
| `apex_v13_pin_<uid>` | localStorage | PIN haché (PBKDF2) | Tant que compte |
| `apex_v13_session_token` | sessionStorage | Token CSRF | Session |
| `apex_v13_audit_log` | localStorage | Audit trail (obligation légale) | 5 ans |
| Service Worker cache | SW Cache | Mode offline (PWA) | 30 jours |
| Firebase auth | localStorage | Token Firebase | 1h (refresh) |

### 2.2 Cookies de préférences
**Consentement requis** (mais opt-in au premier choix).

| Nom | Type | Finalité | Durée |
|-----|------|----------|-------|
| `apex_v13_theme` | localStorage | Thème dark/light | 1 an |
| `apex_v13_locale` | localStorage | Langue préférée (fr/en/it/es/de) | 1 an |
| `apex_v13_voice_prefs` | localStorage | Voix sélectionnée (50+) | 1 an |
| `apex_v13_layout_prefs` | localStorage | Densité interface | 1 an |
| `apex_v13_cookies_accepted` | localStorage | Marqueur consentement bandeau | 13 mois |

### 2.3 Cookies analytics
**Consentement requis** (granular opt-in).

| Nom | Type | Finalité | Durée |
|-----|------|----------|-------|
| `apex_v13_analytics_id` | localStorage | ID anonymisé pour stats | 13 mois |
| `apex_v13_perf_metrics` | localStorage | Métriques performance (LCP, FID, CLS) | 30 jours |

### 2.4 Cookies marketing
**Aucun cookie marketing utilisé actuellement.** Si Apex AI en intègre à l'avenir (publicité, remarketing), un nouveau consentement granulaire sera demandé.

### 2.5 Cookies tiers
| Tiers | Finalité | Politique |
|-------|----------|-----------|
| **Stripe** | Paiement sécurisé | https://stripe.com/cookies-policy |
| **Anthropic** | API IA (côté serveur, pas de cookie navigateur) | https://www.anthropic.com/privacy |
| **Firebase** | Auth + RTDB | https://firebase.google.com/support/privacy |
| **Cloudflare** | CDN, Workers | https://www.cloudflare.com/cookie-policy/ |

## 3. Gestion des cookies

### 3.1 Bandeau de consentement
Au premier accès, un bandeau permet de :
- ✅ Tout accepter
- ❌ Tout refuser (sauf essentiels)
- ⚙️ Personnaliser par catégorie

### 3.2 Modifier vos choix à tout moment
Réglages → RGPD → Préférences cookies

### 3.3 Bloquer via le navigateur
Vous pouvez bloquer/effacer les cookies via les paramètres de votre navigateur :

- **Chrome** : Paramètres → Confidentialité et sécurité → Cookies
- **Safari** : Préférences → Confidentialité
- **Firefox** : Options → Vie privée et sécurité
- **Edge** : Paramètres → Confidentialité

⚠️ Bloquer les cookies essentiels rendra le Service inutilisable (impossible de se connecter).

### 3.4 Opt-out global "Do Not Track"
Apex AI respecte le signal `Do Not Track` (DNT) si activé dans votre navigateur. Tous les cookies non-essentiels seront bloqués.

## 4. Durée de conservation

Conformément à la recommandation CNIL, le consentement est valable **13 mois maximum**. Après cette durée, le bandeau réapparaît automatiquement.

## 5. Sécurité des cookies

- Tous les cookies sont **HttpOnly** quand applicable.
- Flag **Secure** activé en HTTPS.
- Flag **SameSite=Strict** ou **Lax** pour anti-CSRF.
- localStorage sensible chiffré AES-GCM 256.

## 6. Mise à jour de la politique

Apex AI peut mettre à jour cette politique. Les modifications majeures (nouveau cookie tiers, nouvelle finalité) déclenchent un nouveau consentement.

## 7. Contact

Questions cookies : kevin.desarzens@gmail.com
Réclamation CNIL : https://www.cnil.fr/fr/cookies-et-autres-traceurs

---

*Conforme aux lignes directrices CNIL 2020-091 (cookies) + Directive ePrivacy + RGPD.*
