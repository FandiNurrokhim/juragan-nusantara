// Papan 3D Juragan Nusantara: petak, bangunan, bidak avatar, dadu, dan tumpukan kartu.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildAvatar } from './avatar.js';
import { levelModel, landmarkModel, tint } from './buildings.js';
import { createFestivalDecor } from './festival.js';
import { createTileFx } from './tilefx.js';
import { createBlackholes } from './blackhole.js';

// Ukuran papan tetap; tiap sisi punya (SD - 1) petak biasa selebar W di antara 2 petak sudut (C x C).
// WNI: 40 petak (SD 10, W 1). Normal: 32 petak (SD 8, petak lebih lebar).
const C = 1.6, SIZE = 2 * C + 9, H = SIZE / 2, TEX = 2048, PX = TEX / SIZE;
let NT = 40, SD = 10, W = 1;
const BOARD_Y = 0.3;           // tinggi permukaan papan
const TOKEN_SCALE = 0.52;      // satu bidak di petak
const TOKEN_SCALE_CROWD = 0.42; // 2–6 bidak di petak yang sama
// Bidak makin kecil kalau petaknya makin ramai (sampai 20 pemain).
const tokenScale = n => (n <= 1 ? TOKEN_SCALE : n <= 6 ? TOKEN_SCALE_CROWD : n <= 12 ? 0.32 : 0.26);
// n titik dalam kotak [x0,x1]×[y0,y1] yang lolos filter, disusun rapat seperti grid.
function gridPts(n, x0, x1, y0, y1, keep = () => true) {
  for (let cols = Math.ceil(Math.sqrt(n)); cols < 12; cols++) {
    const rows = Math.ceil(cols * (y1 - y0) / Math.max(0.01, x1 - x0)) + 1, pts = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = [x0 + (cols === 1 ? 0.5 : c / (cols - 1)) * (x1 - x0), y0 + (rows === 1 ? 0.5 : r / (rows - 1)) * (y1 - y0)];
      if (keep(p)) pts.push(p);
    }
    if (pts.length >= n) return pts.slice(0, n);
  }
  return Array.from({ length: n }, () => [0, 0]);
}
const STEP_MS = 230;           // jeda tiap langkah bidak
const IDLE_MAX_WAIT = 3500;    // pop-up/suara menunggu bidak berhenti paling lama segini (ms)

const ICONS = { start: '➜', jail: '🔒', travel: '🧳', gotojail: '👮', festival: '🎪', slot: '🎰', kesempatan: '❓', musibah: '⚠️', tax: '🧾' };
export function tileIcon(t) {
  if (t.icon) return t.icon;
  if (ICONS[t.type]) return ICONS[t.type];
  if (t.type === 'utility') return t.name === 'PLN' ? '⚡' : '💧';
  if (t.type === 'station') return /Bandara/.test(t.name) ? '✈️' : /Pelabuhan/.test(t.name) ? '⚓' : '🚆';
  return '';
}
const rpS = n => { const a = Math.abs(n); return 'Rp ' + (a >= 1e6 ? (Math.round(a / 1e5) / 10).toString().replace('.', ',') + ' jt' : Math.round(a / 1e3) + ' rb'); };

/* ---------- Geometri petak ---------- */
// Pusat petak i, sisi papan (0 bawah, 1 kiri, 2 atas, 3 kanan), arah sepanjang sisi, dan arah ke tengah.
function tileFrame(i) {
  const side = Math.floor(i / SD), k = i % SD;
  const along = [[-1, 0], [0, -1], [1, 0], [0, 1]][side];
  const inward = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
  const corner = [[H, H], [-H, H], [-H, -H], [H, -H]][side];
  let x, z, w, d;
  if (k === 0) {
    x = corner[0] - Math.sign(corner[0]) * C / 2; z = corner[1] - Math.sign(corner[1]) * C / 2;
    w = C; d = C;
  } else {
    const s = C + (k - 0.5) * W;
    x = corner[0] + along[0] * s + inward[0] * C / 2;
    z = corner[1] + along[1] * s + inward[1] * C / 2;
    w = W; d = C;
  }
  return { x, z, side, along, inward, w, d, corner: k === 0 };
}
let FRAMES = Array.from({ length: NT }, (_, i) => tileFrame(i));
function layoutBoard(n) {
  NT = n; SD = n / 4; W = (SIZE - 2 * C) / (SD - 1);
  FRAMES = Array.from({ length: NT }, (_, i) => tileFrame(i));
}
// Titik di petak i dengan geser a (sepanjang sisi) dan n (ke arah tengah papan).
function tilePoint(i, a, n) {
  const f = FRAMES[i];
  return new THREE.Vector3(f.x + f.along[0] * a + f.inward[0] * n, BOARD_Y, f.z + f.along[1] * a + f.inward[1] * n);
}
function tileAt(x, z) {
  for (let i = 0; i < NT; i++) {
    const f = FRAMES[i];
    const hw = f.side % 2 === 0 ? f.w / 2 : f.d / 2, hd = f.side % 2 === 0 ? f.d / 2 : f.w / 2;
    if (Math.abs(x - f.x) <= hw && Math.abs(z - f.z) <= hd) return i;
  }
  return -1;
}

