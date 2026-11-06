// Musik latar dan efek suara. File mp3 ada di /sounds dan boleh diganti dengan milikmu sendiri
// (nama file harus sama). Browser baru mengizinkan suara setelah pemain menyentuh layar sekali.
const FX = ['step', 'dice', 'card', 'kesempatan', 'musibah', 'jail', 'cash', 'pay', 'buy', 'build', 'turn',
  'bankrupt', 'win', 'power', 'shield', 'seize', 'travel', 'click', 'gajian', 'sewa', 'ultra', 'festival', 'slot', 'slotwin'];
// Suara khusus dari /sounds/custom. Mengganti file cukup mengubah nama di sini.
const CUSTOM = {
  takeover: 'akansayalawan', jail: 'jokowi-kaget', nemesis: 'tf_nemesis', uanggakada: 'prabowo-uang-gak-ada',
  injak: 'faaah', pajak: 'emotional-damage-meme', sanggup: 'jokowi-saya-masih-sanggup-2', kesempatan: 'anime-wow-sound-effect-mp3cut', ancaman: 'solid'
};
const VOL = { step: 0.45, click: 0.35, dice: 0.8, pay: 0.6, cash: 0.7 };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* mode privat */ } }
};

// track: 'lobbyscene' (lobi), 'bgm' (mode WNI), atau 'bgm_normal' (mode Normal). meta.json menyimpan panjang loop tiap lagu.
let ctx = null, fxGain = null, musicGain = null, musicSrc = null, meta = {}, track = 'lobbyscene';
const buffers = {};
let musicOn = store.get('jn_music', true), fxOn = store.get('jn_fx', true);

async function load(name) {
  try {
    const res = await fetch('/sounds/' + (CUSTOM[name] ? 'custom/' + CUSTOM[name] : name) + '.mp3');
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
  [...new Set([...FX, ...Object.keys(CUSTOM)])].forEach(load);
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

function startMusic() {
  if (!ctx || musicSrc) return;
  const name = track, buf = buffers[name];
  if (!buf) { load(name).then(() => { if (musicOn && (name !== track || buffers[name])) startMusic(); }); return; }
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

// 🌳 Wangsit Ringin Contong: paduan suara malaikat "haaaa" (disintesis, tanpa file mp3).
// Akor mayor dari suara gergaji yang sedikit sumbang, disaring formant vokal "a", vibrato pelan,
// gema berulang, dan denting lonceng saat kartu suci turun. Musik latar dikecilkan sebentar.
function choir() {
  const t0 = ctx.currentTime, dur = 3.4;
  const out = ctx.createGain(); out.gain.value = 0.55; out.connect(fxGain);
  // gema sederhana: delay + umpan balik
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.23;
  const fb = ctx.createGain(); fb.gain.value = 0.38; const wet = ctx.createGain(); wet.gain.value = 0.45;
  dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
  const voice = ctx.createGain();
  voice.gain.setValueAtTime(0, t0);
  voice.gain.linearRampToValueAtTime(0.22, t0 + 0.7);
  voice.gain.setValueAtTime(0.22, t0 + dur - 1.2);
  voice.gain.linearRampToValueAtTime(0, t0 + dur);
  // formant vokal "a": tiga pita frekuensi paralel
  for (const [f, q, gn] of [[800, 6, 1], [1150, 7, 0.6], [2900, 9, 0.25]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gn;
    voice.connect(bp); bp.connect(g); g.connect(out); g.connect(dl);
  }
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 5.2; lfoG.gain.value = 4; lfo.connect(lfoG);
  // A mayor naik ke D mayor (seperti "haaa-leluu"): nada bergeser lembut di tengah
  const notes = [[220, 293.7], [277.2, 370], [329.6, 440], [440, 587.3]];
  for (const [a, b] of notes) for (const det of [-7, 0, 6]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
    o.frequency.setValueAtTime(a, t0); o.frequency.setValueAtTime(a, t0 + 1.4); o.frequency.exponentialRampToValueAtTime(b, t0 + 1.9);
    lfoG.connect(o.detune); o.connect(voice); o.start(t0); o.stop(t0 + dur + 0.1);
  }
  lfo.start(t0); lfo.stop(t0 + dur + 0.1);
  // denting lonceng berkilau saat kartu turun
  [1760, 2349, 2637, 3520].forEach((f, k) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + 1.9 + k * 0.12;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g); g.connect(out); g.connect(dl); o.start(t); o.stop(t + 1.2);
  });
  // kecilkan musik latar selama paduan suara
  if (musicSrc) {
    const mg = musicGain.gain; mg.cancelScheduledValues(t0); mg.setValueAtTime(mg.value, t0);
    mg.linearRampToValueAtTime(0.08, t0 + 0.4); mg.setValueAtTime(0.08, t0 + dur); mg.linearRampToValueAtTime(0.32, t0 + dur + 1.2);
  }
}

// 👹 Auman monster dan 🚓 peluit polisi: disintesis, tanpa file mp3.
function roar() {
  const t0 = ctx.currentTime, dur = 1.8, g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(300, t0); lp.frequency.linearRampToValueAtTime(1300, t0 + 0.5); lp.frequency.linearRampToValueAtTime(200, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.55, t0 + 0.25); g.gain.setValueAtTime(0.5, t0 + 0.9); g.gain.linearRampToValueAtTime(0, t0 + dur);
  lp.connect(g); g.connect(fxGain);
  for (const [f, det] of [[62, 0], [64, 9], [93, -6], [124, 5]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
    o.frequency.setValueAtTime(f * 0.8, t0); o.frequency.linearRampToValueAtTime(f * 1.25, t0 + 0.5); o.frequency.linearRampToValueAtTime(f * 0.65, t0 + dur);
    o.connect(lp); o.start(t0); o.stop(t0 + dur);
  }
}
function whistle() {
  const t0 = ctx.currentTime, g = ctx.createGain(), o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 2500; lfo.frequency.value = 32; lg.gain.value = 170; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.2, t0 + 0.03);
  for (const [a, b] of [[0.3, 0.02], [0.36, 0.2], [0.8, 0.2]]) g.gain.setValueAtTime(b, t0 + a);
  g.gain.linearRampToValueAtTime(0, t0 + 0.85);
  o.connect(g); g.connect(fxGain); o.start(t0); lfo.start(t0); o.stop(t0 + 0.9); lfo.stop(t0 + 0.9);
}

export const sound = {
  isCustom: name => !!CUSTOM[name],
  duration: name => (buffers[name] ? buffers[name].duration : 0),
  play(name, vol) {
    if (name === 'wangsit') { if (fxOn && ctx) choir(); return; }
    if (name === 'roar') { if (fxOn && ctx) roar(); return; }
    if (name === 'peluit') { if (fxOn && ctx) whistle(); return; }
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
  // Ganti lagu latar (dipanggil saat fase atau mode permainan berubah).
  setTrack(name) {
    if (name === track) return;
    track = name;
    if (musicSrc) { stopMusic(); setTimeout(() => { if (musicOn) startMusic(); }, 750); }
  }
};
