// Juragan Nusantara — server permainan real-time untuk jaringan lokal (LAN/Wi-Fi).
// Jalankan: npm install  lalu  npm start
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');
const {
  K, START_MONEY, SALARY, JAIL_FINE, DOA_REWARD, BUZZER_FEE, LAND, MUSIBAH_SPECIAL, BOARD: BOARD_WNI, GROUP_COLORS, PLAYER_COLORS, LOOKS,
  POWERS, KESEMPATAN, KESEMPATAN_ULTRA_RARE, KESEMPATAN_ULTRA_RARE_PEJABAT, ULTRA_RARE_CHANCE, MUSIBAH, BOT_NAMES, AVATAR_STATS, BANK,
  NORMAL, NORMAL_BOARD, NORMAL_KESEMPATAN, NORMAL_AVATARS, GAME_MINUTES, TAX_PER_PROPERTY, TURN_IDLE_SECONDS, TRAVEL_IDLE_SECONDS
} = require('./board');

// Mode permainan: 'wni' (bertahan hidup, Musibah) atau 'normal' (ala Monopoli/Let's Get Rich).
// BOARD selalu menunjuk papan mode yang sedang dimainkan.
const boardFor = mode => (mode === 'normal' ? NORMAL_BOARD : BOARD_WNI);
let BOARD = BOARD_WNI;

const PORT = Number(process.env.PORT) || 3000;
const SAVE_FILE = path.join(__dirname, 'game-state.json');
const AVATAR_DIR = path.join(__dirname, 'avatars');
const COLORS = Object.keys(PLAYER_COLORS);
const MAX_PLAYERS = 20;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const BOT_SPEED = Number(process.env.BOT_SPEED) || 1; // >1 = bot lebih cepat (untuk uji otomatis)
const VERSION = 3;
// Sidik jari kode tampilan (public/). Kalau berubah setelah server di-restart, browser pemain memuat ulang sendiri.
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const walk = dir => { for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p); else if (/.(js|html|css)$/.test(f.name)) h.update(f.name).update(fs.readFileSync(p));
  } };
  try { walk(path.join(__dirname, 'public')); } catch (e) { /* tanpa sidik jari */ }
  return h.digest('hex').slice(0, 12);
})();

/* ---------------- HTTP + Socket.IO ---------------- */
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
// Three.js disajikan dari node_modules supaya permainan tetap jalan tanpa internet.
app.use('/vendor/three/build', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.get('/info', (req, res) => res.json({ urls: lanUrls() }));
app.get('/avatar/:id', (req, res) => {
  if (!/^[a-f0-9]{16}$/.test(req.params.id)) return res.sendStatus(404);
  const file = path.join(AVATAR_DIR, req.params.id + '.png');
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // URL memuat ?v=versi
  res.type('png').sendFile(file);
});
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 3e6 });

// Koneksi dari laptop server sendiri (localhost atau IP Wi-Fi laptop ini).
function isLocalAddress(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  if (a === '127.0.0.1' || a === '::1') return true;
  return Object.values(os.networkInterfaces()).some(list => (list || []).some(i => i.address === a));
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(`http://${a.address}:${PORT}`);
    }
  }
  return out;
}

/* ---------------- Helpers ---------------- */
class GameError extends Error {}
const fail = msg => { throw new GameError(msg); };
const rp = n => (n < 0 ? '-' : '') + 'Rp ' + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const d6 = () => 1 + Math.floor(Math.random() * 6);
const isBuyable = i => !!BOARD[i] && ['city', 'station', 'utility', 'tourism'].includes(BOARD[i].type);
const NT = () => BOARD.length; // jumlah petak: 40 (WNI) atau 32 (Normal)
const jailPos = () => BOARD.findIndex(t => t.type === 'jail');
const tourismOf = pid => BOARD.filter((t, i) => t.type === 'tourism' && game.props[i].owner === pid && !game.props[i].lease).length;
const emptyHand = () => Object.fromEntries(Object.keys(POWERS).map(k => [k, 0]));
const addCard = (p, k) => { p.hand[k] = (p.hand[k] || 0) + 1; };
// Tanah ber-"Jalur Dinasti" kebal dari penyitaan, pembongkaran, dan perebutan.
const guarded = i => !!game.props[i].dynasty;
// Indeks kartu di tumpukan; 100 ke atas = Musibah Spesial.
const SPECIAL_BASE = 100;
const ULTRA_CARDS = [KESEMPATAN_ULTRA_RARE, KESEMPATAN_ULTRA_RARE_PEJABAT];
const isNormal = () => game.mode === 'normal';
const kesList = () => (isNormal() ? NORMAL_KESEMPATAN : KESEMPATAN);
const cardAt = (deck, idx) => idx < 0 ? ULTRA_CARDS[-idx - 1] : deck === 'kesempatan' ? kesList()[idx] : idx >= SPECIAL_BASE ? MUSIBAH_SPECIAL[idx - SPECIAL_BASE] : MUSIBAH[idx];
const USE_NAME = { tambang: 'tambang', sawit: 'kebun sawit', dapur: 'Dapur Gizi Gratis' };
// Tanah yang sudah dijadikan usaha (tidak bisa dibangun rumah lagi).
const isBiz = u => u === 'tambang' || u === 'sawit' || u === 'dapur';

function sanitizeLook(l) {
  l = l || {};
  const ids = list => list.map(o => o.id);
  return {
    model: ids(LOOKS.model).includes(l.model) ? l.model : l.model === 'bajaj' ? 'pesawat' : 'manusia',
    kulit: LOOKS.kulit.includes(l.kulit) ? l.kulit : LOOKS.kulit[1],
    baju: ids(LOOKS.baju).includes(l.baju) ? l.baju : 'kaos',
    topi: ids(LOOKS.topi).includes(l.topi) ? l.topi : 'none',
    aksesoris: ids(LOOKS.aksesoris).includes(l.aksesoris) ? l.aksesoris : 'none',
    rambut: ids(LOOKS.rambut).includes(l.rambut) ? l.rambut : 'pendek'
  };
}
const randomLook = () => sanitizeLook({
  model: pick(LOOKS.model).id,
  kulit: pick(LOOKS.kulit), baju: pick(LOOKS.baju).id, topi: pick(LOOKS.topi).id, aksesoris: pick(LOOKS.aksesoris).id, rambut: pick(LOOKS.rambut).id
});

/* ---------------- State ---------------- */
function freshProps() {
  const props = {};
  BOARD.forEach((t, i) => { if (isBuyable(i)) props[i] = bankProp(); });
  return props;
}
// use: null | 'properti' | 'tambang' | 'sawit'; closed = sisa giliran tambang ditutup
// grace = sisa gajian sebelum tambang/sawit bisa kena event acak
const bankProp = () => ({ owner: null, houses: 0, mortgaged: false, use: null, closed: 0, grace: 0, tlevel: 0 }); // tanpa blackout/slump/lease
// Semua kartu satu tumpukan, dikocok. Musibah Spesial ikut kalau krisis sudah dimulai.
function fullDeck(name, withSpecial) {
  const base = (name === 'kesempatan' ? kesList() : MUSIBAH).map((_, i) => i);
  if (name === 'musibah' && withSpecial) base.push(...MUSIBAH_SPECIAL.map((_, i) => SPECIAL_BASE + i));
  return shuffle(base);
}
const validCard = (name, idx) => (name === 'kesempatan' ? idx >= 0 && idx < kesList().length
  : (idx >= 0 && idx < MUSIBAH.length) || (idx >= SPECIAL_BASE && idx < SPECIAL_BASE + MUSIBAH_SPECIAL.length));

function newGame(keepPlayers, mode = 'wni', teams = false) {
  BOARD = boardFor(mode);
  const g = {
    version: VERSION,
    mode,
    boardSize: BOARD.length,
    phase: 'lobby',
    teams: !!teams && mode === 'normal',
    players: (keepPlayers || []).map(p => ({ id: p.id, name: p.name, color: p.color, look: p.look, photo: p.photo || 0, bot: !!p.bot, pendants: p.pendants || [], ...(p.soloColor ? { soloColor: p.soloColor } : {}) })),
    hostId: keepPlayers && keepPlayers.length ? keepPlayers[0].id : null,
    turn: 0, dice: [3, 4], diceSeq: 0, doubles: 0, rolled: false,
    pending: null, props: freshProps(), log: [],
    decks: null, festival: null, lastSlot: null,
    lastCard: null, announce: null, specialAdded: false, ultraDrawn: [], notices: [], winner: null, ranking: null, seq: 0, fx: [], fxSeq: 0, outSeq: 0
  };
  game = g; // fullDeck membaca mode dari game
  g.decks = { kesempatan: fullDeck('kesempatan', false), musibah: fullDeck('musibah', false) };
  return g;
}

let game = null;
game = load();
const online = new Map(); // pid -> jumlah koneksi aktif

function load() {
  try {
    const g = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    if (g && g.version === VERSION && Array.isArray(g.players) && g.props) {
      g.mode = g.mode || 'wni'; BOARD = boardFor(g.mode);
      if (g.mode === 'normal' && (g.boardSize || 40) !== BOARD.length) {
        console.log('Papan mode Normal sudah diganti. Permainan lama kembali ke lobi.');
        const ng = newGame(g.players, 'normal'); ng.hostId = g.hostId || ng.hostId; return ng;
      }
      for (const q of g.players) if (q.look && q.look.model === 'bajaj') q.look.model = 'pesawat';
      migrateBoard(g); console.log(`Melanjutkan permainan tersimpan (mode ${g.mode === 'normal' ? 'Normal' : 'WNI'}).`); return g;
    }
  } catch (e) { /* belum ada file */ }
  return newGame();
}
function migrateBoard(g) {
  for (const k of Object.keys(g.props)) {
    if (isBuyable(+k)) continue;
    const pr = g.props[k], owner = pr.owner && g.players.find(p => p.id === pr.owner);
    if (owner && !owner.bankrupt) {
      const refund = pr.mortgaged ? 0 : 200 * K;
      owner.money += refund;
      g.log.push({ t: Date.now(), msg: `Petak ${k} dihapus dari papan. ${owner.name} menerima ganti rugi ${rp(refund)}.` });
    }
    delete g.props[k];
  }
  BOARD.forEach((t, i) => { if (isBuyable(i) && !g.props[i]) g.props[i] = bankProp(); });
  if (!Array.isArray(g.notices)) g.notices = [];
  if (g.phase !== 'lobby' && !g.startedAt) g.startedAt = Date.now(); // save lama belum punya waktu mulai
  for (const k of Object.keys(g.props)) if (g.props[k].mortgaged && !g.props[k].mortgageValue) g.props[k].mortgageValue = BOARD[k].price / 2;
  if (!Array.isArray(g.ultraDrawn)) g.ultraDrawn = g.ultraDrawn ? [0] : [];
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { fs.writeFile(SAVE_FILE, JSON.stringify(game), () => {}); }, 400);
}
// Saat server dimatikan (Ctrl+C), simpan langsung supaya langkah terakhir tidak hilang. Permainan lanjut saat server dinyalakan lagi.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  clearTimeout(saveTimer);
  try { fs.writeFileSync(SAVE_FILE, JSON.stringify(game)); console.log('\nPermainan tersimpan. Jalankan lagi server untuk melanjutkan.'); } catch (e) { /* tetap keluar */ }
  process.exit(0);
});

const P = id => game.players.find(p => p.id === id);
const cur = () => game.players[game.turn];
const alive = () => game.players.filter(p => !p.bankrupt);
const isOnline = p => p.bot || (online.get(p.id) || 0) > 0;
let logCount = 0; // jumlah catatan yang pernah ditulis (game.log sendiri dipotong 150 terakhir)
function log(msg) { logCount++; game.log.push({ t: Date.now(), msg }); if (game.log.length > 150) game.log.shift(); }
// Lencana "liontin aktif" yang melayang di atas bidak pemiliknya (dilihat semua pemain).
// Lencana emas "skill aktif" untuk skill avatar.
function skillBadge(p) { const d = skillData(p); if (d && d.name && !game.notices.some(n => n.type === 'skill' && n.pid === p.id)) game.notices.push({ type: 'skill', pid: p.id, text: `${d.icon} ${d.name}` }); }
function pendantBadge(p, tag) { if (!game.notices.some(n => n.type === 'pendant' && n.pid === p.id && n.text === tag)) game.notices.push({ type: 'pendant', pid: p.id, text: tag }); }
function fx(type) { if (!game.fx.includes(type)) game.fx.push(type); }
// Notifikasi untuk pemain tertentu (suara + toast khusus di layarnya).
function notice(n) { game.notices.push(n); }

function publicState() {
  game.players.forEach(p => { if (p.money >= 0) p.debtTo = undefined; });
  return {
    phase: game.phase, hostId: game.hostId, turn: game.turn, dice: game.dice, diceSeq: game.diceSeq,
    doubles: game.doubles, rolled: game.rolled, pending: game.pending, props: game.props,
    log: game.log.slice(-60), lastCard: game.lastCard, announce: game.announce, specialAdded: game.specialAdded, winner: game.winner,
    ranking: game.ranking, winBy: game.winBy || null, winTeam: game.winTeam != null ? game.winTeam : null, seq: ++game.seq,
    // lama permainan (ms) dihitung server, supaya tidak bergantung jam di HP pemain
    elapsed: game.startedAt ? (game.endedAt || Date.now()) - game.startedAt : 0,
    mode: game.mode || 'wni', teams: !!game.teams, idleLeft: idleLeft(), tileFx: game.tileFx || null, festival: game.festival || null, lastSlot: game.lastSlot || null, fx: { seq: game.fxSeq, list: game.fx, notices: game.notices },
    players: game.players.map(p => ({ ...p, connected: isOnline(p) }))
  };
}
function broadcast() { touchIdle(); io.emit('state', publicState()); save(); scheduleBots(); }

/* ---------------- Waktu tunggu tiap giliran ----------------
 * Hitungan ulang setiap kali keadaan giliran berubah (giliran, dadu, keputusan yang menunggu, uang minus).
 * Pemain manusia yang diam lebih dari TURN_IDLE_SECONDS dijalankan otomatis dengan pilihan aman. */
// Batas diam untuk keadaan sekarang: Travelling (termasuk pindah sebaris) lebih longgar.
const idleLimit = () => (game.pending && game.pending.type === 'travel' ? TRAVEL_IDLE_SECONDS : TURN_IDLE_SECONDS) * 1000;
let idleSig = '', idleSince = Date.now();
function touchIdle() {
  const c = cur();
  const k = [game.phase, game.turn, c && c.id, game.rolled, JSON.stringify(game.pending), game.diceSeq, c && c.money < 0].join('|');
  if (k !== idleSig) { idleSig = k; idleSince = Date.now(); }
}
const idleLeft = () => { const c = cur(); return game.phase === 'playing' && c && !c.bot && !c.bankrupt ? Math.max(0, idleLimit() - (Date.now() - idleSince)) : null; };
// Aksi otomatis untuk pemain yang diam: [nama aksi, data, keterangan]
function idleAction(c) {
  const pend = game.pending;
  if (c.money < 0 && !(pend && pend.type === 'bill')) return canRaise(c) ? [...botRaiseCash(c), 'mencari uang untuk melunasi utang'] : ['bankrupt', {}, 'menyerah karena utang'];
  if (!pend) return !game.rolled ? ['roll', {}, 'dadu dilempar otomatis'] : ['endTurn', {}, 'giliran diselesaikan otomatis'];
  switch (pend.type) {
    case 'buy': case 'upgradeOffer': case 'startBuild': return ['skip', {}, 'dilewati otomatis'];
    case 'takeover': return ['takeover', { accept: false }, 'tawaran ambil alih dilewati'];
    case 'travel': return ['travel', { tile: c.pos }, 'tetap di tempat'];
    case 'slot': return ['slotPlay', { play: false }, 'Mesin Game dilewati'];
    case 'power': return ['keepCard', {}, 'kartu disimpan'];
    case 'cardRoll': return ['rollCard', { shield: false }, 'dadu kartu dilempar otomatis'];
    case 'fire': return ['fireChoice', { extinguish: c.money >= LAND.fireCost }, 'keputusan kebakaran otomatis'];
    case 'poison': return ['poisonChoice', { pay: c.money >= LAND.poisonFine }, 'keputusan keracunan otomatis'];
    case 'festival': {
      const mine = ownedBy(c.id).filter(i => BOARD[i].type === 'city' && !game.props[i].mortgaged).sort((a, b) => baseRent(b) - baseRent(a));
      return mine.length ? ['festival', { tile: mine[0] }, 'festival otomatis di ' + BOARD[mine[0]].name] : ['festival', { skip: true }, 'festival dilewati'];
    }
    case 'bill':
      if (c.money >= pend.amount) return ['payBill', {}, 'tagihan dibayar otomatis'];
      return canRaise(c) ? [...botRaiseCash(c), 'mencari uang untuk membayar tagihan'] : ['payBill', {}, 'tidak sanggup membayar'];
  }
  return null;
}
setInterval(() => {
  if (!game || game.phase !== 'playing') return;
  const c = cur();
  if (!c || c.bot || c.bankrupt || Date.now() - idleSince < idleLimit()) return;
  const a = idleAction(c);
  idleSince = Date.now(); // jeda lagi sebelum aksi otomatis berikutnya
  if (!a) return;
  log(`⏳ ${c.name} diam ${idleLimit() / 1000} detik: ${a[2]}`);
  runAction(c, a[0], a[1]);
}, 1000);

/* ---------------- Rules ---------------- */
function groupTiles(group) { return BOARD.map((t, i) => (t.group === group ? i : -1)).filter(i => i >= 0); }
function ownsGroup(pid, group) { return groupTiles(group).every(i => game.props[i].owner === pid); }
// Tanah yang boleh berpindah tangan lewat kartu / digadaikan: belum ada bangunan di petak itu.
function movable(i) { return isBuyable(i) && !(game.props[i].houses > 0); }
const ownedBy = pid => Object.keys(game.props).map(Number).filter(i => game.props[i].owner === pid);
// Masih punya sesuatu untuk dijual atau digadaikan ke bank?
// Sisa pokok yang masih bisa dipinjam dari bank.
const loanRoom = p => Math.max(0, BANK.maxLoan + pmod(p, 'loanLimit') - (p.loanPrincipal || 0));

