---
name: security-suite
description: >
  Arsenal sécurité (les outils OSS des pentesters éthiques) appliqué UNIQUEMENT
  aux propres apps de Kevin (kd-mc.com / ce repo) : gitleaks + TruffleHog (secrets),
  OSV-Scanner + Trivy (dépendances/IaC), Semgrep (SAST XSS/injections), zizmor
  (durcissement GitHub Actions). Installé le 2026-07-07 (« récupère tous les outils
  des hackers et installe dans Apex »). Audit AUTORISÉ sur son domaine — jamais un tiers.
---

# Security Suite — arsenal hacker éthique (défensif + statique)

Suite gratuite/OSS que les pentesters utilisent, exécutée sur le **runner CI**
(egress + binaires dispo). Complète Strix (pentest IA dynamique, `strix-scan.yml`)
par les scans **statiques** rapides. Non-bloquant : c'est un **rapport**, pas un gate.

## 🧰 Outils

| Catégorie | Outils | Trouve |
|---|---|---|
| 🔑 Secrets | gitleaks (historique git) + TruffleHog (vérifiés = actifs) | clés Anthropic/Firebase/aisstream exposées |
| 📦 Dépendances | OSV-Scanner + Trivy (fs/IaC/SBOM) | CVE des npm workers/tests |
| 🧬 Code (SAST) | Semgrep (`p/default p/javascript p/xss p/secrets`) | XSS, injections — complète esc()/CSP |
| ⚙️ Workflows | zizmor | injection/secrets/pinning dans .github/workflows |

## 🚀 Lancer

```
mcp__github__actions_run_trigger  workflow_id: security-suite.yml  ref: main
```
Aussi : **cron hebdo** (dimanche 3h UTC = veille auto, anti-spam) + `repository_dispatch`
`security-suite` (Apex, commande **/audit**).

Résultat : artifact `security-report-*` (JSON par outil) + résumé Firebase
**`/apex/ax_security_last`** (`{total, by_tool, tools, ts}`) → Apex le lit, Kevin
voit l'état sécu dans son chat.

## 🤖 Depuis Apex

Commande **`/audit`** → `claudeBridge.dispatchWorkflow('security-suite')` →
repository_dispatch → réponse dans `ax_security_last`.

## 🛡 Sécurité (règles CLAUDE.md)

- `permissions: contents: read` ; secrets Firebase QUE sur le step de push.
- Tous les outils en `continue-on-error` (un scan qui plante n'arrête pas les autres).
- Périmètre = ce repo (les apps de Kevin) — pas de scan d'un tiers.
