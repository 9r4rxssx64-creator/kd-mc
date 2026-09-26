/**
 * Boîte à outils agents — les 6 dépôts du tableau « Une Notion = Un Projet » (Kevin 2026-08-06).
 *
 * Ce qu'on verrouille ici (parité Apex ↔ Claude Code) :
 *  - les 6 sont bien dans le catalogue Apex (sinon Apex ne les « connaît » pas) ;
 *  - la source déclarée dans Apex est la MÊME URL que celle vendorisée côté Claude Code
 *    (tools/agent-toolkit/sources.json) → impossible de faire diverger les deux installs ;
 *  - honnêteté PWA : rtk est un binaire desktop, il ne doit jamais être annoncé « compatible
 *    navigateur » (règle : ne pas survendre) ;
 *  - aucun doublon d'identifiant introduit dans le catalogue.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { APEX_PLUGINS_CATALOG } from '../../data/apex-plugins-catalog.js';

/* Le fichier vit à la racine du dépôt ; vitest tourne depuis apex-ai/v13 (mais pas toujours
   selon d'où on lance) → on remonte jusqu'à le trouver, sans supposer le cwd. */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'tools/agent-toolkit/sources.json'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('racine du dépôt introuvable depuis ' + process.cwd());
}
const findSources = (): string => resolve(findRepoRoot(), 'tools/agent-toolkit/sources.json');

const SOURCES = JSON.parse(readFileSync(findSources(), 'utf8')) as {
  sources: Array<{ id: string; repo: string; notion: string }>;
};

/* id du catalogue Apex ↔ id de la vendorisation Claude Code */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['anthropic-skills', 'skills'],
  ['gbrain', 'gbrain'],
  ['awesome-design-skills', 'awesome-design-skills'],
  ['rtk-token-saver', 'rtk'],
  ['meridian-company-os', 'meridian-company-os'],
  ['free-llm-api-resources', 'free-llm-api-resources'],
  ['free-for-dev', 'free-for-dev'],
  ['app-store-connect-cli', 'app-store-connect-cli'],
  ['app-store-connect-cli-skills', 'app-store-connect-cli-skills'],
];

