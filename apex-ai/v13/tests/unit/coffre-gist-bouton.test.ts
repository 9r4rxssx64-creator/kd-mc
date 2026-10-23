/**
 * 23.10.2026 (tâche 4) : Kevin a perdu la valeur de son jeton GitHub (GitHub ne la montre qu'une fois).
 * Apex AI GARDE le jeton : un bouton du Coffre envoie la sauvegarde et DIT le résultat, et le démarrage l'annonce tout seul.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (f: string): string => readFileSync(`${process.cwd()}/${f}`, 'utf8');

describe('Gist : plus besoin de recoller le jeton pour savoir', () => {
  const coffre = lire('features/vault/index.ts');
  const boot = lire('services/core-svc/services-bootstrap.ts');

  it('le Coffre a le bouton, de 44 px, et son gestionnaire force l’envoi puis affiche la phrase', () => {
    expect(coffre).toContain('id="ax-vault-gist-now"');
    expect(coffre).toMatch(/id="ax-vault-gist-now"[^>]*min-height:44px/);
    expect(coffre).toMatch(/bind\(gistNowBtn, 'click'[\s\S]*pushBackup\(\{ force: true \}\)[\s\S]*phraseGist\(\)/);
  });

  it('jeton refusé → le lien du jeton prérempli est proposé ; le jeton lui-même n’est jamais affiché', () => {
    expect(coffre).toMatch(/jetonAChanger\(r\.error\)[\s\S]*LIEN_NOUVEAU_JETON_GIST/);
    const bloc = coffre.slice(coffre.indexOf('const gistNowBtn'), coffre.indexOf("const qrBackupBtn"));
    expect(bloc).not.toMatch(/readKey|ax_github_pat|ghp_/);
  });

  it('au démarrage, un envoi réellement fait est annoncé (succès ou refus)', () => {
    expect(boot).toMatch(/const envoi = await apexGithubGistBackup\.pushSiDu\(\)/);
    expect(boot).toMatch(/envoi\.fait[\s\S]*phraseGist\(\)[\s\S]*toast\.(success|warn)/);
  });
});
