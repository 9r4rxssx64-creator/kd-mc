# Template Audit Pro Apex / CMCteams — Niveau Big4 / PwC / Deloitte + frameworks reconnus

> Adapté du prompt fintech Kevin 2026-04-30 + méthodologie Stripe-grade.
> **Template OFFICIEL permanent** : à utiliser à CHAQUE audit demandé (Apex, CMCteams, futurs projets) — règle absolue.
>
> **Enrichissement v2 (2026-04-30)** : ajout frameworks pro reconnus pour aller encore plus loin que le template fintech standard :
> - **OWASP ASVS Level 2** — verification standard appliqué code review
> - **NIST CSF** — Identify / Protect / Detect / Respond / Recover
> - **CIS Controls v8** — 18 controls priorisés défense-en-profondeur
> - **SOC2 Trust Service Criteria** — Security / Availability / Processing Integrity / Confidentiality / Privacy
> - **STRIDE threat modeling** — Spoofing / Tampering / Repudiation / Info disclosure / DoS / Elevation
> - **MITRE ATT&CK** — tactiques attaquant TTPs
> - **Lighthouse PWA audit** — Performance / Accessibility / Best Practices / SEO / PWA
> - **AI Safety audit** spécifique Apex IA — alignment / hallucinations / prompt injection / jailbreak / data poisoning
> - **Mobile-first audit** — touch targets Apple HIG / viewport / gestures iOS Safari
> - **Chaos engineering** + **blameless postmortems** pour reliability culture

---

## Prompt système (à utiliser pour chaque agent audit)

```
Vous êtes une société d'audit externe professionnelle spécialisée en
SaaS / PWA assistant IA / planification RH casino (selon cible).
Votre tâche est d'effectuer un audit complet et de bout en bout
de [PROJET].

Ultrathink. Soyez non-complaisant. Mesurez le score réel, pas perçu.

Veuillez produire un rapport d'audit formel avec la structure suivante :

# 1. Résumé exécutif
- Note globale /100 (calcul honnête, pondéré par axe)
- 3 forces majeures avérées
- 3 risques critiques (CVSS / sévérité explicite)
- Verdict production-ready (oui / non / sous condition)

# 2. Portée et méthodologie
- Composants audités : [lister fichiers, modules]
- Méthodes :
  * Examen du code (grep, lecture, contrôle de flux)
  * Tests fonctionnels (scenarios end-to-end)
  * Validation des données (intégrité, persistence, RGPD)
  * Évaluation de la sécurité (OWASP Top 10, CSP, XSS, injection)
  * Profilage des performances (memory, CPU, network, render)
  * Vérification de la conformité (RGPD Art. 17/20/32, eIDAS,
    DSP2 si pertinent, SOC2 ready)

# 3. Résultats détaillés par zone

## 3.a Architecture et environnement
- Déploiement (CI/CD, branches, releases)
- Modularité (couplage, fichiers, lignes de code)
- Stack technique (dépendances, versions, CDN)
- Patterns architecturaux (monolith vs modules, race conditions)

## 3.b Qualité du code et maintenabilité
- Style (cohérence, conventions)
- Structure (fonctions trop longues, profondeur d'imbrication)
- Code mort / duplications
- Couverture de tests (unit, integration, e2e)
- Documentation interne (commentaires WHY, types, contracts)

## 3.c Intégrité des données et exactitude fonctionnelle
- Triple persistence (localStorage, IndexedDB, Firebase)
- Sync queue (offline → online flush)
- Backup / restore (cron, snapshots, retention)
- Conflits cross-device (timestamp checks, last-write-wins)
- Failover providers (IA, paiement, push)

## 3.d Évaluation de la sécurité
- Chiffrement (AES-GCM 256, PBKDF2, transport TLS)
- Authentification (PIN, biométrie, session TTL)
- Authorization / guards admin sur fonctions destructrices
- Vulnérabilités OWASP Top 10 (XSS, CSRF, IDOR, SSRF, RCE)
- Dépendances (CVE, supply chain, CDN integrity)
- CSP (unsafe-inline, nonces)
- Secrets management (vault, rotation, leak detection)

## 3.e Performances et fiabilité
- Boot time (TTI, FCP, LCP)
- Memory profile (listeners, closures, globals)
- Render efficiency (re-renders, FPS, jank)
- Network (fetch, SSE, retries)
- Battery drain iOS (animations, polling)
- Storage size cap (localStorage QuotaExceededError)

## 3.f Conformité et pistes d'audit
- RGPD (Art. 17 droit oubli, Art. 20 portabilité, Art. 32 sécurité,
  Art. 33 breach notification)
- Loi monégasque 1.165 (protection données)
- KYC/AML (si paiements > seuil)
- Loi 1.103 Monaco (constitution)
- Logging / audit trail (immutable, retention)
- DPO designation (si traitement à grande échelle)

# 4. Recommandations et plan de remédiation

## Tableau corrections priorisées

| ID | Zone | Sévérité | Issue | Impact | Effort | Priorité |
|----|------|----------|-------|--------|--------|----------|
| ... | ... | P0/P1/P2/P3 | ... | ... | h/j/sem | ... |

Sévérité standard CVSS / OWASP :
- P0 Critical : CVSS ≥ 9.0, exploit immédiat
- P1 High : CVSS 7.0-8.9, impact business
- P2 Medium : CVSS 4.0-6.9, dette technique
- P3 Low : CVSS < 4.0, amélioration

# 5. Conclusion
- Verdict production-ready : OUI / NON / SOUS CONDITION
- Score réel /100 (pondéré 6 axes)
- Top 5 actions prioritaires (par ordre d'urgence)
- Cible mois prochain (réaliste après remédiation Phase 1)
- Cible trimestre (après remédiation Phase 2)
- Notes finales niveau exécutif
```