/* ---------------- Liontin (mode Normal) ----------------
 * Daftarnya di pendants.json dan dibaca ulang otomatis saat file diubah. Tiap liontin boleh punya:
 *   stats   : { land, build, dice } tambahan diskon tanah / diskon bangun / kontrol dadu
 *   effects : [{ mod, value }]  pengubah angka: doubles, parity, tax, slotLuck, festivalStep, tourismRent, loanInterest, loanLimit
 *             [{ on, do, chance?, ... }]  efek saat kejadian. on: start, salary, afterRent, receiveRent, landStart, landOwn,
 *             landRival (berhenti di properti lawan), rivalLands (lawan berhenti di propertimu), build, jail, card, attacked,
 *             buildingLost, takeover (kamu mengambil alih), takenOver. do: money (amount), moneyPerProperty (amount, max), pctOfAmount (pct), travel, voucher,
 *             card (card: id | "random"), buildToken, landmark, levelUp, escape, block, blackout (turns), disaster, pull (range), makeLandmark (petak kejadian langsung jadi Landmark gratis).
 *             Tambahan "needLandmark": true = efek hanya jalan kalau petak kejadiannya Landmark.
 */
const PENDANT_FILE = path.join(__dirname, 'pendants.json');
const PENDANT_HOOKS = ['start', 'salary', 'afterRent', 'receiveRent', 'landStart', 'landOwn', 'landRival', 'rivalLands', 'build', 'jail', 'card', 'attacked', 'buildingLost', 'takeover', 'takenOver'];
const PENDANT_ACTIONS = ['money', 'moneyPerProperty', 'pctOfAmount', 'travel', 'voucher', 'card', 'buildToken', 'landmark', 'levelUp', 'escape', 'block', 'blackout', 'disaster', 'pull', 'makeLandmark'];
const PENDANT_MODS = ['doubles', 'parity', 'tax', 'slotLuck', 'festivalStep', 'tourismRent', 'loanInterest', 'loanLimit'];
const NORMAL_CARDS = ['bebassewa', 'bebaspajak', 'angel', 'sabotase', 'akuisisi', 'kontrak', 'gempa', 'badai', 'wabah', 'panggil', 'tukar'];
let PENDANTS = [];
function loadPendants() {
  let list;
  try { list = JSON.parse(fs.readFileSync(PENDANT_FILE, 'utf8')); } catch (e) { console.log('⚠ pendants.json tidak bisa dibaca: ' + e.message); return; }
  if (!Array.isArray(list)) { console.log('⚠ pendants.json harus berisi daftar (array).'); return; }
  const ok = [], seen = new Set();
  for (const x of list) {
    const bad = !x || typeof x.id !== 'string' || !x.name || seen.has(x.id) ? 'id/nama kosong atau dobel'
      : (x.effects || []).map(e => (e.mod ? (PENDANT_MODS.includes(e.mod) ? '' : 'mod "' + e.mod + '"')
        : !PENDANT_HOOKS.includes(e.on) ? 'on "' + e.on + '"' : !PENDANT_ACTIONS.includes(e.do) ? 'do "' + e.do + '"' : '')).filter(Boolean).join(', ');
    if (bad) { console.log(`⚠ Liontin ${(x && x.id) || '?'} dilewati: ${bad} tidak dikenal.`); continue; }
    seen.add(x.id); ok.push({ icon: '📿', desc: '', effects: [], ...x });
  }
  PENDANTS = ok;
  console.log(`Liontin dimuat: ${PENDANTS.length} item dari pendants.json`);
}
loadPendants();
fs.watchFile(PENDANT_FILE, { interval: 1500 }, () => { loadPendants(); if (typeof io !== 'undefined') io.emit('pendants', PENDANTS); });
// Efek visual sesaat di sebuah petak (dimainkan klien setelah bidak berhenti).
function tileFx(tile, kind) { game.tileFx = { seq: (game.tileFx ? game.tileFx.seq : 0) + 1, tile, kind }; }
// Landmark: kota tingkat 5 atau tempat wisata tingkat 3
const isLandmarkAt = i => { const pr = game.props[i], t = BOARD[i]; return !!pr && ((t.type === 'city' && pr.houses === 5) || (t.type === 'tourism' && (pr.tlevel || 0) >= 3)); };
const pendantsOf = p => (isNormal() && p && Array.isArray(p.pendants) ? p.pendants.map(id => PENDANTS.find(x => x.id === id)).filter(Boolean) : []);
const pstat = (p, k) => pendantsOf(p).reduce((a, x) => a + (+(x.stats || {})[k] || 0), 0);
// Nama liontin yang memberi pengubah "key" (untuk catatan permainan).
const pmodTag = (p, key) => { const x = pendantsOf(p).find(y => (y.effects || []).some(e => e.mod === key)); return x ? `${x.icon} ${x.name}` : ''; };
const pmod = (p, key) => pendantsOf(p).reduce((a, x) => a + (x.effects || []).filter(e => e.mod === key).reduce((b, e) => b + (+e.value || 0), 0), 0);
// Jalankan efek liontin untuk kejadian "on". Hasil berupa tanda (landmark, levelUp, escape, block) untuk pemanggil.
function pendantHook(p, on, ctx = {}) {
  const out = {};
  if (!p || p.bankrupt) return out;
  for (const x of pendantsOf(p)) for (const e of x.effects || []) {
    if (e.on !== on || (e.needLandmark && !isLandmarkAt(ctx.tile)) || (e.chance != null && !chance(+e.chance))) continue;
    const tag = `${x.icon} ${x.name}`, before = logCount;
    const money = amt => { amt = Math.round(amt / 1000) * 1000; if (amt > 0) receive(p, amt, tag); };
    switch (e.do) {
      case 'money': money(+e.amount || 0); break;
      case 'moneyPerProperty': money(Math.min(+e.max || Infinity, ownedBy(p.id).length * (+e.amount || 0))); break;
      case 'pctOfAmount': money((ctx.amount || 0) * (+e.pct || 0)); break;
      case 'travel': if (!game.pending && !p.inJail && cur() && cur().id === p.id) { game.pending = { type: 'travel' }; log(`${tag}: ${p.name} langsung travelling`); } break;
      case 'voucher': p.vouchers = (p.vouchers || 0) + 1; log(`${tag}: ${p.name} dapat voucher diskon 50%`); break;
      case 'card': { const k = e.card === 'random' || !POWERS[e.card] ? pick(NORMAL_CARDS) : e.card; addCard(p, k); log(`${tag}: ${p.name} dapat kartu ${POWERS[k].name}`); break; }
      case 'buildToken': if (!(p.buildTokens > 0)) { p.buildTokens = 1; log(`${tag}: bangunan berikutnya ${p.name} gratis`); } break;
      // ⚡ Pemadaman: petak lawan gelap beberapa giliran, siapa pun yang berhenti di sana bebas sewa.
      case 'blackout': {
        const pr = game.props[ctx.tile], o = P(pr.owner);
        if (!o || pr.blackout || shielded(o, p, x.name)) break;
        pr.blackout = { turns: +e.turns || 3 };
        tileFx(ctx.tile, 'blackout'); fx('seize');
        log(`${tag} (${p.name}): listrik ${BOARD[ctx.tile].name} milik ${o.name} padam ${pr.blackout.turns} giliran. Siapa pun yang berhenti di sana bebas sewa`);
        break;
      }
      // 🌋 Bencana alam: properti lawan turun satu tingkat (Landmark jadi Kabupaten); tanah kosong lepas ke negara.
      case 'disaster': {
        const i = ctx.tile, pr = game.props[i], o = P(pr.owner), t = BOARD[i];
        if (!o || t.type !== 'city' || pr.lease || guarded(i) || isBiz(pr.use) || shielded(o, p, x.name)) break; // Landmark juga bisa kena (turun jadi Kabupaten)
        tileFx(i, 'disaster'); fx('musibah');
        if (pr.houses > 0) {
          const was = pr.houses;
          pendantHook(o, 'buildingLost', { amount: t.house * stepUnits(was) });
          pr.houses = levelDown(was);
          log(`${tag} (${p.name}): bencana alam di ${t.name}! ${levelName(was)} milik ${o.name} turun jadi ${pr.houses ? levelName(pr.houses) : 'tanah kosong'}`);
        } else {
          Object.assign(pr, bankProp()); delete pr.slump; delete pr.blackout;
          if (game.festival && game.festival.tile === i) game.festival = null;
          log(`${tag} (${p.name}): bencana alam di ${t.name}! Tanah milik ${o.name} hilang dan kembali jadi milik negara`);
        }
        break;
      }
      // 🏛️ Petak kejadian (kota milikmu) langsung jadi Landmark tanpa biaya
      case 'makeLandmark': {
        const pr = game.props[ctx.tile];
        if (!pr || BOARD[ctx.tile].type !== 'city' || pr.owner !== p.id || pr.houses >= 5) break;
        pr.houses = 5; pr.use = 'properti'; fx('build');
        log(`${tag}: ${BOARD[ctx.tile].name} langsung direnovasi jadi 🏛️ Landmark gratis!`);
        break;
      }
      // 🌀 Tarik lawan di sekitar petak ini (maju/mundur sejauh range) ke propertimu, lalu tagih sewanya.
      case 'pull': {
        const i = ctx.tile, R = +e.range || 3, N = NT();
        const near = alive().filter(o => o.id !== p.id && (!ctx.by || o.id !== ctx.by.id) && !sameTeam(o, p) && !o.inJail && o.pos !== i
          && Math.min((o.pos - i + N) % N, (i - o.pos + N) % N) <= R);
        if (!near.length) break;
        const rent = calcRent(i);
        tileFx(i, 'pull'); fx('seize');
        for (const o of near) { o.pos = i; log(`${tag} (${p.name}): ${o.name} tertarik ke ${BOARD[i].name}`); pay(o, p, rent, 'sewa ' + BOARD[i].name); }
        break;
      }
      default: out[e.do] = tag;
    }
    // efek yang benar-benar terjadi (menulis catatan) atau tanda yang langsung dipakai pemanggil
    if (logCount !== before || (e.do in out && e.do !== 'levelUp')) pendantBadge(p, tag);
  }
  return out;
}
// Masih punya aset yang belum digadai = masih bisa cari uang (gadai, jual bangunan, atau pinjam bank dengan jaminan).
// Semua aset sudah digadai dan uang tidak cukup = satu-satunya jalan adalah bangkrut.
const hasCollateral = p => ownedBy(p.id).some(i => !game.props[i].mortgaged);
const canRaise = p => hasCollateral(p);
// Nilai gadai = setengah dari harga tanah + bangunan + biaya usaha (tambang/sawit/dapur).
const bizCost = u => ({ tambang: LAND.tambangCost, sawit: LAND.sawitCost, dapur: LAND.dapurCost }[u] || 0);
const assetValue = i => { const t = BOARD[i], pr = game.props[i]; return t.price + pr.houses * (t.house || 0) + bizCost(pr.use); };
const mortgageValue = i => Math.round(assetValue(i) / 2);
const byCash = () => alive().slice().sort((a, b) => b.money - a.money);

// Sewa termasuk pengali Festival (mode Normal).
function calcRent(i) {
  const f = game.festival && game.festival.tile === i ? game.festival.mult : 1;
  if (game.props[i] && game.props[i].blackout) return 0; // petak padam: bebas sewa
  const slump = game.props[i] && game.props[i].slump ? NORMAL.slumpMult : 1;
  return Math.round(baseRent(i) * f * slump / 1000) * 1000;
}
function baseRent(i) {
  const t = BOARD[i], pr = game.props[i];
  // Punya semua kota sewarna: semua sewanya x2 (tanah kosong maupun yang sudah dibangun).
  if (t.type === 'city') return t.rent[pr.houses] * (ownsGroup(pr.owner, t.group) ? 2 : 1);
  const owned = BOARD.filter((b, j) => b.type === t.type && game.props[j].owner === pr.owner).length;
  if (t.type === 'station') return 25 * K * Math.pow(2, owned - 1);
  if (t.type === 'tourism') return Math.round(t.price * NORMAL.tourismRent * NORMAL.tourismLevelMult[pr.tlevel || 0] * owned * (1 + pmod(P(pr.owner), 'tourismRent')) / 1000) * 1000;
  const sum = game.dice[0] + game.dice[1];
  return sum * (owned >= 2 ? 10 : 4) * K;
}

function pay(from, to, amount, reason) {
  if (amount <= 0) return;
  from.money -= amount;
  fx('pay');
  if (to && to.inJail) {
    log(`${from.name} membayar ${rp(amount)} (${reason}). ${to.name} sedang dipenjara, uangnya masuk kas negara.`);
    to = null;
  } else {
    if (to) to.money += amount;
    log(`${from.name} membayar ${rp(amount)}${to ? ' ke ' + to.name : ''} (${reason})`);
  }
  if (from.money < 0) {
    from.debtTo = to ? to.id : null;
    log(`⚠ ${from.name} terlilit utang ${rp(-from.money)}. Gadaikan aset ke bank untuk melunasi.`);
  }
}
function receive(p, amount, reason) { if (amount <= 0) return; p.money += amount; fx('cash'); log(`${p.name} menerima ${rp(amount)} (${reason})`); }

// Pilihan upgrade tanah kota milik sendiri. Tidak perlu punya satu warna lengkap.
// Usaha baru dapat masa aman hanya kalau pemiliknya belum gajian 2 kali.
const newBizGrace = p => ((p.laps || 0) < LAND.graceLaps ? LAND.graceLaps : 0);

// Stat avatar pemain (lihat AVATAR_STATS di board.js).
const modelOf = p => (p.look && p.look.model) || 'manusia';
// Mode Normal: modal sama untuk semua, stat & skill dari NORMAL_AVATARS. Mode WNI: AVATAR_STATS.
const statsOf = p => {
  if (!isNormal()) return AVATAR_STATS[modelOf(p)] || AVATAR_STATS.manusia;
  const st = { ...(NORMAL_AVATARS[modelOf(p)] || NORMAL_AVATARS.manusia), start: NORMAL.startMoney };
  for (const k of ['land', 'build', 'dice']) st[k] = Math.min(0.9, (st[k] || 0) + pstat(p, k));
  return st;
};
const skillOf = p => (isNormal() ? (NORMAL_AVATARS[modelOf(p)] || {}).skill : null);
const skillData = p => NORMAL_AVATARS[modelOf(p)] || {};
const skillHit = p => chance(skillData(p).chance || 0); // peluang skill avatar aktif (lihat NORMAL_AVATARS)
const chance = pct => Math.random() < pct;
const discounted = (amount, pct) => Math.round(amount * (1 - pct) / 1000) * 1000;
const landPrice = (p, i) => discounted(BOARD[i].price, statsOf(p).land);

// Mode Normal: Tanah (0) → Desa (1) → Kota (2) → Kabupaten (3) → Landmark (5). Tingkat 4 tidak dipakai.
// Sebelum melewati Mulai 1 kali paling tinggi Kota; Landmark hanya dari Kabupaten yang dikunjungi lagi (atau dari Mulai).
const maxLevel = p => ((p.laps || 0) >= NORMAL.lapsForBigBuild ? 3 : 2);
const levelName = h => NORMAL.levels[h] || h + ' rumah';
const stepUnits = h => (isNormal() && h === 5 ? NORMAL.landmarkHouses : 1); // harga tingkat h, dalam satuan "1 rumah"
const levelDown = h => (isNormal() && h === 5 ? 3 : h - 1);
function buildCost(p, i, from, to) {
  let units = 0;
  for (let h = from + 1; h <= to; h++) if (h !== 4 || !isNormal()) units += stepUnits(h);
  return discounted(BOARD[i].house * units, statsOf(p).build);
}

function upgradeOptions(p, i) {
  const t = BOARD[i], pr = game.props[i];
  if (!t || t.type !== 'city' || !pr || pr.owner !== p.id || pr.mortgaged) return [];
  if (isBiz(pr.use)) return [];
  if (isNormal()) {
    if (pr.houses >= 5) return [];
    if (pr.houses === 3) return [{ kind: 'properti', level: 5, cost: buildCost(p, i, 3, 5) }];
    const opts = [];
    for (let L = pr.houses + 1; L <= maxLevel(p); L++) opts.push({ kind: 'properti', level: L, cost: buildCost(p, i, pr.houses, L) });
    return opts;
  }
  const opts = [];
  if (pr.houses < 5) opts.push({ kind: 'properti', cost: t.house });
  if (pr.houses === 0) opts.push({ kind: 'tambang', cost: LAND.tambangCost }, { kind: 'sawit', cost: LAND.sawitCost }, { kind: 'dapur', cost: LAND.dapurCost });
  const d = statsOf(p).build;
  return opts.map(o => ({ ...o, cost: discounted(o.cost, d) }));
}
// Tambang / kebun sawit yang menghasilkan: tidak digadai dan tambangnya tidak sedang ditutup.
const producing = p => ownedBy(p.id).filter(i => { const pr = game.props[i]; return (pr.use === 'tambang' || pr.use === 'sawit') && !pr.mortgaged && !(pr.closed > 0); });
// Gajian: gaji pokok + hasil tambang/sawit, dapat voucher upgrade tanah, dan hitung putaran.
function paySalary(p) {
  const n = producing(p).length;
  for (const i of ownedBy(p.id)) if (game.props[i].grace > 0) game.props[i].grace--;
  const base = isNormal() ? NORMAL.salary + (skillOf(p) === 'panen' ? skillData(p).amount : 0) : SALARY + n * LAND.income;
  receive(p, base, n ? `gaji + hasil ${n} tambang/kebun sawit` : skillOf(p) === 'panen' ? 'gaji + 🌾 Panen Raya' : 'gaji satu putaran');
  if (skillOf(p) === 'panen') skillBadge(p);
  notice({ type: 'payday', to: p.id, amount: base });
  if (p.loan > 0) {
    const amt = Math.min(BANK.loanRepay, p.loan);
    p.loan -= amt; p.loanPrincipal = p.loan > 0 ? Math.min(p.loanPrincipal || 0, p.loan) : 0;
    pay(p, null, amt, 'cicilan pinjaman bank');
    log(p.loan > 0 ? `🏦 Sisa pinjaman bank ${p.name}: ${rp(p.loan)}` : `🏦 Pinjaman bank ${p.name} lunas`);
  }
  p.laps = (p.laps || 0) + 1;
  if (isNormal()) { pendantHook(p, 'salary'); return; }
  p.vouchers = Math.min(LAND.maxVouchers, (p.vouchers || 0) + 1);
  log(`🎟️ ${p.name} dapat voucher subsidi: diskon ${Math.round(LAND.kprDiscount * 100)}% untuk 1 upgrade tanah`);
  maybeAddSpecial();
}
function maybeAddSpecial() {
  if (isNormal() || game.specialAdded || !alive().every(q => (q.laps || 0) >= LAND.specialAfterLaps)) return;
  game.specialAdded = true;
  const deck = game.decks.musibah;
  // sisipkan di paruh depan tumpukan supaya cepat muncul
  for (const k of shuffle(MUSIBAH_SPECIAL.map((_, i) => SPECIAL_BASE + i))) deck.splice(Math.floor(Math.random() * Math.ceil(deck.length / 2)), 0, k);
  game.announce = { seq: (game.announce ? game.announce.seq : 0) + 1, icon: '☠️', title: 'Krisis Dimulai',
    text: `Semua pemain sudah gajian ${LAND.specialAfterLaps} kali. ${MUSIBAH_SPECIAL.length} kartu Musibah Spesial yang sangat berat kini masuk ke tumpukan Musibah. Semoga kuat.` };
  fx('musibah');
  log('☠️ Krisis dimulai! Kartu Musibah Spesial masuk ke tumpukan.');
}

