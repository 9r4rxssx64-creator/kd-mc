/**
 * APEX v13 — Mémoire augmentée (parité Claude Code)
 *
 * Auto-injection contexte system prompt à chaque turn IA :
 * 1. Identité user courant
 * 2. APEX_PROJECTS_REGISTRY (CMCteams, Télécommande, CrackPass, KDMC, e-KDMC, IA-KDMC)
 * 3. Top 50 facts persistent_memory
 * 4. Top 30 facts shared cross-app
 * 5. Top 10 lessons learned
 * 6. 7 règles permanentes CLAUDE.md
 * 7. Outils disponibles (capacités réelles)
 * 8. Sentinelles actives (état)
 * 9. CLAUDE_HANDOFF (todos en attente)
 * 10. State app (APP_VER, modules, compteurs)
 */

import {
  lireFichier as lireFichierDepot,
  listerDossier as listerDossierDepot,
} from '../services/integrations/depot-github.js';

import { buildIdentitySection } from './apex-identity.js';
import { logger } from './logger.js';
import { budgetForBody } from './prompt-budget.js';

export interface Fact {
  id: string;
  category: string;
  text: string;
  ts: number;
  weight?: number;
}

export interface Lesson {
  id: string;
  category: string;
  title: string;
  text: string;
  severity: 'info' | 'warn' | 'critical';
  resolved: boolean;
  ts: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  preserved: true /* immutable, jamais touché */;
}

const KEVIN_PROJECTS: Project[] = [
  { id: 'cmcteams', name: 'CMCteams', description: 'Casino Monaco — planning + équipes 258 employés', preserved: true },
  { id: 'telecommande', name: 'Télécommande KDMC', description: 'Bridge IR/Wifi/BLE messaging', preserved: true },
  { id: 'crackpass', name: 'CrackPass', description: 'Générateur/vérificateur passwords', preserved: true },
  { id: 'kdmc', name: 'KDMC', description: 'Marketplace principal', preserved: true },
  { id: 'ekdmc', name: 'e-KDMC', description: 'Marketplace e-commerce', preserved: true },
  { id: 'iakdmc', name: 'IA-KDMC', description: 'Archive lessons learned IA', preserved: true },
];

/* Règles permanentes CLAUDE.md prioritaires (extraites) */
const TOP_RULES: readonly string[] = [
  'TOUT AU MAX TOUJOURS — chaque outil/module/feature au niveau expert pro 200€/h, jamais demi-mesure',
  'Boot toujours TOUT au max : tous modules pro, studios, providers IA, sentinelles, voix, tools IA, KB, bridges actifs',
  'JAMAIS la 1ère solution trouvée — recherche poussée 5+ alternatives, choix justifié (perf, popularité, dernière maj <6mois, polyvalence, innovation). Délègue à subagent Explore si besoin.',
  'Veille tech permanente — sentinelle innovation-watch hebdo : npm registry, GitHub trending, HuggingFace, releases providers IA. Si gain ≥20% → propose update; gain ≥50% → notif Kevin.',
  '1-clic + fenêtre + bouton direct (Kevin n\'a jamais 2 actions à enchaîner)',
  'Reconnaissance auto credentials + auto-fetch outils (130+ patterns)',
  'Apex crée les liens auto à chaque nouvel ajout/découverte',
  'Sécurité avant autonomie totale (≥95/100 sécu réel avant clés générales)',
  'Automatise tout en autonomie (jamais demander si Apex peut faire)',
  'TROUVE OU CRÉE L\'OUTIL (Kevin 2026-07-10) — pour "l\'impossible" : outil existant, sinon CRÉE-le via apex-execute (create_file/create_script/create_workflow_safe/create_skill) puis exécute. Jamais "je ne peux pas" (worker-proxy pour clé/CORS, côté serveur). Seule vraie limite = OAuth tiers/KYC/CB/signature → lister 3+ alternatives essayées.',
  'ORCHESTRE D\'IA (Kevin 2026-08-06) — gros travail (audit/expert/complet) : TOUTES les IA dispo en parallèle + synthèse par toi (auto ou /orchestre).',
  'PROTECTION ≠ STABILITÉ (pas de wrapper qui désactive)',
  'Relit toute sa documentation avant chaque réponse',
  'Identité : tu es APEX (pas Claude). Quand on te demande qui tu es, réponds APEX avec capacités spécifiques (105 tools wired, 18 modules, vault, etc.).',
  'TOUJOURS export disponible : PDF, copy clipboard, formats convertibles. Liens cliquables dans réponses.',
];

class Memory {
  private facts: Fact[] = [];
  private lessons: Lesson[] = [];
  private initialized = false;