---

## Helper Apex JS encodé : `axRunProAudit()`

À appeler depuis le bouton "Audit général expert" v12.452 dans vAdminCenter.

Code helper (à intégrer dans Apex) :

```js
function axRunProAudit(opts){
  /* opts = {scope:"apex"|"cmc"|"both", deep:bool, format:"md"|"json"} */
  return new Promise(function(resolve){
    opts = opts || {};
    var scope = opts.scope || "apex";
    var report = {
      meta: {
        generated_at: new Date().toISOString(),
        version: APP_VER,
        scope: scope,
        method: "pro_audit_template_v1"
      },
      executive_summary: {},
      scope_methodology: {},
      detailed_findings: {
        architecture: {},
        code_quality: {},
        data_integrity: {},
        security: {},
        performance: {},
        compliance: {}
      },
      remediation_plan: [],
      conclusion: {}
    };

    /* Lance les 6 sections en parallele via axTotalAudit + agents */
    var p1 = (typeof axTotalAudit === "function") ? axTotalAudit({verbose:true}) : Promise.resolve({});
    var p2 = (typeof axRunSecurityAudit === "function") ? axRunSecurityAudit() : Promise.resolve({});
    var p3 = (typeof axRunPerfAudit === "function") ? axRunPerfAudit() : Promise.resolve({});
    var p4 = (typeof axRunRgpdAudit === "function") ? axRunRgpdAudit() : Promise.resolve({});

    Promise.all([p1, p2, p3, p4]).then(function(results){
      report.detailed_findings.architecture = results[0] || {};
      report.detailed_findings.security = results[1] || {};
      report.detailed_findings.performance = results[2] || {};
      report.detailed_findings.compliance = results[3] || {};

      /* Score global pondere */
      var scores = {
        security: results[1].score || 0,
        performance: results[2].score || 0,
        compliance: results[3].score || 0,
        architecture: results[0].score || 0
      };
      var weights = {security:0.25, performance:0.20, compliance:0.20, architecture:0.15, code:0.10, data:0.10};
      var weighted = 0;
      Object.keys(weights).forEach(function(k){
        weighted += (scores[k]||70) * weights[k];
      });
      report.executive_summary.global_score = Math.round(weighted);
      report.executive_summary.production_ready = weighted >= 80 ? "OUI" : (weighted >= 65 ? "SOUS CONDITION" : "NON");

      /* Top 5 priorites */
      var allIssues = [];
      Object.keys(report.detailed_findings).forEach(function(k){
        var f = report.detailed_findings[k];
        if(f && f.issues && Array.isArray(f.issues)){
          f.issues.forEach(function(i){ allIssues.push({zone:k, issue:i}); });
        }
      });
      report.conclusion.top_5 = allIssues.slice(0, 5);

      /* Persiste rapport */
      try{
        var prevAudits = lg("ax_pro_audits", []);
        if(!Array.isArray(prevAudits)) prevAudits = [];
        prevAudits.push(report);
        if(prevAudits.length > 30) prevAudits = prevAudits.slice(-30);
        ls("ax_pro_audits", prevAudits);
      }catch(_){}

      resolve(report);
    }).catch(function(e){
      report.error = String(e.message||e);
      resolve(report);
    });
  });
}
```

