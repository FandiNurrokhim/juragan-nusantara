// Membuat semua suara permainan secara prosedural lalu menyimpannya sebagai mp3 di public/sounds.
// Jalankan sekali: npm run sounds   (butuh devDependency @breezystack/lamejs)
// Mau pakai lagu/efek sendiri? Timpa saja file mp3-nya dengan nama yang sama.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mp3Encoder } from '@breezystack/lamejs';

const SR = 44100;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds');

/* ---------------- Alat sintesis ---------------- */
const buf = sec => new Float32Array(Math.ceil(sec * SR));
function mix(dst, src, at = 0, gain = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length && o + i < dst.length; i++) if (o + i >= 0) dst[o + i] += src[i] * gain;
  return dst;
}
// Mix dengan membungkus ekor ke awal (untuk musik yang diulang tanpa jeda).
function mixWrap(dst, src, at, gain = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length; i++) dst[(o + i) % dst.length] += src[i] * gain;
}
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const white = () => rand() * 2 - 1;

// Filter biquad (RBJ)
function biquad(x, type, f, q = 0.707) {
  const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = a; b1 = 0; b2 = -a; } // bp
  a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Nada dengan beberapa parsial: [rasio, amplitudo, waktu luruh (detik)]
function tone(f, dur, partials, { attack = 0.002, bend = 0, bendTime = 0.05, vib = 0, vibRate = 5, detune = 0, wave = 'sine' } = {}) {
  const out = buf(dur);
  for (const [ratio, amp, decay] of partials) {
    for (const dt of detune ? [1, 1 + detune] : [1]) {
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        const fb = f * ratio * dt * (1 + bend * Math.exp(-t / bendTime)) * (1 + vib * Math.sin(2 * Math.PI * vibRate * t));
        ph += 2 * Math.PI * fb / SR;
        const s = wave === 'saw' ? ((ph / Math.PI) % 2) - 1 : wave === 'square' ? Math.sign(Math.sin(ph)) : Math.sin(ph);
        const env = Math.min(1, t / attack) * Math.exp(-t / decay);
        out[i] += s * env * amp / (detune ? 2 : 1);
      }
    }
  }
  return out;
}
function noise(dur, { decay = 0.1, attack = 0.001, filter, f = 1000, q = 1 } = {}) {
  let out = buf(dur);
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = white() * Math.min(1, t / attack) * Math.exp(-t / decay); }
  if (filter) out = biquad(out, filter, f, q);
  return out;
}
const gainOf = (x, g) => { for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
function fadeOut(x, sec) { const n = Math.round(sec * SR); for (let i = 0; i < n && i < x.length; i++) x[x.length - 1 - i] *= i / n; return x; }
function normalize(x, peak = 0.9) {
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  return m ? gainOf(x, peak / m) : x;
}

/* ---------------- Instrumen ---------------- */
const metal = (f, decay = 1.2, dur = decay * 4) =>
  tone(f, dur, [[1, 1, decay], [2.76, 0.42, decay * 0.45], [5.4, 0.2, decay * 0.22], [8.93, 0.1, decay * 0.12]], { detune: 0.0035, attack: 0.0015 });
const bonang = (f, dur = 1.6) => {
  const x = tone(f, dur, [[1, 1, 0.55], [2.0, 0.3, 0.25], [3.01, 0.12, 0.14]], { bend: -0.01, detune: 0.003 });
  return mix(x, noise(0.03, { decay: 0.008, filter: 'bp', f: f * 3, q: 3 }), 0, 0.15);
};
const gong = (f = 58, dur = 5) =>
  tone(f, dur, [[1, 1, 2.6], [1.47, 0.35, 1.8], [2.09, 0.28, 1.3], [2.56, 0.14, 1.0], [3.3, 0.06, 0.6]], { attack: 0.03, detune: 0.009 });
const kempul = f => tone(f, 2.6, [[1, 1, 1.1], [1.48, 0.3, 0.7], [2.1, 0.2, 0.5]], { attack: 0.01, detune: 0.007 });
const kendangDhe = () => tone(150, 0.4, [[1, 1, 0.14]], { bend: 0.6, bendTime: 0.03 });
const kendangTak = () => mix(noise(0.12, { decay: 0.03, filter: 'bp', f: 1700, q: 1.6 }), tone(330, 0.12, [[1, 0.6, 0.03]]), 0, 1);
const wood = (f = 900, decay = 0.04) => mix(tone(f, 0.25, [[1, 1, decay], [2.3, 0.4, decay * 0.6]]), noise(0.05, { decay: 0.006, filter: 'bp', f: f * 2, q: 2 }), 0, 0.5);
const bell = (f, decay = 0.8) => tone(f, decay * 4, [[1, 1, decay], [2.0, 0.5, decay * 0.6], [3.0, 0.3, decay * 0.4], [4.2, 0.2, decay * 0.25]], { attack: 0.001 });

// Tangga nada slendro (± 240 sen per langkah). Derajat 1 2 3 5 6 → indeks 0..4.
const BASE = 277.18;
const sl = idx => BASE * Math.pow(2, idx * 240 / 1200);
const DEG = { '6.': -1, '1': 0, '2': 1, '3': 2, '5': 3, '6': 4, "1'": 5, "2'": 6 };

/* ---------------- Musik latar ---------------- */
function bgm() {
  const beat = 0.56;
  const A = '2 1 2 6. 2 1 2 6. 3 5 6 5 3 2 1 6.';
  const B = "5 6 1' 6 5 3 2 3 5 6 5 3 2 1 2 6.";
  const B2 = "3 5 3 2 5 6 1' 6 3 5 6 5 2 1 2 6.";
  const notes = [A, B, A, B2].join(' ').split(' ').map(n => DEG[n]);
  const N = notes.length, len = N * beat;
  const out = new Float32Array(Math.round(len * SR));
  notes.forEach((n, b) => {
    const t = b * beat, next = notes[(b + 1) % N], inG = b % 16;
    mixWrap(out, metal(sl(n), 1.0, 3), t, 0.42);                                  // saron
    [n, next, n, next].forEach((m, k) => mixWrap(out, metal(sl(m + 5), 0.45, 1.4), t + k * beat / 4, 0.12)); // peking
    if (b % 2 === 1 || b >= 32) mixWrap(out, bonang(sl(n + 5)), t + beat / 2, 0.16); // bonang
    if (inG % 4 === 3) mixWrap(out, metal(sl(n) / 2, 1.8, 5), t, 0.22);           // kenong
    if (inG === 7 || inG === 11) mixWrap(out, kempul(sl(n) / 2), t, 0.3);
    if (inG === 15) mixWrap(out, gong(sl(-1) / 4), t, 0.75);
    // kendang
    const k = b % 4;
    if (k === 0) mixWrap(out, kendangDhe(), t, 0.38);
    if (k === 1 || k === 2) mixWrap(out, kendangTak(), t + beat / 2, 0.22);
    if (k === 3) { mixWrap(out, kendangDhe(), t, 0.32); mixWrap(out, kendangDhe(), t + beat / 2, 0.26); }
  });
  return { data: normalize(biquad(out, 'lp', 7000), 0.85), loop: len };
}

/* ---------------- Efek suara ---------------- */
/* ---------------- Musik latar mode Normal: lebih cepat & ceria ---------------- */
function bgmNormal() {
  const beat = 0.4, base = 293.66, scale = [0, 2, 4, 7, 9]; // pentatonik mayor
  const note = d => base * Math.pow(2, (12 * Math.floor(d / 5) + scale[((d % 5) + 5) % 5]) / 12);
  const A = [0, 2, 4, 2, 3, 4, 3, 2, 0, 2, 4, 5, 4, 3, 2, 1];
  const B = [4, 5, 7, 5, 4, 3, 2, 3, 4, 2, 0, 2, 3, 2, 1, 0];
  const notes = [...A, ...B, ...A, ...B.slice(0, 12), 2, 1, 0, -1];
  const bassDeg = [0, 0, 3, 3, 4, 4, 0, 0];
  const N = notes.length, len = N * beat;
  const out = new Float32Array(Math.round(len * SR));
  const dhut = () => tone(110, 0.45, [[1, 1, 0.18]], { bend: 0.9, bendTime: 0.05 });
  const tak = () => mix(noise(0.1, { decay: 0.025, filter: 'bp', f: 2200, q: 1.5 }), tone(400, 0.1, [[1, 0.5, 0.03]]), 0, 1);
  const tamb = () => noise(0.08, { decay: 0.02, filter: 'hp', f: 6000 });
  notes.forEach((n, b) => {
    const t = b * beat, next = notes[(b + 1) % N];
    mixWrap(out, metal(note(n + 5), 0.5, 1.4), t, 0.34);
    mixWrap(out, metal(note(next + 10), 0.25, 0.8), t + beat / 2, 0.1);
    if (b % 2 === 0) {
      const bd = bassDeg[Math.floor(b / 2) % bassDeg.length];
      mixWrap(out, biquad(tone(note(bd) / 4, 0.5, [[1, 1, 0.3], [2, 0.4, 0.2]], { wave: 'saw', attack: 0.01 }), 'lp', 500), t, 0.32);
    }
    const k = b % 4; // pola kendang ala dangdut
    if (k === 0) mixWrap(out, dhut(), t, 0.5);
    if (k === 1) mixWrap(out, tak(), t + beat / 2, 0.3);
    if (k === 2) { mixWrap(out, dhut(), t + beat / 2, 0.42); }
    if (k === 3) { mixWrap(out, tak(), t, 0.28); mixWrap(out, tak(), t + beat / 2, 0.22); }
    mixWrap(out, tamb(), t, 0.12); mixWrap(out, tamb(), t + beat / 2, 0.08);
    if (b % 16 === 15) mixWrap(out, gong(sl(-1) / 4, 3), t, 0.4);
  });
  return { data: normalize(biquad(out, 'lp', 8000), 0.85), loop: len };
}

const SFX = {
  step: () => { const x = buf(0.18); mix(x, wood(520, 0.035)); mix(x, tone(140, 0.15, [[1, 0.8, 0.04]], { bend: 0.5, bendTime: 0.02 })); return x; },
  click: () => wood(1400, 0.02),
  dice: () => {
    const x = buf(0.9); let t = 0, gap = 0.035;
    for (let k = 0; k < 11; k++) { mix(x, noise(0.05, { decay: 0.008, filter: 'bp', f: 2200 + rand() * 1800, q: 4 }), t, 0.9 - k * 0.06); t += gap; gap *= 1.17; }
    mix(x, wood(380, 0.05), t, 0.7); mix(x, wood(420, 0.05), t + 0.06, 0.5);
    return x;
  },
  card: () => {
    const x = noise(0.35, { decay: 0.12, attack: 0.04 });
    const y = buf(0.35); let lo = 0;
    for (let i = 0; i < x.length; i++) { const f = 900 + 3500 * (i / x.length); const c = 2 * Math.PI * f / SR; lo += c * (x[i] - lo); y[i] = x[i] - lo; }
    mix(y, wood(1800, 0.015), 0.28, 0.4);
    return y;
  },
  kesempatan: () => {
    const x = buf(2.2);
    [0, 1, 2, 3, 5].forEach((d, k) => mix(x, metal(sl(d + 5), 0.6, 1.8), k * 0.09, 0.5));
    for (let k = 0; k < 10; k++) mix(x, bell(2400 + rand() * 2600, 0.15), 0.45 + k * 0.05, 0.08);
    return x;
  },
  musibah: () => {
    const x = buf(3.2);
    mix(x, gong(55, 3.2), 0, 0.9);
    [[3, 0], [1, 0.28], [-1, 0.56]].forEach(([d, t]) =>
      mix(x, biquad(tone(sl(d) / 2, 1.0, [[1, 1, 0.5]], { wave: 'saw', attack: 0.02, vib: 0.01 }), 'lp', 900), t, 0.35));
    mix(x, noise(1.5, { decay: 0.6, attack: 0.05, filter: 'lp', f: 180 }), 0, 0.8);
    return x;
  },
  jail: () => {
    const x = buf(1.4);
    const clank = () => tone(410, 0.9, [[1, 1, 0.25], [2.63, 0.6, 0.12], [4.1, 0.4, 0.08], [6.8, 0.2, 0.05]]);
    mix(x, clank(), 0, 0.6); mix(x, noise(0.1, { decay: 0.02, filter: 'hp', f: 2000 }), 0, 0.4);
    mix(x, clank(), 0.22, 0.5);
    mix(x, tone(70, 0.6, [[1, 1, 0.18]], { bend: 0.5 }), 0.42, 0.9);
    mix(x, noise(0.3, { decay: 0.08, filter: 'lp', f: 600 }), 0.42, 0.7);
    mix(x, tone(1250, 0.6, [[1, 0.3, 0.1]]), 0.5, 0.2);
    return x;
  },
  cash: () => {
    const x = buf(1.3);
    mix(x, wood(300, 0.04), 0, 0.6);
    mix(x, bell(2093, 0.35), 0.06, 0.45); mix(x, bell(2637, 0.45), 0.12, 0.45);
    for (let k = 0; k < 8; k++) mix(x, bell(3500 + rand() * 3000, 0.06), 0.15 + rand() * 0.4, 0.12);
    return x;
  },
  pay: () => { const x = buf(0.8); [3200, 2800, 2500].forEach((f, k) => mix(x, bell(f, 0.09), k * 0.07, 0.3)); mix(x, wood(260, 0.05), 0.24, 0.5); return x; },
  buy: () => {
    const x = buf(1.4);
    mix(x, tone(90, 0.3, [[1, 1, 0.07]], { bend: 0.8, bendTime: 0.02 }), 0, 1); mix(x, noise(0.12, { decay: 0.03, filter: 'lp', f: 1500 }), 0, 0.6);
    mix(x, metal(sl(5), 0.5, 1.2), 0.12, 0.45); mix(x, metal(sl(7), 0.6, 1.2), 0.24, 0.45);
    return x;
  },
  build: () => { const x = buf(1.0); [0, 0.2, 0.4].forEach(t => { mix(x, wood(700, 0.05), t, 0.7); mix(x, tone(2600, 0.2, [[1, 0.2, 0.03]]), t, 0.3); }); return x; },
  turn: () => { const x = buf(1.6); mix(x, bonang(sl(3) * 2), 0, 0.6); mix(x, bonang(sl(5) * 2), 0.16, 0.6); return x; },
  bankrupt: () => {
    const x = buf(2.6);
    [[392, 0, 0.35], [370, 0.4, 0.35], [349, 0.8, 0.35], [330, 1.2, 1.3]].forEach(([f, t, d], k) =>
      mix(x, biquad(tone(f / 2, d + 0.2, [[1, 1, 3]], { wave: 'saw', attack: 0.03, vib: k === 3 ? 0.03 : 0.006, vibRate: k === 3 ? 6 : 5 }), 'lp', 1100), t, 0.4));
    return fadeOut(x, 0.4);
  },
  win: () => {
    const x = buf(3.8);
    [[0, 0], [2, 0.14], [3, 0.28], [5, 0.42]].forEach(([d, t]) =>
      mix(x, biquad(tone(sl(d), 0.5, [[1, 1, 2], [2, 0.5, 1]], { wave: 'saw', attack: 0.015 }), 'lp', 2400), t, 0.25));
    mix(x, biquad(tone(sl(5), 1.6, [[1, 1, 2], [1.5, 0.5, 1.2]], { wave: 'saw', attack: 0.02, vib: 0.008 }), 'lp', 2400), 0.56, 0.3);
    mix(x, gong(58, 3.2), 0.56, 0.7);
    for (let k = 0; k < 14; k++) mix(x, bell(2500 + rand() * 3500, 0.12), 0.6 + k * 0.08, 0.1);
    return fadeOut(x, 0.5);
  },
  power: () => {
    const x = buf(1.6);
    for (let k = 0; k < 16; k++) mix(x, bell(800 * Math.pow(2, k / 6), 0.18), k * 0.035, 0.12);
    mix(x, metal(sl(10), 0.5, 1), 0.56, 0.4);
    return x;
  },
  shield: () => {
    const x = buf(2.2);
    mix(x, tone(sl(5), 2.2, [[1, 1, 1.1], [2, 0.4, 0.6], [3, 0.3, 0.4]], { attack: 0.08, detune: 0.004 }), 0, 0.5);
    mix(x, tone(sl(7), 2.0, [[1, 0.6, 1.0]], { attack: 0.1 }), 0.12, 0.4);
    mix(x, metal(sl(10), 0.7, 1.4), 0.3, 0.3);
    return x;
  },
  travel: () => {
    const x = buf(1.8), n = noise(1.6, { decay: 0.7, attack: 0.5 });
    const y = buf(1.6); let lo = 0;
    for (let i = 0; i < n.length; i++) { const f = 300 + 2500 * Math.sin(Math.PI * i / n.length); const c = 2 * Math.PI * f / SR; lo += c * (n[i] - lo); y[i] = lo; }
    mix(x, y, 0, 1.2);
    [0, 2, 3, 5].forEach((d, k) => mix(x, bell(sl(d + 5), 0.3), 0.9 + k * 0.08, 0.25));
    return x;
  },
  // Gajian: kasir "ka-ching", laci terbuka, hujan koin, lalu denting gamelan naik.
  gajian: () => {
    const x = buf(2.4);
    mix(x, wood(240, 0.05), 0, 0.7);
    mix(x, noise(0.25, { decay: 0.08, filter: 'bp', f: 900, q: 1.2 }), 0.02, 0.5);
    mix(x, bell(2637, 0.5), 0.1, 0.6); mix(x, bell(3520, 0.6), 0.18, 0.6);
    for (let k = 0; k < 22; k++) mix(x, bell(3000 + rand() * 4000, 0.07), 0.3 + k * 0.035 + rand() * 0.02, 0.16);
    [0, 2, 3, 5, 7].forEach((d, k) => mix(x, metal(sl(d + 5), 0.5, 1.2), 1.1 + k * 0.1, 0.35));
    return fadeOut(x, 0.3);
  },
  // Sewa masuk: bel pintu "ding-dong", lalu koin jatuh ke celengan.
  sewa: () => {
    const x = buf(2.0);
    mix(x, bell(1319, 0.6), 0, 0.7); mix(x, bell(1047, 0.8), 0.32, 0.7);
    [0.85, 0.97, 1.06, 1.12].forEach((t, k) => { mix(x, bell(2800 - k * 180, 0.12), t, 0.4); mix(x, wood(420 + k * 30, 0.03), t, 0.3); });
    return fadeOut(x, 0.2);
  },
  // Kartu Ultra Rare: dentuman, gong, sapuan naik, fanfare, hujan kilau.
  ultra: () => {
    const x = buf(5.0);
    mix(x, tone(55, 1.5, [[1, 1, 0.6]], { bend: 1.2, bendTime: 0.15 }), 0, 1.0);
    mix(x, noise(1.2, { decay: 0.4, filter: 'lp', f: 300 }), 0, 0.8);
    mix(x, gong(52, 4.5), 0.05, 0.7);
    const sw = noise(1.4, { decay: 0.9, attack: 1.0 }); let lo = 0; const y = buf(1.4);
    for (let i = 0; i < sw.length; i++) { const f = 300 + 5000 * (i / sw.length); const c = 2 * Math.PI * f / SR; lo += c * (sw[i] - lo); y[i] = lo; }
    mix(x, y, 0.3, 0.8);
    [[0, 1.7], [2, 1.82], [3, 1.94], [5, 2.06], [7, 2.18]].forEach(([d, t]) =>
      mix(x, biquad(tone(sl(d), 0.6, [[1, 1, 2], [2, 0.5, 1]], { wave: 'saw', attack: 0.015 }), 'lp', 2600), t, 0.28));
    mix(x, biquad(tone(sl(10), 2.2, [[1, 1, 2.5], [1.5, 0.5, 1.5]], { wave: 'saw', attack: 0.03, vib: 0.01 }), 'lp', 2800), 2.3, 0.32);
    for (let k = 0; k < 30; k++) mix(x, bell(2500 + rand() * 5000, 0.15), 2.3 + k * 0.07, 0.11);
    return fadeOut(x, 0.6);
  },
  // Festival: sorak penonton, fanfare, kembang api.
  festival: () => {
    const x = buf(3.2);
    const crowd = noise(2.4, { decay: 1.0, attack: 0.4 }); mix(x, biquad(crowd, 'bp', 1200, 0.6), 0, 0.5);
    [[0, 0], [2, 0.12], [4, 0.24], [7, 0.36]].forEach(([d, t]) => mix(x, biquad(tone(sl(d + 5), 0.5, [[1, 1, 1.5], [2, 0.4, 0.8]], { wave: 'saw', attack: 0.01 }), 'lp', 3000), t, 0.25));
    mix(x, biquad(tone(sl(10), 1.2, [[1, 1, 1.5]], { wave: 'saw', attack: 0.02, vib: 0.01 }), 'lp', 3000), 0.5, 0.28);
    [1.2, 1.7, 2.2].forEach(t => {
      const w = buf(0.5); let ph = 0;
      for (let i = 0; i < w.length; i++) { const f = 2000 - 1500 * i / w.length; ph += 2 * Math.PI * f / SR; w[i] = Math.sin(ph) * 0.3 * (1 - i / w.length); }
      mix(x, w, t - 0.5, 0.4);
      mix(x, noise(0.6, { decay: 0.15, filter: 'lp', f: 2500 }), t, 0.7);
      for (let k = 0; k < 8; k++) mix(x, bell(3000 + rand() * 3000, 0.08), t + 0.05 + rand() * 0.4, 0.08);
    });
    return fadeOut(x, 0.4);
  },
  // Gulungan Mesin Game berputar
  slot: () => {
    const x = buf(2.2);
    for (let t = 0, k = 0; t < 2.0; t += 0.06, k++) mix(x, wood(900 + (k % 3) * 120, 0.012), t, 0.5);
    return x;
  },
  // Menang Mesin Game
  slotwin: () => {
    const x = buf(2.6);
    [0, 2, 4, 5, 7, 10].forEach((d, k) => mix(x, bell(sl(d + 5) * 2, 0.4), k * 0.08, 0.35));
    for (let k = 0; k < 30; k++) mix(x, bell(3000 + rand() * 4000, 0.06), 0.4 + k * 0.045, 0.12);
    mix(x, metal(sl(10), 0.8, 1.6), 0.5, 0.35);
    return fadeOut(x, 0.3);
  },
  seize: () => {
    const x = buf(1.4);
    mix(x, tone(70, 0.6, [[1, 1, 0.2]], { bend: 0.6 }), 0, 1);
    mix(x, noise(0.4, { decay: 0.1, filter: 'lp', f: 800 }), 0, 0.6);
    mix(x, biquad(tone(sl(1) / 2, 0.9, [[1, 1, 0.5]], { wave: 'square', attack: 0.01 }), 'lp', 700), 0.15, 0.2);
    mix(x, biquad(tone(sl(-1) / 2, 0.9, [[1, 1, 0.5]], { wave: 'square', attack: 0.01 }), 'lp', 700), 0.4, 0.22);
    return x;
  }
};

/* ---------------- Encode mp3 ---------------- */
function writeMp3(name, data, kbps = 128) {
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
  const enc = new Mp3Encoder(1, SR, kbps), parts = [];
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) parts.push(Buffer.from(b)); }
  parts.push(Buffer.from(enc.flush()));
  const file = path.join(OUT, name + '.mp3');
  fs.writeFileSync(file, Buffer.concat(parts));
  console.log(`  ${name}.mp3  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

// Tanpa argumen: buat semua suara. Dengan argumen (mis. "gajian sewa"): hanya suara itu, file lain tidak disentuh.
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
console.log('Membuat suara di', OUT);
for (const [name, make] of Object.entries(SFX)) if (!only.length || only.includes(name)) writeMp3(name, normalize(make(), 0.9));
// meta.json menyimpan panjang loop tiap lagu; isi lama dipertahankan.
const metaFile = path.join(OUT, 'meta.json');
let meta = {}; try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch (e) { /* belum ada */ }
for (const [name, make] of [['bgm', bgm], ['bgm_normal', bgmNormal]]) {
  if (only.length && !only.includes(name)) continue;
  const music = make();
  writeMp3(name, music.data, 112);
  meta[name + 'Loop'] = music.loop;
  console.log(`Musik ${name} ${music.loop.toFixed(1)} detik, diulang terus.`);
}
fs.writeFileSync(metaFile, JSON.stringify(meta));
console.log('Selesai.');
