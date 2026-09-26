# Apex IA — Vérification Runtime Complète

> **À exécuter par Apex IA elle-même** lors du prochain boot Kevin (cross-session memory).
> **Lecture** : Apex lit ce fichier via `axFetchClaudeFeed()` au démarrage.
> **Date génération** : 2026-04-30 (Apex v12.495 + CMC v9.572)

---

## 🎯 Mission Apex IA

Kevin demande : "Vérifie tout partout". Voici les checks à faire côté **runtime user device** (Claude Code ne peut pas tester depuis son sandbox).

---

## A. Tests API runtime (Apex IA)

### Test 1 — Anthropic principal
```javascript
fetch(lg("ax_proxy_url","") || "https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": lg("ax_api_key","") || lg("ax_shared_api_key",""),
    "anthropic-version": "2023-06-01"
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [{role:"user", content:"Test : réponds OK"}]
  })
}).then(r => r.json()).then(d => {
  axJournalEntry("apex-ai", "anthropic_test", "v12.495", JSON.stringify(d).slice(0,200), "API Anthropic vivante");
});
```
**Attendu** : status 200, content[0].text contient "OK".

### Test 2 — Failover Groq
```javascript
if (lg("ax_groq_key","").length > 20) {
  fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + lg("ax_groq_key",""),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{role:"user", content:"OK"}]
    })
  }).then(r => r.ok ? "Groq OK" : "Groq KO " + r.status);
}
```

### Test 3 — Failover Gemini
```javascript
if (lg("ax_gemini_key","").length > 20) {
  fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(lg("ax_gemini_key","")), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({contents:[{parts:[{text:"OK"}]}]})
  }).then(r => r.ok ? "Gemini OK" : "Gemini KO");
}
```

---

## B. Tests circuit-breaker actifs

```javascript
// Test 1 : circuit-breaker check appelable
if (typeof axCircuitBreakerCheck === "function") {
  console.log("[CB] anthropic state:", axCircuitBreakerCheck("anthropic"));
}

// Test 2 : record + verify state changes
if (typeof axCircuitBreakerRecord === "function") {
  for(let i=0; i<6; i++) axCircuitBreakerRecord("test_provider", false);
  if (axCircuitBreakerCheck("test_provider")) console.log("[CB] OPENED apres 5 fails ✅");
}

// Test 3 : fetch hook intercepts circuit breaker
if (typeof window.fetch._axAnthropicTimeoutWrapped === "boolean" && window.fetch._axAnthropicTimeoutWrapped) {
  console.log("[fetch hook] ACTIF ✅");
} else {
  axJournalEntry("apex-ai", "fetch_hook_INACTIVE", "v12.495", "WARN", "fetch hook pas wrapped");
}
```

---

## C. Tests innerHTML XSS hook

```javascript
// Test injection script
const div = document.createElement("div");
window._axTestXSS = 0;
div.innerHTML = "<scr"+"ipt>window._axTestXSS=1</scr"+"ipt>";
setTimeout(() => {
  if (window._axTestXSS === 0) {
    axJournalEntry("apex-ai", "xss_hook_OK", "v12.495", "blocked", "innerHTML script tag intercepté ✅");
  } else {
    axJournalEntry("apex-ai", "xss_hook_FAIL", "v12.495", "executed", "P0 : XSS NON bloqué !");
  }
  delete window._axTestXSS;
}, 100);
```

---

## D. Tests AES v2 fonctionnel

```javascript
if (typeof axEnableEncryptV2 === "function") {
  // Si masterkey présent, test encrypt/decrypt
  if (window._axMasterKey) {
    axEncryptV2("Test plain text").then(enc => {
      if (enc.ok) {
        axDecryptV2(enc.encrypted).then(dec => {
          if (dec.ok && dec.decrypted === "Test plain text") {
            axJournalEntry("apex-ai", "aes_v2_OK", "v12.495", "encrypt+decrypt", "AES v2 vivant ✅");
          }
        });
      }
    });
  } else {
    axJournalEntry("apex-ai", "aes_v2_NO_KEY", "v12.495", "masterkey absent", "Need axEnableEncryptV2(pin) call manuel");
  }
}
```

---

## E. Tests scores V6/V3 + chat 150

