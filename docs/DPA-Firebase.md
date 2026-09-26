# DPA — Data Processing Agreement Firebase Realtime Database

**Version** : 1.0 (2026-04-30)
**Apex AI** : v12.537+
**Article référence** : RGPD Art. 28

## 1. Parties

- **Responsable de traitement** : Kevin DESARZENS (KDMC), Monaco
- **Sous-traitant** : Google LLC (Mountain View, CA, USA)
- **Service** : Firebase Realtime Database (`kdmc-clients-default-rtdb.firebaseio.com`)

## 2. Nature et finalité

- **Nature** : Sync cross-device des données partagées admin Kevin
- **Finalité** : Continuité expérience entre iPhone, iPad, Mac
- **Catégories** : Settings admin, KB facts, audit logs, lessons learned, conversations admin (PAS user-specific depuis v12.535)
- **Durée** : 30 jours après dernière connexion

## 3. Sous-traitants

Google Cloud Platform :
- Région data : ⚠️ **NON VÉRIFIÉE — voir l'encadré ci-dessous. Ne pas s'appuyer sur ce document
  pour affirmer que les données restent en Europe tant que la région n'est pas confirmée.**
- CDN : Google Cloud CDN

> ### ⚠️ Contradiction relevée le 6.09.2026 — la région annoncée n'est pas prouvée
>
> Ce document affirmait « `europe-west1` (Belgique) ✅ EU » et en tirait, au §7, « pas de
> transfert hors EU ». **Cette affirmation n'est pas vérifiée, et l'adresse citée par ce
> document même la contredit.**
>
> Ce qui est **mesuré** (pas supposé) :
> - Le code **déployé** appelle `kdmc-clients-default-rtdb.firebaseio.com`
>   (`index.html:6545`, `apex-ios-companion/capacitor.config.ts:31`,
>   `.github/workflows-desactives/claude-todo-watcher.yml`).
> - Un relevé Lighthouse réel (`apex-ai/v13/lighthouse-v13.3.73.json`) montre une requête
>   **aboutie** vers `https://kdmc-clients-default-rtdb.firebaseio.com/.json?shallow=true` :
>   cette adresse **répond**.
> - D'autres fichiers annoncent au contraire `kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app`
>   (`archives/FIREBASE_ROADMAP.md:16`, `_archive_v12/apex-v12-index.html:33668`).
>
> Pourquoi c'est important : chez Firebase Realtime Database, le domaine historique
> `<nom>.firebaseio.com` correspond à la région **us-central1** ; une base **europe-west1**
> s'adresse en `<nom>.europe-west1.firebasedatabase.app`. Les deux formes coexistent donc ici
> pour la **même** base, et c'est la forme américaine qui est réellement appelée en production.
>
> **Je ne peux pas trancher depuis ce dépôt** (aucun accès réseau à la console Google), donc je
> n'affirme **ni** que les données sont aux États-Unis, **ni** qu'elles sont en Europe.
>
> **Vérification en 1 clic (Kevin)** : ouvrir
> [la console Firebase de `kdmc-clients`](https://console.firebase.google.com/project/kdmc-clients/database/kdmc-clients-default-rtdb/data)
> — la région est affichée à côté du nom de la base.
> - Si c'est **europe-west1** → l'adresse `firebaseio.com` du code est à corriger partout, et ce
>   document redevient exact.
> - Si c'est **us-central1** → les données partent hors UE : ce DPA doit être réécrit (clauses
>   contractuelles types, mention du transfert), et la base doit être migrée si on veut l'EU.
>
> À ne pas confondre : la base **CMCteams** (`cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app`)
> porte bien la forme européenne — c'est la base **`kdmc-clients`** (Apex) qui est en cause ici.

## 4. Mesures techniques

### Chiffrement
- **Transport** : TLS 1.3
- **Repos** : Google chiffre tout au repos (AES-256)

### Contrôle d'accès
- Apex : accès via SDK Firebase avec **auth anonyme obligatoire** (`auth != null`) — en lecture ET en écriture selon le chemin ; aucun accès sans auth
- Admin Kevin : write via SDK Firebase + auth optionnelle
- Firebase Rules à durcir Phase 5 : `.read: auth.uid === $uid`

### Anti-fuite cross-user (v12.272 + v12.298 + v12.535)
- `FB_LOCAL` strict : 30 keys per-device (PIN, settings, theme, sessions)
- `FB_LOCAL_PREFIXES` : 17 patterns per-user (`ax_user_chat_`, `ax_user_locations_`, etc.)
- `FB_FIX` : seulement données vraiment shared admin

## 5. Droits des personnes

| Droit | Implémentation |
|---|---|
| Accès | `axExportMyDataRGPD()` lit Firebase via fbLoadAll |
| Effacement | `axDeleteAccountTotal()` + delete Firebase keys |
| Portabilité | Export JSON full Firebase |

## 6. Notification de violation

Firebase déclare les breaches sur https://status.firebase.google.com.
Apex relais via `axDetectPotentialBreach()` + `axNotifyKevin()`.

## 7. Transferts

- ⚠️ **Région NON CONFIRMÉE** (voir l'encadré du §3, 6.09.2026) : l'affirmation « pas de
  transfert hors EU » reposait sur une région annoncée que l'adresse réellement appelée en
  production contredit. **Tant que la console Firebase n'a pas été ouverte, ce point est à
  considérer comme non établi.**
- Métadonnées Google (logs, auth) peuvent transiter US : SCC + Privacy Shield successor

## 8. Audit

- Google Cloud publie SOC 1/2/3 + ISO 27001/27017/27018 + GDPR
- DPA Firebase : https://firebase.google.com/terms/data-processing-terms

---

**Statut** : Document de référence v1.0.
