// Tampilan pemain Juragan Nusantara: lobi, editor avatar, papan 3D, kartu, tagihan, dan suara.
// Semua aturan ada di server; browser hanya mengirim aksi dan menampilkan state.
import { createBoardScene, tileIcon } from './scene.js';
import { createPreview } from './avatar.js';
import { sound } from './sound.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => (n < 0 ? '-' : '') + 'Rp ' + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const rpS = n => { const a = Math.abs(n); const s = a >= 1e6 ? (Math.round(a / 1e5) / 10).toString().replace('.', ',') + ' jt' : Math.round(a / 1e3) + ' rb'; return (n < 0 ? '-' : '') + 'Rp ' + s; };
const COLOR_NAMES = { lime: 'Hijau Lime', navy: 'Biru Dongker', marun: 'Merah Marun', salem: 'Salem', lavender: 'Lavender', mint: 'Mint', abu: 'Abu-abu', putih: 'Putih Tulang', zaitun: 'Hijau Zaitun', langit: 'Biru Langit', merah: 'Merah Cabai', biru: 'Biru Laut', hijau: 'Hijau Daun', oranye: 'Oranye Jeruk', ungu: 'Ungu Terong', pink: 'Pink Jambu', toska: 'Toska', coklat: 'Coklat Kopi', hitam: 'Hitam Arang', emas: 'Emas' };
const slot = new URLSearchParams(location.search).get('slot') || '';
const PID_KEY = 'jn_pid' + slot, DRAFT_KEY = 'jn_draft' + slot;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* penuh / mode privat */ } }
};

let me = store.get(PID_KEY), S = null, W = null, watching = new URLSearchParams(location.search).has('tv');
let urls = [], board3d = null, lastDiceSeq = null, lastCardSeq = null, lastFxSeq = null, lastAnnounceSeq = null;
let joinEditor = null, lobbyEditor = null, modalEditor = null;

const socket = io();
socket.on('connect', () => socket.emit('hello', { pid: me }));
// Server di-restart dengan kode tampilan baru: muat ulang halaman sendiri (pemain tetap sama karena pid tersimpan).
let pageBuild = null;
socket.on('welcome', w => { if (pageBuild && w.build && w.build !== pageBuild) { location.reload(); return; } pageBuild = w.build || pageBuild; W = w; W.board = W.boards ? W.boards.wni : W.board; if (S) syncMode(); if (board3d) board3d.setBoard(W.board, W.groupColors); render(); });
socket.on('pendants', list => { if (W) { W.pendants = list; render(); } });
socket.on('joined', d => { me = d.pid; store.set(PID_KEY, me); render(); });
socket.on('state', st => { const prev = S; S = st; if (W) syncMode(); onState(prev); render(); });
// Mode WNI / Normal punya papan, stat, dan musik sendiri.
function syncMode() {
  const b = (W.boards && W.boards[S.mode || 'wni']) || W.board;
  if (b !== W.board) { W.board = b; if (board3d) { board3d.setBoard(b, W.groupColors); board3d.redraw(); } }
  sound.setTrack(S.mode === 'normal' ? 'bgm_normal' : 'bgm');
}
const isNormal = () => S && S.mode === 'normal';
// Stat avatar sesuai mode (mode Normal: modal sama untuk semua + skill unik).
const statFor = model => (isNormal() ? { ...(W.normalAvatars[model] || W.normalAvatars.manusia), start: W.normal.startMoney } : W.avatarStats[model] || {});
const modelOfP = p => (p && p.look && p.look.model) || 'manusia';
const TEAM_COLORS = ['merah', 'biru', 'hijau', 'oranye', 'ungu', 'pink', 'toska', 'coklat', 'hitam', 'emas'];
const teamName = t => 'Tim ' + TEAM_COLORS[t % TEAM_COLORS.length].replace(/^./, c => c.toUpperCase());
const sideKeyC = q => (S.teams ? 't' + q.team : q.id);
const teamBadge = q => (S.teams && q.team != null ? `<span class="badge team" style="background:${hex(q.color)}">${teamName(q.team)}</span>` : '');
// Kemajuan Line / Triple / Wisata untuk satu pemain atau satu tim
function winProgressC(key) {
  const B = W.board, sd = B.length / 4;
  const owns = i => { const pr = S.props[i]; const o = pr && P(pr.lease ? pr.lease.from : pr.owner); return !!o && !o.bankrupt && sideKeyC(o) === key; };
  const buyable = i => !!S.props[i];
  const groups = [...new Set(B.filter(t => t.type === 'city').map(t => t.group))].map(g => B.map((t, i) => (t.group === g ? i : -1)).filter(i => i >= 0));
  const lines = [0, 1, 2, 3].map(sd0 => B.map((t, i) => i).filter(i => Math.floor(i / sd) === sd0 && buyable(i)));
  return {
    tourism: B.filter((t, i) => t.type === 'tourism' && owns(i)).length,
    triple: groups.filter(g => g.every(owns)).length,
    line: Math.max(...lines.map(l => l.filter(owns).length)), lineOf: lines[lines.map(l => l.filter(owns).length).indexOf(Math.max(...lines.map(l => l.filter(owns).length)))].length
  };
}
const pendantsOfP = p => (isNormal() && p && p.pendants ? p.pendants.map(id => (W.pendants || []).find(x => x.id === id)).filter(Boolean) : []);
const pmodC = (p, key) => pendantsOfP(p).reduce((a, x) => a + (x.effects || []).filter(e => e.mod === key).reduce((b, e) => b + (+e.value || 0), 0), 0);
function statsOfP(p) {
  const st = { ...statFor(modelOfP(p)) };
  if (isNormal()) for (const k of ['land', 'build', 'dice']) st[k] = Math.min(0.9, (st[k] || 0) + pendantsOfP(p).reduce((a, x) => a + (+(x.stats || {})[k] || 0), 0));
  return st;
}
socket.on('err', m => toast(m, true));
socket.on('disconnect', () => toast('Koneksi ke server terputus. Mencoba menyambung lagi…', true));
fetch('/info').then(r => r.json()).then(d => { urls = d.urls || []; render(); }).catch(() => {});

const emit = (ev, d) => socket.emit(ev, d || {});
// Toast info diantrikan (masing-masing tampil minimal ~1,6 detik); toast error langsung tampil.
const toastQ = [];
function toast(msg, err) {
  if (err) return showToast(msg, true);
  toastQ.push(msg);
  if (toastQ.length === 1) showToast(msg, false);
}
function showToast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3400);
  if (err) return;
  clearTimeout(toast.q); toast.q = setTimeout(() => { toastQ.shift(); if (toastQ.length) showToast(toastQ[0], false); }, toastQ.length > 1 ? 1600 : 3400);
}
const P = id => S && S.players.find(p => p.id === id);
const meP = () => P(me);
const cur = () => S && S.players[S.turn];
const myTurn = () => { const c = cur(), p = meP(); return !!(p && c && c.id === me && S.phase === 'playing' && !p.bankrupt); };
const hex = key => (W && W.colors[key]) || '#999';
const photoUrl = p => p.photo ? `/avatar/${p.id}?v=${p.photo}` : null;
function face(p, cls = 'face') {
  const url = photoUrl(p);
  return `<span class="${cls}" style="--c:${hex(p.color)};${url ? `background-image:url('${url}')` : ''}">${url ? '' : esc(p.name[0].toUpperCase())}</span>`;
}

/* ---------- Event dari state (suara, animasi, kartu) ---------- */
function afterMoves(fn) { if (board3d) board3d.whenIdle(fn); else fn(); }
// Toast kecil saat skill avatar atau liontinku aktif, supaya terasa (dibaca dari catatan permainan).
const SKILL_LOG = { lubang: /siap membuka lubang hitam|tersedot lubang hitam milik/, terkam: /menerkam/, santet: /menyantet/, pelan: /Pelan tapi Pasti/, preman: /memalak/, lapak: /jajan di lapak [^)]/, segel: /menyegel/, penagih: /ditagih utang/, usil: /usil mencuri/, tameng: /Tameng Baja/, antar: /Antar Jemput:/, harta: /Harta Naga/, titah: /Titah Raja/, proyek: /Proyek Titipan/, seret: /menyeret/, kokok: /Kokok Pagi/, mulus: /mendarat mulus/, jalan: /Terbang Bebas!/, setoran: /setoran angkot/,
  gentayangan: /digentayangi/, colong: /dicolong tuyul/, teror: /meneror/, panen: /Panen Raya/ };
function announceMyEffects(prev) {
  const p = meP(); if (!p) return;
  const seen = new Set(prev.log.map(l => l.t + l.msg));
  const fresh = S.log.filter(l => !seen.has(l.t + l.msg) && l.msg.includes(p.name)).map(l => l.msg);
  const sk = W.normalAvatars[modelOfP(p)], hits = [];
  if (sk && SKILL_LOG[sk.skill] && fresh.some(m => SKILL_LOG[sk.skill].test(m))) hits.push(`${sk.icon} Skill ${sk.name} aktif!`);
  for (const x of pendantsOfP(p)) if (fresh.some(m => m.includes(x.name) && (m.includes(`(${p.name})`) || !/\(([^)]+)\):/.test(m)))) hits.push(`${x.icon} ${x.name} aktif!`);
  hits.slice(0, 2).forEach((h, k) => afterMoves(() => setTimeout(() => toast(h), k * 700)));
}
function onState(prev) {
  if (S.phase === 'lobby') {
    lastDiceSeq = S.diceSeq; lastCardSeq = S.lastCard ? S.lastCard.seq : 0; lastFxSeq = S.fx.seq; lastAnnounceSeq = S.announce ? S.announce.seq : 0;
    return;
  }
  ensureBoard();
  if (lastDiceSeq !== null && S.diceSeq !== lastDiceSeq) { board3d && board3d.rollDice(S.dice); sound.play('dice'); }
  else if (lastDiceSeq === null && board3d) board3d.setDiceStatic(S.dice);
  lastDiceSeq = S.diceSeq;
  if (board3d) board3d.update(S, me, id => { const q = P(id); return q ? hex(q.color) : null; });
  if (prev && prev.phase === 'playing' && isNormal()) announceMyEffects(prev);
  {
    const was = prev && prev.players.find(q => q.id === me), now = meP(), pc = prev && prev.players[prev.turn];
    if (was && now && !now.bankrupt && was.pos !== now.pos && pc && pc.id !== me) afterMoves(() => toast(`📍 Kamu dipindah ke ${W.board[now.pos].name}`));
  }
  // Efek di petak (pemadaman, bencana, tarikan) setelah bidak berhenti
  const tf = S.tileFx;
  if (tf && prev && prev.phase === 'playing' && (!prev.tileFx || prev.tileFx.seq !== tf.seq) && board3d) afterMoves(() => board3d.tileEffect(tf.tile, tf.kind));
  // efek suara dari server diputar setelah bidak sampai (dadu kartu punya animasinya sendiri)
  if (lastFxSeq !== null && S.fx.seq !== lastFxSeq) {
    // Gajian / sewa untukku: suara dan toast khusus supaya terasa.
    const badges = (S.fx.notices || []).filter(n => n.type === 'pendant' || n.type === 'skill');
    if (badges.length && board3d) afterMoves(() => badges.forEach(n => board3d.badge(n.pid, (n.type === 'skill' ? '✨ ' : '') + n.text + ' aktif!', n.type)));
    const mine = (S.fx.notices || []).filter(n => n.to === me);
    const list = S.fx.list.filter(f => f !== 'dice1' && f !== 'ultra' && !(mine.length && f === 'cash')).slice(0, 3);
    afterMoves(() => {
      list.forEach((f, k) => setTimeout(() => sound.play(f), k * 180));
      mine.forEach((n, k) => setTimeout(() => {
        sound.play({ payday: 'gajian', rent: 'sewa', dapur: 'cash' }[n.type] || 'cash');
        toast(n.type === 'payday' ? `💰 Gajian! +${rp(n.amount)}` : n.type === 'dapur' ? `🍱 Hasil Dapur Gizi +${rp(n.amount)}` : `🏠 ${n.from} membayar ${n.reason.toLowerCase()} ${rp(n.amount)} kepadamu`);
        flashMoney();
        try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) { /* tidak didukung */ }
      }, 150 + k * 1100));
    });
  }
  lastFxSeq = S.fx.seq;
  const ls = S.lastSlot;
  if (ls && lastSlotSeq !== null && ls.seq !== lastSlotSeq) afterMoves(() => showSlot(ls));
  lastSlotSeq = ls ? ls.seq : 0;
  const lc = S.lastCard;
  if (lc && lastCardSeq !== null && lc.seq !== lastCardSeq) {
    const seq = lc.seq;
    afterMoves(() => {
      const card = S.lastCard && S.lastCard.seq === seq ? S.lastCard : lc;
      if (!card.event) board3d && board3d.flipCard(card.deck);
      if (card.ultra) { sound.play('ultra'); shakeScreen(); }
      else { sound.play('card'); setTimeout(() => sound.play(card.deck), 250); }
      pushPopup({ kind: 'card', ...card });
    });
  } else if (lc) updatePopupCard(lc);
  lastCardSeq = lc ? lc.seq : 0;
  const an = S.announce;
  if (an && lastAnnounceSeq !== null && an.seq !== lastAnnounceSeq) afterMoves(() => pushPopup({ kind: 'announce', ...an, seq: 'a' + an.seq }));
  lastAnnounceSeq = an ? an.seq : 0;
  if (myTurn() && (!prev || (prev.players[prev.turn] || {}).id !== me || prev.phase !== 'playing')) {
    afterMoves(() => {
      if (!myTurn()) return;
      sound.play('turn'); toast('Giliranmu! Lempar dadu.');
      try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { /* tidak didukung */ }
    });
  }
  // lembar tagihan / upgrade / travelling baru muncul setelah bidak sampai
  const key = sheetKey();
  if (key && key !== sheetReadyKey && key !== sheetPendingKey) { sheetPendingKey = key; afterMoves(() => { sheetReadyKey = key; sheetPendingKey = null; renderSheet(); }); }
}

// Guncangan layar + kamera untuk kejadian langka.
function shakeScreen() {
  const g = $('#game');
  g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
  setTimeout(() => g.classList.remove('shake'), 1600);
  board3d && board3d.shake(1600);
}
// Kartu pemainku berkedip hijau saat menerima uang.
function flashMoney() {
  const el = document.querySelector('.pcard.me');
  if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// Mesin Game: gulungan berputar, tekan STOP (atau tunggu) untuk menghentikan satu per satu.
let lastSlotSeq = null;
function showSlot(ls) {
  const who = P(ls.player), mine = ls.player === me, N = W.normal;
  const zonk = ls.kind ? ls.kind === 'zonk' : !ls.win;
  if (!mine) { toast(`🎰 ${who ? who.name : ''}: ${ls.reels.join(' ')} ${zonk ? '→ zonk' : '→ menang ' + rpS(ls.win)}`); return; }
  const el = $('#slotm');
  el.hidden = false;
  el.innerHTML = `<div class="sheet-card slot-card"><h2>🎰 Mesin Game</h2>
    <div class="slot-reels">${[0, 1, 2].map(k => `<div class="reel spin" data-r="${k}"><span>❔</span></div>`).join('')}</div>
    <div class="row" style="justify-content:center;margin-top:12px">${[0, 1, 2].map(k => `<button class="btn y" data-stop="${k}">STOP</button>`).join('')}</div>
    <p class="slot-result" hidden></p><div class="row" style="justify-content:center"><button class="btn" data-close hidden>Tutup</button></div></div>`;
  sound.play('slot');
  const stopped = [false, false, false];
  const timers = [0, 1, 2].map(k => setInterval(() => {
    if (stopped[k]) return;
    const spin = N.slotWild ? [...N.slotSymbols, N.slotWild] : N.slotSymbols;
    el.querySelector(`[data-r="${k}"] span`).textContent = spin[Math.floor(Math.random() * spin.length)];
  }, 80));
  const stop = k => {
    if (stopped[k]) return;
    stopped[k] = true; clearInterval(timers[k]);
    const r = el.querySelector(`[data-r="${k}"]`); r.classList.remove('spin'); r.querySelector('span').textContent = ls.reels[k];
    el.querySelector(`[data-stop="${k}"]`).disabled = true;
    sound.play('click');
    if (stopped.every(Boolean)) {
      const res = el.querySelector('.slot-result'); res.hidden = false;
      res.innerHTML = !zonk ? `🎉 ${ls.kind === 'jackpot' ? 'JACKPOT! ' : ''}Menang <b>${rp(ls.win)}</b>!` : ls.win ? `Zonk, tapi uang kembali <b>${rp(ls.win)}</b>.` : 'Zonk. Coba lagi lain kali.';
      if (!zonk) { sound.play('slotwin'); el.querySelector('.slot-reels').classList.add('win'); }
      el.querySelector('[data-close]').hidden = false;
    }
  };
  el.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => stop(+b.dataset.stop));
  [0, 1, 2].forEach(k => setTimeout(() => stop(k), 2600 + k * 700)); // berhenti otomatis kalau tidak ditekan
  el.querySelector('[data-close]').onclick = () => { el.hidden = true; };
}

