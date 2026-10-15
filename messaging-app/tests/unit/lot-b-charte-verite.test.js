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

  it('A6-02 : la charte ne promet plus un réglage IA inexistant ; elle décrit le bouton et la confirmation', () => {
    const t = texte(PRIVACY);
    expect(t).not.toMatch(/se calculent sur le dernier message reçu quand la conversation est ouverte/);
    expect(t).toMatch(/Réglages → Confidentialité/);
    expect(t).toMatch(/l'app te prévient/);
  });
});
