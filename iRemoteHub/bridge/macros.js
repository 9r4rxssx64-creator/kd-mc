// macros.js — exécution parallèle de macros multi-appareils
const adapters = require('./adapters');

const BUILTIN = {
  'all-off': {
    name: 'Tout éteindre',
    icon: '🌙',
    filter: (d) => ['tv','speaker','light','plug','cast'].includes(d.category),
    action: (d) => {
      if (d.category === 'tv') return { action: 'power_off' };
      if (d.category === 'speaker' || d.category === 'cast') return { action: 'stop' };
      if (d.category === 'light' || d.category === 'plug') return { action: 'off' };
      return null;
    }
  },
  'cinema': {
    name: 'Soirée ciné',
    icon: '🎬',
    steps: [
      { filter: (d) => d.category === 'light', action: { action: 'set', params: { brightness: 0.15, temperature_k: 2700 }}},
      { filter: (d) => d.category === 'tv', action: { action: 'power_on' }},
      { filter: (d) => d.category === 'tv', action: { action: 'set_input', params: { input: 'HDMI2' }}, delay_ms: 1500 },
      { filter: (d) => d.category === 'speaker', action: { action: 'set_volume', params: { volume: 30 }}}
    ]
  },
  'panic-silence': {
    name: 'Panique silence',
    icon: '🔇',
    filter: (d) => ['speaker','tv','cast'].includes(d.category),
    action: (d) => {
      if (d.category === 'tv') return { action: 'mute' };
      return { action: 'stop' };
    }
  },
  'morning': {
    name: 'Réveil matin',
    icon: '☀️',
    steps: [
      { filter: (d) => d.category === 'light', action: { action: 'set', params: { brightness: 0.3, temperature_k: 3000 }}},
      { filter: (d) => d.category === 'light', action: { action: 'set', params: { brightness: 0.8 }}, delay_ms: 120000 }
    ]
  }
};

async function run(name, devices, opts = {}) {
  const m = BUILTIN[name];
  if (!m) throw new Error(`macro inconnue : ${name}`);

  const results = [];

  // Format "filter + action" (exécution parallèle 1 passe)
  if (m.filter && m.action) {
    const targets = devices.filter(m.filter);
    const promises = targets.map(async (d) => {
      const spec = m.action(d);
      if (!spec) return { device_id: d.id, skipped: true };
      try {
        const r = await Promise.race([
          adapters.execute(d, spec.action, spec.params || {}),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), opts.timeout_ms || 5000))
        ]);
        return { device_id: d.id, ok: true, result: r };
      } catch (e) {
        return { device_id: d.id, ok: false, error: e.message };
      }
    });
    return { name, results: await Promise.all(promises) };
  }

  // Format "steps" (exécution séquentielle avec délais)
  if (m.steps) {
    for (const step of m.steps) {
      const targets = devices.filter(step.filter);
      const stepPromises = targets.map(async (d) => {
        try {
          const r = await adapters.execute(d, step.action.action, step.action.params || {});
          return { device_id: d.id, ok: true, result: r };
        } catch (e) {
          return { device_id: d.id, ok: false, error: e.message };
        }
      });
      const stepResults = await Promise.all(stepPromises);
      results.push(...stepResults);
      if (step.delay_ms) await new Promise(r => setTimeout(r, step.delay_ms));
    }
    return { name, results };
  }

  throw new Error('macro mal formée');
}

module.exports = { run, BUILTIN };