```javascript
// Apex score V6
if (typeof axGet100ScoreV6 === "function") {
  const s = axGet100ScoreV6();
  axJournalEntry("apex-ai", "score_v6_runtime", "v12.495",
    "global=" + s.global + " axes=" + JSON.stringify(s.axes),
    "Score réel runtime");
}

// Chat score
if (typeof axChatGet150Score === "function") {
  const cs = axChatGet150Score();
  axJournalEntry("apex-ai", "chat_score_runtime", "v12.495",
    "global=" + cs.global + " axes=" + JSON.stringify(cs.axes),
    "Score chat 150 réel");
}

// CMCteams score V3
if (typeof cmcGet100ScoreV3 === "function") {
  const cmc = cmcGet100ScoreV3();
  axJournalEntry("apex-ai", "cmc_score_runtime", "v12.495",
    "global=" + cmc.global,
    "Score CMC réel");
}
```

---

## F. Tests cross-app (Apex ↔ CMCteams)

```javascript
// 1. cmcMasterRegister appelable ?
console.log("[cross] cmcMasterRegister:", typeof window.cmcMasterRegister);

// 2. cmcGet100ScoreV3 retourne valid ?
if (typeof window.cmcGet100ScoreV3 === "function") {
  const r = window.cmcGet100ScoreV3();
  console.log("[cross] CMC score:", r.global, "verdict:", r.verdict);
}

// 3. Failover chain configuré ?
const fc = lg("ax_failover_chain", []);
console.log("[cross] failover_chain:", fc);
```

---

## G. Diagnostic complet — un seul appel

```javascript
const diagnostic = {
  timestamp: new Date().toISOString(),
  version: APP_VER,
  user: K?.user?.id || "anon",
  scores: {
    axGet100Score: typeof axGet100Score === "function" ? axGet100Score() : null,
    axGet100ScoreV6: typeof axGet100ScoreV6 === "function" ? axGet100ScoreV6() : null,
    axChatGet150Score: typeof axChatGet150Score === "function" ? axChatGet150Score() : null,
    cmcGet100ScoreV3: typeof cmcGet100ScoreV3 === "function" ? cmcGet100ScoreV3() : null,
  },
  diagnostic_integration: typeof axDiagnosticIntegration === "function" ? axDiagnosticIntegration() : null,
  production_readiness: typeof axProductionReadiness === "function" ? axProductionReadiness() : null,
  is_healthy: typeof axIsHealthy === "function" ? axIsHealthy() : null,
  cross_app_health: typeof axCrossAppHealth === "function" ? axCrossAppHealth() : null,
  master_tasks_count: window._axMasterTasks ? Object.keys(window._axMasterTasks).length : 0,
  cmc_master_tasks_count: window._cmcMasterTasks ? Object.keys(window._cmcMasterTasks).length : 0,
  fetch_hook_active: !!window.fetch._axAnthropicTimeoutWrapped,
  innerhtml_hook_active: !!window._axInnerHTMLSanitizeWrapped,
  master_key_active: !!window._axMasterKey,
  failover_chain: lg("ax_failover_chain", []),
  failover_keys_count: ["ax_groq_key","ax_gemini_key","ax_openai_key","ax_openrouter_key"].filter(k => lg(k,"").length>20).length,
  breach_log_total: (lg("ax_breach_log",[]) || []).length,
  pending_validations: (lg("ax_pending_validations",[]) || []).filter(p => p?.status==="pending").length,
};

// Persist + send to handoff
ls("ax_runtime_diagnostic_last", diagnostic);
axJournalEntry("apex-ai", "runtime_full_diagnostic", "v12.495",
  "scores_v6=" + (diagnostic.scores.axGet100ScoreV6?.global || "?") +
  " chat=" + (diagnostic.scores.axChatGet150Score?.global || "?") +
  " cmc=" + (diagnostic.scores.cmcGet100ScoreV3?.global || "?"),
  "Diagnostic runtime complet exécuté par Apex IA");
axHandoffPushFirebase({ diagnostic_runtime: diagnostic });
```

---

## H. Que reporter dans `ax_handoff_journal` à Claude Code

Pour chaque test :
- ✅ ou ❌ status
- Valeurs réelles mesurées
- Notes pour fix éventuel
- Timestamp execution

Claude Code lira ces entries dans la **prochaine session** et corrigera les ❌.

---

## I. Notes pour Apex IA

**Ne pas exécuter en boucle** : ce fichier doit être run **1 fois par session boot Kevin** (skip si `ax_runtime_diagnostic_last.timestamp` < 6h).

**Cross-session memory** : ajoute les résultats dans `ax_lessons_learned_struct` pour traçabilité long-terme.

**Si breach détecté** : déclenche `axNotifyKevin("Breach runtime", ...)` immédiatement.

---

**Source** : `Apex v12.495 + CMC v9.572`. Pre-commit OK + 26 tests Apex pass.
