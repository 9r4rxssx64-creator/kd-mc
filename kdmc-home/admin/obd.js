/* KDMC-OBD — valise de diagnostic (boîtier ELM327).
 * Une seule base de code pour : le Lenovo (serveur local kdmc-obd.ps1) et le domaine (page admin).
 * Liaisons : serveur local (COM / WiFi), Web Serial (USB + Bluetooth classique), Web Bluetooth (BLE), simulateur.
 * Aucune donnée personnelle ici (dépôt public) : le garage vit dans le navigateur. */
(function () {
'use strict';
const VERSION = 'v2.1.0';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const hx = (n, l) => n.toString(16).toUpperCase().padStart(l, '0');
const pause = ms => new Promise(r => setTimeout(r, ms));
const etat = { T:null, connecte:false, can:false, can29:false, proto:'', tension:'', elm:'', vin:'', sup:new Set(), veh:null, simu:false, direct:false, stop:false };
let garage = [], brut = [], TITRES = null;

function dire(t, ms = 4000) { const m = $('#msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(dire.t); dire.t = setTimeout(() => m.style.display = 'none', ms); }
function statut(t, mode) { $('#statut').textContent = t; $('#point').className = 'point' + (mode ? ' ' + mode : ''); }
async function api(p, b) {
  const r = await fetch('/api/' + p, b ? { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(b) } : undefined);
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.err || 'Erreur');
  return j;
}
async function attendre(lire, t) {
  const fin = Date.now() + t;
  while (Date.now() < fin) { if (lire().includes('>')) break; await pause(12); }
  return lire();
}

/* ================= Liaisons ================= */
function TLocal(port) {
  return { nom:port,
    async open() { await api('open', { port }); },
    async close() { await api('close', {}).catch(() => {}); },
    async cmd(c, t) { return (await api('cmd', { cmd:c, timeout:t })).raw; } };
}
function TSerie(p0) {
  let port = p0 || null, reader = null, writer = null, buf = '';
  const dec = new TextDecoder(), enc = new TextEncoder();
  async function pompe() { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream:true }); } } catch (e) { /* port fermé */ } }
  async function fermer() {
    try { if (reader) await reader.cancel(); } catch (e) { /* rien */ }
    try { if (reader) reader.releaseLock(); } catch (e) { /* rien */ }
    try { if (writer) writer.releaseLock(); } catch (e) { /* rien */ }
    try { if (port) await port.close(); } catch (e) { /* rien */ }
    reader = writer = null;
  }
  return { nom:'port série', bauds:[38400, 115200, 9600],
    async open(baud) {
      if (!port) {
        const deja = await navigator.serial.getPorts();
        port = deja.length === 1 ? deja[0] : await navigator.serial.requestPort();
      } else await fermer();
      await port.open({ baudRate:baud || 38400 });
      writer = port.writable.getWriter(); reader = port.readable.getReader(); pompe();
    },
    close: fermer,
    async cmd(c, t) { buf = ''; await writer.write(enc.encode(c + '\r')); return attendre(() => buf, t); } };
}
function TBle() {
  const SERV = [0xfff0, 0xffe0, 0x18f0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '6e400001-b5a3-f393-e0a9-e50e24dcca9e'];
  let dev = null, tx = null, rx = null, buf = '';
  const dec = new TextDecoder(), enc = new TextEncoder();
  return { nom:'Bluetooth LE',
    async open() {
      dev = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:SERV });
      const g = await dev.gatt.connect();
      for (const s of await g.getPrimaryServices()) {
        let n = null, w = null;
        for (const c of await s.getCharacteristics()) {
          if (!n && (c.properties.notify || c.properties.indicate)) n = c;
          if (!w && (c.properties.writeWithoutResponse || c.properties.write)) w = c;
        }
        if (n && w) { rx = n; tx = w; break; }
      }
      if (!rx || !tx) throw new Error("Ce boîtier Bluetooth n'expose pas de liaison série connue.");
      rx.addEventListener('characteristicvaluechanged', e => { buf += dec.decode(e.target.value, { stream:true }); });
      await rx.startNotifications();
    },
    async close() { try { if (dev && dev.gatt.connected) dev.gatt.disconnect(); } catch (e) { /* rien */ } },
    async cmd(c, t) {
      buf = ''; const d = enc.encode(c + '\r');
      for (let i = 0; i < d.length; i += 20) {
        const m = d.slice(i, i + 20);
        if (tx.properties.writeWithoutResponse) await tx.writeValueWithoutResponse(m); else await tx.writeValue(m);
      }
      return attendre(() => buf, t);
    } };
}
/* Simulateur : un véhicule CAN factice avec 4 calculateurs, pour essayer sans voiture. */
function TSimu() {
  const s = { H:false, sh:'7DF', z:false, zm:{} };
  const VIN = 'VF1SIMULATEUR0001';
  const asc = t => [...t].map(c => hx(c.charCodeAt(0), 2)).join('');
  const tp = (rx, p) => {
    const n = p.length / 2; if (n <= 7) return rx + hx(n, 2) + p;
    let o = rx + '1' + hx(n, 3) + p.slice(0, 12), i = 12, c = 1;
    while (i < p.length) { o += '\r' + rx + '2' + hx(c & 15, 1) + p.slice(i, i + 14).padEnd(14, 'A'); i += 14; c++; }
    return o;
  };
  const multi = p => { const n = p.length / 2; if (n <= 7) return p; let o = hx(n, 3), i = 0, c = 0; while (i < p.length) { const l = c ? 14 : 12; o += '\r' + hx(c & 15, 1) + ':' + p.slice(i, i + l); i += l; c++; } return o; };
  const MOD = { '7E0':['7E8', 'MOTEUR'], '7E1':['7E9', 'BOITE AUTO'], '760':['768', 'ABS ESP'], '7C0':['7C8', 'CARROSSERIE'] };
  function uds(k) {
    const m = MOD[s.sh]; if (!m) return 'NO DATA'; const r = m[0];
    if (k === '3E00') return tp(r, '7E00');
    if (k === '1003') return tp(r, '5003003201F4');
    if (k === '1902FF') {
      if (s.zm[s.sh]) return tp(r, '5902FF');
      if (s.sh === '7E0') return tp(r, '5902FF' + '01330009' + '04200008');
      if (s.sh === '760') return tp(r, '5902FF' + '40350008');
      return tp(r, '5902FF');
    }
    if (k === '22F190') return s.sh === '7E0' ? tp(r, '62F190' + asc(VIN)) : tp(r, '7F2231');
    if (k === '22F197') return tp(r, '62F197' + asc(m[1]));
    if (k === '14FFFFFF') { s.zm[s.sh] = true; if (s.sh === '7E0') s.z = true; return tp(r, '54'); }
    return tp(r, '7F' + k.slice(0, 2) + '11');
  }
  function rep(c) {
    const k = c.replace(/\s/g, '').toUpperCase(), z = s.z;
    if (k.startsWith('ATSH')) { s.sh = k.slice(4); return 'OK'; }
    if (k === 'ATH1') { s.H = true; return 'OK'; } if (k === 'ATH0') { s.H = false; return 'OK'; }
    if (k === 'ATZ' || k === 'ATI') return 'ELM327 v1.5 (simulateur)';
    if (k === 'ATRV') return (12.3 + Math.random() * 0.2).toFixed(1) + 'V';
    if (k === 'ATDPN') return 'A6'; if (k === 'ATDP') return 'AUTO, ISO 15765-4 (CAN 11/500)';
    if (k.startsWith('AT')) return 'OK';
    if (s.sh !== '7DF') return uds(k);
    const T = {
      '0100': s.H ? '7E8064100BE3EA813\r7E906410080100000' : '4100BE3EA813', '0120':'412080000001', '0140':'414040000000',
      '0101': z ? '410100076500' : '410182076500', '03': z ? '4300' : '430201330420', '07': z ? '4700' : '47010171', '0A':'4A00',
      '0902': multi('490201' + asc(VIN)), '0904': multi('490401' + asc('KDMCSIM000000001')), '090A': multi('490A01' + asc('ECM-SimulateurKDMC\0\0')),
      '020200': z ? 'NO DATA' : '4202000133', '020500':'4205005A', '020C00':'420C000BB8', '020D00':'420D0000', '020400':'42040033',
      '0600':'4600C0000001', '0620':'462080000000', '0601': multi('4601010A0BB00A281194'), '0602': multi('4602010A0C1C0A281194'), '0621': multi('462180200120000000C8'),
      '010D':'410D00', '0105':'41055A', '010F':'410F3C', '0111':'41112B', '010B':'410B21', '0106':'410682', '0107':'41077E', '010E':'410E8C', '0121':'41210000', '0142':'414230D4'
    };
    if (k === '04') { s.z = true; s.zm['7E0'] = true; return '44'; }
    if (k === '010C') return '410C' + hx(3000 + Math.floor(Math.random() * 240), 4);
    if (k === '0104') return '4104' + hx(48 + Math.floor(Math.random() * 8), 2);
    return T[k] || 'NO DATA';
  }
  return { nom:'simulateur', async open() {}, async close() {}, async cmd(c) { await pause(8); return rep(c) + '\r\r>'; } };
}

