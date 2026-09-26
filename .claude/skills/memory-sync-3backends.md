# Skill: memory-sync-3backends
> Synchronisation mémoire Apex sur 3 backends — Firebase + GitHub Gist + Notion

## Déclencheur
- Kevin dit : "sync ma mémoire", "sauvegarde mes notes"
- Hook Stop (fin de session) → auto-sync si delta > 0
- Cron sentinelle backup-watch : toutes les 6h

## Architecture mémoire 3 niveaux
```
Niveau 1 — localStorage + IDB (iPhone local, 0ms)
    ↓ sync bidirectionnel
Niveau 2 — Firebase RTDB (cloud temps réel, ~50ms)
    ↓ backup quotidien
Niveau 3 — GitHub Gist privé + Notion DB (archivage long terme)
```

## Algorithme sync
```typescript
async function syncMemory3Backends() {
  const local = await readLocalMemory();    // IDB ax_persistent_memory
  const firebase = await readFirebase('apex/memory');
  const gist = await readGist(GIST_ID);
  
  // Merge CRDT-style : last-write-wins par clé + timestamp
  const merged = mergeMemories([local, firebase, gist]);
  
  // Écriture parallèle sur les 3
  await Promise.allSettled([
    writeLocalMemory(merged),
    writeFirebase('apex/memory', merged),
    updateGist(GIST_ID, JSON.stringify(merged, null, 2)),
  ]);
  
  // Si Notion configuré → sync DB
  if (vault.has('ax_notion_key')) {
    await syncToNotion(merged);
  }
}
```

## Structure mémoire persistante
```typescript
interface ApexMemory {
  facts: MemoryFact[];           // facts Kevin (préférences, infos perso)
  lessons: LessonLearned[];      // erreurs évitées + patterns
  kb: KnowledgeEntry[];          // base de connaissance métier
  entities: KGraphEntity[];      // knowledge graph (personnes, projets)
  relations: KGraphRelation[];   // relations entre entités
  lastSync: {
    local: number;               // timestamp IDB
    firebase: number;
    gist: number;
    notion?: number;
  };
}
```

## Résolution conflits
```typescript
// Règle : si même clé, garder version avec timestamp le plus récent
// Exception : lessons_learned → union (jamais écraser)
// Exception : facts Kevin → Firebase gagne (Kevin peut éditer depuis autre device)
function mergeMemories(sources: ApexMemory[]): ApexMemory {
  const facts = deduplicateByKey(sources.flatMap(s => s.facts), 'key');
  const lessons = unionAll(sources.flatMap(s => s.lessons));
  return { facts, lessons, ... };
}
```

## Backup trigger automatique
- ✅ Hook `Stop` Apex → sync si session a produit ≥1 memory_add
- ✅ Sentinelle `backup-watch` → sync forcé toutes 6h
- ✅ Après chaque `lesson_record` ou `memory_add_entity`