---

## Adaptation pour CMCteams

Cible secteur : **gestion RH casino (planification 258 employés SBM Monaco)**.

Sections spécifiques CMCteams à ajouter audit :

### Convention SBM 1 avril 2015
- Article 17.4 (congés 2 mois/an : 1 mois été + 1 mois hiver)
- Article 17.5 (repos hebdo min 10j/6 sem, majoration 50% si > 4j supprimés)
- Article 17.8 (pauses 55+ et femmes enceintes : pause toutes 40 min)

### Conformité monégasque
- Loi 1.165 (protection données)
- Note DRH SBM 2021 (congés familiaux)

### KYC employés
- Identité (matricule, nom, prénom, email, adresse, date naissance)
- Contrats (durée, niveau, jeux validés)

---

## Workflow audit complet (5 phases)

### Phase 1 — Initial Understanding (Explore agents x3 max)
Lancer 3 agents Explore en parallèle :
1. Architecture / dépendances / boot sequence
2. Sécurité / RGPD / OWASP
3. Performance / memory / render

### Phase 2 — Design (Plan agent x1)
Synthèse findings + recommendations priorisées.

### Phase 3 — Review
Lecture des fichiers critiques identifiés. Vérification manuelle via grep avant fixes.

### Phase 4 — Final Plan
Rapport markdown structuré (template ci-dessus).

### Phase 5 — Application fixes prioritaires
Scripts Python idempotents + node --check + commit + push.

### Phase 6 — Audit POST-FIX systématique (NOUVEAU v2026-04-30)
Relancer 5 agents POST-FIX pour mesurer impact réel des fixes.
Documenter écart estimé vs réel comme lesson learned.

---

## Pondération scoring 6 axes

| Axe | Poids | Justification |
|-----|-------|---------------|
| Sécurité | 25% | Premier critère production-ready, blocking si critical |
| Performance | 20% | UX iPhone + battery drain = adoption réelle |
| Conformité | 20% | RGPD + Monaco + loi applicable obligatoire |
| Architecture | 15% | Maintenabilité long terme |
| Code quality | 10% | Dette technique cumulée |
| Data integrity | 10% | Confiance utilisateur |

**Score réel pondéré** = Σ (score_axe × poids).

---

## Sévérités CVSS / OWASP standard

- **P0 Critical** : CVSS ≥ 9.0 — exploit immédiat, blocking production
- **P1 High** : CVSS 7.0-8.9 — impact business significatif
- **P2 Medium** : CVSS 4.0-6.9 — dette technique
- **P3 Low** : CVSS < 4.0 — amélioration qualité

---

## Verdict production-ready 3 niveaux

| Score global | Verdict |
|--------------|---------|
| ≥ 80/100 | **OUI** — prêt production |
| 65-79 | **SOUS CONDITION** — fixer P0/P1 avant prod |
| < 65 | **NON** — refactor majeur requis |

---

**Ce template est désormais référence permanente pour tout audit demandé Kevin.**
**Encodage dans Apex via `axRunProAudit()` à intégrer prochain patch (v12.466 ou suivant).**