/* ================= Dialogue avec le boîtier ================= */
let file = Promise.resolve();
function at(cmd, t = 2500) {
  const p = file.then(async () => {
    const raw = await etat.T.cmd(cmd, t);
    brut.push({ cmd, rep:raw }); if (brut.length > 400) brut.shift();
    const s = $('#sortie'); s.textContent = (s.textContent + '> ' + cmd + '\n' + texte(raw) + '\n').slice(-20000); s.scrollTop = s.scrollHeight;
    return raw;
  });
  file = p.catch(() => {});
  return p;
}
const texte = raw => raw.replace(/>/g, '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean).join('\n');
function lignes(raw) {
  return raw.replace(/>/g, '').split(/[\r\n]+/).map(l => l.trim()).filter(l => l && !/^SEARCHING|^BUS INIT/i.test(l)).map(l => l.replace(/\s+/g, '').toUpperCase());
}
/* Messages sans en-tête (ATH0), trames multiples CAN recollées. */
function messages(raw) {
  const out = []; let cur = null;
  for (const l of lignes(raw)) {
    if (/^[0-9A-F]{3}$/.test(l)) { cur = { len:parseInt(l, 16) * 2, d:'' }; out.push(cur); continue; }
    const m = l.match(/^([0-9A-F]):([0-9A-F]+)$/);
    if (m && cur) { cur.d += m[2]; continue; }
    if (/^[0-9A-F]+$/.test(l)) { out.push({ d:l }); cur = null; }
  }
  return out.map(o => o.len ? o.d.slice(0, o.len) : o.d);
}
/* Trames avec en-tête (ATH1) sur CAN : réassemblage ISO-TP par calculateur. */
function trames(raw) {
  const res = new Map(), n = etat.can29 ? 8 : 3;
  for (const l of lignes(raw)) {
    if (!/^[0-9A-F]+$/.test(l) || l.length < n + 4) continue;
    const id = l.slice(0, n), b = octets(l.slice(n)), t = b[0] >> 4, m = res.get(id);
    if (t === 0) res.set(id, { len:b[0] & 15, d:b.slice(1) });
    else if (t === 1) res.set(id, { len:((b[0] & 15) << 8) | b[1], d:b.slice(2) });
    else if (t === 2 && m) m.d = m.d.concat(b.slice(1));
  }
  const out = new Map(); for (const [id, m] of res) out.set(id, m.d.slice(0, m.len)); return out;
}
const octets = h => (h.match(/../g) || []).map(x => parseInt(x, 16));
const ascii = b => b.map(x => (x >= 32 && x < 127) ? String.fromCharCode(x) : '').join('').trim();
function dtcDe(h) { const n = parseInt(h[0], 16); return 'PCBU'[n >> 2] + (n & 3) + h.slice(1); }
function lireCodes(raw, mode) {
  const pre = hx(0x40 + mode, 2), set = new Set();
  for (let m of messages(raw)) {
    if (!m.startsWith(pre)) continue;
    m = m.slice(2); if (etat.can) m = m.slice(2);
    for (let i = 0; i + 4 <= m.length; i += 4) { const h = m.slice(i, i + 4); if (h !== '0000') set.add(dtcDe(h)); }
  }
  return [...set];
}
function lireTexte09(raw, pid) {
  let hex = '';
  for (const m of messages(raw)) if (m.startsWith('49' + pid)) hex += m.slice(6);
  return ascii(octets(hex));
}
function lireVin(raw) { const s = lireTexte09(raw, '02').replace(/[^A-Z0-9]/g, ''); return s.length >= 17 ? s.slice(-17) : ''; }
function valeur(raw, pid, mode = '41') {
  for (const m of messages(raw)) if (m.startsWith(mode + pid)) return octets(m.slice(mode === '42' ? 6 : 4));
  return null;
}
function ajouterSupportes(raw, base) {
  const b = valeur(raw, hx(base, 2));
  if (!b || b.length < 4) return false;
  for (let i = 0; i < 32; i++) if (b[i >> 3] & (0x80 >> (i & 7))) etat.sup.add(hx(base + i + 1, 2));
  return true;
}

/* ================= Base de codes ================= */
async function chargerTitres() { try { TITRES = await (await fetch('obd-base/titres.json')).json(); } catch (e) { TITRES = {}; } }
function libelle(code) {
  const c = code.slice(0, 5);
  if (window.CODES && CODES[c]) return { t:CODES[c], fr:true };
  if (TITRES && TITRES[c]) return { t:TITRES[c], fr:false };
  return { t:familleCode(c), fr:true, inconnu:true };
}
const lotsFiches = {};
async function fiche(code) {
  const c = code.slice(0, 5), k = c.slice(0, 3);
  if (!(k in lotsFiches)) { try { const r = await fetch('obd-base/' + k + '.json'); lotsFiches[k] = r.ok ? await r.json() : {}; } catch (e) { lotsFiches[k] = {}; } }
  return lotsFiches[k][c] || null;
}
const FR = { high:'fréquent', medium:'possible', low:'rare', easy:'facile', hard:'difficile', expert:'atelier' };
async function ouvrirFiche(bouton) {
  const boite = bouton.parentElement.querySelector('.fiche');
  if (boite.dataset.ok) { boite.style.display = boite.style.display === 'none' ? 'block' : 'none'; return; }
  boite.textContent = 'Chargement…'; boite.style.display = 'block';
  const f = await fiche(bouton.dataset.code);
  if (!f) { boite.textContent = 'Pas de fiche détaillée pour ce code (code propre au constructeur ou absent de la base).'; boite.dataset.ok = 1; return; }
  let h = '';
  if (f.f) h += '<div>' + (f.f[0] ? '<span class="badge att">allume le voyant</span>' : '') + (f.f[1] ? '<span class="badge ko">mode dégradé possible</span>' : '') + (f.f[2] ? '<span class="badge">lié à la dépollution</span>' : '') + '</div>';
  if (f.d) h += '<p>' + esc(f.d) + '</p>';
  if (f.s && f.s.length) h += '<b>Symptômes</b><ul>' + f.s.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  if (f.c && f.c.length) h += '<b>Causes probables</b><ul>' + f.c.map(x => '<li>' + esc(x[1]) + (x[0] ? ' <span class="badge">' + esc(FR[x[0]] || x[0]) + '</span>' : '') + '</li>').join('') + '</ul>';
  if (f.r) h += '<b>Réparation</b><div>' + (f.r[0] ? 'Difficulté : ' + esc(FR[f.r[0]] || (f.r[0] === 'medium' ? 'moyenne' : f.r[0])) + ' · ' : '') + (f.r[1] ? 'faisable soi-même' : 'plutôt en atelier') + (f.r[2] ? ' · coût indicatif ' + f.r[2][0] + ' à ' + f.r[2][1] + ' €' : '') + (f.r[3] ? ' · ' + f.r[3][0] + ' à ' + f.r[3][1] + ' h' : '') + '</div>';
  boite.innerHTML = h + '<p class="sous">Fiche en anglais, base libre OBDex (domaine public). Valeurs indicatives.</p>';
  boite.dataset.ok = 1;
}
function carteCode(code, nom, extra) {
  const l = libelle(code), f = familleCode(code.slice(0, 5));
  return '<div class="code"><span class="c">' + esc(code) + '</span><div class="d"><b>' + esc(l.t) + '</b>'
    + '<small>' + (l.inconnu ? 'Libellé précis non connu de la valise.' : esc(f) + (l.fr ? '' : ' · libellé en anglais')) + '</small>' + (extra || '')
    + '<div><button class="btn petit" data-fiche="1" data-code="' + esc(code) + '">Symptômes, causes, réparation</button> '
    + '<a target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent('code défaut ' + code.slice(0, 5) + ' ' + (nom || '')) + '">Chercher pour ce véhicule ↗</a>'
    + '<div class="fiche sous" style="display:none;margin-top:8px"></div></div></div></div>';
}
document.addEventListener('click', e => { const b = e.target.closest('[data-fiche]'); if (b) ouvrirFiche(b); });

/* ================= Garage ================= */
const WMI = { JN:'Nissan', JT:'Toyota', JH:'Honda', JM:'Mazda', JF:'Subaru', JS:'Suzuki', KM:'Hyundai', KN:'Kia', SA:'Land Rover / Jaguar', SB:'Toyota', TM:'Škoda', TR:'Audi', UU:'Dacia', VF1:'Renault', VF3:'Peugeot', VF7:'Citroën', VF6:'Renault Trucks', VR1:'DS', VR3:'Peugeot', VR7:'Citroën', VS:'Seat', VW:'Volkswagen (Espagne)', WA:'Audi', WB:'BMW', WD:'Mercedes-Benz', W1:'Mercedes-Benz', WF:'Ford', WM:'Smart / Mini', WME:'Smart', WMW:'Mini', WP:'Porsche', WV:'Volkswagen', W0:'Opel', YS:'Saab', YV:'Volvo', ZA:'Alfa Romeo / Maserati', ZF:'Fiat / Ferrari', ZL:'Lancia', ZD:'Aprilia / Ducati', ZAP:'Piaggio', '1F':'Ford', '1G':'General Motors', '1H':'Honda', '1N':'Nissan', '2T':'Toyota', '3V':'Volkswagen', '5Y':'Tesla', LRW:'Tesla', '7S':'Tesla' };
const marqueVin = v => v ? (WMI[v.slice(0, 3)] || WMI[v.slice(0, 2)] || '') : '';
function sauverGarage() { localStorage.setItem('kdmc-obd-garage', JSON.stringify(garage)); }
function choisirVeh(id) {
  etat.veh = garage.find(v => v.id === id) || garage[0] || { id:'inconnu', nom:'Véhicule', detail:'', vin:'', note:'' };
  localStorage.setItem('kdmc-obd-veh', etat.veh.id);
  $('#vehs').innerHTML = garage.map(v => '<button class="veh' + (v.id === etat.veh.id ? ' actif' : '') + '" data-id="' + esc(v.id) + '"><b>' + esc(v.nom) + '</b><span>' + esc(v.detail || '') + '</span></button>').join('')
    + '<button class="veh plus" data-id="+" aria-label="Ajouter un véhicule">＋</button>';
  const n = $('#noteVeh'); n.style.display = etat.veh.note ? 'block' : 'none'; n.textContent = etat.veh.note || '';
}
function ouvrirDlg(v) {
  $('#vNom').value = v ? v.nom : ''; $('#vDetail').value = v ? (v.detail || '') : ''; $('#vVin').value = v ? (v.vin || '') : '';
  $('#dlgVeh').dataset.id = v ? v.id : ''; $('#vSuppr').style.display = v && v.id ? 'inline-block' : 'none';
  $('#dlgVeh').showModal();
}
function importerGarage() {
  const m = location.hash.match(/garage=([A-Za-z0-9_\-]+)/);
  if (!m) return;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const liste = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    for (const v of liste) { const i = garage.findIndex(x => x.id === v.id); if (i >= 0) garage[i] = v; else garage.push(v); }
    sauverGarage(); dire(liste.length + ' véhicule(s) ajouté(s) à ton garage');
  } catch (e) { dire('Lien de garage illisible'); }
  history.replaceState(null, '', location.pathname);
}