function ensureBoard() {
  if (board3d || !W) return;
  try {
    board3d = createBoardScene($('#stage'), {
      onTileClick: i => openTile(i),
      onStep: () => sound.play('step'),
      photoUrl
    });
    board3d.setBoard(W.board, W.groupColors);
    if (document.fonts) document.fonts.ready.then(() => board3d.redraw());
  } catch (e) {
    console.error(e);
    $('#stage').insertAdjacentHTML('beforeend', '<div class="no3d">Browser ini tidak mendukung grafis 3D (WebGL). Coba Chrome atau Safari versi terbaru.</div>');
    board3d = null;
  }
}

/* ---------- Editor avatar ---------- */
function loadDraft() {
  try { return JSON.parse(store.get(DRAFT_KEY)) || {}; } catch (e) { return {}; }
}
// Potong tengah jadi persegi 256 px lalu simpan sebagai PNG.
function photoToPng(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gambar tidak bisa dibaca.')); };
    img.src = url;
  });
}
/**
 * Pasang editor avatar di root. value = { color, look, photo } (photo = dataURL / URL / null).
 * onChange(patch) dipanggil setiap ada perubahan.
 */
function mountEditor(root, value, onChange) {
  const L = W.looks;
  root.innerHTML = `<div class="editor">
    <div class="ed-preview">
      <canvas aria-label="Pratinjau avatar 3D"></canvas>
      <div class="row">
        <span class="btn sm upload">📷 Unggah foto<input type="file" accept="image/png,image/jpeg,image/webp"></span>
        <button class="btn sm link" data-rm hidden>Hapus foto</button>
      </div>
      <p class="ed-photo-hint">Foto wajah (PNG) dipotong persegi dan ditempel di kepala avatar. Geser pratinjau untuk memutar.</p>
    </div>
    <div>
      <div class="field"><span>Model bidak</span><div class="chips" data-k="model"></div><div class="stats" data-stats></div></div>
      <div class="field"><span>Warna (bidak & penanda tanahmu)</span><div class="colors" data-k="color"></div></div>
      <div class="field" data-human><span>Baju</span><div class="chips" data-k="baju"></div></div>
      <div class="field" data-human><span>Rambut</span><div class="chips" data-k="rambut"></div></div>
      <div class="field"><span>Topi</span><div class="chips" data-k="topi"></div></div>
      <div class="field" data-human><span>Aksesoris</span><div class="chips" data-k="aksesoris"></div></div>
      <div class="field" data-human><span>Warna kulit</span><div class="colors sm" data-k="kulit"></div></div>
    </div></div>`;
  const v = { color: value.color, look: { ...value.look }, photo: value.photo || null };
  let preview = null;
  try { preview = createPreview(root.querySelector('canvas')); } catch (e) { root.querySelector('canvas').replaceWith(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Pratinjau 3D tidak tersedia di browser ini.' })); }
  const refresh = () => preview && preview.set({ color: hex(v.color), look: v.look, photoUrl: v.photo });
  // Daftar pilihan dibangun ulang; jaga posisi scroll halaman supaya tidak lompat ke atas.
  function draw() { const y = window.scrollY; drawRaw(); if (window.scrollY !== y) window.scrollTo(0, y); }
  function drawRaw() {
    const taken = S ? S.players.filter(q => q.id !== me).map(q => q.color) : [];
    const teamLock = !!(S && S.teams && meP());
    if (teamLock) v.color = meP().color;
    else if (!v.color || taken.includes(v.color)) v.color = Object.keys(W.colors).find(c => !taken.includes(c));
    const cbox = root.querySelector('[data-k=color]'); cbox.textContent = '';
    for (const [key, h] of Object.entries(W.colors)) {
      const b = document.createElement('button');
      b.style.background = h; b.title = COLOR_NAMES[key] || key; b.setAttribute('aria-label', b.title);
      b.disabled = teamLock || taken.includes(key); b.setAttribute('aria-pressed', String(v.color === key));
      b.onclick = () => { v.color = key; draw(); refresh(); onChange({ color: key }); };
      cbox.appendChild(b);
    }
    for (const k of ['model', 'baju', 'rambut', 'topi', 'aksesoris']) {
      const box = root.querySelector(`[data-k=${k}]`); box.textContent = '';
      if (!v.look[k]) v.look[k] = L[k][0].id;
      L[k].forEach(o => {
        const b = document.createElement('button'); b.textContent = o.name;
        b.setAttribute('aria-pressed', String(v.look[k] === o.id));
        b.onclick = () => { v.look[k] = o.id; draw(); refresh(); onChange({ look: { ...v.look } }); };
        box.appendChild(b);
      });
    }
    const kbox = root.querySelector('[data-k=kulit]'); kbox.textContent = '';
    if (!v.look.kulit) v.look.kulit = L.kulit[1];
    L.kulit.forEach(h => {
      const b = document.createElement('button'); b.style.background = h; b.setAttribute('aria-label', 'Warna kulit');
      b.setAttribute('aria-pressed', String(v.look.kulit === h));
      b.onclick = () => { v.look.kulit = h; draw(); refresh(); onChange({ look: { ...v.look } }); };
      kbox.appendChild(b);
    });
    root.querySelector('[data-rm]').hidden = !v.photo;
    const st = statsOfP({ ...(meP() || {}), look: v.look });
    const pc = x => Math.round((x || 0) * 100) + '%';
    const skill = isNormal() && st.skill ? `<span class="skill">${st.icon} <b>${esc(st.name)}</b>: ${esc(st.desc)}</span>` : '';
    root.querySelector('[data-stats]').innerHTML = skill + `<span>🏷️ Diskon tanah <b>${pc(st.land)}</b></span><span>🔨 Diskon bangun <b>${pc(st.build)}</b></span><span>🎯 Kontrol dadu <b>${pc(st.dice)}</b></span><span>💰 Modal <b>${rpS(st.start || W.startMoney)}</b></span>`;
    const human = (L.model.find(m => m.id === v.look.model) || L.model[0]).human;
    root.querySelectorAll('[data-human]').forEach(f => { f.hidden = !human; });
    root.querySelector('.ed-photo-hint').textContent = human
      ? 'Foto wajah (PNG) dipotong persegi dan ditempel di kepala avatar. Geser pratinjau untuk memutar.'
      : 'Foto (PNG) tampil di medali dada hewan atau kaca depan kendaraan. Geser pratinjau untuk memutar.';
  }
  root.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Pilih file gambar (PNG).', true); return; }
    try { v.photo = await photoToPng(f); draw(); refresh(); onChange({ photo: v.photo }); }
    catch (err) { toast(err.message, true); }
  };
  root.querySelector('[data-rm]').onclick = () => { v.photo = null; draw(); refresh(); onChange({ photo: null }); };
  draw(); refresh();
  return { value: v, redraw: draw, dispose() { preview && preview.dispose(); } };
}
// Editor untuk pemain yang sudah bergabung: perubahan langsung dikirim ke server.
function liveEditor(root, p) {
  let t = null;
  return mountEditor(root, { color: p.color, look: p.look, photo: photoUrl(p) }, patch => {
    if ('photo' in patch) emit('setAvatar', { data: patch.photo });
    if (patch.color) emit('setLook', { color: patch.color });
    if (patch.look) { clearTimeout(t); t = setTimeout(() => emit('setLook', { look: patch.look }), 200); }
  });
}

/* ---------- Render ---------- */
function show(id) {
  ['join', 'lobby', 'game'].forEach(v => { $('#' + v).hidden = v !== id; });
  if (id !== 'join' && joinEditor) { joinEditor.dispose(); joinEditor = null; }
  if (id !== 'lobby' && lobbyEditor) { lobbyEditor.dispose(); lobbyEditor = null; }
}
function render() {
  if (!S || !W) return;
  renderSoundButtons();
  const p = meP();
  if (S.phase === 'lobby' || (!p && !watching)) {
    if (renderEnd.open) { closeModal(); renderEnd.open = false; }
    popupQueue = []; bigCard = null; drawPopup(); hideSheet();
    if (!p) {
      show('join');
      $('#joinForm').hidden = S.phase !== 'lobby'; $('#joinBusy').hidden = S.phase === 'lobby';
      if (S.phase === 'lobby') renderJoin();
      renderJoinManage();
      return;
    }
    show('lobby'); renderLobby(p); return;
  }
  show('game');
  ensureBoard();
  renderCards(); renderStageUi(); renderDock(); renderHand(); renderMyProps(); renderLog(); renderEnd(); renderSheet(); refreshPopupButtons();
  $('#btnHost').hidden = !W.serverLaptop || S.phase !== 'playing';
  $('#btnSurrender').hidden = !p || p.bankrupt || S.phase !== 'playing';
  $('#btnSurrender').onclick = () => confirmBox('Menyerah?', 'Kamu keluar dari permainan. Semua tanah dan bangunanmu kembali jadi tanah kosong milik negara, dan uangmu hangus. Kamu tetap bisa menonton sampai selesai.', 'Ya, menyerah', () => emit('surrender'));
  $('#btnAvatar').hidden = true; // avatar dikunci selama permainan
}

function renderJoin() {
  if (!joinEditor) {
    const d = loadDraft();
    joinEditor = mountEditor($('#joinEditor'), { color: d.color, look: d.look || {}, photo: d.photo }, () => {
      store.set(DRAFT_KEY, JSON.stringify(joinEditor.value));
    });
    if (d.name) $('#nameIn').value = d.name;
  } else joinEditor.redraw();
}

function addrHtml() {
  if (!urls.length) return 'Buka alamat komputer server di browser HP teman (lihat jendela terminal).';
  return 'Teman di Wi-Fi yang sama bisa membuka:' + urls.map(u => `<code>${esc(u)}</code>`).join('');
}
// Daftar pemain lobi. manage = boleh mengeluarkan pemain (host atau laptop server).
function lobbyListHtml(manage) {
  const max = W.maxPlayers;
  return S.players.map(q => `<li>
      ${face(q)}
      <b>${esc(q.name)}${q.id === me ? ' (kamu)' : ''}</b>
      ${teamBadge(q)}
      ${q.bot ? '<span class="badge bot">Bot</span>' : ''}
      ${q.id === S.hostId ? '<span class="badge">Host</span>' : ''}
      ${!q.connected ? '<span class="badge off">Offline</span>' : ''}
      ${manage && q.id !== me ? `<button class="btn sm" data-kick="${q.id}" title="Keluarkan ${esc(q.name)}">${q.bot ? 'Hapus' : 'Keluarkan'}</button>` : ''}
    </li>`).join('') + (max > S.players.length ? `<li class="empty-seat">${max - S.players.length} kursi kosong (maksimal ${max} pemain)</li>` : '');
}
// Laptop server yang belum ikut bermain tetap bisa mengatur lobi dari layar gabung.
function renderJoinManage() {
  const box = $('#joinManage');
  box.hidden = !W.serverLaptop || S.phase !== 'lobby' || !S.players.length;
  if (box.hidden) return;
  const n = S.players.length;
  box.innerHTML = `<h3 class="sub">Lobi saat ini (pengaturan laptop server)</h3>${modeHtml(true)}<ul class="lobby-list">${lobbyListHtml(true)}</ul>
    <div class="row"><button class="btn b sm" data-lobby="addBot" ${n >= W.maxPlayers ? 'disabled' : ''}>🤖 Tambah bot</button>
    <button class="btn y sm" data-lobby="start" ${n < 2 ? 'disabled' : ''}>Mulai permainan (${n} pemain)</button></div>`;
  box.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => emit('kick', { id: b.dataset.kick }));
  box.querySelectorAll('[data-lobby]').forEach(b => b.onclick = () => emit(b.dataset.lobby));
  bindMode(box);
}
const MODES = {
  wni: { name: '🇮🇩 Mode WNI', desc: 'Bertahan hidup dari Musibah, pungli, dan krisis. Modal tergantung avatar.' },
  normal: { name: '🎲 Mode Normal', desc: 'Ala Monopoli: tanpa Musibah, ada Festival, Mesin Game, Landmark, ambil alih, dan skill unik tiap avatar. Modal sama untuk semua.' }
};
function modeHtml(manage) {
  const m = S.mode || 'wni';
  return `<div class="chips">${Object.entries(MODES).map(([k, v]) => `<button data-mode="${k}" aria-pressed="${k === m}" ${manage ? '' : 'disabled'}>${v.name}</button>`).join('')}</div>
    <p class="empty" style="margin-top:6px">${esc(MODES[m].desc)}${manage ? '' : ' Mode dipilih oleh host.'}</p>`;
}
function teamHtml(manage) {
  if (!isNormal()) return '';
  const n = S.players.length, ok = n >= 4 && n % 2 === 0;
  return `<div class="chips" style="margin-top:10px">
      <button data-teams="0" aria-pressed="${!S.teams}" ${manage ? '' : 'disabled'}>👤 Sendiri-sendiri</button>
      <button data-teams="1" aria-pressed="${!!S.teams}" ${manage ? '' : 'disabled'}>👥 Main tim (2 orang)</button>
      ${S.teams && manage ? '<button data-shuffleteams>🔀 Acak tim</button>' : ''}</div>
    <p class="empty" style="margin-top:6px">${S.teams ? (ok ? `${n / 2} tim, satu tim satu warna. Rekan setim bebas sewa dan tidak bisa saling serang.` : '⚠️ Main tim butuh jumlah pemain genap, minimal 4.') : 'Menang dengan: bangkrutkan lawan, 4 tempat wisata, satu sisi papan penuh (Line), atau 3 kawasan warna (Triple).'}</p>`;
}
function bindMode(root) { root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => emit('setMode', { mode: b.dataset.mode })); }
// Ganti isi elemen hanya kalau berubah, dan jaga posisi scroll (halaman & daftar yang bisa di-scroll di dalamnya).
// Tanpa ini, setiap update lobi membuat daftar kembali ke atas.
function setHtml(el, html) {
  if (el._html === html) return false;
  const inner = [...el.querySelectorAll('.pend-grid')].map(x => x.scrollTop), page = window.scrollY;
  el.innerHTML = html; el._html = html;
  el.querySelectorAll('.pend-grid').forEach((x, k) => { x.scrollTop = inner[k] || 0; });
  if (window.scrollY !== page) window.scrollTo(0, page);
  return true;
}
/* ---------- Liontin: pilih maksimal 4 di lobi (mode Normal) ---------- */
function renderPendantPicker(p) {
  const box = $('#pendantField');
  box.hidden = !isNormal() || !(W.pendants || []).length;
  if (box.hidden) return;
  const mine = p.pendants || [], max = W.normal.maxPendants;
  // Rekomendasi liontin untuk avatar yang sedang dipilih
  const av = W.normalAvatars[modelOfP(p)] || {}, rec = (av.recommend || []).filter(id => (W.pendants || []).some(x => x.id === id));
  const recSet = new Set(rec), recOn = rec.length && rec.every(id => mine.includes(id));
  const recHtml = rec.length ? `<div class="prec"><div><b>⭐ Cocok untuk ${av.icon || ''} ${esc(av.name || '')}:</b> ${rec.map(id => { const x = W.pendants.find(y => y.id === id); return `<span>${x.icon} ${esc(x.name)}</span>`; }).join('')}</div>
      <small>${esc(av.recWhy || '')}</small>
      <button class="btn sm y" data-prec ${recOn ? 'disabled' : ''}>${recOn ? '✔ Rekomendasi terpasang' : 'Pasang rekomendasi'}</button></div>` : '';
  const slots = Array.from({ length: max }, (_, k) => { const x = (W.pendants || []).find(y => y.id === mine[k]); return `<span class="pslot${x ? ' on' : ''}" title="${x ? esc(x.name) : 'kosong'}">${x ? x.icon : '＋'}</span>`; }).join('');
  if (!setHtml($('#pendantBox'), recHtml + `<div class="pslots">${slots}<small>${mine.length}/${max} terpasang · ketuk untuk pasang/lepas</small></div>
    <div class="pend-grid">${W.pendants.map(x => `<button class="pend${recSet.has(x.id) ? ' rec' : ''}" data-pend="${esc(x.id)}" aria-pressed="${mine.includes(x.id)}" ${!mine.includes(x.id) && mine.length >= max ? 'disabled' : ''}>
      <span class="ic">${x.icon}</span><b>${recSet.has(x.id) ? '⭐ ' : ''}${esc(x.name)}</b><small>${esc(x.desc)}</small></button>`).join('')}</div>`)) return;
  $('#pendantBox').querySelectorAll('[data-prec]').forEach(b => b.onclick = () => emit('setPendants', { ids: rec.slice(0, max) }));
  $('#pendantBox').querySelectorAll('[data-pend]').forEach(b => b.onclick = () => {
    const id = b.dataset.pend, cur = (meP().pendants || []).slice();
    emit('setPendants', { ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  });
}
function renderLobby(p) {
  const host = p.id === S.hostId, manage = host || W.serverLaptop, n = S.players.length, max = W.maxPlayers;
  $('#lobbyLead').textContent = host
    ? (n < 2 ? 'Kamu tuan rumah. Ajak teman atau tambahkan bot, minimal 2 pemain.' : `Kamu tuan rumah. ${n} pemain siap, mulai kapan saja.`)
    : manage ? 'Kamu di laptop server: bisa menambah bot, mengeluarkan pemain, dan memulai permainan.'
    : 'Menunggu tuan rumah memulai permainan…';
  $('#lobbyAddr').innerHTML = addrHtml();
  setHtml($('#lobbyList'), lobbyListHtml(manage));
  $('#lobbyList').querySelectorAll('[data-kick]').forEach(b => b.onclick = () => emit('kick', { id: b.dataset.kick }));
  $('#hostRow').hidden = !manage;
  setHtml($('#modeBox'), modeHtml(manage) + teamHtml(manage)); bindMode($('#modeBox'));
  $('#modeBox').querySelectorAll('[data-teams]').forEach(b => b.onclick = () => emit('setTeams', { on: b.dataset.teams === '1' }));
  $('#modeBox').querySelectorAll('[data-shuffleteams]').forEach(b => b.onclick = () => emit('shuffleTeams'));
  renderPendantPicker(p);
  $('#btnAddBot').disabled = n >= max;
  $('#btnStart').disabled = n < 2;
  $('#btnStart').textContent = n < 2 ? 'Mulai (min. 2 pemain)' : `Mulai permainan (${n} pemain)`;
  if (!lobbyEditor) lobbyEditor = liveEditor($('#lobbyEditor'), p);
  else lobbyEditor.redraw();
}

function renderCards() {
  const c = cur();
  $('#pcards').innerHTML = S.players.map(q => {
    const mine = propsOf(q.id);
    const cards = q.hand ? Object.values(q.hand).reduce((a, b) => a + b, 0) : 0;
    const lands = mine.filter(i => ['tambang', 'sawit', 'dapur'].includes(S.props[i].use)).length;
    const meta = [mine.length + ' properti'];
    if (lands) meta.push('⛏️🌴🍱 ' + lands);
    if (cards) meta.push('🃏 ' + cards);
    if (q.pejabat > 0) meta.push(`🎖️ pejabat ${q.pejabat}`);
    if (isNormal() && !q.bankrupt) {
      const g = winProgressC(sideKeyC(q)), hot = (a, b) => (a >= b - 1 ? '⚠️' : '');
      meta.push(`🏆 ${hot(g.line, g.lineOf)}📏${g.line}/${g.lineOf} ${hot(g.triple, 3)}🎨${g.triple}/3 ${hot(g.tourism, W.normal.tourismWin)}🏝️${g.tourism}/${W.normal.tourismWin}`);
    }
    if (S.teams && q.team != null) meta.unshift('👥 ' + teamName(q.team));
    if (isNormal()) { const sk = W.normalAvatars[modelOfP(q)]; if (sk) meta.push(sk.icon + ' ' + sk.name); }
    if (pendantsOfP(q).length) meta.push('📿 ' + pendantsOfP(q).map(x => x.icon).join(''));
    if (q.loan > 0) meta.push(`🏦 utang ${rpS(q.loan)}`);
    if (q.inJail) meta.push('🔒 penjara');
    if (q.skip) meta.push(`⏸ ${q.skip} giliran`);
    if (q.bot) meta.push('🤖 bot'); else if (!q.connected) meta.push('offline');
    if (q.bankrupt) meta.push('💀 gugur');
    return `<div class="pcard${c && c.id === q.id && S.phase === 'playing' ? ' turn' : ''}${q.bankrupt ? ' dead' : ''}${q.id === me ? ' me' : ''}">
      ${face(q)}
      <b>${esc(q.name)}${q.id === me ? ' (kamu)' : ''}</b>
      <span class="money${q.money < 0 ? ' neg' : ''}">${rp(q.money || 0)}</span>
      <span class="meta">${meta.map(esc).join(' · ')}</span></div>`;
  }).join('');
}
// Lama permainan: nilai dari server + waktu sejak state terakhir diterima.
let elapsedAt = { ms: 0, at: 0, running: false }, idleAt = { left: null, at: 0 };
const fmtDuration = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, d = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${d}` : `${m}:${d}`; };
function tickClock() {
  const el = $('#clock'); if (!el) return;
  // Hitung mundur waktu tunggu giliran (tampil di label giliran)
  const it = $('#idleT');
  if (it) {
    const left = idleAt.left == null ? null : Math.max(0, Math.ceil((idleAt.left - (performance.now() - idleAt.at)) / 1000));
    it.hidden = left == null; it.textContent = left == null ? '' : `⏳ ${left}`;
    it.classList.toggle('late', left != null && left <= 5);
    it.title = myTurn() ? `Kalau diam ${W.turnIdleSeconds || 20} detik, giliranmu dijalankan otomatis` : 'Sisa waktu giliran pemain ini';
  }
  const ms = elapsedAt.ms + (elapsedAt.running ? performance.now() - elapsedAt.at : 0);
  // Sisa waktu sampai batas permainan; merah di 5 menit terakhir
  const limit = (W && W.gameMinutes || 60) * 60000, left = Math.max(0, limit - ms);
  el.textContent = '⏱ ' + fmtDuration(left); // hitung mundur sisa waktu permainan
  el.classList.toggle('late', elapsedAt.running && left <= 5 * 60000);
  el.title = `Permainan sudah berlangsung ${Math.floor(ms / 60000)} menit. Selesai otomatis setelah ${limit / 60000} menit (sisa ${Math.ceil(left / 60000)} menit).`;
}
setInterval(tickClock, 1000);
function renderStageUi() {
  const c = cur();
  $('#turnchip').innerHTML = S.phase === 'ended' ? '<span>Permainan selesai</span>' : c ? `${face(c)}<span>Giliran ${esc(c.name)}${c.bot ? ' 🤖' : ''}</span><em class="idle" id="idleT" hidden></em>` : '';
  tickClock();
  const dr = $('#diceRead');
  dr.hidden = !S.diceSeq;
  dr.textContent = `🎲 ${S.dice[0]} + ${S.dice[1]} = ${S.dice[0] + S.dice[1]}`;
  $('#crisis').hidden = !S.specialAdded;
  const f = S.festival, fc = $('#festChip');
  fc.hidden = !f;
  if (f) fc.textContent = `🎪 Festival ${W.board[f.tile].name} ×${f.mult}`;
  elapsedAt = { ms: S.elapsed || 0, at: performance.now(), running: S.phase === 'playing' };
  idleAt = { left: S.idleLeft, at: performance.now() };
  tickClock();
}

function renderDock() {
  const body = $('#dockBody'), p = meP(), c = cur();
  showParityTargets(); // tanda di papan ikut dibersihkan kalau sedang tidak bisa dipakai
  if (S.phase === 'ended') { body.innerHTML = '<div class="msg">Permainan selesai.</div>'; return; }
  if (!p) { body.innerHTML = `<div class="msg">Menonton permainan<small>Giliran ${esc(c ? c.name : '')}</small></div>`; return; }
  if (p.bankrupt) { body.innerHTML = '<div class="msg">💀 Kamu sudah gugur.<small>Tetap bisa menonton sampai tinggal satu yang bertahan.</small></div>'; return; }
  let html = '';
  const acts = [];
  if (p.money < 0) {
    html += `<div class="warn">Kamu terlilit utang ${rp(-p.money)}. Gadaikan aset ke bank untuk melunasi.</div>`;
    acts.push(`<button class="btn r" data-sheet>Lunasi utang</button>`);
  }
  if (myTurn()) {
    const pend = S.pending;
    if (pend && pend.type === 'buy') {
      const t = W.board[pend.tile];
      const price = pend.price || t.price;
      html += `<div class="msg">Kamu di ${esc(t.name)}<small>Belum ada pemiliknya. Harga ${rp(price)}${price < t.price ? ` (diskon avatar dari ${rp(t.price)})` : ''}.${t.type === 'tourism' ? `<br>🏝️ Tempat wisata: tidak bisa diambil alih. Kamu punya ${tourismOf(me)}/${W.normal.tourismWin}; kuasai semua = langsung menang.` : ''}</small></div>`;
      if (isNormal() && t.type === 'city') acts.push(`<button class="btn g" data-sheet>🏪 Beli & bangun</button>`);
      else acts.push(`<button class="btn g" data-act="buy" ${p.money < price ? 'disabled' : ''}>Beli ${rpS(price)}</button>`);
      acts.push(`<button class="btn" data-act="skip">Lewati</button>`);
      acts.push(`<button class="btn sm link" data-tile="${pend.tile}">Lihat detail</button>`);
    } else if (pend && pend.type === 'bill') {
      html += `<div class="msg">🧾 Tagihan: ${esc(pend.reason)}<small>${pend.to ? 'Ke ' + esc((P(pend.to) || {}).name || '') + ' · ' : ''}${rp(pend.amount)}</small></div>`;
      acts.push(`<button class="btn y" data-sheet>Lihat tagihan</button>`);
    } else if (pend && pend.type === 'ojolStep') {
      html += `<div class="msg">🛵 Antar Jemput<small>Dadu ${pend.sum}. Pilih maju ${pend.sum - 1}, ${pend.sum}, atau ${pend.sum + 1} petak.</small></div>`;
      acts.push(`<button class="btn y" data-sheet>Pilih langkah</button>`);
    } else if (pend && pend.type === 'startBuild') {
      html += `<div class="msg">🏁 Tepat di Mulai!<small>Boleh membangun di salah satu propertimu.</small></div>`;
      acts.push(`<button class="btn g" data-sheet>Pilih properti</button>`, `<button class="btn" data-act="skip">Lewati</button>`);
    } else if (pend && pend.type === 'upgradeOffer') {
      html += `<div class="msg">Kamu di tanahmu sendiri, ${esc(W.board[pend.tile].name)}<small>Mau di-upgrade?</small></div>`;
      acts.push(`<button class="btn g" data-sheet>Lihat pilihan upgrade</button>`, `<button class="btn" data-act="skip">Lewati</button>`);
    } else if (pend && ['festival', 'slot', 'takeover'].includes(pend.type)) {
      const info = pend.type === 'festival' ? ['🎪 Festival!', 'Pilih propertimu untuk festival.']
        : pend.type === 'slot' ? ['🎰 Mesin Game', `Pilih taruhan ${W.normal.slotBets.map(rpS).join(' / ')}`]
        : ['🕴️ Ambil alih?', `${esc(W.board[pend.tile].name)} seharga ${rpS(pend.price)}`];
      html += `<div class="msg">${info[0]}<small>${info[1]}</small></div>`;
      acts.push(`<button class="btn y" data-sheet>Lihat pilihan</button>`);
    } else if (pend && pend.type === 'blackhole') {
      html += `<div class="msg">🕳️ Lubang Hitam<small>Pilih petak untuk menjebak lawan.</small></div>`;
      acts.push(`<button class="btn y" data-sheet>Pilih petak</button>`);
    } else if (pend && pend.type === 'travel') {
      html += `<div class="msg">${pend.row != null ? '🧭 Pindah sebaris' : '🧳 Travelling!'}<small>${pend.row != null ? 'Pilih petak mana saja di baris ini.' : 'Pilih kotak tujuan mana saja.'}</small></div>`;
      acts.push(`<button class="btn y" data-sheet>Pilih tujuan</button>`);
    } else if (pend && ['power', 'cardRoll', 'fire', 'poison'].includes(pend.type)) {
      const lc = S.lastCard || {};
      html += `<div class="msg">${esc(lc.icon || '')} ${esc(lc.title || 'Kartu')}<small>${pend.type === 'power' ? 'Simpan untuk nanti, atau pakai sekarang.' : pend.type === 'fire' ? 'Padamkan atau biarkan hangus?' : pend.type === 'poison' ? 'Bayar denda, atau dapur ditutup?' : lc.tiers ? 'Kocok dadu untuk menentukan hasilnya.' : 'Tolak pakai Doa Orang Tua, atau terima nasib?'}</small></div>`;
      acts.push(...decisionButtons());
    } else if (!S.rolled) {
      if (p.inJail) {
        html += `<div class="msg">${isNormal() ? '🌴 Terdampar di Pulau Terpencil' : 'Kamu di penjara'}<small>Dapat dadu kembar = langsung bebas dan jalan (percobaan ${p.jailTurns + 1}/3). Atau bayar ${rpS(W.jailFine)} untuk langsung bebas, lalu lempar dadu untuk jalan.${isNormal() ? '' : ' Selama dipenjara, uang yang mestinya kamu terima masuk kas negara.'}</small></div>`;
        acts.push(`<button class="btn y" data-roll="plain" ${p.money < 0 ? 'disabled' : ''}>🎲 Coba dadu kembar</button>`);
        acts.push(`<button class="btn g" data-payroll ${p.money < W.jailFine ? 'disabled' : ''}>💸 Bayar ${rpS(W.jailFine)} & lempar dadu</button>`);
        if (p.hand.orangdalam) acts.push(`<button class="btn b" data-power="orangdalam">🤝 Orang Dalam</button>`);
      } else {
        html += `<div class="msg">Giliranmu!<small>${S.doubles ? 'Dadu kembar, lempar sekali lagi.' : 'Lempar dadu untuk jalan. Upgrade tanah atau pakai kartu sakti bisa sebelum atau sesudah melempar.'}</small></div>`;
        if (pmodC(p, 'parity') > 0) {
          const n = p.parity || 0;
          if (n <= 0) parityPick = null;
          html += `<div class="parity"><span>☯️ Dadu Ganjil-Genap · sisa <b>${n}×</b></span><div class="chips">
            <button data-parity="odd" aria-pressed="${parityPick === 'odd'}" ${n ? '' : 'disabled'}>Ganjil</button>
            <button data-parity="even" aria-pressed="${parityPick === 'even'}" ${n ? '' : 'disabled'}>Genap</button>
            <button data-buyparity ${p.money < W.normal.parityPrice ? 'disabled' : ''}>+1× ${rpS(W.normal.parityPrice)}</button></div>
            ${parityPick ? `<small>Kotak kuning = tujuan yang mungkin kalau dadunya ${parityPick === 'odd' ? 'ganjil' : 'genap'}.</small>` : ''}</div>`;
        } else parityPick = null;
        acts.push(`<button class="btn y" data-roll="aim" ${p.money < 0 ? 'disabled' : ''}>🎲 ${parityPick ? (parityPick === 'odd' ? 'Lempar ganjil' : 'Lempar genap') + ' (tahan untuk membidik)' : 'Tahan untuk membidik'}</button>`);
      }
    } else {
      html += `<div class="msg">Kamu di ${esc(W.board[p.pos].name)}<small>Upgrade tanah atau pakai kartu sakti dulu kalau mau, lalu selesaikan giliran.</small></div>`;
      acts.push(`<button class="btn y" data-act="endTurn" ${p.money < 0 ? 'disabled' : ''}>Selesai giliran</button>`);
    }
  } else {
    html += `<div class="msg">${c && c.bot ? `🤖 ${esc(c.name)} sedang berpikir…` : `Menunggu ${esc(c ? c.name : '')}${c && !c.connected ? ' (terputus)' : ''}…`}<small>Bertahanlah. Yang terakhir gugur adalah yang bertahan paling lama.</small></div>`;
    if (p.id === S.hostId && c && !c.connected) acts.push(`<button class="btn" data-act="hostSkip">Lewati giliran ${esc(c.name)}</button>`);
  }
  body.innerHTML = `<div class="posline">📍 Posisimu: <b>${esc(W.board[p.pos].name)}</b></div>` + html + (acts.length ? `<div class="acts">${acts.join('')}</div>` : '');
  bindActs(body);
  body.querySelectorAll('[data-parity]').forEach(b => b.onclick = () => { parityPick = parityPick === b.dataset.parity ? null : b.dataset.parity; renderDock(); });
  body.querySelectorAll('[data-buyparity]').forEach(b => b.onclick = () => emit('buyParity'));
  body.querySelectorAll('[data-payroll]').forEach(b => b.onclick = () => { emit('payJail'); emit('roll'); });
  showParityTargets();
}
// Kotak kuning: semua tujuan yang mungkin dengan dadu ganjil / genap dari posisi sekarang.
let parityPick = null;
function showParityTargets() {
  const p = meP();
  const ready = p && myTurn() && !S.rolled && !S.pending && !p.inJail;
  const nums = ready ? Array.from({ length: 11 }, (_, k) => k + 2).filter(n => !parityPick || (n % 2 === 1) === (parityPick === 'odd')) : [];
  if (board3d) {
    board3d.highlight(parityPick ? nums.map(n => (p.pos + n) % W.board.length) : []);
    board3d.reach(nums.map(n => ({ n, tile: (p.pos + n) % W.board.length })));
  }
}
// Tombol keputusan kartu/kejadian (dipakai di dock dan di pop-up kartu).
function decisionButtons() {
  const pend = S.pending, p = meP();
  if (!pend || !myTurn()) return [];
  if (pend.type === 'power') return [
    `<button class="btn g" data-power="${pend.card}">Pakai sekarang</button>`,
    `<button class="btn" data-act="keepCard">Simpan kartu</button>`
  ];
  if (pend.type === 'cardRoll') {
    const lc = S.lastCard || {};
    const b = [lc.tiers ? `<button class="btn y" data-act="rollCard">🎲 Kocok dadu</button>` : `<button class="btn" data-act="rollCard">Terima nasib</button>`];
    if (lc.deck === 'musibah' && lc.scope === 'self' && p.hand.doa > 0) b.push(`<button class="btn g" data-act="rollShield">🙏 Tolak pakai Doa Orang Tua</button>`);
    return b;
  }
  if (pend.type === 'poison') return [
    `<button class="btn y" data-act="poisonPay" ${p.money < W.land.poisonFine ? 'disabled' : ''}>Bayar denda ${rpS(W.land.poisonFine)}</button>`,
    `<button class="btn r" data-act="poisonClose">Biarkan dapur ditutup</button>`
  ];
  if (pend.type === 'fire') return [
    p.pejabat > 0 ? `<button class="btn g" data-act="fireOut">🚒 Padamkan (gratis, pejabat)</button>` : `<button class="btn g" data-act="fireOut" ${p.money < W.land.fireCost ? 'disabled' : ''}>🚒 Padamkan (${rpS(W.land.fireCost)})</button>`,
    `<button class="btn" data-act="fireBurn">Biarkan hangus</button>`
  ];
  return [];
}
/* ---------- Dadu: tahan tombol, bar bergerak 2–12, lepas untuk melempar ---------- */
const aim = { on: false, t0: 0, raf: 0, value: 7 };
const AIM_SWEEP_MS = 1400;
function aimValue(now) {
  const ph = ((now - aim.t0) % (AIM_SWEEP_MS * 2)) / AIM_SWEEP_MS; // 0..2, naik lalu turun
  const f = ph <= 1 ? ph : 2 - ph;
  return 2 + Math.round(f * 10);
}
function startAim() {
  if (aim.on) return;
  const p = meP(), st = statsOfP(p);
  aim.on = true; aim.t0 = performance.now();
  const el = $('#aim');
  el.hidden = false;
  el.innerHTML = `<div class="aim-head"><b>Bidik jumlah dadu</b><span>Kontrol dadu ${Math.round((st.dice || 0) * 100)}%</span></div>
    <div class="aim-bar">${Array.from({ length: 11 }, (_, k) => `<i data-n="${k + 2}">${k + 2}</i>`).join('')}</div>
    <div class="aim-target">${(i => `Mendarat di: <b>${esc(W.board[i].name)}</b>`)((p.pos + 7) % W.board.length)}</div><small>Lepas untuk melempar</small>`;
  const tick = now => {
    if (!aim.on) return;
    const v = aimValue(now);
    if (v !== aim.value) {
      aim.value = v;
      el.querySelectorAll('.aim-bar i').forEach(i => i.classList.toggle('on', +i.dataset.n === v));
      el.querySelector('.aim-target').innerHTML = `Bidik ${v} → <b>${esc(W.board[(p.pos + v) % W.board.length].name)}</b>`;
    }
    aim.raf = requestAnimationFrame(tick);
  };
  aim.value = 0; aim.raf = requestAnimationFrame(tick);
}
function releaseAim() {
  if (!aim.on) return;
  aim.on = false; cancelAnimationFrame(aim.raf);
  $('#aim').hidden = true;
  emit('roll', { target: aim.value || 7, parity: parityPick || undefined });
  parityPick = null; showParityTargets();
}
window.addEventListener('pointerup', releaseAim);
window.addEventListener('pointercancel', releaseAim);
function bindRoll(root) {
  root.querySelectorAll('[data-roll]').forEach(b => {
    b.oncontextmenu = e => e.preventDefault();
    if (b.dataset.roll === 'plain') { b.onclick = () => emit('roll'); return; }
    b.onpointerdown = e => { if (e.button === 0 && !b.disabled) { e.preventDefault(); startAim(); } };
  });
}

function bindActs(root, after) {
  root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'rollCard') emit('rollCard', { shield: false });
    else if (a === 'rollShield') emit('rollCard', { shield: true });
    else if (a === 'fireOut') emit('fireChoice', { extinguish: true });
    else if (a === 'fireBurn') emit('fireChoice', { extinguish: false });
    else if (a === 'poisonPay') emit('poisonChoice', { pay: true });
    else if (a === 'poisonClose') emit('poisonChoice', { pay: false });
    else if (a === 'bankrupt') confirmBox('Menyerah dan gugur?', 'Semua asetmu diserahkan ke pihak yang kamu utangi (atau bank), dan kamu keluar dari permainan.', 'Ya, menyerah', () => emit('bankrupt'));
    else emit(a);
    after && after();
  });
  root.querySelectorAll('[data-power]').forEach(b => b.onclick = () => { after && after(); usePower(b.dataset.power); });
  root.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => openTile(+b.dataset.tile));
  root.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => { sheetDismissed = null; sheetReadyKey = sheetKey(); renderSheet(); });
  root.querySelectorAll('[data-upgrade-pick]').forEach(b => b.onclick = openUpgradePicker);
  bindRoll(root);
}

/* ---------- Kartu sakti & voucher ---------- */
function canUseNow(card) {
  if (!myTurn()) return false;
  const p = meP(), pend = S.pending;
  if (card === 'doa') return !pend || pend.type === 'bill';
  if (card === 'angel' || card === 'bebassewa') return !!(pend && pend.type === 'bill' && pend.to);
  if (card === 'bebaspajak') return false;
  if (pend) return false;
  if (card === 'orangdalam') return p.inJail && !S.rolled;
  return true;
}
function renderHand() {
  const p = meP(), box = $('#hand');
  if (!p) { box.innerHTML = '<p class="empty">Kamu sedang menonton.</p>'; return; }
  const items = Object.entries(p.hand || {}).filter(([, n]) => n > 0).map(([k, n]) => {
    const d = W.powers[k];
    return `<div class="hcard"><span class="ic">${d.icon}</span><b>${esc(d.name)}${n > 1 ? `<em>×${n}</em>` : ''}</b>
      <button class="btn sm g" data-power="${k}" ${canUseNow(k) ? '' : 'disabled'}>Pakai</button>
      <small>${esc(d.desc)}</small></div>`;
  });
  const canUp = myTurn() && !S.pending && propsOf(me).some(i => upgradeOptions(i).length);
  if (isNormal()) {
    const sk = W.normalAvatars[modelOfP(p)];
    const pend = pendantsOfP(p);
    if (pend.length) items.unshift(`<div class="hcard pendants"><span class="ic">📿</span><b>Liontin</b><span></span>
      <small>${pend.map(x => `<span class="pline">${x.icon} <b>${esc(x.name)}</b> ${esc(x.desc)}${x.effects.some(e => e.mod === 'parity') ? ` <em>Sisa ${p.parity || 0}×</em>` : ''}</span>`).join('')}${p.buildTokens > 0 ? '<span class="pline">🧱 Bangunan berikutnya gratis</span>' : ''}</small></div>`);
    if (sk) items.unshift(`<div class="hcard gold"><span class="ic">${sk.icon}</span><b>Skill: ${esc(sk.name)}</b><span></span><small>${esc(sk.desc)}</small></div>`);
  }
  if (p.loan > 0 || (p.installments || []).length) {
    const inst = (p.installments || []).map(c => `${esc(c.reason)}: ${rpS(c.per)} × ${c.left} lagi`).join('<br>');
    items.unshift(`<div class="hcard"><span class="ic">🏦</span><b>Utang${p.loan > 0 ? ` bank ${rpS(p.loan)}` : ''}</b>
      ${p.loan > 0 ? `<button class="btn sm" data-repay ${p.money > 0 ? '' : 'disabled'}>Lunasi</button>` : '<span></span>'}
      <small>${p.loan > 0 ? `Dipotong ${rpS(W.bank.loanRepay)} tiap gajian.` : ''}${inst ? (p.loan > 0 ? '<br>' : '') + 'Cicilan sewa: ' + inst : ''}</small></div>`);
  }
  if (p.pejabat > 0) {
    const free = myTurn() && !S.pending;
    items.unshift(`<div class="hcard gold"><span class="ic">🎖️</span><b>Pejabat Tanpa Ijazah<em>${p.pejabat} giliran</em></b>
      <span></span><small>Sekali tiap giliran: ambil alih tanah lawan dan klaim tanah kosong + upgrade gratis. Kebakaran & segel akamsi gratis.</small>
      <div class="row" style="grid-column:1/-1">
        <button class="btn sm g" data-pejabat="take" ${free && p.pejabatTake ? '' : 'disabled'}>Ambil alih tanah lawan</button>
        <button class="btn sm g" data-pejabat="claim" ${free && p.pejabatClaim ? '' : 'disabled'}>Klaim tanah kosong</button>
      </div></div>`);
  }
  if (p.freeUpgrades) items.unshift(`<div class="hcard gold"><span class="ic">👴</span><b>Upgrade gratis${p.freeUpgrades > 1 ? `<em>×${p.freeUpgrades}</em>` : ''}</b>
    <button class="btn sm g" data-upgrade-pick ${canUp ? '' : 'disabled'}>Pakai</button><small>Hadiah dari pejabat. Upgrade satu tanahmu tanpa bayar.</small></div>`);
  if (p.vouchers) items.unshift(`<div class="hcard gold"><span class="ic">🎟️</span><b>Voucher subsidi${p.vouchers > 1 ? `<em>×${p.vouchers}</em>` : ''}</b>
    <button class="btn sm g" data-upgrade-pick ${canUp ? '' : 'disabled'}>Pakai</button><small>Dari gajian. Diskon ${Math.round(W.land.kprDiscount * 100)}% untuk satu upgrade: rumah (KPR bersubsidi), tambang, atau kebun sawit.</small></div>`);
  box.innerHTML = items.length ? items.join('') : '<p class="empty">Belum punya kartu. Kartu sakti didapat dari petak Kesempatan, voucher subsidi didapat setiap gajian.</p>';
  bindActs(box);
  box.querySelectorAll('[data-repay]').forEach(b => b.onclick = () => emit('repayLoan', {}));
  box.querySelectorAll('[data-pejabat]').forEach(b => b.onclick = () => (b.dataset.pejabat === 'take' ? openPejabatTake : openPejabatClaim)());
}
function propsOf(pid) { return Object.keys(S.props).map(Number).filter(i => S.props[i].owner === pid); }
const movable = i => !(S.props[i].houses > 0) && !S.props[i].dynasty;
function usePower(card) {
  const others = S.players.filter(q => q.id !== me && !q.bankrupt);
  if (card === 'buzzer') {
    openModal(`<h2>📢 Buzzer</h2><p class="lead">Pilih lawan yang akan digoreng netizen. Dia membayar biaya klarifikasi Rp 500 rb kepadamu (atau sisa uangnya). Lawan yang menyimpan Doa Orang Tua akan menangkisnya.</p>
      <div class="pick-list">${others.map(q => `<button data-target="${q.id}">${face(q)}<b>${esc(q.name)}</b><small>${rp(q.money)}</small></button>`).join('')}</div>`);
    document.querySelectorAll('#modalBody [data-target]').forEach(b => b.onclick = () => { closeModal(); emit('usePower', { card, target: b.dataset.target }); });
    return;
  }
  if (['sabotase', 'akuisisi', 'kontrak', 'gempa', 'badai'].includes(card)) {
    const ok = i => { const pr = S.props[i]; return !pr.lease && (card === 'akuisisi' ? pr.houses < 5 && W.board[i].type === 'city' : card === 'gempa' ? pr.houses > 0 && pr.houses < 5 : card === 'badai' ? pr.houses > 0 && W.board[i].type === 'city' : card === 'sabotase' ? !pr.slump : card === 'kontrak' ? W.board[i].type !== 'tourism' : true); };
    const def = W.powers[card], groups = others.map(q => ({ q, tiles: propsOf(q.id).filter(ok) })).filter(g => g.tiles.length);
    openModal(`<h2>${def.icon} ${esc(def.name)}</h2><p class="lead">${esc(def.desc)} Lawan yang menyimpan Angel akan menangkisnya.</p>
      <div class="pick-list">${groups.length ? groups.map(g => `<h4>${esc(g.q.name)}${g.q.hand && g.q.hand.angel ? ' · 😇 punya Angel' : ''}</h4>` + g.tiles.map(i =>
        `<button data-tgt="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}${useTag(i)}</b><small>${buildLabel(i)} · sewa ${rpS(rentNow(i))}</small></button>`).join('')).join('') : '<p class="empty">Belum ada properti lawan yang bisa jadi sasaran.</p>'}</div>`);
    document.querySelectorAll('#modalBody [data-tgt]').forEach(b => b.onclick = () => { closeModal(); emit('usePower', { card, tile: +b.dataset.tgt }); });
    return;
  }
  if (card === 'wabah' || card === 'panggil') {
    const def = W.powers[card];
    openModal(`<h2>${def.icon} ${esc(def.name)}</h2><p class="lead">${esc(def.desc)}</p>
      <div class="pick-list">${others.map(q => `<button data-target="${q.id}">${face(q)}<b>${esc(q.name)}</b><small>${propsOf(q.id).length} properti · ${rp(q.money)}</small></button>`).join('')}</div>`);
    document.querySelectorAll('#modalBody [data-target]').forEach(b => b.onclick = () => { closeModal(); emit('usePower', { card, target: b.dataset.target }); });
    return;
  }
  if (card === 'tukar') {
    const mine = propsOf(me).filter(i => W.board[i].type === 'city' && S.props[i].houses < 5 && !S.props[i].lease);
    openModal(`<h2>🔄 Tukar Kota</h2><p class="lead">Langkah 1: pilih kotamu yang mau ditukar (belum Landmark).</p>
      <div class="pick-list">${mine.map(i => `<button data-mine="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}</b><small>${buildLabel(i)}</small></button>`).join('') || '<p class="empty">Kamu belum punya kota yang bisa ditukar.</p>'}</div>`);
    document.querySelectorAll('#modalBody [data-mine]').forEach(b => b.onclick = () => {
      const m = +b.dataset.mine, theirs = others.flatMap(q => propsOf(q.id).filter(i => W.board[i].type === 'city' && S.props[i].houses < 5 && !S.props[i].lease).map(i => [q, i]));
      openModal(`<h2>🔄 Tukar ${esc(W.board[m].name)} dengan…</h2><p class="lead">Langkah 2: pilih kota lawan.</p>
        <div class="pick-list">${theirs.map(([q, i]) => `<button data-theirs="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}</b><small>milik ${esc(q.name)} · ${buildLabel(i)}</small></button>`).join('') || '<p class="empty">Tidak ada kota lawan yang bisa ditukar.</p>'}</div>`);
      document.querySelectorAll('#modalBody [data-theirs]').forEach(t => t.onclick = () => { closeModal(); emit('usePower', { card, tile: +t.dataset.theirs, mine: m }); });
    });
    return;
  }
  if (card === 'mafia') {
    const groups = others.map(q => ({ q, tiles: propsOf(q.id).filter(movable) })).filter(g => g.tiles.length);
    openModal(`<h2>🕴️ Mafia Tanah</h2><p class="lead">Pilih tanah lawan yang mau direbut. Tanah yang sudah ada bangunannya tidak bisa direbut. Lawan yang menyimpan Doa Orang Tua akan menangkisnya.</p>
      <div class="pick-list">${groups.length ? groups.map(g => `<h4>${esc(g.q.name)}${g.q.hand && g.q.hand.doa ? ' · 🙏 punya Doa' : ''}</h4>` + g.tiles.map(i =>
        `<button data-steal="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}${useTag(i)}</b><small>${rpS(W.board[i].price)}${S.props[i].mortgaged ? ' · gadai' : ''}</small></button>`).join('')).join('')
        : '<p class="empty">Belum ada tanah lawan yang bisa direbut.</p>'}</div>`);
    document.querySelectorAll('#modalBody [data-steal]').forEach(b => b.onclick = () => { closeModal(); emit('usePower', { card, tile: +b.dataset.steal }); });
    return;
  }
  if (card === 'dinasti') {
    const list = propsOf(me).filter(i => !S.props[i].dynasty);
    openModal(`<h2>👑 Jalur Dinasti</h2><p class="lead">Pilih satu tanahmu yang akan kebal dari penyitaan, pembongkaran, dan perebutan sampai akhir permainan.</p>
      <div class="pick-list">${list.length ? list.map(i => `<button data-guard="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}${useTag(i)}</b><small>${S.props[i].houses ? S.props[i].houses + ' rumah' : rpS(W.board[i].price)}</small></button>`).join('') : '<p class="empty">Kamu belum punya tanah yang bisa dilindungi.</p>'}</div>`);
    document.querySelectorAll('#modalBody [data-guard]').forEach(b => b.onclick = () => { closeModal(); emit('usePower', { card, tile: +b.dataset.guard }); });
    return;
  }
  emit('usePower', { card });
}

/* ---------- Pejabat Tanpa Ijazah ---------- */
function openPejabatTake() {
  const others = S.players.filter(q => q.id !== me && !q.bankrupt);
  const groups = others.map(q => ({ q, tiles: propsOf(q.id).filter(i => !S.props[i].dynasty) })).filter(g => g.tiles.length);
  openModal(`<h2>🎖️ Ambil alih</h2><p class="lead">Pilih satu tanah milik pemain lain. Bangunannya ikut jadi milikmu. Tanah ber-Jalur Dinasti tidak bisa diambil.</p>
    <div class="pick-list">${groups.length ? groups.map(g => `<h4>${esc(g.q.name)}</h4>` + g.tiles.map(i => `<button data-take="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}${useTag(i)}</b><small>${S.props[i].houses === 5 ? 'hotel' : S.props[i].houses ? S.props[i].houses + ' rumah' : rpS(W.board[i].price)}</small></button>`).join('')).join('') : '<p class="empty">Tidak ada tanah lawan yang bisa diambil.</p>'}</div>`);
  document.querySelectorAll('#modalBody [data-take]').forEach(b => b.onclick = () => { closeModal(); emit('pejabatTake', { tile: +b.dataset.take }); });
}
function openPejabatClaim() {
  const free = W.board.map((t, i) => i).filter(i => W.board[i].type === 'city' && S.props[i] && !S.props[i].owner);
  openModal(`<h2>🎖️ Klaim tanah kosong</h2><p class="lead">Pilih tanah yang belum dimiliki, lalu pilih bangunannya. Semuanya gratis.</p>
    <div class="pick-list">${free.length ? free.map(i => `<button data-claim="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}</b><small>${rpS(W.board[i].price)}</small></button>`).join('') : '<p class="empty">Semua tanah sudah ada pemiliknya.</p>'}</div>`);
  document.querySelectorAll('#modalBody [data-claim]').forEach(b => b.onclick = () => {
    const i = +b.dataset.claim;
    openModal(`<h2>🎖️ ${esc(W.board[i].name)}</h2><p class="lead">Mau dibangun apa? Gratis.</p>
      <div class="pick-list">${[['rumah', '🏠 Rumah'], ['hotel', '🏨 Langsung hotel'], ['tambang', '⛏️ Tambang'], ['sawit', '🌴 Kebun sawit'], ['dapur', '🍱 Dapur Gizi Gratis'], ['kosong', 'Biarkan kosong']]
        .map(([k, n]) => `<button data-kind="${k}"><b>${n}</b></button>`).join('')}</div>`);
    document.querySelectorAll('#modalBody [data-kind]').forEach(k => k.onclick = () => { closeModal(); emit('pejabatClaim', { tile: i, kind: k.dataset.kind }); });
  });
}

/* ---------- Exchange Booth (mode Normal): pilih tingkat bangunan sekaligus ---------- */
// Tanah → Desa → Kota → Kabupaten → Landmark. Kabupaten setelah melewati Mulai 1 kali,
// Landmark hanya dari Kabupaten yang dikunjungi lagi atau saat berhenti tepat di Mulai.
const LV_ICON = { 0: '🚩', 1: '🏡', 2: '🏘️', 3: '🏙️', 5: '🏛️' };
const maxLevelOf = p => ((p.laps || 0) >= W.normal.lapsForBigBuild ? 3 : 2);
const levelName = h => W.normal.levels[h] || h + ' rumah';
let booth = { key: null, level: 0 }, startPick = null;
function boothCalc(i, buy) {
  const t = W.board[i], pr = S.props[i], p = meP(), st = statsOfP(p);
  const from = buy ? 0 : pr.houses, max = maxLevelOf(p), land = buy ? (S.pending.price || t.price) : 0;
  const units = L => { let u = 0; for (let h = from + 1; h <= L; h++) if (h !== 4) u += h === 5 ? W.normal.landmarkHouses : 1; return u; };
  const gross = L => units(L) * t.house, net = L => Math.round(gross(L) * (1 - (st.build || 0)) / 1000) * 1000;
  const levels = from === 3 ? [3, 5] : [0, 1, 2, 3];
  const selectable = L => L > from && (L === 5 ? from === 3 : L <= max);
  return { t, p, from, max, land, gross, net, levels, selectable };
}
function boothHtml(i, buy) {
  const c = boothCalc(i, buy), { t, p, from, land } = c;
  const key = (buy ? 'b' : 'u') + i + ':' + from;
  if (booth.key !== key) {
    booth.key = key;
    const fit = c.levels.filter(c.selectable).reverse().find(L => p.money >= land + c.net(L));
    booth.level = fit != null ? fit : from;
  }
  // Token Subsidi (liontin) membuat bangunan berikutnya gratis
  const L = booth.level, gross = c.net(L), sub = p.buildTokens > 0 && gross > 0 ? gross : 0, build = gross - sub, total = land + build;
  const cards = c.levels.map(lv => {
    let state, price;
    if (lv === 0 && buy) { state = 'must'; price = rpS(t.price); }
    else if (lv <= from) { state = 'own'; price = 'dimiliki'; }
    else if (!c.selectable(lv)) { state = 'lock'; price = '🔒 1 putaran'; }
    else { state = lv <= L ? 'on' : 'off'; price = rpS(c.net(lv) - c.net(lv === 5 ? 3 : lv - 1)); }
    return `<button class="lv ${state}" data-lv="${lv}" ${['must', 'own', 'lock'].includes(state) ? 'disabled' : ''}>
      <b>${lv === 0 ? 'Harga Tanah' : levelName(lv)}</b><span class="ic">${LV_ICON[lv]}</span>
      <small>${state === 'must' ? 'Wajib' : state === 'on' || state === 'own' ? '✔' : ''}</small><i>${price}</i></button>`;
  }).join('');
  const group = W.board.map((b, j) => (b.group === t.group ? j : -1)).filter(j => j >= 0);
  const full = group.every(j => j === i || S.props[j].owner === me);
  const rent = Math.round(t.rent[Math.max(L, from)] * (full ? 2 : 1) / 1000) * 1000;
  const disc = c.gross(L) - gross + (buy ? t.price - land : 0);
  const half = Math.round(build * W.land.kprDiscount / 1000) * 1000;
  const notes = [];
  if (from < 3 && c.max < 3) notes.push('🔒 Kabupaten bisa dibangun setelah kamu melewati Mulai 1 kali.');
  if (from < 3) notes.push('🏛️ Landmark bisa dibangun dari Kabupaten saat kamu berhenti di sini lagi atau tepat di Mulai.');
  return `<div class="booth">${cards}</div>
    <table class="rent booth-sum">
      ${buy ? `<tr><td>Harga tanah</td><td>${rp(t.price)}</td></tr>` : ''}
      <tr><td>Biaya bangun</td><td>${rp(c.gross(L))}</td></tr>
      ${disc ? `<tr><td>Diskon avatar</td><td>−${rp(disc)}</td></tr>` : ''}
      ${sub ? `<tr><td>🧱 Subsidi Pembangunan (gratis)</td><td>−${rp(sub)}</td></tr>` : ''}
      <tr class="cur"><td>Biaya sewa jadi${full ? ' (satu warna ×2)' : ''}</td><td>${rp(rent)}</td></tr></table>
    ${notes.length ? `<p class="empty">${notes.join('<br>')}</p>` : ''}
    <div class="row" style="margin-top:10px">
      <button class="btn g" data-booth="cash" ${p.money < total || (!buy && L <= from) ? 'disabled' : ''}>${buy ? 'Beli' : 'Bangun'} ${total ? rpS(total) : 'gratis'}</button>
      ${p.vouchers && build ? `<button class="btn b" data-booth="voucher" ${p.money < land + half ? 'disabled' : ''}>🏷️ Voucher ${rpS(land + half)}</button>` : ''}
      <button class="btn" data-act="skip">Lewati</button></div>`;
}
function bindBooth(root, i, buy) {
  root.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
    const lv = +b.dataset.lv, from = buy ? 0 : S.props[i].houses;
    booth.level = booth.level === lv ? (lv === 5 ? 3 : Math.max(from, lv - 1)) : lv;
    renderSheet();
  });
  root.querySelectorAll('[data-booth]').forEach(b => b.onclick = () => {
    const voucher = b.dataset.booth === 'voucher';
    if (buy) emit('buy', { level: booth.level, voucher });
    else emit('upgrade', { tile: i, kind: 'properti', level: booth.level, pay: voucher ? 'voucher' : 'cash' });
  });
}

/* ---------- Upgrade tanah ---------- */
function upgradeOptions(i) {
  const t = W.board[i], pr = S.props[i];
  if (!t || t.type !== 'city' || !pr || pr.owner !== me || pr.mortgaged || ['tambang', 'sawit', 'dapur'].includes(pr.use)) return [];
  const L = W.land, opts = [], st = statsOfP(meP());
  if (isNormal()) return pr.houses >= 5 || (pr.houses < 3 && pr.houses >= maxLevelOf(meP())) ? [] : [{ kind: 'properti' }];
  const disc = c => Math.round(c * (1 - (st.build || 0)) / 1000) * 1000;
  if (pr.houses < 5) opts.push({ kind: 'properti', cost: disc(t.house), icon: pr.houses === 4 && isNormal() ? '🏛️' : '🏠', name: pr.houses === 4 ? (isNormal() ? 'Bangun Landmark' : 'Bangun hotel') : `Bangun rumah ke-${pr.houses + 1}`,
    note: `Sewa jadi ${rp(t.rent[pr.houses + 1])} untuk yang berhenti di sini.` });
  if (pr.houses === 0 && !isNormal()) {
    opts.push({ kind: 'tambang', cost: disc(L.tambangCost), icon: '⛏️', name: 'Jadikan tambang', note: `+${rpS(L.income)} tiap gajian. Aman ${L.graceLaps} gajian pertama, setelah itu ada peluang ${Math.round(L.closeChance * 100)}% per giliran ditutup akamsi ${L.closeTurns} giliran.` });
    opts.push({ kind: 'dapur', cost: disc(L.dapurCost), icon: '🍱', name: 'Bangun Dapur Gizi Gratis',
      note: `+${rpS(L.dapurIncome)} di awal setiap giliranmu. Aman ${L.graceLaps} gajian pertama, setelah itu ada peluang ${Math.round(L.poisonChance * 100)}% per giliran siswa keracunan (denda ${rpS(L.poisonFine)} atau dapur ditutup dan dibongkar).` });
    opts.push({ kind: 'sawit', cost: disc(L.sawitCost), icon: '🌴', name: 'Jadikan kebun sawit', note: `+${rpS(L.income)} tiap gajian. Aman ${L.graceLaps} gajian pertama, setelah itu ada peluang ${Math.round(L.fireChance * 100)}% per giliran terbakar (padamkan ${rpS(L.fireCost)}).` });
  }
  return opts;
}
function upgradeHtml(i) {
  if (isNormal()) return '';
  const p = meP(), opts = upgradeOptions(i);
  if (!opts.length) return '';
  return `<div class="upg">${opts.map(o => {
    const btn = (pay, cost, label) => `<button class="btn sm ${pay === 'cash' ? 'y' : 'g'}" data-up="${o.kind}" data-pay="${pay}" ${p.money < cost ? 'disabled' : ''}>${label}</button>`;
    const pays = [btn('cash', o.cost, rpS(o.cost))];
    if (p.vouchers) pays.push(btn('voucher', Math.round(o.cost * W.land.kprDiscount), `🎟️ ${rpS(Math.round(o.cost * W.land.kprDiscount))}`));
    if (p.freeUpgrades) pays.push(btn('free', 0, '👴 Gratis'));
    return `<div class="opt"><span class="ic">${o.icon}</span><div><b>${esc(o.name)}</b><small>${esc(o.note)}</small></div><div class="pays">${pays.join('')}</div></div>`;
  }).join('')}</div>`;
}
function bindUpgrade(root, i, after) {
  root.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { emit('upgrade', { tile: i, kind: b.dataset.up, pay: b.dataset.pay }); after && after(); });
}
function openUpgradePicker() {
  const list = propsOf(me).filter(i => upgradeOptions(i).length);
  openModal(`<h2>Upgrade tanah</h2><p class="lead">Pilih tanah yang mau di-upgrade.</p>
    <div class="pick-list">${list.length ? list.map(i => `<button data-pickland="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}${useTag(i)}</b><small>${buildLabel(i)}</small></button>`).join('') : '<p class="empty">Belum ada tanah kota yang bisa di-upgrade.</p>'}</div>`);
  document.querySelectorAll('#modalBody [data-pickland]').forEach(b => b.onclick = () => openTile(+b.dataset.pickland));
}

/* ---------- Lembar tagihan / utang / upgrade / travelling ---------- */
// Muncul otomatis sesuai state; bisa ditutup ("nanti") lalu dibuka lagi dari dock.
let sheetReadyKey = null, sheetPendingKey = null, sheetDismissed = null;
function sheetKey() {
  const p = meP();
  if (!p || p.bankrupt || S.phase !== 'playing') return null;
  const pend = S.pending;
  if (myTurn() && pend && pend.type === 'buy' && isNormal() && W.board[pend.tile].type === 'city') return 'buy:' + pend.tile + ':' + S.diceSeq;
  if (myTurn() && pend && ['bill', 'upgradeOffer', 'travel', 'blackhole', 'festival', 'slot', 'takeover', 'startBuild', 'ojolStep'].includes(pend.type)) return pend.type + ':' + (pend.tile ?? '') + ':' + S.diceSeq + ':' + (pend.amount || '');
  if (p.money < 0) return 'debt';
  return null;
}
const SDN = () => W.board.length / 4, travelIdx = () => W.board.findIndex(t => t.type === 'travel');
function hideSheet() { $('#sheet').hidden = true; }
// Nilai gadai sama dengan hitungan server: setengah dari tanah + bangunan + biaya usaha.
function mortgageValue(i) {
  const t = W.board[i], pr = S.props[i], L = W.land;
  const biz = { tambang: L.tambangCost, sawit: L.sawitCost, dapur: L.dapurCost }[pr.use] || 0;
  return Math.round((t.price + pr.houses * (t.house || 0) + biz) / 2);
}
const redeemCost = i => Math.round((S.props[i].mortgageValue || W.board[i].price / 2) * 1.1);
// Pinjaman bank: sisa batas pokok dan tombol jumlah cepat.
const hasCollateral = p => propsOf(p.id).some(i => !S.props[i].mortgaged);
const loanRoom = p => Math.max(0, W.bank.maxLoan + pmodC(p, 'loanLimit') - (p.loanPrincipal || 0));
function loanHtml(p, need) {
  const room = loanRoom(p), B = W.bank;
  if (!hasCollateral(p)) return '<p class="empty">🏦 Bank butuh jaminan. Semua asetmu sudah digadai, jadi tidak bisa pinjam lagi.</p>';
  if (room < 100000) return '<p class="empty">Batas pinjaman bank sudah habis.</p>';
  const opts = [...new Set([Math.ceil(need / 1e6) * 1e6, 5e6, 10e6, room].filter(v => v > 0 && v <= room))].sort((x, y) => x - y);
  return `<h3 class="sub">🏦 Pinjam bank</h3><p class="empty">Bisa pinjam sampai ${rp(room)}. Bunga ${Math.round(B.loanInterest * 100)}% sekali, dicicil ${rpS(B.loanRepay)} otomatis tiap gajian.</p>
    <div class="pays">${opts.map(v => `<button class="btn sm g" data-borrow="${v}">Pinjam ${rpS(v)}</button>`).join('')}</div>`;
}
function assetList(p) {
  const mine = propsOf(p.id).sort((a, b) => a - b);
  const rows = mine.map(i => {
    const t = W.board[i], pr = S.props[i];
    let btn = '';
    if (pr.mortgaged) btn = '<span class="empty">sudah digadai</span>';
    else {
      btn = `<button class="btn sm b" data-mortgage="${i}">Gadai ke bank +${rpS(mortgageValue(i))}</button>`;
      if (pr.houses > 0) btn = `<button class="btn sm" data-sell="${i}">Jual 1 bangunan +${rpS(t.house / 2)}</button>` + btn;
    }
    return `<div class="asset"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(t.name)}${useTag(i)}</b>${btn}</div>`;
  });
  const total = mine.reduce((s, i) => s + (S.props[i].mortgaged ? 0 : mortgageValue(i)), 0);
  return { html: rows.join(''), total };
}
function renderSheet() {
  const key = sheetKey(), el = $('#sheet');
  if (key !== renderSheet.last) { renderSheet.last = key; startPick = null; }
  if (!key || key !== sheetReadyKey || key === sheetDismissed || (bigCard && !key.startsWith('debt') && !key.startsWith('bill'))) { el.hidden = true; return; }
  const p = meP(), pend = S.pending;
  let html = '';
  const later = `<button class="btn link" data-later>Nanti</button>`;
  if (key === 'debt') {
    const a = assetList(p);
    html = `<h2>💸 Terlilit utang</h2><p class="lead">Uangmu minus <b>${rp(-p.money)}</b>. Pinjam ke bank dengan menggadaikan aset atau menjual bangunan. Kalau asetmu habis dan utang belum lunas, kamu gugur.</p>
      ${a.html ? `<div class="assets">${a.html}</div><p class="empty">Total yang masih bisa dicairkan: ${rp(a.total)}</p>` : ''}
      ${loanHtml(p, -p.money)}
      <div class="row" style="margin-top:12px"><button class="btn r sm" data-act="bankrupt">💀 Menyerah</button>${later}</div>`;
  } else if (pend.type === 'bill') {
    const to = pend.to ? P(pend.to) : null, short = pend.amount - p.money, a = assetList(p);
    const canDoa = p.hand.doa > 0 || (pend.to && (p.hand.angel > 0 || p.hand.bebassewa > 0)), room = loanRoom(p), stuck = short > 0 && !hasCollateral(p) && !canDoa;
    const B = W.bank;
    const inst = pend.to && !isNormal() && !stuck && hasCollateral(p) ? `<h3 class="sub">📅 Cicil sewa</h3><div class="pays">${[2, 4, 6].map(n => { const per = Math.ceil(pend.amount * (1 + B.installmentFee[n]) / n / 1000) * 1000;
      return `<button class="btn sm b" data-install="${n}" ${p.money < per ? 'disabled' : ''}>${n}× ${rpS(per)}<small style="display:block;font-weight:500">total ${rpS(per * n)}</small></button>`; }).join('')}</div>
      <p class="empty">Cicilan pertama dibayar sekarang, sisanya otomatis di awal giliranmu berikutnya.</p>` : pend.to ? '<p class="empty">🎲 Mode Normal: sewa tidak bisa dicicil. Bayar langsung, atau pakai kartu Angel / Bebas Sewa kalau punya.</p>' : '';
    html = `<div class="bill-head">${W.board[pend.tile] ? tileIcon(W.board[pend.tile]) : '🧾'} ${esc(pend.reason)}</div>
      <p class="lead">${to ? `Kamu berhenti di tanah milik ${face(to)} <b>${esc(to.name)}</b>${to.inJail ? ' (sedang dipenjara, uangnya masuk kas negara)' : ''}.` : 'Bayar ke kas negara.'}</p>
      <div class="bill-amt">${rp(pend.amount)}</div>
      <p class="bill-sub">Uangmu ${rp(p.money)}${short <= 0 ? ` → sisa ${rp(p.money - pend.amount)}` : ''}</p>
      ${short > 0 ? `<div class="warn">Uangmu kurang ${rp(short)}. ${stuck ? 'Semua asetmu sudah digadai dan bank tidak mau meminjami tanpa jaminan. Satu-satunya pilihan: bangkrut.' : 'Gadaikan aset atau pinjam ke bank:'}</div>` : ''}
      ${pend.to && (p.hand.angel || p.hand.bebassewa) ? `<div class="assets">${['angel', 'bebassewa'].filter(k => p.hand[k]).map(k => `<div class="asset"><span>${W.powers[k].icon}</span><b>${W.powers[k].name}</b><button class="btn sm g" data-power="${k}">Bebas sewa</button></div>`).join('')}</div>` : ''}
      ${short > 0 && canDoa ? `<div class="assets"><div class="asset"><span>🙏</span><b>Doa Orang Tua</b><button class="btn sm g" data-power="doa">Pakai +${rpS(W.doaReward)}</button></div></div>` : ''}
      ${short > 0 && a.html ? `<div class="assets">${a.html}</div>` : ''}
      ${short > 0 ? loanHtml(p, short) : ''}
      ${inst}
      <div class="row" style="margin-top:12px">${stuck
        ? `<button class="btn r" data-act="payBill">💀 Tidak sanggup bayar, gugur</button>`
        : `<button class="btn y" data-act="payBill" ${short > 0 ? 'disabled' : ''}>Bayar ${rp(pend.amount)}</button>${later}`}</div>`;
  } else if (pend.type === 'buy') {
    const t = W.board[pend.tile];
    html = `<h2>🏪 ${esc(t.name)}</h2><p class="lead">Beli tanahnya, lalu pilih mau langsung dibangun sampai tingkat berapa.</p>${boothHtml(pend.tile, true)}`;
  } else if (pend.type === 'upgradeOffer' && isNormal()) {
    const t = W.board[pend.tile], from = S.props[pend.tile].houses;
    const lead = S.pending.takeover ? (from === 3 ? `${esc(t.name)} (Kabupaten) sudah jadi milikmu. Langsung upgrade ke Landmark? Landmark tidak bisa diambil alih lawan, kecuali oleh avatar Manusia (Raja Akuisisi).` : `${esc(t.name)} sudah jadi milikmu. Mau langsung dibangun lagi?`)
      : from === 3 ? 'Kabupatenmu bisa dijadikan Landmark. Landmark tidak bisa diambil alih lawan, kecuali oleh avatar Manusia (Raja Akuisisi).' : 'Kamu berhenti di propertimu sendiri. Mau dibangun lagi?';
    html = `<h2>${from === 3 ? '🏛️' : '🏗️'} ${S.pending.takeover && from === 3 ? 'Jadikan Landmark?' : esc(t.name)}</h2><p class="lead">${lead}</p>${boothHtml(pend.tile, false)}`;
  } else if (pend.type === 'ojolStep') {
    // Pilih petak tujuan: dadu -1, dadu, dadu +1 (dengan info pemilik & sewa)
    html = `<h2>🛵 Antar Jemput</h2><p class="lead">Dadumu ${pend.sum}. Mau berhenti di mana?</p><div class="pick-list">${[-1, 0, 1].map(adj => {
      const n = pend.sum + adj, i = (p.pos + n) % W.board.length, t = W.board[i], pr = S.props[i], o = pr && pr.owner ? P(pr.owner) : null;
      const sub = pr ? (o ? (o.id === me ? 'milikmu' : `milik ${o.name} · sewa ${rpS(rentNow(i))}`) : 'kosong · ' + rpS(t.price)) : (TILE_DESC[t.type] ? '' : '');
      return `<button data-ojol="${adj}"><i class="sw" style="background:${swatch(i)}"></i><b>${n} petak → ${tileIcon(t)} ${esc(t.name)}</b><small>${esc(sub)}</small></button>`;
    }).join('')}</div>`;
  } else if (pend.type === 'startBuild') {
    if (startPick != null && !upgradeOptions(startPick).length) startPick = null;
    if (startPick == null) {
      const list = propsOf(me).filter(i => upgradeOptions(i).length);
      html = `<h2>🏁 Tepat di Mulai!</h2><p class="lead">Pilih satu propertimu untuk dibangun. Kabupaten bisa langsung dijadikan Landmark.</p>
        <div class="pick-list">${list.map(i => `<button data-startpick="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}</b><small>${buildLabel(i)} · sewa ${rpS(rentNow(i))}</small></button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="skip">Lewati</button></div>`;
    } else html = `<h2>🏁 ${esc(W.board[startPick].name)}</h2><p class="lead"><button class="btn sm link" data-startpick="-1">← pilih properti lain</button></p>${boothHtml(startPick, false)}`;
  } else if (pend.type === 'upgradeOffer') {
    const t = W.board[pend.tile];
    html = `<h2>🏠 Upgrade ${esc(t.name)}?</h2><p class="lead">Kamu berhenti di tanahmu sendiri. Mau di-upgrade? Harga ada di tiap pilihan.${p.vouchers ? ' 🎟️ = pakai voucher subsidi.' : ''}${p.freeUpgrades ? ' 👴 = upgrade gratis.' : ''}</p>
      ${upgradeHtml(pend.tile)}<div class="row" style="margin-top:12px"><button class="btn" data-act="skip">Lewati</button></div>`;
  } else if (pend.type === 'festival') {
    const f = S.festival, mine = propsOf(me).filter(i => W.board[i].type === 'city' && !S.props[i].mortgaged);
    html = `<h2>🎪 Festival!</h2><p class="lead">Pilih propertimu. Sewanya naik ×2; festival lagi di properti yang sama jadi ×4, ×8, … maksimal ×${W.normal.festivalMax}. Festival di tempat lain mengakhiri festival yang sedang berjalan.</p>
      <div class="pick-list">${mine.map(i => { const next = f && f.tile === i ? Math.min(W.normal.festivalMax, f.mult * 2) : 2;
        return `<button data-fest="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(W.board[i].name)}${useTag(i)}</b><small>sewa ${rpS(rentNow(i))} → ×${next}</small></button>`; }).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn" data-fest-skip>Lewati</button></div>`;
  } else if (pend.type === 'slot') {
    const N = W.normal;
    html = `<h2>🎰 Mesin Game</h2><p class="lead">Pilih taruhanmu, lalu hentikan 3 gulungan. ${N.slotWild ? `${N.slotWild} bintang dihitung sebagai simbol apa saja. ` : ''}Hadiah = taruhan × pengali: 2 sama ×${N.slotPair}, 3 sama ×${N.slotTriple}, 7️⃣7️⃣7️⃣ ×${N.slotJackpot}${N.slotRefund ? `, zonk tetap kembali ${Math.round(N.slotRefund * 100)}%` : ''}. Peluang menang sekitar 65%.</p>
      <div class="slot-reels idle">${N.slotSymbols.slice(0, 3).map(x => `<div class="reel"><span>${x}</span></div>`).join('')}</div>
      <table class="rent"><tr><th>Taruhan</th><th>Zonk</th><th>2 sama</th><th>3 sama</th><th>7️⃣7️⃣7️⃣</th></tr>${N.slotBets.map(b => `<tr><td>${rpS(b)}</td><td>${rpS(b * (N.slotRefund || 0))}</td><td>${rpS(b * N.slotPair)}</td><td>${rpS(b * N.slotTriple)}</td><td>${rpS(b * N.slotJackpot)}</td></tr>`).join('')}</table>
      <div class="row" style="margin-top:12px">${N.slotBets.map(b => `<button class="btn y" data-slot="1" data-bet="${b}" ${p.money < b ? 'disabled' : ''}>🎰 ${rpS(b)}</button>`).join('')}<button class="btn" data-slot="0">Lewati</button></div>`;
  } else if (pend.type === 'takeover') {
    const t = W.board[pend.tile], o = P(S.props[pend.tile].owner);
    const pr = S.props[pend.tile], value = pend.value || t.price, build = value - t.price, mult = Math.round(pend.price / value * 10) / 10;
    html = `<h2>🕴️ Ambil alih ${esc(t.name)}?</h2><p class="lead">${pr.mortgaged ? "🏦 Tanah ini sedang digadai ke bank, jadi kamu bebas sewa. Kamu bisa menebusnya dari bank lalu langsung mengambil alih, dan setelah itu langsung membangun." : pr.blackout ? "⚡ Listrik di sini sedang padam, jadi kamu bebas sewa. Kalau diambil alih, listriknya langsung menyala lagi." : "Sewa sudah dibayar."} Mau membeli paksa ${esc(t.name)}${pr.houses ? ` beserta ${esc(buildLabel(pend.tile))}-nya` : ''} dari <b>${esc(o ? o.name : '')}</b>?${pend.redeem ? '' : ` Uangnya dibayar ke ${esc(o ? o.name : '')}.`}</p>
      <table class="rent"><tr><td>Harga tanah</td><td>${rp(t.price)}</td></tr>${build > 0 ? `<tr><td>Bangunan (${esc(buildLabel(pend.tile))})</td><td>${rp(build)}</td></tr>` : ''}
        <tr><td>Nilai properti</td><td>${rp(value)}</td></tr><tr class="cur"><td>Harga ambil alih (×${String(mult).replace('.', ',')})</td><td>${rp(pend.price)}</td></tr>
        ${pend.redeem ? `<tr><td>· untuk tebus gadai ke bank</td><td>${rp(pend.redeem)}</td></tr><tr><td>· untuk ${esc(o ? o.name : 'pemilik')}</td><td>${rp(pend.price - pend.redeem)}</td></tr>` : ''}</table>
      <p class="bill-sub">Uangmu ${rp(p.money)}</p>
      <div class="row" style="margin-top:12px"><button class="btn g" data-take="1" ${p.money < pend.price ? 'disabled' : ''}>Ya, ambil alih ${rpS(pend.price)}</button>
      ${p.vouchers ? `<button class="btn b" data-take="v" ${p.money < pend.price / 2 ? 'disabled' : ''}>🏷️ Pakai voucher ${rpS(pend.price / 2)}</button>` : ''}
      <button class="btn" data-take="0">Tidak</button></div>`;
  } else if (pend.type === 'blackhole') {
    const sideName = ['Sisi bawah', 'Sisi kiri', 'Sisi atas', 'Sisi kanan'];
    html = `<h2>🕳️ Lubang Hitam</h2><p class="lead">Pilih petak mana saja. Lawan pertama yang berhenti di sana terkurung ${(W.normalAvatars && W.normalAvatars.alien && W.normalAvatars.alien.turns) || 2} giliran. Lubang hitammu yang lama pindah ke sini.</p>
      <div class="travel">${[0, 1, 2, 3].map(sd => `<h4>${sideName[sd]}</h4>` + W.board.slice(sd * SDN(), sd * SDN() + SDN()).map((t, k) => {
        const i = sd * SDN() + k, pr = S.props[i], o = pr && pr.owner ? P(pr.owner) : null;
        const here = S.players.filter(q => q.id !== me && !q.bankrupt && q.pos === i).map(q => q.name).join(', ');
        const sub = [pr ? (o ? (o.id === me ? 'milikmu' : 'milik ' + o.name) : 'kosong') : '', here ? '👤 ' + here : ''].filter(Boolean).join(' · ');
        return `<button data-bh="${i}"><i class="sw" style="background:${swatch(i)}"></i><span><b>${tileIcon(t)} ${esc(t.name)}</b><small>${esc(sub)}</small></span></button>`;
      }).join('')).join('')}</div>`;
  } else if (pend.type === 'travel') {
    const sideName = ['Sisi bawah', 'Sisi kiri', 'Sisi atas', 'Sisi kanan'], row = pend.row, stay = row != null ? meP().pos : travelIdx();
    html = `<h2>${row != null ? '🧭 Pindah sebaris' : '🧳 Travelling!'}</h2><p class="lead">${row != null ? 'Pilih petak mana saja di baris tempatmu berada.' : 'Pilih kotak tujuan mana saja. Kalau melewati Mulai, kamu tetap gajian.'} Kamu juga bisa ketuk petak di papan.</p>
      <div class="travel">${(row != null ? [row] : [0, 1, 2, 3]).map(sd => `<h4>${sideName[sd]}</h4>` + W.board.slice(sd * SDN(), sd * SDN() + SDN()).map((t, k) => {
        const i = sd * SDN() + k; if (i === stay) return '';
        const pr = S.props[i], o = pr && pr.owner ? P(pr.owner) : null;
        const sub = pr ? (o ? (o.id === me ? 'milikmu' : 'milik ' + o.name) : 'kosong · ' + rpS(t.price)) : '';
        return `<button data-go="${i}"><i class="sw" style="background:${swatch(i)}"></i><span><b>${tileIcon(t)} ${esc(t.name)}</b><small>${esc(sub)}</small></span></button>`;
      }).join('')).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn" data-go="${stay}">Tetap di sini</button>${later}</div>`;
  }
  el.innerHTML = `<div class="sheet-card">${html}</div>`;
  el.hidden = false;
  bindActs(el);
  if (pend && pend.type === 'upgradeOffer') { if (isNormal()) bindBooth(el, pend.tile, false); else bindUpgrade(el, pend.tile); }
  if (pend && pend.type === 'buy') bindBooth(el, pend.tile, true);
  if (pend && pend.type === 'startBuild' && startPick != null) bindBooth(el, startPick, false);
  el.querySelectorAll('[data-ojol]').forEach(b => b.onclick = () => emit('ojolStep', { adj: +b.dataset.ojol }));
  el.querySelectorAll('[data-startpick]').forEach(b => b.onclick = () => { startPick = +b.dataset.startpick < 0 ? null : +b.dataset.startpick; renderSheet(); });
  el.querySelectorAll('[data-fest]').forEach(b => b.onclick = () => emit('festival', { tile: +b.dataset.fest }));
  el.querySelectorAll('[data-fest-skip]').forEach(b => b.onclick = () => emit('festival', { skip: true }));
  el.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => emit('slotPlay', { play: b.dataset.slot === '1', bet: +b.dataset.bet || undefined }));
  el.querySelectorAll('[data-take]').forEach(b => b.onclick = () => emit('takeover', { accept: b.dataset.take !== '0', voucher: b.dataset.take === 'v' }));
  el.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => emit('sell', { tile: +b.dataset.sell }));
  el.querySelectorAll('[data-borrow]').forEach(b => b.onclick = () => emit('borrow', { amount: +b.dataset.borrow }));
  el.querySelectorAll('[data-install]').forEach(b => b.onclick = () => emit('installRent', { n: +b.dataset.install }));
  el.querySelectorAll('[data-mortgage]').forEach(b => b.onclick = () => emit('mortgage', { tile: +b.dataset.mortgage }));
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => emit('travel', { tile: +b.dataset.go }));
  el.querySelectorAll('[data-bh]').forEach(b => b.onclick = () => emit('blackhole', { tile: +b.dataset.bh }));
  const l = el.querySelector('[data-later]'); if (l) l.onclick = () => { sheetDismissed = key; el.hidden = true; };
}

