/* Les adresses qu'une IA gratuite ou l'agent du Lenovo ont le droit de lire (module .mjs : importable par Node sans réglage, par le Worker et par tools/delegue). */
const hoteInterdit = (h) => /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(h) || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(':') || /(^|\.)kd-mc\.com$/i.test(h);
/** Une adresse de recherche : https, un vrai nom de domaine public, sans identifiants ; jamais notre propre domaine (il est derrière la porte de Kevin). */
export function urlSure(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && !x.username && !x.password && !hoteInterdit(x.hostname) && x.hostname.includes('.') && String(u).length <= 600; } catch (_) { return false; }
}
