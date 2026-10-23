// Musik latar dan efek suara. File mp3 ada di /sounds dan boleh diganti dengan milikmu sendiri
// (nama file harus sama). Browser baru mengizinkan suara setelah pemain menyentuh layar sekali.
const FX = ['step', 'dice', 'card', 'kesempatan', 'musibah', 'jail', 'cash', 'pay', 'buy', 'build', 'turn',
  'bankrupt', 'win', 'power', 'shield', 'seize', 'travel', 'click', 'gajian', 'sewa', 'ultra', 'festival', 'slot', 'slotwin'];
const VOL = { step: 0.45, click: 0.35, dice: 0.8, pay: 0.6, cash: 0.7 };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* mode privat */ } }
};

// track: 'bgm' (mode WNI) atau 'bgm_normal' (mode Normal). meta.json menyimpan panjang loop tiap lagu.
let ctx = null, fxGain = null, musicGain = null, musicSrc = null, meta = {}, track = 'bgm';
const buffers = {};
let musicOn = store.get('jn_music', true), fxOn = store.get('jn_fx', true);

async function load(name) {
  try {
    const res = await fetch('/sounds/' + name + '.mp3');
    if (!res.ok) return;
    buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (e) { /* file tidak ada / gagal decode: diam saja */ }
}

function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  fxGain = ctx.createGain(); fxGain.gain.value = 0.9; fxGain.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(ctx.destination);
  fetch('/sounds/meta.json').then(r => r.json()).then(m => { meta = m || {}; }).catch(() => {})
    .finally(() => { if (musicOn) startMusic(); });
  FX.forEach(load);
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

function startMusic() {
  if (!ctx || musicSrc) return;
  const name = track, buf = buffers[name];
  if (!buf) { load(name).then(() => { if (buffers[name] && musicOn && name === track) startMusic(); }); return; }
  musicSrc = ctx.createBufferSource();
  musicSrc.buffer = buf;
  musicSrc.loop = true;
  const loopEnd = meta[name + 'Loop'];
  if (loopEnd && loopEnd < buf.duration) { musicSrc.loopStart = 0; musicSrc.loopEnd = loopEnd; }
  musicSrc.connect(musicGain);
  musicSrc.start();
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(0, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 2);
}
function stopMusic() {
  if (!musicSrc) return;
  const src = musicSrc; musicSrc = null;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  setTimeout(() => { try { src.stop(); } catch (e) { /* sudah berhenti */ } }, 700);
}

export const sound = {
  play(name, vol) {
    if (!fxOn || !ctx || !buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    const g = ctx.createGain();
    g.gain.value = (vol == null ? 1 : vol) * (VOL[name] || 1);
    if (name === 'step') src.playbackRate.value = 0.92 + Math.random() * 0.16;
    src.connect(g); g.connect(fxGain);
    src.start();
  },
  get music() { return musicOn; },
  get fx() { return fxOn; },
  setMusic(v) { musicOn = v; store.set('jn_music', v); unlock(); v ? startMusic() : stopMusic(); },
  setFx(v) { fxOn = v; store.set('jn_fx', v); },
  // Ganti lagu latar (dipanggil saat mode permainan berubah).
  setTrack(name) {
    if (name === track) return;
    track = name;
    if (musicSrc) { stopMusic(); setTimeout(() => { if (musicOn) startMusic(); }, 750); }
  }
};