/* ---------- Pop-up kartu, kejadian, dan pengumuman (ditutup manual) ---------- */
let popupQueue = [], bigCard = null;
// Pengumuman didahulukan dan tidak pernah dibuang; antrean kartu disimpan maksimal 3 terakhir.
function pushPopup(item) {
  if (!bigCard || bigCard.seq === item.seq) { bigCard = item; drawPopup(); renderSheet(); return; }
  const rest = popupQueue.filter(q => q.seq !== item.seq);
  const notes = rest.filter(q => q.kind === 'announce'), cards = rest.filter(q => q.kind !== 'announce');
  popupQueue = item.kind === 'announce' ? [item, ...notes, ...cards.slice(-3)] : [...notes, ...cards.concat(item).slice(-3)];
  drawPopup();
}
function closePopup() {
  bigCard = popupQueue.shift() || null;
  if (bigCard && bigCard.kind === 'card' && S.lastCard && S.lastCard.seq === bigCard.seq) bigCard = { kind: 'card', ...S.lastCard };
  drawPopup();
  renderSheet();
}
// Hasil dadu kartu / keputusan datang belakangan: perbarui pop-up yang sedang tampil.
function updatePopupCard(lc) {
  const fresh = q => q.kind === 'card' && q.seq === lc.seq && (q.roll !== lc.roll || q.shielded !== lc.shielded || q.result !== lc.result);
  if (bigCard && fresh(bigCard)) { bigCard = { kind: 'card', ...lc }; drawPopup(); }
  popupQueue = popupQueue.map(q => (fresh(q) ? { kind: 'card', ...lc } : q));
}
function refreshPopupButtons() {
  if (!bigCard || bigCard.kind !== 'card') return;
  const has = !!$('#bigcard footer [data-act], #bigcard footer [data-power]');
  if (has !== (popupDecisions().length > 0)) drawPopup();
}
function popupDecisions() {
  const lc = bigCard;
  if (!lc || lc.kind !== 'card' || lc.player !== me || !S.lastCard || S.lastCard.seq !== lc.seq) return [];
  return decisionButtons();
}
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const pipHtml = n => Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');
const animatedRolls = new Set();
function drawPopup() {
  const el = $('#bigcard'), lc = bigCard;
  if (!lc) { el.hidden = true; return; }
  let header, body, kind;
  if (lc.kind === 'announce') {
    kind = 'special';
    header = 'Pengumuman';
    body = `<div class="ic">${lc.icon}</div><h2>${esc(lc.title)}</h2><p>${esc(lc.text)}</p>`;
  } else {
    const who = P(lc.player), kes = lc.deck === 'kesempatan';
    kind = lc.ultra ? 'ultra' : lc.special ? (kes ? 'gold' : 'special') : lc.event ? 'event' : lc.deck;
    header = lc.event ? 'Kejadian' : lc.ultra ? '✨ Kesempatan Ultra Rare ✨' : (kes ? 'Kesempatan' : 'Musibah') + (lc.special ? ' Spesial' : '');
    const scope = lc.scope === 'all' ? '<span class="scope all">Kena semua pemain</span>' : lc.tiers ? '<span class="scope">Hanya yang mengambil</span>' : '';
    const tierIdx = lc.roll ? Math.floor((lc.roll - 1) / 2) : -1;
    const tiers = lc.tiers ? `<table class="tiers">${lc.tiers.map((t, k) => `<tr class="${k === tierIdx ? 'hit' : ''}"><td>🎲 ${k * 2 + 1}–${k * 2 + 2}</td><td>${esc(t)}</td></tr>`).join('')}</table>` : '';
    const rolled = lc.roll ? `<div class="roll"><div class="die1">${pipHtml(lc.roll)}</div><b>Dadu: ${lc.roll}</b></div>` : '';
    const waiting = lc.tiers && !lc.roll && !lc.shielded && lc.player !== me ? `<p class="empty" style="text-align:center">Menunggu ${esc(who ? who.name : '')} mengocok dadu…</p>` : '';
    const note = lc.shielded ? '<p class="result">🙏 Ditolak dengan Doa Orang Tua.</p>'
      : lc.result ? `<p class="result">${esc(lc.result)}</p>`
      : lc.scope === 'all' && lc.tiers && !lc.roll ? '<p class="empty" style="text-align:center">Bencana bersama: Doa Orang Tua tidak mempan.</p>' : '';
    const kept = lc.power && lc.player === me && !popupDecisions().length ? '<p class="empty" style="text-align:center">Kartu ini ada di bagian Kartu sakti.</p>' : '';
    body = `${scope}<div class="ic">${lc.icon || (kes ? '🍀' : '⚠️')}</div><h2>${esc(lc.title)}</h2><p>${esc(lc.text)}</p>${tiers}${rolled}${waiting}${note}${kept}
      <div class="who">${who ? face(who) + (lc.event ? ' Menimpa ' : ' Dibuka oleh ') + esc(who.name) : ''}</div>`;
  }
  const btns = popupDecisions();
  el.className = 'bigcard'; el.hidden = false;
  el.innerHTML = `<div class="c kind-${kind}" role="dialog" aria-label="${esc(header)}">
    <header>${esc(header)}<small>${popupQueue.length ? `+${popupQueue.length} lagi` : lc.left != null ? `${lc.left} kartu tersisa` : ''}</small></header>
    <div class="cb">${body}</div>
    <footer>${btns.length ? `<div class="row">${btns.join('')}</div>` : ''}<button class="btn${btns.length ? ' link' : ' y'}" data-close>${btns.length ? 'Putuskan nanti' : popupQueue.length ? 'Tutup, lihat berikutnya' : 'Tutup'}</button></footer>
  </div>`;
  bindActs(el.querySelector('footer'));
  el.querySelectorAll('footer [data-power]').forEach(b => b.addEventListener('click', closePopup));
  el.querySelector('[data-close]').onclick = closePopup;
  el.onclick = e => { if (e.target === el && !btns.length) closePopup(); };
  // animasi kocok dadu, sekali per kartu
  const r = el.querySelector('.roll');
  if (r && !animatedRolls.has(lc.seq)) {
    animatedRolls.add(lc.seq);
    sound.play('dice');
    const box = r.querySelector('.die1'); r.classList.add('rolling');
    let k = 0;
    const iv = setInterval(() => {
      box.innerHTML = pipHtml(1 + Math.floor(Math.random() * 6));
      if (++k > 9) { clearInterval(iv); r.classList.remove('rolling'); box.innerHTML = pipHtml(lc.roll); }
    }, 70);
  }
  const f = el.querySelector('footer .btn'); if (f) f.focus({ preventScroll: true });
}

