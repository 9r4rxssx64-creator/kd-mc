/* Test régression — 🗣️ moteur de voix Lingua (/__lingua/tts).
   Lance : node voix-tts.test.mjs
   Kevin 2026-08-11 : « la voix est trop robot ». On est passé de tts-1 (ancien moteur)
   à gpt-4o-mini-tts (nettement plus humain) + une consigne de jeu. Ce test prouve SANS
   réseau (fetch global stubbé) les 5 choses qui pourraient casser ou annuler l'effet :
   1. vitesse normale → nouveau moteur AVEC la consigne (et sans « speed », non supporté) ;
   2. voix « HD » (coral…) envoyée telle quelle au nouveau moteur ;
   3. bouton 🐢 Lent (vitesse ≠ 1) → on RESTE sur tts-1 (seul moteur où la vitesse marche)
      et une voix HD est traduite vers sa cousine tts-1 (sinon OpenAI répond 400) ;
   4. nouveau moteur en échec → repli tts-1, audio quand même servi (jamais de silence) ;
   5. la clé de cache contient le MOTEUR : sans ça, tous les mots déjà entendus resteraient
      servis dans leur ancienne version robotique et Kevin n'entendrait AUCUN changement. */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const kv = () => { const m = new Map(); return { m,
  async get(k) { const v = m.get(k); return v === undefined ? null : v; },
  async put(k, v) { m.set(k, v); } }; };
/* Le « Referer » simule un vrai navigateur : depuis le 22.09, la voix (qui est
   facturée) n'accepte que les demandes venant d'une page du domaine — un script
   sans provenance est refusé, pour que personne ne dépense le compte de Kevin. */
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs,
  { headers: { Referer: 'https://lingua.kd-mc.com/' } });
const AUDIO = new Uint8Array([73, 68, 51, 4, 0]).buffer;

/* NB : depuis le 22.09 le routeur range AUSSI un compteur de plafond dans le même
   KV (clés « q: … »). Ces clés ne sont pas de l'audio : on ne compte que le cache,
   sinon le test compterait la protection anti-dépense comme une voix en trop. */
/* ⚠️ Ce test compte les entrées de CACHE AUDIO. Le stockage sert AUSSI à d'autres
   choses (plafonds « q: », compteur de dépense « dep: »…) : les exclure une par une
   casse ce test à chaque fois qu'on range une nouvelle clé (vécu deux fois). On liste
   donc ce qu'on veut — le préfixe des sons — plutôt que ce qu'on ne veut pas. */
const cacheKeys = () => [...ACC.m.keys()].filter((k) => String(k).startsWith('ltts:') || String(k).startsWith('atts:'));
const realFetch = globalThis.fetch;
let calls = [];
/* refus : liste des modèles auxquels OpenAI répond 400 (pour simuler un moteur indisponible) */
function stub(refus = []) {
  calls = [];
  globalThis.fetch = async (input, init) => {
    const u = typeof input === 'string' ? input : input.url;
    const b = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ url: u, body: b });
    if (u.startsWith('https://api.openai.com/')) {
      if (refus.indexOf(b.model) >= 0) return new Response('nope', { status: 400 });
      return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
    return new Response('inattendu ' + u, { status: 599 });
  };
}
const oai = () => calls.filter((c) => c.url.startsWith('https://api.openai.com/'));

// 1) vitesse normale → moteur naturel + consigne, sans « speed »
let ACC = kv(); let env = { ACCOUNTS: ACC, OPEN_AI_API_KEY: 'sk-test' };
stub();
let r = await mod.fetch(req('v=nova&t=hello'), env);
let b = oai()[0] ? oai()[0].body : {};
ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith('audio/'), 'audio servi');
ok(b.model === 'gpt-4o-mini-tts', 'moteur naturel utilisé (plus le vieux tts-1)');
ok(typeof b.instructions === 'string' && b.instructions.length > 20, 'consigne « voix humaine de prof » envoyée');
ok(b.speed === undefined, 'aucun « speed » envoyé au nouveau moteur (non supporté)');
ok(b.voice === 'nova', 'la voix demandée est respectée');

