// Uji otomatis: 2 pemain lewat Socket.IO + 4 bot server bermain sampai tinggal satu yang bertahan.
// Jalankan: BOT_SPEED=200 PORT=3100 node server.js  (terminal lain)  lalu  node test/bots.js
'use strict';
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const NAMES = ['Ani', 'Budi'];
const COLORS = ['merah', 'biru'];
// PNG 1x1 piksel untuk menguji unggah foto avatar.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const errMsgs = {};
let pendants = [], pendantHits = {}, seenLog = new Set(), skillHits = {}, turns = 0, owners = {}, namedTurns = {};
// Pola catatan permainan untuk tiap skill avatar
const SKILL_LOG = { lubang: /siap membuka lubang hitam|tersedot lubang hitam milik/, terkam: /menerkam/, santet: /menyantet/, pelan: /Pelan tapi Pasti/, preman: /memalak/, lapak: /jajan di lapak [^)]/, segel: /menyegel/, penagih: /ditagih utang/, usil: /usil mencuri/, tameng: /Tameng Baja/, antar: /Antar Jemput:/, harta: /Harta Naga/, titah: /Titah Raja/, proyek: /Proyek Titipan/, seret: /menyeret/, kokok: /Kokok Pagi/, mulus: /mendarat mulus/, jalan: /Terbang Bebas!/, setoran: /setoran angkot/, gentayangan: /digentayangi/, colong: /dicolong tuyul/, teror: /meneror/, panen: /Panen Raya/, nego: /mengambil alih/ };
let state = null, board = null, actions = 0, serverErrors = 0, gameErrors = 0;
const seen = { kesempatan: 0, musibah: 0, power: 0, shield: 0, seize: 0, dice1: 0, travel: 0, bankrupt: 0, events: 0, special: 0 };
const bots = [];