/* ---------- Gambar permukaan papan ---------- */
function wrapText(g, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
const FONT = '"Plus Jakarta Sans", system-ui, "Segoe UI", sans-serif';
const DISPLAY = '"Bricolage Grotesque", "Arial Black", system-ui, sans-serif';

// Pengali sewa total sebuah petak: satu warna x2, jumlah wisata (x2/x3), dan festival.
export function rentMult(BOARD, S, i) {
  const t = BOARD[i], pr = S && S.props[i];
  if (!t || !pr || !pr.owner || pr.mortgaged || pr.blackout) return 1; // tanah digadai / padam tidak menarik sewa
  let m = 1;
  if (t.type === 'city' && BOARD.every((b, j) => b.group !== t.group || (S.props[j] && S.props[j].owner === pr.owner))) m *= 2;
  if (t.type === 'tourism') m *= BOARD.filter((b, j) => b.type === 'tourism' && S.props[j] && S.props[j].owner === pr.owner).length;
  if (S.festival && S.festival.tile === i) m *= S.festival.mult;
  return m;
}
function drawBoard(g, BOARD, GC, S, colorOf) {
  g.fillStyle = '#232329'; g.fillRect(0, 0, TEX, TEX);
  // Bagian tengah: garis diagonal kuning
  const inner = C * PX;
  g.save();
  g.beginPath(); g.rect(inner, inner, TEX - 2 * inner, TEX - 2 * inner); g.clip();
  g.fillStyle = '#f4c21a'; g.fillRect(0, 0, TEX, TEX);
  g.strokeStyle = '#f7d04a'; g.lineWidth = 34;
  for (let k = -TEX; k < TEX * 2; k += 96) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - TEX, TEX); g.stroke(); }
  // Logo
  g.translate(TEX / 2, TEX / 2 - 10); g.rotate(-0.12);
  g.fillStyle = '#d9412f'; g.fillRect(-470 + 22, -205 + 26, 940, 410);
  g.fillStyle = '#fff'; g.fillRect(-470, -205, 940, 410);
  g.lineWidth = 14; g.strokeStyle = '#1d1d22'; g.strokeRect(-470, -205, 940, 410);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1d1d22'; g.font = `800 150px ${DISPLAY}`; g.fillText('JURAGAN', 0, -75);
  g.fillStyle = '#d9412f'; g.font = `800 132px ${DISPLAY}`; g.fillText('NUSANTARA', 0, 52);
  g.fillStyle = '#1d1d22'; g.font = `700 34px ${FONT}`; g.fillText(S && S.mode === 'normal' ? 'K O T A   ·   W I S A T A   ·   L A N D M A R K' : 'K O T A   ·   T A N A H   ·   H O T E L', 0, 150);
  g.restore();
  // Tempat tumpukan kartu
  for (const [x, z, label, col] of DECK_SPOTS) {
    if (label === 'MUSIBAH' && S && S.mode === 'normal') continue;
    g.save(); g.translate((x + H) * PX, (z + H) * PX); g.rotate(-0.35);
    g.setLineDash([20, 14]); g.lineWidth = 8; g.strokeStyle = col;
    roundRect(g, -150, -200, 300, 400, 30); g.stroke();
    g.setLineDash([]); g.fillStyle = col; g.font = `800 34px ${DISPLAY}`; g.textAlign = 'center';
    g.fillText(label, 0, 245);
    g.restore();
  }

  BOARD.forEach((t, i) => {
    const f = FRAMES[i], pr = S && S.props[i];
    g.save();
    g.translate((f.x + H) * PX, (f.z + H) * PX);
    g.rotate(f.side * Math.PI / 2);
    const w = f.w * PX, d = f.d * PX, x0 = -w / 2, y0 = -d / 2;
    const special = f.corner;
    g.fillStyle = special ? '#2b2b33' : '#fffdf6';
    g.fillRect(x0 + 3, y0 + 3, w - 6, d - 6);
    if (!special && pr && pr.owner) {
      g.save(); g.globalAlpha = pr.mortgaged ? 0.12 : 0.22; g.fillStyle = colorOf(pr.owner) || '#999';
      g.fillRect(x0 + 3, y0 + 3, w - 6, d - 6); g.restore();
    }
    g.lineWidth = 5; g.strokeStyle = '#1d1d22'; g.strokeRect(x0 + 3, y0 + 3, w - 6, d - 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (special) {
      g.fillStyle = '#fff';
      g.font = `110px ${FONT}`;
      if (t.type === 'start') { g.save(); g.scale(-1, 1); g.fillText(tileIcon(t), 0, -30); g.restore(); } // panah ke kiri, searah jalan bidak
      else g.fillText(tileIcon(t), 0, -30);
      g.font = `800 40px ${DISPLAY}`;
      wrapText(g, t.name.toUpperCase(), w - 30).forEach((l, k, arr) => g.fillText(l, 0, 70 + (k - (arr.length - 1) / 2) * 44));
      g.font = `600 24px ${FONT}`; g.fillStyle = '#f4c21a';
      const sub = { start: 'Gajian tiap putaran', jail: 'Cuma mampir', travel: 'Bebas pilih tujuan', gotojail: 'Langsung ke penjara', festival: 'Sewa berlipat' }[t.type];
      if (sub) g.fillText(sub, 0, 138);
    } else {
      const band = d * 0.2;
      if (t.type === 'city') { g.fillStyle = GC[t.group]; g.fillRect(x0 + 5, y0 + 5, w - 10, band); g.fillRect(x0 + 5, y0 + 5 + band - 4, w - 10, 4); }
      else if (t.type === 'tourism') {
        g.fillStyle = GC.wisata || '#0fb5ae'; g.fillRect(x0 + 5, y0 + 5, w - 10, band);
        g.fillStyle = '#fff'; g.font = `800 22px ${DISPLAY}`; g.fillText('WISATA', 0, y0 + 5 + band / 2);
      }
      else if (t.type === 'kesempatan' || t.type === 'musibah') { g.fillStyle = t.type === 'kesempatan' ? '#22a06b' : '#d9412f'; g.fillRect(x0 + 5, y0 + 5, w - 10, band); }
      let y = y0 + band + 34;
      if (t.type !== 'city') { g.font = `62px ${FONT}`; g.fillStyle = '#1d1d22'; g.fillText(tileIcon(t), 0, y + 26); y += 76; }
      g.fillStyle = '#1d1d22'; g.font = `700 25px ${FONT}`;
      const name = t.name.replace('Pelabuhan ', 'Pel. ').replace('Pajak Barang Mewah', 'Pajak Mewah');
      wrapText(g, name, w - 18).forEach((l, k) => g.fillText(l, 0, y + k * 28));
      const price = t.price || t.amount;
      if (price) { g.font = `600 22px ${FONT}`; g.fillStyle = '#4b4a45'; g.fillText(rpS(price) + (t.type === 'tax' ? ' +' : ''), 0, d / 2 - 34); }
      if (pr && pr.blackout) {
        g.fillStyle = 'rgba(12,12,30,.72)'; g.fillRect(x0 + 3, y0 + 3, w - 6, d - 6);
        g.fillStyle = '#ffe14d'; g.font = `800 34px ${DISPLAY}`; g.fillText('⚡ PADAM', 0, -8);
        g.font = `700 24px ${FONT}`; g.fillText(pr.blackout.turns + ' giliran', 0, 26);
      }
      const bhOwner = Object.keys(S.blackholes || {}).find(id => S.blackholes[id] === i);
      if (bhOwner) {
        const gr = g.createRadialGradient(0, 0, 4, 0, 0, 62);
        gr.addColorStop(0, '#000'); gr.addColorStop(0.55, '#1a0b2e'); gr.addColorStop(0.8, colorOf(bhOwner) || '#8e5bd6'); gr.addColorStop(1, 'rgba(142,91,214,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 4, 62, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = `800 19px ${DISPLAY}`; g.fillText('LUBANG', 0, -2); g.fillText('HITAM', 0, 20);
      }
      const mult = rentMult(BOARD, S, i);
      if (mult > 1) {
        const fest = S.festival && S.festival.tile === i;
        g.fillStyle = fest ? '#c2185b' : '#d9412f'; roundRect(g, -46, d / 2 - 86, 92, 40, 20); g.fill();
        g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
        g.fillStyle = '#fff'; g.font = `800 30px ${DISPLAY}`; g.fillText('×' + mult, 0, d / 2 - 65);
      }
      if (pr && pr.owner) {
        g.fillStyle = colorOf(pr.owner) || '#999';
        g.fillRect(x0 + 5, d / 2 - 22, w - 10, 17);
      }
      if (pr && pr.mortgaged) {
        g.save(); g.beginPath(); g.rect(x0 + 5, y0 + band + 5, w - 10, d - band - 10); g.clip();
        g.strokeStyle = 'rgba(217,65,47,.35)'; g.lineWidth = 10;
        for (let k = -d; k < w + d; k += 26) { g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x0 + k - d, y0 + d); g.stroke(); }
        g.restore();
        g.fillStyle = '#d9412f'; g.font = `800 30px ${DISPLAY}`; g.fillText('GADAI', 0, 22);
      }
    }
    g.restore();
  });
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const DECK_SPOTS = [[-2.7, -2.6, 'KESEMPATAN', '#14804f'], [2.7, 2.5, 'MUSIBAH', '#b3261e']];

/* ---------- Dadu ---------- */
// Urutan sisi BoxGeometry: +x, -x, +y, -y, +z, -z
const DIE_FACES = [2, 5, 1, 6, 3, 4];
const UP_ROT = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [0, 0, Math.PI / 2], 5: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
function dieMaterials() {
  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
    5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.27, .23], [.73, .23], [.27, .5], [.73, .5], [.27, .77], [.73, .77]] };
  return DIE_FACES.map(n => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#d9d5c7'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
    g.fillStyle = n === 1 ? '#d9412f' : '#1d1d22';
    PIPS[n].forEach(([x, y]) => { g.beginPath(); g.arc(x * 128, y * 128, n === 1 ? 17 : 12, 0, Math.PI * 2); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  });
}