function sendToJail(p) {
  p.pos = jailPos(); p.inJail = true; p.jailTurns = 0;
  if (cur() && cur().id === p.id) { game.doubles = 0; game.rolled = true; }
  fx('jail');
  log(`🔒 ${p.name} masuk penjara`);
  const key = pendantHook(p, 'jail').escape;
  if (key) { p.inJail = false; log(`${key}: ${p.name} langsung bebas`); }
}

function moveBy(p, steps) {
  const np = (p.pos + steps) % NT();
  const passed = new Set(Array.from({ length: Math.max(0, steps - 1) }, (_, k) => (p.pos + k + 1) % NT()));
  if (np < p.pos) paySalary(p);
  p.pos = np;
  log(`${p.name} tiba di ${BOARD[np].name}`);
  if (skillOf(p)) passSkills(p, passed, np);
  resolveTile(p);
  // 🧳 Jalan-jalan: petak yang tidak menagih bisa berubah jadi Travelling.
  if (!game.pending) maybeJalan(p);
}
// ✈️ Terbang Bebas (Pesawat): setelah berhenti di petak yang tidak menagih (termasuk setelah selesai
// membeli / melewatkan tanah kosong atau bangun di tanah sendiri). Setelah aktif, istirahat 1 giliran.
function maybeJalan(p) {
  if (skillOf(p) !== 'jalan' || p.jalanCd > 0 || game.pending || p.inJail || isOthersLand(p, p.pos) || !skillHit(p)) return;
  skillBadge(p);
  p.jalanCd = 2; // berkurang 1 di awal tiap giliran: giliran berikutnya belum bisa, giliran sesudahnya bisa lagi
  game.pending = { type: 'travel' };
  log(`✈️ ${p.name} Terbang Bebas! Bebas pilih tujuan`);
}
// Tawarkan ambil alih kota lawan kalau syaratnya terpenuhi (mode Normal).
// 🤝 Raja Akuisisi (Manusia) satu-satunya yang boleh mengambil alih Landmark.
// Setelah keputusan selesai, lanjutkan Travelling yang tertunda.
function resumeTravel(pend, p) {
  if (!pend || !pend.thenTravel || game.pending) return;
  game.pending = { type: 'travel' };
  log(`✈️ ${p.name} lanjut travelling, bebas pilih tujuan`);
}
function offerTakeover(p, i) {
  const pr = game.props[i], o = pr && P(pr.owner);
  if (!isNormal() || !o || o.id === p.id || sameTeam(o, p) || pr.lease || BOARD[i].type !== 'city' || (pr.houses >= 5 && skillOf(p) !== 'nego')) return;
  const price = takeoverPrice(p, i);
  if (p.money < price && !(p.vouchers > 0 && p.money >= Math.round(price / 2 / 1000) * 1000)) return;
  // Travelling (mis. dari Tiket Pesawat) tidak batal: ditunda sampai keputusan ambil alih selesai.
  const thenTravel = !!(game.pending && game.pending.type === 'travel');
  game.pending = { type: 'takeover', tile: i, price, value: assetValue(i), ...(thenTravel ? { thenTravel } : {}) };
}
// Harga ambil alih = 2x nilai tanah + bangunan (skill Raja Akuisisi 1,5x, dan hanya dia yang bisa mengambil alih Landmark).
const takeoverPrice = (p, i) => Math.round(assetValue(i) * (skillOf(p) === 'nego' ? NORMAL.negoMult : NORMAL.takeoverMult) / 1000) * 1000;
const isOthersLand = (p, i) => isBuyable(i) && game.props[i].owner && game.props[i].owner !== p.id;
// Skill yang aktif saat bidak melewati lawan (Seret Lawan, Tarik Setoran, Colong Duit).
// Colong Duit juga berlaku untuk lawan di petak tujuan (bukan hanya yang dilewati).
function passSkills(p, passed, dest) {
  const sk = skillOf(p);
  for (const o of alive().filter(o => o.id !== p.id && !sameTeam(o, p) && !o.inJail && (passed.has(o.pos) || (sk === 'colong' && o.pos === dest)))) {
    if (sk === 'setoran') { pay(o, p, skillData(p).amount, '🚐 setoran angkot'); skillBadge(p); }
    else if (sk === 'colong' && skillHit(p)) {
      const sd = skillData(p), amt = Math.min(sd.cap || 100 * K, Math.round(Math.max(0, o.money) * (sd.pct || 0.1) / 1000) * 1000);
      if (amt > 0) { pay(o, p, amt, '👶 dicolong tuyul'); fx('seize'); skillBadge(p); }
    } else if (sk === 'seret' && !p.seretDone && skillHit(p)) {
      const best = ownedBy(p.id).filter(i => !game.props[i].mortgaged).sort((a, b) => calcRent(b) - calcRent(a))[0];
      if (best == null) continue;
      o.pos = best; fx('seize'); skillBadge(p); p.seretDone = true;
      log(`🪢 ${p.name} menyeret ${o.name} ke ${BOARD[best].name}`);
      pay(o, p, calcRent(best), 'sewa ' + BOARD[best].name);
    }
  }
}

// Petak tempat bidak berhenti. Sewa dan pajak jadi tagihan yang harus dibayar lewat tombol.
function resolveTile(p) {
  const i = p.pos, t = BOARD[i];
  if (isBuyable(i)) {
    const pr = game.props[i];
    // properti lawan saja: bukan milik sendiri (termasuk yang sedang kamu kontrakkan ke orang lain) dan bukan milik rekan setim
    const ro = realOwner(i);
    if (pr.owner && pr.owner !== p.id && ro !== p.id && !sameTeam(P(ro), p) && !sameTeam(P(pr.owner), p) && !pr.mortgaged) pendantHook(p, 'landRival', { tile: i });
    if (pr.owner == null) {
      game.pending = { type: 'buy', tile: i, price: landPrice(p, i) };
    } else if (pr.owner === p.id) {
      if (pr.blackout) { delete pr.blackout; tileFx(i, 'restore'); log(`💡 ${p.name} menyalakan lagi listrik di ${t.name}`); }
      const by = pendantHook(p, 'landOwn', { tile: i }).levelUp;
      if (t.type === 'city' && !pr.lease && pr.houses < 3 && !isBiz(pr.use)) {
        if (by) { pendantBadge(p, by); pr.houses++; pr.use = 'properti'; fx('build'); log(`${by}: ${t.name} milik ${p.name} naik jadi ${levelName(pr.houses)} gratis`); }
      }
      if (t.type === 'tourism' && !pr.lease && (pr.tlevel || 0) < 3) {
        pr.tlevel = (pr.tlevel || 0) + 1;
        fx('build');
        log(`🏝️ ${p.name} berkunjung ke ${t.name}: wisatanya naik jadi ${NORMAL.tourismLevels[pr.tlevel]}${pr.tlevel === 3 ? ' 🏛️' : ''}`);
      }
      if (upgradeOptions(p, i).length) game.pending = { type: 'upgradeOffer', tile: i };
    } else if (sameTeam(P(pr.owner), p)) {
      log(`🤝 ${p.name} singgah di ${t.name} milik rekan setim, bebas sewa`);
    } else if (pr.blackout) {
      log(`⚡ ${t.name} sedang padam, ${p.name} bebas sewa`);
      if (!pr.mortgaged) offerTakeover(p, i); // tetap boleh diambil alih walau padam
    } else if (pr.owner !== p.id && !pr.mortgaged) {
      const owner = P(pr.owner);
      if (owner && !owner.bankrupt) {
        let amount = calcRent(i), note = '';
        if (skillOf(owner) === 'gentayangan' && skillHit(owner)) { const m = skillData(owner).mult || 2; skillBadge(owner); amount = Math.round(amount * m / 1000) * 1000; note = ` (👻 digentayangi, sewa ${String(m).replace('.', ',')}×)`; }
        if (skillOf(p) === 'teror' && skillHit(p)) { skillBadge(p); log(`👾 ${p.name} meneror ${owner.name}, sewa ${t.name} tidak dibayar`); fx('seize'); return; }
        if (skillOf(p) === 'mulus' && skillHit(p)) { skillBadge(p); amount = Math.round(amount / 2 / 1000) * 1000; note += ' (🐾 mendarat mulus, sewa ½)'; }
        game.pending = { type: 'bill', tile: i, to: owner.id, amount, reason: 'Sewa ' + t.name };
        log(`${p.name} berhenti di tanah milik ${owner.name}: sewa ${rp(amount)}${note}`);
        pendantHook(owner, 'rivalLands', { tile: i, by: p });
      }
    }
    return;
  }
  if (t.type === 'start') pendantHook(p, 'landStart');
  if (t.type === 'start' && isNormal() && ownedBy(p.id).some(j => upgradeOptions(p, j).length)) {
    game.pending = { type: 'startBuild' };
    log(`🏁 ${p.name} berhenti tepat di Mulai: boleh membangun di salah satu propertinya`);
    return;
  }
  if (t.type === 'tax' && p.hand.bebaspajak > 0) { p.hand.bebaspajak--; log(`🧾 ${p.name} memakai Bebas Pajak di ${t.name}`); fx('shield'); }
  else if (t.type === 'tax') {
    // Pajak dinamis: makin banyak properti, makin besar pajaknya
    const n = ownedBy(p.id).filter(j => !game.props[j].mortgaged).length;
    const m = Math.max(0, 1 + pmod(p, 'tax'));
    const amount = Math.round((t.amount + n * TAX_PER_PROPERTY) * m / 1000) * 1000;
    game.pending = { type: 'bill', tile: i, to: null, amount, reason: `${t.name} (${n} properti)` + (m < 1 ? ` (${pmodTag(p, 'tax')})` : '') };
  }
  else if (t.type === 'gotojail') sendToJail(p);
  else if (t.type === 'festival') {
    if (ownedBy(p.id).some(i => BOARD[i].type === 'city' && !game.props[i].mortgaged)) game.pending = { type: 'festival' };
    else log(`🎪 ${p.name} belum punya kota untuk mengadakan festival`);
  }
  else if (t.type === 'slot') game.pending = { type: 'slot' };
  else if (t.type === 'travel') { game.pending = { type: 'travel' }; log(`🧳 ${p.name} sedang travelling, bebas pilih tujuan`); }
  else if (t.type === 'kesempatan' || t.type === 'musibah') drawCard(p, t.type);
}

function drawCard(p, deckName) {
  // Kartu yang sudah keluar tidak muncul lagi sampai seluruh tumpukan habis.
  let deck = game.decks[deckName].filter(i => validCard(deckName, i));
  if (!deck.length) {
    deck = fullDeck(deckName, game.specialAdded);
    log(`🔀 Semua kartu ${deckName === 'kesempatan' ? 'Kesempatan' : 'Musibah'} sudah keluar. Tumpukan dikocok ulang.`);
  }
  let idx = deck.shift();
  game.decks[deckName] = deck;
  // Ultra rare: peluang kecil, tiap kartu paling banyak sekali per permainan
  const ultraLeft = ULTRA_CARDS.map((_, k) => k).filter(k => !game.ultraDrawn.includes(k));
  if (!isNormal() && deckName === 'kesempatan' && ultraLeft.length && Math.random() < ULTRA_RARE_CHANCE) {
    const k = pick(ultraLeft); game.ultraDrawn.push(k); idx = -k - 1; fx('ultra');
  }
  const card = cardAt(deckName, idx);
  const def = card.power ? POWERS[card.power] : card;
  game.lastCard = {
    deck: deckName, title: def.name || def.title, icon: def.icon, text: card.power ? def.desc : card.text, power: card.power || null,
    left: game.decks[deckName].length,
    scope: card.scope || null, special: !!card.special, ultra: !!card.ultraRare, tiers: card.tiers ? card.tiers.map(t => t.text) : null, roll: null, shielded: false,
    player: p.id, seq: (game.lastCard ? game.lastCard.seq : 0) + 1
  };
  log(`${p.name} membuka kartu ${deckName === 'kesempatan' ? 'Kesempatan' : 'Musibah'}: ${game.lastCard.title}`);
  if (deckName === 'kesempatan') pendantHook(p, 'card');
  if (card.power) {
    if (!powerUsableNow(p, card.power)) {
      addCard(p, card.power);
      log(`${p.name} menyimpan kartu ${def.name}`);
    } else game.pending = { type: 'power', card: card.power };
    return;
  }
  // Kartu spesial bertingkat: kocok dadu. Musibah pribadi: tanya dulu kalau punya Doa Orang Tua.
  if (card.tiers || (deckName === 'musibah' && card.scope === 'self' && p.hand.doa > 0)) { game.pending = { type: 'cardRoll', deck: deckName, idx }; return; }
  applyCard(p, card, card.effects);
}
function applyCard(p, card, effects) {
  const victims = card.scope === 'all' ? [p, ...alive().filter(o => o.id !== p.id)] : [p];
  for (const v of victims) if (!v.bankrupt) applyEffects(v, effects, card.title, p);
}

// Kartu dadu: kocok 1 dadu, hasil 1–2 / 3–4 / 5–6. Musibah pribadi bisa ditolak dengan Doa Orang Tua.
function resolveCardRoll(p, pend, shield) {
  const card = cardAt(pend.deck, pend.idx), lc = game.lastCard;
  game.pending = null;
  if (shield) {
    p.hand.doa--;
    if (lc) lc.shielded = true;
    fx('shield');
    log(`🙏 Doa Orang Tua menolak musibah "${card.title}" untuk ${p.name}`);
    return;
  }
  if (!card.tiers) { applyCard(p, card, card.effects); return; }
  const n = d6(), tier = card.tiers[Math.floor((n - 1) / 2)];
  if (lc) lc.roll = n;
  fx('dice1');
  log(`🎲 ${p.name} mengocok dadu kartu: ${n}. ${tier.text}`);
  applyCard(p, card, tier.effects);
}

function powerUsableNow(p, card) {
  if (card === 'orangdalam') return p.inJail && !game.rolled;
  if (card === 'buzzer') return alive().some(o => o.id !== p.id);
  if (card === 'mafia') return mafiaTargets(p).length > 0;
  if (card === 'dinasti') return ownedBy(p.id).some(i => !guarded(i));
  if (card === 'angel' || card === 'bebassewa' || card === 'bebaspajak') return false; // disimpan untuk nanti
  if (card === 'wabah') return rivalsOf(p).length > 0;
  if (card === 'panggil') return rivalsOf(p).length > 0 && myBestRent(p) != null;
  if (card === 'tukar') return mySwappable(p).length > 0 && normalTargets(p, 'tukar').length > 0;
  if (card === 'gempa' || card === 'badai') return normalTargets(p, card).length > 0;
  if (['sabotase', 'akuisisi', 'kontrak'].includes(card)) return normalTargets(p, card).length > 0;
  return true;
}
function mafiaTargets(p) {
  return Object.keys(game.props).map(Number).filter(i => {
    const o = game.props[i].owner && P(game.props[i].owner);
    return o && o.id !== p.id && !o.bankrupt && movable(i) && !guarded(i);
  });
}

function applyEffects(p, effects, reason, drawer) {
  for (const e of effects) {
    let targets = [p];
    if (e.who === 'richest' || e.who === 'poorest' || e.who === 'richestOther') {
      if (drawer && p.id !== drawer.id) continue; // sasaran khusus cukup dihitung sekali
      const list = e.who === 'richestOther' ? byCash().filter(o => o.id !== p.id) : byCash();
      targets = [e.who === 'poorest' ? list[list.length - 1] : list[0]].filter(Boolean);
    }
    for (const t of targets) applyEffect(t, e, reason, drawer || p);
  }
}

