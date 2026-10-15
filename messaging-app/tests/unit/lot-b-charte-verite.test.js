// @vitest-environment node
/**
 * Lot B — « les promesses montrées aux utilisateurs doivent être vraies » (A6-01, A6-02, A6-04, A6-07).
 * La charte (privacy.html) et les CGU sont confrontées au CODE et au déploiement réel :
 *  - chaque fournisseur d'IA dont la clé est poussée par deploy-apex-chat.yml (et Workers AI) est nommé dans la charte ;
 *  - le vrai nom affiché dans les notifications (ConversationDO) est annoncé, plus de « vrai nom jamais révélé » ;
 *  - la position GPS envoyée en arrière-plan, sa durée (30 jours) et l'interrupteur admin sont annoncés ;
 *  - plus de « tu peux les désactiver dans les réglages IA » sans réglage, ni « jamais en arrière-plan ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SECRET_NAMES } from '../../../services/_shared/ia-route.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PRIVACY = process.env.PRIVACY_PATH ? readFileSync(process.env.PRIVACY_PATH, 'utf8') : read('privacy.html');
const CGU = process.env.CGU_PATH ? readFileSync(process.env.CGU_PATH, 'utf8') : read('cgu.html');
const DEPLOY = read('../.github/workflows/deploy-apex-chat.yml');
const DO_SRC = read('workers/durable-objects/ConversationDO.js');
const INDEX = process.env.CLIENT_INDEX_PATH ? readFileSync(process.env.CLIENT_INDEX_PATH, 'utf8') : read('index.html');
const NOMS = { anthropic: 'Anthropic', openai: 'OpenAI', groq: 'Groq', gemini: 'Gemini', mistral: 'Mistral', openrouter: 'OpenRouter',
  cerebras: 'Cerebras', deepseek: 'DeepSeek', perplexity: 'Perplexity', sambanova: 'SambaNova', nvidia: 'NVIDIA', together: 'Together',
  huggingface: 'Hugging Face', glm: 'GLM', cohere: 'Cohere' };
const texte = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Lot B — charte privée fidèle au code', () => {
  it('A6-04 : chaque fournisseur d\'IA réellement configuré au déploiement est nommé dans la charte', () => {
    const pousses = [...DEPLOY.matchAll(/push_if_set "([A-Z_]+)"/g)].map((m) => m[1]);
    const ia = Object.entries(SECRET_NAMES).filter(([, s]) => pousses.includes(s)).map(([p]) => p);
    expect(ia.length).toBeGreaterThanOrEqual(7);
    const t = texte(PRIVACY);
    for (const p of ia) expect(t, p).toContain(NOMS[p]);
    expect(t).toContain('Workers AI');
    expect(t).toMatch(/payantes[^.]*dernier secours/i);
  });

  it('A6-07 : le vrai nom part dans les notifications → la charte le dit (et ne promet plus « jamais révélé »)', () => {
    expect(DO_SRC).toMatch(/u\.real_name \|\| u\.pseudo/);   // comportement voulu du produit
    const t = texte(PRIVACY);
    expect(t).not.toMatch(/Vrai nom jamais révélé/i);
    expect(t).toMatch(/prénom et ton nom[^.]*notifications/i);
    expect(texte(CGU)).not.toMatch(/visibles uniquement par l'administrateur/);
  });

  it('A6-01 : position GPS en arrière-plan, 30 jours, interrupteur admin — annoncés ; plus de « jamais en arrière-plan »', () => {
    const t = texte(PRIVACY);
    expect(t).toMatch(/Position GPS précise/);
    expect(t).toMatch(/même sans partage de position/);
    expect(t).toMatch(/Historique : 30 jours/);
    expect(t).toMatch(/pas enregistrée quand l'administrateur coupe la géolocalisation/);
    expect(texte(CGU)).not.toMatch(/jamais en arrière-plan/);
  });

  // Lot D (v1.1.306) — décision de Kevin : la position est OBLIGATOIRE. La charte, les CGU et l'app disent la même chose :
  // demandée une fois au début, à quoi elle sert, effacée après 30 jours, visible par l'administrateur sur une carte ;
  // si elle est coupée ensuite, l'app ne bloque pas mais affiche un bandeau qui explique comment la remettre.
  it('Lot D : position obligatoire — CGU, charte et app concordent (plus de « refusable, l\'app continue »)', () => {
    const cgu = texte(CGU);
    const pr = texte(PRIVACY);
    // Plus aucune promesse « tu peux refuser la position et l'app continue » (ce que disaient les CGU l.96 et l.106).
    expect(cgu).not.toMatch(/tu peux refuser celles que tu veux/);
    expect(cgu).not.toMatch(/continuera de fonctionner avec (celles que tu acceptes|les autorisations restantes)/);
    const opt = CGU.slice(CGU.indexOf('<h3>Optionnelles'));
    expect(opt.slice(0, opt.indexOf('</ul>'))).not.toMatch(/Localisation|Position/);   // plus dans « optionnelles »
    // CGU : obligatoire, une fois au début, à quoi elle sert, carte admin, 30 jours, bandeau si coupée.
    expect(cgu).toMatch(/La position est obligatoire/);
    expect(cgu).toMatch(/Localisation — obligatoire , demandée une seule fois au début/);
    expect(cgu).toMatch(/L'administrateur la voit sur une carte/);
    expect(cgu).toMatch(/effacée au bout de 30 jours/);
    expect(cgu).toMatch(/l'app ne te bloque pas, mais elle affiche un bandeau/);
    expect(cgu).toMatch(/Safari ou Apex Chat → Position/);
    // Charte : idem (et les promesses du lot B restent).
    expect(pr).toMatch(/obligatoire pour utiliser Apex Chat/);
    expect(pr).toMatch(/demandée une seule fois au début/);
    expect(pr).toMatch(/L'administrateur la voit sur une carte/);
    expect(pr).toMatch(/Historique : 30 jours/);
    expect(pr).toMatch(/ne te bloque pas mais affiche un bandeau/);
    // App : les écrans d'autorisation disent « position obligatoire » ; le bandeau existe et ne bloque pas.
    expect(INDEX).toMatch(/La <b>position est obligatoire<\/b> pour utiliser l'app \(l'administrateur la voit sur une carte, elle est effacée après 30 jours\)/);
    expect(INDEX).toMatch(/La <b>position est obligatoire<\/b> pour utiliser l'app ; le reste est fortement conseillé/);
    expect(INDEX).toMatch(/📍 Position — <b>obligatoire<\/b>/);
    expect(INDEX).toMatch(/Position coupée\.<\/b> Elle est obligatoire pour Apex Chat/);
    expect(INDEX).toMatch(/>Comment faire<\/button>/);
    expect(INDEX).toMatch(/<b>Safari<\/b> \(ou <b>Apps<\/b> → <b>Safari<\/b>\) → <b>Position<\/b>/);
    // Le bandeau est rendu dans le flux de la page (insertBefore #app), jamais dans une fenêtre bloquante.
    const ban = INDEX.slice(INDEX.indexOf('K._renderGeoBanner = function(){'), INDEX.indexOf('K._geoHelp = function(){'));
    expect(ban).toMatch(/insertBefore\(el, app\)/);
    expect(ban).not.toMatch(/_showModal|noClose/);
  });

  it('A6-02 : la charte ne promet plus un réglage IA inexistant ; elle décrit le bouton et la confirmation', () => {
    const t = texte(PRIVACY);
    expect(t).not.toMatch(/se calculent sur le dernier message reçu quand la conversation est ouverte/);
    expect(t).toMatch(/Réglages → Confidentialité/);
    expect(t).toMatch(/l'app te prévient/);
  });
});
