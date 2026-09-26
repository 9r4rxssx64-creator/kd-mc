# DPA — Data Processing Agreement Anthropic Claude API

**Version** : 1.0 (2026-04-30)
**Apex AI** : v12.537+
**Article référence** : RGPD Art. 28 (sous-traitance)

## 1. Parties

- **Responsable de traitement** : Kevin DESARZENS (KDMC), Monaco
- **Sous-traitant** : Anthropic PBC (San Francisco, CA, USA)
- **Service** : Claude API (claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-7)

## 2. Nature et finalité du traitement

- **Nature** : Traitement IA conversationnel (génération de texte par modèle de langue)
- **Finalité** : Assistant personnel intelligent (chat, recherche, synthèse, traduction)
- **Catégories de données** : Textes utilisateurs, fichiers uploadés (images, PDF), historique conversations
- **Durée** : Le temps de la requête API (pas de stockage persistant côté Anthropic selon ZDR Anthropic)

## 3. Sous-traitants ultérieurs

Anthropic infrastructure :
- AWS (data centers US, EU)
- Cloudflare (CDN, DDoS protection)

Apex utilise un proxy Cloudflare Worker (`ax_proxy_url`) optionnel pour masquer l'IP utilisateur.

## 4. Mesures techniques et organisationnelles (Art. 32)

### Chiffrement
- **Transport** : TLS 1.3 (HTTPS obligatoire pour `api.anthropic.com`)
- **Repos** : API keys chiffrées AES-GCM 256 (PBKDF2 100k iterations) côté client (v12.529)

### Contrôle d'accès
- API key Anthropic stockée localement (chiffrée v12.536+)
- Pas de stockage cloud des conversations utilisateurs (Apex local-first)

### Auditabilité
- Logs locaux : `ax_audit`, `ax_security_log`, `ax_handoff_journal`
- Pas de PII exfiltré : `_sanitizeSecrets()` filtre avant escalade Claude Code

## 5. Droits des personnes (Art. 12-22)

| Droit | Implémentation Apex |
|---|---|
| Information (Art. 13) | `privacy.html` listant Anthropic comme sous-traitant |
| Accès (Art. 15) | `axExportMyDataRGPD()` export JSON complet |
| Rectification (Art. 16) | UI "Modifier profil" |
| Effacement (Art. 17) | `axDeleteAccountTotal()` purge LS + IDB + Firebase |
| Portabilité (Art. 20) | Export JSON structuré |
| Opposition (Art. 21) | Toggle off chat IA dans Settings |

## 6. Notification de violation (Art. 33)

- **Délai** : < 72h après prise de connaissance
- **Helper** : `axBreachNotification(eventType, details)` avec sévérité critical
- **Destinataires** : Kevin (admin) + CNIL/APDP si données utilisateurs EU

## 7. Transferts internationaux (Art. 44-49)

- Anthropic = USA (transfert non-EU)
- **Base légale** : Standard Contractual Clauses (SCC) UE → USA (Décision UE 2021/914)
- **Mesure additionnelle** : Apex local-first (données utilisateurs ne sortent du device qu'au moment requête API)

## 8. Audit & contrôle

- Anthropic publie SOC 2 Type II annuel : https://trust.anthropic.com
- ISO 27001 certifié
- DPA officiel Anthropic disponible : https://www.anthropic.com/legal/dpa

## 9. Durée et fin du contrat

- **Durée** : Tant que Apex utilise Claude API
- **Fin** : Suppression `ax_api_key` + révocation côté console.anthropic.com
- **Données** : Anthropic n'a aucune donnée Apex à supprimer (pas de stockage)

---

**Statut** : Document de référence v1.0. À mettre à jour si Anthropic change ses CGU/DPA.
**Source CGU** : https://www.anthropic.com/legal/commercial-terms
**Source DPA** : https://www.anthropic.com/legal/dpa
