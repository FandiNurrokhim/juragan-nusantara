// Model 3D bangunan mode Normal: Desa, Kota, Kabupaten (sama untuk semua kota) dan Landmark khas tiap kota.
// Semua model menghadap +z (ke luar papan), alas sekitar 0,6 x 0,5, dan dibuat sekali lalu di-clone.
import * as THREE from 'three';

const mats = new Map();
const M = (color, o = {}) => {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));
  return mats.get(key);
};
const GOLD = { metalness: 0.8, roughness: 0.25, emissive: '#4a3600' };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);
const sph = (r, ws = 12, hs = 8, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);
const HALF = [0, Math.PI * 2, 0, Math.PI / 2]; // setengah bola (kubah)
// Tambah mesh ke grup; y = posisi dasar benda (bukan tengahnya) untuk box/silinder/kerucut.
function put(g, geo, mat, x, y, z, rot) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? M(mat) : mat);
  geo.computeBoundingBox();
  m.position.set(x, y - geo.boundingBox.min.y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
const waterM = M('#3f8fd0', { roughness: 0.25, metalness: 0.1 }); waterM.userData.keep = true; // air tidak ikut diwarnai
const water = (g, w = 0.62, d = 0.5) => put(g, box(w, 0.012, d), waterM, 0, 0, 0);
const plaza = (g, w = 0.5, d = 0.44, c = '#cfc8b8') => put(g, box(w, 0.03, d), c, 0, 0, 0);
// Atap pelana (prisma segitiga) memanjang di sumbu x.
function gable(g, w, h, d, mat, x, y, z) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2); geo.rotateY(Math.PI / 2);
  return put(g, geo, mat, x, y, z);
}
// Sama seperti put, tapi (x, y, z) adalah titik tengah benda.
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const pyramid = (g, w, h, d, mat, x, y, z) => { const r = put(g, cone(Math.SQRT1_2, h, 4), mat, x, y, z, [0, Math.PI / 4, 0]); r.scale.set(w, 1, d); return r; };