/* ---------- Properti, log, akhir ---------- */
// Perkiraan sewa saat ini (sama seperti server, untuk kota & bangunan).
const tourismOf = pid => W.board.filter((t, i) => t.type === 'tourism' && S.props[i] && S.props[i].owner === pid && !S.props[i].lease).length;
const tourismRent = (t, n, lv = 0) => Math.round(t.price * W.normal.tourismRent * W.normal.tourismLevelMult[lv] * n / 1000) * 1000;
function rentNow(i) {
  const t = W.board[i], pr = S.props[i];
  if (!pr || !pr.owner || pr.blackout || !['city', 'tourism'].includes(t.type)) return 0;
  const group = W.board.map((b, j) => (b.group === t.group ? j : -1)).filter(j => j >= 0);
  let r = t.type === 'tourism' ? tourismRent(t, W.board.filter((b, j) => b.type === 'tourism' && S.props[j].owner === pr.owner).length, pr.tlevel || 0)
    : t.rent[pr.houses] * (group.every(j => S.props[j].owner === pr.owner) ? 2 : 1);
  if (S.festival && S.festival.tile === i) r *= S.festival.mult;
  if (pr.slump) r *= W.normal.slumpMult;
  // sama dengan server: liontin Pemandu Wisata (sewa wisata) dan skill pemilik yang menaikkan sewa (Pejabat)
  const o = P(pr.owner);
  if (o && isNormal()) {
    if (t.type === 'tourism') r *= 1 + pmodC(o, 'tourismRent');
    r *= statFor(modelOfP(o)).rentMult || 1;
  }
  return Math.round(r / 1000) * 1000;
}
const buildLabel = i => { const h = S.props[i].houses; return isNormal() ? (h ? levelName(h) : 'tanah') : h === 5 ? 'hotel' : h ? h + ' rumah' : 'tanah kosong'; };
function swatch(i) { const t = W.board[i]; return t.type === 'city' || t.type === 'tourism' ? W.groupColors[t.group] : t.type === 'station' ? '#232329' : '#9a968a'; }
function useTag(i) {
  const pr = S.props[i];
  if (pr.dynasty) return useTagBase(pr) + ' 👑';
  return useTagBase(pr);
}
function useTagBase(pr) {
  if (pr.lease) return ' 🔑';
  if (pr.slump) return ' 💣';
  if (pr.use === 'tambang') return pr.closed > 0 ? ` ⛏️🚫${pr.closed}` : ' ⛏️';
  if (pr.use === 'sawit') return ' 🌴';
  if (pr.use === 'dapur') return ' 🍱';
  return '';
}
function renderMyProps() {
  const p = meP(), box = $('#myProps');
  if (!p) { box.innerHTML = '<p class="empty">Kamu sedang menonton.</p>'; return; }
  const mine = propsOf(me).sort((a, b) => a - b);
  if (!mine.length) { box.innerHTML = '<p class="empty">Belum punya properti. Beli kota saat kamu berhenti di petak yang belum dimiliki.</p>'; return; }
  box.innerHTML = mine.map(i => {
    const t = W.board[i], pr = S.props[i];
    const safe = pr.grace > 0 ? ' 🛡️' + pr.grace : '';
    const st = pr.mortgaged ? 'digadai' : pr.use === 'tambang' ? (pr.closed > 0 ? `tambang, tutup ${pr.closed} giliran` : 'tambang' + safe) : pr.use === 'sawit' ? 'kebun sawit' + safe : pr.use === 'dapur' ? 'dapur gizi' + safe
      : t.type === 'tourism' ? '🏝️ ' + W.normal.tourismLevels[pr.tlevel || 0]
      : t.type === 'city' ? buildLabel(i) : '';
    return `<button class="prop" data-tile="${i}"><i class="sw" style="background:${swatch(i)}"></i><b>${esc(t.name)}${useTag(i)}</b><span>${st}</span></button>`;
  }).join('');
  box.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => openTile(+b.dataset.tile));
}
function renderLog() { $('#log').innerHTML = S.log.slice().reverse().slice(0, 40).map(l => `<li>${esc(l.msg)}</li>`).join(''); }
function renderEnd() {
  if (S.phase !== 'ended' || !S.ranking) { if (renderEnd.open) { closeModal(); renderEnd.open = false; } return; }
  if (renderEnd.open === S.winner) return;
  const w = P(S.winner);
  afterMoves(() => {
    const who = esc(S.teams && S.winTeam != null ? `${teamName(S.winTeam)} (${S.players.filter(q => q.team === S.winTeam).map(q => q.name).join(' & ')})` : w ? w.name : '');
    const WIN = {
      tourism: [`🏝️ ${who} menang dengan Tourism Monopoly!`, `Semua ${W.normal.tourismWin} tempat wisata dikuasai, permainan langsung selesai.`],
      line: [`📏 ${who} menang dengan Line Monopoly!`, 'Seluruh properti di satu sisi papan dikuasai, permainan langsung selesai.'],
      triple: [`🎨 ${who} menang dengan Triple Monopoly!`, '3 kawasan warna dikuasai penuh, permainan langsung selesai.'],
      bankrupt: [`🏆 ${who} menang!`, S.teams ? 'Semua tim lawan sudah bangkrut.' : 'Lawan terakhir sudah bangkrut.'],
      time: [`⏱ ${who} menang!`, `Waktu ${W.gameMinutes || 60} menit habis. Pemenangnya ${S.teams ? 'tim' : 'pemain'} dengan total kekayaan terbesar.`]
    }[S.winBy];
    const head = WIN ? WIN[0] : isNormal() ? `🏆 ${who} menang!` : `🏆 ${who} bertahan paling lama`;
    const sub = WIN ? WIN[1] : isNormal() ? 'Permainan diakhiri. Pemenang dihitung dari total kekayaan.' : 'Selamat, masih hidup. Tapi jujur saja: semua pemain sama-sama susah ekonominya. Tidak ada yang benar-benar menang.';
    openModal(`<h2>${head}</h2>
      <p class="lead">⏱ Lama permainan: <b>${fmtDuration(S.elapsed || 0)}</b><br>${sub}</p>
      <ol class="rank">${S.ranking.map(r => { const q = P(r.id); return `<li>${face(q)}<b>${esc(q.name)}</b><span>${r.bankrupt ? `💀 gugur ke-${r.outAt}` : 'bertahan · ' + rp(r.worth)}</span></li>`; }).join('')}</ol>
      ${W.serverLaptop ? '<button class="btn y" id="btnAgain">Main lagi</button>' : '<p class="empty">Menunggu ronde baru dimulai dari laptop server.</p>'}`, true);
    const a = $('#btnAgain'); if (a) a.onclick = () => emit('reset');
  });
  renderEnd.open = S.winner;
}

