/**
 * APEX v13 — MCP Memory Server (knowledge graph local).
 *
 * Innovation gratuite (audit Apex v13.3.73 issue #240) :
 * Knowledge graph persistant pour Apex IA — entités + relations + observations.
 * Inspiré du serveur officiel `@modelcontextprotocol/server-memory`.
 *
 * Pourquoi (Kevin règle "tout au max") :
 * Apex IA doit pouvoir construire un graphe de connaissances cross-session
 * (Kevin admin = entité, Laurence = entité, projets = entités, relations Kevin→aime→Laurence,
 * observations rattachées à chaque entité). Permet à Apex de "se rappeler" des liens entre
 * concepts, pas seulement des facts isolés (vs persistent-memory-store).
 *
 * Stockage IndexedDB (table `apex_memory_kg`) — capacité ~50 MB-1 GB Safari iOS, vs 5 MB
 * localStorage limite.
 *
 * Caps anti-overflow :
 *  - 10000 entities max (FIFO rotation par ts)
 *  - 50000 relations max (FIFO rotation)
 *  - 100 observations max par entité (trim oldest)
 *
 * API publique :
 *  - addEntity(name, type, observations[]) → returns id (idempotent : existing name → reuse)
 *  - addRelation(from_id, to_id, type) → returns id
 *  - addObservation(entity_id, content) → append observation to entity
 *  - search(query, options?) → relevance ranked entities (full-text on name + observations)
 *  - getRelated(entity_id, depth?) → graph traversal BFS
 *  - exportJSON() / importJSON(data) pour backup
 *  - getStats() → counts pour UI admin
 *
 * Anti-pattern Kevin : pas d'eval, pas de référence cyclique non gérée,
 * tokenizer simple (pas de NLP lourd), graph traversal capé à 5 levels max.
 */

import { logger } from '../../core/logger.js';

/* ========================================================================== */
/* Types publics */
/* ========================================================================== */

export interface KGEntity {
  id: string;
  name: string;
  type: string;
  observations: string[];
  ts: number;
  updated_at: number;
}

export interface KGRelation {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  ts: number;
}

export interface KGSearchOptions {
  limit?: number;
  type?: string;
  minScore?: number;
}

export interface KGSearchHit {
  entity: KGEntity;
  score: number;
  matched_tokens: string[];
}

export interface KGRelatedNode {
  entity: KGEntity;
  depth: number;
  via_relation_type: string;
  via_relation_id: string;
}

export interface KGStats {
  entities_count: number;
  relations_count: number;
  observations_total: number;
  ready: boolean;
  storage: 'idb' | 'memory-fallback';
}

export interface KGExport {
  version: 1;
  exported_at: number;
  entities: KGEntity[];
  relations: KGRelation[];
}

/* ========================================================================== */
/* Constantes */
/* ========================================================================== */

const IDB_NAME = 'apex_memory_kg';
const IDB_VERSION = 1;
const STORE_ENTITIES = 'entities';
const STORE_RELATIONS = 'relations';
const STORE_INDEX = 'token_index'; /* id → {entity_id, token} pour full-text */

const MAX_ENTITIES = 10_000;
const MAX_RELATIONS = 50_000;
const MAX_OBSERVATIONS_PER_ENTITY = 100;
const MAX_GRAPH_DEPTH = 5;
const MAX_TOKENS_INDEXED_PER_OBS = 60; /* tokens uniques retenus par observation */

/* Stop words FR + EN courants pour ne pas polluer l'index */
const STOP_WORDS = new Set<string>([
  /* FR */
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'a', 'au', 'aux',
  'ce', 'ces', 'cette', 'que', 'qui', 'quoi', 'dont', 'pour', 'par', 'avec', 'sans',
  'sur', 'dans', 'en', 'est', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta',
  'tes', 'notre', 'votre', 'leur', 'leurs', 'il', 'elle', 'on', 'nous', 'vous', 'ils',
  /* EN */
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'this',
  'that', 'these', 'those', 'as', 'by', 'for', 'with', 'from', 'into', 'than', 'then',
]);