/* ---------------- Tingkat bangunan (sama untuk semua kota) ---------------- */
function desa() {
  const g = new THREE.Group();
  put(g, box(0.56, 0.015, 0.42), '#8fbf5a', 0, 0, 0); // halaman rumput
  const house = (x, z, s) => {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, cyl(0.012, 0.012, 0.06 * s, 6), '#6b4423', x + dx * 0.07 * s, 0.015, z + dz * 0.05 * s);
    put(g, box(0.17 * s, 0.09 * s, 0.13 * s), '#c58a4a', x, 0.015 + 0.06 * s, z);
    put(g, box(0.04 * s, 0.06 * s, 0.005), '#5a3418', x, 0.015 + 0.06 * s, z + 0.066 * s); // pintu
    gable(g, 0.21 * s, 0.09 * s, 0.17 * s, M('#7a3b1e', { roughness: 0.9 }), x, 0.015 + 0.15 * s, z);
  };
  house(-0.12, 0.02, 1); house(0.13, -0.08, 0.85);
  put(g, cyl(0.014, 0.018, 0.12, 6), '#7a5a32', 0.17, 0.015, 0.11);
  put(g, sph(0.06), '#3e8e3a', 0.17, 0.12, 0.11);
  for (let k = 0; k < 5; k++) put(g, box(0.008, 0.035, 0.008), '#e9dcc0', -0.25 + k * 0.05, 0.015, 0.19); // pagar bambu
  return g;
}
function kota() {
  const g = new THREE.Group();
  put(g, box(0.58, 0.02, 0.44), '#9a968a', 0, 0, 0); // aspal
  const ruko = [[-0.19, 0.17, 0.24, '#e8c26a'], [0, 0.18, 0.32, '#e0816a'], [0.19, 0.17, 0.22, '#7fb3d5']];
  for (const [x, w, h, c] of ruko) {
    put(g, box(w, h, 0.26), c, x, 0.02, -0.04);
    put(g, box(w + 0.01, 0.02, 0.27), '#5b5b63', x, 0.02 + h, -0.04); // atap datar
    for (let r = 1; r * 0.085 < h - 0.04; r++) put(g, box(w * 0.75, 0.035, 0.005), '#2c3e50', x, 0.02 + r * 0.085, 0.092); // jendela
    put(g, box(w * 0.95, 0.008, 0.07), '#c0392b', x, 0.075, 0.12); // kanopi
  }
  put(g, cyl(0.006, 0.006, 0.18, 6), '#333', 0.27, 0.02, 0.17); // tiang lampu
  put(g, sph(0.018), M('#ffe08a', { emissive: '#7a5a00' }), 0.27, 0.2, 0.17);
  return g;
}
function kabupaten() {
  const g = new THREE.Group();
  plaza(g, 0.6, 0.48);
  put(g, box(0.16, 0.42, 0.12), M('#7fb3d5', { roughness: 0.2, metalness: 0.3 }), -0.17, 0.03, -0.14); // menara kantor
  for (let r = 1; r < 8; r++) put(g, box(0.165, 0.006, 0.125), '#d8e6ef', -0.17, 0.03 + r * 0.052, -0.14);
  put(g, box(0.42, 0.13, 0.2), '#f4f1e8', 0.04, 0.03, 0.0); // kantor bupati
  pyramid(g, 0.46, 0.1, 0.24, M('#b5432a'), 0.04, 0.16, 0.0);
  for (let k = 0; k < 4; k++) put(g, cyl(0.012, 0.012, 0.12, 8), '#ffffff', -0.05 + k * 0.06, 0.03, 0.13); // pilar
  put(g, box(0.24, 0.02, 0.07), '#f4f1e8', 0.04, 0.15, 0.12);
  put(g, box(0.12, 0.05, 0.005), '#2c3e50', 0.04, 0.05, 0.101);
  put(g, cyl(0.005, 0.005, 0.32, 6), '#d0d0d0', 0.25, 0.03, 0.17); // tiang bendera
  put(g, box(0.07, 0.022, 0.003), '#d9412f', 0.285, 0.31, 0.17);
  put(g, box(0.07, 0.022, 0.003), '#ffffff', 0.285, 0.288, 0.17);
  return g;
}

