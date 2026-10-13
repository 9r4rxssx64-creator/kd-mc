/* PETIT MÉMO DES FICHES DE COMPTE, PAR ISOLAT (audit du 13.10.2026 — « réactif, fluide, stable »).
   Mesuré avant : ouvrir une page d'app protégée puis 5 de ses fichiers = 7 lectures de la fiche `acc:<uid>` dans le KV
   (chaque fichier repasse la porte : porteFermee, porteGenerale, donneesRhFermees, compteConnu, whoami). Le KV gratuit a un
   plafond de lectures et chaque lecture coûte un aller-retour : la fiche est donc gardée en mémoire 15 s au plus.

   Règles de sécurité (ce qui rend ce mémo sans danger) :
     · 15 s MAXIMUM : une révocation écrite par un AUTRE isolat est effective ici en 15 s au plus ;
     · toute écriture de la fiche par CE worker (accPut, boîte, fusion) OUBLIE l'entrée à l'instant : un blocage s'applique tout de suite
       dans l'isolat qui l'écrit ;
     · on ne garde QUE les fiches trouvées : « inconnu » n'est jamais mémorisé (une inscription toute fraîche passe à la lecture suivante) ;
     · on garde le TEXTE de la fiche et on le relit à chaque appel : un appelant qui modifie sa copie ne pollue jamais le mémo ;
     · une entrée par KV (WeakMap) : deux environnements ne se mélangent jamais (tests, secours). */
export const MEMO_FICHE_MS = 15000;
const PAR_KV = new WeakMap();
const MAX_FICHES = 500;
const table = (kv) => { let t = PAR_KV.get(kv); if (!t) { t = { m: new Map(), ecr: 0 }; PAR_KV.set(kv, t); } return t; };
export function ficheOubliee(env, uid) {
  const kv = env && env.ACCOUNTS; if (!kv) return;
  const t = PAR_KV.get(kv); if (t) { t.m.delete(String(uid)); t.ecr++; }   /* `ecr` : une lecture déjà partie AVANT cette écriture ne doit pas ranger sa vieille réponse */
}
export async function ficheLue(env, uid) {
  const kv = env && env.ACCOUNTS; if (!kv) return null;
  const cle = String(uid), t = table(kv), now = Date.now();
  const m = t.m.get(cle);
  let brut;
  if (m && now - m.t < MEMO_FICHE_MS) brut = m.brut;
  else {
    const ecr = t.ecr;
    brut = await kv.get('acc:' + cle);
    if (brut && ecr === t.ecr) { if (t.m.size >= MAX_FICHES) t.m.clear(); t.m.set(cle, { brut, t: now }); } else t.m.delete(cle);
  }
  try { return JSON.parse(brut || 'null'); } catch { return null; }
}