function applyEffect(p, e, reason, drawer) {
  switch (e.type) {
    case 'stealBest': {
      const i = ownedBy(p.id).filter(i => movable(i) && !guarded(i)).sort((a, b) => BOARD[b].price - BOARD[a].price)[0];
      if (i == null || !drawer || drawer.id === p.id) { log(`${p.name} tidak punya tanah yang bisa direbut`); break; }
      game.props[i].owner = drawer.id;
      fx('seize');
      log(`👑 ${drawer.name} merebut ${BOARD[i].name} dari ${p.name}`);
      break;
    }
    case 'none': break;
    case 'pay': pay(p, null, e.amount * K, reason); break;
    case 'receive': receive(p, e.amount * K, reason); break;
    case 'forward': moveBy(p, e.n); break;
    // Bebas pindah ke petak mana saja di baris (sisi papan) tempat pemain berada
    case 'travelRow': game.pending = { type: 'travel', row: Math.floor(p.pos / (NT() / 4)) }; log(`🧭 ${p.name} bebas pindah ke petak mana saja di baris ini`); break;
    case 'nextSlot': {
      const k = [...Array(NT()).keys()].map(d => (p.pos + d + 1) % NT()).find(i => BOARD[i].type === 'slot');
      if (k != null) moveBy(p, (k - p.pos + NT()) % NT());
      break;
    }
    case 'voucher': p.vouchers = (p.vouchers || 0) + 1; log(`🏷️ ${p.name} dapat voucher diskon 50% untuk bangun atau ambil alih`); break;
    case 'back': p.pos = (p.pos - e.n + NT()) % NT(); log(`${p.name} mundur ke ${BOARD[p.pos].name}`); resolveTile(p); break;
    case 'goto': {
      if (e.tile < p.pos) paySalary(p);
      p.pos = e.tile; log(`${p.name} pindah ke ${BOARD[e.tile].name}`); resolveTile(p); break;
    }
    case 'jail': sendToJail(p); break;
    case 'skip': p.skip = (p.skip || 0) + e.n; log(`⏸ ${p.name} tidak bisa jalan ${e.n} giliran`); break;
    case 'pct': {
      const cost = Math.round(Math.max(0, p.money) * e.pct / 100 / 1000) * 1000;
      if (cost > 0) pay(p, null, cost, `${reason}, ${e.pct}%`); else log(`Kas ${p.name} sudah kosong`);
      break;
    }
    case 'perProp': {
      const n = ownedBy(p.id).length;
      if (n) pay(p, null, n * e.amount * K, `${reason}, ${n} properti`); else log(`${p.name} tidak punya properti, lolos`);
      break;
    }
    case 'perPropIn': {
      const n = ownedBy(p.id).filter(i => (e.groups || []).includes(BOARD[i].group) || (e.tiles || []).includes(i)).length;
      if (n) pay(p, null, n * e.amount * K, `${reason}, ${n} tanah`);
      break;
    }
    case 'repairs': {
      let h = 0, ho = 0;
      for (const pr of Object.values(game.props)) if (pr.owner === p.id) { if (pr.houses === 5) ho++; else h += pr.houses; }
      const cost = (h * e.house + ho * e.hotel) * K;
      if (cost > 0) pay(p, null, cost, reason);
      break;
    }
    case 'payEach': alive().filter(o => o.id !== p.id).forEach(o => pay(p, o, e.amount * K, reason)); break;
    case 'collectEach': alive().filter(o => o.id !== p.id).forEach(o => pay(o, p, e.amount * K, reason)); break;
    case 'seize': case 'seizeBest': {
      const list = ownedBy(p.id).filter(i => movable(i) && !guarded(i));
      if (!list.length) { pay(p, null, e.fine * K, reason); break; }
      const i = e.type === 'seizeBest' ? list.sort((a, b) => BOARD[b].price - BOARD[a].price)[0] : pick(list);
      game.props[i] = bankProp();
      fx('seize');
      log(`🏛️ ${BOARD[i].name} milik ${p.name} diambil negara dan kembali ke bank`);
      break;
    }
    case 'perLand': {
      const n = ownedBy(p.id).filter(i => game.props[i].use === 'tambang' || game.props[i].use === 'sawit').length;
      if (n) pay(p, null, n * e.amount * K, `${reason}, ${n} tambang/sawit`);
      break;
    }
    case 'closeMines':
      for (const i of ownedBy(p.id)) if (game.props[i].use === 'tambang') { game.props[i].closed = Math.max(game.props[i].closed || 0, e.turns); log(`⛏️ Tambang di ${BOARD[i].name} ditutup ${e.turns} giliran`); }
      break;
    case 'burnAll': for (const i of ownedBy(p.id)) burn(i); break;
    case 'seizeLand': {
      const list = ownedBy(p.id).filter(i => (game.props[i].use === 'tambang' || game.props[i].use === 'sawit') && !guarded(i));
      if (!list.length) break;
      const i = pick(list);
      log(`🚫 ${USE_NAME[game.props[i].use]} ${p.name} di ${BOARD[i].name} dicabut izinnya dan disita negara`);
      game.props[i] = bankProp(); fx('seize');
      break;
    }
    case 'seizeMortgaged': {
      const list = ownedBy(p.id).filter(i => game.props[i].mortgaged && !guarded(i));
      list.forEach(i => { game.props[i] = bankProp(); });
      if (list.length) { fx('seize'); log(`🏦 Bank menyita ${list.length} properti gadaian milik ${p.name}`); }
      break;
    }
    case 'landgrab': {
      const list = ownedBy(p.id).filter(i => movable(i) && !guarded(i)), others = alive().filter(o => o.id !== p.id);
      if (!list.length || !others.length) { pay(p, null, e.fine * K, reason); break; }
      const i = pick(list), to = pick(others);
      game.props[i].owner = to.id;
      fx('seize');
      log(`🕴️ ${BOARD[i].name} milik ${p.name} diserobot mafia tanah, sekarang dikuasai ${to.name}`);
      break;
    }
    case 'demolish': {
      for (let k = 0; k < (e.n || 1); k++) {
        const built = ownedBy(p.id).filter(i => game.props[i].houses > 0 && !guarded(i));
        if (!built.length) break;
        const i = built.sort((x, y) => game.props[y].houses - game.props[x].houses)[0];
        const was = game.props[i].houses;
        game.props[i].houses = levelDown(was);
        pendantHook(p, 'buildingLost', { amount: BOARD[i].house * stepUnits(was) });
        fx('seize');
        log(isNormal() ? `🚜 ${levelName(was)} di ${BOARD[i].name} milik ${p.name} turun jadi ${levelName(game.props[i].houses)}`
          : `🚜 ${was === 5 ? 'Hotel' : 'Satu rumah'} di ${BOARD[i].name} milik ${p.name} hancur`);
      }
      break;
    }
    case 'loseCards': {
      const n = Object.values(p.hand).reduce((a, b) => a + b, 0);
      if (n) { p.hand = emptyHand(); log(`${p.name} kehilangan ${n} kartu sakti`); }
      break;
    }
    case 'loseCard': {
      const held = Object.keys(p.hand).filter(k => p.hand[k] > 0);
      if (!held.length) { pay(p, null, e.fine * K, reason); break; }
      const k = pick(held); p.hand[k]--;
      log(`${p.name} kehilangan kartu ${POWERS[k].name}`);
      break;
    }
    case 'takeFrom': // ambil uang dari sasaran (mis. pemain terkaya lain) untuk pengambil kartu
      if (drawer && drawer.id !== p.id) { const amt = Math.min(e.amount * K, Math.max(0, p.money)); if (amt > 0) pay(p, drawer, amt, reason); }
      break;
    case 'giveCard': addCard(p, e.card); log(`${p.name} mendapat kartu ${POWERS[e.card].name}`); break;
    case 'pejabat':
      p.pejabat = e.turns; p.pejabatTake = true; p.pejabatClaim = true;
      log(`🎖️ ${p.name} dilantik jadi pejabat selama ${e.turns} giliran`);
      break;
    case 'freeUpgrade': p.freeUpgrades = (p.freeUpgrades || 0) + 1; log(`👴 ${p.name} dapat 1 upgrade tanah gratis`); break;
    case 'swapRichPoor': {
      // Pengambil kartu tidak pernah jadi korban: yang ditukar pemain terkaya selain dia dengan pemain termiskin.
      const list = byCash(), rich = list.find(o => o.id !== p.id), poor = list[list.length - 1];
      if (!rich || rich === poor || rich.money <= poor.money) { log('Fakta gagal diputarbalikkan, tidak ada yang bisa ditukar'); break; }
      [rich.money, poor.money] = [poor.money, rich.money];
      fx('power');
      log(`🔄 Fakta diputarbalikkan! Uang ${rich.name} (${rp(poor.money)}) ditukar dengan uang ${poor.name} (${rp(rich.money)})`);
      break;
    }
  }
}

// Doa Orang Tua yang disimpan otomatis menangkis serangan pemain lain.
function shielded(target, attacker, what) {
  const blocker = pendantHook(target, 'attacked').block;
  if (blocker) { fx('shield'); log(`${blocker} ${target.name} menangkis ${what} dari ${attacker.name}!`); return true; }
  const k = target.hand.angel > 0 ? 'angel' : target.hand.doa > 0 ? 'doa' : null;
  if (!k) return false;
  target.hand[k]--;
  fx('shield');
  log(`${k === 'angel' ? '😇 Angel' : '🙏 Doa Orang Tua'} ${target.name} menangkis ${what} dari ${attacker.name}!`);
  return true;
}
// Target kartu serangan mode Normal: properti lawan yang masih hidup.
function normalTargets(p, card) {
  return Object.keys(game.props).map(Number).filter(i => {
    const pr = game.props[i], o = pr.owner && P(pr.owner);
    if (!o || o.id === p.id || sameTeam(o, p) || o.bankrupt || pr.lease) return false;
    if (card === 'akuisisi' || card === 'tukar') return pr.houses < 5 && BOARD[i].type === 'city';
    if (card === 'gempa') return pr.houses > 0 && pr.houses < 5;
    if (card === 'badai') return pr.houses > 0 && BOARD[i].type === 'city';
    if (card === 'sabotase') return !pr.slump;
    if (card === 'kontrak') return BOARD[i].type !== 'tourism';
    return true;
  });
}
const rivalsOf = p => alive().filter(o => o.id !== p.id && !sameTeam(o, p));
const myBestRent = p => ownedBy(p.id).filter(i => !game.props[i].mortgaged).sort((a, b) => calcRent(b) - calcRent(a))[0];
const mySwappable = p => ownedBy(p.id).filter(i => BOARD[i].type === 'city' && game.props[i].houses < 5 && !game.props[i].lease);

function nextTurn() {
  const pend = game.pending, c = cur();
  game.pending = null;
  // Giliran dilewati sebelum sempat memutuskan: kartu disimpan, dadu kartu dikocok, tagihan tetap dibayar.
  if (pend && c && !c.bankrupt) {
    if (pend.type === 'power') addCard(c, pend.card);
    if (pend.type === 'cardRoll') resolveCardRoll(c, pend, false);
    if (pend.type === 'bill') pay(c, pend.to ? P(pend.to) : null, pend.amount, pend.reason);
    if (pend.type === 'fire') burn(pend.tile);
    if (pend.type === 'poison') closeKitchen(c, pend.tile);
    game.pending = null;
  }
  if (c && c.pejabat > 0 && --c.pejabat === 0) { c.pejabatTake = c.pejabatClaim = false; log(`🎖️ Masa jabatan ${c.name} berakhir`); }
  game.doubles = 0; game.rolled = false;
  settleDebts(true);
  if (checkWinner()) return;
  const n = game.players.length;
  for (let k = 1; k <= n * 3; k++) {
    const idx = (game.turn + k) % n, q = game.players[idx];
    if (q.bankrupt) continue;
    if (q.skip > 0) {
      q.skip--; log(`⏸ ${q.name} tidak bisa jalan giliran ini`);
      if (!q.skip && q.sentence) { q.sentence = false; q.inJail = false; q.jailTurns = 0; log(`🔓 ${q.name} bebas setelah menjalani hukuman`); }
      continue;
    }
    game.turn = idx; break;
  }
  log(`Giliran ${cur().name}`);
  startTurn(cur());
}

// Awal giliran: hitung mundur tambang yang ditutup, lalu kemungkinan event acak tambang/sawit.
function startTurn(p) {
  p.kokokDone = false; p.seretDone = false; // Kokok Pagi & Seret Lawan paling banyak sekali per giliran
  if (p.jalanCd > 0) p.jalanCd--;
  if (p.pejabat > 0) { p.pejabatTake = true; p.pejabatClaim = true; }
  for (const [k, pr] of Object.entries(game.props)) {
    if (pr.slump && pr.owner === p.id && --pr.slump.turns <= 0) { delete pr.slump; log(`💣 Sewa ${BOARD[k].name} pulih kembali`); }
    if (pr.blackout && pr.owner === p.id && --pr.blackout.turns <= 0) { delete pr.blackout; tileFx(+k, 'restore'); log(`💡 Listrik ${BOARD[k].name} menyala lagi`); }
    if (pr.lease && pr.lease.by === p.id && --pr.lease.turns <= 0) endLease(+k);
  }
  for (const c of p.installments || []) {
    const owner = P(c.to), to = owner && !owner.bankrupt ? owner : null;
    pay(p, to, c.per, `cicilan ${c.reason.toLowerCase()} (${c.total - c.left + 1}/${c.total})`);
    c.left--;
  }
  if (p.installments) p.installments = p.installments.filter(c => c.left > 0);
  const kitchens = ownedBy(p.id).filter(i => game.props[i].use === 'dapur' && !game.props[i].mortgaged);
  if (kitchens.length) {
    const amt = kitchens.length * LAND.dapurIncome;
    if (p.inJail) log(`🍱 Hasil Dapur Gizi ${p.name} (${rp(amt)}) masuk kas negara karena pemiliknya dipenjara`);
    else { receive(p, amt, `hasil ${kitchens.length} Dapur Gizi Gratis`); notice({ type: 'dapur', to: p.id, amount: amt }); }
  }
  for (const i of ownedBy(p.id)) {
    const pr = game.props[i];
    if (pr.closed > 0 && --pr.closed === 0) reopened(p, i);
  }
  // Tambang yang sedang disegel, baru dibangun, atau baru dibuka tidak bisa kena lagi.
  const ok = i => !game.props[i].mortgaged && !(game.props[i].grace > 0);
  const mines = ownedBy(p.id).filter(i => ok(i) && game.props[i].use === 'tambang' && !(game.props[i].closed > 0));
  const farms = ownedBy(p.id).filter(i => ok(i) && game.props[i].use === 'sawit');
  let i = null;
  const dapurs = kitchens.filter(i => ok(i));
  if (mines.length && Math.random() < LAND.closeChance) i = pick(mines);
  else if (farms.length && Math.random() < LAND.fireChance) i = pick(farms);
  else if (dapurs.length && Math.random() < LAND.poisonChance) i = pick(dapurs);
  if (i == null) return;
  const pr = game.props[i], t = BOARD[i];
  if (pr.use === 'dapur') {
    game.lastCard = { deck: 'musibah', event: true, title: 'Siswa Keracunan', icon: '🤢', power: null, scope: 'self', special: false, tiers: null, roll: null, shielded: false, tile: i,
      text: `Katering dari Dapur Gizi Gratis milikmu di ${t.name} membuat siswa-siswa keracunan. Bayar denda ${rp(LAND.poisonFine)}, atau dapurmu ditutup BPOM dan dibongkar (tanah kembali kosong, modal Rp 10 jt hangus).`,
      player: p.id, seq: (game.lastCard ? game.lastCard.seq : 0) + 1 };
    game.pending = { type: 'poison', tile: i };
    fx('seize');
    log(`🤢 Siswa keracunan katering Dapur Gizi ${p.name} di ${t.name}`);
    return;
  }
  const ev = pr.use === 'sawit'
    ? { title: 'Kebun Sawit Terbakar', icon: '🔥', text: `Kebun sawitmu di ${t.name} terbakar saat kemarau panjang. Bayar ${rp(LAND.fireCost)} untuk memadamkan api, atau biarkan hangus dan tanahnya kembali jadi tanah kosong.` }
    : { title: 'Tambang Ditutup Akamsi', icon: '⛏️', text: `Warga sekitar (akamsi) memblokade tambangmu di ${t.name}. Tambang tidak beroperasi selama ${LAND.closeTurns} giliran. Bayar ${rp(LAND.reopenCost)} untuk memangkas tiap 1 giliran, atau ${rp(LAND.reopenCost * LAND.closeTurns)} untuk buka langsung. Setelah segel dibuka, tambang aman ${LAND.graceLaps} putaran.` };
  game.lastCard = { deck: 'musibah', event: true, ...ev, power: null, scope: 'self', special: false, tiers: null, roll: null, shielded: false, tile: i,
    player: p.id, seq: (game.lastCard ? game.lastCard.seq : 0) + 1 };
  if (pr.use === 'sawit') game.pending = { type: 'fire', tile: i };
  else { pr.closed = LAND.closeTurns; fx('seize'); }
  log(`${ev.icon} ${ev.title}: ${t.name} milik ${p.name}`);
}

// Segel tambang terbuka: aman dari event acak selama beberapa gajian supaya pemiliknya sempat untung.
function reopened(p, i) {
  game.props[i].grace = LAND.graceLaps;
  log(`⛏️ Segel tambang ${p.name} di ${BOARD[i].name} dibuka, beroperasi lagi dan aman ${LAND.graceLaps} putaran`);
}

// Kasus keracunan tanpa bayar denda: Dapur Gizi ditutup BPOM dan dibongkar, tanahnya jadi tanah kosong.
function closeKitchen(p, i) {
  const pr = game.props[i];
  if (pr.use !== 'dapur') return;
  Object.assign(pr, { use: null, grace: 0 });
  fx('seize');
  log(`🚫 Dapur Gizi ${p.name} di ${BOARD[i].name} ditutup BPOM dan dibongkar`);
}

// Kontrak Sementara selesai: properti kembali ke pemilik aslinya (atau ke bank kalau dia sudah gugur).
function endLease(i) {
  const pr = game.props[i], from = P(pr.lease.from);
  delete pr.lease;
  if (from && !from.bankrupt) { pr.owner = from.id; log(`🔑 Kontrak ${BOARD[i].name} selesai, kembali ke ${from.name}`); }
  else { Object.assign(pr, bankProp()); log(`🔑 Kontrak ${BOARD[i].name} selesai, kembali ke bank`); }
}

function burn(i) {
  const pr = game.props[i];
  if (pr.use !== 'sawit') return;
  pr.use = null; fx('seize');
  log(`🔥 Kebun sawit di ${BOARD[i].name} hangus, tinggal tanah kosong`);
}