// 2) voix HD (n'existent que sur le nouveau moteur)
ACC = kv(); env = { ACCOUNTS: ACC, OPEN_AI_API_KEY: 'sk-test' }; stub();
r = await mod.fetch(req('v=coral&t=hello'), env);
b = oai()[0].body;
ok(r.status === 200 && b.model === 'gpt-4o-mini-tts' && b.voice === 'coral', 'voix HD « coral » acceptée telle quelle');

// 3) bouton 🐢 Lent : la vitesse doit continuer de marcher → tts-1 + voix traduite
ACC = kv(); env = { ACCOUNTS: ACC, OPEN_AI_API_KEY: 'sk-test' }; stub();
r = await mod.fetch(req('v=coral&s=0.6&t=hello'), env);
b = oai()[0].body;
ok(r.status === 200 && b.model === 'tts-1' && b.speed === 0.6, '🐢 Lent : reste sur tts-1 avec la vitesse');
ok(b.voice === 'nova', 'voix HD traduite vers sa cousine tts-1 (sinon erreur 400)');
ok(b.instructions === undefined, 'pas de consigne envoyée à tts-1 (paramètre inconnu de lui)');

// 4) nouveau moteur indisponible → repli tts-1, jamais de silence
ACC = kv(); env = { ACCOUNTS: ACC, OPEN_AI_API_KEY: 'sk-test' }; stub(['gpt-4o-mini-tts']);
r = await mod.fetch(req('v=coral&t=hello'), env);
ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith('audio/'), 'moteur naturel KO → audio quand même servi');
ok(oai().length === 2 && oai()[1].body.model === 'tts-1' && oai()[1].body.voice === 'nova', 'repli tts-1 avec la voix traduite');
ok(cacheKeys().length === 1, 'le repli est caché sous SA propre clé (1 entrée)');
// et le repli caché ne doit pas être resservi comme si c'était la belle voix
stub();
r = await mod.fetch(req('v=coral&t=hello'), env);
ok(oai().length === 1 && oai()[0].body.model === 'gpt-4o-mini-tts', 'après la panne, on retente le moteur naturel (pas de voix de repli collée)');

/* 5) LE PIÈGE PRINCIPAL : chaque mot déjà écouté est caché À VIE. Si la clé de cache ne
   contenait pas le moteur, tous ces mots continueraient d'être servis dans leur ancienne
   version robotique — le changement serait invisible pour Kevin. On remplit donc le cache
   avec une entrée au FORMAT D'AVANT et on vérifie qu'elle n'est plus resservie. */
const sha = async (s) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.prototype.map.call(new Uint8Array(b), (x) => ('0' + x.toString(16)).slice(-2)).join(''); };
ACC = kv(); env = { ACCOUNTS: ACC, OPEN_AI_API_KEY: 'sk-test' };
const VIEILLE = new Uint8Array([1, 2, 3]).buffer;
await ACC.put('ltts:' + (await sha('nova:1:hello')), VIEILLE);   // format d'AVANT (sans moteur)
stub();
r = await mod.fetch(req('v=nova&t=hello'), env);
ok(oai().length === 1 && oai()[0].body.model === 'gpt-4o-mini-tts',
  'un mot déjà caché AVANT est resynthétisé avec le nouveau moteur (sinon : aucun changement audible)');
ok(cacheKeys().length === 2, 'la nouvelle version est rangée à côté de l\'ancienne (clés distinctes)');
// 6) cache normal : 2e appel identique = 0 requête
stub();
r = await mod.fetch(req('v=nova&t=hello'), env);
ok(r.status === 200 && oai().length === 0, '2e appel identique : servi du cache, 0 requête');

globalThis.fetch = realFetch;
console.log(`Voix TTS test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
