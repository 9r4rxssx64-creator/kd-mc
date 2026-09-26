#!/usr/bin/env node
/* Recopie les secrets du coffre dans le dépôt PUBLIC — lancé par le robot de bascule, jamais à la main.
 *
 * Entrées (variables d'environnement du robot, jamais écrites nulle part) :
 *   TOUS_LES_SECRETS  = ${{ toJSON(secrets) }}   (GitHub masque déjà chaque valeur dans le journal)
 *   PAT               = jeton de Kevin (APEX_GITHUB_PAT) qui a le droit d'écrire dans le dépôt public
 *   DEPOT_PUBLIC      = 9r4rxssx64-creator/kd-mc
 *   EN_PLUS           = (facultatif) JSON {"NOM":"valeur"} de secrets fabriqués par le robot (clé du coffre)
 *
 * Chiffre chaque valeur avec la clé publique du dépôt cible (scellement libsodium, exigé par GitHub)
 * puis la pose. N'affiche QUE des noms et des statuts.
 */
import sodium from 'libsodium-wrappers';

const { TOUS_LES_SECRETS = '{}', PAT, DEPOT_PUBLIC, EN_PLUS = '{}' } = process.env;
if (!PAT || !DEPOT_PUBLIC) { console.error('::error title=secrets::PAT ou DEPOT_PUBLIC absent'); process.exit(1); }

const api = async (chemin, init = {}) => {
  const r = await fetch((process.env.GITHUB_API || 'https://api.github.com') + '/repos/' + DEPOT_PUBLIC + chemin, {
    ...init,
    headers: { authorization: 'Bearer ' + PAT, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', ...(init.headers || {}) },
  });
  return r;
};

/* Ce qui ne se recopie pas : le jeton propre à chaque exécution (GitHub en fournit un neuf). */
const EXCLUS = new Set(['github_token', 'GITHUB_TOKEN']);

await sodium.ready;
const cle = await (await api('/actions/secrets/public-key')).json();
if (!cle.key) { console.error('::error title=secrets::clé publique du dépôt cible illisible — le jeton a-t-il le droit « secrets » ?'); process.exit(1); }
const clePub = sodium.from_base64(cle.key, sodium.base64_variants.ORIGINAL);

const tous = { ...JSON.parse(TOUS_LES_SECRETS), ...JSON.parse(EN_PLUS) };
let ok = 0; const ko = [];
for (const [nom, valeur] of Object.entries(tous)) {
  if (EXCLUS.has(nom) || valeur === '' || valeur == null) continue;
  const scelle = sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(String(valeur)), clePub), sodium.base64_variants.ORIGINAL);
  const r = await api('/actions/secrets/' + encodeURIComponent(nom), { method: 'PUT', body: JSON.stringify({ encrypted_value: scelle, key_id: cle.key_id }) });
  if (r.status === 201 || r.status === 204) ok++; else ko.push(nom + ' (HTTP ' + r.status + ')');
}
console.log(`secrets posés dans ${DEPOT_PUBLIC} : ${ok}` + (ko.length ? ` · ÉCHECS : ${ko.join(', ')}` : ''));
if (ko.length) console.log(`::error title=secrets::${ko.length} clé(s) refusée(s) : ${ko.join(', ')}`);
process.exit(ko.length ? 1 : 0);