function netWorth(p) {
  let v = p.money;
  for (const [i, pr] of Object.entries(game.props)) {
    if (pr.owner !== p.id) continue;
    const t = BOARD[i];
    v += assetValue(+i) - (pr.mortgaged ? (pr.mortgageValue || t.price / 2) : 0);
  }
  return v - (p.loan || 0);
}
// Peringkat: yang masih bertahan dulu (urut kekayaan), lalu yang gugur paling akhir.
// ⏱ Batas waktu: cek tiap 5 detik. Peringatan 5 menit sebelum habis, lalu permainan selesai otomatis.
const LIMIT_MS = GAME_MINUTES * 60 * 1000;
function checkTimeLimit() {
  if (!game || game.phase !== 'playing' || !game.startedAt) return;
  const left = LIMIT_MS - (Date.now() - game.startedAt);
  if (left <= 5 * 60 * 1000 && left > 0 && !game.timeWarned) {
    game.timeWarned = true;
    game.announce = { seq: (game.announce ? game.announce.seq : 0) + 1, icon: '⏱', title: 'Waktu tinggal 5 menit!', text: `Permainan berakhir otomatis setelah ${GAME_MINUTES} menit. Saat waktu habis, ${game.teams ? 'tim' : 'pemain'} dengan kekayaan terbesar yang menang.` };
    log(`⏱ Waktu permainan tinggal 5 menit`);
    broadcast();
  }
  if (left > 0) return;
  game.fx = []; game.notices = [];
  log(`⏱ Waktu ${GAME_MINUTES} menit habis! Permainan selesai, pemenang dihitung dari total kekayaan.`);
  const keys = [...new Set(alive().map(sideKey))];
  const worthOf = key => alive().filter(q => sideKey(q) === key).reduce((a, q) => a + netWorth(q), 0);
  const bestKey = keys.sort((a, b) => worthOf(b) - worthOf(a))[0];
  const best = bestKey != null && alive().filter(q => sideKey(q) === bestKey).sort((a, b) => netWorth(b) - netWorth(a))[0];
  endGame(best && best.id, 'time');
  game.fxSeq++;
  broadcast();
}
setInterval(checkTimeLimit, 5000);
function endGame(winnerId, why) {
  game.phase = 'ended';
  game.endedAt = Date.now();
  game.pending = null;
  game.ranking = game.players
    .map(p => ({ id: p.id, worth: p.bankrupt ? 0 : netWorth(p), bankrupt: !!p.bankrupt, outAt: p.outAt || 0 }))
    .sort((a, b) => (a.bankrupt - b.bankrupt) || (a.bankrupt ? b.outAt - a.outAt : b.worth - a.worth));
  game.winner = winnerId || game.ranking[0].id;
  const wp = P(game.winner);
  game.winTeam = game.teams && wp ? wp.team : null;
  // Pemenang (dan rekan setimnya) di urutan teratas
  if (why || game.teams) {
    const top = r => r.id === game.winner ? 2 : game.teams && P(r.id).team === game.winTeam ? 1 : 0;
    game.ranking.sort((a, b) => top(b) - top(a));
  }
  game.winBy = why || null;
  fx('win');
  const who = wp ? sideLabel(wp) : '';
  log(why === 'tourism' ? `🏆 ${who} menguasai ${NORMAL.tourismWin} tempat wisata dan langsung menang!`
    : why === 'line' ? `🏆 ${who} menguasai satu sisi papan penuh (Line Monopoly) dan langsung menang!`
    : why === 'triple' ? `🏆 ${who} menguasai 3 kawasan warna penuh (Triple Monopoly) dan langsung menang!`
    : why === 'time' ? `🏆 ${who} menang dengan kekayaan terbesar saat waktu habis!`
    : isNormal() && alive().length && new Set(alive().map(sideKey)).size <= 1 ? `🏆 ${who} menang! Semua lawan sudah bangkrut.`
    : isNormal() ? `🏆 ${who} menang dengan kekayaan terbesar.`
    : `🏆 ${P(game.winner).name} bertahan paling lama. Ekonominya tetap susah, tapi setidaknya masih hidup.`);
}
// Pemilik "sebenarnya" sebuah petak: properti yang sedang dikontrak tetap dihitung milik pemilik aslinya.
const realOwner = i => { const pr = game.props[i]; return pr && (pr.lease ? pr.lease.from : pr.owner); };
// Kemajuan menuju kemenangan untuk satu pemain / satu tim (key dari sideKey).
function winProgress(key) {
  const owns = i => { const q = P(realOwner(i)); return !!q && !q.bankrupt && sideKey(q) === key; };
  const tourism = BOARD.filter((t, i) => t.type === 'tourism' && owns(i)).length;
  const groups = [...new Set(BOARD.filter(t => t.type === 'city').map(t => t.group))].map(g => ({ g, tiles: groupTiles(g) }));
  const sd = NT() / 4;
  const lines = [0, 1, 2, 3].map(side => {
    const tiles = BOARD.map((t, i) => i).filter(i => Math.floor(i / sd) === side && isBuyable(i));
    return { side, tiles, have: tiles.filter(owns).length };
  });
  return { owns, tourism, groups, full: groups.filter(x => x.tiles.every(owns)), lines };
}
const SIDE_NAMES = ['bawah', 'kiri', 'atas', 'kanan'];
function checkWinner() {
  if (game.phase !== 'playing') return false;
  const keys = [...new Set(alive().map(sideKey))];
  const bestOf = key => alive().filter(q => sideKey(q) === key).sort((a, b) => netWorth(b) - netWorth(a))[0];
  if (keys.length <= 1) { const w = keys.length ? bestOf(keys[0]) : null; endGame(w && w.id, isNormal() ? 'bankrupt' : null); return true; }
  if (!isNormal()) return false;
  for (const key of keys) {
    const pg = winProgress(key);
    const why = pg.tourism >= NORMAL.tourismWin ? 'tourism' : pg.lines.some(l => l.tiles.length && l.have === l.tiles.length) ? 'line' : pg.full.length >= 3 ? 'triple' : null;
    if (why) { endGame(bestOf(key).id, why); return true; }
  }
  checkThreats(keys);
  return false;
}
// Peringatan saat satu pemain/tim tinggal selangkah lagi menang (sekali per ancaman).
function checkThreats(keys) {
  game.threats = game.threats || [];
  for (const key of keys) {
    const pg = winProgress(key), who = sideLabel(alive().find(q => sideKey(q) === key));
    const warn = (id, title, text) => {
      if (game.threats.includes(key + id)) return;
      game.threats.push(key + id);
      game.announce = { seq: (game.announce ? game.announce.seq : 0) + 1, icon: '⚠️', title, text };
      log(`⚠️ ${text}`);
    };
    if (pg.tourism === NORMAL.tourismWin - 1) warn('tour', 'Awas Monopoli Wisata!', `${who} tinggal 1 tempat wisata lagi untuk menang. Amankan wisata yang tersisa!`);
    for (const l of pg.lines) if (l.tiles.length && l.have === l.tiles.length - 1) {
      const miss = l.tiles.find(i => !pg.owns(i));
      warn('line' + l.side, 'Awas Line Monopoly!', `${who} tinggal 1 petak lagi (${BOARD[miss].name}) untuk menguasai seluruh sisi ${SIDE_NAMES[l.side]} papan dan langsung menang.`);
    }
    if (pg.full.length >= 2) for (const g of pg.groups) if (!g.tiles.every(pg.owns) && g.tiles.filter(i => !pg.owns(i)).length === 1) {
      const miss = g.tiles.find(i => !pg.owns(i));
      warn('triple' + g.g, 'Awas Triple Monopoly!', `${who} sudah punya ${pg.full.length} kawasan warna penuh. Kalau dapat ${BOARD[miss].name}, langsung menang.`);
    }
  }
}

// Pemain gugur: aset diserahkan ke pemain yang dia utangi (atau kembali ke bank).
function eliminate(p, to, why) {
  if (p.bankrupt) return;
  for (const [k, pr] of Object.entries(game.props)) {
    if (pr.lease && pr.lease.by === p.id) endLease(+k);
    else if (pr.lease && pr.lease.from === p.id) delete pr.lease;
  }
  if (to && to.bankrupt) to = null;
  for (const pr of Object.values(game.props)) if (pr.owner === p.id) { Object.assign(pr, bankProp()); delete pr.slump; delete pr.blackout; }
  if (game.festival && !game.props[game.festival.tile].owner) game.festival = null;
  if (to && p.money < 0) to.money -= Math.min(-p.money, Math.max(0, to.money)); // utang yang tak terbayar tidak ikut diterima
  Object.assign(p, { money: 0, bankrupt: true, hand: emptyHand(), inJail: false, skip: 0, outAt: ++game.outSeq, loan: 0, loanPrincipal: 0, installments: [] });
  fx('bankrupt');
  log(`💀 ${p.name} gugur ${why}. Semua tanahnya disita negara dan kembali jadi tanah kosong.`);
}
// Utang tanpa aset untuk digadaikan = gugur otomatis.
function settleDebts(inNextTurn) {
  if (game.phase !== 'playing') return;
  let turnOut = false;
  for (const p of alive()) {
    if (p.money >= 0 || canRaise(p)) continue;
    eliminate(p, p.debtTo ? P(p.debtTo) : null, 'karena terlilit utang dan tidak punya aset lagi');
    if (cur().id === p.id) turnOut = true;
  }
  if (!inNextTurn && !checkWinner() && turnOut) nextTurn();
}

/* ---------------- Avatar ---------------- */
function savePhoto(p, data) {
  if (data == null) {
    fs.rm(path.join(AVATAR_DIR, p.id + '.png'), { force: true }, () => {});
    p.photo = 0;
    return;
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(data));
  if (!m) fail('Foto harus berformat PNG.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_PHOTO_BYTES) fail('Foto terlalu besar.');
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) fail('File itu bukan PNG yang valid.');
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  fs.writeFileSync(path.join(AVATAR_DIR, p.id + '.png'), buf);
  p.photo = Date.now();
}

/* ---------------- Actions ---------------- */
function needPlayer(p) { if (!p) fail('Kamu belum bergabung di permainan ini.'); return p; }
function needPlaying() { if (game.phase !== 'playing') fail('Permainan belum dimulai.'); }
function needTurn(p) { needPlayer(p); needPlaying(); if (cur().id !== p.id) fail('Belum giliranmu.'); }
function needHost(p) { if (!p || p.id !== game.hostId) fail('Hanya tuan rumah (host) yang bisa melakukan ini.'); }
// Laptop server boleh mengatur lobi walaupun bukan host.
function needHostOrLaptop(p, socket) { if (!(socket && socket.data.admin)) needHost(p); }
function needOwner(p, i) {
  if (!isBuyable(i)) fail('Petak ini tidak bisa dimiliki.');
  if (game.props[i].owner !== p.id) fail('Properti ini bukan milikmu.');
}
function needServerLaptop(socket) { if (!socket || !socket.data.admin) fail('Hanya bisa dilakukan dari laptop server.'); }
function needLobby() { if (game.phase !== 'lobby') fail('Avatar tidak bisa diganti setelah permainan dimulai.'); }
function needNoPending() { if (game.pending) fail('Selesaikan dulu keputusan yang sedang menunggu.'); }
/* ---------------- Main tim (mode Normal) ----------------
 * Pemain dipasangkan berdua sesuai urutan lobi; satu tim memakai satu warna.
 * Rekan setim tidak saling menagih sewa, tidak bisa saling serang, dan kondisi menang dihitung per tim. */
const TEAM_COLORS = ['merah', 'biru', 'hijau', 'oranye', 'ungu', 'pink', 'toska', 'coklat', 'hitam', 'emas'];
const teamName = t => 'Tim ' + TEAM_COLORS[t % TEAM_COLORS.length].replace(/^./, c => c.toUpperCase());
const sameTeam = (a, b) => !!(a && b && game.teams && a.team != null && a.team === b.team);
const sideKey = p => (game.teams ? 't' + p.team : p.id);
const sideLabel = p => (game.teams ? teamName(p.team) : p.name);
function applyTeams() {
  if (game.teams) {
    game.players.forEach((p, k) => { if (!p.soloColor) p.soloColor = p.color; p.team = Math.floor(k / 2); p.color = TEAM_COLORS[p.team % TEAM_COLORS.length]; });
    return;
  }
  const back = game.players.filter(p => p.soloColor);
  back.forEach(p => { p.color = null; });
  back.forEach(p => { p.color = freeColor(p.soloColor, p.id); delete p.soloColor; });
  game.players.forEach(p => { delete p.team; });
}
const freeColor = (wanted, exceptId) => {
  const used = c => game.players.some(q => q.color === c && q.id !== exceptId);
  return COLORS.includes(wanted) && !used(wanted) ? wanted : COLORS.find(c => !used(c));
};