/* ---------- Scene ---------- */
export function createBoardScene(container, opts) {
  const { onTileClick, onStep } = opts;
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(mobile ? 1.75 : 2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e6e2d6');
  scene.fog = new THREE.Fog('#e6e2d6', 26, 60);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.3; controls.minDistance = 4; controls.maxDistance = 45;
  controls.screenSpacePanning = false;

  scene.add(new THREE.HemisphereLight('#fffaf0', '#8c7a5c', 1.35));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(-6, 14, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -8.5, right: 8.5, top: 8.5, bottom: -8.5, near: 1, far: 40 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Meja
  const table = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: '#c9b48e', roughness: 0.9 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);
  const ornaments = buildOrnaments(); scene.add(ornaments);
  // Badan papan + bingkai
  const frame = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.5, BOARD_Y - 0.02, SIZE + 0.5), new THREE.MeshStandardMaterial({ color: '#232329', roughness: 0.55 }));
  frame.position.y = (BOARD_Y - 0.02) / 2; frame.castShadow = true; frame.receiveShadow = true; scene.add(frame);
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = boardCanvas.height = TEX;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const top = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 }));
  top.rotation.x = -Math.PI / 2; top.position.y = BOARD_Y; top.receiveShadow = true; scene.add(top);

  // Sel penjara di sudut petak 10 (bagian dalam). Pengunjung berdiri di luar sel.
  const jailF = FRAMES[10];
  const cellC = new THREE.Vector3(jailF.x + 0.28, BOARD_Y, jailF.z - 0.28);
  {
    const bars = new THREE.Group(), barM = new THREE.MeshStandardMaterial({ color: '#8d8f99', metalness: 0.8, roughness: 0.35 });
    const S2 = 0.5, HGT = 0.9;
    const barG = new THREE.CylinderGeometry(0.022, 0.022, HGT, 8);
    for (let k = 0; k <= 6; k++) {
      const t = -S2 + k * (2 * S2 / 6);
      for (const [x, z] of [[t, -S2], [t, S2], [-S2, t], [S2, t]]) { const b = new THREE.Mesh(barG, barM); b.position.set(x, HGT / 2, z); b.castShadow = true; bars.add(b); }
    }
    const rimM = new THREE.MeshStandardMaterial({ color: '#5b5d66', metalness: 0.6, roughness: 0.4 });
    for (const [x, z, w, d] of [[0, -S2, 2 * S2 + 0.06, 0.06], [0, S2, 2 * S2 + 0.06, 0.06], [-S2, 0, 0.06, 2 * S2], [S2, 0, 0.06, 2 * S2]]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), rimM);
      rim.position.set(x, HGT, z); rim.castShadow = true; bars.add(rim);
    }
    bars.position.copy(cellC);
    scene.add(bars);
  }

  // Tumpukan kartu
  const decks = {};
  function deckTex(label, sub, color, icon) {
    const c = document.createElement('canvas'); c.width = 300; c.height = 420;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 300, 420);
    g.strokeStyle = '#fff'; g.lineWidth = 10; roundRect(g, 18, 18, 264, 384, 22); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `120px ${FONT}`; g.fillText(icon, 150, 170);
    g.font = `800 40px ${DISPLAY}`; g.fillText(label, 150, 290);
    g.font = `600 22px ${FONT}`; g.fillText(sub, 150, 330);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function makeDeck(name, x, z, color, label, sub, icon) {
    const g = new THREE.Group();
    const tex = deckTex(label, sub, color, icon);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 2.1), new THREE.MeshStandardMaterial({ color: '#f3efe3', roughness: 0.8 }));
    stack.position.y = 0.12; stack.castShadow = true; g.add(stack);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.242; g.add(face);
    g.position.set(x, BOARD_Y, z); g.rotation.y = 0.35;
    scene.add(g);
    // Kartu yang terangkat saat diambil
    const flyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide, transparent: true });
    const fly = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), flyMat);
    fly.visible = false; fly.castShadow = true; scene.add(fly);
    decks[name] = { group: g, fly, t0: -1 };
  }
  makeDeck('kesempatan', DECK_SPOTS[0][0], DECK_SPOTS[0][1], '#1f9a62', 'KESEMPATAN', 'kartu hijau', '🍀');
  makeDeck('musibah', DECK_SPOTS[1][0], DECK_SPOTS[1][1], '#c8352a', 'MUSIBAH', 'kartu merah', '⚠️');

  // Dadu
  const dieMats = dieMaterials();
  const dice = [0, 1].map(k => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), dieMats);
    m.castShadow = true;
    m.position.set(-1.6 + k * 0.9, BOARD_Y + 0.275, 2.3 + k * 0.3);
    scene.add(m);
    return { mesh: m, from: new THREE.Vector3(), to: new THREE.Vector3(), q: new THREE.Quaternion(), axis: new THREE.Vector3(), t0: -1 };
  });
  function finalQuat(v) {
    const e = UP_ROT[v] || UP_ROT[1];
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2).multiply(base);
  }
  function setDice(vals, animate) {
    const now = performance.now();
    dice.forEach((d, k) => {
      d.q = finalQuat(vals[k]);
      d.to.set(-1.7 + k * 1.0 + (Math.random() - 0.5) * 0.5, BOARD_Y + 0.275, 2.1 + k * 0.35 + (Math.random() - 0.5) * 0.5);
      if (!animate) { d.mesh.position.copy(d.to); d.mesh.quaternion.copy(d.q); d.t0 = -1; return; }
      d.from.set(-3.6 + k * 0.4, BOARD_Y + 2.6, 3.6);
      d.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.t0 = now + k * 60;
    });
  }
  const DICE_MS = 950;

  // Penanda giliran: cincin di bawah bidak + berlian melayang
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshStandardMaterial({ color: '#f4c21a', emissive: '#7a5a00', metalness: 0.3, roughness: 0.3 }));
  gem.castShadow = true; scene.add(gem);

  // Bangunan & patok kepemilikan (dibuat ulang saat properti berubah)
  const buildGroup = new THREE.Group(); scene.add(buildGroup);
  const houseM = new THREE.MeshStandardMaterial({ color: '#2e9e5b', roughness: 0.5 });
  const roofM = new THREE.MeshStandardMaterial({ color: '#1e7a43', roughness: 0.5 });
  const hotelM = new THREE.MeshStandardMaterial({ color: '#d9412f', roughness: 0.5 });
  // Bahan putih & emas untuk pagoda wisata tingkat Landmark.
  const lmWhite = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.5 });
  const lmGold = new THREE.MeshStandardMaterial({ color: '#e2b33c', metalness: 0.8, roughness: 0.25, emissive: '#5a4200' });
  // Tempat wisata: pagoda (meru) yang bertambah susun tiap kali pemiliknya berkunjung; tingkat 3 = Landmark emas.
  const meruWall = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.6 });
  const meruRoof = new THREE.MeshStandardMaterial({ color: '#0fb5ae', roughness: 0.5 });
  const tourismCache = new Map();
  function addTourism(p, level) {
    if (!tourismCache.has(level)) tourismCache.set(level, makeTourism(level));
    const g = tourismCache.get(level).clone(); g.position.set(p.x, BOARD_Y, p.z);
    return g;
  }
  function makeTourism(level) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), level === 3 ? lmWhite : meruWall); base.position.y = 0.03; g.add(base);
    let y = 0.06;
    for (let k = 0; k <= level; k++) {
      const w = 0.3 - k * 0.055;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.07, w * 0.7), meruWall); wall.position.y = y + 0.035; g.add(wall);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, 0.09, 4), level === 3 ? lmGold : meruRoof);
      roof.position.y = y + 0.115; roof.rotation.y = Math.PI / 4; g.add(roof);
      y += 0.13;
    }
    if (level === 3) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 8), lmGold); tip.position.y = y + 0.06; g.add(tip); }
    g.scale.setScalar(1.25 + level * 0.12);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  // Festival: aurora, umbul-umbul, bohlam, dan papan pengali (lihat festival.js)
  const fest = createFestivalDecor(roundRect, DISPLAY);
  scene.add(fest.light);
  const tileFx = createTileFx(scene);
  const holes = createBlackholes(scene);
  let lastHoles = null, lastWarpSeq = null;
  // Lubang hitam: pusaran di petak, busur energi dari Alien saat lubang baru dibuka.
  function syncHoles() {
    const list = (S && S.mode === 'normal' && S.blackholes) || {};
    if (lastHoles) for (const [id, i] of Object.entries(list)) {
      const tk = tokens.get(id);
      if (lastHoles[id] !== i && tk && FRAMES[i]) holes.arc(tk.obj.position.clone(), tilePoint(i, 0, 0), colorOf(id));
    }
    lastHoles = { ...list };
    holes.sync(list, i => tilePoint(i, 0, 0), id => colorOf(id));
  }
  // Lencana "liontin aktif" yang melayang naik di atas bidak pemiliknya
  const badges = [];
  function addBadge(pid, text, kind) {
    const tk = tokens.get(pid); if (!tk) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d'); g.font = `800 40px ${FONT}`;
    const w = Math.min(500, g.measureText(text).width + 56);
    // ungu-pink = liontin, emas = skill avatar
    const [c0, c1] = kind === 'skill' ? ['#f7b500', '#e8590c'] : ['#7b2ff7', '#f107a3'];
    const grd = g.createLinearGradient(256 - w / 2, 0, 256 + w / 2, 0); grd.addColorStop(0, c0); grd.addColorStop(1, c1);
    g.fillStyle = grd; roundRect(g, 256 - w / 2, 8, w, 80, 40); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 20; sp.scale.set(2.0, 0.375, 1); scene.add(sp);
    const stack = badges.filter(b => b.pid === pid).length;
    badges.push({ pid, sp, t0: performance.now() + stack * 450, stack });
  }
  function updateBadges(now) {
    for (let k = badges.length - 1; k >= 0; k--) {
      const b = badges[k], tk = tokens.get(b.pid), t = (now - b.t0) / 2600;
      if (!tk || t >= 1) { scene.remove(b.sp); b.sp.material.map.dispose(); b.sp.material.dispose(); badges.splice(k, 1); continue; }
      const u = Math.max(0, t);
      b.sp.visible = t >= 0;
      // sedikit digeser ke tengah papan supaya tidak terpotong di tepi layar
      b.sp.position.set(tk.obj.position.x * 0.8, tk.obj.position.y + 2.0 + u * 0.7 + b.stack * 0.05, tk.obj.position.z * 0.8);
      b.sp.material.opacity = u < 0.12 ? u / 0.12 : u > 0.75 ? (1 - u) / 0.25 : 1;
      const pop = u < 0.12 ? 0.6 + u / 0.12 * 0.4 : 1; b.sp.scale.set(1.6 * pop, 0.3 * pop, 1);
    }
  }
  // Penanda kuning untuk tujuan dadu Ganjil/Genap
  const hlGroup = new THREE.Group(); scene.add(hlGroup);
  const pillTex = new Map();
  function pillSprite(text, bg, fg, size = 34) {
    const key = text + bg + fg + size;
    if (!pillTex.has(key)) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const g = c.getContext('2d'); g.font = `800 ${size}px ${FONT}`;
      const w = Math.min(250, g.measureText(text).width + 28);
      g.fillStyle = bg; roundRect(g, 128 - w / 2, 6, w, 52, 26); g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; pillTex.set(key, t);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillTex.get(key), transparent: true, depthTest: false }));
    sp.renderOrder = 15;
    return sp;
  }
  // Angka 2–12 di atas petak yang bisa dicapai dari posisimu (sebelum melempar dadu)
  const reachGroup = new THREE.Group(); scene.add(reachGroup);
  let reachKey = '';
  function reach(list) {
    const key = list.map(r => r.tile + ':' + r.n).join(',') + ':' + NT;
    if (key === reachKey) return;
    reachKey = key;
    reachGroup.children.forEach(c => c.material.dispose()); reachGroup.clear();
    for (const r of list) {
      if (!FRAMES[r.tile]) continue;
      const sp = pillSprite(String(r.n), r.n === 7 ? '#f4c21a' : '#ffffff', '#1d1d22', 40);
      const p = tilePoint(r.tile, 0, -0.2); sp.position.set(p.x, BOARD_Y + 0.7, p.z); sp.scale.set(1.3, 0.325, 1);
      reachGroup.add(sp);
    }
  }
  // Penanda "KAMU" di atas bidakmu sendiri
  const meTag = pillSprite('▼ KAMU', '#f4c21a', '#1d1d22', 36); meTag.scale.set(1.6, 0.4, 1); meTag.visible = false; scene.add(meTag);
  const hlMat = new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.65, depthWrite: false });
  let hlKey = '';
  function highlight(list) {
    const key = list.join(',') + ':' + NT;
    if (key === hlKey) return;
    hlKey = key; hlGroup.children.forEach(c => c.geometry.dispose()); hlGroup.clear();
    for (const i of list) {
      const f = FRAMES[i]; if (!f) continue;
      const along = f.side % 2 === 0;
      const m = new THREE.Mesh(new THREE.PlaneGeometry((along ? f.w : f.d) - 0.06, (along ? f.d : f.w) - 0.06), hlMat);
      m.rotation.x = -Math.PI / 2; m.position.set(f.x, BOARD_Y + 0.012, f.z); m.renderOrder = 3;
      hlGroup.add(m);
    }
  }
  const houseG = new THREE.BoxGeometry(0.17, 0.14, 0.17), roofG = new THREE.ConeGeometry(0.15, 0.12, 4);
  const hotelG = new THREE.BoxGeometry(0.5, 0.26, 0.2);
  // Tambang: tumpukan batu + menara kayu. Kebun sawit: pohon-pohon sawit kecil.
  const rockG = new THREE.DodecahedronGeometry(0.11), rockM = new THREE.MeshStandardMaterial({ color: '#6b6258', roughness: 0.95, flatShading: true });
  const coalM = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.9, flatShading: true });
  const woodG = new THREE.BoxGeometry(0.03, 0.4, 0.03), woodM = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.8 });
  const barG = new THREE.BoxGeometry(0.5, 0.05, 0.04), barM = new THREE.MeshStandardMaterial({ color: '#d9412f', roughness: 0.5 });
  const trunkG = new THREE.CylinderGeometry(0.025, 0.035, 0.32, 6), trunkM = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 });
  const leafG = new THREE.ConeGeometry(0.05, 0.26, 4), leafM = new THREE.MeshStandardMaterial({ color: '#2f8f3a', roughness: 0.7 });
  function addMine(p, closed) {
    const g = new THREE.Group(); g.position.set(p.x, BOARD_Y, p.z);
    [[0, 0, 1.2], [0.13, 0.05, 0.9], [-0.12, 0.06, 0.85], [0.03, -0.12, 0.8]].forEach(([x, z, s], k) => {
      const r = new THREE.Mesh(rockG, k % 2 ? coalM : rockM); r.position.set(x, 0.07 * s, z); r.scale.setScalar(s); r.rotation.set(k, k * 2, 0); r.castShadow = true; g.add(r);
    });
    for (const x of [-0.16, 0.16]) { const w = new THREE.Mesh(woodG, woodM); w.position.set(x, 0.2, -0.15); w.castShadow = true; g.add(w); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.03), woodM); beam.position.set(0, 0.4, -0.15); g.add(beam);
    if (closed) for (const r of [0.6, -0.6]) { const b = new THREE.Mesh(barG, barM); b.position.set(0, 0.2, 0.12); b.rotation.z = r; b.castShadow = true; g.add(b); }
    buildGroup.add(g);
  }
  // Dapur Gizi Gratis: bangunan putih beratap oranye dengan cerobong mengepul.
  const kitchenWallM = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.7 });
  const kitchenRoofM = new THREE.MeshStandardMaterial({ color: '#e46b2a', roughness: 0.6 });
  const steamM = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, roughness: 1 });
  function addKitchen(p) {
    const g = new THREE.Group(); g.position.set(p.x, BOARD_Y, p.z);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), kitchenWallM); wall.position.y = 0.11; wall.castShadow = true; g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.14, 4), kitchenRoofM); roof.position.y = 0.29; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.78); roof.castShadow = true; g.add(roof);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), kitchenRoofM); chimney.position.set(0.12, 0.36, 0); g.add(chimney);
    [0.47, 0.55, 0.64].forEach((y, k) => { const st = new THREE.Mesh(new THREE.SphereGeometry(0.035 + k * 0.012, 8, 6), steamM); st.position.set(0.12 + k * 0.02, y, 0); g.add(st); });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.01), kitchenRoofM); door.position.set(0, 0.06, 0.151); g.add(door);
    buildGroup.add(g);
  }
  function addPalms(p) {
    for (const [dx, dz] of [[-0.18, 0.05], [0.16, -0.08], [0.02, 0.18]]) {
      const tree = new THREE.Group(); tree.position.set(p.x + dx, BOARD_Y, p.z + dz);
      const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.y = 0.16; trunk.castShadow = true; tree.add(trunk);
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.Mesh(leafG, leafM);
        const a = k / 6 * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.09, 0.33, Math.sin(a) * 0.09);
        leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
        leaf.castShadow = true; tree.add(leaf);
      }
      buildGroup.add(tree);
    }
  }
  const crownG = new THREE.SphereGeometry(0.06, 12, 10), crownM = new THREE.MeshStandardMaterial({ color: '#e2b33c', metalness: 0.8, roughness: 0.25, emissive: '#5a4200' });

  /* ---------- Bidak ---------- */
  const tokens = new Map(); // pid -> token
  let BOARD = [], GC = {}, S = null, me = null, colorOf = () => null;
  let holdUntil = 0, idleCbs = [], followOn = false, lastBuildSig = '', lastDiceSeq = null, shakeUntil = 0, shakeMs = 1;
  const shakeOff = new THREE.Vector3();

  function tokenSig(p, photoUrl) { return [p.color, JSON.stringify(p.look), photoUrl].join('|'); }
  function slotOffsets(i, n, jailed) {
    const f = FRAMES[i];
    if (n > 6) {
      // banyak pemain: grid otomatis (penjara: pengunjung di luar sel, tahanan di dalam sel)
      if (i === SD) return jailed ? gridPts(n, -0.38, 0.38, -0.38, 0.38) : gridPts(n, -0.72, 0.72, -0.72, 0.72, ([x, y]) => x < -0.28 || y < -0.28);
      return f.corner ? gridPts(n, -0.62, 0.62, -0.62, 0.55) : gridPts(n, -0.36, 0.36, -0.5, 0.5);
    }
    if (i === SD) {
      // di dalam sel atau di jalur luar petak penjara
      if (jailed) return [[0, 0], [-0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [0, 0.25]].slice(0, Math.max(1, n));
      return [[-0.45, -0.55], [-0.55, -0.15], [-0.55, 0.25], [-0.15, -0.55], [0.25, -0.55], [0.6, -0.6]];
    }
    if (f.corner) return n <= 1 ? [[0, 0.1]] : [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.3], [0.35, 0.3], [0, 0.05], [0, -0.45]];
    return n <= 1 ? [[0, -0.1]] : [[-0.22, 0.05], [0.22, 0.05], [-0.22, -0.35], [0.22, -0.35], [0, -0.15], [0, 0.35]];
  }
  function slotPos(i, k, n, jailed) {
    if (i === SD && jailed) {
      const o = slotOffsets(i, n, true)[k % Math.max(6, n)];
      return new THREE.Vector3(cellC.x + o[0], BOARD_Y, cellC.z + o[1]);
    }
    if (i === SD) {
      const o = slotOffsets(i, n, false)[k % Math.max(6, n)];
      return new THREE.Vector3(jailF.x + o[0], BOARD_Y, jailF.z - o[1]);
    }
    const o = slotOffsets(i, n, false)[k % Math.max(6, n)];
    // n negatif = ke arah luar papan (menjauh dari jalur bangunan)
    return tilePoint(i, o[0], -o[1] - 0.05);
  }

  function ensureToken(p, photoUrl) {
    let tk = tokens.get(p.id);
    const sig = tokenSig(p, photoUrl);
    if (tk && tk.sig === sig) return tk;
    const avatar = buildAvatar({ color: colorOf(p.id) || '#999', look: p.look, photoUrl });
    avatar.scale.setScalar(TOKEN_SCALE);
    if (tk) {
      scene.remove(tk.obj);
      tk.obj = avatar; tk.sig = sig;
      avatar.position.copy(tk.pos);
    } else {
      tk = { obj: avatar, sig, disp: p.pos, server: p.pos, queue: [], hop: null, pos: new THREE.Vector3(), jailed: !!p.inJail, dispJailed: !!p.inJail };
      tokens.set(p.id, tk);
      tk.pos.copy(FRAMES[p.pos] ? tilePoint(p.pos, 0, 0) : new THREE.Vector3());
    }
    avatar.add(nameTag(p.name));
    scene.add(avatar);
    return tk;
  }
  function nameTag(name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = `700 30px ${FONT}`;
    const w = Math.min(248, g.measureText(name).width + 28);
    g.fillStyle = 'rgba(29,29,34,.82)'; roundRect(g, 128 - w / 2, 8, w, 46, 23); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
    sp.scale.set(1.3, 0.325, 1); sp.position.y = 2.5;
    return sp;
  }

  function route(from, to, jailed) {
    const fwd = (to - from + NT) % NT, back = (from - to + NT) % NT, out = [];
    if (jailed) out.push({ to, jump: true, jailed: true });
    else if (fwd > 0 && fwd <= 12) for (let k = 1; k <= fwd; k++) out.push({ to: (from + k) % NT });
    else if (back > 0 && back <= 3) for (let k = 1; k <= back; k++) out.push({ to: (from - k + NT) % NT });
    else out.push({ to, jump: true });
    return out;
  }
  function syncTokens(rolled) {
    const now = performance.now();
    const roller = rolled && S.players[S.turn];
    const alive = S.players.filter(p => !p.bankrupt);
    if (lastWarpSeq === null) lastWarpSeq = S.warp ? S.warp.seq : 0; // jangan putar ulang saat halaman baru dibuka
    for (const [id, tk] of tokens) if (!alive.some(p => p.id === id)) { scene.remove(tk.obj); tokens.delete(id); }
    alive.forEach(p => {
      const tk = ensureToken(p, opts.photoUrl(p));
      if (p.pos === tk.server && !!p.inJail === tk.jailed) return;
      const from = tk.server;
      tk.server = p.pos;
      const newlyJailed = p.inJail && !tk.jailed;
      const dest = (from + S.dice[0] + S.dice[1]) % NT, w = S.warp;
      if (w && w.seq !== lastWarpSeq && w.pid === p.id && w.to === p.pos) { lastWarpSeq = w.seq; tk.queue.push(...route(from, w.from, false), { to: w.to, jump: true, warp: w.from }); tk.jailed = !!p.inJail; return; }
      if (roller && roller.id === p.id && !tk.jailed && dest !== p.pos && dest !== from) tk.queue.push(...route(from, dest, false), ...route(dest, p.pos, newlyJailed));
      else tk.queue.push(...route(from, p.pos, newlyJailed));
      if (tk.queue.length > 24) { const last = tk.queue[tk.queue.length - 1]; tk.queue = [{ to: last.to, jump: true, jailed: last.jailed }]; }
      tk.jailed = !!p.inJail;
    });
    if (holdUntil < now && alive.some(p => tokens.get(p.id).queue.length)) holdUntil = Math.max(holdUntil, now + 120);
  }

  function cityLabel(i, h) {
    const t = BOARD[i]; if (!t) return;
    const sp = pillSprite(t.name, 'rgba(255,253,246,.92)', '#1d1d22', 30);
    const p = tilePoint(i, 0, C / 2 - 0.38); sp.position.set(p.x, BOARD_Y + h, p.z); sp.scale.set(1.45, 0.36, 1);
    buildGroup.add(sp);
  }
  function rebuildProps() {
    const sig = JSON.stringify(S.props) + JSON.stringify(S.festival || null) + JSON.stringify(S.blackholes || null) + S.mode + S.players.map(p => p.id + p.color).join();
    if (sig === lastBuildSig) return;
    lastBuildSig = sig;
    if (decks.musibah) decks.musibah.group.visible = S.mode !== 'normal';
    ornaments.visible = S.mode !== 'normal'; // mode Normal: tanpa ornamen tambahan supaya lebih ringan
    drawBoard(boardCanvas.getContext('2d'), BOARD, GC, S, colorOf);
    boardTex.needsUpdate = true;
    buildGroup.clear();
    for (const [k, pr] of Object.entries(S.props)) {
      const i = +k, f = FRAMES[i];
      if (pr.use === 'tambang') addMine(tilePoint(i, -0.05, C / 2 - 0.4), pr.closed > 0);
      else if (pr.use === 'sawit') addPalms(tilePoint(i, -0.05, C / 2 - 0.4));
      else if (pr.use === 'dapur') addKitchen(tilePoint(i, -0.05, C / 2 - 0.4));
      // Bangunan diwarnai sesuai pemiliknya (abu-abu kalau digadai), pengganti bendera kepemilikan.
      const own = pr.owner ? (pr.mortgaged ? '#9a968a' : pr.blackout ? '#34344a' : colorOf(pr.owner) || '#999') : null;
      if (BOARD[i] && BOARD[i].type === 'tourism' && pr.owner) { buildGroup.add(tint(addTourism(tilePoint(i, -0.05, C / 2 - 0.36), pr.tlevel || 0), own)); cityLabel(i, 0.75 + (pr.tlevel || 0) * 0.2); }
      if (S.mode === 'normal' && BOARD[i] && BOARD[i].type === 'city' && pr.houses > 0) {
        // Desa / Kota / Kabupaten sama untuk semua kota; Landmark khas tiap kota.
        const m = pr.houses === 5 ? landmarkModel(BOARD[i].name) : levelModel(pr.houses);
        const p = tilePoint(i, 0, C / 2 - 0.38);
        m.position.set(p.x, BOARD_Y, p.z); m.rotation.y = -f.side * Math.PI / 2; m.scale.setScalar(1.25);
        buildGroup.add(own ? tint(m, own) : m);
        cityLabel(i, pr.houses === 5 ? 1.35 : 0.75);
      } else if (pr.houses > 0 && pr.houses < 5) {
        for (let h = 0; h < pr.houses; h++) {
          const p = tilePoint(i, (h - (pr.houses - 1) / 2) * 0.22, C / 2 - 0.17);
          const hb = new THREE.Mesh(houseG, houseM); hb.position.set(p.x, BOARD_Y + 0.07, p.z); hb.castShadow = true;
          const rf = new THREE.Mesh(roofG, roofM); rf.position.set(p.x, BOARD_Y + 0.2, p.z); rf.rotation.y = Math.PI / 4; rf.castShadow = true;
          buildGroup.add(own ? tint(new THREE.Group().add(hb, rf), own) : new THREE.Group().add(hb, rf));
        }
      } else if (pr.houses === 5) {
        const p = tilePoint(i, 0, C / 2 - 0.17);
        const hm = new THREE.Mesh(hotelG, hotelM); hm.position.set(p.x, BOARD_Y + 0.13, p.z); hm.castShadow = true;
        hm.rotation.y = f.side % 2 === 0 ? 0 : Math.PI / 2;
        buildGroup.add(own ? tint(new THREE.Group().add(hm), own) : hm);
      }
      if (pr.owner) {
        if (pr.dynasty) { const p = tilePoint(i, 0.36, -C / 2 + 0.2); const c = new THREE.Mesh(crownG, crownM); c.position.set(p.x, BOARD_Y + 0.08, p.z); c.castShadow = true; buildGroup.add(c); }
        if (S.festival && S.festival.tile === i) { fest.place(tilePoint(i, 0, 0), -f.side * Math.PI / 2, f.w, rentMult(BOARD, S, i)); buildGroup.add(fest.group); }
      }
    }
  }

  /* ---------- Kamera ---------- */
  function resetCamera() {
    // jarak supaya seluruh papan muat, baik di layar lebar maupun HP tegak
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * (camera.aspect || 1));
    const dist = Math.max(7.0 / Math.tan(hHalf), 6.4 / Math.tan(vHalf)) + 0.5;
    camera.position.set(0, dist * 0.8, dist * 0.6);
    controls.target.set(0, 0, 0.6);
    controls.update();
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    const first = !camera.userData.sized;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (first) { camera.userData.sized = true; resetCamera(); }
  }
  new ResizeObserver(resize).observe(container);

  // Klik petak (bedakan dengan menggeser kamera)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(top)[0];
    if (hit) { const i = tileAt(hit.point.x, hit.point.z); if (i >= 0) onTileClick(i); }
  });

  /* ---------- Animasi ---------- */
  const tmp = new THREE.Vector3();
  function groupSlots() {
    // pengelompokan berdasarkan petak tujuan supaya bidak tidak saling tumpuk
    const groups = new Map();
    for (const p of S ? S.players : []) {
      const tk = tokens.get(p.id); if (!tk) continue;
      const tile = tk.hop ? tk.hop.to : tk.disp;
      const key = tile + (tile === SD && tk.dispJailed ? 'j' : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tk);
    }
    for (const list of groups.values()) list.forEach((tk, k) => { tk.slot = k; tk.slotN = list.length; });
  }
  function frameLoop(now) {
    const dt = Math.min(0.05, (now - (frameLoop.last || now)) / 1000); frameLoop.last = now;
    fest.update(now, !!fest.group.parent);
    tileFx.update(now);
    holes.update(now);
    for (const [id, tk] of tokens) holes.aura(id, !!(S && S.mode === 'normal' && S.blackholes && S.blackholes[id] != null), tk.obj.position, colorOf && colorOf(id));
    updateBadges(now);
    if (hlGroup.children.length) hlMat.opacity = 0.6 + 0.2 * Math.sin(now / 220);
    groupSlots();
    let busy = now < holdUntil;
    for (const tk of tokens.values()) {
      if (!tk.hop && tk.queue.length && now >= holdUntil && now >= (tk.nextAt || 0)) {
        const q = tk.queue.shift();
        const speed = Math.min(4, 1 + tk.queue.length / 6); // antrean panjang = jalan lebih cepat
        tk.hop = { to: q.to, jump: !!q.jump, jailed: q.jailed, t0: now, dur: (q.warp != null ? 1300 : q.jump ? 750 : STEP_MS - 20) / speed, from: tk.pos.clone() };
        if (q.warp != null) { holes.suck(tilePoint(q.warp, 0, 0)); shakeMs = 500; shakeUntil = now + 500; }
        tk.nextAt = now + (q.jump ? 800 : STEP_MS) / speed;
        groupSlots();
      }
      const target = slotPos(tk.hop ? tk.hop.to : tk.disp, tk.slot || 0, tk.slotN || 1, tk.hop ? !!tk.hop.jailed : tk.dispJailed);
      let y = 0;
      if (tk.hop) {
        busy = true;
        const t = Math.min(1, (now - tk.hop.t0) / tk.hop.dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        tk.pos.lerpVectors(tk.hop.from, target, e);
        y = Math.sin(Math.PI * t) * (tk.hop.jump ? 1.6 : 0.36);
        if (t >= 1) {
          tk.disp = tk.hop.to; tk.dispJailed = !!tk.hop.jailed; tk.hop = null;
          onStep && onStep(tk.queue.length === 0);
        }
      } else {
        if (tk.queue.length) busy = true;
        tk.pos.lerp(target, 1 - Math.exp(-dt * 10));
      }
      tk.obj.position.set(tk.pos.x, tk.pos.y + y, tk.pos.z);
      const sc = tokenScale(tk.slotN || 1);
      tk.obj.scale.setScalar(tk.obj.scale.x + (sc - tk.obj.scale.x) * Math.min(1, dt * 8));
      // selalu menghadap kamera supaya wajah terlihat
      tk.obj.rotation.y = Math.atan2(camera.position.x - tk.pos.x, camera.position.z - tk.pos.z);
    }
    // Penanda giliran
    const c = S && S.phase === 'playing' ? S.players[S.turn] : null;
    const ctk = c && tokens.get(c.id);
    const mtk = me && S && S.players.some(p => p.id === me && !p.bankrupt) && tokens.get(me);
    meTag.visible = !!mtk;
    if (mtk) meTag.position.set(mtk.obj.position.x, mtk.obj.position.y + 2.95 + Math.sin(now / 280) * 0.08, mtk.obj.position.z);
    ring.visible = gem.visible = !!ctk;
    if (ctk) {
      ring.position.set(ctk.obj.position.x, BOARD_Y + 0.012, ctk.obj.position.z);
      ring.material.color.set(colorOf(c.id) || '#fff');
      ring.scale.setScalar(1 + Math.sin(now / 260) * 0.12);
      gem.position.set(ctk.obj.position.x, ctk.obj.position.y + 1.62 + Math.sin(now / 300) * 0.06, ctk.obj.position.z);
      gem.rotation.y = now / 500;
      ctk.obj.userData.body.position.y = ctk.hop ? 0 : Math.abs(Math.sin(now / 420)) * 0.08;
      if (followOn) {
        tmp.set(ctk.obj.position.x * 0.75, 0, ctk.obj.position.z * 0.75 + 0.6);
        const delta = tmp.sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 2.5));
        controls.target.add(delta); camera.position.add(delta);
      }
    }
    // Dadu
    dice.forEach(d => {
      if (d.t0 < 0) return;
      const t = Math.min(1, Math.max(0, (now - d.t0) / DICE_MS));
      busy = true;
      const e = 1 - Math.pow(1 - t, 3);
      d.mesh.position.lerpVectors(d.from, d.to, e);
      d.mesh.position.y = d.to.y + Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) * 1.6 + (1 - e) * 0.6;
      const spin = new THREE.Quaternion().setFromAxisAngle(d.axis, (1 - e) * Math.PI * 6);
      d.mesh.quaternion.copy(spin.multiply(d.q));
      if (t >= 1) { d.t0 = -1; d.mesh.position.copy(d.to); d.mesh.quaternion.copy(d.q); }
    });
    // Kartu terangkat
    for (const dk of Object.values(decks)) {
      if (dk.t0 < 0) continue;
      const t = (now - dk.t0) / 1800;
      if (t >= 1) { dk.fly.visible = false; dk.t0 = -1; continue; }
      dk.fly.visible = true;
      const up = Math.min(1, t / 0.35);
      const base = dk.group.position;
      dk.fly.position.set(base.x * (1 - up * 0.4), BOARD_Y + 0.3 + Math.sin(up * Math.PI / 2) * 2.2, base.z * (1 - up * 0.4));
      dk.fly.lookAt(camera.position);
      dk.fly.rotateY(Math.PI * (1 - up));
      dk.fly.material.opacity = t > 0.8 ? (1 - t) / 0.2 : 1;
    }
    controls.update();
    // guncangan kamera (kartu ultra rare), makin lama makin reda
    const sk = Math.max(0, (shakeUntil - now) / shakeMs);
    shakeOff.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(sk * 0.6);
    camera.position.add(shakeOff);
    renderer.render(scene, camera);
    camera.position.sub(shakeOff);
    if (idleCbs.length && (!busy || now - idleCbs[0].at > IDLE_MAX_WAIT)) { const cbs = idleCbs; idleCbs = []; cbs.forEach(c => c.fn()); }
  }
  renderer.setAnimationLoop(frameLoop);

  return {
    setBoard(board, gc) {
      BOARD = board; GC = gc; lastBuildSig = '';
      if (board.length && board.length !== NT) {
        layoutBoard(board.length);
        for (const tk of tokens.values()) { tk.queue = []; tk.hop = null; tk.disp = tk.server = Math.min(tk.server, NT - 1); tk.pos.copy(tilePoint(tk.disp, 0, 0)); }
      }
    },
    update(state, myId, colorFn) {
      S = state; me = myId; colorOf = colorFn;
      if (!BOARD.length) return;
      rebuildProps();
      syncHoles();
      const rolled = lastDiceSeq !== null && state.diceSeq !== lastDiceSeq;
      lastDiceSeq = state.diceSeq;
      syncTokens(rolled);
    },
    redraw() { lastBuildSig = ''; if (S) rebuildProps(); },
    rollDice(vals) { setDice(vals, true); holdUntil = performance.now() + DICE_MS + 150; },
    setDiceStatic(vals) { setDice(vals, false); },
    flipCard(deck) { if (decks[deck]) decks[deck].t0 = performance.now(); },
    whenIdle(fn) { idleCbs.push({ fn, at: performance.now() }); },
    shake(ms) { shakeMs = ms; shakeUntil = performance.now() + ms; },
    setFollow(v) { followOn = v; },
    badge: addBadge,
    tileEffect(i, kind) {
      if (!FRAMES[i]) return;
      tileFx.play(tilePoint(i, 0, 0), kind);
      if (kind === 'disaster') { shakeMs = 600; shakeUntil = performance.now() + 600; }
    },
    highlight,
    reach,
    resetCamera,
    topView() { camera.position.set(0, 24, 0.01); controls.target.set(0, 0, 0); controls.update(); },
    dispose() { renderer.setAnimationLoop(null); renderer.dispose(); }
  };
}