describe('Boîte à outils agents — parité Apex / Claude Code', () => {
  it('les 6 dépôts du tableau sont dans le catalogue Apex', () => {
    const ids = APEX_PLUGINS_CATALOG.map((p) => p.id);
    for (const [apexId] of PAIRS) expect(ids, 'manque ' + apexId).toContain(apexId);
  });

  it('chaque entrée Apex pointe la MÊME URL que la source vendorisée', () => {
    for (const [apexId, srcId] of PAIRS) {
      const plugin = APEX_PLUGINS_CATALOG.find((p) => p.id === apexId)!;
      const src = SOURCES.sources.find((s) => s.id === srcId)!;
      expect(src, 'source ' + srcId + ' absente de sources.json').toBeTruthy();
      expect(plugin.url).toBe(src.repo);
    }
  });

  it('toutes portent le tag agent-toolkit (filtrable dans la vue Plugins)', () => {
    for (const [apexId] of PAIRS) {
      const plugin = APEX_PLUGINS_CATALOG.find((p) => p.id === apexId)!;
      expect(plugin.tags ?? [], apexId).toContain('agent-toolkit');
    }
  });

  it('honnêteté : rtk (binaire desktop) n\'est PAS annoncé compatible navigateur', () => {
    const rtk = APEX_PLUGINS_CATALOG.find((p) => p.id === 'rtk-token-saver')!;
    expect(rtk.pwa_compatible).toBe(false);
    expect(rtk.status).toBe('unsupported-pwa');
  });

  it('aucun identifiant en double dans le catalogue', () => {
    const ids = APEX_PLUGINS_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /* Apex ne lit QUE les fichiers .md à plat de .claude/skills/ (syncMeta filtre type==='file').
     Mes skills à moi sont des DOSSIERS → invisibles pour lui. D'où la convention du dépôt :
     un skill dossier pour Claude Code + un apex-*.md concis pour Apex. Ce test empêche qu'on
     ajoute un skill pour moi en oubliant Apex (règle PARITÉ APEX). */
  it('parité skills : chaque skill dossier de cette session a son pendant apex-*.md', () => {
    const root = findRepoRoot();
    for (const [dir, flat] of [
      ['agent-toolkit', 'apex-agent-toolkit.md'],
      ['domain-journal', 'apex-domain-journal.md'],
      ['verif-reelle', 'apex-verif-reelle.md'],
      ['appstore', 'apex-appstore.md'],
    ] as const) {
      expect(existsSync(resolve(root, '.claude/skills', dir, 'SKILL.md')), dir).toBe(true);
      expect(existsSync(resolve(root, '.claude/skills', flat)), flat).toBe(true);
    }
  });

  it('le skill Apex cite les MÊMES 6 dépôts que la vendorisation', () => {
    const txt = readFileSync(resolve(findRepoRoot(), '.claude/skills/apex-agent-toolkit.md'), 'utf8');
    for (const s of SOURCES.sources) {
      const nom = s.repo.replace('https://github.com/', '');
      expect(txt, 'apex-agent-toolkit.md ne cite pas ' + nom).toContain(nom);
    }
  });

  it('le skill Apex rappelle qu\'Anthropic reste l\'IA principale (leçons #124/#129)', () => {
    const txt = readFileSync(resolve(findRepoRoot(), '.claude/skills/apex-agent-toolkit.md'), 'utf8');
    expect(txt).toMatch(/Anthropic reste l'IA principale/i);
    expect(txt).toMatch(/fin\*{0,2} de `DEFAULT_CHAIN`|en \*\*fin\*\* de/i);
  });

  it('chaque entrée a une description utile (pas un titre recopié)', () => {
    for (const [apexId] of PAIRS) {
      const plugin = APEX_PLUGINS_CATALOG.find((p) => p.id === apexId)!;
      expect(plugin.description.length, apexId).toBeGreaterThan(60);
    }
  });
});

/* Équité Apex ↔ Claude Code sur les 13 agents AITMPL : ce que Claude Code a vendorisé pour lui
   (vendor/agent-toolkit/aitmpl/agents/), Apex doit AUSSI le connaître (règle PARITÉ APEX). Ce
   test empêche d'ajouter/retirer un agent côté fichiers sans mettre Apex au courant. */
const AITMPL_AGENTS = [
  'api-architect', 'competitive-analyst', 'content-marketer', 'customer-support',
  'graphql-security-specialist', 'llm-architect', 'market-researcher', 'model-evaluator',
  'prompt-engineer', 'search-specialist', 'shopify-expert', 'smart-contract-auditor',
  'task-decomposition-expert',
] as const;

describe('Agents AITMPL — équité Apex / Claude Code', () => {
  const root = findRepoRoot();
  const agentsDir = resolve(root, 'vendor/agent-toolkit/aitmpl/agents');

  it('les 13 agents vendorisés existent sur le disque, ni plus ni moins', () => {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
    expect(files).toEqual([...AITMPL_AGENTS].sort());
  });

  it('la catégorie « légal » est bien exclue (skill officielle legal déjà présente)', () => {
    const files = readdirSync(agentsDir);
    for (const banni of ['legal-advisor.md', 'accessibility-tester.md', 'ai-ethics-advisor.md']) {
      expect(files, 'ne doit PAS vendoriser ' + banni).not.toContain(banni);
    }
  });

  it('l\'entrée aitmpl-agents est dans le catalogue Apex, tag agent-toolkit, bonne URL', () => {
    const p = APEX_PLUGINS_CATALOG.find((x) => x.id === 'aitmpl-agents');
    expect(p, 'aitmpl-agents absent du catalogue Apex').toBeTruthy();
    expect(p!.url).toBe('https://github.com/davila7/claude-code-templates');
    expect(p!.tags ?? []).toContain('agent-toolkit');
    expect(p!.description.length).toBeGreaterThan(60);
  });

  it('le skill plat qu\'Apex LIT cite les 13 agents (sinon Apex ne les « connaît » pas)', () => {
    const txt = readFileSync(resolve(root, '.claude/skills/apex-agent-toolkit.md'), 'utf8');
    for (const a of AITMPL_AGENTS) expect(txt, 'apex-agent-toolkit.md ne cite pas ' + a).toContain(a);
  });

  it('honnêteté sécu : jamais recommander `npx claude-code-templates` dans le skill Apex', () => {
    const txt = readFileSync(resolve(root, '.claude/skills/apex-agent-toolkit.md'), 'utf8');
    expect(txt).toMatch(/Jamais\s+`npx claude-code-templates`/i);
  });
});