/* ---------- Modal ---------- */
function openModal(html, sticky, wide) {
  if (modalEditor) { modalEditor.dispose(); modalEditor = null; }
  $('#modalBody').className = 'panel' + (wide ? ' wide' : '');
  $('#modalBody').innerHTML = html + (sticky ? '' : '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="mClose">Tutup</button></div>');
  $('#modal').hidden = false;
  const c = $('#mClose'); if (c) c.onclick = closeModal;
  $('#modal').onclick = e => { if (e.target.id === 'modal' && !sticky) closeModal(); };
}
function closeModal() { $('#modal').hidden = true; if (modalEditor) { modalEditor.dispose(); modalEditor = null; } }
function confirmBox(title, text, okLabel, fn) {
  openModal(`<h2>${esc(title)}</h2><p class="lead">${esc(text)}</p><div class="row"><button class="btn r" id="cOk">${esc(okLabel)}</button></div>`);
  $('#cOk').onclick = () => { closeModal(); fn(); };
}
const TILE_DESC = {
  start: () => `Gajian ${rp(W.salary)} setiap melewati petak ini, ditambah ${rpS(W.land.income)} per tambang/kebun sawit, dan 1 voucher subsidi upgrade.`,
  jail: () => `Kalau hanya mampir, aman. Tahanan bisa keluar dengan dadu kembar, denda ${rp(W.jailFine)}, atau kartu Orang Dalam. Selama dipenjara, uang yang mestinya diterima masuk kas negara.`,
  travel: () => 'Berhenti di sini: bebas pilih kotak tujuan mana saja di papan.',
  festival: () => `Adakan festival di salah satu propertimu: sewa ×2, lalu ×4, ×8, … maksimal ×${W.normal.festivalMax} kalau festival diadakan lagi di properti yang sama.`,
  slot: () => `Mesin Game: pilih taruhan ${W.normal.slotBets.map(rpS).join(' / ')}, cocokkan 3 simbol untuk menang hingga ×${W.normal.slotJackpot} taruhan.`,
  gotojail: () => 'Langsung masuk penjara tanpa melewati Mulai.',
  kesempatan: () => 'Ambil kartu Kesempatan (hijau): rezeki kecil, kartu sakti, Putar Balik Fakta, atau pujian untuk pejabat.',
  musibah: () => 'Ambil kartu Musibah (merah). Kocok 1 dadu: hasil 1–2, 3–4, dan 5–6 berbeda. Sebagian kartu kena semua pemain.',
  tax: t => {
    const p = meP(), n = p ? propsOf(p.id).filter(i => !S.props[i].mortgaged).length : 0, per = W.taxPerProperty || 0;
    return `Pajak dinamis: ${rp(t.amount || 0)} + ${rp(per)} untuk tiap properti yang kamu miliki (yang digadai tidak dihitung). Kamu sekarang punya ${n} properti, jadi pajakmu ${rp((t.amount || 0) + n * per)}.`;
  }
};
function openTile(i) {
  if (!S || !W) return;
  const t = W.board[i], pr = S.props[i], p = meP();
  const band = t.type === 'city' || t.type === 'tourism' ? W.groupColors[t.group] : t.type === 'kesempatan' ? 'var(--green)' : t.type === 'musibah' ? 'var(--red)' : '#232329';
  let h = `<div class="mband" style="background:${band}"></div><h2>${tileIcon(t)} ${esc(t.name)}</h2>`;
  const travelBtn = myTurn() && S.pending && S.pending.type === 'travel' && (S.pending.row == null || Math.floor(i / SDN()) === S.pending.row) ? `<div class="row" style="margin:10px 0"><button class="btn y" id="goHere">✈️ Travelling ke sini</button></div>` : '';
  if (!pr) {
    openModal(h + `<p class="lead">${esc(TILE_DESC[t.type] ? TILE_DESC[t.type](t) : '')}</p>` + travelBtn);
    const g = $('#goHere'); if (g) g.onclick = () => { closeModal(); emit('travel', { tile: i }); };
    return;
  }
  const o = pr.owner ? P(pr.owner) : null;
  const safe = pr.grace > 0 ? ` · 🛡️ aman dari kejadian acak ${pr.grace} gajian lagi` : '';
  const useTxt = pr.use === 'tambang' ? `⛏️ Tambang${pr.closed > 0 ? ` (ditutup akamsi, ${pr.closed} giliran lagi)` : ''}${safe}` : pr.use === 'sawit' ? `🌴 Kebun sawit${safe}` : pr.use === 'dapur' ? `🍱 Dapur Gizi Gratis${safe}` : '';
  const extra = [];
  if (S.festival && S.festival.tile === i) extra.push(`🎪 Festival: sewa ×${S.festival.mult}`);
  if (pr.slump) extra.push(`💣 Sewa turun 50% (${pr.slump.turns} giliran lagi)`);
  if (pr.blackout) extra.push(`⚡ Listrik padam ${pr.blackout.turns} giliran lagi: siapa pun yang berhenti di sini bebas sewa. Pemiliknya bisa menyalakan lagi dengan berhenti di sini.`);
  if (pr.lease) extra.push(`🔑 Dikontrak ${esc((P(pr.lease.by) || {}).name || '')} dari ${esc((P(pr.lease.from) || {}).name || '')}, ${pr.lease.turns} giliran lagi`);
  if (isNormal() && t.type === 'city' && pr.owner === me && pr.houses < 5) extra.push('🏗️ Bangun saat berhenti di sini atau tepat di Mulai. Kabupaten setelah melewati Mulai 1 kali; Landmark dari Kabupaten.');
  if (pr.owner) extra.push(`Sewa saat ini: <b>${rp(rentNow(i))}</b>`);
  if (extra.length) h += `<p class="warn" style="background:#f4f2ea;border-color:var(--line)">${extra.join('<br>')}</p>`;
  if (pr.dynasty) h += '<p class="warn" style="background:#fff3c4;border-color:#b8860b">👑 Dilindungi Jalur Dinasti: kebal dari penyitaan, pembongkaran, dan perebutan.</p>';
  h += `<p class="lead">${o ? 'Milik <b>' + esc(o.name) + '</b>' : 'Belum dimiliki'} · Harga ${rp(t.price)}${pr.mortgaged ? ' · <b style="color:var(--red)">digadai ke bank</b>' : ''}${useTxt ? ' · ' + useTxt : ''}</p>`;
  if (t.type === 'city') {
    const labels = isNormal() ? ['Sewa tanah', '🏡 Desa', '🏘️ Kota', '🏙️ Kabupaten', null, '🏛️ Landmark'] : ['Sewa tanah', '1 rumah', '2 rumah', '3 rumah', '4 rumah', 'Hotel'];
    h += `<table class="rent">${t.rent.map((r, k) => labels[k] ? `<tr class="${pr.houses === k && o ? 'cur' : ''}"><td>${labels[k]}</td><td>${rp(r)}</td></tr>` : '').join('')}
      <tr><td>${isNormal() ? `Harga 1 tingkat (Landmark ${W.normal.landmarkHouses}×)` : 'Harga 1 rumah / hotel'}</td><td>${rp(t.house)}</td></tr><tr><td>Nilai gadai ke bank (termasuk bangunan)</td><td>${rp(pr.mortgaged ? (pr.mortgageValue || t.price / 2) : mortgageValue(i))}</td></tr></table>`;
  } else if (t.type === 'tourism') {
    const n = pr.owner ? tourismOf(pr.owner) : 0, lv = pr.tlevel || 0, N = W.normal;
    h += `<p class="warn" style="background:#e3f7f5;border-color:#0fb5ae">🏝️ Tempat wisata: <b>tidak bisa diambil alih</b>. Tingkatnya naik gratis tiap kali pemiliknya berhenti di sini (kunjungan ke-3 = Landmark). Sewa ×2 kalau pemiliknya punya 2 wisata, ×3 kalau punya 3. Kuasai ${W.normal.tourismWin} tempat wisata = <b>langsung menang</b>.${pr.owner ? ` ${esc(o.name)} kini punya ${n}/${W.normal.tourismWin}.` : ''}</p>`;
    h += `<p class="lead">Tingkat sekarang: <b>${N.tourismLevels[lv]}</b></p><table class="rent"><tr><th></th>${[1, 2, 3].map(c => `<th>Punya ${c}</th>`).join('')}</tr>
      ${N.tourismLevels.map((name, k) => `<tr class="${o && lv === k ? 'cur' : ''}"><td>${name}</td>${[1, 2, 3].map(c => `<td>${rpS(tourismRent(t, c, k))}</td>`).join('')}</tr>`).join('')}<tr><td>Nilai gadai ke bank</td><td>${rp(pr.mortgaged ? (pr.mortgageValue || t.price / 2) : mortgageValue(i))}</td></tr></table>`;
  } else if (t.type === 'station') {
    h += `<table class="rent">${[1, 2, 3, 4].map(n => `<tr><td>Punya ${n} stasiun/pelabuhan/bandara</td><td>${rp(250000 * Math.pow(2, n - 1))}</td></tr>`).join('')}<tr><td>Nilai gadai ke bank (termasuk bangunan)</td><td>${rp(pr.mortgaged ? (pr.mortgageValue || t.price / 2) : mortgageValue(i))}</td></tr></table>`;
  } else {
    h += `<table class="rent"><tr><td>Punya 1 (PLN atau PDAM)</td><td>4× angka dadu × Rp 10 rb</td></tr><tr><td>Punya keduanya</td><td>10× angka dadu × Rp 10 rb</td></tr><tr><td>Nilai gadai ke bank (termasuk bangunan)</td><td>${rp(pr.mortgaged ? (pr.mortgageValue || t.price / 2) : mortgageValue(i))}</td></tr></table>`;
  }
  if (p && o && o.id === me && S.phase === 'playing') {
    const acts = [];
    if (pr.houses > 0 && !pr.mortgaged) acts.push(`<button class="btn" data-a="sell">Jual 1 bangunan ke bank (+${rpS(t.house / 2)})</button>`);
    if (!pr.mortgaged) acts.push(`<button class="btn b" data-a="mortgage">Gadai ke bank (pinjam ${rpS(mortgageValue(i))})</button>`);
    if (pr.mortgaged) acts.push(`<button class="btn" data-a="unmortgage">Tebus dari bank (${rpS(redeemCost(i))})</button>`);
    if (pr.closed > 0) {
      if (p.pejabat > 0) acts.push(`<button class="btn g" data-reopen="all">🎖️ Buka segel gratis (pejabat)</button>`);
      else {
        acts.push(`<button class="btn" data-reopen="1">Bayar akamsi −1 giliran (${rpS(W.land.reopenCost)})</button>`);
        acts.push(`<button class="btn" data-reopen="all">Buka langsung (${rpS(W.land.reopenCost * pr.closed)})</button>`);
      }
    }
    const canUp = myTurn() && (!S.pending || (S.pending.type === 'upgradeOffer' && S.pending.tile === i));
    const up = canUp ? upgradeHtml(i) : '';
    if (up) h += `<h3 class="sub">Upgrade tanah ini</h3>${up}`;
    else if (t.type === 'city' && upgradeOptions(i).length && !isNormal()) h += '<p class="empty">Upgrade bisa dilakukan saat giliranmu.</p>';
    if (acts.length) h += `<div class="acts row" style="margin-top:10px">${acts.join('')}</div>`;
  }
  openModal(h + travelBtn);
  const reopen = () => setTimeout(() => { if (!$('#modal').hidden) openTile(i); }, 250);
  document.querySelectorAll('#modalBody [data-a]').forEach(b => b.onclick = () => { emit(b.dataset.a, { tile: i }); reopen(); });
  document.querySelectorAll('#modalBody [data-reopen]').forEach(b => b.onclick = () => { emit('reopen', { tile: i, all: b.dataset.reopen === 'all' }); reopen(); });
  bindUpgrade($('#modalBody'), i, reopen);
  const g = $('#goHere'); if (g) g.onclick = () => { closeModal(); emit('travel', { tile: i }); };
}