/* ================= Connexion ================= */
const PROTOS = { 6:'CAN 11 bits 500k', 7:'CAN 29 bits 500k', 8:'CAN 11 bits 250k', 9:'CAN 29 bits 250k', 5:'KWP2000 rapide', 4:'KWP2000 lent', 3:'ISO 9141-2', 1:'J1850 PWM', 2:'J1850 VPW' };
async function chargerPorts() {
  let h = '';
  if (LOCAL) {
    try { const { ports } = await api('ports'); h += ports.map(p => '<option value="local:' + esc(p.port) + '"' + (p.conseille ? ' selected' : '') + '>' + esc(p.port) + ' — ' + (p.conseille ? 'boîtier Bluetooth (conseillé)' : (p.bluetooth ? 'Bluetooth entrant' : esc(p.desc || 'port série'))) + '</option>').join(''); } catch (e) { /* pas de serveur local */ }
    h += '<option value="local:TCP:192.168.0.10:35000">Boîtier WiFi (192.168.0.10:35000)</option>';
  }
  if (navigator.serial) h += '<option value="serie">Port série du navigateur (USB ou Bluetooth classique)</option>';
  if (navigator.bluetooth) h += '<option value="ble">Bluetooth basse consommation (BLE)</option>';
  h += '<option value="simu">Simulateur (démonstration sans véhicule)</option>';
  $('#port').innerHTML = h;
  if (!LOCAL && !navigator.serial && !navigator.bluetooth) {
    const n = $('#noteNav'); n.style.display = 'block';
    n.textContent = "Ce navigateur ne peut pas parler au boîtier (cas de l'iPhone et de Safari). Ouvre cette page avec Chrome ou Edge sur un ordinateur ou un téléphone Android. Le simulateur, le journal et la base de codes restent utilisables ici.";
  }
}
function activer(on) {
  etat.connecte = on;
  for (const id of ['bDiag', 'bEffacer', 'bDirect', 'bCmd', 'bSys', 'bCtrl', 'bBatt']) $('#' + id).disabled = !on;
  $('#bDeconnecter').disabled = !on; $('#bConnecter').disabled = on; $('#port').disabled = on;
}
function majInfos() {
  $('#iProto').textContent = etat.proto || '—'; $('#iTension').textContent = etat.tension || '—'; $('#iElm').textContent = etat.elm || '—';
  const att = !etat.simu && etat.veh && etat.veh.vin;
  $('#iVin').innerHTML = etat.vin ? esc(etat.vin) + (att ? (att === etat.vin ? '<span class="badge ok">conforme</span>' : '<span class="badge ko">différent de la fiche</span>') : (marqueVin(etat.vin) ? '<span class="badge">' + esc(marqueVin(etat.vin)) + '</span>' : '')) : '—';
}
async function init() { for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0']) await at(c); }
/* Signature électronique d'un véhicule : protocole + liste des valeurs qu'il fournit (sert quand il ne donne pas son n° de châssis). */
function empreinte() { return (etat.protoN || '?') + '|' + [...etat.sup].sort().join(''); }
function memoriserEmpreinte(v) {
  if (!v || !etat.emp) return;
  for (const x of garage) if (x !== v && x.emp === etat.emp) delete x.emp;
  v.emp = etat.emp; sauverGarage();
}
function reconnaitre() {
  etat.emp = empreinte();
  if (etat.simu) return;
  let v = etat.vin ? garage.find(x => x.vin === etat.vin) : null, comment = 'son numéro de châssis';
  if (!v && !etat.vin) { v = garage.find(x => x.emp === etat.emp); comment = 'sa signature électronique'; }
  if (v) { memoriserEmpreinte(v); choisirVeh(v.id); dire('Véhicule reconnu par ' + comment + ' : ' + v.nom); return; }
  if (etat.vin) {
    v = { id:'v' + Date.now(), nom:marqueVin(etat.vin) || 'Véhicule', detail:'Ajouté automatiquement · ' + etat.vin.slice(-6), vin:etat.vin, note:'' };
    garage.push(v); memoriserEmpreinte(v); choisirVeh(v.id);
    dire('Nouveau véhicule ajouté à ton garage : ' + v.nom + '. Touche sa tuile pour le renommer.', 7000); return;
  }
  const n = $('#noteVeh'); n.style.display = 'block';
  n.textContent = "Ce véhicule ne donne pas son numéro de châssis. Touche sa tuile dans la liste ci-dessus : je le reconnaîtrai tout seul la prochaine fois.";
}
async function suiteVehicule() {
  if (etat.sup.has('20') && ajouterSupportes(await at('0120'), 0x20) && etat.sup.has('40')) ajouterSupportes(await at('0140'), 0x40);
  etat.proto = texte(await at('ATDP')).replace(/^AUTO,\s*/i, '');
  const n = texte(await at('ATDPN')).replace(/^A/i, '').trim();
  etat.protoN = n; etat.can = parseInt(n, 16) >= 6; etat.can29 = n === '7' || n === '9';
  etat.vin = lireVin(await at('0902', 5000));
  reconnaitre(); majInfos(); statut(etat.simu ? 'Simulateur connecté' : 'Véhicule connecté', 'on');
  construireJauges();
  await diagnostic();
}
/* Boîtier trouvé mais véhicule muet (contact coupé) : on réessaie seul jusqu'à ce qu'il réponde. */
async function attendreVehicule() {
  while (etat.connecte && !etat.proto) {
    await pause(5000); if (!etat.connecte) break;
    try { if (ajouterSupportes(await at('0100', 9000), 0)) { $('#resultat').innerHTML = ''; await suiteVehicule(); } } catch (e) { break; }
  }
}
async function connecter(o) {
  const auto = !!(o && o.auto);
  if (etat.connecte) return false;
  if (!auto) { etat.manuel = true; while (etat.enConnexion) await pause(100); etat.autoOff = false; }
  else if (etat.enConnexion) return false;
  etat.enConnexion = true;
  const choix = auto ? o.choix : $('#port').value;
  const T = (auto && o.T) || (choix === 'simu' ? TSimu() : choix === 'serie' ? TSerie() : choix === 'ble' ? TBle() : TLocal(choix.slice(6)));
  etat.T = T; etat.simu = choix === 'simu'; etat.sup = new Set(); etat.vin = ''; etat.proto = ''; etat.protoN = ''; etat.emp = ''; etat.can = etat.can29 = false; etat.perdu = 0; brut = [];
  $('#bConnecter').disabled = true; if (!auto) statut('Ouverture de la liaison…', 'att');
  let reussi = false;
  try {
    let z = '';
    for (const b of (T.bauds || [0])) {
      try { await T.open(b); } catch (e) {
        if (e && (e.name === 'NotFoundError' || e.name === 'SecurityError')) throw new Error('Aucun boîtier choisi.');
        throw new Error('Boîtier injoignable (' + T.nom + '). Branche-le sur la prise du véhicule, mets le contact, ferme tout autre logiciel OBD, puis réessaie.');
      }
      statut('Boîtier trouvé, initialisation…', 'att');
      z = await at('ATZ', 5000);
      if (!/ELM|OBD|v\d\.\d/i.test(z)) z = await at('ATI', 2500);
      if (/ELM|OBD|v\d\.\d/i.test(z)) break;
    }
    if (!/ELM|OBD|v\d\.\d/i.test(z)) throw new Error("Le boîtier ne répond pas. Est-il branché sur la prise du véhicule, contact mis ?");
    etat.elm = (texte(z).split('\n').find(l => /ELM|OBD|v\d/i.test(l)) || '').trim();
    await init();
    etat.tension = texte(await at('ATRV'));
    statut('Recherche du véhicule…', 'att');
    let ok = ajouterSupportes(await at('0100', 15000), 0);
    if (!ok) {
      for (const p of ['6', '7', '8', '9', '5', '4', '3', '1', '2']) {
        statut('Essai du protocole ' + PROTOS[p] + '…', 'att');
        await at('ATTP' + p);
        if (ajouterSupportes(await at('0100', 9000), 0)) { ok = true; break; }
      }
    }
    activer(true); reussi = true;
    if ([...$('#port').options].some(x => x.value === choix)) $('#port').value = choix;
    if (!ok) {
      await at('ATSP0'); majInfos(); statut('Boîtier connecté, en attente du véhicule', 'att');
      $('#resultat').innerHTML = '<div class="note">Le boîtier fonctionne (tension ' + esc(etat.tension) + ') mais le véhicule ne répond pas encore. Mets le contact : la lecture démarrera toute seule. Si le contact est déjà mis, le calculateur de ce véhicule n\'utilise pas le diagnostic standard (certains modèles d\'avant 2004–2006) ; l\'onglet « Tous les systèmes » propose un essai par la ligne K.</div>';
      attendreVehicule();
    } else await suiteVehicule();
  } catch (e) {
    try { await T.close(); } catch (x) { /* rien */ }
    activer(false); reussi = false;
    if (auto) statut('Recherche automatique du boîtier…', 'att'); else { statut('Non connecté'); dire(e.message, 8000); }
  }
  etat.enConnexion = false; if (!auto) etat.manuel = false;
  return reussi;
}
/* Recherche automatique : la page cherche le boîtier toute seule, se connecte, reconnaît le véhicule et lance le diagnostic.
   Une fois connectée, elle surveille la liaison (et la tension) et repart en recherche si le boîtier est débranché. */
async function autoRecherche() {
  clearTimeout(autoRecherche.t);
  try {
    if (etat.connecte) {
      if (!etat.simu && !etat.enConnexion) {
        let vivant = false;
        try { const r = await at('ATRV', 2500); vivant = /\d/.test(r); if (vivant) { etat.tension = texte(r); $('#iTension').textContent = etat.tension; } } catch (e) { vivant = false; }
        etat.perdu = vivant ? 0 : (etat.perdu || 0) + 1;
        if (etat.perdu >= 2) { etat.direct = false; etat.stop = true; try { await etat.T.close(); } catch (e) { /* rien */ } activer(false); statut('Boîtier débranché — recherche automatique…', 'att'); dire('Liaison avec le boîtier perdue : je le recherche.'); }
      }
    } else if (!etat.enConnexion && !etat.autoOff && !etat.manuel) {
      let candidats = 0;
      if (LOCAL) {
        const { ports } = await api('ports');
        for (const p of ports.filter(x => x.conseille).concat(ports.filter(x => !x.conseille && !x.bluetooth))) {
          candidats++; statut('Recherche automatique du boîtier…', 'att');
          if (etat.autoOff || etat.manuel || await connecter({ auto:true, choix:'local:' + p.port })) break;
        }
      } else if (navigator.serial) {
        for (const p of await navigator.serial.getPorts()) {
          candidats++; statut('Recherche automatique du boîtier…', 'att');
          if (etat.autoOff || etat.manuel || await connecter({ auto:true, choix:'serie', T:TSerie(p) })) break;
        }
      }
      if (!candidats && !etat.connecte && !etat.enConnexion) statut(navigator.serial || navigator.bluetooth ? 'Touche Connecter une première fois' : 'Non connecté');
    }
  } catch (e) { /* on réessaiera */ }
  autoRecherche.t = setTimeout(autoRecherche, etat.connecte ? 12000 : 6000);
}
async function deconnecter() {
  etat.autoOff = true; etat.direct = false; etat.stop = true; await file;
  try { await etat.T.close(); } catch (e) { /* rien */ }
  activer(false); statut('Non connecté'); $('#bDirect').textContent = 'Démarrer la lecture';
  dire('Recherche automatique en pause. Touche Connecter pour la relancer.');
}

/* ================= Diagnostic ================= */
const MONITEURS = {
  commun:[['Ratés d\'allumage', 0], ['Système de carburant', 1], ['Composants', 2]],
  essence:['Catalyseur', 'Catalyseur chauffé', 'Vapeurs d\'essence', 'Air secondaire', 'Fluide de clim', 'Sonde lambda', 'Chauffage de sonde', 'EGR / calage variable'],
  diesel:['Catalyseur d\'oxydation', 'Traitement des NOx', null, 'Pression de suralimentation', null, 'Sonde de gaz d\'échappement', 'Filtre à particules', 'EGR / calage variable']
};
function lireMoniteurs(a) {
  if (!a || a.length < 4) return null;
  const diesel = !!(a[1] & 0x08), liste = [];
  for (const [nom, bit] of MONITEURS.commun) if (a[1] & (1 << bit)) liste.push({ nom, pret:!(a[1] & (1 << (bit + 4))) });
  (diesel ? MONITEURS.diesel : MONITEURS.essence).forEach((nom, bit) => { if (nom && (a[2] & (1 << bit))) liste.push({ nom, pret:!(a[3] & (1 << bit)) }); });
  return { diesel, liste };
}
function nomCalc(id) {
  const m = { '7E8':'Moteur', '7E9':'Boîte de vitesses', '7EA':'Calculateur 3', '7EB':'Calculateur 4', '10':'Moteur', '11':'Moteur', '18':'Boîte de vitesses', '28':'Freinage (ABS)', '1A':'Moteur', 'F110':'Moteur', 'F118':'Boîte de vitesses' };
  return m[id] || 'Calculateur';
}
async function listerCalculateurs() {
  await at('ATH1'); const raw = await at('0100', 6000); await at('ATH0');
  const vus = new Map();
  for (const l of lignes(raw)) {
    if (!/^[0-9A-F]+$/.test(l)) continue;
    let id = null;
    if (etat.can) { const m = l.match(/^(7[0-9A-F]{2})/) || l.match(/^18DA(F1[0-9A-F]{2})/); if (m) id = m[1]; }
    else if (l.length >= 10) id = l.slice(4, 6);
    if (id && !vus.has(id)) vus.set(id, { id, nom:nomCalc(id) });
  }
  return [...vus.values()];
}
const GEL = [['0C', 'Régime', 'tr/min', b => (b[0] * 256 + b[1]) / 4], ['0D', 'Vitesse', 'km/h', b => b[0]], ['05', 'Température du liquide', '°C', b => b[0] - 40], ['04', 'Charge moteur', '%', b => Math.round(b[0] * 100 / 255)], ['0F', 'Température d\'admission', '°C', b => b[0] - 40], ['0B', 'Pression d\'admission', 'kPa', b => b[0]], ['11', 'Papillon', '%', b => Math.round(b[0] * 100 / 255)]];
async function diagnostic() {
  if (!etat.connecte) return;
  const etaitDirect = etat.direct; etat.direct = false;
  $('#bDiag').disabled = true; $('#bDiag').textContent = 'Lecture en cours…';
  try {
    const e = { type:'diagnostic', date:new Date().toISOString(), vehicule:etat.veh.id, nom:etat.veh.nom, simu:etat.simu, protocole:etat.proto, elm:etat.elm, vin:etat.vin, codes:{}, gel:null, calculateurs:[] };
    e.tension = etat.tension = texte(await at('ATRV'));
    const a = valeur(await at('0101'), '01');
    e.voyant = a ? !!(a[0] & 0x80) : null; e.nbAnnonce = a ? a[0] & 0x7F : null; e.moniteurs = lireMoniteurs(a);
    e.codes.memorises = lireCodes(await at('03', 6000), 3);
    e.codes.attente = lireCodes(await at('07', 6000), 7);
    e.codes.permanents = lireCodes(await at('0A', 6000), 0x0A);
    const g = messages(await at('020200')).find(m => m.startsWith('4202'));
    if (g && g.slice(6, 10) && g.slice(6, 10) !== '0000') {
      e.gel = { code:dtcDe(g.slice(6, 10)), valeurs:[] };
      for (const [pid, nom, u, f] of GEL) { const b = valeur(await at('02' + pid + '00'), pid, '42'); if (b && b.length) e.gel.valeurs.push({ nom, u, v:f(b) }); }
    }
    e.calculateurs = await listerCalculateurs();
    e.brut = brut.slice(-60);
    const s = await stocker(e);
    rendu(e, $('#resultat')); majInfos(); listerJournal();
    dire('Diagnostic terminé et enregistré' + (s ? ' (' + s + ')' : ''));
  } catch (err) { dire('Erreur : ' + err.message, 7000); }
  $('#bDiag').disabled = false; $('#bDiag').textContent = 'Relancer le diagnostic';
  if (etaitDirect) lancerDirect();
}
function blocCodes(titre, liste, aide, nom) {
  if (!liste || !liste.length) return '<h3>' + titre + '</h3><p class="vide">Aucun.</p>';
  return '<h3>' + titre + ' · ' + liste.length + '</h3><p class="sous">' + aide + '</p>' + liste.map(c => carteCode(c, nom)).join('');
}
function rendu(e, cible) {
  if (e.type === 'systemes') { renduSystemes(e, cible); return; }
  const total = (e.codes.memorises || []).length + (e.codes.attente || []).length + (e.codes.permanents || []).length;
  const rouge = e.voyant || total > 0, mon = e.moniteurs;
  const prets = mon ? mon.liste.filter(x => x.pret).length : 0;
  cible.innerHTML = '<div class="voyant" style="margin-top:16px"><div class="gros ' + (rouge ? 'rouge' : 'vert') + '">' + total + '</div>'
    + '<div><h2>' + (total ? total + ' code' + (total > 1 ? 's' : '') + ' défaut' : 'Aucun code défaut') + (e.simu ? ' <span class="badge ko">simulateur</span>' : '') + '</h2>'
    + '<div class="sous">' + esc(e.nom) + ' · ' + new Date(e.date).toLocaleString('fr-FR') + '<br>Voyant moteur : <b>' + (e.voyant === null ? 'inconnu' : (e.voyant ? 'allumé' : 'éteint')) + '</b>'
    + (e.nbAnnonce != null ? ' · ' + e.nbAnnonce + ' code(s) annoncé(s)' : '') + ' · ' + esc(e.tension || '') + ' · ' + esc(e.protocole || '') + '</div></div></div>'
    + blocCodes('Codes mémorisés', e.codes.memorises, 'Défauts confirmés, enregistrés dans le calculateur.', e.nom)
    + blocCodes('Codes en attente', e.codes.attente, 'Défauts vus pendant le dernier trajet, pas encore confirmés.', e.nom)
    + blocCodes('Codes permanents', e.codes.permanents, "Défauts que l'effacement ne supprime pas : ils partent seuls après réparation.", e.nom)
    + (e.gel ? '<h3>Données figées</h3><p class="sous">Conditions de roulage au moment du défaut <b>' + esc(e.gel.code) + '</b>.</p><div>' + (e.gel.valeurs || []).map(v => '<span class="badge">' + esc(v.nom) + ' : ' + esc(v.v) + ' ' + esc(v.u) + '</span>').join('') + '</div>' : '')
    + (mon ? '<h3>Prêt pour le contrôle antipollution · ' + prets + '/' + mon.liste.length + '</h3><div>' + mon.liste.map(x => '<span class="badge ' + (x.pret ? 'ok' : 'att') + '">' + esc(x.nom) + ' : ' + (x.pret ? 'prêt' : 'pas encore') + '</span>').join('') + '</div>' : '')
    + (e.calculateurs && e.calculateurs.length ? '<h3>Calculateurs qui ont répondu</h3><div>' + e.calculateurs.map(c => '<span class="badge">' + esc(c.id) + ' · ' + esc(c.nom) + '</span>').join('') + '</div>' : '');
}
async function effacer() {
  if (!confirm("Effacer les codes défaut ?\n\n• Moteur arrêté, contact mis.\n• Le voyant s'éteint, mais le défaut reviendra si la panne n'est pas réparée.\n• Les données figées et les contrôles antipollution sont remis à zéro (à refaire avant un contrôle technique).\n• Le dernier diagnostic reste dans le journal.")) return;
  etat.direct = false;
  try {
    const r = await at('04', 8000);
    if (messages(r).some(m => m.startsWith('44'))) { dire('Codes effacés. Nouvelle lecture…'); await diagnostic(); }
    else dire('Effacement refusé par le véhicule : ' + texte(r).replace(/\n/g, ' '), 7000);
  } catch (e) { dire('Erreur : ' + e.message, 7000); }
}

/* ================= Tous les systèmes ================= */
const ETATS = [[0x08, 'confirmé', 'ko'], [0x04, 'en attente', 'att'], [0x01, 'présent maintenant', 'ko'], [0x80, 'voyant demandé', 'att']];
const NOMS_TX = { '7E0':'Moteur', '7E1':'Boîte de vitesses', '7E2':'Calculateur moteur 2 / hybride', '7E3':'Calculateur 4', '7E4':'Batterie de traction', '7E5':'Calculateur 6', '7E6':'Calculateur 7', '7E7':'Calculateur 8' };
function progres(p) { $('#prog').style.display = p == null ? 'none' : 'block'; if (p != null) $('#progB').style.width = Math.round(p * 100) + '%'; }
async function lireModule(m) {
  await at('ATSH ' + m.tx); await at('ATCRA ' + m.rx); await at('ATFCSH ' + m.tx); await at('ATFCSD 300000'); await at('ATFCSM1');
  const un = async (c, t = 3000) => trames(await at(c, t)).get(m.rx) || [];
  await un('1003');
  const n = await un('22F197'); if (n[0] === 0x62) m.nom = ascii(n.slice(3)) || m.nom;
  const v = await un('22F190'); if (v[0] === 0x62) m.vin = ascii(v.slice(3));
  let d = await un('1902FF', 6000); m.codes = [];
  if (d[0] === 0x59) { for (let i = 3; i + 4 <= d.length; i += 4) m.codes.push({ code:dtcDe(hx(d[i], 2) + hx(d[i + 1], 2)) + '-' + hx(d[i + 2], 2), etat:d[i + 3] }); m.lu = true; }
  else {
    d = await un('1800FF00', 6000);
    if (d[0] === 0x58) { for (let i = 2; i + 3 <= d.length; i += 3) m.codes.push({ code:dtcDe(hx(d[i], 2) + hx(d[i + 1], 2)), etat:d[i + 2] & 0x60 ? 0x08 : 0x04 }); m.lu = true; }
    else m.lu = false;
  }
}
async function finScan() { for (const c of ['ATAR', 'ATFCSM0', 'ATSH 7DF', 'ATST 32', 'ATH0']) await at(c); }
async function scanSystemes() {
  if (!etat.connecte) return;
  if (!etat.can) return scanLigneK();
  if (etat.can29) { $('#systemes').innerHTML = '<div class="note">Ce véhicule utilise un réseau CAN à adresses longues (29 bits) : le balayage module par module n\'est pas encore pris en charge. Le diagnostic standard reste disponible.</div>'; return; }
  etat.direct = false; etat.stop = false;
  $('#bSys').disabled = true; $('#bSysStop').style.display = 'inline-block'; progres(0);
  const mods = [];
  try {
    for (const c of ['ATH1', 'ATCAF1', 'ATCF 700', 'ATCM 700', 'ATST 19']) await at(c);
    for (let id = 0x700; id <= 0x7FF && !etat.stop; id++) {
      if (id === 0x7DF) continue;
      const tx = hx(id, 3);
      await at('ATSH ' + tx);
      for (const [rx, b] of trames(await at('3E00', 1500))) if (rx !== tx && b.length && (b[0] === 0x7E || b[0] === 0x7F) && !mods.some(m => m.rx === rx)) mods.push({ tx, rx, nom:NOMS_TX[tx] || 'Module ' + tx, codes:[] });
      if (id % 4 === 0) { progres((id - 0x700) / 320); $('#systemes').innerHTML = '<p class="vide">Recherche… ' + mods.length + ' calculateur(s) trouvé(s).</p>'; }
    }
    await at('ATST 64');
    for (let i = 0; i < mods.length && !etat.stop; i++) { progres(0.8 + 0.2 * i / mods.length); await lireModule(mods[i]); }
    const e = { type:'systemes', date:new Date().toISOString(), vehicule:etat.veh.id, nom:etat.veh.nom, simu:etat.simu, protocole:etat.proto, vin:etat.vin, modules:mods, brut:brut.slice(-120) };
    await stocker(e); renduSystemes(e, $('#systemes')); listerJournal();
  } catch (err) { dire('Erreur : ' + err.message, 7000); }
  try { await finScan(); } catch (e) { /* rien */ }
  progres(null); $('#bSys').disabled = false; $('#bSysStop').style.display = 'none';
}
function renduSystemes(e, cible) {
  const mods = e.modules || [], total = mods.reduce((n, m) => n + (m.codes || []).length, 0);
  cible.innerHTML = '<div class="voyant" style="margin-top:16px"><div class="gros ' + (total ? 'rouge' : 'vert') + '">' + total + '</div><div><h2>' + mods.length + ' calculateur(s), ' + total + ' défaut(s)' + (e.simu ? ' <span class="badge ko">simulateur</span>' : '') + '</h2><div class="sous">' + esc(e.nom) + ' · ' + new Date(e.date).toLocaleString('fr-FR') + (e.ligneK ? ' · ligne K (expérimental)' : '') + '</div></div></div>'
    + (mods.length ? '' : '<p class="vide">Aucun calculateur n\'a répondu à ce balayage. Sur les véhicules d\'avant 2008 environ, seuls le moteur et la dépollution sont joignables avec ce boîtier.</p>')
    + mods.map(m => '<h3>' + esc(m.nom) + ' · ' + esc(m.tx) + (m.rx ? ' → ' + esc(m.rx) : '') + '</h3>'
      + (m.vin ? '<div class="sous">Châssis déclaré : ' + esc(m.vin) + '</div>' : '')
      + (m.lu === false ? '<p class="vide">Présent, mais refuse la lecture des défauts avec ce boîtier.</p>'
        : (m.codes.length ? m.codes.map(c => carteCode(c.code, e.nom, '<div>' + ETATS.filter(x => c.etat & x[0]).map(x => '<span class="badge ' + x[2] + '">' + x[1] + '</span>').join('') + '</div>')).join('')
            + (cible.id === 'systemes' && !e.ligneK ? '<button class="btn danger petit" data-efface="' + esc(m.tx) + '" data-rx="' + esc(m.rx) + '">Effacer les défauts de ce calculateur</button>' : '')
          : '<p class="vide">Aucun défaut.</p>'))).join('');
}
async function effacerModule(tx, rx) {
  if (!confirm('Effacer les défauts du calculateur ' + tx + ' ?\n\nVéhicule à l\'arrêt, contact mis. Un défaut encore présent reviendra aussitôt.')) return;
  try {
    for (const c of ['ATH1', 'ATSH ' + tx, 'ATCRA ' + rx, 'ATST 64']) await at(c);
    const b = trames(await at('14FFFFFF', 6000)).get(rx) || [];
    dire(b[0] === 0x54 ? 'Défauts effacés. Relance le balayage pour vérifier.' : 'Effacement refusé par ce calculateur.', 6000);
  } catch (e) { dire('Erreur : ' + e.message, 7000); }
  try { await finScan(); } catch (e) { /* rien */ }
}
/* Ligne K : essai expérimental d'ouverture d'une session KWP2000 par adresse. Jamais validé sur véhicule. */
const ADR_K = [['10', 'Moteur'], ['11', 'Moteur (2)'], ['01', 'Moteur (groupe VW)'], ['12', 'Moteur (autre adresse)'], ['18', 'Boîte de vitesses'], ['02', 'Boîte (groupe VW)'], ['28', 'Freinage (ABS)'], ['03', 'Freinage (groupe VW)'], ['58', 'Airbags'], ['15', 'Airbags (groupe VW)'], ['17', 'Combiné d\'instruments (groupe VW)'], ['19', 'Passerelle (groupe VW)']];
async function scanLigneK() {
  if (!confirm("Ce véhicule n'a pas de réseau CAN de diagnostic. Essai par la ligne K (expérimental, jamais validé) : environ 2 minutes, véhicule à l'arrêt, contact mis. Continuer ?")) return;
  etat.direct = false; etat.stop = false; $('#bSys').disabled = true; $('#bSysStop').style.display = 'inline-block'; progres(0);
  const mods = []; let refus = false;
  try {
    for (let i = 0; i < ADR_K.length && !etat.stop && !refus; i++) {
      const [adr, nom] = ADR_K[i]; progres(i / ADR_K.length);
      $('#systemes').innerHTML = '<p class="vide">Essai de l\'adresse ' + adr + ' (' + esc(nom) + ')…</p>';
      await at('ATPC'); await at('ATSP5');
      const a = await at('ATSH 81 ' + adr + ' F1'); if (/\?/.test(a)) { refus = true; break; }
      await at('ATWM 81 ' + adr + ' F1 3E');
      let r = await at('ATFI', 5000);
      if (!/OK/i.test(r)) { await at('ATPC'); await at('ATSP4'); await at('ATIIA ' + adr); r = await at('ATSI', 9000); }
      if (!/OK/i.test(r)) continue;
      const m = { tx:adr, rx:'', nom, codes:[], lu:false };
      await at('1081', 3000);
      for (const d of messages(await at('1800FF00', 6000)).map(octets)) if (d[0] === 0x58) { m.lu = true; for (let j = 2; j + 3 <= d.length; j += 3) m.codes.push({ code:dtcDe(hx(d[j], 2) + hx(d[j + 1], 2)), etat:0x08 }); }
      mods.push(m);
    }
    const e = { type:'systemes', ligneK:true, date:new Date().toISOString(), vehicule:etat.veh.id, nom:etat.veh.nom, simu:etat.simu, protocole:etat.proto, vin:etat.vin, modules:mods, brut:brut.slice(-160) };
    await stocker(e); renduSystemes(e, $('#systemes')); listerJournal();
    if (refus) $('#systemes').insertAdjacentHTML('afterbegin', '<div class="note">Ce boîtier ne connaît pas les commandes nécessaires à la ligne K (cas de nombreux clones). Le diagnostic standard reste disponible.</div>');
  } catch (err) { dire('Erreur : ' + err.message, 7000); }
  try { await at('ATPC'); await at('ATIIA 33'); await at('ATD'); await init(); await at('0100', 12000); } catch (e) { /* rien */ }
  progres(null); $('#bSys').disabled = false; $('#bSysStop').style.display = 'none';
}

/* ================= En direct ================= */
const P = (p, n, u, max, d, f, on) => ({ p, n, u, max, d, f, on:!!on });
const PIDS = [
  P('0C', 'Régime moteur', 'tr/min', 7000, 0, b => (b[0] * 256 + b[1]) / 4, 1), P('0D', 'Vitesse', 'km/h', 220, 0, b => b[0], 1),
  P('05', 'Température du liquide', '°C', 130, 0, b => b[0] - 40, 1), P('04', 'Charge moteur', '%', 100, 0, b => b[0] * 100 / 255, 1),
  P('11', 'Ouverture papillon', '%', 100, 0, b => b[0] * 100 / 255, 1), P('0F', "Température d'admission", '°C', 80, 0, b => b[0] - 40, 1),
  P('0B', "Pression d'admission", 'kPa', 255, 0, b => b[0], 1), P('10', "Débit d'air", 'g/s', 300, 1, b => (b[0] * 256 + b[1]) / 100, 1),
  P('42', 'Tension calculateur', 'V', 16, 1, b => (b[0] * 256 + b[1]) / 1000), P('06', 'Correction carburant courte', '%', 25, 1, b => (b[0] - 128) * 100 / 128),
  P('07', 'Correction carburant longue', '%', 25, 1, b => (b[0] - 128) * 100 / 128), P('0E', "Avance à l'allumage", '°', 60, 1, b => b[0] / 2 - 64),
  P('0A', 'Pression de carburant', 'kPa', 765, 0, b => b[0] * 3), P('23', 'Pression de rampe', 'bar', 2000, 0, b => (b[0] * 256 + b[1]) / 10),
  P('14', 'Sonde lambda 1', 'V', 1.3, 2, b => b[0] / 200), P('15', 'Sonde lambda 2', 'V', 1.3, 2, b => b[0] / 200),
  P('2C', 'EGR commandée', '%', 100, 0, b => b[0] * 100 / 255), P('2E', 'Purge canister', '%', 100, 0, b => b[0] * 100 / 255),
  P('2F', 'Niveau de carburant', '%', 100, 0, b => b[0] * 100 / 255), P('33', 'Pression atmosphérique', 'kPa', 255, 0, b => b[0]),
  P('3C', 'Température catalyseur', '°C', 1000, 0, b => (b[0] * 256 + b[1]) / 10 - 40), P('43', 'Charge absolue', '%', 100, 0, b => (b[0] * 256 + b[1]) * 100 / 255),
  P('44', 'Richesse commandée (lambda)', '', 2, 2, b => (b[0] * 256 + b[1]) / 32768), P('45', 'Papillon relatif', '%', 100, 0, b => b[0] * 100 / 255),
  P('46', 'Température extérieure', '°C', 50, 0, b => b[0] - 40), P('49', 'Pédale d\'accélérateur', '%', 100, 0, b => b[0] * 100 / 255),
  P('5C', "Température d'huile", '°C', 150, 0, b => b[0] - 40), P('5E', 'Consommation instantanée', 'L/h', 30, 1, b => (b[0] * 256 + b[1]) / 20),
  P('61', 'Couple demandé', '%', 100, 0, b => b[0] - 125), P('62', 'Couple réel', '%', 100, 0, b => b[0] - 125),
  P('1F', 'Durée moteur tournant', 's', 3600, 0, b => b[0] * 256 + b[1]), P('21', 'Distance voyant allumé', 'km', 1000, 0, b => b[0] * 256 + b[1]),
  P('30', 'Démarrages depuis effacement', '', 255, 0, b => b[0]), P('31', 'Distance depuis effacement', 'km', 65535, 0, b => b[0] * 256 + b[1])
];
let actifs = [], enreg = [];
function construireJauges() {
  actifs = PIDS.filter(x => etat.sup.has(x.p)).map(x => Object.assign({}, x, { h:[], mn:null, mx:null }));
  if (!actifs.some(x => x.on)) actifs.slice(0, 6).forEach(x => x.on = true);
  $('#jauges').innerHTML = actifs.map(x => '<button class="jauge' + (x.on ? '' : ' off') + '" data-p="' + x.p + '"><small>' + esc(x.n) + '</small><div class="v"><span id="v' + x.p + '">—</span><i>' + esc(x.u) + '</i></div><div class="mm" id="m' + x.p + '">&nbsp;</div><canvas id="c' + x.p + '" width="300" height="60"></canvas></button>').join('');
  $('#directInfo').textContent = actifs.length + ' valeur(s) fournie(s) par ce véhicule. Touche une tuile pour l\'activer ou la mettre en pause.';
}
function tracer(x) {
  const c = $('#c' + x.p); if (!c || x.h.length < 2) return;
  const g = c.getContext('2d'), w = c.width, h = c.height, mn = Math.min(...x.h), mx = Math.max(...x.h), e = (mx - mn) || 1;
  g.clearRect(0, 0, w, h); g.beginPath();
  x.h.forEach((v, i) => { const X = i * w / (x.h.length - 1), Y = h - 4 - (v - mn) * (h - 8) / e; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff9d1c'; g.lineWidth = 2; g.stroke();
}
async function lancerDirect() {
  if (etat.direct || !actifs.length) return;
  etat.direct = true; $('#bDirect').textContent = 'Arrêter la lecture'; $('#bCsv').disabled = false;
  while (etat.direct && etat.connecte) {
    const ligne = { t:Date.now() }; let lus = 0;
    for (const x of actifs) {
      if (!etat.direct) break; if (!x.on) continue;
      try {
        const b = valeur(await at('01' + x.p, 1500), x.p); lus++;
        if (b && b.length) {
          const v = x.f(b); ligne[x.p] = +v.toFixed(x.d);
          x.h.push(v); if (x.h.length > 120) x.h.shift();
          x.mn = x.mn == null ? v : Math.min(x.mn, v); x.mx = x.mx == null ? v : Math.max(x.mx, v);
          $('#v' + x.p).textContent = v.toFixed(x.d).replace('.', ',');
          $('#m' + x.p).textContent = 'min ' + x.mn.toFixed(x.d) + ' · max ' + x.mx.toFixed(x.d);
          tracer(x);
        }
      } catch (e) { etat.direct = false; dire('Lecture interrompue : ' + e.message); }
    }
    if (lus) { enreg.push(ligne); if (enreg.length > 20000) enreg.shift(); } else await pause(300);
  }
  $('#bDirect').textContent = 'Démarrer la lecture';
}
function telecharger(nom, contenu, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenu], { type })); a.download = nom; document.body.appendChild(a); a.click(); a.remove();
}
function exporterCsv() {
  if (!enreg.length) { dire('Rien à exporter : démarre la lecture d\'abord.'); return; }
  const cols = actifs.filter(x => enreg.some(l => x.p in l));
  const csv = ['heure;' + cols.map(x => x.n + (x.u ? ' (' + x.u + ')' : '')).join(';')].concat(enreg.map(l => new Date(l.t).toLocaleTimeString('fr-FR') + ';' + cols.map(x => l[x.p] == null ? '' : String(l[x.p]).replace('.', ',')).join(';'))).join('\r\n');
  telecharger('kdmc-obd-' + (etat.veh.id || 'vehicule') + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv', '﻿' + csv, 'text/csv');
}

/* ================= Contrôles ================= */
const MID = { '01':'Sonde lambda amont (rangée 1)', '02':'Sonde lambda aval (rangée 1)', '05':'Sonde lambda amont (rangée 2)', '06':'Sonde lambda aval (rangée 2)', '21':'Catalyseur (rangée 1)', '22':'Catalyseur (rangée 2)', '31':'EGR (rangée 1)', '35':'Calage variable (rangée 1)', '39':'Vapeurs d\'essence (bouchon)', '3A':'Vapeurs d\'essence (fuite 2,3 mm)', '3B':'Vapeurs d\'essence (fuite 1 mm)', '3C':'Vapeurs d\'essence (fuite 0,5 mm)', '3D':'Purge des vapeurs', '41':'Chauffage sonde amont (rangée 1)', '42':'Chauffage sonde aval (rangée 1)', '71':'Air secondaire', '81':'Système de carburant (rangée 1)', '85':'Pression de suralimentation', '90':'Absorbeur de NOx', '98':'Catalyseur NOx', 'A1':'Ratés d\'allumage (ensemble)', 'A2':'Ratés cylindre 1', 'A3':'Ratés cylindre 2', 'A4':'Ratés cylindre 3', 'A5':'Ratés cylindre 4', 'A6':'Ratés cylindre 5', 'A7':'Ratés cylindre 6', 'B2':'Filtre à particules (rangée 1)' };
async function controles() {
  if (!etat.connecte) return;
  etat.direct = false; $('#bCtrl').disabled = true; let h = '';
  try {
    const mon = lireMoniteurs(valeur(await at('0101'), '01'));
    if (mon) {
      const prets = mon.liste.filter(x => x.pret).length;
      h += '<h3>Prêt pour le contrôle antipollution · ' + prets + '/' + mon.liste.length + '</h3><p class="sous">Moteur ' + (mon.diesel ? 'diesel' : 'essence') + '. Après un effacement ou un débranchement de batterie, ces autotests se refont en roulant (quelques dizaines de kilomètres, ville et route).</p><div>'
        + mon.liste.map(x => '<span class="badge ' + (x.pret ? 'ok' : 'att') + '">' + esc(x.nom) + ' : ' + (x.pret ? 'prêt' : 'pas encore') + '</span>').join('') + '</div>';
    }
    const cal = lireTexte09(await at('0904', 4000), '04'), ecu = lireTexte09(await at('090A', 4000), '0A');
    h += '<h3>Identité du calculateur moteur</h3><table class="table"><tr><th>N° de châssis</th><td>' + esc(etat.vin || 'non fourni') + (marqueVin(etat.vin) ? ' · ' + esc(marqueVin(etat.vin)) : '') + '</td></tr><tr><th>Nom</th><td>' + esc(ecu || 'non fourni') + '</td></tr><tr><th>Version du logiciel</th><td>' + esc(cal || 'non fournie') + '</td></tr><tr><th>Boîtier</th><td>' + esc(etat.elm) + '</td></tr></table>';
    if (etat.can) {
      const mids = []; let base = 0;
      for (;;) {
        const m = messages(await at('06' + hx(base, 2), 3000)).find(x => x.startsWith('46' + hx(base, 2)));
        if (!m) break; const b = octets(m.slice(4)); let suite = false;
        for (let i = 0; i < 32; i++) if (b[i >> 3] & (0x80 >> (i & 7))) { if (i === 31) suite = true; else mids.push(hx(base + i + 1, 2)); }
        if (!suite || base >= 0xE0) break; base += 0x20;
      }
      const lignesT = [];
      for (const mid of mids.slice(0, 40)) {
        const m = messages(await at('06' + mid, 3000)).find(x => x.startsWith('46' + mid)); if (!m) continue;
        const b = octets(m.slice(2));
        for (let i = 0; i + 9 <= b.length; i += 9) {
          const sg = b[i + 2] >= 0x81, n16 = (a, c) => { const v = a * 256 + c; return sg && v > 32767 ? v - 65536 : v; };
          const v = n16(b[i + 3], b[i + 4]), mn = n16(b[i + 5], b[i + 6]), mx = n16(b[i + 7], b[i + 8]);
          lignesT.push('<tr><td>' + esc(MID[mid] || 'Autotest ' + mid) + '</td><td>n° ' + hx(b[i + 1], 2) + '</td><td>' + v + '</td><td>' + mn + ' à ' + mx + '</td><td><span class="badge ' + (v >= mn && v <= mx ? 'ok">conforme' : 'ko">hors limites') + '</span></td></tr>');
        }
      }
      h += '<h3>Autotests du calculateur · ' + lignesT.length + '</h3>' + (lignesT.length ? '<p class="sous">Valeurs brutes mesurées par le calculateur et limites qu\'il s\'impose. Un autotest hors limites annonce souvent un code défaut à venir.</p><div style="overflow-x:auto"><table class="table"><tr><th>Organe</th><th>Test</th><th>Mesure</th><th>Limites</th><th></th></tr>' + lignesT.join('') + '</table></div>' : '<p class="vide">Ce véhicule ne publie pas ses autotests.</p>');
    } else h += '<h3>Autotests du calculateur</h3><p class="vide">Disponibles seulement sur les véhicules à réseau CAN (après 2008 environ).</p>';
  } catch (e) { dire('Erreur : ' + e.message, 7000); }
  $('#controles').innerHTML = h; $('#bCtrl').disabled = false;
}
async function batterie() {
  etat.direct = false; $('#bBatt').disabled = true;
  try {
    const v = []; for (let i = 0; i < 5; i++) { const m = texte(await at('ATRV')).match(/[\d.]+/); if (m) v.push(parseFloat(m[0])); await pause(300); }
    if (!v.length) throw new Error('tension illisible');
    const moy = v.reduce((a, b) => a + b, 0) / v.length;
    const r = etat.sup.has('0C') ? valeur(await at('010C'), '0C') : null, tourne = r ? (r[0] * 256 + r[1]) / 4 > 400 : moy > 13.2;
    let avis, cl;
    if (tourne) { if (moy < 13.2) { avis = 'Charge insuffisante : alternateur, courroie ou câblage à contrôler.'; cl = 'ko'; } else if (moy > 14.9) { avis = 'Tension trop haute : régulateur de l\'alternateur à contrôler.'; cl = 'ko'; } else { avis = 'L\'alternateur charge correctement.'; cl = 'ok'; } }
    else { if (moy >= 12.4) { avis = 'Batterie bien chargée.'; cl = 'ok'; } else if (moy >= 12.0) { avis = 'Batterie partiellement déchargée : à recharger, à surveiller.'; cl = 'att'; } else { avis = 'Batterie déchargée ou fatiguée.'; cl = 'ko'; } }
    $('#controles').insertAdjacentHTML('afterbegin', '<h3>Batterie et alternateur</h3><div class="code"><span class="c">' + moy.toFixed(1).replace('.', ',') + ' V</span><div class="d"><b>' + avis + '</b><small>Moteur ' + (tourne ? 'tournant' : 'arrêté') + ' · mesure à la prise de diagnostic (légèrement inférieure à la tension aux bornes). Refais le test moteur ' + (tourne ? 'arrêté' : 'tournant') + ' pour l\'autre moitié du bilan.</small><span class="badge ' + cl + '">' + (cl === 'ok' ? 'correct' : cl === 'att' ? 'à surveiller' : 'à contrôler') + '</span></div></div>');
  } catch (e) { dire('Erreur : ' + e.message, 7000); }
  $('#bBatt').disabled = false;
}

/* ================= Journal ================= */
const lsJournal = () => { try { return JSON.parse(localStorage.getItem('kdmc-obd-journal') || '[]'); } catch (e) { return []; } };
async function stocker(e) {
  if (LOCAL) { try { return (await api('journal', e)).fichier; } catch (x) { /* repli navigateur */ } }
  const j = lsJournal(); e.fichier = 'n' + Date.now(); j.unshift(e);
  for (;;) { try { localStorage.setItem('kdmc-obd-journal', JSON.stringify(j.slice(0, 80))); break; } catch (x) { if (j.length < 2) break; j.pop(); } }
  return '';
}
const nbCodes = e => e.type === 'systemes' ? (e.modules || []).reduce((n, m) => n + (m.codes || []).length, 0) : ((e.codes && (e.codes.memorises || []).length + (e.codes.attente || []).length + (e.codes.permanents || []).length) || 0);
async function listerJournal() {
  let essais = lsJournal().map(e => ({ fichier:e.fichier, date:e.date, nom:e.nom, nb:nbCodes(e), simu:e.simu, type:e.type }));
  if (LOCAL) { try { essais = (await api('journal')).essais.concat(essais); } catch (e) { /* rien */ } }
  $('#journalOu').textContent = LOCAL ? 'Chaque essai est gardé sur cet ordinateur (dossier journal).' : 'Chaque essai est gardé dans ce navigateur, sur cet appareil. Exporte-les pour les conserver ailleurs.';
  $('#essais').innerHTML = essais.length ? essais.map(e => '<button class="essai" data-f="' + esc(e.fichier) + '"><div><b>' + esc(e.nom) + '</b>' + (e.type === 'systemes' ? ' <span class="badge">tous systèmes</span>' : '') + (e.simu ? ' <span class="badge ko">simulateur</span>' : '') + '<br><span class="sous">' + new Date(e.date).toLocaleString('fr-FR') + '</span></div><span class="n">' + e.nb + ' code' + (e.nb > 1 ? 's' : '') + '</span></button>').join('') : '<p class="vide">Aucun essai pour le moment.</p>';
}
async function ouvrirEssai(f) {
  let e = lsJournal().find(x => x.fichier === f);
  if (!e && LOCAL) e = await (await fetch('/api/journal?f=' + encodeURIComponent(f))).json();
  if (!e) return;
  const c = $('#essaiVu'); c.style.display = 'block'; rendu(e, c); c.scrollIntoView({ behavior:'smooth' });
}

/* ================= Démarrage ================= */
function brancher() {
  $('#version').textContent = VERSION + (LOCAL ? ' · Lenovo' : ' · domaine');
  $('#vehs').onclick = e => { const b = e.target.closest('.veh'); if (!b) return; if (b.dataset.id === '+') { ouvrirDlg(null); return; }
    if (etat.connecte && !etat.simu && etat.emp && !etat.vin && etat.proto) { const v = garage.find(x => x.id === b.dataset.id); memoriserEmpreinte(v); choisirVeh(v.id); dire(v.nom + ' mémorisé : je le reconnaîtrai tout seul la prochaine fois.'); return; }
    if (etat.veh && b.dataset.id === etat.veh.id) ouvrirDlg(etat.veh); else choisirVeh(b.dataset.id); };
  $('#vNon').onclick = () => $('#dlgVeh').close();
  $('#vOk').onclick = () => {
    const nom = $('#vNom').value.trim(); if (!nom) { dire('Donne un nom au véhicule'); return; }
    const id = $('#dlgVeh').dataset.id, vin = $('#vVin').value.trim().toUpperCase();
    const anc = garage.find(x => x.id === id) || {};
    const v = { id:id || 'v' + Date.now(), nom, detail:$('#vDetail').value.trim(), vin, note:anc.note || '' }; if (anc.emp) v.emp = anc.emp;
    const i = garage.findIndex(x => x.id === v.id); if (i >= 0) garage[i] = v; else garage.push(v);
    sauverGarage(); choisirVeh(v.id); $('#dlgVeh').close();
  };
  $('#vSuppr').onclick = () => { garage = garage.filter(x => x.id !== $('#dlgVeh').dataset.id); sauverGarage(); choisirVeh(null); $('#dlgVeh').close(); };
  $('#bConnecter').onclick = connecter; $('#bDeconnecter').onclick = deconnecter;
  $('#bDiag').onclick = diagnostic; $('#bEffacer').onclick = effacer; $('#bImprimer').onclick = () => window.print();
  $('#bSys').onclick = scanSystemes; $('#bSysStop').onclick = () => { etat.stop = true; };
  $('#systemes').addEventListener('click', e => { const b = e.target.closest('[data-efface]'); if (b) effacerModule(b.dataset.efface, b.dataset.rx); });
  $('#bDirect').onclick = () => { if (etat.direct) etat.direct = false; else lancerDirect(); };
  $('#jauges').onclick = e => { const b = e.target.closest('.jauge'); if (!b) return; const x = actifs.find(a => a.p === b.dataset.p); x.on = !x.on; b.classList.toggle('off', !x.on); };
  $('#bCsv').onclick = exporterCsv; $('#bCtrl').onclick = controles; $('#bBatt').onclick = batterie;
  $('#essais').onclick = e => { const b = e.target.closest('.essai'); if (b) ouvrirEssai(b.dataset.f); };
  $('#bExport').onclick = async () => {
    const tout = lsJournal();
    if (LOCAL) { try { for (const x of (await api('journal')).essais) tout.push(await (await fetch('/api/journal?f=' + encodeURIComponent(x.fichier))).json()); } catch (e) { /* rien */ } }
    telecharger('kdmc-obd-journal.json', JSON.stringify({ garage, essais:tout }, null, 1), 'application/json');
  };
  const envoyer = async () => { const c = $('#cmd').value.trim(); if (!c || !/^[0-9A-Za-z @]{1,40}$/.test(c)) return; $('#cmd').value = ''; try { await at(c, 8000); } catch (e) { dire(e.message); } };
  $('#bCmd').onclick = envoyer; $('#cmd').onkeydown = e => { if (e.key === 'Enter' && etat.connecte) envoyer(); };
  $('#bVider').onclick = () => { $('#sortie').textContent = ''; };
  $('#nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('actif', x === b));
    document.querySelectorAll('section').forEach(s => s.classList.toggle('actif', s.id === b.dataset.o));
    if (b.dataset.o !== 'direct') etat.direct = false;
  };
  const th = localStorage.getItem('kdmc-obd-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre');
  document.documentElement.dataset.theme = th;
  $('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'clair' ? 'sombre' : 'clair'; document.documentElement.dataset.theme = t; localStorage.setItem('kdmc-obd-theme', t); };
}
async function demarrer() {
  brancher();
  if (!LOCAL) {
    $('#retour').style.display = 'inline-grid';
    /* Page réservée à l'administrateur : c'est le domaine qui décide, jamais la page. */
    let ok = false;
    try { const r = await fetch('/__admin/outils-ouverts', { credentials:'include', cache:'no-store' }); ok = r.status === 200; } catch (e) { ok = false; }
    if (!ok) { $('#porte').innerHTML = '<h2>🔒 Accès administrateur</h2><p>Cette page n\'est visible que par l\'administrateur du domaine.</p><p>Connecte-toi sur <a href="/" style="color:var(--accent)">kd-mc.com</a> avec ton compte, puis reviens ici.</p>'; return; }
  }
  $('#porte').style.display = 'none'; $('#app').style.display = 'block';
  try { garage = JSON.parse(localStorage.getItem('kdmc-obd-garage') || '[]'); } catch (e) { garage = []; }
  if (LOCAL && !garage.length) { try { garage = await (await fetch('/vehicules.json')).json(); sauverGarage(); } catch (e) { /* rien */ } }
  importerGarage();
  choisirVeh(localStorage.getItem('kdmc-obd-veh'));
  await chargerPorts(); await listerJournal(); chargerTitres();
  if (navigator.serial) navigator.serial.addEventListener('connect', () => autoRecherche());
  autoRecherche();
}
window.KDMC_OBD = { etat, garage:() => garage, reconnaitre, autoRecherche, connecter, diagnostic, scanSystemes, controles, batterie, lancerDirect, deconnecter, effacer, effacerModule, messages, trames, lireCodes, dtcDe };
demarrer();
})();
