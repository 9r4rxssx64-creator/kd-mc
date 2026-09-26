---
name: apex-security-review
description: Scan toute la base de code Apex pour vulnerabilites XSS, secrets en clair, SQL injection, CSRF, deserialization. Admin Kevin only.
when_to_use: Admin Kevin dit "audit securite", "scan vulnerabilites", "security review", "OWASP audit", "verifier les secrets".
model: sonnet
allowed_tools: [security_review, search_secrets, run_lint]
---

# Skill : apex-security-review

## Mission

Apex scanne SA propre base de code (et celle de CMCteams) pour identifier vulnerabilites securite, **avant** qu'un attaquant ou audit externe les trouve. Inspire du `/security-review` natif Claude Code mais adapte aux apps web client-side.

**Niveau attendu** : OWASP ASVS L2 / NIST CSF / CWE Top 25.

## Quand l'invoquer (admin only)

- Kevin dit "audit", "security review", "scan vulnerabilites"
- Apres merge important sur main → run auto
- Sentinelle quotidienne `security-watch` invoque automatiquement
- Avant chaque release majeure (`vX.Y.0`)

## Checks effectues

### A. XSS (Cross-Site Scripting)
- `grep innerHTML | grep -v esc(` → identifie usages non escapes
- `document.write` partout (deprecated + dangereux)
- `eval`, `new Function`, `setTimeout(string, ...)` (RCE)
- Insertion DOM `dangerouslySetInnerHTML` (React-like) sans sanitize

### B. Secrets leaked
- Tokens API en clair dans le code (`sk-ant-api03-`, `ghp_`, `xkeysib-`, etc.)
- Cles privees dans frontend (jamais !) 
- Endpoints internes exposes (`gateway.cmsp4.sbm.interne` visible)
- Comments TODO avec credentials
- Localstorage non chiffres pour data sensible

### C. CSP (Content Security Policy)
- `unsafe-inline` / `unsafe-eval` dans CSP → INTERDIT en prod
- `default-src *` (trop permissif)
- Manque `frame-ancestors 'none'` (clickjacking)
- Pas de `report-uri` pour monitoring violations

### D. Auth / Session
- Tokens dans URLs (devraient etre headers/cookies)
- Pas de SameSite=Strict sur cookies session
- Pas de rotation tokens
- Hash mot de passe faible (MD5, SHA-1 → INTERDIT, exiger Argon2/bcrypt/PBKDF2 100k+)

### E. CORS
- `Access-Control-Allow-Origin: *` sur endpoint avec credentials
- Pas de whitelist d'origines

### F. Dependencies
- `npm audit` parsing → CVE Critical/High
- Libs > 1 an sans maj (potentiellement vulnerables)
- Polyfills CDN sans SRI hash

### G. Storage
- Localstorage non chiffre pour data sensible (CB, IBAN, tokens)
- Cookies non secure (manque `Secure` flag)
- IndexedDB partagee entre origins (uniquement same-origin OK)

### H. Input validation
- Pas de schema validation cote client (Zod, Yup, Joi)
- Numbers traites comme strings (overflow, NaN)
- Dates non parsees (XSS via Date parsing)

### I. Output encoding
- API responses sans `Content-Type: application/json` (XSS via type sniffing)
- HTML render sans DOMPurify

### J. Apex specific
- Sentinelles desactivees en prod
- Force-update banner clear data sensible (erreur #55 CLAUDE.md)
- `ax_pin` ecrase entre users (erreur #37)
- Cles API trouvees mais non chiffrees dans Vault

## Output

```json
{
  "scanned_files": 245,
  "scanned_lines": 187000,
  "findings": [
    {
      "severity": "P0 | P1 | P2 | P3",
      "cwe": "CWE-79",
      "file": "apex-ai/v13/features/chat/chat.ts",
      "line": 142,
      "issue": "innerHTML sans esc()",
      "snippet": "el.innerHTML = userMessage",
      "fix": "esc() obligatoire (CLAUDE.md erreur #8)"
    }
  ],
  "score": {
    "owasp_asvs_l2": "18/20",
    "secrets_leaks": "0",
    "xss_risks": "2",
    "csp_strict": "yes"
  },
  "summary": "1 P0 critique, 3 P1 hauts, 12 P2 moyens",
  "recommendations_top3": ["Fix XSS chat.ts", "Rotate token leaked github.ts", "Strengthen CSP frame-ancestors"]
}
```

## Anti-patterns

1. **Lancer scan en mode user** (perf impact) → admin only
2. **Stocker resultats en clair** dans audit log → chiffrer ou redact
3. **Auto-fix sans review** → propose toujours, ne fix pas auto (sauf P3)
4. **Faux positifs** → tolerance whitelist (`esc()` proxy functions OK)

## References

- OWASP ASVS L2 2024
- CWE Top 25 2024
- NIST CSF 2.0
- Pattern : `apex-ai/v13/services/admin/security-review.ts`
- Sentinelle : `security-watch` (quotidienne)