/* ---------- Ornamen Indonesia di sekitar papan (dekorasi) ---------- */
function buildOrnaments() {
  const root = new THREE.Group();
  const m = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  const add = (parent, geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const white = m('#f4f1e8'), gold = m('#e2b33c', { metalness: 0.8, roughness: 0.25, emissive: '#4a3600' });

  // Monas
  const monas = new THREE.Group(); monas.position.set(-7.4, 0, -8.6);
  add(monas, new THREE.BoxGeometry(2.2, 0.35, 2.2), m('#cfc8b8'), 0, 0.17, 0);
  add(monas, new THREE.CylinderGeometry(0.75, 0.55, 0.35, 4), white, 0, 0.52, 0).rotation.y = Math.PI / 4;
  add(monas, new THREE.CylinderGeometry(0.12, 0.28, 3.4, 8), white, 0, 2.4, 0);
  add(monas, new THREE.CylinderGeometry(0.3, 0.16, 0.18, 10), white, 0, 4.15, 0);
  add(monas, new THREE.ConeGeometry(0.2, 0.55, 10), gold, 0, 4.5, 0);
  root.add(monas);

  // Rumah Gadang (atap gonjong)
  const rg = new THREE.Group(); rg.position.set(6.8, 0, -8.8);
  const wood = m('#7a4a22'), ijuk = m('#2a2420', { roughness: 0.95 });
  add(rg, new THREE.BoxGeometry(2.6, 0.9, 1.2), wood, 0, 0.75, 0);
  for (let k = 0; k < 6; k++) add(rg, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), wood, -1.1 + k * 0.44, 0.15, 0.5);
  add(rg, new THREE.CylinderGeometry(0.75, 0.75, 2.9, 3), ijuk, 0, 1.55, 0).rotation.z = Math.PI / 2;
  for (const [x, h, tilt] of [[-1.35, 1.0, 0.55], [-0.6, 0.8, 0.25], [0.6, 0.8, -0.25], [1.35, 1.0, -0.55]]) {
    add(rg, new THREE.ConeGeometry(0.16, h, 8), ijuk, x, 1.95 + h / 2, 0).rotation.z = tilt;
  }
  root.add(rg);

  // Candi bentar (gapura terbelah)
  const gate = new THREE.Group(); gate.position.set(0, 0, -9.6);
  const brick = m('#9c5a34');
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const w = 1.1 - k * 0.18;
    add(gate, new THREE.BoxGeometry(w, 0.55, 0.9 - k * 0.12), brick, side * (0.3 + 1.1 / 2), 0.28 + k * 0.55, 0);
  }
  root.add(gate);

  // Gunungan wayang di kiri & kanan papan
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, 0); shape.lineTo(0.9, 0); shape.quadraticCurveTo(0.95, 1.2, 0.35, 2.1); shape.quadraticCurveTo(0.1, 2.6, 0, 3.0);
  shape.quadraticCurveTo(-0.1, 2.6, -0.35, 2.1); shape.quadraticCurveTo(-0.95, 1.2, -0.9, 0);
  const gunG = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  for (const [x, ry] of [[-9.4, Math.PI / 2], [9.4, -Math.PI / 2]]) {
    const gg = new THREE.Group(); gg.position.set(x, 0, -1.5); gg.rotation.y = ry;
    add(gg, gunG, m('#a4572a', { roughness: 0.6 }), 0, 0.25, 0);
    add(gg, gunG, gold, 0, 0.55, 0.01).scale.set(0.7, 0.7, 1.4);
    add(gg, new THREE.BoxGeometry(0.4, 0.25, 0.4), m('#5a3a1e'), 0, 0.12, 0.04);
    root.add(gg);
  }

  // Pohon kelapa
  const trunkM = m('#8a6a3a'), leafM = m('#2f8f3a'), nutM = m('#6b4a22');
  for (const [x, z, lean] of [[-9.0, 6.8, 0.25], [9.0, 6.8, -0.25], [-9.6, 2.6, 0.15], [9.6, 2.6, -0.15], [-4.2, -9.6, 0.2], [4.0, -9.8, -0.2]]) {
    const tree = new THREE.Group(); tree.position.set(x, 0, z); tree.rotation.z = lean;
    for (let k = 0; k < 5; k++) add(tree, new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8), trunkM, Math.sin(k * 0.35) * 0.15, 0.27 + k * 0.52, 0);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2;
      add(tree, new THREE.ConeGeometry(0.12, 1.4, 4), leafM, Math.cos(a) * 0.5, 2.75, Math.sin(a) * 0.5).rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3);
    }
    for (let k = 0; k < 3; k++) add(tree, new THREE.SphereGeometry(0.12, 8, 6), nutM, Math.cos(k * 2) * 0.15, 2.55, Math.sin(k * 2) * 0.15);
    root.add(tree);
  }
  return root;
}
