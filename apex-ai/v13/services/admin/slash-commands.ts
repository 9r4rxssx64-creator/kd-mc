/**
 * APEX v13.3.48 — Slash Commands service
 *
 * Demande Kevin règle "Tout au max — chat Apex niveau Claude.ai/ChatGPT" :
 * commandes rapides accessibles via `/` au début du message.
 *
 * Usage : `/help`, `/clear`, `/voice`, `/export`, `/settings`, `/regen`, `/search query`, `/copy`, `/version`
 *
 * Patterns :
 * - Detection : ligne commence par `/` + nom de commande connue
 * - Autocomplete : si user tape `/` seul → liste suggestions
 * - Exécution : retourne action (clear, navigate, toast, custom)
 *
 * Pas de dépendance UI directe (pure logique). Wired par features/chat/index.ts.
 */

export interface SlashCommand {
  name: string;
  emoji: string;
  description: string;
  /** Args attendus (ex: "<query>" ou "" si aucun) */
  argsHint: string;
  /** Si true, args requis pour exécuter */
  requiresArgs?: boolean;
  /** Si défini, la commande navigue vers cette route (handler générique). */
  route?: string;
  /**
   * Si défini, cliquer la commande préremplit le chat avec ce texte (mode de
   * réflexion — pas d'auto-submit ; Kevin colle/complète son contenu puis envoie).
   * Utilisé par les commandes ghost/roast/matrix/brief/steal/focus/challenge/
   * expand/systemize.
   */
  prefill?: string;
  /**
   * Si défini, la commande déclenche un workflow CI via repository_dispatch
   * (claudeBridge.dispatchWorkflow) — l'arsenal sécurité scellé kd-mc.com :
   * 'security-suite' (/audit), 'strix-scan' (/pentest), 'agent-reach' (/web).
   * Résultat asynchrone dans Firebase ax_*_last (Apex le lit ensuite).
   */
  dispatch?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', emoji: 'ℹ️', description: 'Liste toutes les commandes disponibles', argsHint: '' },
  { name: 'clear', emoji: '🧹', description: 'Efface la conversation courante', argsHint: '' },
  { name: 'voice', emoji: '🔊', description: 'Active/désactive lecture vocale auto', argsHint: '' },
  { name: 'effort', emoji: '🧠', description: 'Effort de raisonnement (auto/direct/moyen/élevé) — élevé montre la réflexion', argsHint: '<auto|direct|moyen|élevé>' },
  { name: 'thinking', emoji: '🧠', description: 'Raisonnement NATIF Anthropic (on/off) — extended thinking réel, avec effort « élevé »', argsHint: '<on|off>' },
  { name: 'orchestre', emoji: '🎼', description: 'Orchestre d\'IA — consulte TOUTES les IA dispo en parallèle + synthèse Claude (auto sur gros travail ; on/off ; ou pose ta question)', argsHint: '<question|on|off>' },
  { name: 'approbations', emoji: '🔐', description: 'Coffre d\'autorisations — je fais tout, tu valides d\'un Face ID (connexion, paiement, signature, KYC)', argsHint: '' },
  { name: 'export', emoji: '📄', description: 'Exporte la conversation en Markdown', argsHint: '' },
  { name: 'partager', emoji: '📤', description: 'Partage la conversation (fichier HTML autonome)', argsHint: '' },
  { name: 'canvas', emoji: '🎨', description: 'Ouvre le dernier code/HTML/SVG en Canvas (édition + aperçu live)', argsHint: '' },
  { name: 'settings', emoji: '⚙️', description: 'Ouvre les réglages', argsHint: '' },
  { name: 'snippets', emoji: '💻', description: 'Liste les codes/snippets sauvés dans le Coffre', argsHint: '' },
  { name: 'regen', emoji: '🔄', description: 'Régénère la dernière réponse Apex', argsHint: '' },
  { name: 'search', emoji: '🔎', description: 'Cherche dans la conversation', argsHint: '<keyword>', requiresArgs: true },
  { name: 'copy', emoji: '📋', description: 'Copie la dernière réponse Apex', argsHint: '' },
  { name: 'version', emoji: '🏷️', description: 'Affiche la version Apex', argsHint: '' },
  { name: 'fork', emoji: '🌿', description: 'Démarre une nouvelle conversation depuis ce point', argsHint: '' },
  /* v13.4.3 — IA IRL TikTok */
  { name: 'loop', emoji: '🔁', description: 'Queue tâche autonome (list/pause/resume/clear ou texte)', argsHint: '<task|list|pause|resume|clear>' },
  { name: 'plan', emoji: '🗺', description: 'Génère un plan structuré avant exécution', argsHint: '<objectif>', requiresArgs: true },
  { name: 'recherche', emoji: '🔬', description: 'Recherche approfondie web multi-sources + rapport cité', argsHint: '<sujet>', requiresArgs: true },
  { name: 'briefing', emoji: '☀️', description: 'Briefing du jour personnalisé (Pulse) depuis ta mémoire', argsHint: '' },
  { name: 'rules', emoji: '📜', description: 'Affiche les règles permanentes Apex (filtre optionnel)', argsHint: '<keyword?>' },
  /* v13.4.5 — Mode autonome Apex (Kevin 2026-05-10) */
  { name: 'autonomous', emoji: '🤖', description: 'Mode autonome : Apex bosse seul jusqu\'à fin/quota (status/stop)', argsHint: '<objectif|status|stop>' },
  /* v13.4.245 — commandes audit/diagnostic (Kevin "lancer /ultrareview") */
  { name: 'ultrareview', emoji: '🔍', description: 'Audit complet Apex — 8 axes, mode brutal', argsHint: '' },
  { name: 'diag', emoji: '🩺', description: 'Diagnostic runtime Apex (santé live)', argsHint: '' },
  { name: 'test', emoji: '🧪', description: 'Lance les auto-tests runtime', argsHint: '' },
  /* Sécurité — arsenal hacker éthique, scellé aux apps kd-mc.com (déclenche les workflows CI) */
  { name: 'audit', emoji: '🛡️', description: 'Suite sécurité (gitleaks/trufflehog/osv/trivy/semgrep/zizmor) sur le repo — résultat dans ax_security_last', argsHint: '', dispatch: 'security-suite' },
  { name: 'scanfix', emoji: '🛠️', description: 'Scanne le code ET applique les corrections vérifiées (via Claude Code, sans rien casser) — équivalent « scan and fix your codebase »', argsHint: '', dispatch: 'security-suite' },
  { name: 'pentest', emoji: '🕷️', description: 'Pentest IA autonome (Strix) sur une app kd-mc.com — résultat dans ax_strix_last', argsHint: '<cible=chemin|url kd-mc.com>', dispatch: 'strix-scan' },
  { name: 'web', emoji: '🌐', description: 'Lit une page web / cherche via Agent-Reach (résultat dans ax_agent_reach_last)', argsHint: '<url|requête>', dispatch: 'agent-reach' },
  { name: 'perf', emoji: '⚡', description: 'Audit perf (Unlighthouse) d\'une app kd-mc.com — résultat dans ax_perf_last', argsHint: '<url kd-mc.com?>', dispatch: 'perf-audit' },
  /* v13.4.250 — navigation : une commande par destination (Kevin "toutes les commandes /") */
  { name: 'vault', emoji: '🔐', description: 'Ouvre le Coffre (clés, secrets)', argsHint: '', route: 'vault' },
  { name: 'dashboard', emoji: '📊', description: 'Ouvre le tableau de bord', argsHint: '', route: 'dashboard' },
  { name: 'notes', emoji: '📝', description: 'Ouvre les notes', argsHint: '', route: 'notes' },
  { name: 'assistants', emoji: '🎭', description: 'Mes assistants personnalisés (Gems)', argsHint: '', route: 'assistants' },
  { name: 'projets', emoji: '📁', description: 'Mes projets / workspaces (instructions + connaissances)', argsHint: '', route: 'projects' },
  { name: 'taches', emoji: '⏰', description: 'Tâches programmées (prompts récurrents)', argsHint: '', route: 'scheduled' },
  { name: 'calendar', emoji: '📅', description: 'Ouvre le calendrier', argsHint: '', route: 'calendar' },
  { name: 'legal', emoji: '⚖️', description: 'Ouvre le module juridique', argsHint: '', route: 'legal' },
  { name: 'browser', emoji: '🌐', description: 'Ouvre le navigateur intégré', argsHint: '', route: 'browser' },
  { name: 'crypto', emoji: '🪙', description: 'Ouvre le module crypto', argsHint: '', route: 'crypto' },
  { name: 'calc', emoji: '🧮', description: 'Ouvre les calculatrices', argsHint: '', route: 'calculators' },
  { name: 'knowledge', emoji: '🧠', description: 'Ouvre la base de connaissances', argsHint: '', route: 'knowledge' },
  { name: 'sentinels', emoji: '🛡', description: 'Ouvre les sentinelles', argsHint: '', route: 'sentinels' },
  { name: 'billing', emoji: '💳', description: 'Ouvre l\'abonnement / facturation', argsHint: '', route: 'billing' },
  { name: 'studios', emoji: '🎨', description: 'Ouvre les studios créatifs', argsHint: '', route: 'studios' },
  { name: 'remote', emoji: '📡', description: 'Ouvre la télécommande', argsHint: '', route: 'remote' },
  { name: 'domotique', emoji: '🏠', description: 'Ouvre la domotique', argsHint: '', route: 'domotique' },
  { name: 'geo', emoji: '📍', description: 'Ouvre la géolocalisation', argsHint: '', route: 'geolocation' },
  { name: 'workflow', emoji: '🔀', description: 'Ouvre les workflows', argsHint: '', route: 'workflow' },
  { name: 'marketplace', emoji: '🛒', description: 'Ouvre la marketplace', argsHint: '', route: 'marketplace' },
  { name: 'plugins', emoji: '🧩', description: 'Ouvre les plugins', argsHint: '', route: 'plugins' },
  { name: 'archive', emoji: '🗄', description: 'Ouvre les archives', argsHint: '', route: 'archive' },
  { name: 'pro', emoji: '💼', description: 'Ouvre l\'espace pro', argsHint: '', route: 'pro' },
  { name: 'toolbox', emoji: '🧰', description: 'Ouvre la boîte à outils Apex', argsHint: '', route: 'apex-toolbox' },
  { name: 'mcp', emoji: '🔌', description: 'Ouvre les serveurs MCP', argsHint: '', route: 'mcp-servers' },
  { name: 'innovation', emoji: '💡', description: 'Ouvre la veille innovation', argsHint: '', route: 'innovation' },
  { name: 'iot', emoji: '📲', description: 'Ouvre les fournisseurs IoT', argsHint: '', route: 'iot-providers' },
  { name: 'device', emoji: '📱', description: 'Ouvre les appareils', argsHint: '', route: 'device' },
  { name: 'voicebio', emoji: '🎙', description: 'Ouvre la biométrie vocale', argsHint: '', route: 'voice-bio' },
  { name: 'smartrouter', emoji: '🧭', description: 'Ouvre le routeur IA intelligent', argsHint: '', route: 'smart-router' },
  /* Studios créatifs — raccourcis directs */
  { name: 'music', emoji: '🎵', description: 'Studio musique', argsHint: '', route: 'studio-music' },
  { name: 'video', emoji: '🎬', description: 'Studio vidéo', argsHint: '', route: 'studio-video' },
  { name: 'photo', emoji: '📸', description: 'Studio photo', argsHint: '', route: 'studio-photo' },
  { name: 'cv', emoji: '📄', description: 'Studio CV', argsHint: '', route: 'studio-cv' },
  { name: 'facture', emoji: '🧾', description: 'Studio facture / devis', argsHint: '', route: 'studio-invoice' },
  { name: 'logo', emoji: '🎯', description: 'Studio logo', argsHint: '', route: 'studio-logo' },
  { name: 'scan', emoji: '📷', description: 'Studio scan / OCR', argsHint: '', route: 'studio-scan' },
  { name: 'pdf', emoji: '📕', description: 'Studio PDF', argsHint: '', route: 'studio-pdf' },
  { name: 'prefecture', emoji: '🏛', description: 'Studio dossier préfecture', argsHint: '', route: 'studio-prefecture' },
  { name: 'presentation', emoji: '📑', description: 'Studio présentation', argsHint: '', route: 'studio-presentation' },
  /* v13.4.252 — commandes demandées par Kevin */
  { name: 'team-onboarding', emoji: '👥', description: 'Ouvre l\'accueil / onboarding équipe', argsHint: '', route: 'onboarding' },
  { name: 'skill-creator', emoji: '🛠', description: 'Ouvre les skills Apex (catalogue 2026)', argsHint: '', route: 'skills-2026' },
  { name: 'schedule', emoji: '🗓', description: 'Ouvre l\'agenda / planification', argsHint: '', route: 'calendar' },
  { name: 'remote-control', emoji: '📡', description: 'Ouvre la télécommande universelle', argsHint: '', route: 'remote' },
  { name: 'chrome', emoji: '🖥', description: 'Ouvre le navigateur intégré (Apex Chrome)', argsHint: '', route: 'browser' },
  { name: 'resume', emoji: '▶️', description: 'Reprend la boucle autonome en pause', argsHint: '' },
  { name: 'statusline', emoji: '📟', description: 'Affiche l\'état d\'Apex (version, IA, boucle, conv)', argsHint: '' },
  { name: 'ooda', emoji: '🎯', description: 'Analyse OODA (Observe-Orient-Decide-Act) d\'un objectif', argsHint: '<objectif>', requiresArgs: true },
  /* v13.4.253 — mémo dédié des commandes */
  { name: 'commands', emoji: '📒', description: 'Mémo dédié : toutes les commandes du chat', argsHint: '', route: 'commands' },
  /* Commandes de réflexion (modes de prompt) — clic = prefill du chat, pas d'auto-submit */
  { name: 'ghost', emoji: '👻', description: 'Réécrit pour sonner 100% humain (enlève les tics d\'IA)', argsHint: '<texte>', prefill: 'Réécris ce qui suit pour sonner 100% humain, sans aucun tic d\'IA : ' },
  { name: 'roast', emoji: '🔥', description: 'Feedback brutalement honnête, sans filtre (cash mais utile)', argsHint: '<sujet>', prefill: 'Donne-moi un feedback brutalement honnête et sans filtre, cash mais utile, sur : ' },
  { name: 'matrix', emoji: '🔲', description: 'Présente les options et compromis dans une matrice claire', argsHint: '<sujet>', prefill: 'Présente les options et leurs compromis dans une matrice claire pour : ' },
  { name: 'brief', emoji: '⚡', description: 'Condense à l\'essentiel (TL;DR ultra-court et actionnable)', argsHint: '<texte>', prefill: 'Condense à l\'essentiel — un TL;DR ultra-court et actionnable de : ' },
  { name: 'steal', emoji: '🪝', description: 'Reverse-engineer ce qui marche (et comment le reproduire)', argsHint: '<sujet>', prefill: 'Reverse-engineer ce qui marche, et explique comment le reproduire, pour : ' },
  { name: 'focus', emoji: '🎯', description: 'Coupe le bruit, ne garde que ce qui compte vraiment', argsHint: '<sujet>', prefill: 'Coupe le bruit et ne garde que ce qui compte vraiment dans : ' },
  { name: 'challenge', emoji: '🥊', description: 'Avocat du diable, attaque les hypothèses, stress-test l\'idée', argsHint: '<idée>', prefill: 'Joue l\'avocat du diable : attaque les hypothèses et stress-teste cette idée : ' },
  { name: 'expand', emoji: '🌱', description: 'Explore les implications, cas d\'usage et extensions', argsHint: '<sujet>', prefill: 'Explore les implications, les cas d\'usage et les extensions possibles de : ' },
  { name: 'systemize', emoji: '⚙️', description: 'Transforme un coup unique en système / workflow réutilisable', argsHint: '<sujet>', prefill: 'Transforme ceci en système / workflow réutilisable (étapes répétables) : ' },
  { name: 'simplify', emoji: '🧒', description: 'Explique simplement, comme à un débutant (0 jargon)', argsHint: '<sujet>', prefill: 'Explique simplement, comme à un débutant, sans aucun jargon : ' },
];