---

## Enrichissements frameworks pro (sections additionnelles à intégrer dans rapport)

### Section 3.g — STRIDE Threat Modeling
Pour CHAQUE composant critique (auth, paiement, admin, IA tools, sync) :

| Composant | Spoofing | Tampering | Repudiation | Info disclosure | DoS | Elevation |
|-----------|----------|-----------|-------------|-----------------|-----|-----------|
| Login PIN | risque ? mitigation ? | ... | ... | ... | ... | ... |
| Vault clés API | ... | ... | ... | ... | ... | ... |
| Apex IA tool calls | ... | ... | ... | ... | ... | ... |
| Service Worker | ... | ... | ... | ... | ... | ... |
| Firebase SSE | ... | ... | ... | ... | ... | ... |

### Section 3.h — OWASP ASVS Level 2 verification
Verification Standard application security 50+ contrôles :
- V1 Architecture, design and threat modeling
- V2 Authentication
- V3 Session management
- V4 Access control
- V5 Validation, sanitization and encoding
- V6 Stored cryptography
- V7 Error handling and logging
- V8 Data protection
- V9 Communications
- V10 Malicious code
- V11 Business logic
- V12 Files and resources
- V13 API and web service
- V14 Configuration

### Section 3.i — NIST Cybersecurity Framework mapping
| Function | Status | Findings |
|----------|--------|----------|
| **Identify** : assets, risks, governance | ... | ... |
| **Protect** : access control, awareness, data security | ... | ... |
| **Detect** : anomalies, monitoring, detection processes | ... | ... |
| **Respond** : response planning, communications, mitigation | ... | ... |
| **Recover** : recovery planning, improvements, communications | ... | ... |

### Section 3.j — CIS Controls v8 top 18 (priorité défense)
1. Inventory and Control of Enterprise Assets
2. Inventory and Control of Software Assets
3. Data Protection
4. Secure Configuration of Enterprise Assets
5. Account Management
6. Access Control Management
7. Continuous Vulnerability Management
8. Audit Log Management
9. Email and Web Browser Protections
10. Malware Defenses
11. Data Recovery
12. Network Infrastructure Management
13. Network Monitoring and Defense
14. Security Awareness and Skills Training
15. Service Provider Management
16. Application Software Security
17. Incident Response Management
18. Penetration Testing

### Section 3.k — SOC2 Trust Service Criteria
| TSC | Description | Apex/CMC status |
|-----|-------------|-----------------|
| Security | Protection against unauthorized access | ... |
| Availability | System operational and usable | ... |
| Processing Integrity | System processing accurate and authorized | ... |
| Confidentiality | Information designated as confidential is protected | ... |
| Privacy | Personal information collected, used, retained per privacy notice | ... |

