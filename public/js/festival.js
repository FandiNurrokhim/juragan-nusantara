// Dekorasi petak Festival: aurora yang berpendar, umbul-umbul, lampu bohlam berkedip, percikan cahaya,
// dan papan pengali sewa. Dibuat sekali lalu dipindah ke petak festival yang sedang aktif.
import * as THREE from 'three';

const AURORA_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const AURORA_FS = `
uniform float uTime; uniform float uSeed; varying vec2 vUv;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float x = vUv.x * 6.2831, y = vUv.y;
  float wave = sin(x * 2.0 + uTime * 1.3 + uSeed) * 0.6 + sin(x * 5.0 - uTime * 2.1) * 0.3;
  float curtain = pow(0.5 + 0.5 * sin(x * 7.0 + wave * 2.5 + uTime * 0.7), 2.5);
  float rays = 0.6 + 0.4 * sin(x * 23.0 + uTime * 3.0 + y * 4.0);
  float fade = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.45, 1.0, y));
  vec3 col = mix(hue(0.36 + 0.08 * sin(uTime * 0.4 + x)), hue(0.78 + 0.12 * sin(uTime * 0.3 + x * 0.5)), smoothstep(0.1, 0.9, y));
  float a = (0.3 + 0.7 * curtain) * rays * fade * 0.8;
  gl_FragColor = vec4(col * (0.75 + 0.5 * curtain), a);
}`;
const BULB_COLORS = ['#ff4d6d', '#ffd93d', '#6bff95', '#4dd2ff', '#c77dff'];

export function createFestivalDecor(roundRect, font) {
  const group = new THREE.Group();
  const curtains = [];
  for (const [r, h, seed] of [[0.42, 1.45, 0], [0.58, 1.15, 2.7]]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed } }, vertexShader: AURORA_VS, fragmentShader: AURORA_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 48, 1, true), mat);
    m.position.y = h / 2 + 0.02; m.renderOrder = 5;
    group.add(m); curtains.push(m);
  }
  // Cincin cahaya di lantai
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.62, 48), new THREE.MeshBasicMaterial({ color: '#8affc1', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.015; group.add(glow);

  // Tiang, umbul-umbul, dan untaian bohlam (lokal: x sepanjang petak, z ke luar papan)
  const poleM = new THREE.MeshStandardMaterial({ color: '#f4f1e8' });
  const deco = new THREE.Group(); group.add(deco);
  const poleG = new THREE.CylinderGeometry(0.014, 0.018, 0.9, 8);
  const poles = [-1, 1].map(s => { const p = new THREE.Mesh(poleG, poleM); p.position.set(s * 0.5, 0.45, 0.42); p.castShadow = true; deco.add(p); return p; });
  for (const s of [-1, 1]) { const top = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: '#e2b33c', metalness: 0.8, roughness: 0.3 })); top.position.set(s * 0.5, 0.92, 0.42); deco.add(top); }
  const pennantG = new THREE.ConeGeometry(0.045, 0.11, 3);
  const pennantM = ['#d9412f', '#ffffff', '#f4c21a', '#1f9a62'].map(c => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }));
  const pennants = [];
  for (let k = 0; k < 9; k++) {
    const t = (k + 0.5) / 9, f = new THREE.Mesh(pennantG, pennantM[k % 4]);
    f.position.set(-0.5 + t, 0.84 - Math.sin(Math.PI * t) * 0.1, 0.42); f.rotation.x = Math.PI; deco.add(f); pennants.push(f);
  }
  const bulbG = new THREE.SphereGeometry(0.022, 8, 6), bulbs = [];
  for (let k = 0; k < 14; k++) {
    const t = k / 13, m = new THREE.MeshStandardMaterial({ color: BULB_COLORS[k % 5], emissive: BULB_COLORS[k % 5], emissiveIntensity: 1 });
    const b = new THREE.Mesh(bulbG, m); b.position.set(-0.5 + t, 0.66 - Math.sin(Math.PI * t) * 0.14, 0.42); deco.add(b); bulbs.push(b);
  }

  // Percikan cahaya yang naik terus
  const N = 70, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), speed = new Float32Array(N);
  const c = new THREE.Color();
  for (let k = 0; k < N; k++) {
    const a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.45;
    pos.set([Math.cos(a) * r, Math.random() * 1.4, Math.sin(a) * r], k * 3);
    c.set(BULB_COLORS[k % 5]); col.set([c.r, c.g, c.b], k * 3);
    speed[k] = 0.25 + Math.random() * 0.5;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparks = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(sparks);

  // Papan pengali sewa
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 112;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  label.scale.set(1.0, 0.35, 1); label.position.y = 1.65; label.renderOrder = 10; group.add(label);
  let labelText = '';

  // Lampu sorot berwarna; selalu ada di scene supaya shader tidak dikompilasi ulang saat festival muncul/hilang.
  const light = new THREE.PointLight('#9b7bff', 0, 3.2, 1.6);

  return {
    group, light,
    // pos = titik tengah petak, rotY = arah petak, width = lebar petak, mult = pengali sewa total
    place(pos, rotY, width, mult) {
      group.position.copy(pos); group.rotation.y = rotY;
      for (const o of deco.children) { if (o.userData.x == null) o.userData.x = o.position.x; o.position.x = o.userData.x * width; }
      light.position.set(pos.x, pos.y + 0.9, pos.z);
      const text = '🎪 ×' + mult;
      if (text !== labelText) {
        labelText = text;
        const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
        const grd = g.createLinearGradient(0, 0, cv.width, 0); grd.addColorStop(0, '#ff4d6d'); grd.addColorStop(0.5, '#c77dff'); grd.addColorStop(1, '#4dd2ff');
        g.fillStyle = grd; roundRect(g, 8, 8, 304, 96, 48); g.fill();
        g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
        g.fillStyle = '#fff'; g.font = '800 60px ' + font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 160, 60);
        tex.needsUpdate = true;
      }
    },
    update(now, active) {
      light.intensity = active ? 2.2 + Math.sin(now / 240) * 0.8 : 0;
      if (!active) return;
      const t = now / 1000;
      curtains.forEach((m, k) => { m.material.uniforms.uTime.value = t; m.rotation.y = t * (k ? -0.25 : 0.18); });
      glow.material.opacity = 0.3 + 0.2 * Math.sin(t * 3);
      light.color.setHSL((t * 0.08) % 1, 0.8, 0.6);
      bulbs.forEach((b, k) => { b.material.emissiveIntensity = ((Math.floor(t * 4) + k) % 3 === 0) ? 2.2 : 0.25; });
      pennants.forEach((f, k) => { f.rotation.z = Math.sin(t * 3 + k) * 0.25; });
      const p = pg.attributes.position;
      for (let k = 0; k < N; k++) {
        let y = p.getY(k) + speed[k] * 0.016;
        if (y > 1.45) y = 0.05;
        p.setY(k, y);
      }
      p.needsUpdate = true;
      sparks.material.size = 0.04 + 0.02 * Math.sin(t * 6);
      label.position.y = 1.65 + Math.sin(t * 2) * 0.05;
    }
  };
}