/* ---------------- Landmark khas tiap kota ---------------- */
const LANDMARKS = {
  // Monas
  Jakarta: g => {
    plaza(g, 0.5, 0.44);
    put(g, cyl(0.18, 0.12, 0.08, 4), '#f4f1e8', 0, 0.03, 0, [0, Math.PI / 4, 0]);
    put(g, cyl(0.035, 0.07, 0.6, 10), '#f4f1e8', 0, 0.11, 0);
    put(g, cyl(0.07, 0.04, 0.04, 12), '#f4f1e8', 0, 0.71, 0);
    put(g, cone(0.05, 0.13, 10), M('#e2b33c', GOLD), 0, 0.75, 0);
  },
  // Tugu Jogja: tiang putih bergaris, puncak emas spiral
  Yogyakarta: g => {
    plaza(g, 0.44, 0.44, '#bdb6a5');
    put(g, box(0.2, 0.06, 0.2), '#f4f1e8', 0, 0.03, 0);
    put(g, box(0.15, 0.06, 0.15), '#e9e4d6', 0, 0.09, 0);
    put(g, cyl(0.045, 0.06, 0.34, 4), '#f4f1e8', 0, 0.15, 0, [0, Math.PI / 4, 0]);
    for (let k = 0; k < 3; k++) put(g, cyl(0.064 - k * 0.006, 0.064 - k * 0.006, 0.015, 4), '#2f6b3a', 0, 0.2 + k * 0.1, 0, [0, Math.PI / 4, 0]);
    put(g, sph(0.05), M('#e2b33c', GOLD), 0, 0.5, 0);
    put(g, cone(0.035, 0.18, 8), M('#e2b33c', GOLD), 0, 0.57, 0);
  },
  // Gedung Sate
  Bandung: g => {
    plaza(g, 0.62, 0.42);
    put(g, box(0.58, 0.12, 0.18), '#f4f1e8', 0, 0.03, 0);
    for (let k = 0; k < 7; k++) put(g, box(0.05, 0.05, 0.005), '#3b4a5a', -0.24 + k * 0.08, 0.07, 0.091);
    gable(g, 0.6, 0.06, 0.2, M('#4b4b52'), 0, 0.15, 0);
    put(g, box(0.16, 0.08, 0.16), '#f4f1e8', 0, 0.15, 0);
    pyramid(g, 0.2, 0.08, 0.2, M('#4b4b52'), 0, 0.23, 0);
    pyramid(g, 0.13, 0.06, 0.13, M('#4b4b52'), 0, 0.3, 0);
    put(g, cyl(0.006, 0.006, 0.26, 6), '#9c9c9c', 0, 0.34, 0);
    for (let k = 0; k < 6; k++) put(g, sph(0.016, 8, 6), M('#e2b33c', GOLD), 0, 0.37 + k * 0.035, 0); // "tusuk sate"
  },
  // Lawang Sewu: gedung kolonial memanjang dengan dua menara kembar
  Semarang: g => {
    plaza(g, 0.62, 0.46);
    put(g, box(0.56, 0.18, 0.14), '#f1e6cf', 0, 0.03, -0.04);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) put(g, box(0.03, 0.05, 0.005), '#3a2a1c', -0.24 + k * 0.06, 0.06 + r * 0.08, 0.031);
    gable(g, 0.58, 0.07, 0.16, M('#a33a2a'), 0, 0.21, -0.04);
    for (const x of [-0.07, 0.07]) {
      put(g, box(0.1, 0.32, 0.1), '#f1e6cf', x, 0.03, 0.09);
      put(g, sph(0.055, 12, 8), M('#5b4636'), x, 0.36, 0.09).scale.set(1, 1.1, 1);
      put(g, cyl(0.004, 0.004, 0.06, 6), '#333', x, 0.4, 0.09);
    }
  },
  // Istana Maimun: istana kuning dengan kubah hijau
  Medan: g => {
    plaza(g, 0.62, 0.44);
    put(g, box(0.58, 0.12, 0.2), '#f2c94c', 0, 0.03, 0);
    for (let k = 0; k < 6; k++) put(g, box(0.04, 0.06, 0.005), '#7a1f1f', -0.23 + k * 0.092, 0.06, 0.101);
    put(g, box(0.18, 0.2, 0.22), '#f2c94c', 0, 0.03, 0.01);
    put(g, sph(0.09, 16, 10), M('#1e7a4b'), 0, 0.23, 0.01).scale.set(1, 1.25, 1);
    put(g, cone(0.02, 0.07, 8), M('#e2b33c', GOLD), 0, 0.42, 0.01);
    for (const x of [-0.24, 0.24]) put(g, sph(0.05, 12, 8), M('#1e7a4b'), x, 0.14, 0);
  },
  // Jam Gadang: menara jam beratap gonjong
  Padang: g => {
    plaza(g, 0.44, 0.44, '#a9c98a');
    put(g, box(0.17, 0.08, 0.17), '#e9dcc0', 0, 0.03, 0);
    put(g, box(0.12, 0.44, 0.12), '#f1e6cf', 0, 0.11, 0);
    for (const [x, z, ry] of [[0, 0.061, 0], [0, -0.061, Math.PI], [0.061, 0, Math.PI / 2], [-0.061, 0, -Math.PI / 2]]) {
      put(g, cyl(0.04, 0.04, 0.008, 16), '#ffffff', x, 0.43, z, [Math.PI / 2, 0, ry]);
    }
    put(g, box(0.15, 0.04, 0.15), '#3a2a22', 0, 0.55, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, cone(0.03, 0.16, 6), '#3a2a22', dx * 0.06, 0.57, dz * 0.06, [dz * 0.6, 0, -dx * 0.6]);
    put(g, cone(0.05, 0.12, 4), '#3a2a22', 0, 0.59, 0);
  },
  // Jembatan Ampera: jembatan merah dengan dua menara angkat
  Palembang: g => {
    water(g);
    put(g, box(0.62, 0.035, 0.12), '#c0392b', 0, 0.09, 0);
    for (const x of [-0.17, 0.17]) {
      put(g, box(0.035, 0.09, 0.1), '#8c8c8c', x, 0.012, 0);
      for (const z of [-0.05, 0.05]) put(g, box(0.035, 0.42, 0.025), '#c0392b', x, 0.12, z);
      put(g, box(0.05, 0.035, 0.13), '#c0392b', x, 0.54, 0);
    }
    for (const z of [-0.05, 0.05]) put(g, box(0.38, 0.03, 0.02), '#c0392b', 0, 0.48, z);
  },
  // Islamic Center Samarinda: kubah besar & empat menara
  Samarinda: g => {
    plaza(g, 0.56, 0.46);
    put(g, box(0.3, 0.12, 0.26), '#f4f1e8', 0, 0.03, 0);
    put(g, sph(0.12, 16, 10, ...HALF), M('#c9a227', GOLD), 0, 0.15, 0).scale.set(1, 0.9, 1);
    put(g, cone(0.015, 0.06, 6), M('#c9a227', GOLD), 0, 0.37, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      put(g, cyl(0.022, 0.026, 0.4, 8), '#f4f1e8', dx * 0.22, 0.03, dz * 0.18);
      put(g, cone(0.03, 0.08, 8), '#2e8b57', dx * 0.22, 0.43, dz * 0.18);
    }
  },
  // Menara Islamic Center NTB (Mataram): satu menara tinggi segi delapan
  Mataram: g => {
    plaza(g, 0.42, 0.42, '#bdb6a5');
    put(g, box(0.26, 0.07, 0.2), '#f4f1e8', 0, 0.03, -0.04);
    put(g, cyl(0.05, 0.065, 0.66, 8), '#e8f1ea', 0.08, 0.03, 0.06);
    for (let k = 1; k <= 3; k++) put(g, cyl(0.075, 0.075, 0.018, 8), '#1f7a5a', 0.08, 0.03 + k * 0.17, 0.06);
    put(g, sph(0.05, 12, 8), '#1f7a5a', 0.08, 0.69, 0.06);
    put(g, cone(0.012, 0.07, 6), M('#e2b33c', GOLD), 0.08, 0.78, 0.06);
  },
  // Tugu Khatulistiwa: empat tiang kayu ulin menyangga bola dunia & panah
  Pontianak: g => {
    plaza(g, 0.42, 0.42, '#bdb6a5');
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, box(0.035, 0.32, 0.035), '#4a2f1d', dx * 0.06, 0.03, dz * 0.06);
    put(g, box(0.17, 0.02, 0.17), '#4a2f1d', 0, 0.35, 0);
    const globe = new THREE.Group(); globe.position.set(0, 0.47, 0); g.add(globe);
    at(put(globe, new THREE.TorusGeometry(0.1, 0.01, 8, 24), M('#e2b33c', GOLD), 0, 0, 0), 0, 0, 0);
    at(put(globe, new THREE.TorusGeometry(0.1, 0.01, 8, 24), M('#e2b33c', GOLD), 0, 0, 0, [Math.PI / 2, 0, 0]), 0, 0, 0);
    at(put(globe, box(0.26, 0.012, 0.012), M('#e2b33c', GOLD), 0, 0, 0), 0, 0, 0);
    at(put(globe, cone(0.025, 0.05, 6), M('#e2b33c', GOLD), 0, 0, 0, [0, 0, -Math.PI / 2]), 0.15, 0, 0);
  },
  // Pasar terapung: jukung penuh buah di atas sungai
  Banjarmasin: g => {
    water(g);
    const boat = (x, z, ry, fruit) => {
      const b = new THREE.Group(); b.position.set(x, 0.012, z); b.rotation.y = ry; g.add(b);
      put(b, box(0.26, 0.035, 0.07), '#6b4423', 0, 0, 0);
      for (const s of [-1, 1]) at(put(b, cone(0.035, 0.07, 4), '#6b4423', 0, 0, 0, [0, 0, -s * Math.PI / 2]), s * 0.16, 0.0175, 0);
      fruit.forEach((c, k) => put(b, sph(0.022, 8, 6), c, -0.08 + k * 0.035, 0.035, (k % 2 ? 0.012 : -0.012)));
      put(b, cyl(0.02, 0.025, 0.06, 8), '#2f6fd0', 0.09, 0.035, 0);
      put(b, cone(0.07, 0.035, 16), '#e2c27a', 0.09, 0.1, 0); // tanggui
    };
    boat(-0.05, -0.1, 0.15, ['#f39c12', '#27ae60', '#e74c3c', '#f1c40f', '#8e44ad']);
    boat(0.06, 0.11, -0.2, ['#e67e22', '#2ecc71', '#f1c40f', '#c0392b']);
  },
  // Patung Yesus Memberkati di atas bukit
  Manado: g => {
    put(g, sph(0.24, 16, 8, ...HALF), '#5e9c48', 0, 0, 0).scale.set(1.2, 0.55, 1);
    put(g, box(0.07, 0.06, 0.07), '#bdb6a5', 0, 0.12, 0);
    put(g, cone(0.05, 0.3, 10), '#f4f1e8', 0, 0.18, 0);
    put(g, sph(0.03), '#f4f1e8', 0, 0.48, 0);
    for (const s of [-1, 1]) put(g, box(0.12, 0.022, 0.025), '#f4f1e8', s * 0.065, 0.41, 0, [0, 0, s * 0.35]);
  },
  // Kapal Pinisi
  Makassar: g => {
    water(g);
    put(g, box(0.36, 0.06, 0.1), '#7a4a22', 0, 0.012, 0);
    put(g, cone(0.05, 0.1, 4), '#7a4a22', 0.22, 0.012, 0, [0, Math.PI / 4, -Math.PI / 2]).scale.set(1.2, 1, 0.7);
    put(g, box(0.36, 0.012, 0.11), '#e9dcc0', 0, 0.072, 0);
    for (const [x, h] of [[-0.08, 0.42], [0.08, 0.36]]) {
      put(g, cyl(0.006, 0.008, h, 6), '#3a2a1c', x, 0.08, 0);
      for (let k = 0; k < 2; k++) put(g, box(0.1 - k * 0.02, 0.1, 0.004), '#fbfaf5', x + 0.05, 0.13 + k * 0.13, 0.01);
    }
    put(g, box(0.12, 0.08, 0.004), '#fbfaf5', 0.21, 0.12, 0.01, [0, 0, 0.5]);
  },
  // Kilang minyak Balikpapan: tangki, menara, dan api suar
  Balikpapan: g => {
    plaza(g, 0.6, 0.46, '#9a968a');
    for (const [x, z] of [[-0.17, 0.08], [-0.17, -0.12], [0.02, 0.12]]) {
      put(g, cyl(0.08, 0.08, 0.12, 16), '#ecf0f1', x, 0.03, z);
      put(g, sph(0.08, 16, 6, ...HALF), '#d0d6d9', x, 0.15, z).scale.set(1, 0.25, 1);
    }
    put(g, cyl(0.025, 0.04, 0.52, 8), '#d9412f', 0.18, 0.03, -0.08);
    for (let k = 1; k < 5; k++) put(g, cyl(0.04, 0.04, 0.03, 8), '#ffffff', 0.18, 0.03 + k * 0.1, -0.08);
    put(g, cone(0.035, 0.1, 8), M('#ff7a1a', { emissive: '#ff4500', emissiveIntensity: 0.8 }), 0.18, 0.55, -0.08);
    put(g, box(0.3, 0.015, 0.015), '#7f8c8d', 0.02, 0.06, -0.02);
  },
  // Garuda Wisnu Kencana
  Denpasar: g => {
    plaza(g, 0.5, 0.44, '#b8a98c');
    put(g, box(0.24, 0.06, 0.2), '#9c8a6a', 0, 0.03, 0);
    put(g, box(0.18, 0.06, 0.15), '#8b7a5c', 0, 0.09, 0);
    const bronze = M('#4e9a86', { metalness: 0.5, roughness: 0.4 });
    put(g, sph(0.06, 12, 8), bronze, 0, 0.15, 0.02).scale.set(1, 0.8, 1.5); // garuda
    for (const s of [-1, 1]) put(g, box(0.2, 0.012, 0.08), bronze, s * 0.11, 0.2, -0.02, [0, 0, s * 0.5]);
    put(g, cone(0.05, 0.22, 10), M('#c9a227', GOLD), 0, 0.2, 0); // wisnu
    put(g, sph(0.03), M('#c9a227', GOLD), 0, 0.44, 0);
    put(g, cone(0.02, 0.06, 8), M('#c9a227', GOLD), 0, 0.47, 0);
  },
  // Monumen Sasando
  Kupang: g => {
    plaza(g, 0.44, 0.42, '#bdb6a5');
    const leaf = put(g, new THREE.CircleGeometry(0.22, 24, 0, Math.PI), M('#d7a94b', { side: THREE.DoubleSide }), 0, 0.04, -0.02);
    leaf.position.y = 0.06;
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (k + 0.5) / 9;
      at(put(g, box(0.004, 0.2, 0.004), '#8a5a1e', 0, 0, 0, [0, 0, a - Math.PI / 2]), Math.cos(a) * 0.1, 0.06 + Math.sin(a) * 0.1, -0.015);
    }
    put(g, cyl(0.04, 0.04, 0.32, 12), '#c2a46b', 0, 0.03, 0.03);
    for (let k = 0; k < 6; k++) put(g, cyl(0.0025, 0.0025, 0.3, 4), '#f5f5f5', Math.cos(k) * 0.041, 0.04, 0.03 + Math.sin(k) * 0.041);
  },
  // Gong Perdamaian Dunia
  Ambon: g => {
    plaza(g, 0.5, 0.4, '#bdb6a5');
    put(g, box(0.4, 0.05, 0.14), '#8c8c8c', 0, 0.03, 0);
    for (const x of [-0.17, 0.17]) put(g, box(0.035, 0.4, 0.035), '#7a1f1f', x, 0.08, 0);
    put(g, box(0.42, 0.035, 0.05), '#7a1f1f', 0, 0.48, 0);
    at(put(g, cyl(0.15, 0.15, 0.03, 32), M('#d4a017', GOLD), 0, 0, 0, [Math.PI / 2, 0, 0]), 0, 0.29, 0);
    put(g, sph(0.04, 12, 8), M('#b8860b', GOLD), 0, 0.25, 0.02);
    for (const x of [-0.06, 0.06]) put(g, cyl(0.003, 0.003, 0.06, 4), '#333', x, 0.43, 0);
  },
  // Jembatan Kuning (Ponulele) Palu: busur kuning di atas teluk
  Palu: g => {
    water(g);
    put(g, box(0.62, 0.03, 0.1), '#d9d2c0', 0, 0.06, 0);
    for (const z of [-0.045, 0.045]) {
      put(g, new THREE.TorusGeometry(0.26, 0.014, 8, 32, Math.PI), '#f2c200', 0, 0.065, z);
      for (let k = 1; k < 8; k++) { const x = -0.26 + k * 0.065, h = Math.sqrt(Math.max(0, 0.26 * 0.26 - x * x)); put(g, cyl(0.003, 0.003, h, 4), '#f2c200', x, 0.08, z); }
    }
    for (const x of [-0.28, 0.28]) put(g, box(0.05, 0.06, 0.1), '#8c8c8c', x, 0.0, 0);
  },
  // Tugu Persatuan (MTQ) Kendari: menara ramping bermahkota kelopak
  Kendari: g => {
    plaza(g, 0.44, 0.44, '#bdb6a5');
    put(g, cyl(0.12, 0.14, 0.05, 8), '#e9e4d6', 0, 0.03, 0);
    put(g, cyl(0.025, 0.06, 0.52, 8), '#f4f1e8', 0, 0.08, 0);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      put(g, cone(0.025, 0.12, 6), M('#e2b33c', GOLD), Math.cos(a) * 0.05, 0.56, Math.sin(a) * 0.05, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
    }
    put(g, cone(0.02, 0.16, 8), M('#e2b33c', GOLD), 0, 0.6, 0);
  },
  // Kota papan mode WNI (cadangan kalau dipakai): Tugu Pahlawan, Bambu Runcing, Tugu Malang, Masjid Agung Pekanbaru
  Surabaya: g => {
    plaza(g, 0.44, 0.44, '#bdb6a5');
    put(g, cyl(0.07, 0.025, 0.5, 10), '#f4f1e8', 0, 0.03, 0);
    for (let k = 0; k < 4; k++) put(g, cyl(0.06 - k * 0.01, 0.06 - k * 0.01, 0.008, 10), '#2c3e50', 0, 0.1 + k * 0.1, 0);
    put(g, cone(0.025, 0.06, 10), '#f4f1e8', 0, 0.53, 0, [Math.PI, 0, 0]);
  },
  Malang: g => {
    plaza(g, 0.44, 0.44, '#a9c98a');
    put(g, cyl(0.16, 0.16, 0.03, 24), '#3f8fd0', 0, 0.03, 0);
    put(g, cyl(0.025, 0.04, 0.42, 8), '#f4f1e8', 0, 0.06, 0);
    put(g, new THREE.TorusGeometry(0.06, 0.008, 6, 20), '#e2b33c', 0, 0.42, 0);
  },
  Pekanbaru: g => {
    plaza(g, 0.56, 0.46);
    put(g, box(0.3, 0.12, 0.26), '#f4f1e8', 0, 0.03, 0);
    put(g, sph(0.1, 16, 10), '#2e7d32', 0, 0.15, 0).scale.set(1, 1.1, 1);
    put(g, cyl(0.03, 0.035, 0.5, 8), '#f4f1e8', 0.22, 0.03, -0.12);
    put(g, sph(0.04), '#2e7d32', 0.22, 0.55, -0.12);
  }
};