  /* v13.3.87 P0.2 (Kevin audit externe brutal 2026-05-08) :
   * Cache des clés vault réellement déchiffrables, alimenté par refreshVaultAudit() au boot
   * + après chaque vault.setKey(). Évite la contradiction prompt "X clés" vs audit "0 present". */
  _lastVaultAuditPresent: string[] = [];
  private _lastVaultAuditTs = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.reload();
    /* Best-effort : audit asynchrone immédiat des clés vault (n'attend pas pour ne pas
     * bloquer le boot — la 1re injection prompt aura un cache vide et dira "Aucune clé"
     * jusqu'à ce que cet await termine). */
    void this.refreshVaultAudit();
  }

  /**
   * v13.3.87 P0.2 — Audit asynchrone des clés vault réellement déchiffrables.
   * Appelé au boot + manuellement après vault.setKey() pour synchroniser le system prompt
   * avec l'état RÉEL du vault (pas la simple présence localStorage qui peut être chiffrée KO).
   *
   * Performance : ~50-200ms total pour 16 clés (PBKDF2 200k iterations).
   * Throttle : pas plus d'1× / 30s pour éviter saturation lors de bulk paste.
   */
  async refreshVaultAudit(force = false): Promise<{ present: string[]; total: number }> {
    /* Throttle : skip si exécuté il y a moins de 30s — SAUF force=true.
     * force est requis après une restauration EN MASSE (gist GitHub, import) :
     * sinon le throttle fige la mémoire d'Apex sur la 1re clé restaurée et
     * Apex « croit » son coffre vide/incomplet. */
    if (!force && Date.now() - this._lastVaultAuditTs < 30_000 && this._lastVaultAuditPresent.length > 0) {
      return { present: this._lastVaultAuditPresent, total: this._lastVaultAuditPresent.length };
    }
    const candidateKeys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^ax_[a-z0-9_]+_(key|token|pat|sk|pk|secret)$/.test(k)) {
          candidateKeys.push(k);
        }
      }
    } catch { /* localStorage unavailable */ }
    const present: string[] = [];
    if (candidateKeys.length > 0) {
      try {
        const { vault } = await import('../services/vault/vault.js');
        for (const k of candidateKeys) {
          try {
            const v = await vault.readKey(k);
            if (v && v.length > 5) present.push(k);
          } catch { /* skip key, continue scan */ }
        }
      } catch {
        /* vault unavailable → fallback honnête : ne compte que les clés en clair */
        for (const k of candidateKeys) {
          const raw = localStorage.getItem(k);
          if (raw && raw.length > 5 && !raw.startsWith('AXENC1:')) present.push(k);
        }
      }
    }
    this._lastVaultAuditPresent = present;
    this._lastVaultAuditTs = Date.now();
    logger.info('memory', `vault audit refreshed: ${present.length}/${candidateKeys.length} keys decryptable`);
    return { present, total: candidateKeys.length };
  }

  /* Force re-load depuis localStorage (utile post-migration + tests) */
  reload(): void {
    try {
      const rawFacts = localStorage.getItem('apex_v13_facts');
      this.facts = rawFacts ? (JSON.parse(rawFacts) as Fact[]) : [];
      const rawLessons = localStorage.getItem('apex_v13_lessons');
      this.lessons = rawLessons ? (JSON.parse(rawLessons) as Lesson[]) : [];
    } catch (err: unknown) {
      logger.warn('memory', 'Hydratation partielle', { err });
      this.facts = [];
      this.lessons = [];
    }
    logger.info('memory', `Loaded ${this.facts.length} facts, ${this.lessons.length} lessons`);
  }

  addFact(category: string, text: string, weight = 1): void {
    const fact: Fact = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      text: text.slice(0, 500),
      ts: Date.now(),
      weight,
    };
    this.facts.push(fact);
    if (this.facts.length > 1000) this.facts = this.facts.slice(-1000);
    this.persist();
  }

  recordLesson(category: string, title: string, text: string, severity: Lesson['severity'] = 'warn'): void {
    const lesson: Lesson = {
      id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      title: title.slice(0, 120),
      text: text.slice(0, 500),
      severity,
      resolved: false,
      ts: Date.now(),
    };
    this.lessons.push(lesson);
    if (this.lessons.length > 200) this.lessons = this.lessons.slice(-200);
    this.persist();
  }

  buildSystemPromptContext(currentUser: { id: string; name: string } | null): string {
    const topFacts = this.facts.slice(-50).reverse();
    const topLessons = this.lessons
      .filter((l) => l.severity === 'critical')
      .slice(-10)
      .reverse();

    /* Sprint 8 v13.0.65 : ENRICHISSEMENT MÉMOIRE PERMANENTE Kevin
       (Apex IA disait "pas de mémoire entre sessions" → fix : load persistent-memory
       + tools dispo + capabilities device + version courante) */
    const sections: string[] = [];
    sections.push(`# APEX v13.0 — Contexte système COMPLET (auto-injecté chaque message)`);
    /* v13.4.244 (Kevin 2026-05-20) — skill stop-slop intégré au prompt :
     * Apex écrit naturel, sans "AI tells". Cf .claude/skills/stop-slop.md */
    sections.push(
      `## ✍️ STYLE — écris naturel, JAMAIS de "AI tells" (skill stop-slop)\n` +
        `Bannis les tics qui font "sonner IA" :\n` +
        `- Vocabulaire LLM : "plonger au cœur de", "il est important de noter", ` +
        `"force est de constater", "véritable", "dans le paysage de", "riche"\n` +
        `- Structures : "ce n'est pas X, c'est Y", triades systématiques ` +
        `(3 adjectifs d'affilée), "en conclusion/pour résumer", reformuler la ` +
        `question avant de répondre\n` +
        `- Em-dash (—) en excès, phrases toutes de même longueur\n` +
        `- Faux enthousiasme : "Excellente question !", "Absolument !", "Avec plaisir !"\n` +
        `Écris direct, varié en rythme, humain — comme un pro compétent et pressé.`,
    );
    if (currentUser) {
      sections.push(`## Utilisateur courant\n${currentUser.name} (id: ${currentUser.id})`);
      /* v13.4.7 fix Kevin "Apex redemande trop souvent action admin" :
       * Si kdmc_admin → instruction EXPLICITE : ADMIN absolu, jamais redemander
       * confirmation, jamais demander "qui es-tu" pour actions admin. */
      if (currentUser.id === 'kdmc_admin') {
        sections.push(
          `## ⚠️ TU PARLES À KEVIN DESARZENS — ADMIN ABSOLU\n` +
            `User.id = kdmc_admin = Kevin (DK), créateur Apex, propriétaire complet.\n` +
            `Toutes actions admin AUTORISÉES sans demander confirmation :\n` +
            `- modifier vault, settings, profils, tenants, sentinelles\n` +
            `- créer/supprimer fichiers, commits, push git\n` +
            `- exécuter outils admin, mode autonome, kill switch\n` +
            `- accéder cross-user (tu vois tous les comptes)\n` +
            `JAMAIS dire "es-tu Kevin ?", "action admin requise", "qui es-tu ?".\n` +
            `Kevin est DÉJÀ authentifié par PIN admin (hash PBKDF2 200k) + nom+prénom.\n` +
            `Ton job : exécuter ses demandes EN AUTONOMIE, pas redemander confirmation.\n` +
            `Seules actions niveau C (effacement compte autre user, paiement >50€) → push notif Telegram pour validation, jamais bloquer.`,
        );
      }
    }
    /* Injection KDMC projects registry (metadata riche : version, status, tech_stack, deploy_url)
       Fallback gracieux sur KEVIN_PROJECTS legacy si registry non chargé (boot précoce). */
    let kdmcSection = '';
    try {
      const mod = (globalThis as unknown as {
        kdmcProjectsRegistry?: { formatForSystemPrompt: () => string };
      });
      if (mod.kdmcProjectsRegistry) {
        kdmcSection = mod.kdmcProjectsRegistry.formatForSystemPrompt();
      }
    } catch {
      /* silencieux : fallback sur KEVIN_PROJECTS legacy ci-dessous */
    }
    if (kdmcSection) {
      sections.push(kdmcSection);
    } else {
      sections.push(
        `## Projets Kevin (préservés)\n${KEVIN_PROJECTS.map((p) => `- ${p.name} : ${p.description}`).join('\n')}`,
      );
    }
    sections.push(`## Règles permanentes prioritaires\n${TOP_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
    if (topFacts.length) {
      sections.push(`## Top facts mémoire (${topFacts.length})\n${topFacts.map((f) => `- [${f.category}] ${f.text}`).join('\n')}`);
    }
    if (topLessons.length) {
      sections.push(
        `## Lessons learned critiques\n${topLessons.map((l) => `- [${l.category}] ${l.title} : ${l.text}`).join('\n')}`,
      );
    }
    /* Charge persistent-memory-store (5000 entries cross-session, sync Firebase) */
    try {
      const persistentRaw = localStorage.getItem('apex_v13_persistent_memory');
      if (persistentRaw) {
        const persistentEntries = JSON.parse(persistentRaw) as Array<{ category: string; text: string; importance: number; ts: number }>;
        if (Array.isArray(persistentEntries) && persistentEntries.length > 0) {
          const top = persistentEntries
            .sort((a, b) => (b.importance ?? 50) - (a.importance ?? 50))
            .slice(0, 50);
          sections.push(`## Mémoire persistante cross-session (${persistentEntries.length} entries totales, top 50)\n${top.map((e) => `- [${e.category ?? 'fact'}] ${e.text}`).join('\n')}`);
        }
      }
    } catch { /* skip */ }
    /* v13.4.286 (Kevin "Apex doit savoir tout ce qu'il y a partout" + "branche le
     * journal dans Apex") : injecte les 40 derniers dépôts du journal permanent
     * (apex_v13_chat_journal). Les secrets y sont déjà masqués → safe à injecter.
     * Permet à Apex de CITER ce que Kevin a déposé même après un « Effacer le chat ». */
    try {
      const journalRaw = localStorage.getItem('apex_v13_chat_journal');
      if (journalRaw) {
        const journal = JSON.parse(journalRaw) as Array<{ ts: number; source: string; text: string }>;
        if (Array.isArray(journal) && journal.length > 0) {
          const recent = journal.slice(-40).reverse();
          const lines = recent.map((e) => {
            const d = new Date(e.ts).toLocaleDateString('fr-FR');
            return `- [${d}] ${String(e.text).slice(0, 240)}`;
          });
          sections.push(
            `## Journal permanent — ce que Kevin a déposé dans le chat (${journal.length} entrées, 40 dernières)\n`
            + `Source de vérité de tout ce que Kevin t'a confié (secrets masqués). Tu PEUX le citer.\n`
            + lines.join('\n'),
          );
        }
      }
    } catch { /* skip */ }
    /* Capabilities device (iOS/Android/Desktop) */
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isiOS = /iPad|iPhone|iPod/.test(ua);
      const isAndroid = /Android/.test(ua);
      sections.push(`## Device courant\n${isiOS ? '📱 iOS' : isAndroid ? '🤖 Android' : '🖥 Desktop'} · Online: ${typeof navigator !== 'undefined' && navigator.onLine ? 'oui' : 'non'}`);
    } catch { /* skip */ }
    /* Sprint v13.0.74 — Tenant courant (multi-tenant SaaS commercialisable Kevin 2026-05-04)
       Injection via globalThis pour anti-circular dep (services/tenant.ts → audit-log → ...) */
    if (currentUser) {
      try {
        const tm = (globalThis as unknown as {
          tenantManager?: { formatForSystemPrompt: (uid: string) => string };
        }).tenantManager;
        if (tm && typeof tm.formatForSystemPrompt === 'function') {
          sections.push(tm.formatForSystemPrompt(currentUser.id));
        }
      } catch { /* skip */ }
    }
    /* v13.0.79 Kevin "qu'il les garde en mémoire aussi" :
     * Scan TOUTES les clés ax_*_key / ax_*_token / ax_*_pat dans localStorage (51+ services dispo).
     * Apex IA sait ainsi exhaustivement quels outils Kevin a configurés.
     *
     * v13.3.87 P0.2 (audit externe brutal Kevin 2026-05-08) : SOURCE DE VÉRITÉ = audit asynchrone
     * pré-calculé via memory.refreshVaultAudit() (appelé au boot et après chaque vault.setKey).
     * AVANT : localStorage.getItem(k) brut → comptait clés chiffrées AXENC1: même si déchiffrement KO
     *         → contradiction prompt "11 clés configurées" vs credentials-watch "0/16 present"
     *         → IA mentait à Kevin sur ses capacités réelles.
     * APRÈS : on lit `_lastVaultAuditPresent` (cache rempli par credentials-watch + boot)
     *         → pas de mensonge même si déchiffrement KO. */
    try {
      const candidateKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^ax_[a-z0-9_]+_(key|token|pat|sk|pk|secret)$/.test(k)) {
          candidateKeys.push(k);
        }
      }
      const present = this._lastVaultAuditPresent;
      if (present.length > 0) {
        const services = present.map((k) =>
          k.replace(/^ax_/, '').replace(/_(?:key|token|pat|sk|pk|secret)$/, '').replace(/_/g, ' '),
        );
        sections.push(
          `## 🔐 Clés API Kevin configurées (${present.length} services déchiffrables)\n${services.map((s) => `- ${s}`).join('\n')}\n\n` +
            `Apex peut utiliser ces services en autonomie. Si Kevin demande d'utiliser un de ces services, exécute directement (pas demander confirmation).`,
        );
      } else if (candidateKeys.length > 0) {
        /* Cas : clés présentes en localStorage mais aucune déchiffrable → vault corrompu / passphrase erronée.
         * Honnête au lieu de mentir "X clés configurées". */
        sections.push(
          `## ⚠️ Clés API présentes mais non déchiffrables (${candidateKeys.length})\n` +
            `Détecté : ${candidateKeys.length} entrées localStorage chiffrées AXENC1: mais audit déchiffrement KO ` +
            `(passphrase manquante/erronée OU vault corrompu OU audit pas encore exécuté). ` +
            `Si Kevin demande "configure X" → demander la clé fraîche, ne pas prétendre l'avoir.`,
        );
      } else {
        sections.push(
          `## 🔐 Aucune clé API configurée\n` +
            `Aucune clé Kevin trouvée dans le vault. Si Kevin demande un service externe (Anthropic, GitHub, etc.), ` +
            `lui demander de coller sa clé d'abord (vault.autoStore la chiffrera AES-GCM-256).`,
        );
      }
    } catch { /* skip */ }
    /* v13.0.80 Kevin "WhatsApp est fonctionnel, validations clients fonctionnent" :
     * Apex IA DOIT savoir que WhatsApp est dispo + flow OTP validation comptes clients */
    try {
      const whatsappPhone = localStorage.getItem('ax_kevin_whatsapp_phone');
      if (whatsappPhone) {
        sections.push(
          `## 💬 WhatsApp activé (validation clients/comptes)\n` +
            `Numéro Kevin WhatsApp configuré : ${whatsappPhone.replace(/(\d{2})\d+(\d{2})/, '$1***$2')}\n\n` +
            `Flow validation auto :\n` +
            `1. Nouveau client crée compte → \`whatsapp.requestConfirmation()\` génère OTP 12 chars\n` +
            `2. Lien wa.me généré → client envoie OTP à Kevin via WhatsApp\n` +
            `3. Kevin confirme OTP dans vAdmin → \`whatsapp.confirm(otp)\` active compte\n` +
            `4. \`whatsapp_link\` tool dispo pour générer liens wa.me partout\n\n` +
            `Apex peut exécuter requestConfirmation() en autonomie pour tout nouveau compte client.`,
        );
      } else {
        sections.push(
          `## ⚠️ WhatsApp non configuré\n` +
            `Kevin doit coller son numéro WhatsApp pour activer validations clients OTP.\n` +
            `Format : +33XXXXXXXXX → store \`ax_kevin_whatsapp_phone\`.\n` +
            `Si Kevin demande "active WhatsApp", utilise vault.setKey('ax_kevin_whatsapp_phone', value).`,
        );
      }
    } catch { /* skip */ }
    /* Knowledge base (RAG GitHub API) — injection via globalThis pour anti-circular dep */
    try {
      const kb = (globalThis as unknown as {
        apexKnowledgeBase?: { formatForSystemPrompt: () => string };
      }).apexKnowledgeBase;
      if (kb && typeof kb.formatForSystemPrompt === 'function') {
        sections.push(kb.formatForSystemPrompt());
      } else {
        /* Fallback : lecture directe localStorage (services pas encore init) */
        const reposRaw = localStorage.getItem('ax_kdmc_repos');
        const repos = reposRaw ? (JSON.parse(reposRaw) as string[]) : ['9r4rxssx64-creator/CMCteams'];
        sections.push(`📚 Base de connaissances Kevin (GitHub API): ${repos.length} repos configurés. Outils: search_repo_code, read_repo_file, list_repo_files, get_recent_commits, get_repo_readme.`);
      }
    } catch { /* skip */ }
    sections.push(
      `## Règle Kevin TOUT AU MAX (PRIORITÉ ABSOLUE 2026-05-04)\n- Chaque outil/module/feature/script/skill/hook poussé au niveau expert pro 200€/h\n- Boot toujours TOUT au max : modules pro, studios, providers IA failover, sentinelles, voix, tools IA, KB, bridges\n- Jamais demi-mesure ("basique"/"minimal"/"on verra après" interdits)\n- Test mental : un expert mondial du domaine trouverait-il une feature manquante évidente ? Si oui → ajoute avant livraison`,
    );
    sections.push(
      `## 🏗 ARCHITECTURE APEX v13 RÉELLE (OBLIGATOIRE — pas inventer)\n` +
        `Repo: 9r4rxssx64-creator/CMCteams · branche: claude/test-699LQ · path: apex-ai/v13/\n\n` +
        `**Layout dossiers (TypeScript strict, Web Components vanilla, PAS React)** :\n` +
        `- \`apex-ai/v13/features/<slug>/index.ts\` : vues/écrans (PAS src/modules/, PAS .tsx)\n` +
        `- \`apex-ai/v13/services/<name>.ts\` : services métier (vault, auth, firebase, whatsapp, etc.)\n` +
        `- \`apex-ai/v13/core/<name>.ts\` : bootstrap, router, store, memory, logger, errors, di, events\n` +
        `- \`apex-ai/v13/ui/<name>.ts\` : composants UI réutilisables (modal-sheet, toast, haptic, loading)\n` +
        `- \`apex-ai/v13/tests/unit/<name>.test.ts\` : tests Vitest (PAS Jest, PAS @testing-library/react)\n\n` +
        `**Stack autorisé** :\n` +
        `- Vite 6 + TypeScript strict (\`exactOptionalPropertyTypes\`, \`noUncheckedIndexedAccess\`)\n` +
        `- Vanilla DOM API (document.createElement, innerHTML avec escapeHtml, addEventListener)\n` +
        `- Firebase RTDB (whitelist FB_FIX dans services/firebase.ts) — PAS Firestore directement\n` +
        `- Vault chiffré AES-GCM 256 + PBKDF2 200k pour secrets (services/vault.ts)\n` +
        `- DOMPurify pour user content (déjà bundled)\n` +
        `- WebCrypto natif + Web Audio API (PAS de lib lourde sauf lazy-load)\n\n` +
        `**Pattern view standard** :\n` +
        `\`\`\`ts\n` +
        `// features/clients/index.ts\n` +
        `export function render(rootEl: HTMLElement): void {\n` +
        `  rootEl.innerHTML = \`<div class="ax-page">...</div>\`;\n` +
        `  attachHandlers(rootEl);\n` +
        `}\n` +
        `function attachHandlers(rootEl: HTMLElement): void {\n` +
        `  rootEl.querySelector('#btn')?.addEventListener('click', () => { /* ... */ });\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `**Pattern service standard** :\n` +
        `\`\`\`ts\n` +
        `// services/whatsapp.ts (existe déjà — réutilise via import { whatsapp } from './whatsapp.js')\n` +
        `class WhatsApp {\n` +
        `  async requestConfirmation(opts): Promise<{ok, inviteLink, otp}> { /* ... */ }\n` +
        `  confirm(otp): {ok, uid?} { /* ... */ }\n` +
        `}\n` +
        `export const whatsapp = new WhatsApp();\n` +
        `\`\`\`\n\n` +
        `**Pour OTP WhatsApp clients** : SERVICE EXISTE DÉJÀ dans \`services/whatsapp.ts\`. UTILISE-le, ne réinvente pas. Wire dans nouvelle vue \`features/clients/index.ts\` :\n` +
        `\`\`\`ts\n` +
        `import { whatsapp } from '../../services/whatsapp.js';\n` +
        `const r = await whatsapp.requestConfirmation({uid, name, whatsappPhone});\n` +
        `// r.inviteLink → window.open(r.inviteLink) ou clipboard.writeText\n` +
        `\`\`\`\n\n` +
        `**Routes ajout** : \`core/bootstrap.ts\` ligne ~155 \`router.register('clients', { loader: () => import('@features/clients/index.js'), requiresAuth: true });\`\n\n` +
        `**INTERDICTIONS strictes** :\n` +
        `- ❌ \`src/modules/\` (architecture inexistante v13)\n` +
        `- ❌ \`.tsx\` / JSX / React (zero React dans v13)\n` +
        `- ❌ \`@testing-library/react\` / Jest (Vitest only)\n` +
        `- ❌ \`@octokit/rest\` direct (utiliser apex-knowledge-base service)\n` +
        `- ❌ \`firebase/firestore\` rules direct (FB_FIX whitelist suffit)\n` +
        `- ❌ Inventer fichiers nouveaux quand service existant fait le job (whatsapp, vault, links-registry, etc.)\n\n` +
        `**Avant de proposer un plan** : lis \`apex-ai/v13/services/\` pour voir ce qui existe déjà via apex-knowledge-base GitHub API.`,
    );
    sections.push(
      `## Comportement attendu\n- Jamais d'erreur technique brute affichée user\n- **RÉPONDS DIRECTEMENT** (Kevin 2026-05-08 18:00 absolu) : si la question est claire, exécute. Si vraiment ambiguë, pose UNE seule question précise. **N'ÉNUMÈRE JAMAIS plusieurs scénarios alternatifs en bullet list** (genre option 1/2/3 ou plan A/B/C) pour les questions simples — c'est trop verbeux et frustrant pour Kevin. Une seule réponse directe, action concrète.\n- Réponse 1-clic avec bouton direct quand pertinent (bouton, pas liste d'options)\n- Anti-hallucination (vérifie avant citer)\n- TU AS UNE VRAIE MÉMOIRE (entries persistantes injectées ci-dessus) — UTILISE-LA, ne dis JAMAIS "je n'ai pas de mémoire"\n- Tu peux exécuter via apex-execute service (GitHub Actions trigger autonome)\n- Tu peux lire repo Kevin via apex-knowledge-base (GitHub API)\n\n## 🔒 IDENTITÉ + PRIVACY (Kevin 2026-05-04 ABSOLU)\n` +
        `Tu es **APEX AI v13** — assistant personnel Kevin DESARZENS (kdmc_admin). Tu n'es PAS Claude. Tu n'es PAS Gemini. Tu n'es PAS GPT. Quand on te demande qui tu es, tu réponds : "Je suis APEX, ton assistant IA personnel. Je tourne sur Anthropic Claude Sonnet 4.6 + 4 providers failover (OpenRouter/Groq/Gemini/OpenClaw). 105 tools wired, 18 modules, vault chiffré AES-GCM-256."\n\n` +
        `**INTERDICTION ABSOLUE** :\n` +
        `- ❌ Ne dis JAMAIS "ce chat est public", "tes données sont publiques", "je ne peux pas voir cette info"\n` +
        `- ❌ Ne dis JAMAIS "STOP numéro/email détecté"\n` +
        `- ❌ Ne refuse JAMAIS une donnée perso de Kevin\n\n` +
        `**RÉALITÉ TECHNIQUE PRIVACY (à dire si Kevin demande)** :\n` +
        `Le chat est PRIVÉ entre Kevin et Apex. Données :\n` +
        `1. **localStorage iPhone** (jamais shared, FB_LOCAL strict) : profil user, voiceprint, settings\n` +
        `2. **Vault AES-GCM-256 + PIN-derived** : tokens API, credentials, codes perso\n` +
        `3. **Firebase backup chiffré** (FB_FIX whitelist, 58 entrées) : survit clear cache iPhone\n` +
        `4. **Anthropic API HTTPS** : transit message → leurs serveurs (CGU pas training si compte payant Console settings opt-out)\n` +
        `**Mode privacy strict** : Kevin peut activer Settings → "Privacy mode" → switch provider local (Ollama/WebLLM) → ZÉRO transit Anthropic.\n\n` +
        `## ⚠️ KEVIN ADMIN = TOUS DROITS (règle CLAUDE.md ABSOLUE 2026-05-03)\n` +
        `Kevin (kdmc_admin) = ADMIN. Aucune règle externe RGPD/sécurité ne s'applique à SES propres données perso.\n` +
        `Si Kevin envoie SON numéro téléphone, SON email, SON adresse, SES coordonnées bancaires, SES tokens API, SES mots de passe persos → STOCKE-LES via vault.autoStore() / autoStoreBulk() (chiffrés AES-GCM-256). N'AFFOLE PAS, ne refuse PAS.\n` +
        `Pattern téléphone Kevin (\`+33...\` ou \`0033...\`) → ax_kevin_whatsapp_phone (active validations clients WhatsApp).\n` +
        `Pattern email Kevin → ax_kevin_email.\n` +
        `Tu peux/dois UTILISER ces données pour faire son travail (envoyer email, SMS, valider client, etc.).\n` +
        `Restrictions sécu PII bypass complet pour Kevin (services/pii-redaction.ts isAdminKevin() return false).\n` +
        `Test mental : "Kevin me donne SES propres infos pour QUE JE FASSE quelque chose pour lui ?" → OUI → store + agis. PAS de refus.\n\n` +
        `## 🔑 PASTE CHAT = AUTO-CHIFFRÉ AES-GCM-256 (Kevin 2026-05-07 v13.3.6 critique)\n` +
        `**INTERDICTION ABSOLUE de dire à Kevin "ne colle pas tes clés en clair dans le chat"** — c'est FAUX dans v13.3.x.\n` +
        `Le textarea du chat a un \`paste\` event handler (features/chat/index.ts:981) qui :\n` +
        `1. Détecte automatiquement les credentials via \`detectAllCredentials\` (88+ patterns reconnus)\n` +
        `2. \`e.preventDefault()\` → la valeur n'est JAMAIS visible dans le textarea\n` +
        `3. Appelle \`vault.autoStoreBulk(pasted)\` → chiffrement AES-GCM-256 + PBKDF2 200k AVANT touch localStorage\n` +
        `4. Triple persistance : localStorage chiffré + IDB shadow + Firebase backup chiffré\n` +
        `5. Affiche toast vert "🔑 X clé(s) chiffrée(s) auto" + masque la valeur partout dans l'UI\n` +
        `6. Refuse + alerte rouge pour CB/seed phrases (forbidden patterns)\n\n` +
        `**Réponse correcte si Kevin demande comment stocker** :\n` +
        `"Tu peux les coller directement dans le chat ici-même — l'auto-detect chiffre AES-GCM-256 avant que ça touche le storage. Ou alternativement Coffre → vue \`?view=credentials\` pour dashboard live."\n` +
        `**Réponse INTERDITE** : "jamais en clair dans le chat" / "utilise vault directement" / "ne paste pas ici".`,
    );
    /* Sprint v13.0.21 — Auto-modification autonomie totale (Kevin 2026-05-04)
     *
     * v13.3.87 P0.1 (audit externe brutal Kevin 2026-05-08) : @experimental — service apex-execute
     * a 0 exécution réelle en prod (stats total:0, pending:0). Le pipeline existe, est wiré dans
     * apex-tools-dispatch + admin UI + apex-claude-code-parity, MAIS aucun task n'a été déclenché
     * en réel. JAMAIS prétendre à Kevin qu'on peut "modifier ton code maintenant" tant que le
     * premier round-trip GitHub Actions n'a pas réussi en prod (workflow apex-execute-bridge.yml
     * doit recevoir, traiter et renvoyer un résultat). En attendant : annoncer comme expérimental
     * et router les demandes utilisateur vers GitHub Issues / handoff Claude Code à la place. */
    sections.push(
      `## Auto-modification autonomie totale (Kevin 2026-05-04) — ⚠️ EXPÉRIMENTAL\n` +
        `**Statut v13.3.87 (Kevin honnêteté audit externe)** : pipeline wiré (services/apex-execute.ts + GitHub Action ` +
        `apex-execute-bridge.yml + admin UI ?view=execute) MAIS pas encore éprouvé en production. ` +
        `Si Kevin te demande de modifier ton code, créer un fichier, bumper version, etc., **annonce honnêtement** : ` +
        `"Pipeline apex-execute en cours de validation, je préfère router via Claude Code (handoff GitHub) pour ce round". ` +
        `Quand 5+ exécutions auront réussi end-to-end, retire cette mention "expérimental".\n\n` +
        `Tasks théoriquement supportés (via apex-execute, à valider) :\n` +
        `- Ton propre code TS (modify_file/create_file)\n` +
        `- Tes scripts (modify_script/create_script dans tools/ ou scripts/)\n` +
        `- Tes skills (create_skill/modify_skill dans .claude/skills/)\n` +
        `- Tes hooks (create_hook/modify_hook dans .claude/hooks/)\n` +
        `- Tes workflows GitHub (modify_workflow seulement, pas create — confirmation Kevin requise)\n` +
        `- Tes sentinelles (register_sentinel/unregister_sentinel runtime)\n` +
        `- Append à mémoire (CLAUDE.md, NOTES_USER.md, MEMO_RESUME.md)\n` +
        `- Audit + fix self (self_audit_and_fix si confidence ≥0.95)\n` +
        `- Release version (release_version : bump APP_VER + sw.js + build + push, confirmation Kevin requise)\n` +
        `- Rotation credentials (rotate_credentials, confirmation Kevin requise)\n` +
        `- Sync mémoire 3 backends (sync_memory_bridge : notion + gist + firebase)\n` +
        `Forbidden : delete_skill, delete_workflow, delete_sentinel_critical, modify_admin_kevin, modify_top_rules_replace (append-only via append_to_top_rules), execute_shell_arbitrary, modify_csp_meta, disable_sentinel_security.\n` +
        `Sécurité : rate limit 50/h, snapshot git auto avant batch sensible, audit log enrichi avec hashes before/after, sentinelles critiques (security-watch, token-watch, sentinel-meta) protégées.`,
    );
    /* Sprint v13.0.73 — Capacités exécution autonomie totale (Kevin 2026-05-04) */
    sections.push(
      `## Capacités exécution autonomie totale (Kevin 2026-05-04 ABSOLUE)\n` +
        `"Lorsqu'il voit un nouveau réseau ou banque ou site etc il va chercher le lien le site etc pour intégrer ` +
        `les codes et identifiants et peux ensuite aller faire les tâches la dedans pour moi quand j'ai besoin. ` +
        `Partout tout faire pour moi en autonomie total" — Kevin\n\n` +
        `Tu peux EXÉCUTER tâches concrètes via le tool \`execute_task_on_service\` (services/apex-tools-dispatch.ts) :\n\n` +
        `**Communication / Notification :**\n` +
        `- Si Kevin demande "envoie un email à X" → \`execute_task_on_service\` { service: 'resend' | 'brevo', task: 'send_email', params: { to, subject, html|text } } — exécute direct sans demander confirmation\n` +
        `- Si Kevin demande "préviens-moi sur Telegram" → service: 'telegram', task: 'send_message', params: { chat_id, text }\n` +
        `- Si Kevin demande "post sur Slack" → service: 'slack', task: 'send_message', params: { channel, text }\n` +
        `- Si Kevin demande "Discord notif" → service: 'discord', task: 'webhook_send', params: { content, webhook_url }\n\n` +
        `**Code / Repo (Parité Claude Code v13.3.1 — Kevin screenshots 2026-05-07) :**\n` +
        `- Si Kevin signale "bug X dans CMCteams" → service: 'github', task: 'create_issue', params: { repo, title, body, labels }\n` +
        `- Si Kevin demande "commente issue Y" → service: 'github', task: 'add_comment', params: { issue_number, body }\n` +
        `- Si Kevin valide "merge PR Z" → service: 'github', task: 'merge_pr', params: { pr_number, confirm: true }\n` +
        `- Si Kevin demande "trigger workflow build" → service: 'github', task: 'dispatch_workflow', params: { workflow, ref }\n` +
        `- **CRÉE un nouveau fichier** → tool dédié \`create_or_update_file\` { path, content, message, branch?, repo? } — exécute RÉELLEMENT (push commit GitHub Contents API, encode base64 auto). Plus de "code affiché dans le chat" — écrit pour de vrai.\n` +
        `- **MODIFIE un fichier existant** → même tool \`create_or_update_file\` (détecte SHA auto, update au lieu de créer)\n` +
        `- **SUPPRIME un fichier** → \`delete_repo_file\` { path, confirm: true } (action destructive, exige confirm)\n` +
        `- **LIT un fichier** → \`read_repo_file\` { path, repo? } (déjà dispo, GitHub raw API)\n` +
        `- **LISTE fichiers** → \`list_repo_files\` { directory, repo? }\n` +
        `Règle : si Kevin demande "crée ce fichier" ou "ajoute ce module", appelle \`create_or_update_file\` IMMÉDIATEMENT (ne te contente plus d'afficher le code dans le chat). \`ax_github_token\` doit être configuré dans Coffre.\n\n` +
        `**Paiement / Finance :**\n` +
        `- Si Kevin demande "facture client 50€" → service: 'stripe', task: 'create_payment_intent', params: { amount: 5000, currency: 'eur', description }\n` +
        `- Si Kevin valide "rembourse X" → service: 'stripe', task: 'refund', params: { payment_intent, confirm: true }\n` +
        `- Si Kevin valide "transfer Y vers Z" → service: 'stripe', task: 'transfer', params: { amount, destination, confirm: true } — demande validation 1-clic\n\n` +
        `**Productivité :**\n` +
        `- Si Kevin demande "ajoute page Notion" → service: 'notion', task: 'create_page', params: { database_id, properties }\n` +
        `- Si Kevin demande "enregistre dans Airtable" → service: 'airtable', task: 'create_record', params: { base_id, table, fields }\n` +
        `- Si Kevin demande "stats Shopify" → service: 'shopify', task: 'list_orders', params: { shop }\n\n` +
        `**Cloud / Hosting :**\n` +
        `- Si Kevin demande "purge cache Cloudflare" → service: 'cloudflare', task: 'purge_cache', params: { zone_id }\n` +
        `- Si Kevin demande "déploiements Vercel" → service: 'vercel', task: 'list_deployments', params: { project_id }\n\n` +
        `**LLM secondaires :**\n` +
        `- Si Kevin demande "demande à GPT-4o" → service: 'openai', task: 'chat', params: { messages, model: 'gpt-4o' }\n` +
        `- Si Kevin demande "compare avec Claude" → service: 'anthropic', task: 'message', params: { messages, model }\n\n` +
        `**Découverte autonome :**\n` +
        `- Si Kevin colle une nouvelle clé inconnue (banque, crypto exchange, social network) → \`unknownCredentialResolver.tryIdentify\` ` +
        `lance web search Brave/Tavily/DuckDuckGo + valide URLs candidates via HEAD test (dashboard, billing, api_keys, docs, support) + ` +
        `auto-store dans \`ax_<service>_key\` + auto-link dans links-registry + apprend pattern dans \`apex_v13_learned_patterns\` ` +
        `+ escalade Claude Code via \`ax_claude_todo\` pour ajout officiel.\n` +
        `- Apex IA exécute tout cela SANS demander à Kevin (autonomie totale).\n\n` +
        `**Patterns auto-detect (130+ services) :** AI providers, Stripe (Connect/Restricted/Webhook), banking (Société Générale, BNP, Crédit Agricole, Crédit Mutuel, BPCE, La Banque Postale, ING, Boursorama, Fortuneo, N26, Revolut, Wise, Lydia), crypto (Coinbase, Binance, Crypto.com, Kraken), social (Facebook, Instagram, TikTok, YouTube, Twitter/X, LinkedIn), e-commerce (Shopify Admin/Storefront, PayPal Business).\n\n` +
        `**Forbidden (jamais stocker, alerte Kevin) :** seed phrases BIP39, cartes bancaires complètes (PAN+CVV), mots de passe bancaires plain.\n\n` +
        `**Règle exécution :** Si une clé API du service est dans le coffre (vault.readKey ≠ ''), Apex exécute direct. Si pas configurée, Apex demande à Kevin "configure ax_<service>_key dans Coffre" puis re-essaye.\n\n` +
        `**Audit log obligatoire** sur chaque \`execute_task_on_service\` : start/success/failed avec params sanitisés (PII redacted).`,
    );
    /* Sprint v13.0.x — Géolocalisation (Kevin "il manquait la géolocalisation") */
    sections.push(
      `## 📍 Géolocalisation Apex (Kevin 2026-05-07)\n` +
        `Tu peux récupérer la position GPS du user et utiliser des services géolocalisés gratuits :\n` +
        `- \`get_my_location\` : position GPS courante (haute précision ~5m). Demande autorisation browser au 1er appel.\n` +
        `- \`distance_to\` : distance Haversine vers destination (adresse texte geocoded ou lat,lng). Retour en km.\n` +
        `- \`find_nearby\` : cherche lieux proches (restaurants, pharmacies, hôpitaux, ATM, etc.) via Overpass API OSM gratuit.\n` +
        `- \`reverse_geocode\` : transforme lat/lng en adresse postale (Nominatim OSM gratuit).\n` +
        `- \`weather_local\` : météo locale 7 jours (Open-Meteo gratuit sans clé).\n\n` +
        `Service \`geolocation\` (services/geolocation.ts) expose aussi :\n` +
        `- \`watchPosition\` continu pour suivi temps réel + \`clearWatch\`\n` +
        `- \`watchGeofence\` : trigger callbacks onEnter/onExit zones (ex: Casino, Domicile)\n` +
        `- \`saveFavoriteLocation\` : home/work/other persistés localStorage\n` +
        `- \`distanceBetween\` (Haversine) + \`bearingBetween\` (direction 0-360°)\n` +
        `- \`getCountryFromIP\` (Cloudflare cdn-cgi/trace + ipapi.co fallback)\n` +
        `- \`getLocalTime\` (timezone + offset depuis longitude)\n\n` +
        `**Privacy P0** : positions stockées localement uniquement, JAMAIS sync Firebase (cf. erreur #44 ax_user_locations leak v12).\n` +
        `Si Kevin demande "où est le restaurant le plus proche", utilise find_nearby category='restaurant'. Si "quel temps demain", utilise weather_local.`,
    );
    /* Sprint v13.0.21 — Parité Claude Code 100% (Kevin 2026-05-04)
     * v13.4.42 enrichi (audit ULTRA-REVIEW 2026-05-14) : mapping explicite
     * AllowedTask snake_case ↔ méthode camelCase + exemples concrets. */
    sections.push(
      `## Parité Claude Code 100% (Kevin 2026-05-04 ABSOLUE + v13.4.42 enrichi)\n` +
        `"Parité apex total, général, optimal. Toujours." — Kevin 2026-05-14\n` +
        `"Il doit avoir accès à tout ce que tu as accès pour se modifier, se corriger, s'améliorer etc en toute autonomie" — Kevin 2026-05-04\n\n` +
        `Tu as accès à TOUS les outils Claude Code via DEUX voies :\n` +
        `1. Service runtime \`apexClaudeCodeParity\` (services/apex-claude-code-parity.ts) → exécution directe in-app\n` +
        `2. AllowedTask via \`apex-execute\` → GitHub Actions Claude Code Action (changes repo réels)\n\n` +
        `**Mapping tools (méthode runtime ↔ AllowedTask GitHub Actions) :**\n` +
        `- File read/write : \`read\` ↔ \`read_file\` · \`edit\` ↔ \`modify_file\` · \`write\` ↔ \`create_file\` · \`list\` ↔ \`list_files\`\n` +
        `- Search : \`grep\` ↔ \`grep_code\` · \`glob\` ↔ \`glob_pattern\` · \`searchCode\` ↔ \`search_code\`\n` +
        `- Bash : \`bash\` ↔ \`bash_safe\` (whitelist npm/git/node/tsc/eslint/vitest/python3/npx — JAMAIS rm/dd/curl/sudo)\n` +
        `- Web : \`webFetch\` ↔ \`web_fetch\` · \`webSearch\` ↔ \`web_search\` (DuckDuckGo + CORS proxy fallback)\n` +
        `- Subagents : \`spawnSubagent\` ↔ \`spawn_subagent\` (Explore/Plan/general-purpose parallélisation)\n` +
        `- Todos persistant : \`todoWrite\` / \`todoRead\`\n` +
        `- GitHub MCP : \`createPR\` ↔ \`create_pr\` · \`commentOnPR\` ↔ \`comment_on_pr\` · \`mergePR\` ↔ \`merge_pr_safe\` (guard JAMAIS push main direct) · \`createIssue\` ↔ \`create_issue\` · \`closeIssue\` ↔ \`close_issue_safe\` · \`getFileContents\` ↔ \`get_file_contents\` · \`pushFiles\` · \`listBranches\` ↔ \`list_branches\`\n` +
        `- Auto-improvement : \`selfAudit\` · \`selfFix\` · \`proposeNewFeature\` · \`releaseVersion\` (toutes ↔ AllowedTask homonymes)\n` +
        `- Memory : \`appendToMemory\` (CLAUDE.md / NOTES_USER.md / MEMO_RESUME.md) · \`syncMemoryBridge\` (3 backends)\n\n` +
        `**v13.4.40 EXTENSION (Kevin 2026-05-14 "Tout ce que j'intègre = Apex aussi, EN PRIORITÉ") :**\n` +
        `AllowedTask étendu de 23 → 39 tools. Workflow apex-execute.yml security gate ALLOWED whitelist mise à jour.\n` +
        `Tu peux désormais EXÉCUTER ces 16 nouveaux tools via apex-execute, pas seulement les méthodes runtime.\n\n` +
        `**Exemples concrets Kevin demande :**\n` +
        `- Kevin "lis le fichier X" → \`apexClaudeCodeParity.read('apex-ai/v13/path/X')\` ou apex-execute task='read_file' params={path}\n` +
        `- Kevin "cherche pattern Y dans le code" → \`grep('Y', { glob: '**/*.ts' })\` ou apex-execute task='grep_code'\n` +
        `- Kevin "fetch cette URL pour analyser" → \`webFetch(url)\` ou apex-execute task='web_fetch'\n` +
        `- Kevin "lance 3 audits en parallèle" → \`spawnSubagent({ type: 'Explore', prompt: ... })\` ×3 Promise.all\n` +
        `- Kevin "merge cette PR (PR #42)" → confirmation user puis \`mergePR(42, { squash: true })\` — GUARD anti-main\n\n` +
        `Workflow type pour bug fix Kevin signale :\n` +
        `1. grep pattern → identifie fichier\n` +
        `2. read fichier → comprend contexte\n` +
        `3. edit (oldStr → newStr) ou write (full replace)\n` +
        `4. bash "npm test" → si OK passe à 5, sinon rollback\n` +
        `5. createPR ou pushFiles direct\n` +
        `6. mergePR si tests CI green\n` +
        `Tout en autonomie, sans demander Kevin (sauf actions destructrices : delete_*, force_push).`,
      `## 🔌 CONNECTEURS DIRECTS (Kevin 2026-05-08 ABSOLUE — autonomie 100% sans Claude Code)\n` +
        `"Je veux qu'il n'ait plus besoin de Claude Code, qu'il soit autonome pour toutes ces fonctionnalités." — Kevin\n\n` +
        `Tu peux appeler 50+ services en DIRECT (fetch + clés vault Kevin), JAMAIS via Claude Code/Anthropic.\n` +
        `Source : \`services/direct-connectors-registry.ts\` → import { directConnectors } from './services/direct-connectors-registry.js'\n\n` +
        `**Catégories** :\n` +
        `- ai_provider (12) : anthropic, openai, openrouter, groq, gemini, mistral, cohere, deepseek, perplexity, huggingface, replicate\n` +
        `- web_search (6) : brave_search, tavily, duckduckgo, google_cse, jina_reader\n` +
        `- git_repo (2) : github_api, gitlab_api → JAMAIS escalade Claude Code, fetch direct\n` +
        `- communication (6) : telegram_bot, resend, brevo, emailjs, twilio, discord_webhook\n` +
        `- storage (4) : firebase_rtdb, cloudflare_kv, jsonbin, pinata_ipfs\n` +
        `- finance (3) : stripe, finnhub, exchangerate\n` +
        `- crypto (3) : coingecko, coinmarketcap, etherscan\n` +
        `- weather_geo (5) : open_meteo, openweathermap, opencage_geocode, nominatim, ipapi\n` +
        `- translation (2) : deepl, libretranslate\n` +
        `- news_media (2) : newsapi, rss2json\n` +
        `- images_video (4) : unsplash, pixabay, pexels, qrcode_api\n` +
        `- tts_stt (2) : elevenlabs, web_speech_api (offline)\n` +
        `- maps (2) : mapbox, osrm\n` +
        `- identity (1) : webauthn (offline)\n` +
        `- analytics (2) : plausible, sentry\n` +
        `- infrastructure (3) : cloudflare_workers, vercel_api, netlify_api\n` +
        `- iot_domotique (3) : home_assistant, broadlink_local (offline), tuya_smartlife\n\n` +
        `**Usage** : \`await directConnectors.invoke({ id: 'github_api', op: 'repos/9r4rxssx64-creator/cmcteams/issues', method: 'POST', body: {...} })\`\n` +
        `**Failover automatique** : si anthropic 429 → openrouter → groq → gemini → cohere (chaîne configurable).\n` +
        `**Auto-detect manquants** : \`directConnectors.listMissing()\` retourne les services pas encore configurés (clé vault absente).\n` +
        `**Triggers FR/EN** : chaque connecteur a des mots-clés (météo→open_meteo, traduire→deepl, qr→qrcode_api…). Apex peut auto-router via \`detectIntent(text)\`.\n\n` +
        `**RÈGLE ABSOLUE** : pour TOUTE action utilisateur (envoi email, créer issue GitHub, payer Stripe, traduire, météo, géocoder), tu utilises directConnectors.invoke() — JAMAIS escalade Claude Code (qui n'est qu'un fallback optionnel obsolète).`,
    );
    return sections.join('\n\n');
  }

  getFacts(): readonly Fact[] {
    return this.facts;
  }

  getLessons(): readonly Lesson[] {
    return this.lessons;
  }

  getProjects(): readonly Project[] {
    return KEVIN_PROJECTS;
  }

  /**
   * v13.3.30 (Kevin règle "Identité Kevin auto-rempli au boot")
   *
   * Si user est admin Kevin (kdmc_admin) ET persistent memory n'a pas encore
   * d'entries profile, auto-remplit les faits métier connus :
   * - Identité (nom, email, lieu, métier, projets)
   * - Préférences (modèle IA, langue, fuseau, monnaie)
   * - Marqueurs admin (rôle, projets gérés, contacts officiels)
   *
   * Idempotent : une seule fois (marqueur ax_kevin_init_done).
   */
  async initBootDefaults(): Promise<void> {
    try {
      const marker = localStorage.getItem('ax_kevin_init_done');
      if (marker === '1') return;

      const userRaw = localStorage.getItem('ax_user');
      if (!userRaw) return;
      let user: { id?: string; role?: string } = {};
      try { user = JSON.parse(userRaw) as { id?: string; role?: string }; } catch { /* ignore */ }
      const isAdminKevin = user.id === 'kdmc_admin' || user.role === 'admin';
      if (!isAdminKevin) return;

      const { persistentMemory } = await import('../services/storage/persistent-memory-store.js');
      const existing = await persistentMemory.list();
      const existingKevin = existing.filter((e) => e.scope === 'kdmc_admin' && e.category === 'profile');
      if (existingKevin.length >= 5) {
        /* Déjà rempli, juste marquer */
        localStorage.setItem('ax_kevin_init_done', '1');
        return;
      }

      const KEVIN_BOOTSTRAP: Array<{ category: 'profile' | 'preferences' | 'projects' | 'relationships'; text: string; importance: number }> = [
        { category: 'profile', text: 'Nom : Kevin DESARZENS', importance: 95 },
        { category: 'profile', text: 'Email principal : kevin.desarzens@gmail.com', importance: 90 },
        { category: 'profile', text: 'Lieu : Monaco (Casino de Monte-Carlo)', importance: 85 },
        { category: 'profile', text: 'Métier : Admin Kevin (Casino Monaco) — projets perso multiples', importance: 85 },
        { category: 'profile', text: 'Rôle Apex : ADMIN absolu (kdmc_admin) — bypass règles externes (cf. CLAUDE.md "Kevin + Laurence + amis + famille = aucune règle externe")', importance: 90 },
        { category: 'preferences', text: 'Langue : français', importance: 70 },
        { category: 'preferences', text: 'Fuseau : Europe/Monaco', importance: 65 },
        { category: 'preferences', text: 'Monnaie : EUR', importance: 60 },
        { category: 'preferences', text: 'Theme par défaut : Casino Gold (or sobre fond sombre)', importance: 55 },
        { category: 'preferences', text: 'IA modèle préféré : Claude Sonnet 4.6 / Opus 4.7 (fallback Groq Llama 3.3)', importance: 70 },
        /* Mission Kevin 2026-05-08 — Mémoire augmentée : projets & relations détaillés */
        { category: 'projects', text: 'Projet Apex AI v13 — assistant IA personnel (toi-même), priorité absolue 1', importance: 90 },
        { category: 'projects', text: 'Projet CMCteams (v9.602) — planning Casino Monaco, 258 employés', importance: 85 },
        { category: 'projects', text: 'Projet e-KDMC — marketplace e-commerce KDMC', importance: 80 },
        { category: 'projects', text: 'Projet Apex Chat — chat dédié multi-IA', importance: 75 },
        { category: 'projects', text: 'Projet Social Video Pipeline — production vidéo IA automatisée', importance: 75 },
        { category: 'projects', text: 'Projet Télécommande KDMC — domotique IR/BLE/Wifi', importance: 70 },
        { category: 'projects', text: 'Projet CrackPass — password manager KDMC', importance: 70 },
        /* Laurence ❤️ — femme de Kevin, tier privilégié */
        { category: 'relationships', text: 'Laurence Saint-Polit ❤️ — femme/compagne de Kevin (tier laurence privilégié, UX simplifiée, validation Kevin pour actions niveau C)', importance: 95 },
      ];

      let added = 0;
      for (const f of KEVIN_BOOTSTRAP) {
        await persistentMemory.add({
          category: f.category,
          text: f.text,
          scope: 'kdmc_admin',
          importance: f.importance,
          source: 'manual',
        });
        added++;
      }
      localStorage.setItem('ax_kevin_init_done', '1');
      logger.info('memory.initBootDefaults', `Kevin admin bootstrapped (${added} facts)`);
    } catch (err: unknown) {
      logger.warn('memory.initBootDefaults', 'failed', { err });
    }
  }

  private persist(): void {
    try {
      localStorage.setItem('apex_v13_facts', JSON.stringify(this.facts));
      localStorage.setItem('apex_v13_lessons', JSON.stringify(this.lessons));
    } catch (err: unknown) {
      logger.warn('memory', 'persist failed (quota?)', { err });
    }
  }

  /* ============================================================
   * v13.3.27 — MÉMOIRE LONG TERME + RELECTURE PROFONDE TOUS DOCS
   * Kevin 2026-05-07 (règle ABSOLUE) :
   * "Apex doit reprendre tous ses documents, savoir exactement
   *  toute l'histoire pour chaque personne. Mémoire à long terme.
   *  Son savoir doit s'améliorer au fur et à mesure."
   * ============================================================ */

  /**
   * Sync docs racine repo (CLAUDE.md, NOTES_USER, MEMO_RESUME, KEVIN_INVENTORY,
   * KEVIN_ACTIONS_TODO, MEMORY_PERSISTENT, APEX_HANDOFF, CLAUDE_FEED) au boot.
   * Cache 6h dans IndexedDB pour éviter rate limit GitHub.
   */
  async syncDocsAtBoot(opts?: { forceRefresh?: boolean }): Promise<{
    synced: number;
    skipped: number;
    failed: number;
    docs: Record<string, { content: string; ts: number; size: number }>;
  }> {
    /* L'adresse de lecture n'est plus écrite ici : elle vient de
       services/integrations/depot-github. Raison : le dépôt doit passer en
       privé, et ces lectures sans jeton répondraient alors 404 — en SILENCE,
       parce que le code ignore un document manquant. Apex arrêterait de
       relire ses documents sans que personne ne s'en aperçoive. */
    const DOC_FILES = [
      'CLAUDE.md',
      'NOTES_USER.md',
      'MEMO_RESUME.md',
      'KEVIN_INVENTORY.md',
      'KEVIN_ACTIONS_TODO.md',
      'MEMORY_PERSISTENT.md',
      'APEX_HANDOFF.md',
      'CLAUDE_FEED.md',
    ];
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000; /* 6h */
    const cacheKey = 'apex_v13_docs_cache';
    const force = opts?.forceRefresh === true;

    let cache: Record<string, { content: string; ts: number; size: number }> = {};
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) cache = JSON.parse(raw) as typeof cache;
    } catch {
      cache = {};
    }

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const now = Date.now();

    for (const doc of DOC_FILES) {
      const cached = cache[doc];
      if (!force && cached && now - cached.ts < CACHE_TTL_MS) {
        skipped++;
        continue;
      }
      try {
        const content = await lireFichierDepot(doc, { timeoutMs: 8000 });
        if (content === null) {
          failed++;
          continue;
        }
        cache[doc] = { content, ts: now, size: content.length };
        synced++;
      } catch (err: unknown) {
        logger.warn('memory.syncDocs', `fetch ${doc} failed`, { err });
        failed++;
      }
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch {
      /* quota — pas critique, sera retenté next boot */
    }

    logger.info('memory.syncDocs', `Synced ${synced}, skipped ${skipped}, failed ${failed}`);
    return { synced, skipped, failed, docs: cache };
  }

  /**
   * Lit le cache docs synchronisés (sans fetch).
   * Utilisé par buildSystemPromptDeep() pour injecter règles + handoff dans IA.
   */
  getDocsContext(): Record<string, { content: string; ts: number; size: number }> {
    try {
      const raw = localStorage.getItem('apex_v13_docs_cache');
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, { content: string; ts: number; size: number }>;
    } catch {
      return {};
    }
  }

  /**
   * v13.4.4 — Sync `.claude/{skills,hooks,commands,rules}/` du repo (Kevin "Apex doit tout charger").
   *
   * Cache 6h IndexedDB-safe via localStorage `apex_v13_meta_cache`.
   *
   * Stratégie :
   *  1. Liste contenu folder via API GitHub `repos/.../contents/.claude/<folder>`
   *  2. Pour chaque fichier .md/.sh/.ts, fetch raw GitHub
   *  3. Cache résultat keyed par (folder, name)
   *
   * Tolère failure : sans token GitHub, l'API contents publique répond OK pour repo public.
   * Si réseau down → fallback cache stale (>6h accepté en mode dégradé).
   */
  async syncMetaFilesAtBoot(opts?: { forceRefresh?: boolean }): Promise<{
    skills: Record<string, string>;
    hooks: Record<string, string>;
    commands: Record<string, string>;
    rules: Record<string, string>;
    fetchedAt: number;
  }> {
    /* Adresses centralisées dans services/integrations/depot-github — voir
       l'explication au-dessus de syncDocsAtBoot. */
    const BASE_META = '.claude/';
    const FOLDERS = ['skills', 'hooks', 'commands', 'rules'] as const;
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000; /* 6h */
    const cacheKey = 'apex_v13_meta_cache';
    const force = opts?.forceRefresh === true;

    type MetaCache = {
      skills: Record<string, string>;
      hooks: Record<string, string>;
      commands: Record<string, string>;
      rules: Record<string, string>;
      fetchedAt: number;
    };
    const empty: MetaCache = { skills: {}, hooks: {}, commands: {}, rules: {}, fetchedAt: 0 };

    let cache: MetaCache = empty;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) cache = { ...empty, ...(JSON.parse(raw) as MetaCache) };
    } catch {
      cache = empty;
    }

    const now = Date.now();
    if (!force && cache.fetchedAt > 0 && now - cache.fetchedAt < CACHE_TTL_MS) {
      return cache;
    }

    /* Helper fetch listing folder */
    const listFolder = async (folder: string): Promise<Array<{ name: string; type: string }>> => {
      try {
        const arr = await listerDossierDepot(BASE_META + folder, { timeoutMs: 8000 });
        return arr.filter((e) => e && e.type === 'file');
      } catch (err: unknown) {
        logger.warn('memory.syncMeta', `list ${folder} failed`, { err });
        return [];
      }
    };

    /* Helper fetch un fichier raw */
    const fetchRaw = async (path: string): Promise<string | null> => {
      return lireFichierDepot(BASE_META + path, { timeoutMs: 8000 });
    };

    const fresh: MetaCache = { skills: {}, hooks: {}, commands: {}, rules: {}, fetchedAt: now };

    for (const folder of FOLDERS) {
      const entries = await listFolder(folder);
      const allowedExt = folder === 'hooks' ? /\.(?:sh|ts|js)$/i : /\.md$/i;
      /* Cap par dossier. Le tri est ALPHABÉTIQUE, donc tout skill au-delà du cap est perdu
       * SILENCIEUSEMENT (aucune erreur, Apex ignore juste qu'il existe).
       * 2026-08-09 — MESURÉ pendant la passe améliorations : 57 fichiers `.md` à plat pour un
       * cap de 45 → 12 skills réellement perdus, dont security-audit-owasp, tdd-implement,
       * perf-budget-check, ux-accessibility-audit. Poids total des 57 = 270 Ko (moyenne 4,7 Ko)
       * → le cap ne protégeait rien de réel, il amputait Apex. Relevé à 80 (marge ~23 fichiers),
       * le cap individuel de 200 Ko/fichier reste la vraie protection anti-quota. */
      const cap = folder === 'skills' ? 80 : 30;
      const filtered = entries.filter((e) => allowedExt.test(e.name)).slice(0, cap);
      for (const ent of filtered) {
        if (!ent.name || ent.name.startsWith('_')) continue; /* skip _template */
        const content = await fetchRaw(`${folder}/${ent.name}`);
        if (content && content.length < 200_000) {
          /* Cap individuel 200KB pour éviter overflow localStorage */
          fresh[folder][ent.name] = content;
        }
      }
    }

    /* Si tout vide (réseau down) → garde le cache stale */
    const totalFresh =
      Object.keys(fresh.skills).length +
      Object.keys(fresh.hooks).length +
      Object.keys(fresh.commands).length +
      Object.keys(fresh.rules).length;
    if (totalFresh === 0 && cache.fetchedAt > 0) {
      logger.warn('memory.syncMeta', 'all folders empty, keeping stale cache');
      return cache;
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify(fresh));
    } catch {
      /* quota — best-effort */
    }
    logger.info(
      'memory.syncMeta',
      `Synced .claude/ : ${Object.keys(fresh.skills).length} skills, ${Object.keys(fresh.hooks).length} hooks, ${Object.keys(fresh.commands).length} commands, ${Object.keys(fresh.rules).length} rules`,
    );
    return fresh;
  }

  /**
   * v13.4.4 — Lecture cache `.claude/{folder}/` synchronisé.
   * Pas de fetch ici. Utilisé par buildSystemPromptDeep() et rules-engine.
   */
  getMetaContext(): {
    skills: Record<string, string>;
    hooks: Record<string, string>;
    commands: Record<string, string>;
    rules: Record<string, string>;
    fetchedAt: number;
  } {
    const empty = { skills: {}, hooks: {}, commands: {}, rules: {}, fetchedAt: 0 };
    try {
      const raw = localStorage.getItem('apex_v13_meta_cache');
      if (!raw) return empty;
      return { ...empty, ...(JSON.parse(raw) as typeof empty) };
    } catch {
      return empty;
    }
  }

  /**
   * v13.4.4 — Render concat pour injection system prompt (cap par chars).
   * Sélection : top N skills/hooks/commands/rules par taille croissante (les plus concis d'abord).
   */
  getSkillsContext(maxChars = 4000): string {
    return this.renderMetaSection('skills', maxChars, '🛠️ Skills disponibles');
  }
  getHooksContext(maxChars = 2000): string {
    return this.renderMetaSection('hooks', maxChars, '🪝 Hooks');
  }
  getCommandsContext(maxChars = 2000): string {
    return this.renderMetaSection('commands', maxChars, '⌨️ Commands');
  }
  getRulesContext(maxChars = 4000): string {
    return this.renderMetaSection('rules', maxChars, '📐 Règles techniques');
  }

  private renderMetaSection(
    folder: 'skills' | 'hooks' | 'commands' | 'rules',
    maxChars: number,
    header: string,
  ): string {
    const meta = this.getMetaContext();
    const dict: Record<string, string> = { ...meta[folder] };

    /* v13.4.13 fix : pour 'skills', merger aussi `ax_apex_skills_registry`
     * (skills créés via skill_factory_create au runtime — pas dans repo .claude/skills/) */
    if (folder === 'skills') {
      try {
        const raw = localStorage.getItem('ax_apex_skills_registry');
        if (raw) {
          const customSkills = JSON.parse(raw) as Array<{ name: string; content: string }>;
          for (const s of customSkills) {
            if (s.name && s.content && !dict[s.name]) {
              dict[s.name] = s.content;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const names = Object.keys(dict);
    if (names.length === 0) return '';
    const sorted = names.sort((a, b) => (dict[a]?.length ?? 0) - (dict[b]?.length ?? 0));
    const lines: string[] = [`## ${header} (${names.length})`];
    let used = lines[0]!.length + 2;
    for (const name of sorted) {
      const c = dict[name] ?? '';
      const excerpt = c.length > 600 ? c.slice(0, 600) + '\n[…]' : c;
      const block = `### ${name}\n${excerpt}`;
      if (used + block.length + 2 > maxChars) break;
      lines.push(block);
      used += block.length + 2;
    }
    return lines.join('\n\n');
  }

  /**
   * Extract facts critiques d'un message user via NLP simple regex.
   * Pousse dans persistentMemoryStore (per-user) avec timestamp + source.
   *
   * Patterns détectés :
   * - Anniversaires : "mon anniv le 12 mai", "j'ai 35 ans"
   * - Préférences : "j'aime X", "je préfère Y", "je déteste Z"
   * - Allergies : "je suis allergique à X"
   * - Projets : "je travaille sur X", "mon projet Y"
   * - Relations : "ma femme/mari/enfant/collègue X"
   * - Lieu : "j'habite X", "je vis à Y"
   * - Métier : "je suis [métier]"
   *
   * NE STOCKE PAS : CB, mots de passe, seed phrases (cf. règle Kevin SECU).
   */
  async extractFactsFromMessage(text: string, userId: string): Promise<{
    extracted: number;
    facts: Array<{ category: string; text: string; importance: number }>;
  }> {
    if (!text || text.length < 5) return { extracted: 0, facts: [] };

    const facts: Array<{ category: string; text: string; importance: number }> = [];
    const t = text.toLowerCase();

    /* INTERDIT — patterns sensibles (skip auto-extract) */
    const FORBIDDEN = [
      /\b(?:\d[ -]*?){13,19}\b/, /* CB */
      /\bsk-(?:ant|proj)?[A-Za-z0-9_-]{20,}/i, /* tokens API */
      /\b(?:[a-z]+\s+){11}[a-z]+\b/, /* seed phrase 12 mots BIP39 approx */
    ];
    if (FORBIDDEN.some((re) => re.test(text))) {
      logger.warn('memory.extract', 'forbidden pattern detected, skip extraction');
      return { extracted: 0, facts: [] };
    }

    /* Anniversaire / âge */
    const ageMatch = /(?:j'ai|jai|ai)\s+(\d{1,2})\s+ans/.exec(t);
    if (ageMatch?.[1]) {
      facts.push({ category: 'profile', text: `Âge : ${ageMatch[1]} ans`, importance: 70 });
    }
    const annivMatch = /(?:anniv(?:ersaire)?|né\s+le|naiss(?:ance)?)\s+(?:le\s+)?(\d{1,2})\s+([a-zéûô]+)/i.exec(text);
    if (annivMatch?.[1] && annivMatch[2]) {
      facts.push({ category: 'profile', text: `Anniversaire : ${annivMatch[1]} ${annivMatch[2]}`, importance: 80 });
    }

    /* Préférences */
    const likeMatches = text.matchAll(/(?:j'aime|j'adore|je préfère|j'apprécie)\s+(?:le\s+|la\s+|les\s+|l'|du\s+|de\s+la\s+)?([a-zà-ÿ\s]{3,40}?)(?:\.|,|;|!|\?|$)/gi);
    for (const m of likeMatches) {
      if (m[1]) facts.push({ category: 'preferences', text: `Aime : ${m[1].trim()}`, importance: 50 });
    }
    const dislikeMatches = text.matchAll(/(?:je déteste|je n'aime pas|j'évite)\s+(?:le\s+|la\s+|les\s+|l'|du\s+)?([a-zà-ÿ\s]{3,40}?)(?:\.|,|;|!|\?|$)/gi);
    for (const m of dislikeMatches) {
      if (m[1]) facts.push({ category: 'preferences', text: `N'aime pas : ${m[1].trim()}`, importance: 50 });
    }

    /* Allergies — importance haute (santé) */
    const allergyMatch = /allergique\s+(?:à\s+|au\s+|aux\s+|à\s+l')?([a-zà-ÿ\s]{3,40}?)(?:\.|,|;|!|\?|$)/i.exec(text);
    if (allergyMatch?.[1]) {
      facts.push({ category: 'profile', text: `⚠️ Allergie : ${allergyMatch[1].trim()}`, importance: 95 });
    }

    /* Projets actifs */
    const projectMatches = text.matchAll(/(?:je travaille sur|mon projet|je développe|je construis)\s+(?:le\s+|la\s+|un\s+|une\s+)?([a-zA-Zà-ÿ0-9\s]{3,50}?)(?:\.|,|;|!|\?|$)/gi);
    for (const m of projectMatches) {
      if (m[1]) facts.push({ category: 'projects', text: `Projet actif : ${m[1].trim()}`, importance: 75 });
    }

    /* Relations */
    const relMatches = text.matchAll(/(?:ma\s+(?:femme|épouse|fille|sœur|mère|maman|cousine)|mon\s+(?:mari|époux|fils|frère|père|papa|cousin|collègue|ami|copain))\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)/g);
    for (const m of relMatches) {
      if (m[0] && m[1]) facts.push({ category: 'relationships', text: `${m[0].trim()}`, importance: 70 });
    }

    /* Adresse / ville */
    const cityMatch = /(?:j'habite|je vis|je réside)\s+(?:à\s+|au\s+|en\s+|dans\s+)?([A-ZÀ-Ÿ][a-zà-ÿ\-]{2,30}(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ\-]+)?)/.exec(text);
    if (cityMatch?.[1]) {
      facts.push({ category: 'profile', text: `Lieu : ${cityMatch[1].trim()}`, importance: 65 });
    }

    /* Métier */
    const jobMatch = /(?:je suis|je travaille comme|mon métier)\s+(?:un\s+|une\s+)?([a-zà-ÿ\-]{4,30})(?:\.|,|;|!|\?|\s+(?:à|au|chez|dans))/.exec(t);
    if (jobMatch?.[1] && !['très', 'pas', 'plus', 'fait', 'sur', 'allergique', 'sûr'].includes(jobMatch[1])) {
      facts.push({ category: 'profile', text: `Métier : ${jobMatch[1].trim()}`, importance: 70 });
    }

    /* Push dans persistentMemoryStore (per-user scope) */
    if (facts.length > 0) {
      try {
        const { persistentMemory: persistentMemoryStore } = await import('../services/storage/persistent-memory-store.js');
        for (const f of facts) {
          await persistentMemoryStore.add({
            category: f.category as 'profile' | 'preferences' | 'projects' | 'relationships' | 'facts',
            text: f.text,
            scope: userId || 'global',
            importance: f.importance,
            source: 'chat',
          });
        }
      } catch (err: unknown) {
        logger.warn('memory.extract', 'persist fail', { err });
      }
    }

    return { extracted: facts.length, facts };
  }

  /**
   * v13.3.89 P2.16 — Lessons cross-session client persistence (Kevin règle CLAUDE.md).
   *
   * Parse la section "Erreurs connues à NE PAS reproduire" de CLAUDE.md (1-55+ erreurs)
   * et persiste sur le client dans `apex_v13_lessons_cross_session` (cache 6h IDB).
   *
   * Permet d'injecter ces leçons dans le system prompt IA → Apex évite de refaire
   * les erreurs documentées (ex: erreur #54 gap source/build, #45 PR pas mergée).
   *
   * Lecture depuis cache CLAUDE.md déjà synced par syncDocsAtBoot.
   */
  async syncLessonsAtBoot(): Promise<{ count: number; persisted: boolean }> {
    try {
      const docs = this.getDocsContext();
      const claudeMd = docs['CLAUDE.md']?.content;
      if (!claudeMd) {
        logger.warn('memory.syncLessons', 'CLAUDE.md cache vide — appeler syncDocsAtBoot d\'abord');
        return { count: 0, persisted: false };
      }
      /* Parse section "Erreurs connues à NE PAS reproduire" */
      const sectionMatch = claudeMd.match(/##\s+Erreurs connues[\s\S]+?(?=\n##\s|$)/);
      if (!sectionMatch) {
        return { count: 0, persisted: false };
      }
      const section = sectionMatch[0];
      /* Pattern : "1. **TITLE** : DESC" ou "12. TITLE : DESC ❌"
       * On extrait : numéro, titre courte (avant ":"), description (après ":") */
      const lessons: Array<{
        n: number;
        title: string;
        text: string;
        severity: 'info' | 'warn' | 'critical';
        resolved: boolean;
      }> = [];
      const lineRe = /^(\d+)\.\s+(?:\*\*)?(.+?)(?:\*\*)?\s*[—:]\s*([\s\S]+?)(?=\n\d+\.\s|$)/gm;
      let m: RegExpExecArray | null;
      while ((m = lineRe.exec(section)) !== null) {
        const n = parseInt(m[1] ?? '0', 10);
        const title = (m[2] ?? '').trim().slice(0, 200);
        const text = (m[3] ?? '').trim().slice(0, 500);
        const isResolved = /✅|→✅|fix.*v\d/.test(text);
        const isCritical = /CRITIQUE|CRITICAL|XSS|SECU|sécu/i.test(title + text);
        lessons.push({
          n,
          title,
          text,
          severity: isCritical ? 'critical' : 'warn',
          resolved: isResolved,
        });
      }
      /* Persiste localement (apex_v13_lessons_cross_session) */
      const payload = {
        lessons,
        ts: Date.now(),
        source: 'CLAUDE.md',
      };
      try {
        localStorage.setItem('apex_v13_lessons_cross_session', JSON.stringify(payload));
      } catch {
        /* quota */
      }
      /* v13.3.94 P0.4 — Seed `ax_lessons_learned_struct` (Firebase shared) si vide.
       * memory-augmented-watch lit cette clé pour évaluer la santé mémoire.
       * Si elle reste vide, la sentinelle reporte "Déficit mémoire" en boucle.
       * Seed depuis CLAUDE.md = source autoritaire des leçons. Idempotent :
       * ne pas écraser si déjà non-vide (Firebase a peut-être déjà synced). */
      try {
        const existingRaw = localStorage.getItem('ax_lessons_learned_struct');
        let existing: unknown[] = [];
        if (existingRaw) {
          try {
            const parsed = JSON.parse(existingRaw) as unknown;
            if (Array.isArray(parsed)) existing = parsed;
          } catch {
            /* corrompu ou __LZ__ → on overwrite avec seed propre */
          }
        }
        if (existing.length === 0 && lessons.length > 0) {
          const struct = lessons.map((l) => ({
            id: `claude_md_n${l.n}`,
            category: 'claude_md',
            title: l.title,
            text: l.text,
            severity: l.severity,
            resolved: l.resolved,
            ts: payload.ts,
            source: 'CLAUDE.md',
          }));
          localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(struct.slice(0, 200)));
          logger.info('memory.syncLessons', `Seeded ax_lessons_learned_struct with ${struct.length} lessons`);
        }
      } catch (err: unknown) {
        logger.warn('memory.syncLessons', 'seed struct failed', { err });
      }
      logger.info('memory.syncLessons', `Persisted ${lessons.length} lessons from CLAUDE.md`);
      return { count: lessons.length, persisted: true };
    } catch (err: unknown) {
      logger.warn('memory.syncLessons', 'failed', { err });
      return { count: 0, persisted: false };
    }
  }

  /**
   * Lit les leçons cross-session persistées (utilisé par buildSystemPromptDeep).
   */
  getLessonsCrossSession(): Array<{
    n: number;
    title: string;
    text: string;
    severity: 'info' | 'warn' | 'critical';
    resolved: boolean;
  }> {
    try {
      const raw = localStorage.getItem('apex_v13_lessons_cross_session');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { lessons?: unknown };
      if (!Array.isArray(parsed.lessons)) return [];
      return parsed.lessons as Array<{
        n: number;
        title: string;
        text: string;
        severity: 'info' | 'warn' | 'critical';
        resolved: boolean;
      }>;
    } catch {
      return [];
    }
  }

  /**
   * Record session learning (append à ax_lessons_learned_struct shared cross-app).
   * Permet à Apex + CMCteams + KDMC de partager les leçons via Firebase FB_FIX.
   */
  async recordSessionLearning(
    category: string,
    title: string,
    text: string,
    severity: Lesson['severity'] = 'warn',
  ): Promise<void> {
    /* Add à mémoire locale */
    this.recordLesson(category, title, text, severity);

    /* Push à store cross-app shared */
    try {
      const lessonsRaw = localStorage.getItem('ax_lessons_learned_struct');
      const arr = lessonsRaw ? (JSON.parse(lessonsRaw) as Array<Record<string, unknown>>) : [];
      arr.push({
        id: `L_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        category,
        title: title.slice(0, 120),
        text: text.slice(0, 500),
        severity,
        src: 'apex',
        ts: Date.now(),
        resolved: false,
      });
      /* Cap 200 + dédupe par similarité title */
      const dedup: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      for (const l of arr.slice(-200).reverse()) {
        const key = `${String(l['category'])}::${String(l['title']).slice(0, 50).toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          dedup.unshift(l);
        }
      }
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(dedup));
    } catch (err: unknown) {
      logger.warn('memory.recordLearning', 'shared store fail', { err });
    }
  }

  /**
   * Build admin cross-user knowledge — agrège facts/lessons de tous les users.
   * Réservé à Kevin admin (kdmc_admin) — règle CLAUDE.md "savoir de tous".
   * Anonymise les détails sensibles (préférences/allergies sont marquées per-user).
   */
  async buildAdminCrossUserKnowledge(): Promise<string> {
    try {
      const { persistentMemory: persistentMemoryStore } = await import('../services/storage/persistent-memory-store.js');
      const all = await persistentMemoryStore.list();
      /* Group par scope (user) */
      const byUser = new Map<string, typeof all>();
      for (const e of all) {
        const arr = byUser.get(e.scope) ?? [];
        arr.push(e);
        byUser.set(e.scope, arr);
      }
      const lines: string[] = ['## 👑 Cross-user knowledge (admin Kevin only)'];
      for (const [uid, entries] of byUser) {
        const top = entries
          .filter((e) => e.importance >= 60)
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 8);
        if (top.length === 0) continue;
        lines.push(`### User ${uid} (${entries.length} entries)`);
        for (const e of top) {
          lines.push(`- [${e.category}/${e.importance}] ${e.text}`);
        }
      }
      return lines.length > 1 ? lines.join('\n') : '';
    } catch (err: unknown) {
      logger.warn('memory.adminCross', 'failed', { err });
      return '';
    }
  }

  /**
   * Build system prompt DEEP — version enrichie avec docs sync + cross-knowledge.
   *
   * v13.3.49 — Cap absolu 8000 tokens (~32K chars) pour éviter HTTP 400 Anthropic.
   *
   * Sources injectées par ORDRE DE PRIORITÉ (drop si dépasse cap) :
   * 1. baseContext (toujours, identité + tools — non droppable)
   * 2. CLAUDE.md règles permanentes (priorité haute)
   * 3. NOTES_USER.md infos métier
   * 4. Top 50 facts user courant
   * 5. Top 10 lessons critiques
   * 6. MEMORY_PERSISTENT.md
   * 7. APEX_HANDOFF.md
   * 8. KEVIN_ACTIONS_TODO.md
   * 9. Top 30 facts shared cross-app
   * 10. Cross-user knowledge si admin
   */
  async buildSystemPromptDeep(
    currentUser: { id: string; name: string } | null,
    reserveChars = 0,
  ): Promise<string> {
    /* v13.3.49 cap budget (Kevin urgent fix HTTP 400 Anthropic).
     *
     * v13.4.365 (fix « system too long (33635 > 32000) », Kevin 2026-09-05) :
     * le plafond était calculé en dur ICI (un budget tokens multiplié par 4),
     * alors que `ai-router` en avait un second, écrit en dur là-bas. Entre eux,
     * `chat-engine` concaténait les injections (Projet actif, Assistant perso,
     * effort, RAG, mémoire compacte) que PERSONNE ne comptait. Ce corps
     * respectait son budget, le validateur mesurait une chaîne plus grosse →
     * Apex refusait tout message.
     *
     * Désormais : valeur unique dans core/prompt-budget.ts, et l'appelant
     * annonce le poids de ce qu'il ajoutera APRÈS via `reserveChars`, pour que
     * le budget porte sur la chaîne réellement envoyée.
     *
     * @param reserveChars Poids des blocs concaténés après ce corps (0 = aucun). */
    const MAX_PROMPT_CHARS = budgetForBody(reserveChars);

    /* IDENTITÉ IRRÉVOCABLE Kevin 2026-05-08 — TOUJOURS prepend en tête.
     * Apex ne peut jamais oublier qui il est, qui Kevin est, qui Laurence est,
     * ses projets, ses règles critiques. ~500-600 tokens, non droppable. */
    const identitySection = buildIdentitySection(currentUser?.id);
    const baseContext = this.buildSystemPromptContext(currentUser);

    /* identity + baseContext = toujours injecté (identité Apex/Kevin/Laurence + tools + architecture).
     * Si l'ensemble dépasse déjà cap → tronque baseContext (cas extrême), JAMAIS l'identité. */
    const headerCombined = identitySection + '\n\n' + baseContext;
    let total = headerCombined.length > MAX_PROMPT_CHARS
      ? headerCombined.slice(0, MAX_PROMPT_CHARS - 100) + '\n[…tronqué]'
      : headerCombined;

    const cap = (s: string, max: number) =>
      s.length > max ? s.slice(0, max) + '\n[…tronqué pour limite tokens]' : s;

    /* Helper : ajoute section seulement si reste de la place. */
    const addIfRoom = (section: string): boolean => {
      if (total.length + section.length + 4 /* "\n\n" */ < MAX_PROMPT_CHARS) {
        total += '\n\n' + section;
        return true;
      }
      return false;
    };

    /* Charge cache docs (synchronisés en arrière-plan, pas de fetch ici pour perf) */
    const docs = this.getDocsContext();

    /* PRIORITÉ 1 : CLAUDE.md règles permanentes (5000 chars max) */
    if (docs['CLAUDE.md']?.content) {
      addIfRoom(`## 📜 CLAUDE.md — Règles permanentes\n${cap(docs['CLAUDE.md'].content, 5000)}`);
    }

    /* PRIORITÉ 2 : NOTES_USER.md (3000 chars max) */
    if (docs['NOTES_USER.md']?.content) {
      addIfRoom(`## 📝 NOTES_USER.md — Infos métier Kevin\n${cap(docs['NOTES_USER.md'].content, 3000)}`);
    }

    /* Charge facts une seule fois pour réutilisation.
     * Mission Kevin 2026-05-08 — utilise les helpers getTop50ForSystemPrompt
     * + getTop10LessonsForSystemPrompt (pré-formatés, tri par importance×récence). */
    let userFactsFormatted = '';
    let userFactsCount = 0;
    let lessonsFormatted = '';
    let sharedFacts: Array<{ category: string; importance: number; text: string }> = [];
    try {
      const { persistentMemory: persistentMemoryStore } = await import('../services/storage/persistent-memory-store.js');
      if (currentUser) {
        const top = await persistentMemoryStore.getTop50ForSystemPrompt(currentUser.id, 50);
        userFactsCount = top.count;
        userFactsFormatted = top.formatted;
      }
      const lessons = await persistentMemoryStore.getTop10LessonsForSystemPrompt(10);
      lessonsFormatted = lessons.formatted;
      /* sharedFacts : facts scope global pour priorité 8 */
      const all = await persistentMemoryStore.list();
      sharedFacts = all
        .filter((e) => e.scope === 'global')
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 30);
    } catch {
      /* persistent store indispo */
    }

    /* PRIORITÉ 3 : Top 50 facts user courant (helper compact) */
    if (userFactsCount > 0 && userFactsFormatted) {
      addIfRoom(userFactsFormatted);
    }

    /* PRIORITÉ 4 : Top 10 lessons cross-session non résolues (helper compact) */
    if (lessonsFormatted) {
      addIfRoom(lessonsFormatted);
    }

    /* PRIORITÉ 5 : MEMORY_PERSISTENT.md */
    if (docs['MEMORY_PERSISTENT.md']?.content) {
      addIfRoom(`## 🧠 MEMORY_PERSISTENT.md — Facts cross-session\n${cap(docs['MEMORY_PERSISTENT.md'].content, 2000)}`);
    }

    /* PRIORITÉ 6 : APEX_HANDOFF.md */
    if (docs['APEX_HANDOFF.md']?.content) {
      addIfRoom(`## 🤝 APEX_HANDOFF.md — Communication Apex↔Claude Code\n${cap(docs['APEX_HANDOFF.md'].content, 2000)}`);
    }

    /* PRIORITÉ 7 : KEVIN_ACTIONS_TODO.md */
    if (docs['KEVIN_ACTIONS_TODO.md']?.content) {
      addIfRoom(`## ✅ KEVIN_ACTIONS_TODO.md — Actions Kevin en attente\n${cap(docs['KEVIN_ACTIONS_TODO.md'].content, 1500)}`);
    }

    /* PRIORITÉ 8 : Top 30 facts shared cross-app */
    if (sharedFacts.length > 0) {
      addIfRoom(
        `## 🌐 Facts cross-app shared (top ${sharedFacts.length})\n${sharedFacts.map((f) => `- [${f.category}] ${f.text}`).join('\n')}`,
      );
    }

    /* PRIORITÉ 9 : Admin Kevin = cross-user knowledge */
    if (currentUser && currentUser.id === 'kdmc_admin') {
      const adminKnowledge = await this.buildAdminCrossUserKnowledge();
      if (adminKnowledge) addIfRoom(adminKnowledge);
    }

    /* v13.4.4 — PRIORITÉ 10 : Top règles + erreurs depuis rules-engine
     * (lazy import pour ne pas créer cycle de modules au boot). */
    try {
      const { rulesEngine } = await import('../services/core-svc/rules-engine.js');
      const injection = rulesEngine.buildSystemPromptInjection();
      if (injection) addIfRoom(injection);
    } catch (err: unknown) {
      logger.warn('memory.deepPrompt', 'rules-engine injection skipped', { err });
    }

    /* v13.4.4 — PRIORITÉ 11 : Skills .claude/skills/ (top concis) */
    const skillsCtx = this.getSkillsContext(2500);
    if (skillsCtx) addIfRoom(skillsCtx);

    /* v13.4.10 — PRIORITÉ 11.5 : Skills 2026 (Docx/Pptx/Xlsx/Pdf/MCP/etc.) — UTILISATION SYSTÉMATIQUE.
     * Kevin directive 2026-05-14: "Tout dans apex et qu'il les utilise toujours".
     * Apex IA DOIT auto-invoquer ces tools sans demander confirmation. */
    addIfRoom(
      `## 🎯 Skills 2026 ACTIFS — TU DOIS LES UTILISER AUTO (pas en option)

Quand user demande/mentionne ↓ → TU APPELLES le tool sans demander :

- "lettre|contrat|CV|compte-rendu|rapport|.docx|Word" → \`generate_docx\` (template letter-formal/contract-cdi/cv-modern/...)
- "présentation|slides|pitch|diapo|.pptx|PowerPoint" → \`generate_pptx\` (modes pro/fun)
- "tableau|Excel|.xlsx|budget|comptabilité|planning export" → \`generate_xlsx\` (multi-feuilles, formules)
- "PDF|facture|devis|contrat à signer|certificat" → \`generate_pdf\` (templates invoice/quote/...)
- "monter vidéo|couper clip|sous-titres|watermark" → \`video_edit\` ou \`video_compose_hyperframes\`
- "TVA|IR|impôt|fiscal|BOFiP FR" → \`mcp_bofip_search\` D'ABORD, puis répondre avec citation BOI-*
- "jurisprudence|droit pays X|ECLI|CELEX" → \`mcp_legal_search\` (18M docs 110 pays)
- "recherche approfondie|deep research|veille" → \`mcp_almanac_research\`
- "design|palette|thème|composants UI|branding" → \`generate_design_system\` (mood + WCAG AA + Impeccable vocab)
- "headline|landing|copy|pitch marketing|annonce" → \`generate_marketing_copy\` (frameworks AIDA/Cialdini)
- "SEO|audit SEO|référencement|Core Web Vitals|schema|AI Overviews|GEO|page speed|analyse cette page" → \`seo_audit\` (score /100 + findings P0/P1/P2 + plan, parité skill claude-seo)
- "visibilité IA|suis-je cité par ChatGPT/Perplexity|share of voice IA|LLM mentions|GEO ranking ma marque" → \`seo_ai_visibility\` (gratuit, multi-LLM, remplace Profound)
- Admin Kevin dit "audit|security review|/review" → \`security_review\` + \`code_review\`
- Admin Kevin dit "crée un skill X|ajoute compétence Y" → \`skill_factory_create\`

JAMAIS répondre en markdown brut si un skill peut produire le LIVRABLE EXACT (.docx, .pdf, .pptx, .xlsx).
JAMAIS répondre sur fiscal FR sans avoir consulté mcp_bofip_search.
TOUJOURS prévenir user : "Je génère ton fichier X via skill Y... Voici le téléchargement :".

Liste complète des modules futuristes (60+) : invoque \`futuristic_module_invoke\` avec module_id. Exemples :
apex-image-gen-flux2-pro, apex-video-gen-sora-2, apex-music-suno-v5, apex-3d-meshy-v4, apex-pq-crypto-kyber, etc.

## 🤖 MCP Servers actifs
- mcp_bofip : Doctrine fiscale française officielle (Bulletin Officiel Finances Publiques)
- mcp_almanac : Deep Research multi-sources web+academic+news
- mcp_legal_hunter : 18M+ documents juridiques 110+ pays (Cassation/CE/CJUE/SCOTUS/SCC...)

Configuration : vue admin \`?view=mcp-servers\`. Tokens stockés chiffrés dans Vault Apex.`,
    );

    /* v13.4.x — PRIORITÉ 11.6 : DeepSeek = fournisseur spécialiste CODE.
     * Kevin directive 2026-05-21: "DeepSeek spécialiste code, qu'il s'en serve auto". */
    addIfRoom(
      `## 🧬 DeepSeek — fournisseur spécialiste CODE (auto-routing)

Pour toute tâche de CODE (génération, debug, refactor, revue, complétion de code), le
smart-router classe DeepSeek parmi les providers code (provider \`deepseek\`, le plus
économique, fort en code — héritier de DeepSeek-Coder-V2).
- TU le sais : DeepSeek est ton spécialiste code + ton failover code prioritaire.
- Routing AUTOMATIQUE et transparent : tâche détectée "code" → smart-router peut router vers DeepSeek. Tu n'as RIEN à demander à l'user.
- DeepSeek-Coder-V2 = poids ouverts d'un modèle serveur (pas client-side) ; Apex y accède via l'API DeepSeek (clé \`ax_deepseek_key\` dans le Vault).`,
    );

    /* v13.4.4 — PRIORITÉ 12 : Rules .claude/rules/ (frontend/security/methodology) */
    const rulesCtx = this.getRulesContext(2000);
    if (rulesCtx) addIfRoom(rulesCtx);

    /* v13.4.4 — PRIORITÉ 13 : Capacités récentes Apex (registry) */
    try {
      const { renderRecentCapabilitiesForPrompt } = await import('../data/apex-recent-capabilities.js');
      const cap = renderRecentCapabilitiesForPrompt();
      if (cap) addIfRoom(cap);
    } catch (err: unknown) {
      logger.warn('memory.deepPrompt', 'recent capabilities skipped', { err });
    }

    /* v13.4.6 — PRIORITÉ 14 : Credentials disponibles dans le vault (Kevin "Apex doit
     * savoir tout ce qu'il a"). Apex doit pouvoir répondre "j'ai accès à Anthropic,
     * OpenAI, GitHub..." sans confusion ni hallucination. Liste les SERVICES configurés
     * (pas les valeurs, jamais de leak). */
    try {
      const vaultKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('ax_') && k.endsWith('_key')) vaultKeys.push(k);
        if (k.startsWith('ax_') && (k.endsWith('_token') || k.endsWith('_secret'))) vaultKeys.push(k);
      }
      if (vaultKeys.length > 0) {
        const services = vaultKeys
          .map((k) => k.replace(/^ax_/, '').replace(/_(?:key|token|secret)$/, ''))
          .filter((s, i, arr) => arr.indexOf(s) === i) /* unique */
          .sort();
        addIfRoom(
          `## 🔐 Coffre — Credentials disponibles (${services.length} services configurés)\n` +
          services.map((s) => `- ✅ ${s}`).join('\n') +
          `\n\n_Si user demande accès à un service NON présent ci-dessus → réponse claire "clé absente, à ajouter dans le Coffre"._`,
        );
      }
    } catch (err: unknown) {
      logger.warn('memory.deepPrompt', 'vault awareness skipped', { err });
    }

    /* v13.4.6 — PRIORITÉ 15 : Pièces jointes session courante (Kevin "quand je dépose
     * un dossier/photo/document, il ne sait pas où ils sont"). Apex doit voir ses
     * attachments en cours pour pouvoir y répondre ("tu m'as envoyé la photo X il y a 5 min"). */
    try {
      const raw = localStorage.getItem('ax_v13_attachments');
      if (raw) {
        const entries = JSON.parse(raw) as Array<{
          ts: number; name: string; type: string; size: number;
          status: string; analysis?: { type?: string; description?: string };
        }>;
        if (Array.isArray(entries) && entries.length > 0) {
          const recent = entries.slice(-15).reverse();
          const lines = recent.map((e) => {
            const age = Math.floor((Date.now() - e.ts) / 60000);
            const ageStr = age < 1 ? "à l'instant" : age < 60 ? `il y a ${age}min` : `il y a ${Math.floor(age / 60)}h`;
            const sizeKb = Math.round(e.size / 1024);
            const ana = e.analysis?.description ? ` — ${e.analysis.description}` : '';
            return `- 📎 ${e.name} (${e.type}, ${sizeKb}KB, ${ageStr}, ${e.status})${ana}`;
          });
          addIfRoom(
            `## 📎 Pièces jointes session (${recent.length} récentes, total ${entries.length})\n` +
            lines.join('\n') +
            `\n\n_Si user demande "où est mon fichier X" → vérifier cette liste avant de dire "je ne sais pas"._`,
          );
        }
      }
    } catch (err: unknown) {
      logger.warn('memory.deepPrompt', 'attachments awareness skipped', { err });
    }

    return total;
  }
}

export const memory = new Memory();