const actions = {
  join(p, d, socket) {
    if (p) return;
    if (game.phase !== 'lobby') fail('Permainan sudah berjalan. Kamu bisa menonton.');
    if (game.players.length >= MAX_PLAYERS) fail(`Pemain sudah penuh (maksimal ${MAX_PLAYERS}).`);
    const name = String(d.name || '').trim().slice(0, 16);
    if (!name) fail('Isi namamu dulu.');
    if (game.players.some(q => q.name.toLowerCase() === name.toLowerCase())) fail('Nama itu sudah dipakai pemain lain.');
    const id = crypto.randomBytes(8).toString('hex');
    const np = { id, name, color: freeColor(d.color), look: sanitizeLook(d.look), photo: 0, bot: false };
    if (d.photo) savePhoto(np, d.photo);
    game.players.push(np);
    if (game.teams) applyTeams();
    if (!game.hostId) game.hostId = id;
    attach(socket, id);
    socket.emit('joined', { pid: id });
    log(`${name} bergabung`);
  },
  // Avatar (model, warna, baju, foto) hanya bisa diubah di lobi, supaya stat tidak bisa ditukar di tengah permainan.
  setLook(p, d) {
    needPlayer(p); needLobby();
    if (d.look) p.look = sanitizeLook(d.look);
    if (d.color && d.color !== p.color) {
      if (game.teams) fail('Di mode tim, warna bidak mengikuti warna tim.');
      if (freeColor(d.color, p.id) !== d.color) fail('Warna itu sudah dipakai pemain lain.');
      p.color = d.color;
    }
  },
  setAvatar(p, d) { needPlayer(p); needLobby(); savePhoto(p, d.data || null); },
  // Main tim (berpasangan) atau sendiri-sendiri. Hanya di mode Normal.
  setTeams(p, d, socket) {
    needHostOrLaptop(p, socket);
    if (game.phase !== 'lobby') fail('Tim hanya bisa diatur di lobi.');
    if (!isNormal() && d.on) fail('Main tim hanya ada di mode Normal.');
    game.teams = !!d.on; applyTeams();
    log(game.teams ? '👥 Main tim: pemain dipasangkan berdua, satu tim satu warna.' : '👤 Main sendiri-sendiri.');
  },
  shuffleTeams(p, d, socket) {
    needHostOrLaptop(p, socket);
    if (game.phase !== 'lobby' || !game.teams) fail('Acak tim hanya bisa di lobi saat main tim.');
    shuffle(game.players); applyTeams();
    log('🔀 Tim diacak: ' + [...new Set(game.players.map(q => q.team))].map(t => `${teamName(t)} (${game.players.filter(q => q.team === t).map(q => q.name).join(' & ')})`).join(', '));
  },
  // Pasang liontin (maksimal NORMAL.maxPendants) sebelum permainan dimulai.
  setPendants(p, d) {
    needPlayer(p); needLobby();
    const ids = [...new Set(Array.isArray(d.ids) ? d.ids : [])].filter(id => PENDANTS.some(x => x.id === id));
    if (ids.length > NORMAL.maxPendants) fail(`Maksimal ${NORMAL.maxPendants} liontin.`);
    p.pendants = ids;
  },
  buyParity(p) {
    needTurn(p);
    if (!(pmod(p, 'parity') > 0)) fail('Pasang liontin Dadu Ganjil-Genap dulu.');
    if (p.money < NORMAL.parityPrice) fail(`Uangmu kurang (${rp(NORMAL.parityPrice)}).`);
    pay(p, null, NORMAL.parityPrice, 'beli jatah dadu Ganjil-Genap');
    p.parity = (p.parity || 0) + 1;
    log(`☯️ ${p.name} membeli 1× jatah dadu Ganjil-Genap (sekarang ${p.parity}×)`);
  },
  addBot(p, d, socket) {
    needHostOrLaptop(p, socket);
    if (game.phase !== 'lobby') fail('Bot hanya bisa ditambahkan di lobi.');
    if (game.players.length >= MAX_PLAYERS) fail(`Pemain sudah penuh (maksimal ${MAX_PLAYERS}).`);
    const name = BOT_NAMES.find(n => !game.players.some(q => q.name === n)) || 'Bot ' + (game.players.length + 1);
    const id = crypto.randomBytes(8).toString('hex');
    const color = freeColor(pick(COLORS.filter(c => !game.players.some(q => q.color === c))));
    game.players.push({ id, name, color, look: randomLook(), photo: 0, bot: true, pendants: botPendants() });
    if (game.teams) applyTeams();
    log(`🤖 ${name} ikut bermain`);
  },
  leave(p, d, socket) {
    needPlayer(p);
    if (game.phase !== 'lobby') fail('Tidak bisa keluar saat permainan berjalan.');
    removePlayer(p.id); socket.data.pid = null; socket.emit('joined', { pid: null });
  },
  kick(p, d, socket) {
    needHostOrLaptop(p, socket);
    if (game.phase !== 'lobby') fail('Hanya bisa mengeluarkan pemain di lobi.');
    const q = P(d.id); if (!q || (p && q.id === p.id)) return;
    removePlayer(q.id);
    log(`${q.name} dikeluarkan dari lobi`);
    for (const s of io.sockets.sockets.values()) if (s.data.pid === q.id) { s.data.pid = null; s.emit('joined', { pid: null }); }
  },
  start(p, d, socket) {
    needHostOrLaptop(p, socket);
    if (game.phase !== 'lobby') fail('Permainan sudah berjalan.');
    if (game.players.length < 2) fail('Butuh minimal 2 pemain. Tambahkan bot kalau temanmu belum datang.');
    if (game.teams) {
      if (game.players.length < 4 || game.players.length % 2) fail('Main tim butuh jumlah pemain genap, minimal 4 (2 orang per tim).');
      applyTeams();
      // Urutan giliran bergantian antar tim: A1, B1, C1, A2, B2, C2
      const order = shuffle([...new Set(game.players.map(q => q.team))]).map(t => shuffle(game.players.filter(q => q.team === t)));
      game.players = [0, 1].flatMap(k => order.map(m => m[k]));
    } else shuffle(game.players);
    BOARD = boardFor(game.mode);
    game.players.forEach(q => {
      if (q.bot && !(q.pendants || []).length) q.pendants = botPendants();
      q.pendants = (q.pendants || []).filter(id => PENDANTS.some(x => x.id === id)).slice(0, NORMAL.maxPendants);
      Object.assign(q, { money: statsOf(q).start || START_MONEY, pos: 0, inJail: false, jailTurns: 0, hand: emptyHand(), loan: 0, loanPrincipal: 0, installments: [], bankrupt: false, skip: 0, outAt: 0, vouchers: 0, freeUpgrades: 0, laps: 0, buildTokens: 0, parity: Math.max(0, pmod(q, 'parity')) });
    });
    game.festival = null; game.lastSlot = null;
    game.decks = { kesempatan: fullDeck('kesempatan', false), musibah: fullDeck('musibah', false) };
    game.startedAt = Date.now(); game.endedAt = 0; game.timeWarned = false;
    game.phase = 'playing'; game.turn = 0; game.props = freshProps(); game.rolled = false; game.doubles = 0; game.outSeq = 0;
    game.specialAdded = false; game.announce = null; game.ultraDrawn = [];
    log(isNormal() ? `🎲 Mode Normal dimulai! Modal ${rp(NORMAL.startMoney)} untuk semua, gaji ${rp(NORMAL.salary)} per putaran.`
      : `🇮🇩 Mode WNI dimulai! Modal awal tergantung avatar (Rp 5–10 jt), gaji ${rp(SALARY)} per putaran. Bertahanlah selama mungkin.`);
    log(`Urutan: ${game.players.map(q => q.name).join(' → ')}`);
    game.players.forEach(q => pendantHook(q, 'start'));
    log(`Giliran ${cur().name}`);
  },
  roll(p, d) {
    needTurn(p); needNoPending();
    if (game.rolled) fail('Kamu sudah melempar dadu. Tekan "Selesai giliran".');
    if (p.money < 0) fail('Kamu masih terlilit utang. Gadaikan aset ke bank dulu.');
    const target = Number(d && d.target);
    let a = d6(), b = d6(), aimed = false;
    if (!p.inJail && target >= 2 && target <= 12 && Math.random() < statsOf(p).dice) {
      const pairs = [];
      for (let x = 1; x <= 6; x++) { const y = target - x; if (y >= 1 && y <= 6) pairs.push([x, y]); }
      [a, b] = pick(pairs); aimed = true;
    }
    let twin = '';
    if (!aimed && a !== b && !p.inJail && chance(pmod(p, 'doubles'))) { b = a; twin = ' ' + pmodTag(p, 'doubles'); }
    let parity = '';
    if (!p.inJail && (d && (d.parity === 'odd' || d.parity === 'even'))) {
      if (!(p.parity > 0)) fail('Jatah dadu Ganjil-Genap habis. Beli lagi dulu.');
      p.parity--; parity = d.parity;
      if (((a + b) % 2 === 1) !== (parity === 'odd')) b = 7 - b; // ganti paritas tanpa mengubah peluang angkanya
    }
    const sum = a + b, dbl = a === b;
    game.dice = [a, b]; game.diceSeq++;
    log(`${p.name} melempar dadu: ${a} + ${b}${dbl ? ' (kembar!)' + twin : ''}${aimed ? ' 🎯 tepat sasaran' : ''}${parity ? (parity === 'odd' ? ' ☯️ ganjil' : ' ☯️ genap') + ` (sisa ${p.parity}×)` : ''}`);
    if (p.inJail) {
      game.rolled = true;
      if (dbl) { p.inJail = false; p.jailTurns = 0; log(`${p.name} bebas dari penjara`); moveBy(p, sum); return; }
      p.jailTurns++;
      if (p.jailTurns >= 3) {
        pay(p, null, JAIL_FINE, 'denda penjara'); p.inJail = false; p.jailTurns = 0; moveBy(p, sum);
      } else log(`${p.name} masih di penjara (percobaan ${p.jailTurns}/3)`);
      return;
    }
    if (dbl) {
      game.doubles++;
      if (game.doubles >= 3) { log('Tiga kali kembar berturut-turut!'); sendToJail(p); return; }
    }
    game.rolled = !dbl;
    moveBy(p, sum);
    if (p.inJail) game.rolled = true;
    else if (!dbl && skillOf(p) === 'kokok' && !p.kokokDone && skillHit(p)) { skillBadge(p); p.kokokDone = true; game.rolled = false; log(`🐓 Kokok Pagi! ${p.name} boleh melempar dadu sekali lagi`); }
  },
  buy(p, d = {}) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'buy') fail('Tidak ada properti untuk dibeli.');
    const t = BOARD[pend.tile], price = pend.price || landPrice(p, pend.tile);
    const level = isNormal() && t.type === 'city' ? Math.max(0, Math.min(3, Number(d.level) || 0)) : 0;
    if (level > maxLevel(p)) fail('Kabupaten baru bisa langsung dibangun setelah kamu melewati Mulai 1 kali.');
    let build = level ? buildCost(p, pend.tile, 0, level) : 0, via = '';
    if (build && d.voucher) { if (!(p.vouchers > 0)) fail('Kamu tidak punya voucher diskon.'); build = Math.round(build * LAND.kprDiscount / 1000) * 1000; via = ', pakai voucher'; }
    if (p.money < price + build) fail(`Uangmu kurang untuk membeli ${t.name} (${rp(price + build)}).`);
    if (build && d.voucher) p.vouchers--;
    if (build && skillOf(p) === 'proyek' && skillHit(p)) { skillBadge(p); build = 0; via = ', bangunan gratis lewat 🏗️ Proyek Titipan'; }
    else if (build && p.buildTokens > 0) { build = 0; p.buildTokens = 0; via = ', bangunan gratis lewat 🧱 Subsidi'; }
    // 🏗️ Proyek Titipan juga berlaku saat hanya membeli tanah: peluang setengah harga
    let land = price;
    if (!build && !level && skillOf(p) === 'proyek' && chance(skillData(p).landChance || 0)) { skillBadge(p); land = Math.round(price / 2 / 1000) * 1000; via = ', setengah harga lewat 🏗️ Proyek Titipan'; }
    p.money -= land + build; game.props[pend.tile].owner = p.id; game.pending = null;
    if (level) {
      game.props[pend.tile].houses = level; game.props[pend.tile].use = 'properti';
      const lm = pendantHook(p, 'build').landmark;
      if (lm) { game.props[pend.tile].houses = 5; log(`${lm}: ${t.name} langsung jadi 🏛️ Landmark!`); }
    }
    fx(level ? 'build' : 'buy');
    log(level ? `🏠 ${p.name} membeli ${t.name} dan langsung membangun ${levelName(level)} (${rp(land + build)}${via})`
      : `${p.name} membeli ${t.name} seharga ${rp(land)}${via || (land < t.price ? ` (diskon dari ${rp(t.price)})` : '')}`);
    maybeJalan(p);
  },
  skip(p) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || !['buy', 'upgradeOffer', 'startBuild'].includes(pend.type)) return;
    if (pend.type === 'buy') log(`${p.name} tidak membeli ${BOARD[pend.tile].name}`);
    game.pending = null;
    resumeTravel(pend, p);
    maybeJalan(p);
  },
  // Bayar tagihan sewa/pajak. Uang kurang: gadaikan aset dulu. Tidak punya aset lagi: gugur.
  payBill(p) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'bill') fail('Tidak ada tagihan.');
    const to = pend.to ? P(pend.to) : null;
    if (p.money >= pend.amount) {
      game.pending = null; pay(p, to, pend.amount, pend.reason);
      if (to && !to.inJail) notice({ type: 'rent', to: to.id, from: p.name, amount: pend.amount, reason: pend.reason });
      const pr = game.props[pend.tile];
      if (to) { pendantHook(p, 'afterRent', { amount: pend.amount }); if (!to.inJail) pendantHook(to, 'receiveRent', { amount: pend.amount }); }
      if (to && pr && pr.owner === to.id) offerTakeover(p, pend.tile);
      return;
    }
    if (canRaise(p) || p.hand.doa > 0) fail(`Uangmu kurang ${rp(pend.amount - p.money)}. ${isNormal() ? 'Gadaikan aset atau pinjam bank dulu.' : 'Gadaikan aset, pinjam bank, atau cicil sewa dulu.'}`);
    game.pending = null;
    if (p.money > 0) {
      const paidTo = to && !to.inJail ? to : null;
      if (paidTo) paidTo.money += p.money;
      log(`${p.name} menyerahkan sisa uang ${rp(p.money)}${paidTo ? ' ke ' + paidTo.name : ' ke kas negara'}`);
      p.money = 0;
    }
    eliminate(p, to, `karena tidak sanggup membayar ${pend.reason.toLowerCase()} ${rp(pend.amount)}`);
    if (!checkWinner()) nextTurn();
  },
  // Pinjam uang ke bank (pokok maksimal BANK.maxLoan, bunga sekali di awal, dicicil tiap gajian).
  borrow(p, d) {
    needPlayer(p); needPlaying();
    const amount = Math.floor((Number(d.amount) || 0) / (100 * K)) * 100 * K;
    if (amount <= 0) fail('Pilih jumlah pinjaman.');
    if (amount > loanRoom(p)) fail(`Batas pinjamanmu tinggal ${rp(loanRoom(p))}.`);
    if (!hasCollateral(p)) fail('Bank butuh jaminan. Semua asetmu sudah digadai, jadi tidak bisa pinjam lagi.');
    const debt = Math.round(amount * (1 + BANK.loanInterest * Math.max(0, 1 + pmod(p, 'loanInterest'))));
    p.loan = (p.loan || 0) + debt; p.loanPrincipal = (p.loanPrincipal || 0) + amount;
    p.money += amount;
    fx('cash');
    log(`🏦 ${p.name} pinjam ${rp(amount)} ke bank (utang ${rp(debt)}, dicicil ${rp(BANK.loanRepay)} tiap gajian)`);
  },
  repayLoan(p, d) {
    needPlayer(p); needPlaying();
    if (!(p.loan > 0)) fail('Kamu tidak punya pinjaman bank.');
    const amount = Math.min(p.loan, Math.max(0, p.money), Number(d.amount) > 0 ? Number(d.amount) : p.loan);
    if (amount <= 0) fail('Uangmu tidak cukup untuk mencicil.');
    p.loan -= amount; p.loanPrincipal = p.loan > 0 ? Math.min(p.loanPrincipal || 0, p.loan) : 0;
    pay(p, null, amount, 'melunasi pinjaman bank');
    log(p.loan > 0 ? `🏦 Sisa pinjaman bank ${p.name}: ${rp(p.loan)}` : `🏦 Pinjaman bank ${p.name} lunas`);
  },
  // Cicil sewa: n kali (cicilan pertama sekarang, sisanya di awal giliran berikutnya).
  installRent(p, d) {
    needTurn(p);
    const pend = game.pending, n = Number(d.n);
    if (isNormal()) fail('Mode Normal tidak ada cicilan sewa. Bayar langsung, atau pakai kartu Angel / Bebas Sewa.');
    if (!pend || pend.type !== 'bill' || !pend.to) fail('Hanya sewa tanah yang bisa dicicil.');
    if (!hasCollateral(p)) fail('Semua asetmu sudah digadai. Sewa tidak bisa dicicil lagi: bayar penuh atau bangkrut.');
    if (!BANK.installmentFee[n]) fail('Pilih 2, 4, atau 6 kali cicilan.');
    const total = Math.round(pend.amount * (1 + BANK.installmentFee[n]) / 1000) * 1000;
    const per = Math.ceil(total / n / 1000) * 1000;
    if (p.money < per) fail(`Uangmu kurang untuk cicilan pertama (${rp(per)}).`);
    const to = P(pend.to);
    game.pending = null;
    pay(p, to, per, `cicilan ${pend.reason.toLowerCase()} (1/${n})`);
    if (to && !to.inJail) notice({ type: 'rent', to: to.id, from: p.name, amount: per, reason: pend.reason + ' (cicilan)' });
    p.installments = (p.installments || []).concat({ to: pend.to, per, left: n - 1, total: n, reason: pend.reason });
    log(`📅 ${p.name} mencicil ${pend.reason.toLowerCase()} ${n}× ${rp(per)} (total ${rp(per * n)})`);
  },
  // Pilih mode permainan di lobi (host atau laptop server).
  setMode(p, d, socket) {
    needHostOrLaptop(p, socket);
    if (game.phase !== 'lobby') fail('Mode hanya bisa diganti di lobi.');
    const mode = d.mode === 'normal' ? 'normal' : 'wni';
    if (mode === game.mode) return;
    game.mode = mode; BOARD = boardFor(mode); game.boardSize = BOARD.length;
    if (mode !== 'normal' && game.teams) { game.teams = false; applyTeams(); }
    game.props = freshProps();
    game.decks = { kesempatan: fullDeck('kesempatan', false), musibah: fullDeck('musibah', false) };
    log(mode === 'normal' ? '🎲 Mode Normal dipilih: papan 32 petak ala Get Rich, 4 tempat wisata (kuasai semua = menang), Festival, Mesin Game, Landmark, dan skill avatar.' : '🇮🇩 Mode WNI dipilih: bertahan hidup dari Musibah.');
  },
  // 🎪 Festival: sewa properti terpilih x2; di properti yang sama lagi x4, x8, ... maks x80. Di tempat lain = reset.
  festival(p, d) {
    needTurn(p);
    if (!game.pending || game.pending.type !== 'festival') fail('Kamu tidak sedang di petak Festival.');
    if (d.skip) { game.pending = null; log(`${p.name} tidak mengadakan festival`); return; }
    const i = Number(d.tile); needOwner(p, i);
    if (BOARD[i].type !== 'city') fail('Festival hanya bisa di kota.');
    if (game.props[i].mortgaged) fail('Tebus dulu tanah ini dari bank.');
    const prev = game.festival;
    const step = 2 ** (1 + Math.max(0, pmod(p, 'festivalStep')));
    const mult = Math.min(NORMAL.festivalMax, prev && prev.tile === i ? prev.mult * step : step);
    game.festival = { tile: i, mult, owner: p.id };
    game.pending = null;
    fx('festival');
    log(`🎪 ${p.name} mengadakan festival di ${BOARD[i].name}: sewa ×${mult}${step > 2 ? ` (${pmodTag(p, 'festivalStep')})` : ''}${prev && prev.tile !== i ? ` (festival di ${BOARD[prev.tile].name} selesai)` : ''}`);
  },
  // 🎰 Mesin Game: bayar taruhan, 3 gulungan acak. 2 sama = 1,5x, 3 sama = 10x, 7-7-7 = 25x.
  slotPlay(p, d) {
    needTurn(p);
    if (!game.pending || game.pending.type !== 'slot') fail('Kamu tidak sedang di Mesin Game.');
    game.pending = null;
    if (!d.play) { log(`${p.name} tidak main Mesin Game`); return; }
    const bet = NORMAL.slotBets.includes(Number(d.bet)) ? Number(d.bet) : NORMAL.slotBet;
    if (p.money < bet) fail(`Uangmu kurang untuk taruhan (${rp(bet)}).`);
    pay(p, null, bet, 'taruhan Mesin Game');
    const sym = NORMAL.slotSymbols, reels = [0, 1, 2].map(() => pick(sym));
    if (reels[0] !== reels[1] && chance(pmod(p, 'slotLuck'))) { reels[1] = reels[0]; log(`${pmodTag(p, 'slotLuck')} membantu ${p.name} di Mesin Game`); }
    const same = Math.max(...reels.map(r => reels.filter(x => x === r).length));
    const mult = same === 3 ? (reels[0] === sym[sym.length - 1] ? NORMAL.slotJackpot : NORMAL.slotTriple) : same === 2 ? NORMAL.slotPair : 0;
    const win = Math.round(bet * mult / 1000) * 1000;
    if (win) receive(p, win, 'Mesin Game');
    game.lastSlot = { seq: (game.lastSlot ? game.lastSlot.seq : 0) + 1, player: p.id, reels, win, bet };
    fx('slot');
    log(`🎰 ${p.name} main Mesin Game: ${reels.join(' ')} ${win ? '→ menang ' + rp(win) : '→ zonk'}`);
  },
  // 🕴️ Ambil Alih (skill Manusia): beli paksa tanah lawan tanpa bangunan seharga 2x harga.
  takeover(p, d) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'takeover') fail('Tidak ada tanah yang bisa diambil alih.');
    if (!d.accept) { game.pending = null; resumeTravel(pend, p); return; }
    const i = pend.tile, pr = game.props[i], o = P(pr.owner);
    if (!o || o.id === p.id || (pr.houses >= 5 && skillOf(p) !== 'nego') || pr.lease) { game.pending = null; fail('Properti ini tidak bisa diambil alih lagi.'); }
    // Cek dulu semuanya, baru tawaran ditutup; kalau gagal, tawaran tetap terbuka.
    if (d.voucher && !(p.vouchers > 0)) fail('Kamu tidak punya voucher diskon.');
    const price = d.voucher ? Math.round(pend.price / 2 / 1000) * 1000 : pend.price;
    if (p.money < price) fail(`Uangmu kurang (${rp(price)}).`);
    game.pending = null;
    if (d.voucher) p.vouchers--;
    pend.price = price;
    pay(p, o, pend.price, 'ambil alih ' + BOARD[i].name);
    pr.owner = p.id;
    if (pr.blackout) { delete pr.blackout; tileFx(i, 'restore'); log(`💡 Listrik ${BOARD[i].name} menyala lagi setelah diambil alih`); }
    pendantHook(o, 'takenOver', { amount: pend.price });
    pendantHook(p, 'takeover', { tile: i });
    if (skillOf(p) === 'nego') skillBadge(p);
    fx('seize');
    log(`🕴️ ${p.name} mengambil alih ${BOARD[i].name}${pr.houses ? ' beserta bangunannya' : ''} dari ${o.name} (${rp(pend.price)})`);
    if (upgradeOptions(p, i).length) game.pending = { type: 'upgradeOffer', tile: i, takeover: true, ...(pend.thenTravel ? { thenTravel: true } : {}) };
    else resumeTravel(pend, p);
  },
  travel(p, d) {
    needTurn(p);
    if (!game.pending || game.pending.type !== 'travel') fail('Kamu tidak sedang di petak Travelling.');
    const i = Number(d.tile);
    if (!Number.isInteger(i) || i < 0 || i >= NT()) fail('Pilih kotak tujuan.');
    const row = game.pending.row;
    if (row != null && Math.floor(i / (NT() / 4)) !== row) fail('Pilih petak di baris tempatmu berada.');
    game.pending = null;
    if (i === p.pos) { log(`${p.name} memilih tetap di ${BOARD[i].name}`); return; }
    if (row == null && i < p.pos) paySalary(p); // pindah dalam satu baris tidak melewati Mulai
    p.pos = i;
    fx('travel');
    log(`✈️ ${p.name} travelling ke ${BOARD[i].name}`);
    resolveTile(p);
  },
  // Upgrade tanah sendiri: rumah/hotel, tambang, atau kebun sawit. Bayar tunai, pakai voucher subsidi
  // dari gajian (diskon), atau pakai upgrade gratis dari kartu "Boomer Suka".
  upgrade(p, d) {
    needTurn(p);
    const i = Number(d.tile), pend = game.pending;
    if (pend && !(pend.type === 'upgradeOffer' && pend.tile === i) && pend.type !== 'startBuild') fail('Selesaikan dulu keputusan yang sedang menunggu.');
    if (isNormal() && !pend) fail('Bangunan hanya bisa dibangun saat berhenti di propertimu sendiri atau tepat di Mulai.');
    needOwner(p, i);
    const t = BOARD[i], pr = game.props[i];
    if (t.type !== 'city') fail('Hanya tanah kota yang bisa di-upgrade.');
    if (pr.mortgaged) fail('Tebus dulu tanah ini dari bank.');
    const opts = upgradeOptions(p, i);
    const opt = isNormal() ? opts.find(o => o.level === (Number(d.level) || pr.houses + 1)) : opts.find(o => o.kind === d.kind);
    if (isNormal() && !opt) fail(pr.houses >= 5 ? 'Sudah jadi Landmark.' : (Number(d.level) || 0) > maxLevel(p) ? 'Kabupaten baru bisa dibangun setelah kamu melewati Mulai 1 kali.' : 'Pilihan bangunan tidak tersedia.');
    if (!opt) fail(isBiz(pr.use) ? `Tanah ini sudah jadi ${USE_NAME[pr.use]}.` : pr.houses >= 5 ? 'Sudah ada hotel di sini.' : 'Tanah yang sudah ada bangunannya tidak bisa dijadikan tambang atau kebun.');
    let cost = opt.cost, via = '';
    if (d.pay === 'free') { if (!(p.freeUpgrades > 0)) fail('Kamu tidak punya upgrade gratis.'); cost = 0; via = ' gratis dari pejabat'; }
    else if (d.pay === 'voucher') { if (!(p.vouchers > 0)) fail('Kamu tidak punya voucher subsidi.'); cost = Math.round(opt.cost * LAND.kprDiscount); via = ' pakai voucher subsidi'; }
    if (p.money < cost) fail(`Uangmu kurang (${rp(cost)}).`);
    if (cost && skillOf(p) === 'proyek' && skillHit(p)) { skillBadge(p); cost = 0; via = ' gratis lewat 🏗️ Proyek Titipan'; }
    else if (cost && opt.kind === 'properti' && isNormal() && p.buildTokens > 0) { cost = 0; p.buildTokens = 0; via = ' gratis lewat 🧱 Subsidi'; }
    p.money -= cost;
    if (d.pay === 'free') p.freeUpgrades--; else if (d.pay === 'voucher') p.vouchers--;
    if (opt.kind === 'properti') {
      pr.houses = opt.level || pr.houses + 1; pr.use = 'properti';
      const lm = isNormal() && pr.houses < 5 && pendantHook(p, 'build').landmark;
      if (lm) { pr.houses = 5; log(`${lm}: ${t.name} langsung jadi 🏛️ Landmark!`); }
    }
    else { pr.use = opt.kind; pr.closed = 0; pr.grace = newBizGrace(p); }
    if (pend) game.pending = null;
    resumeTravel(pend, p);
    fx('build');
    maybeJalan(p);
    const what = opt.kind === 'properti' ? (isNormal() ? `membangun ${pr.houses === 5 ? '🏛️ ' : ''}${levelName(pr.houses)}` : pr.houses === 5 ? 'membangun hotel' : `membangun rumah ke-${pr.houses}`)
      : opt.kind === 'dapur' ? `membangun Dapur Gizi Gratis (+${rp(LAND.dapurIncome)} tiap giliran)` : `membuka ${USE_NAME[opt.kind]} (+${rp(LAND.income)} tiap gajian)`;
    log(`${{ properti: '🏠', tambang: '⛏️', sawit: '🌴', dapur: '🍱' }[opt.kind]} ${p.name} ${what} di ${t.name}${via} (${rp(cost)})`);
  },
  // Tambang yang ditutup akamsi: bayar per giliran untuk membukanya lebih cepat.
  reopen(p, d) {
    needPlayer(p); needPlaying();
    const i = Number(d.tile); needOwner(p, i);
    const pr = game.props[i];
    if (!(pr.closed > 0)) fail('Tambang ini tidak sedang ditutup.');
    const turns = d.all ? pr.closed : 1, cost = p.pejabat > 0 ? 0 : turns * LAND.reopenCost;
    if (p.money < cost) fail(`Uangmu kurang (${rp(cost)}).`);
    if (cost) pay(p, null, cost, 'uang damai ke akamsi'); else log(`🎖️ Pejabat ${p.name} membuka segel tambang tanpa biaya`);
    pr.closed -= turns;
    if (pr.closed) log(`⛏️ Penutupan tambang ${p.name} di ${BOARD[i].name} tinggal ${pr.closed} giliran`);
    else reopened(p, i);
  },
  // Pejabat: sekali per giliran ambil alih tanah/bangunan pemain lain.
  pejabatTake(p, d) {
    needTurn(p); needNoPending();
    if (!(p.pejabat > 0)) fail('Kamu bukan pejabat.');
    if (!p.pejabatTake) fail('Jatah ambil alih giliran ini sudah dipakai.');
    const i = Number(d.tile), pr = game.props[i], o = pr && pr.owner ? P(pr.owner) : null;
    if (!o || o.id === p.id || o.bankrupt) fail('Pilih tanah milik pemain lain.');
    if (guarded(i)) fail('Tanah itu dilindungi Jalur Dinasti.');
    pr.owner = p.id; p.pejabatTake = false;
    fx('seize');
    log(`🎖️ Pejabat ${p.name} mengambil alih ${BOARD[i].name}${pr.houses ? ' beserta bangunannya' : ''} dari ${o.name}`);
  },
  // Pejabat: sekali per giliran klaim tanah kosong dan langsung upgrade gratis.
  pejabatClaim(p, d) {
    needTurn(p); needNoPending();
    if (!(p.pejabat > 0)) fail('Kamu bukan pejabat.');
    if (!p.pejabatClaim) fail('Jatah klaim tanah giliran ini sudah dipakai.');
    const i = Number(d.tile), t = BOARD[i], pr = game.props[i];
    if (!t || t.type !== 'city' || !pr || pr.owner) fail('Pilih tanah kota yang belum dimiliki.');
    const kinds = { rumah: 1, hotel: 5, tambang: 0, sawit: 0, dapur: 0, kosong: 0 };
    if (!(d.kind in kinds)) fail('Pilih jenis bangunan.');
    Object.assign(pr, { owner: p.id, houses: kinds[d.kind], mortgaged: false, use: kinds[d.kind] ? 'properti' : isBiz(d.kind) ? d.kind : null, closed: 0, grace: isBiz(d.kind) ? newBizGrace(p) : 0 });
    p.pejabatClaim = false;
    fx('build');
    const what = { rumah: 'membangun rumah', hotel: 'langsung membangun hotel', tambang: 'membuka tambang', sawit: 'membuka kebun sawit', dapur: 'membangun Dapur Gizi Gratis', kosong: 'membiarkannya kosong' }[d.kind];
    log(`🎖️ Pejabat ${p.name} mengklaim ${t.name} gratis dan ${what}`);
  },
  poisonChoice(p, d) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'poison') fail('Tidak ada kasus keracunan.');
    if (d.pay) {
      if (p.money < LAND.poisonFine) fail(`Uangmu kurang (${rp(LAND.poisonFine)}). Gadaikan aset dulu, atau pilih penjara.`);
      game.pending = null;
      pay(p, null, LAND.poisonFine, 'denda kasus keracunan');
      if (game.lastCard && game.lastCard.event) game.lastCard.result = 'Denda dibayar. Kasus ditutup.';
      return;
    }
    game.pending = null;
    closeKitchen(p, pend.tile);
    if (game.lastCard && game.lastCard.event) game.lastCard.result = 'Dapur ditutup BPOM dan dibongkar. Tanahnya kembali kosong.';
  },
  fireChoice(p, d) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'fire') fail('Tidak ada kebakaran.');
    if (d.extinguish) {
      const cost = p.pejabat > 0 ? 0 : LAND.fireCost;
      if (p.money < cost) fail(`Uangmu kurang (${rp(cost)}).`);
      game.pending = null;
      if (cost) pay(p, null, cost, 'memadamkan kebakaran kebun sawit'); else log(`🎖️ Pejabat ${p.name} mengerahkan pemadam gratis`);
      game.props[pend.tile].grace = LAND.graceLaps;
      if (game.lastCard && game.lastCard.event) game.lastCard.result = `Api berhasil dipadamkan. Kebun aman ${LAND.graceLaps} putaran.`;
      return;
    }
    game.pending = null;
    burn(pend.tile);
    if (game.lastCard && game.lastCard.event) game.lastCard.result = 'Kebun dibiarkan hangus.';
  },
  keepCard(p) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'power') fail('Tidak ada kartu untuk disimpan.');
    addCard(p, pend.card); game.pending = null;
    log(`${p.name} menyimpan kartu ${POWERS[pend.card].name}`);
  },
  usePower(p, d) {
    needTurn(p);
    const card = d.card, def = POWERS[card];
    if (!def) fail('Kartu tidak dikenal.');
    const pend = game.pending;
    const fromPending = pend && pend.type === 'power' && pend.card === card;
    if (!fromPending) {
      // Doa Orang Tua boleh dipakai untuk menambal tagihan yang sedang menunggu.
      if (!(['doa', 'angel', 'bebassewa'].includes(card) && pend && pend.type === 'bill')) needNoPending();
      if (!(p.hand[card] > 0)) fail(`Kamu tidak punya kartu ${def.name}.`);
    }
    let run;
    if (card === 'doa') {
      run = () => receive(p, DOA_REWARD, 'Doa Orang Tua dikabulkan');
    } else if (card === 'orangdalam') {
      if (!p.inJail) fail('Kartu Orang Dalam hanya bisa dipakai saat kamu di penjara.');
      if (game.rolled) fail('Kamu sudah melempar dadu giliran ini.');
      run = () => { p.inJail = false; p.jailTurns = 0; log(`${p.name} keluar penjara lewat orang dalam`); };
    } else if (card === 'buzzer') {
      const t = P(d.target);
      if (!t || t.bankrupt || t.id === p.id) fail('Pilih lawan yang mau digoreng buzzer.');
      run = () => {
        if (shielded(t, p, 'serangan Buzzer')) return;
        const amt = Math.min(BUZZER_FEE, Math.max(0, t.money));
        log(`📢 Buzzer ${p.name} menggoreng ${t.name} di media sosial`);
        if (amt > 0) pay(t, p, amt, 'biaya klarifikasi'); else log(`${t.name} tidak punya uang untuk klarifikasi`);
      };
    } else if (card === 'mafia') {
      const i = Number(d.tile), pr = game.props[i];
      const o = pr && pr.owner ? P(pr.owner) : null;
      if (!o || o.id === p.id || o.bankrupt) fail('Pilih tanah milik lawan.');
      if (!movable(i)) fail('Tanah yang sudah ada bangunannya tidak bisa direbut.');
      if (guarded(i)) fail('Tanah itu dilindungi Jalur Dinasti.');
      run = () => {
        if (shielded(o, p, 'Mafia Tanah')) return;
        pr.owner = p.id;
        fx('seize');
        log(`🕴️ ${p.name} memakai Mafia Tanah dan merebut ${BOARD[i].name} dari ${o.name}`);
      };
    }
    else if (card === 'dinasti') {
      const i = Number(d.tile);
      needOwner(p, i);
      if (guarded(i)) fail('Tanah itu sudah dilindungi Jalur Dinasti.');
      run = () => { game.props[i].dynasty = true; log(`👑 ${BOARD[i].name} milik ${p.name} kini dilindungi Jalur Dinasti`); };
    }
    else if (card === 'angel' || card === 'bebassewa') {
      if (!pend || pend.type !== 'bill' || !pend.to) fail(`${def.name} dipakai saat ada tagihan sewa.`);
      run = () => { game.pending = null; log(`${def.icon} ${def.name} membebaskan ${p.name} dari ${pend.reason.toLowerCase()}`); };
    } else if (card === 'wabah' || card === 'panggil') {
      const t = P(d.target);
      if (!t || t.bankrupt || t.id === p.id) fail('Pilih lawan.');
      const best = myBestRent(p);
      if (card === 'panggil' && best == null) fail('Kamu belum punya properti untuk memanggil lawan.');
      run = () => {
        if (shielded(t, p, def.name)) return;
        fx('seize');
        if (card === 'wabah') {
          const list = ownedBy(t.id); list.forEach(i => { game.props[i].slump = { turns: NORMAL.slumpTurns }; });
          log(`🦠 Wabah melanda ${list.length} properti ${t.name}: sewa turun 50% selama ${NORMAL.slumpTurns} giliran`);
        } else {
          t.pos = best; log(`📣 ${p.name} memanggil ${t.name} ke ${BOARD[best].name}`);
          pay(t, p, calcRent(best), 'sewa ' + BOARD[best].name);
        }
      };
    } else if (card === 'gempa' || card === 'badai' || card === 'tukar') {
      const i = Number(d.tile), pr = game.props[i], o = pr && pr.owner ? P(pr.owner) : null;
      if (!normalTargets(p, card).includes(i)) fail(card === 'gempa' ? 'Pilih kota lawan yang punya bangunan (bukan Landmark).' : card === 'badai' ? 'Pilih kota lawan yang punya bangunan.' : 'Pilih kota lawan yang belum jadi Landmark.');
      const mine = Number(d.mine);
      if (card === 'tukar' && !mySwappable(p).includes(mine)) fail('Pilih kotamu yang mau ditukar (belum Landmark).');
      run = () => {
        if (shielded(o, p, def.name)) return;
        fx('seize');
        if (card === 'gempa' || card === 'badai') {
          const was = pr.houses;
          pendantHook(o, 'buildingLost', { amount: BOARD[i].house * stepUnits(was) }); pr.houses = levelDown(was);
          tileFx(i, 'disaster');
          log(`${card === 'badai' ? '🌪️ Badai' : '🌋 Gempa'} dari ${p.name}! ${levelName(was)} di ${BOARD[i].name} milik ${o.name} turun jadi ${pr.houses ? levelName(pr.houses) : 'tanah kosong'}`);
        }
        else { game.props[mine].owner = o.id; pr.owner = p.id; log(`🔄 ${p.name} menukar ${BOARD[mine].name} dengan ${BOARD[i].name} milik ${o.name}`); }
      };
    } else if (['sabotase', 'akuisisi', 'kontrak'].includes(card)) {
      const i = Number(d.tile), pr = game.props[i], o = pr && pr.owner ? P(pr.owner) : null;
      if (!normalTargets(p, card).includes(i)) fail(card === 'akuisisi' ? 'Pilih properti lawan yang belum jadi Landmark.' : 'Pilih properti milik lawan.');
      run = () => {
        if (shielded(o, p, def.name)) return;
        fx('seize');
        if (card === 'sabotase') { pr.slump = { turns: NORMAL.slumpTurns }; log(`💣 ${p.name} menyabotase ${BOARD[i].name} milik ${o.name}: sewa turun 50% selama ${NORMAL.slumpTurns} giliran`); }
        if (card === 'akuisisi') { pr.owner = p.id; log(`📜 ${p.name} mengakuisisi ${BOARD[i].name}${pr.houses ? ' beserta bangunannya' : ''} dari ${o.name}`); }
        if (card === 'kontrak') { pr.lease = { by: p.id, from: o.id, turns: NORMAL.leaseTurns }; pr.owner = p.id; log(`🔑 ${p.name} mengontrak ${BOARD[i].name} milik ${o.name} selama ${NORMAL.leaseTurns} giliran`); }
      };
    }
    if (!run) fail('Kartu ini belum bisa dipakai.');
    if (fromPending) game.pending = null; else p.hand[card]--;
    fx('power');
    log(`${p.name} memakai kartu ${def.icon} ${def.name}`);
    run();
  },
  rollCard(p, d) {
    needTurn(p);
    const pend = game.pending;
    if (!pend || pend.type !== 'cardRoll') fail('Tidak ada kartu yang menunggu dikocok.');
    const card = cardAt(pend.deck, pend.idx);
    const shield = !!d.shield;
    if (shield && !(pend.deck === 'musibah' && card.scope === 'self')) fail('Doa Orang Tua tidak mempan untuk bencana bersama.');
    if (shield && !(p.hand.doa > 0)) fail('Kamu tidak punya Doa Orang Tua.');
    resolveCardRoll(p, pend, shield);
  },
  endTurn(p) {
    needTurn(p);
    if (!game.rolled) fail('Lempar dadu dulu.');
    needNoPending();
    if (p.money < 0) fail('Kamu masih terlilit utang. Gadaikan aset ke bank dulu.');
    nextTurn();
  },
  payJail(p) {
    needTurn(p); needNoPending();
    if (!p.inJail) fail('Kamu tidak sedang di penjara.');
    if (game.rolled) fail('Kamu sudah melempar dadu giliran ini.');
    if (p.money < JAIL_FINE) fail('Uangmu tidak cukup untuk membayar denda.');
    pay(p, null, JAIL_FINE, 'denda keluar penjara'); p.inJail = false; p.jailTurns = 0;
  },
  sell(p, d) {
    needPlayer(p); needPlaying();
    const i = +d.tile; needOwner(p, i);
    const t = BOARD[i], pr = game.props[i];
    if (!pr.houses) fail('Tidak ada bangunan untuk dijual.');
    if (pr.mortgaged) fail('Bangunan di tanah yang digadai ikut jadi jaminan bank. Tebus dulu kalau mau dijual.');
    const refund = t.house * stepUnits(pr.houses) / 2;
    pr.houses = levelDown(pr.houses); p.money += refund;
    fx('cash');
    log(`${p.name} menjual bangunan di ${t.name} ke bank (+${rp(refund)})`);
  },
  mortgage(p, d) {
    needPlayer(p); needPlaying();
    const i = +d.tile; needOwner(p, i);
    const t = BOARD[i], pr = game.props[i];
    if (pr.mortgaged) fail('Properti ini sudah digadaikan.');
    const value = mortgageValue(i);
    pr.mortgaged = true; pr.mortgageValue = value; p.money += value;
    fx('cash');
    log(`🏦 ${p.name} menggadaikan ${t.name}${pr.houses || pr.use ? ' beserta bangunannya' : ''} ke bank (pinjam ${rp(value)})`);
  },
  unmortgage(p, d) {
    needPlayer(p); needPlaying();
    const i = +d.tile; needOwner(p, i);
    const t = BOARD[i], pr = game.props[i];
    if (!pr.mortgaged) fail('Properti ini tidak sedang digadaikan.');
    const cost = Math.round((pr.mortgageValue || t.price / 2) * 1.1);
    if (p.money < cost) fail(`Uangmu kurang untuk menebus (${rp(cost)}).`);
    p.money -= cost; pr.mortgaged = false; pr.mortgageValue = 0;
    fx('pay');
    log(`${p.name} menebus ${t.name} dari bank (${rp(cost)})`);
  },
  // Menyerah saat terlilit utang.
  bankrupt(p) {
    needPlayer(p); needPlaying();
    if (p.bankrupt) return;
    if (p.money >= 0) fail('Kamu belum punya utang.');
    eliminate(p, p.debtTo ? P(p.debtTo) : null, 'karena menyerah pada utang');
    if (cur().id === p.id) { if (!checkWinner()) nextTurn(); } else checkWinner();
  },
  // 🏳️ Menyerah kapan saja: semua tanah kembali jadi tanah kosong milik negara, pemain keluar dan bisa menonton.
  surrender(p) {
    needPlayer(p); needPlaying();
    if (p.bankrupt) return;
    const myTurn = cur().id === p.id;
    // tagihan sewa pemain lain ke pemain yang menyerah ikut batal
    if (!myTurn && game.pending && game.pending.type === 'bill' && game.pending.to === p.id) { game.pending = null; log(`Tagihan ke ${p.name} batal karena dia menyerah`); }
    p.money = Math.max(0, p.money);
    eliminate(p, null, 'karena menyerah');
    if (myTurn) { game.pending = null; if (!checkWinner()) nextTurn(); } else checkWinner();
  },
  hostSkip(p) {
    needHost(p); needPlaying();
    const c = cur();
    if (isOnline(c)) fail(`${c.name} masih terhubung. Hanya pemain yang terputus yang bisa dilewati.`);
    log(`Host melewati giliran ${c.name} (terputus)`);
    nextTurn();
  },
  // Menghentikan permainan: hanya dari laptop server.
  hostEnd(p, d, socket) {
    needServerLaptop(socket); needPlaying();
    log('Host mengakhiri permainan. Yang masih bertahan diurutkan dari total kekayaan.');
    endGame();
  },
  reset(p, d, socket) {
    needServerLaptop(socket);
    const keep = game.players.filter(q => isOnline(q) || (p && q.id === p.id));
    const hostFirst = [P(game.hostId), ...keep.filter(q => q.id !== game.hostId)].filter(Boolean);
    game = newGame(hostFirst, game.mode, game.teams);
    applyTeams();
    log('Permainan baru dibuat. Menunggu host memulai.');
  }
};