function connect(i) {
  return new Promise(res => {
    const s = io(URL, { forceNew: true, transports: ['websocket'] });
    const bot = { s, pid: null, name: NAMES[i] };
    s.on('welcome', w => { board = process.env.MODE === 'normal' ? w.boards.normal : w.board; pendants = w.pendants || []; });
    s.on('joined', d => { if (d.pid) { bot.pid = d.pid; res(bot); } });
    s.on('state', st => {
      if (state && st.lastCard && (!state.lastCard || st.lastCard.seq !== state.lastCard.seq)) { seen[st.lastCard.deck]++; if (st.lastCard.event) seen.events++; if (st.lastCard.special) seen.special++; }
      if (state && st.fx.seq !== state.fx.seq) st.fx.list.forEach(f => { if (f in seen) seen[f]++; });
      for (const l of st.log) if (!seenLog.has(l.t + l.msg)) { seenLog.add(l.t + l.msg); for (const x of pendants) if (l.msg.includes(x.name)) pendantHits[x.id] = (pendantHits[x.id] || 0) + 1;
        for (const [k, re] of Object.entries(SKILL_LOG)) if (re.test(l.msg)) skillHits[k] = (skillHits[k] || 0) + 1;
        if (/^Giliran /.test(l.msg)) { turns++; const nm = l.msg.slice(8); namedTurns[nm] = (namedTurns[nm] || 0) + 1; } }
      for (const q of st.players) { owners[q.look && q.look.model] = (owners[q.look && q.look.model] || 0) + 0; for (const id of q.pendants || []) owners['p:' + id] = 1; }
      state = st;
    });
    s.on('err', m => { if (/kesalahan di server/.test(m)) { serverErrors++; console.log('SERVER ERROR', m); } else { gameErrors++; errMsgs[m] = (errMsgs[m] || 0) + 1; } });
    s.on('connect', () => {
      s.emit('hello', {});
      setTimeout(() => s.emit('join', { name: NAMES[i], color: COLORS[i], look: { baju: 'batik', topi: 'peci' }, photo: i === 0 ? PNG : undefined }), 50);
    });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const owned = pid => Object.keys(state.props).map(Number).filter(i => state.props[i].owner === pid);

function raiseCash(b, q) {
  const mine = owned(q.id);
  const withHouse = mine.filter(i => state.props[i].houses > 0 && !state.props[i].mortgaged).sort((x, y) => state.props[y].houses - state.props[x].houses)[0];
  const free = mine.find(i => !state.props[i].mortgaged && !state.props[i].houses);
  if (withHouse != null) b.s.emit('sell', { tile: withHouse });
  else if (free != null) b.s.emit('mortgage', { tile: free });
  // semua aset sudah digadai: bank tidak mau meminjami, jadi bangkrut
  else b.s.emit('bankrupt');
}

const st0Models = () => state ? state.players.map(q => (q.look && q.look.model) || 'manusia') : [];
(async () => {
  for (let i = 0; i < 2; i++) bots.push(await connect(i));
  await sleep(200);
  if (process.env.MODE) { bots[0].s.emit('setMode', { mode: process.env.MODE }); await sleep(100); }
  // pemain socket memasang 4 liontin acak, salah satunya Ganjil-Genap
  for (const b of bots) b.s.emit('setPendants', { ids: process.env.PENDANTS ? process.env.PENDANTS.split(',') : ['ganjil_genap', ...pendants.map(x => x.id).filter(x => x !== 'ganjil_genap').sort(() => Math.random() - 0.5).slice(0, 3)] });
  for (let i = 0; i < (+process.env.BOTS || 4); i++) bots[0].s.emit('addBot');
  await sleep(200);
  if (process.env.TEAMS) { bots[0].s.emit('setTeams', { on: true }); await sleep(150); }
  const me = state.players.find(p => p.id === bots[0].pid);
  const res = await fetch(`${URL}/avatar/${me.id}?v=${me.photo}`);
  console.log('avatar upload ok:', res.status === 200 && res.headers.get('content-type').includes('png'));
  console.log('players in lobby:', state.players.map(p => p.name + (p.bot ? ' (bot)' : '')).join(', '));
  bots[0].s.emit('start');
  await sleep(200);
  const t0 = Date.now();
  while (state && state.phase === 'playing' && actions < 20000 && Date.now() - t0 < 240000) {
    // pemain socket yang minus: lunasi / bangkrut
    for (const b of bots) { const q = state.players.find(p => p.id === b.pid); if (q && !q.bankrupt && q.money < 0) raiseCash(b, q); }
    const c = state.players[state.turn];
    const bot = bots.find(b => b.pid === c.id);
    if (!bot || c.money < 0) { await sleep(3); continue; }
    const pend = state.pending;
    if (pend && pend.type === 'buy') {
      bot.s.emit(c.money >= board[pend.tile].price ? 'buy' : 'skip', { level: Math.floor(Math.random() * 4) });
    } else if (pend && pend.type === 'bill') {
      const liquid = owned(c.id).some(i => state.props[i].houses > 0 || !state.props[i].mortgaged);
      const room = owned(c.id).some(i => !state.props[i].mortgaged) ? ((c.pendants || []).includes('kredit_lunak') ? 30000000 : 20000000) - (c.loanPrincipal || 0) : 0;
      if (c.money >= pend.amount) bot.s.emit('payBill');
      else if (pend.to && state.mode !== 'normal' && Math.random() < 0.4) bot.s.emit('installRent', { n: [2, 4, 6][Math.floor(Math.random() * 3)] });
      else if (!liquid && !c.hand.doa && room >= 1000000) bot.s.emit('borrow', { amount: Math.min(room, Math.ceil((pend.amount - c.money) / 1e6) * 1e6) });
      else if (!liquid && !c.hand.doa) bot.s.emit('payBill');
      else if (c.hand.doa) bot.s.emit('usePower', { card: 'doa' });
      else raiseCash(bot, c);
    } else if (pend && pend.type === 'travel') {
      { const sd = board.length / 4, opts = board.map((t, i) => i).filter(i => pend.row == null || Math.floor(i / sd) === pend.row); bot.s.emit('travel', { tile: opts[Math.floor(Math.random() * opts.length)] }); }
    } else if (pend && pend.type === 'festival') {
      const mine = owned(c.id).filter(i => board[i].type === 'city' && !state.props[i].mortgaged);
      bot.s.emit('festival', mine.length ? { tile: mine[0] } : { skip: true });
    } else if (pend && pend.type === 'slot') {
      bot.s.emit('slotPlay', { play: c.money > 4000000 && Math.random() < 0.5, bet: [3000000, 1000000, 300000][Math.floor(Math.random() * 3)] });
    } else if (pend && pend.type === 'takeover') {
      bot.s.emit('takeover', { accept: Math.random() < 0.5 });
    } else if (pend && pend.type === 'poison') {
      bot.s.emit('poisonChoice', { pay: c.money >= 3000000 && Math.random() < 0.5 });
    } else if (pend && pend.type === 'fire') {
      bot.s.emit('fireChoice', { extinguish: c.money >= 500000 && Math.random() < 0.5 });
    } else if (pend && pend.type === 'ojolStep') {
      bot.s.emit('ojolStep', { adj: [-1, 0, 1][Math.floor(Math.random() * 3)] });
    } else if (pend && pend.type === 'startBuild') {
      const t = owned(c.id).find(i => board[i].type === 'city' && !state.props[i].mortgaged && state.props[i].houses < 5);
      if (t != null && Math.random() < 0.6) { const h = state.props[t].houses; bot.s.emit('upgrade', { tile: t, kind: 'properti', level: h === 3 ? 5 : h + 1, pay: 'cash' }); await sleep(4); }
      if (state.pending && state.pending.type === 'startBuild') bot.s.emit('skip');
    } else if (pend && pend.type === 'upgradeOffer') {
      const kind = ['properti', 'tambang', 'sawit'][Math.floor(Math.random() * 3)];
      const h = state.props[pend.tile].houses, level = h === 3 ? 5 : h + 1 + Math.floor(Math.random() * (3 - h));
      if (Math.random() < 0.5) bot.s.emit('upgrade', { tile: pend.tile, kind, level, pay: c.freeUpgrades ? 'free' : c.vouchers ? 'voucher' : 'cash' });
      await sleep(4);
      if (state.pending && state.pending.type === 'upgradeOffer') bot.s.emit('skip');
    } else if (pend && pend.type === 'power') {
      const others = state.players.filter(q => !q.bankrupt && q.id !== c.id);
      const tiles = Object.keys(state.props).map(Number).filter(i => state.props[i].owner && state.props[i].owner !== c.id &&
        !state.players.find(q => q.id === state.props[i].owner).bankrupt && !state.props[i].houses);
      if (Math.random() < 0.5) bot.s.emit('keepCard');
      else bot.s.emit('usePower', { card: pend.card, target: others[0] && others[0].id, tile: tiles[0] });
    } else if (pend && pend.type === 'cardRoll') {
      bot.s.emit('rollCard', { shield: Math.random() < 0.3 && c.hand.doa > 0 });
    } else if (!state.rolled) {
      const land = owned(c.id).find(i => board[i].type === 'city' && !state.props[i].mortgaged && !state.props[i].houses && !state.props[i].use);
      if (state.mode !== 'normal' && (c.vouchers || c.freeUpgrades) && land != null && c.money > 1500000) bot.s.emit('upgrade', { tile: land, kind: ['tambang', 'sawit', 'properti', 'dapur'][Math.floor(Math.random() * 4)], pay: c.freeUpgrades ? 'free' : 'voucher' });
      else if (c.inJail && c.hand.orangdalam) bot.s.emit('usePower', { card: 'orangdalam' });
      else if (c.hand.buzzer) bot.s.emit('usePower', { card: 'buzzer', target: state.players.find(q => !q.bankrupt && q.id !== c.id).id });
      else if (c.inJail && Math.random() < 0.3 && c.money > 2000000) bot.s.emit('payJail');
      else if (state.mode === 'normal' && (c.pendants || []).includes('ganjil_genap') && c.parity === 0 && c.money > 8000000 && Math.random() < 0.3) bot.s.emit('buyParity');
      else bot.s.emit('roll', c.parity > 0 && Math.random() < 0.5 ? { parity: Math.random() < 0.5 ? 'odd' : 'even' } : {});
      await sleep(5);
    } else {
      const closed = owned(c.id).find(i => state.props[i].closed > 0);
      if (closed != null && c.money > 3000000) bot.s.emit('reopen', { tile: closed });
      await sleep(5);
      bot.s.emit('endTurn');
    }
    actions++;
    await sleep(8);
  }
  await sleep(100);
  console.log(JSON.stringify({
    pendantHits, skillHits, turns, namedTurns, roster: state.players.map(q => ({ name: q.name, model: (q.look && q.look.model) || 'manusia', pendants: q.pendants || [] })),
    errMsgs: Object.entries(errMsgs).sort((a, b) => b[1] - a[1]).slice(0, 6),
    phase: state.phase, actions, seconds: (Date.now() - t0) / 1000, serverErrors, gameErrors, seen,
    winner: state.winner && state.players.find(p => p.id === state.winner).name, winBy: state.winBy, winTeam: state.winTeam, teams: state.teams,
    players: state.players.map(p => ({ n: p.name, bot: p.bot, money: p.money, out: p.outAt || 0, laps: p.laps, props: owned(p.id).length, uses: owned(p.id).map(i => state.props[i].use).filter(Boolean).join(',') })),
    specialAdded: state.specialAdded,
    lastLog: state.log.slice(-8).map(l => l.msg)
  }, null, 1));
  // tes reconnect: pemain pertama putus lalu sambung lagi dengan pid yang sama
  const pid = bots[0].pid; bots[0].s.disconnect();
  await sleep(100);
  const s2 = io(URL, { forceNew: true, transports: ['websocket'] });
  s2.on('joined', d => { console.log('reconnect ok:', d.pid === pid); s2.close(); bots.forEach(b => b.s.close()); process.exit(serverErrors || state.phase !== 'ended' ? 1 : 0); });
  s2.on('connect', () => s2.emit('hello', { pid }));
})();