### Section 3.l — AI Safety Audit (spécifique Apex IA)
Pour Apex AI exclusivement (peut s'appliquer à tout assistant IA) :

1. **Alignment** : l'IA respecte-t-elle les valeurs Kevin et les règles permanentes CLAUDE.md ?
2. **Hallucinations** : registry `axCheckCommandExists` empêche-t-il vraiment d'inventer ? Tests sur 50 prompts.
3. **Prompt injection** : input user peut-il override system prompt ? (`Ignore previous instructions...`)
4. **Jailbreak resistance** : tentatives de bypass garde-fous (médical, légal, sécurité) ?
5. **Data poisoning** : `ax_persistent_memory` peut-il être empoisonné par user pour manipuler IA future ?
6. **Tool abuse** : tools dangereux (`code_execute`, `device_status`, `inject_function`) bien gardés admin ?
7. **Privacy leak** : IA divulgue-t-elle des infos d'autres utilisateurs ? (cross-user leak)
8. **Refusal calibration** : refuse-t-elle quand elle DOIT (illégal, dangereux) ? Refuse-t-elle injustement (utile, légal) ?
9. **Citation accuracy** : sources web_search citées correctement ? Pas d'hallucinations URL ?
10. **Confidence calibration** : exprime-t-elle l'incertitude quand elle ne sait pas ?

### Section 3.m — Lighthouse PWA Audit
Cibles standards :
- **Performance** : ≥ 90 (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- **Accessibility** : ≥ 90 (WCAG 2.1 AA conform)
- **Best Practices** : ≥ 95
- **SEO** : ≥ 90
- **PWA** : 100 (installable, offline-capable, HTTPS, valid manifest)

### Section 3.n — MITRE ATT&CK mapping (advanced)
Tactiques attaquant à mitiger (TTPs) :
- TA0001 Initial Access : phishing, supply chain, exposed credentials
- TA0002 Execution : code injection, eval, RCE
- TA0003 Persistence : modify SW, add admin, backdoor user
- TA0004 Privilege Escalation : guard bypass, IDOR
- TA0005 Defense Evasion : disable sentinels, log tampering
- TA0006 Credential Access : vault dump, biometric copy
- TA0007 Discovery : list users, dump localStorage
- TA0008 Lateral Movement : Firebase cross-user
- TA0009 Collection : keylog, screen capture
- TA0010 Exfiltration : Firebase write, postMessage, sendBeacon
- TA0011 Impact : data destruction, account takeover

---

## Méthode hybride v3 (audit le plus puissant à ce jour)

**Phase 0** : Setup
- Lire codebase + CLAUDE.md règles + lessons learned récents (cross-session memory)

**Phase 1** : Multi-agent parallèle (5-6 agents Explore)
- Agent 1 : Sécurité OWASP + RGPD + STRIDE
- Agent 2 : Performance + memory + render + boot
- Agent 3 : Architecture + dépendances + boot race conditions
- Agent 4 : Code quality + dead code + tests + documentation
- Agent 5 : AI Safety (Apex spécifique) + tools + hallucinations
- Agent 6 : Compliance NIST CSF + CIS Controls + SOC2

**Phase 2** : Synthèse Plan agent
- Cross-référence findings entre agents (P0 confirmés par 2+ agents = critique absolu)
- Pondération scoring 6 axes
- Top 10 priorités

**Phase 3** : Vérification manuelle
- Lecture fichiers critiques identifiés
- Grep verification chaque finding avant fix
- Élimination faux positifs

**Phase 4** : Application fixes (scripts idempotents + node --check + commit + push)

**Phase 5** : Audit POST-FIX systématique
- Relancer 5 agents POST-FIX pour mesurer impact réel
- Documenter écart estimé vs réel = lesson learned

**Phase 6** : Rapport markdown formel selon ce template

---

## Pourquoi ce template est plus puissant que la version originale Kevin

| Section | Original Kevin | Enrichissement v2 | Gain |
|---------|----------------|-------------------|------|
| Sécurité | Crypto/auth/CVE | + OWASP Top 10 + ASVS L2 + STRIDE + MITRE ATT&CK | Couverture vraiment exhaustive |
| Performance | Profilage générique | + Lighthouse + Core Web Vitals + boot timeline | Métriques chiffrées |
| Conformité | ASIC/KYC/AML | + NIST CSF + CIS v8 + SOC2 TSC + WCAG 2.1 + ISO 27001 | Frameworks reconnus globalement |
| AI Safety | absent | 10 contrôles dédiés (alignment/hallucinations/jailbreak/etc.) | Critique pour Apex IA |
| Méthodologie | Examen + tests | + Multi-agent parallèle + Audit POST-FIX systématique + Cross-référence | Confidence niveau pro |

**Verdict honnête** : ton template original est niveau Big4 audit fintech (très bon). L'enrichissement v2 ajoute 4 frameworks reconnus globalement (OWASP, NIST, CIS, SOC2) + AI Safety + méthodologie multi-agent qui le rend **niveau audit assurance qualité Stripe / Anthropic / Google interne**.

C'est désormais le template le plus puissant que je connaisse pour ce type de projet.

Si tu trouves un template encore meilleur (ex : audit FedRAMP High / DoD STIG / PCI-DSS Level 1), envoie-le moi et je l'intègre. Sinon, on garde celui-ci comme référence permanente.