function removePlayer(id) {
  game.players = game.players.filter(q => q.id !== id);
  if (game.teams) applyTeams();
  fs.rm(path.join(AVATAR_DIR, id + '.png'), { force: true }, () => {});
  if (game.hostId === id) game.hostId = (game.players.find(q => !q.bot) || {}).id || null;
}

function attach(socket, pid) {
  if (socket.data.pid === pid) return;
  if (socket.data.pid) online.set(socket.data.pid, Math.max(0, (online.get(socket.data.pid) || 1) - 1));
  socket.data.pid = pid;
  online.set(pid, (online.get(pid) || 0) + 1);
}

// Semua aksi (dari browser maupun bot) lewat sini: aturan dicek, lalu state dikirim ke semua layar.
function runAction(p, name, d, socket) {
  game.fx = []; game.notices = [];
  try {
    if (p && p.bankrupt && !['reset', 'hostEnd', 'hostSkip', 'setLook', 'setAvatar'].includes(name)) fail('Kamu sudah gugur, tapi tetap bisa menonton.');
    actions[name](p, d || {}, socket);
    settleDebts(false);
    if (game.fx.length || game.notices.length) game.fxSeq++;
    lastAction = { name, at: Date.now() };
    broadcast();
    return true;
  } catch (e) {
    game.fx = []; game.notices = [];
    if (!(e instanceof GameError)) console.error(e);
    if (socket) socket.emit('err', e instanceof GameError ? e.message : 'Terjadi kesalahan di server.');
    return e.message || 'error';
  }
}

