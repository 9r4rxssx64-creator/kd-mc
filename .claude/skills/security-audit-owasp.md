---
name: security-audit-owasp
description: Audit securite complet OWASP ASVS L2 + Top 10 + scan secrets/XSS/SQLi/CSRF. Score chiffre /100 et liste P0/P1/P2/P3 des findings avec CVSS.
when_to_use: Apres tout changement auth, vault, paiement, API publique, gestion sessions, upload fichiers. Avant chaque release prod. Sur demande "audit secu" ou "OWASP".
model: opus
allowed_tools: [Read, Grep, Glob, Bash, Edit]
---

# Skill: Security Audit OWASP ASVS L2

## Mission

Auditer la securite d'un module/feature/release au niveau OWASP ASVS L2 avec score /100 reproductible (5 axes ponderes) et liste detaillee P0/P1/P2/P3 des findings avec CVSS 3.1.

Sortie obligatoire : rapport Markdown structure + scoring sans complaisance + plan de remediation priorise. Pas de "ca devrait aller" - chaque assertion grep/code-cite.

Reference Kevin : "Audit honnete sans complaisance. Si estimation interne 96/100 et audit externe 54/100, ecart 42 points = signal critique de biais auto-evaluation." (CLAUDE.md erreur #DECLARATION ≠ DEPLOYMENT)

## Pre-requis

- [ ] Avoir lu CLAUDE.md (regles 100/100 reel + DECLARATION ≠ DEPLOYMENT + erreurs connues #1-#52)
- [ ] Lire AUDIT_TEMPLATE_PRO.md a la racine si present
- [ ] Connaitre le module cible (apex-ai/ ou racine CMCteams)
- [ ] Acces outils Grep, Read, Bash (node, openssl, curl)

## Etapes (workflow 6 phases)

### Phase 0 - Setup (3 min)

1. Identifier le scope precis : fichier(s), feature(s), commit(s)
2. Lire CLAUDE.md sections "Erreurs connues" + "Lessons learned"
3. Note l'APP_VER courant et le hash commit pour tracabilite

```bash
git log -1 --format="%H %s" && grep "APP_VER" apex-ai/index.html | head -1
```

### Phase 1 - Scan automatique secrets/XSS/CSRF (10 min)

```bash
# Scan secrets en clair (API keys, tokens, passwords)
grep -nE '(sk-ant-api[0-9]+|sk-[A-Za-z0-9]{40,}|AIza[A-Za-z0-9_-]{33}|ghp_[A-Za-z0-9]{36}|pat[A-Za-z0-9]{30,})' apex-ai/index.html | grep -v '_PATTERNS\|regex\|EXAMPLE'

# innerHTML sans esc()
grep -n 'innerHTML\s*=' apex-ai/index.html | grep -v 'esc(' | grep -v '/\*\|//' | head -30

# eval / Function constructor
grep -nE '\b(eval|Function)\s*\(' apex-ai/index.html | head -10

# postMessage sans origin check
grep -B2 -A5 'addEventListener.*"message"' apex-ai/index.html | grep -v 'origin' | head -20

# localStorage avec donnees sensibles non chiffrees
grep -nE 'localStorage\.setItem\([^)]*(password|token|key|secret|cb|carte|cvv)' apex-ai/index.html

# CSP meta tag
grep -nE 'Content-Security-Policy' apex-ai/index.html
```

### Phase 2 - Audit ASVS L2 par chapitre (20 min)

Verifier chaque chapitre ASVS L2 :

| Chapitre ASVS | Verifications cles |
|--------------|--------------------|
| V2 Auth | PIN hash (PBKDF2 ≥100k iter), rate-limit progressif, session TTL, MFA dispo |
| V3 Sessions | TTL, regeneration ID au login, invalidation logout, secure flag |
| V4 Access Control | Guards admin sur fonctions destructrices, DoS protection, CSRF tokens |
| V5 Validation | esc() partout, sanitization HTML, MIME type check uploads |
| V6 Cryptography | AES-GCM 256, IV unique, PBKDF2 200k+, pas MD5/SHA1 |
| V7 Errors | Pas de stack trace exposee user, log sans PII |
| V8 Data Protection | PII redaction dans logs, chiffrement at-rest, RGPD erase |
| V9 Communications | HTTPS only, HSTS, pas de tokens en query string |
| V10 Malicious | Pas eval/Function, validation chargements externes |
| V11 Business Logic | Workflow integrity, no race conditions, rate-limit |
| V12 Files | Sanitize filename, MIME check, size limit, no exec |
| V13 API | Rate-limit, auth required, schema validation |
| V14 Config | Pas de console.log secrets, headers secu, CSP strict |

Pour chaque chapitre : grep + Read code + verdict OK/PARTIEL/KO + score 0-10.

### Phase 3 - Scoring 5 axes ponderes (5 min)

```
Securite                25% (chapitres V2-V14 ASVS)
Conformite              20% (RGPD, audit log, redaction PII)
Architecture            20% (separation concerns, no Declaration ≠ Deployment)
Code quality            20% (esc partout, guards, no eval)
Data integrity          15% (chiffrement, backup, atomicite)
```

Score global = sum(axe_i * poids_i) / 100. Cap 100, jamais Math.max() trichage.

### Phase 4 - Findings structures (10 min)

Pour chaque issue : `{id, severity, cvss, cwe, location, description, exploit_scenario, remediation, effort}`.

Severites :
- **P0 Critical** (CVSS ≥ 9.0) : exploit immediat, fix avant prod
- **P1 High** (7.0-8.9) : exploit possible, fix sous 24h
- **P2 Medium** (4.0-6.9) : risque moyen, fix sous 7j
- **P3 Low** (< 4.0) : amelioration, fix sous 30j

### Phase 5 - Verdict production-ready

```
≥ 80/100 → OUI (deploy ok)
65-79    → SOUS CONDITION (fix P0/P1 d'abord)
< 65     → NON (refonte requise)
```

### Phase 6 - Rapport Markdown formel

Structure obligatoire :
1. Resume executif (3-5 lignes + score global + verdict)
2. Methode (chapitres ASVS audites, outils utilises)
3. Tableau des 5 axes avec scores
4. Findings P0/P1/P2/P3 (un par section)
5. Plan de remediation (qui fait quoi quand)
6. Annexes : grep raw outputs, references CWE/CVE

## Anti-patterns interdits

1. **Score gonfle artificiellement** : `Math.max(80, score)` ou `Math.min(100, score+10)`. Erreur CLAUDE.md "Security Theater". Toujours score brut.
2. **Audit sans grep** : "ca a l'air bon" sans preuve code. Chaque assertion = ligne de code citee.
3. **Skip ASVS chapitres** : tous les V2-V14 doivent avoir verdict, meme si "N/A documentee".
4. **Pas de scenario exploit** : chaque P0/P1 doit avoir un scenario concret "attaquant fait X → obtient Y".
5. **Confondre Declaration et Deployment** : un helper `axRedactSecret` defini mais pas wired = P1, pas P3. Erreur #DECLARATION ≠ DEPLOYMENT.
6. **Auto-validation** : ne JAMAIS scorer son propre code. Toujours subagent independant ou personne tierce.
7. **Reporter sans CWE/CVSS** : sans CWE ID + CVSS vector, finding non actionnable pour developer.

## Validation post-action

```bash
# 1. Le rapport markdown existe et est complet
test -f /tmp/security-audit-$(date +%Y%m%d).md && wc -l /tmp/security-audit-*.md

# 2. Tous les chapitres ASVS V2-V14 sont notes
grep -c "^### V[0-9]" /tmp/security-audit-*.md  # Doit etre >= 13

# 3. Score chiffre sur 5 axes present
grep -E "^- (Securite|Conformite|Architecture|Code quality|Data integrity)" /tmp/security-audit-*.md | wc -l  # Doit etre >= 5

# 4. Findings P0/P1 ont CVSS + CWE + scenario
grep -E "(CVSS|CWE-|Scenario)" /tmp/security-audit-*.md | wc -l

# 5. Verdict production-ready clair
grep -E "(OUI|SOUS CONDITION|NON)" /tmp/security-audit-*.md
```

Resultat attendu : 13+ chapitres notes, 5 axes scored, findings structures, verdict explicite. Si echec : reprendre phase 2-4.

## Exemples concrets

### Exemple 1 : Audit auth Apex v12.241 (post nom+prenom+pass obligatoires)

**Contexte** : Verifier que la regle "PIN per-user vs admin global" (CLAUDE.md erreur #37) est bien wirée partout.

**Action** :
```bash
# Detecter writes a ax_pin (RESERVE admin)
grep -n 'ls\s*(\s*"ax_pin"' apex-ai/index.html | head -20

# Verifier guard userId === ADMIN_ID
grep -B3 'ls\s*(\s*"ax_pin"' apex-ai/index.html | grep -E "(ADMIN_ID|userId\s*===)"

# Verifier PIN per-user dans cle scoped
grep -nE 'ax_pin_[a-z]' apex-ai/index.html | head -10
```

**Resultat** : Si grep ax_pin direct retourne writes sans guard → P0 Critical (CVSS 9.1, CWE-862 Missing Authorization). Reference erreur #37.

### Exemple 2 : Scan secrets fuites dans logs

**Contexte** : Verifier `axRedactOutbound` wired sur tous les call sites IA.

**Action** :
```bash
# 1. Tous les fetch vers apis IA
grep -nE 'fetch\([^)]*(anthropic|openai|google|groq)' apex-ai/index.html

# 2. Pour chaque fetch, verifier axRedactOutbound dans body
# Manuellement Read +/- 20 lignes autour de chaque match
```

**Resultat** : Si un fetch IA n'utilise pas axRedactOutbound → P1 High (CVSS 7.5, CWE-532 Insertion of Sensitive Info into Log). Tokens Kevin peuvent fuiter dans telemetry.

## Integration avec autres skills

- **Avant ce skill** : invoquer `commit-quality-gate` pour avoir un build sain a auditer
- **Apres ce skill si P0/P1 trouves** : invoquer `csp-strict-build` (si CSP issue) ou `vault-encryption-rotate` (si crypto issue)
- **En parallele** : peut tourner avec `perf-budget-check` (subagents independants Phase 1)
- **Suivi** : `subagent-orchestrate` pour valider le fix par 2nd avis externe

## References

- CLAUDE.md "DECLARATION ≠ DEPLOYMENT" + "100/100 REEL"
- AUDIT_TEMPLATE_PRO.md a la racine du repo
- Erreurs connues #37, #38, #40, #41, #42, #44, #47
- OWASP ASVS 4.0.3 : https://owasp.org/asvs/
- CWE Top 25 : https://cwe.mitre.org/top25/
- CVSS 3.1 calculator : https://www.first.org/cvss/calculator/3.1
