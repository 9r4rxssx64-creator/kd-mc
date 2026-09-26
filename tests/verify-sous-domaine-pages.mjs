/* L'ADRESSE STABLE DU SITE NE DOIT PAS DOUBLER « .pages.dev » — garde (26.09.2026)
 * Mesuré au 1er run après la reprise des Actions : l'API Cloudflare rend le sous-domaine
 * COMPLET (« kdmc-site-bj5.pages.dev »). Les deux chaînes de publication y ajoutaient
 * « .pages.dev » → « …pages.dev.pages.dev » : sonde sur une adresse inexistante, garde
 * « le routeur lit un autre paquet » déclenchée à tort. On exécute ici la VRAIE extraction
 * du workflow et la VRAIE ligne du script shell sur la valeur réelle de l'API.
 * Prouvée discriminante : retirer le .replace() du workflow → échec. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const API = '{"success":true,"result":{"subdomain":"kdmc-site-bj5.pages.dev","production_branch":"main"}}';
const wf = readFileSync('.github/workflows/publier-site-prive.yml', 'utf8');
const m = /SOUS_DOMAINE=\$\(printf '%s' "\$INFOS" \| node -e "([\s\S]*?)" \|\| true\)/.exec(wf);
dis(!!m, 'extraction du sous-domaine trouvée dans publier-site-prive.yml');
if (m) {
  const sd = execFileSync('node', ['-e', m[1]], { input: API }).toString().trim();
  dis(sd === 'kdmc-site-bj5', `workflow : sous-domaine extrait = « ${sd} » (attendu kdmc-site-bj5)`);
  dis(`https://${sd}.pages.dev` === 'https://kdmc-site-bj5.pages.dev', 'workflow : adresse stable sans double suffixe');
}
const sh = readFileSync('tools/gitlab/publier.sh', 'utf8');
dis(/SOUS_DOMAINE="\$\{SOUS_DOMAINE%\.pages\.dev\}"/.test(sh), 'publier.sh retire le suffixe .pages.dev');
const out = execFileSync('bash', ['-c', 'SOUS_DOMAINE="kdmc-site-bj5.pages.dev"; SOUS_DOMAINE="${SOUS_DOMAINE%.pages.dev}"; echo "https://${SOUS_DOMAINE:-kdmc-site}.pages.dev"']).toString().trim();
dis(out === 'https://kdmc-site-bj5.pages.dev', `publier.sh : adresse stable = ${out}`);
const toml = readFileSync('services/kdmc-router/wrangler.toml', 'utf8');
dis(/UPSTREAM_BASE\s*=\s*"https:\/\/kdmc-site-bj5\.pages\.dev"/.test(toml), 'le routeur lit bien https://kdmc-site-bj5.pages.dev (même adresse)');
console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(ko ? 1 : 0);