export interface SlashParseResult {
  isSlash: boolean;
  command?: SlashCommand;
  rawCommand?: string; // ex: 'help'
  args?: string; // ex: 'mon mot-clé'
  /** True si user a tapé un nom de commande inconnu (suggestion à afficher) */
  unknown?: boolean;
}

/**
 * Parse un message user pour détecter une slash command.
 * Retourne `{ isSlash: false }` si ce n'est pas une commande.
 */
export function parseSlashCommand(text: string): SlashParseResult {
  if (!text || typeof text !== 'string') return { isSlash: false };
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { isSlash: false };
  const body = trimmed.slice(1).trim();
  if (body.length === 0) return { isSlash: true, unknown: true };

  /* Découpe nom + args */
  const spaceIdx = body.indexOf(' ');
  const rawCmd = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim();

  const cmd = SLASH_COMMANDS.find((c) => c.name === rawCmd);
  if (!cmd) return { isSlash: true, unknown: true, rawCommand: rawCmd, args };

  return { isSlash: true, command: cmd, rawCommand: rawCmd, args };
}

/**
 * Filtre les commandes pour autocomplete.
 * `prefix` = ce que user a tapé après `/`.
 * Retourne max 6 suggestions ordonnées par pertinence (startsWith d'abord).
 */
export function filterCommands(prefix: string): SlashCommand[] {
  const p = (prefix || '').toLowerCase().trim();
  if (!p) return SLASH_COMMANDS.slice(0, 6);
  const startsWith = SLASH_COMMANDS.filter((c) => c.name.startsWith(p));
  const includes = SLASH_COMMANDS.filter(
    (c) => !c.name.startsWith(p) && (c.name.includes(p) || c.description.toLowerCase().includes(p)),
  );
  return [...startsWith, ...includes].slice(0, 6);
}

/**
 * Génère le texte d'aide pour la commande `/help`.
 */
export function helpText(): string {
  const lines = SLASH_COMMANDS.map((c) => `- \`/${c.name}${c.argsHint ? ' ' + c.argsHint : ''}\` ${c.emoji} ${c.description}`);
  return `### Commandes disponibles\n\n${lines.join('\n')}\n\nTape \`/\` pour voir l'autocomplete.`;
}