/* ========================================================================== */
/* Classe */
/* ========================================================================== */

class MCPMemoryServer {
  private initialized = false;
  private storage: KGStats['storage'] = 'idb';

  /**
   * In-memory mirror utilisé si IDB indisponible (tests SSR / browsers anciens).
   * En mode IDB normal, source de vérité = IDB ; le mirror n'est PAS maintenu.
   */
  private memEntities = new Map<string, KGEntity>();
  private memRelations = new Map<string, KGRelation>();

  /**
   * Init lazy (idempotent). Tente d'ouvrir IDB ; si KO → mode memory-fallback.
   */
  async init(): Promise<KGStats> {
    if (this.initialized) return this.getStats();
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IDB unavailable');
      await this.openDb();
      this.storage = 'idb';
      logger.info('mcp-memory-server', 'init OK (IDB)');
    } catch (err: unknown) {
      this.storage = 'memory-fallback';
      logger.warn('mcp-memory-server', 'IDB unavailable → memory-fallback', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    this.initialized = true;
    return this.getStats();
  }

  /* ======================================================================== */
  /* API publique : entités */
  /* ======================================================================== */

  /**
   * Ajoute une entité (ou réutilise si name+type déjà existants).
   * Idempotent : appel multiple avec même (name, type) merge les observations.
   */
  async addEntity(
    name: string,
    type: string,
    observations: string[] = [],
  ): Promise<{ id: string; created: boolean }> {
    if (!this.initialized) await this.init();
    const cleanName = String(name ?? '').trim();
    const cleanType = String(type ?? '').trim();
    if (!cleanName) throw new Error('name required');
    if (!cleanType) throw new Error('type required');

    /* Check existant via name+type (case-insensitive) */
    const existing = await this.findEntityByNameType(cleanName, cleanType);
    if (existing) {
      const newObs = observations
        .map((o) => String(o).trim())
        .filter((o) => o.length > 0 && !existing.observations.includes(o));
      if (newObs.length === 0) return { id: existing.id, created: false };
      existing.observations.push(...newObs);
      if (existing.observations.length > MAX_OBSERVATIONS_PER_ENTITY) {
        existing.observations = existing.observations.slice(-MAX_OBSERVATIONS_PER_ENTITY);
      }
      existing.updated_at = Date.now();
      await this.saveEntity(existing);
      await this.indexEntityTokens(existing);
      return { id: existing.id, created: false };
    }

    const id = `ent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    /* Dedup intra-input ET conserve l'ordre */
    const seen = new Set<string>();
    const cleanObs: string[] = [];
    for (const raw of observations) {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleanObs.push(trimmed);
      if (cleanObs.length >= MAX_OBSERVATIONS_PER_ENTITY) break;
    }
    const entity: KGEntity = {
      id,
      name: cleanName,
      type: cleanType,
      observations: cleanObs,
      ts: now,
      updated_at: now,
    };
    await this.saveEntity(entity);
    await this.indexEntityTokens(entity);
    await this.maybeRotateEntities();
    return { id, created: true };
  }

  /**
   * Ajoute une relation orientée (from → to).
   * Idempotent : (from, to, type) déjà existante → réutilise.
   */
  async addRelation(
    fromId: string,
    toId: string,
    type: string,
  ): Promise<{ id: string; created: boolean }> {
    if (!this.initialized) await this.init();
    const cleanFrom = String(fromId ?? '').trim();
    const cleanTo = String(toId ?? '').trim();
    const cleanType = String(type ?? '').trim();
    if (!cleanFrom || !cleanTo) throw new Error('from_id and to_id required');
    if (!cleanType) throw new Error('type required');
    if (cleanFrom === cleanTo) throw new Error('from_id and to_id must differ');

    const fromEntity = await this.getEntity(cleanFrom);
    const toEntity = await this.getEntity(cleanTo);
    if (!fromEntity) throw new Error(`from entity not found: ${cleanFrom}`);
    if (!toEntity) throw new Error(`to entity not found: ${cleanTo}`);

    const existing = await this.findRelation(cleanFrom, cleanTo, cleanType);
    if (existing) return { id: existing.id, created: false };

    const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const relation: KGRelation = {
      id,
      from_id: cleanFrom,
      to_id: cleanTo,
      type: cleanType,
      ts: Date.now(),
    };
    await this.saveRelation(relation);
    await this.maybeRotateRelations();
    return { id, created: true };
  }

  /**
   * Append une observation à une entité existante.
   */
  async addObservation(entityId: string, content: string): Promise<{ ok: true; total: number }> {
    if (!this.initialized) await this.init();
    const cleanContent = String(content ?? '').trim();
    if (!cleanContent) throw new Error('content required');
    const entity = await this.getEntity(entityId);
    if (!entity) throw new Error(`entity not found: ${entityId}`);
    if (entity.observations.includes(cleanContent)) {
      return { ok: true, total: entity.observations.length };
    }
    entity.observations.push(cleanContent);
    if (entity.observations.length > MAX_OBSERVATIONS_PER_ENTITY) {
      entity.observations = entity.observations.slice(-MAX_OBSERVATIONS_PER_ENTITY);
    }
    entity.updated_at = Date.now();
    await this.saveEntity(entity);
    await this.indexEntityTokens(entity);
    return { ok: true, total: entity.observations.length };
  }

  /**
   * Recherche full-text sur name + observations, ranking par tokens matched.
   * - Tokenize la query (split + lowercase + skip stop-words)
   * - Pour chaque token, fetch via index inversé les entity_ids
   * - Score = nb tokens matched (avec bonus si match dans name vs observation)
   */
  async search(
    query: string,
    options: KGSearchOptions = {},
  ): Promise<KGSearchHit[]> {
    if (!this.initialized) await this.init();
    const cleanQuery = String(query ?? '').trim();
    if (!cleanQuery) return [];
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const minScore = Math.max(0, options.minScore ?? 0);
    const filterType = options.type ? String(options.type).trim().toLowerCase() : null;

    const queryTokens = tokenize(cleanQuery);
    if (queryTokens.length === 0) return [];

    /* Score map : entity_id → {score, matched: Set<token>} */
    const scoreMap = new Map<string, { score: number; matched: Set<string> }>();

    for (const tok of queryTokens) {
      const entityIds = await this.lookupTokenIndex(tok);
      for (const eid of entityIds) {
        let entry = scoreMap.get(eid);
        if (!entry) {
          entry = { score: 0, matched: new Set<string>() };
          scoreMap.set(eid, entry);
        }
        if (!entry.matched.has(tok)) {
          entry.matched.add(tok);
          entry.score += 1;
        }
      }
    }

    /* Charge entités + filtre + bonus name match + tri */
    const hits: KGSearchHit[] = [];
    for (const [eid, info] of scoreMap.entries()) {
      const entity = await this.getEntity(eid);
      if (!entity) continue;
      if (filterType && entity.type.toLowerCase() !== filterType) continue;

      let score = info.score;
      /* Bonus : si match dans le name, pondère plus haut */
      const nameTokens = new Set(tokenize(entity.name));
      let nameMatches = 0;
      for (const tok of info.matched) {
        if (nameTokens.has(tok)) nameMatches += 1;
      }
      score += nameMatches * 2;
      if (score < minScore) continue;
      hits.push({ entity, score, matched_tokens: Array.from(info.matched) });
    }

    hits.sort((a, b) => b.score - a.score || b.entity.updated_at - a.entity.updated_at);
    return hits.slice(0, limit);
  }

  /**
   * BFS traversal du graphe à partir d'une entité, jusqu'à `depth` levels.
   * Retourne les nodes voisins (uniques, exclut l'entité de départ).
   */
  async getRelated(entityId: string, depth = 1): Promise<KGRelatedNode[]> {
    if (!this.initialized) await this.init();
    const cleanId = String(entityId ?? '').trim();
    if (!cleanId) throw new Error('entity_id required');
    const start = await this.getEntity(cleanId);
    if (!start) throw new Error(`entity not found: ${cleanId}`);
    const maxDepth = Math.max(1, Math.min(MAX_GRAPH_DEPTH, depth));

    const visited = new Set<string>([cleanId]);
    const result: KGRelatedNode[] = [];
    let frontier: Array<{ id: string; depth: number; via_type: string; via_id: string }> = [
      { id: cleanId, depth: 0, via_type: '', via_id: '' },
    ];

    for (let lvl = 0; lvl < maxDepth; lvl++) {
      const nextFrontier: Array<{ id: string; depth: number; via_type: string; via_id: string }> = [];
      for (const node of frontier) {
        const outgoing = await this.findRelationsByEntity(node.id);
        for (const rel of outgoing) {
          const otherId = rel.from_id === node.id ? rel.to_id : rel.from_id;
          if (visited.has(otherId)) continue;
          visited.add(otherId);
          const otherEntity = await this.getEntity(otherId);
          if (!otherEntity) continue;
          result.push({
            entity: otherEntity,
            depth: lvl + 1,
            via_relation_type: rel.type,
            via_relation_id: rel.id,
          });
          nextFrontier.push({
            id: otherId,
            depth: lvl + 1,
            via_type: rel.type,
            via_id: rel.id,
          });
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
    return result;
  }

  /**
   * Récupère une entité par id.
   */
  async getEntity(entityId: string): Promise<KGEntity | null> {
    if (!this.initialized) await this.init();
    if (this.storage === 'memory-fallback') {
      return this.memEntities.get(entityId) ?? null;
    }
    return this.idbGet<KGEntity>(STORE_ENTITIES, entityId);
  }

  /**
   * Récupère une relation par id.
   */
  async getRelation(relationId: string): Promise<KGRelation | null> {
    if (!this.initialized) await this.init();
    if (this.storage === 'memory-fallback') {
      return this.memRelations.get(relationId) ?? null;
    }
    return this.idbGet<KGRelation>(STORE_RELATIONS, relationId);
  }

  /**
   * Stats pour UI admin (?view=knowledge).
   */
  async getStats(): Promise<KGStats> {
    const base: KGStats = {
      entities_count: 0,
      relations_count: 0,
      observations_total: 0,
      ready: this.initialized,
      storage: this.storage,
    };
    if (!this.initialized) return base;
    if (this.storage === 'memory-fallback') {
      base.entities_count = this.memEntities.size;
      base.relations_count = this.memRelations.size;
      let obs = 0;
      for (const e of this.memEntities.values()) obs += e.observations.length;
      base.observations_total = obs;
      return base;
    }
    try {
      const allEntities = await this.idbGetAll<KGEntity>(STORE_ENTITIES);
      base.entities_count = allEntities.length;
      base.observations_total = allEntities.reduce((sum, e) => sum + e.observations.length, 0);
      base.relations_count = await this.idbCount(STORE_RELATIONS);
    } catch (err) {
      logger.warn('mcp-memory-server', 'getStats failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return base;
  }

  /**
   * Export complet pour backup JSON.
   */
  async exportJSON(): Promise<KGExport> {
    if (!this.initialized) await this.init();
    if (this.storage === 'memory-fallback') {
      return {
        version: 1,
        exported_at: Date.now(),
        entities: Array.from(this.memEntities.values()),
        relations: Array.from(this.memRelations.values()),
      };
    }
    const entities = await this.idbGetAll<KGEntity>(STORE_ENTITIES);
    const relations = await this.idbGetAll<KGRelation>(STORE_RELATIONS);
    return {
      version: 1,
      exported_at: Date.now(),
      entities,
      relations,
    };
  }

  /**
   * Import depuis backup JSON. Mode merge : ne supprime pas existant.
   * Si conflict d'id → l'import GAGNE (overwrite).
   */
  async importJSON(data: KGExport): Promise<{ entities: number; relations: number }> {
    if (!this.initialized) await this.init();
    if (!data || data.version !== 1) throw new Error('invalid export format (version mismatch)');
    let entCount = 0;
    let relCount = 0;
    for (const e of data.entities ?? []) {
      if (!e || typeof e.id !== 'string') continue;
      await this.saveEntity(e);
      await this.indexEntityTokens(e);
      entCount += 1;
    }
    for (const r of data.relations ?? []) {
      if (!r || typeof r.id !== 'string') continue;
      await this.saveRelation(r);
      relCount += 1;
    }
    return { entities: entCount, relations: relCount };
  }

  /**
   * Reset complet (debug / RGPD erase). Wipe IDB ou mirror.
   */
  async reset(): Promise<void> {
    if (this.storage === 'memory-fallback') {
      this.memEntities.clear();
      this.memRelations.clear();
      return;
    }
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_ENTITIES, STORE_RELATIONS, STORE_INDEX], 'readwrite');
        tx.objectStore(STORE_ENTITIES).clear();
        tx.objectStore(STORE_RELATIONS).clear();
        tx.objectStore(STORE_INDEX).clear();
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('reset failed'));
      });
    } catch (err) {
      logger.warn('mcp-memory-server', 'reset failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /* ======================================================================== */
  /* IDB internals */
  /* ======================================================================== */

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_ENTITIES)) {
          const store = db.createObjectStore(STORE_ENTITIES, { keyPath: 'id' });
          store.createIndex('name_type', ['name_lower', 'type_lower'], { unique: false });
          store.createIndex('type_lower', 'type_lower', { unique: false });
          store.createIndex('ts', 'ts', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_RELATIONS)) {
          const store = db.createObjectStore(STORE_RELATIONS, { keyPath: 'id' });
          store.createIndex('from_id', 'from_id', { unique: false });
          store.createIndex('to_id', 'to_id', { unique: false });
          store.createIndex('triple', ['from_id', 'to_id', 'type'], { unique: false });
          store.createIndex('ts', 'ts', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_INDEX)) {
          const store = db.createObjectStore(STORE_INDEX, { keyPath: 'id' });
          store.createIndex('token', 'token', { unique: false });
          store.createIndex('entity_id', 'entity_id', { unique: false });
        }
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => reject(req.error ?? new Error('IDB open failed'));
    });
  }

  private async saveEntity(entity: KGEntity): Promise<void> {
    if (this.storage === 'memory-fallback') {
      this.memEntities.set(entity.id, entity);
      return;
    }
    const db = await this.openDb();
    /* Persiste avec champs name_lower / type_lower pour index */
    const stored: KGEntity & { name_lower: string; type_lower: string } = {
      ...entity,
      name_lower: entity.name.toLowerCase(),
      type_lower: entity.type.toLowerCase(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ENTITIES, 'readwrite');
      tx.objectStore(STORE_ENTITIES).put(stored);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error ?? new Error('saveEntity failed'));
    });
  }

  private async saveRelation(relation: KGRelation): Promise<void> {
    if (this.storage === 'memory-fallback') {
      this.memRelations.set(relation.id, relation);
      return;
    }
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_RELATIONS, 'readwrite');
      tx.objectStore(STORE_RELATIONS).put(relation);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error ?? new Error('saveRelation failed'));
    });
  }

  private async findEntityByNameType(name: string, type: string): Promise<KGEntity | null> {
    if (this.storage === 'memory-fallback') {
      const nameLower = name.toLowerCase();
      const typeLower = type.toLowerCase();
      for (const e of this.memEntities.values()) {
        if (e.name.toLowerCase() === nameLower && e.type.toLowerCase() === typeLower) return e;
      }
      return null;
    }
    const db = await this.openDb();
    return new Promise<KGEntity | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_ENTITIES, 'readonly');
        const idx = tx.objectStore(STORE_ENTITIES).index('name_type');
        const req = idx.get([name.toLowerCase(), type.toLowerCase()]);
        req.onsuccess = (): void => {
          const result = req.result as KGEntity | undefined;
          resolve(result ?? null);
        };
        req.onerror = (): void => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async findRelation(
    fromId: string,
    toId: string,
    type: string,
  ): Promise<KGRelation | null> {
    if (this.storage === 'memory-fallback') {
      for (const r of this.memRelations.values()) {
        if (r.from_id === fromId && r.to_id === toId && r.type === type) return r;
      }
      return null;
    }
    const db = await this.openDb();
    return new Promise<KGRelation | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_RELATIONS, 'readonly');
        const idx = tx.objectStore(STORE_RELATIONS).index('triple');
        const req = idx.get([fromId, toId, type]);
        req.onsuccess = (): void => {
          const result = req.result as KGRelation | undefined;
          resolve(result ?? null);
        };
        req.onerror = (): void => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async findRelationsByEntity(entityId: string): Promise<KGRelation[]> {
    if (this.storage === 'memory-fallback') {
      const out: KGRelation[] = [];
      for (const r of this.memRelations.values()) {
        if (r.from_id === entityId || r.to_id === entityId) out.push(r);
      }
      return out;
    }
    const db = await this.openDb();
    /* Combine deux sous-requêtes (from_id + to_id) puis dedupe */
    const fetch = (indexName: string): Promise<KGRelation[]> =>
      new Promise<KGRelation[]>((resolve) => {
        try {
          const tx = db.transaction(STORE_RELATIONS, 'readonly');
          const idx = tx.objectStore(STORE_RELATIONS).index(indexName);
          const req = idx.getAll(entityId);
          req.onsuccess = (): void => resolve((req.result as KGRelation[]) ?? []);
          req.onerror = (): void => resolve([]);
        } catch {
          resolve([]);
        }
      });
    const [outgoing, incoming] = await Promise.all([fetch('from_id'), fetch('to_id')]);
    const seen = new Set<string>();
    const merged: KGRelation[] = [];
    for (const r of [...outgoing, ...incoming]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      merged.push(r);
    }
    return merged;
  }

  private async indexEntityTokens(entity: KGEntity): Promise<void> {
    if (this.storage === 'memory-fallback') {
      /* En mode mirror, recherche full-text faite à la volée via scan complet
         (cf. lookupTokenIndex memory branch) — pas besoin d'index dédié. */
      return;
    }
    const tokens = new Set<string>();
    for (const tok of tokenize(entity.name)) tokens.add(tok);
    for (const obs of entity.observations) {
      const obsTokens = tokenize(obs);
      for (const tok of obsTokens.slice(0, MAX_TOKENS_INDEXED_PER_OBS)) {
        tokens.add(tok);
      }
    }
    /* Ajoute aussi le type comme token-pivot (utile pour search par type) */
    for (const tok of tokenize(entity.type)) tokens.add(tok);

    try {
      const db = await this.openDb();
      /* 1) Purge des index pointant vers cette entité (réindexation propre) */
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_INDEX, 'readwrite');
        const idx = tx.objectStore(STORE_INDEX).index('entity_id');
        const cursorReq = idx.openCursor(IDBKeyRange.only(entity.id));
        cursorReq.onsuccess = (): void => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('index purge failed'));
      });

      /* 2) Insère nouveaux tokens */
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_INDEX, 'readwrite');
        const store = tx.objectStore(STORE_INDEX);
        for (const tok of tokens) {
          const id = `${entity.id}__${tok}`;
          store.put({ id, entity_id: entity.id, token: tok });
        }
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('index insert failed'));
      });
    } catch (err) {
      logger.warn('mcp-memory-server', 'indexEntityTokens failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async lookupTokenIndex(token: string): Promise<string[]> {
    if (this.storage === 'memory-fallback') {
      const out: string[] = [];
      for (const e of this.memEntities.values()) {
        const haystack = `${e.name.toLowerCase()} ${e.type.toLowerCase()} ${e.observations.join(' ').toLowerCase()}`;
        if (haystack.includes(token)) out.push(e.id);
      }
      return out;
    }
    try {
      const db = await this.openDb();
      return await new Promise<string[]>((resolve) => {
        try {
          const tx = db.transaction(STORE_INDEX, 'readonly');
          const idx = tx.objectStore(STORE_INDEX).index('token');
          const req = idx.getAll(token);
          req.onsuccess = (): void => {
            const rows = (req.result as Array<{ entity_id: string }>) ?? [];
            resolve(rows.map((r) => r.entity_id));
          };
          req.onerror = (): void => resolve([]);
        } catch {
          resolve([]);
        }
      });
    } catch {
      return [];
    }
  }

  private async maybeRotateEntities(): Promise<void> {
    if (this.storage === 'memory-fallback') {
      if (this.memEntities.size <= MAX_ENTITIES) return;
      /* FIFO sur ts asc */
      const sorted = Array.from(this.memEntities.values()).sort((a, b) => a.ts - b.ts);
      const toDelete = sorted.slice(0, sorted.length - MAX_ENTITIES);
      for (const e of toDelete) this.memEntities.delete(e.id);
      return;
    }
    const all = await this.idbGetAll<KGEntity>(STORE_ENTITIES);
    if (all.length <= MAX_ENTITIES) return;
    all.sort((a, b) => a.ts - b.ts);
    const toDelete = all.slice(0, all.length - MAX_ENTITIES);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_ENTITIES, STORE_INDEX], 'readwrite');
        const entStore = tx.objectStore(STORE_ENTITIES);
        const idxStore = tx.objectStore(STORE_INDEX);
        const idxByEntity = idxStore.index('entity_id');
        for (const e of toDelete) {
          entStore.delete(e.id);
          const cursorReq = idxByEntity.openCursor(IDBKeyRange.only(e.id));
          cursorReq.onsuccess = (): void => {
            const cursor = cursorReq.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        }
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('rotate entities failed'));
      });
    } catch (err) {
      logger.warn('mcp-memory-server', 'maybeRotateEntities failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async maybeRotateRelations(): Promise<void> {
    if (this.storage === 'memory-fallback') {
      if (this.memRelations.size <= MAX_RELATIONS) return;
      const sorted = Array.from(this.memRelations.values()).sort((a, b) => a.ts - b.ts);
      const toDelete = sorted.slice(0, sorted.length - MAX_RELATIONS);
      for (const r of toDelete) this.memRelations.delete(r.id);
      return;
    }
    const count = await this.idbCount(STORE_RELATIONS);
    if (count <= MAX_RELATIONS) return;
    const all = await this.idbGetAll<KGRelation>(STORE_RELATIONS);
    all.sort((a, b) => a.ts - b.ts);
    const toDelete = all.slice(0, all.length - MAX_RELATIONS);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_RELATIONS, 'readwrite');
        const store = tx.objectStore(STORE_RELATIONS);
        for (const r of toDelete) store.delete(r.id);
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('rotate relations failed'));
      });
    } catch (err) {
      logger.warn('mcp-memory-server', 'maybeRotateRelations failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /* ======================================================================== */
  /* IDB helpers génériques */
  /* ======================================================================== */

  private async idbGet<T>(storeName: string, key: string): Promise<T | null> {
    try {
      const db = await this.openDb();
      return await new Promise<T | null>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).get(key);
          req.onsuccess = (): void => resolve((req.result as T | undefined) ?? null);
          req.onerror = (): void => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  private async idbGetAll<T>(storeName: string): Promise<T[]> {
    try {
      const db = await this.openDb();
      return await new Promise<T[]>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = (): void => resolve((req.result as T[]) ?? []);
          req.onerror = (): void => resolve([]);
        } catch {
          resolve([]);
        }
      });
    } catch {
      return [];
    }
  }

  private async idbCount(storeName: string): Promise<number> {
    try {
      const db = await this.openDb();
      return await new Promise<number>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).count();
          req.onsuccess = (): void => resolve(req.result ?? 0);
          req.onerror = (): void => resolve(0);
        } catch {
          resolve(0);
        }
      });
    } catch {
      return 0;
    }
  }
}

/* ========================================================================== */
/* Helpers internes */
/* ========================================================================== */

function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') /* strip accents */
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const raw = normalized.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of raw) {
    if (tok.length < 2) continue;
    if (STOP_WORDS.has(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/* ========================================================================== */
/* Singleton */
/* ========================================================================== */

export const mcpMemoryServer = new MCPMemoryServer();
