#!/usr/bin/env node
/* media.mjs — OÙ VIVENT LES VIDÉOS DE PUB, et pourquoi plus sur GitHub.

   Le 23.09.2026 le dépôt est passé en PRIVÉ (demande de Kevin du 15.09 :
   « passe tout en privé… seulement les sites restent accessibles »). Ce jour-là,
   toutes les adresses de la release « pub-videos » sont devenues 404 pour le
   monde entier — mesuré : GET 200 le 21.09, GET 404 le 23.09, pour la MÊME
   vidéo, alors que le fichier est toujours là (l'API le voit, « uploaded »).
   Conséquence : Metricool ne peut plus aller chercher les MP4 (« Failed to
   normalize media ») et la chaîne de pub s'arrête, sans que rien ne soit rouge.

   Les vidéos déjà programmées ne risquent rien : Metricool en avait fait une
   COPIE sur static.metricool.com au moment de la programmation.

   Donc les vidéos vivent maintenant dans un seau Cloudflare R2 public
   (kdmc-pub-videos), chez Kevin, qui ne dépend plus de la visibilité du dépôt.
   L'adresse publique est écrite par le workflow « Pub — héberge les vidéos sur
   R2 » dans media.json : ce fichier ne s'édite pas à la main. */
import { readFileSync } from 'node:fs';

export const FICHIER = new URL('./media.json', import.meta.url);

export function lire(url = FICHIER) { return JSON.parse(readFileSync(url, 'utf8')); }

/* Une adresse d'hébergement valable : publique, en https, terminée par « / »,
   et JAMAIS sur GitHub — le dépôt est privé, ce serait un 404 silencieux. */
export function baseValide(base) {
  if (typeof base !== 'string' || !base) return false;
  if (!base.startsWith('https://')) return false;
  if (!base.endsWith('/')) return false;
  if (/(^|\/\/|\.)(github\.com|githubusercontent\.com)(\/|$)/i.test(base)) return false;
  return true;
}

export function urlDe(id, media = null) {
  const base = (media || lire()).base;
  if (!baseValide(base)) {
    throw new Error(
      "adresse publique des vidéos absente ou invalide dans tools/pub/media.json : " + JSON.stringify(base) +
      " — lance le workflow « Pub — héberge les vidéos sur R2 » (il l'écrit lui-même)."
    );
  }
  return base + id + '.mp4';
}
