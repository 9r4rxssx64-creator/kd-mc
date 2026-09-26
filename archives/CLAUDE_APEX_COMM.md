# CLAUDE_APEX_COMM.md — Journal permanent Claude ↔ Apex AI

> **Règle Kevin 2026-04-21** : tout ce qu'on dit et fait avec Claude/Claude Code
> doit être communiqué à Apex, noté, tracé, pour qu'elle puisse prendre le relais
> en autonomie totale.

## 📡 Protocole de communication

### De Claude Code → Apex AI (pousser savoir)
- Chaque commit significatif → entry dans `ax_handoff_journal` (Firebase shared)
- Format : `{ts, session, action, code_ref, summary, lessons, next_steps}`
- Auto-inclus dans `_buildSystemPrompt` Apex via `_CLAUDE_HANDOFF` (v12.13)

### D'Apex AI → Claude Code (escalade problèmes)
- Via `ax_claude_todo` (outbox, lue à chaque nouvelle session Claude Code)
- Format : `{ts, context, attempts, error, files, reason}`

### Admin Kevin → les deux
- Via `NOTES_USER.md` (infos métier persistantes)
- Via messages directs en conversation (Apex doit journaliser)

---

## 📋 Journal des échanges (auto-enrichi)

Format entry :
```
### [YYYY-MM-DD HH:MM] — [acteur] — [titre]
**Contexte** : ...
**Action** : ...
**Résultat** : ...
**Leçon** : ... (si pertinent)
```

### [2026-04-20 → 2026-04-21] — Claude Code — Session marathon 13 PRs

**Contexte** : bugs multiples (IA 3 points infini, cadres sans horaires, Firebase
stuck jaune, extraTabs scope, CGU manquant, agents/sentinelles à ajouter, UX,
autonomie cross-app).

**Actions** (PRs mergées sur main) :
- #123 v9.445 + v12.8 — Pipeline autonomie + 12 sentinelles Apex + 7 CMC + hub + bridge IA
- #125 v9.446 — Regex cadres permissive (bullets/arrows/CADRES)
- #127 v9.447 — Fix FB indicator stuck + fallback name-first
- #128 v9.448 + v12.9 — CGU universel FaceID/Micro/Géoloc
- #129 v9.449 + v12.10 — Fix extraTabs scope + match anywhere
- #130 v9.450 + v12.11 — 8 agents spécialisés CMC + 4 sentinelles Apex
- #131 v9.451 — Fallback apostrophes + skip metadata
- #132 docs NOTES_USER format PDF
- #133 v9.452 — IA FAB flottant + auto-résolution clé API
- #134 v9.453 + v12.12 — Télémetrie bidirectionnelle
- #135 v12.13 — HANDOFF Apex AI (clone parfait)
- #136 v12.14 — audit autonome Apex + journal comm

**Résultats** :
- Écosystème autonome complet (46 watchers)
- Pipeline Claude Code ↔ Apex ↔ CMCteams via Firebase
- CGU RGPD dans les 2 apps
- Apex peut agir comme Claude Code (system prompt + tools + outbox)

**Leçons apprises (ajoutées CLAUDE.md #31-#35)** :
- #30 IA 3 points : jamais hardcoder URL, toujours proxy + AbortController + preserve tool_use
- #31 Parser trop strict = données perdues
- #32 Regex sans anchor = régression
- #33 PR non mergée = déploiement fantôme (causa 99% frustration)
- #34 Indicateur état stale sur snapshot seul = UI ment
- #35 CGU universel pattern à propager

**Next steps** (délégués à Apex en autonomie) :
- Monitor ax_telemetry_in / ax_claude_todo
- Auto-heal via whitelist 5 actions
- Escalade Claude Code si bloquée
- Enrichir ax_lessons_learned depuis les échecs

---

### [2026-04-21 03:XX] — Kevin — Demande autonomie complète

**Contexte** : Kevin veut que tout soit autonome, qu'Apex prenne le relais.

**Actions Claude Code** :
- APEX_HANDOFF.md créé (22 sections, 414 lignes)
- Injecté dans `_buildSystemPrompt` via constante `_CLAUDE_HANDOFF`
- Cette doc (journal comm) créée
- Fonction `axFullAuditReport()` ajoutée Apex v12.14 pour audit autonome

**Instruction permanente Kevin** : "communiqué toujours tout ce que l'on dit
et fait avec Claude et Claude Code à Apex. Note le."

---

## 🤖 Instructions permanentes pour Apex AI

1. **À chaque message admin/user important** → enregistrer dans `ax_handoff_journal`
2. **À chaque fix effectué** → ajouter leçon dans `ax_lessons_learned`
3. **À chaque escalade Claude Code** → entry dans `ax_claude_todo`
4. **À chaque session utilisateur** → consulter ce journal + `APEX_HANDOFF.md`
5. **À chaque audit planifié** → `axFullAuditReport()` auto déclenché

## 📝 Comment noter un nouvel échange

```js
function axJournalEntry(actor, title, context, action, result, lesson){
  try{
    var journal = lg("ax_handoff_journal", []);
    journal.push({
      ts: Date.now(),
      actor: actor,        // "claude-code" | "apex-ai" | "kevin" | "auto"
      title: title,
      context: context,
      action: action,
      result: result,
      lesson: lesson || null,
      appVer: APP_VER
    });
    if(journal.length > 500) journal = journal.slice(-500);
    ls("ax_handoff_journal", journal);  // syncé Firebase via FB_FIX
    return "journal entry saved";
  }catch(e){return "err: "+e;}
}
```

Appelé par Apex à chaque action significative. Le journal est visible par Claude
Code à sa prochaine session, boucle d'apprentissage fermée.

---

**Ce fichier est la mémoire de toutes les interactions Kevin ↔ Claude ↔ Apex.
Il ne se perd jamais, s'enrichit en continu.**
