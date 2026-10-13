/* kdmc-balances — worker ISOLÉ lecture-seule des soldes API.
   - GET /health  : { ok:true } (sans auth)
   - GET /balances: soldes des fournisseurs qui ont une vraie API de solde.
                    Exige une session ADMIN vérifiée (Face ID) : on valide le pass
                    SSO en appelant le routeur (kd-mc.com/__sso/whoami). Jamais de
                    secret partagé. Aucun chiffre inventé : un fournisseur sans API
                    de solde n'apparaît tout simplement pas.
   Diagnostic exact partout (règle Kevin) : chaque échec renvoie {ok:false, detail, step}. */

const ALLOW_ORIGINS = [
  'https://kd-mc.com', 'https://www.kd-mc.com',
  'http://127.0.0.1:8731', 'http://localhost:8731',
];

/* Registre des fournisseurs avec une API de solde RÉELLE.
   Ajouter un fournisseur = ajouter une entrée ici + son secret dans wrangler.
   `fetchBalance(env)` -> { balance:Number|String, currency:String, usage?:String } ou throw. */
const PROVIDERS = [
  {
    id: 'deepseek', label: 'DeepSeek', secret: 'DEEPSEEK_API_KEY',
    async fetchBalance(env) {
      const r = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, Accept: 'application/json' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const bi = (j && j.balance_infos && j.balance_infos[0]) || null;
      if (!bi) throw new Error('réponse sans balance_infos');
      return { balance: bi.total_balance, currency: bi.currency || 'USD' };
    },
  },
  // Exemple prêt à activer si Kevin ajoute une clé OpenRouter :
  // { id:'openrouter', label:'OpenRouter', secret:'OPENROUTER_API_KEY',
  //   async fetchBalance(env){ const r=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY}});
  //     if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); const d=j.data||{};
  //     return { balance:(d.total_credits-d.total_usage).toFixed(2), currency:'USD' }; } },
];

function cors(origin) {
  const ok = ALLOW_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) },
  });
}

/* Valide le pass SSO Bearer auprès du routeur — exige admin vérifié. */
async function requireAdmin(req) {
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S/.test(auth)) return { ok: false, status: 401, detail: 'pass SSO manquant', step: 'auth_header' };
  try {
    const r = await fetch('https://kd-mc.com/__sso/whoami', { headers: { Authorization: auth }, cache: 'no-store' });
    if (!r.ok) return { ok: false, status: 502, detail: 'whoami HTTP ' + r.status, step: 'whoami_fetch' };
    const j = await r.json();
    if (!j || !j.ok) return { ok: false, status: 401, detail: 'session invalide', step: 'whoami_session' };
    /* SÉCU (leçon #99) : exige une identité FORTE. j.admin n'est vrai que si le
       routeur a confirmé verified (Face ID) ; on re-vérifie j.verified par sécurité
       (défense en profondeur — un uid admin auto-déclaré ne suffit jamais). */
    if (!j.admin || !j.verified) return { ok: false, status: 403, detail: 'réservé admin vérifié', step: 'whoami_admin' };
    return { ok: true, name: j.name };
  } catch (e) {
    return { ok: false, status: 502, detail: String((e && e.message) || e).slice(0, 120), step: 'whoami_exc' };
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/health') {
      const configured = PROVIDERS.filter((p) => env[p.secret]).map((p) => p.id);
      return json({ ok: true, service: 'kdmc-balances', providers_configured: configured }, 200, origin);
    }

    if (url.pathname === '/balances') {
      const gate = await requireAdmin(req);
      if (!gate.ok) return json({ ok: false, error: 'forbidden', detail: gate.detail, step: gate.step }, gate.status, origin);

      const balances = [];
      for (const p of PROVIDERS) {
        if (!env[p.secret]) continue; // pas de clé → on n'affiche rien (honnête)
        try {
          const b = await p.fetchBalance(env);
          balances.push({ id: p.id, label: p.label, ok: true, balance: b.balance, currency: b.currency, usage: b.usage || null });
        } catch (e) {
          balances.push({ id: p.id, label: p.label, ok: false, detail: String((e && e.message) || e).slice(0, 120) });
        }
      }
      return json({ ok: true, checked_at: new Date().toISOString(), balances }, 200, origin);
    }

    return json({ ok: false, error: 'not_found' }, 404, origin);
  },
};