const cache = new Map();
function cached(key, build) {
  if (!cache.has(key)) { const g = new THREE.Group(); build(g); cache.set(key, g); }
  return cache.get(key).clone();
}
// level 1 = Desa, 2 = Kota, 3 = Kabupaten
export function levelModel(level) {
  return cached('lv' + level, g => g.add([desa, desa, kota, kabupaten][level]()));
}
// Kota tanpa landmark khusus: tugu emas sederhana
export function landmarkModel(cityName) {
  return cached('lm:' + cityName, LANDMARKS[cityName] || (g => {
    plaza(g, 0.44, 0.44);
    put(g, cyl(0.04, 0.07, 0.5, 8), '#f4f1e8', 0, 0.03, 0);
    put(g, sph(0.06), M('#e2b33c', GOLD), 0, 0.56, 0);
  }));
}
export const LANDMARK_CITIES = Object.keys(LANDMARKS);

// Warnai bangunan dengan warna pemiliknya. Terang-gelap tiap bagian dipertahankan supaya detailnya tetap terbaca;
// ornamen emas, lampu yang menyala, dan air tidak diubah.
const tints = new Map();
export function tint(obj, hex) {
  const pc = new THREE.Color(hex), ph = {}; pc.getHSL(ph);
  obj.traverse(o => {
    const m = o.isMesh && o.material;
    if (!m || !m.color || m.userData.keep || m.metalness > 0.5 || (m.emissive && m.emissive.getHex() && m.emissiveIntensity > 0.3)) return;
    const key = m.uuid + hex;
    if (!tints.has(key)) {
      const t = m.clone(), h = {}; m.color.getHSL(h);
      t.color.setHSL(ph.h, Math.min(1, ph.s * 0.9 + 0.08), Math.min(0.85, 0.2 + h.l * 0.55 + ph.l * 0.15));
      tints.set(key, t);
    }
    o.material = tints.get(key);
  });
  return obj;
}