/* ---------- Suara ---------- */
function renderSoundButtons() {
  for (const id of ['#btnMusic', '#btnMusic2']) { const b = $(id); b.setAttribute('aria-pressed', String(sound.music)); b.title = sound.music ? 'Matikan musik' : 'Nyalakan musik'; }
  for (const id of ['#btnFx', '#btnFx2']) { const b = $(id); b.setAttribute('aria-pressed', String(sound.fx)); b.textContent = sound.fx ? '🔊' : '🔇'; b.title = sound.fx ? 'Matikan efek suara' : 'Nyalakan efek suara'; }
}
$('#btnMusic').onclick = $('#btnMusic2').onclick = () => { sound.setMusic(!sound.music); renderSoundButtons(); };
$('#btnFx').onclick = $('#btnFx2').onclick = () => { sound.setFx(!sound.fx); renderSoundButtons(); };
document.addEventListener('click', e => { if (e.target.closest('.btn, .chips button, .colors button, .pick-list button, .travel button')) sound.play('click'); }, true);

/* ---------- Tombol ---------- */
$('#btnJoin').onclick = () => {
  const name = $('#nameIn').value, v = joinEditor ? joinEditor.value : {};
  store.set(DRAFT_KEY, JSON.stringify({ ...v, name }));
  emit('join', { name, color: v.color, look: v.look, photo: v.photo && v.photo.startsWith('data:') ? v.photo : undefined });
};
$('#nameIn').onkeydown = e => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnWatch').onclick = $('#btnWatch2').onclick = () => { watching = true; render(); };
$('#btnStart').onclick = () => emit('start');
$('#btnAddBot').onclick = () => emit('addBot');
$('#btnLeave').onclick = () => emit('leave');
$('#btnAddr').onclick = () => openModal(`<h2>Ajak teman</h2><p class="lead">${addrHtml()}</p><p class="empty">Pastikan semua perangkat tersambung ke Wi-Fi yang sama.</p>`);
$('#btnAvatar').onclick = () => {
  const p = meP(); if (!p) return;
  openModal('<h2>Avatar kamu</h2><p class="lead">Perubahan langsung terlihat di papan semua pemain.</p><div id="mEditor"></div>', false, true);
  modalEditor = liveEditor($('#mEditor'), p);
};
$('#btnHost').onclick = () => {
  openModal(`<h2>⏹ Akhiri permainan</h2><p class="lead">Menu ini hanya ada di laptop server.</p><div style="display:grid;gap:10px">
    <button class="btn y" id="hEnd">Hentikan sekarang dan lihat peringkat</button>
    <button class="btn r" id="hReset">Game baru dari awal</button></div>`);
  $('#hEnd').onclick = () => confirmBox('Akhiri permainan?', 'Yang masih bertahan diurutkan dari total kekayaan, yang gugur dari urutan gugurnya.', 'Akhiri', () => emit('hostEnd'));
  $('#hReset').onclick = () => confirmBox('Mulai game baru?', 'Semua uang dan properti di permainan ini akan dihapus. Pemain dan bot kembali ke lobi.', 'Mulai baru', () => emit('reset'));
};
let follow = false;
$('#camFollow').onclick = () => { follow = !follow; $('#camFollow').setAttribute('aria-pressed', String(follow)); board3d && board3d.setFollow(follow); };
$('#camTop').onclick = () => board3d && board3d.topView();
$('#camReset').onclick = () => board3d && board3d.resetCamera();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (bigCard && !popupDecisions().length) { closePopup(); return; }
    if (!$('#modal').hidden && !renderEnd.open) closeModal();
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || !$('#modal').hidden || bigCard || !$('#sheet').hidden) return;
  if (e.code === 'Space' && S && S.phase === 'playing') {
    const b = document.querySelector('#dockBody [data-act="endTurn"]:not([disabled])');
    const r = document.querySelector('#dockBody [data-roll]:not([disabled])');
    if (r && !b) { e.preventDefault(); emit('roll'); return; }
    if (b) { e.preventDefault(); b.click(); }
  }
});