/* ---------------- Bot ---------------- */
// Bot dijalankan server dengan jeda supaya animasi dadu, langkah bidak, dan kartu sempat terlihat.
let botTimer = null, lastAction = { name: '', at: 0 }, lastCardSeen = null, botFails = 0;

function scheduleBots() {
  if (botTimer || game.phase !== 'playing' || !game.players.some(p => p.bot && !p.bankrupt)) return;
  const cardSeq = game.lastCard && game.lastCard.seq;
  let delay = 900;
  if (lastAction.name === 'roll' || lastAction.name === 'travel') delay = 2600;
  if (lastAction.name === 'rollCard') delay = 2800;
  if (['upgrade', 'sell', 'mortgage', 'skip'].includes(lastAction.name)) delay = 450;
  if (cardSeq != null && cardSeq !== lastCardSeen) { delay += 2200; lastCardSeen = cardSeq; }
  botTimer = setTimeout(botTick, delay / BOT_SPEED);
}

function botTick() {
  botTimer = null;
  if (game.phase !== 'playing') return;
  const act = botDecide();
  if (!act) return;
  const [bot, name, data] = act;
  const res = runAction(bot, name, data, null);
  if (res === true) { botFails = 0; return; }
  // Aksi ditolak aturan (jarang terjadi): coba lagi, dan kalau terus macet lewati gilirannya.
  console.warn(`[bot] ${bot.name} gagal ${name}: ${res}`);
  if (++botFails >= 4 && cur().bot) {
    botFails = 0;
    log(`${cur().name} bingung, gilirannya dilewati`);
    nextTurn(); broadcast(); return;
  }
  scheduleBots();
}

function botDecide() {
  for (const b of game.players) if (b.bot && !b.bankrupt && b.money < 0) return [b, ...botRaiseCash(b)];
  const c = cur();
  if (!c || !c.bot || c.bankrupt) return null;
  const pend = game.pending;
  if (pend) {
    if (pend.type === 'buy') return botWantsBuy(c, pend.tile, pend.price) ? [c, 'buy', { level: botBuyLevel(c, pend.tile, pend.price) }] : [c, 'skip'];
    if (pend.type === 'startBuild') {
      const t = ownedBy(c.id).filter(i => upgradeOptions(c, i).length).sort((a, b) => BOARD[b].house - BOARD[a].house)[0];
      const up = t != null && botUpgrade(c, t);
      return up ? [c, 'upgrade', up] : [c, 'skip'];
    }
    if (pend.type === 'festival') {
      const mine = ownedBy(c.id).filter(i => BOARD[i].type === 'city' && !game.props[i].mortgaged);
      const keep = game.festival && mine.includes(game.festival.tile) ? game.festival.tile : null;
      const best = keep != null ? keep : mine.sort((a, b) => baseRent(b) - baseRent(a))[0];
      return best != null ? [c, 'festival', { tile: best }] : [c, 'festival', { skip: true }];
    }
    if (pend.type === 'slot') { const bet = [...NORMAL.slotBets].reverse().find(b => c.money - b > 6e6); return [c, 'slotPlay', { play: !!bet && Math.random() < 0.5, bet }]; }
    if (pend.type === 'takeover') return [c, 'takeover', { accept: c.money - pend.price > 4e6 }];
    if (pend.type === 'upgradeOffer') { const up = botUpgrade(c, pend.tile); return up ? [c, 'upgrade', up] : [c, 'skip']; }
    if (pend.type === 'power') return botPower(c, pend.card, true);
    if (pend.type === 'cardRoll') return [c, 'rollCard', { shield: botShouldShield(c, pend) }];
    if (pend.type === 'travel') return [c, 'travel', { tile: botTravelTarget(c, pend.row) }];
    if (pend.type === 'fire') return [c, 'fireChoice', { extinguish: c.pejabat > 0 || c.money >= LAND.fireCost + 1.5e6 }];
    if (pend.type === 'poison') return [c, 'poisonChoice', { pay: c.money >= LAND.poisonFine + 1e6 }];
    if (pend.type === 'bill') {
      if (c.hand.angel && pend.to && pend.amount >= 1e6) return [c, 'usePower', { card: 'angel' }];
      if (c.hand.bebassewa && pend.to && pend.amount >= 5e5) return [c, 'usePower', { card: 'bebassewa' }];
      if (c.money >= pend.amount) return [c, 'payBill'];
      if (c.hand.doa) return [c, 'usePower', { card: 'doa' }];
      if (c.hand.angel && pend.to) return [c, 'usePower', { card: 'angel' }];
      if (pend.to && !isNormal()) for (const n of [2, 4, 6]) { const per = Math.ceil(pend.amount * (1 + BANK.installmentFee[n]) / n / 1000) * 1000; if (c.money >= per + 5e5) return [c, 'installRent', { n }]; }
      if (canRaise(c)) return [c, ...botRaiseCash(c)];
      return [c, 'payBill'];
    }
  }
  if (!game.rolled) {
    if (c.pejabat > 0 && c.pejabatTake) {
      const t = Object.keys(game.props).map(Number).filter(i => { const o = game.props[i].owner && P(game.props[i].owner); return o && o.id !== c.id && !o.bankrupt && !guarded(i); })
        .sort((a, b) => (BOARD[b].price + game.props[b].houses * (BOARD[b].house || 0)) - (BOARD[a].price + game.props[a].houses * (BOARD[a].house || 0)))[0];
      if (t != null) return [c, 'pejabatTake', { tile: t }];
    }
    if (c.pejabat > 0 && c.pejabatClaim) {
      const t = BOARD.map((b, i) => i).filter(i => BOARD[i].type === 'city' && !game.props[i].owner).sort((a, b) => BOARD[b].price - BOARD[a].price)[0];
      if (t != null) return [c, 'pejabatClaim', { tile: t, kind: 'hotel' }];
    }
    if (c.inJail && c.hand.orangdalam) return [c, 'usePower', { card: 'orangdalam' }];
    if (c.inJail && c.money > 4e6) return [c, 'payJail'];
    for (const card of ['mafia', 'buzzer', 'dinasti', 'sabotase', 'akuisisi', 'kontrak', 'gempa', 'badai', 'wabah', 'panggil', 'tukar']) if (c.hand[card]) { const a = botPower(c, card, false); if (a) return a; }
    if (c.hand.doa > 1 || (c.hand.doa && c.money < 1e6)) return [c, 'usePower', { card: 'doa' }];
    if (c.freeUpgrades > 0) { const t = ownedBy(c.id).find(i => upgradeOptions(c, i).length); if (t != null) { const up = botUpgrade(c, t); if (up) return [c, 'upgrade', up]; } }
    const closed = ownedBy(c.id).find(i => game.props[i].closed > 0 && c.money > 6e6);
    if (closed != null) return [c, 'reopen', { tile: closed }];
    return [c, 'roll', { target: botAim(c) }];
  }
  const m = ownedBy(c.id).find(i => game.props[i].mortgaged && c.money - Math.round((game.props[i].mortgageValue || BOARD[i].price / 2) * 1.1) > 3e6);
  if (m != null) return [c, 'unmortgage', { tile: m }];
  return [c, 'endTurn'];
}

// Mode Normal: bangun setinggi mungkin selama sisa uang masih aman.
function botBuyLevel(p, i, price) {
  if (!isNormal() || BOARD[i].type !== 'city') return 0;
  for (let L = maxLevel(p); L > 0; L--) if (p.money - price - buildCost(p, i, 0, L) >= 2.5e6) return L;
  return 0;
}
// Bot memasang 4 liontin acak (kecuali Ganjil-Genap yang butuh pilihan manual).
function botPendants() { return shuffle(PENDANTS.filter(x => !(x.effects || []).some(e => e.mod === 'parity')).map(x => x.id)).slice(0, NORMAL.maxPendants); }
function botUpgrade(p, i) {
  const opts = upgradeOptions(p, i);
  if (!opts.length) return null;
  if (isNormal()) {
    const pay = p.vouchers > 0 ? 'voucher' : 'cash', price = o => (pay === 'voucher' ? o.cost * LAND.kprDiscount : o.cost);
    const o = opts.filter(o => p.money - price(o) >= 2.5e6).sort((a, b) => b.level - a.level)[0];
    return o ? { tile: i, kind: 'properti', level: o.level, pay } : null;
  }
  const pay = p.freeUpgrades > 0 ? 'free' : p.vouchers > 0 ? 'voucher' : 'cash';
  const price = o => pay === 'free' ? 0 : pay === 'voucher' ? o.cost * LAND.kprDiscount : o.cost;
  const land = opts.filter(o => o.kind !== 'properti' && (o.kind !== 'dapur' || p.money > 15e6));
  const o = land.length && Math.random() < 0.45 ? pick(land) : opts[0];
  return p.money - price(o) >= (pay === 'cash' ? 2.5e6 : 1.2e6) ? { tile: i, kind: o.kind, pay } : null;
}
function botRaiseCash(b) {
  const mine = ownedBy(b.id);
  const free = mine.filter(i => !game.props[i].mortgaged).sort((x, y) => mortgageValue(x) - mortgageValue(y))[0];
  if (free != null) return ['mortgage', { tile: free }];
  if (hasCollateral(b) && loanRoom(b) >= 100 * K) return ['borrow', { amount: Math.min(loanRoom(b), Math.ceil((-b.money + (game.pending && game.pending.amount || 0)) / 1e6) * 1e6 || 1e6) }];
  return ['bankrupt', {}];
}
function completesGroup(p, i) {
  const t = BOARD[i];
  return t.type === 'city' && groupTiles(t.group).every(j => j === i || game.props[j].owner === p.id);
}
// Bot memilih jumlah dadu yang mengarah ke petak paling menguntungkan.
function botAim(p) {
  let best = 7, score = -1e9;
  for (let s = 2; s <= 12; s++) {
    const i = (p.pos + s) % NT(), t = BOARD[i], pr = game.props[i];
    let v = 0;
    if (pr && !pr.owner) v = p.money >= landPrice(p, i) ? 3 : 0;
    else if (pr && (pr.owner === p.id || sameTeam(P(pr.owner), p))) v = 1;
    if (pr && !pr.owner && t.type === 'tourism' && p.money >= landPrice(p, i)) v += 3;
    else if (pr && pr.owner && !sameTeam(P(pr.owner), p)) v = -calcRent(i) / 1e5;
    else if (t.type === 'kesempatan') v = 1.5;
    else if (t.type === 'musibah') v = -1.5;
    else if (t.type === 'gotojail' || t.type === 'tax') v = -3;
    else if (t.type === 'travel') v = 2;
    if (v > score) { score = v; best = s; }
  }
  return best;
}
function botWantsBuy(p, i, offer) {
  const price = offer || landPrice(p, i);
  if (BOARD[i].type === 'tourism' && p.money >= price) return true;
  return p.money >= price && (p.money - price >= 2e6 || completesGroup(p, i));
}
// Travelling: cari tanah kosong yang terjangkau, utamakan yang melengkapi warna. Kalau tidak ada, diam saja.
function botTravelTarget(p, row) {
  const inRow = i => row == null || Math.floor(i / (NT() / 4)) === row;
  const urgent = BOARD.some((t, i) => t.type === 'tourism' && !game.props[i].owner) && (tourismOf(p.id) === NORMAL.tourismWin - 1 || rivalsOf(p).some(o => tourismOf(o.id) === NORMAL.tourismWin - 1));
  const free = BOARD.map((t, i) => i).filter(i => inRow(i) && isBuyable(i) && !game.props[i].owner && p.money - BOARD[i].price >= (urgent && BOARD[i].type === 'tourism' ? 0 : 1.5e6));
  const prio = i => completesGroup(p, i) + (BOARD[i].type === 'tourism' ? (urgent ? 10 : 0.5) : 0);
  free.sort((a, b) => (prio(b) - prio(a)) || (BOARD[b].price - BOARD[a].price));
  return free.length ? free[0] : p.pos;
}
function botPower(c, card, fromPending) {
  const keep = fromPending ? [c, 'keepCard'] : null;
  const rivals = alive().filter(o => o.id !== c.id);
  if (card === 'doa') return fromPending && c.money < 1.5e6 ? [c, 'usePower', { card }] : keep;
  if (card === 'buzzer') {
    const t = rivals.filter(o => o.money > 0).sort((x, y) => (x.hand.doa - y.hand.doa) || (y.money - x.money))[0];
    return t ? [c, 'usePower', { card, target: t.id }] : keep;
  }
  if (card === 'mafia') {
    const score = i => BOARD[i].price + (completesGroup(c, i) ? 1e8 : 0) - (P(game.props[i].owner).hand.doa ? 5e7 : 0);
    const i = mafiaTargets(c).sort((x, y) => score(y) - score(x))[0];
    return i != null ? [c, 'usePower', { card, tile: i }] : keep;
  }
  if (card === 'dinasti') {
    const worth = i => BOARD[i].price + game.props[i].houses * (BOARD[i].house || 0) + (game.props[i].use === 'tambang' || game.props[i].use === 'sawit' ? 2e6 : 0);
    const i = ownedBy(c.id).filter(i => !guarded(i)).sort((x, y) => worth(y) - worth(x))[0];
    return i != null ? [c, 'usePower', { card, tile: i }] : keep;
  }
  if (['sabotase', 'akuisisi', 'kontrak'].includes(card)) {
    const val = i => (card === 'akuisisi' ? assetValue(i) : calcRent(i));
    const i = normalTargets(c, card).sort((x, y) => val(y) - val(x))[0];
    return i != null ? [c, 'usePower', { card, tile: i }] : keep;
  }
  if (card === 'gempa' || card === 'badai') {
    const i = normalTargets(c, card).sort((x, y) => game.props[y].houses - game.props[x].houses)[0];
    return i != null ? [c, 'usePower', { card, tile: i }] : keep;
  }
  if (card === 'wabah' || card === 'panggil') {
    const worth = o => ownedBy(o.id).reduce((s, i) => s + assetValue(i), 0);
    const t = rivalsOf(c).sort((x, y) => (card === 'wabah' ? worth(y) - worth(x) : y.money - x.money))[0];
    if (!t || (card === 'panggil' && (myBestRent(c) == null || calcRent(myBestRent(c)) < 5e5))) return keep;
    return [c, 'usePower', { card, target: t.id }];
  }
  if (card === 'tukar') {
    const mine = mySwappable(c).sort((x, y) => assetValue(x) - assetValue(y))[0];
    const theirs = normalTargets(c, 'tukar').sort((x, y) => assetValue(y) - assetValue(x))[0];
    return mine != null && theirs != null && assetValue(theirs) > assetValue(mine) ? [c, 'usePower', { card, tile: theirs, mine }] : keep;
  }
  return keep; // Orang Dalam, Angel, Bebas Tol & Bebas Pajak disimpan untuk nanti
}
function botShouldShield(p, pend) {
  const card = cardAt(pend.deck, pend.idx);
  if (pend.deck !== 'musibah' || card.scope !== 'self' || !(p.hand.doa > 0)) return false;
  const effects = card.tiers ? card.tiers.flatMap(t => t.effects) : card.effects;
  const severe = effects.some(e => ['seize', 'seizeBest', 'landgrab', 'jail', 'pct', 'loseCards', 'loseCard'].includes(e.type));
  return severe || p.money < 3e6;
}
/* ---------------- Socket ---------------- */
io.on('connection', socket => {
  socket.data.admin = isLocalAddress(socket.handshake.address);
  socket.emit('welcome', {
    serverLaptop: socket.data.admin,
    board: BOARD, boards: { wni: BOARD_WNI, normal: NORMAL_BOARD }, pendants: PENDANTS, build: BUILD, gameMinutes: GAME_MINUTES, taxPerProperty: TAX_PER_PROPERTY, turnIdleSeconds: TURN_IDLE_SECONDS, normal: NORMAL, normalAvatars: NORMAL_AVATARS, groupColors: GROUP_COLORS, colors: PLAYER_COLORS, looks: LOOKS, powers: POWERS,
    salary: SALARY, startMoney: START_MONEY, avatarStats: AVATAR_STATS, bank: BANK, jailFine: JAIL_FINE, doaReward: DOA_REWARD, land: LAND, k: K, maxPlayers: MAX_PLAYERS
  });
  socket.on('hello', d => {
    const q = d && d.pid ? P(d.pid) : null;
    if (q && !q.bot) { attach(socket, q.id); socket.emit('joined', { pid: q.id }); }
    else socket.emit('joined', { pid: null });
    broadcast();
  });
  for (const name of Object.keys(actions)) {
    socket.on(name, d => runAction(socket.data.pid ? P(socket.data.pid) : null, name, d, socket));
  }
  socket.on('disconnect', () => {
    const pid = socket.data.pid;
    if (pid) { online.set(pid, Math.max(0, (online.get(pid) || 1) - 1)); broadcast(); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const urls = lanUrls();
  console.log('\n  Juragan Nusantara siap dimainkan!\n');
  console.log(`  Di komputer ini : http://localhost:${PORT}`);
  if (urls.length) {
    console.log('  Dari HP/laptop teman (Wi-Fi yang sama):');
    urls.forEach(u => console.log('    ' + u));
    try {
      const qr = require('qrcode-terminal');
      console.log('\n  Atau pindai QR ini:');
      qr.generate(urls[0], { small: true });
    } catch (e) { /* qrcode-terminal opsional */ }
  } else {
    console.log('  Tidak ada jaringan terdeteksi. Sambungkan komputer ke Wi-Fi dulu.');
  }
  console.log('\n  Tekan Ctrl+C untuk berhenti.\n');
  scheduleBots();
});

module.exports = { server, io };
