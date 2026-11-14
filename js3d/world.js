/* ពិភពលោក 3D តាមសម័យកាល · ជំពូកទី ១៖ យេរូសាឡឹម → ស្មឺណា (ទីលានប្រកួត) */
import * as THREE from "three";
import { Engine } from "./engine.js";
import { seeded } from "./util.js";
import { VFX } from "./vfx.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ---------- វាយនភាពបង្កើតដោយកូដ ---------- */
function noiseTex(base, vary, size = 256, grain = 1, repeat = 1, lines = false) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"); const col = new THREE.Color(base);
  const img = g.createImageData(size, size); const r = seeded(size * 7 + vary * 1000);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = (r() - 0.5) * vary + Math.sin(x * 0.05 * grain) * Math.cos(y * 0.07 * grain) * vary * 0.4;
    let k = 1 + n; if (lines && (y % 32 < 2 || ((x + (Math.floor(y / 32) % 2) * 24) % 48 < 2))) k *= 0.78;
    const i = (y * size + x) * 4;
    img.data[i] = Math.min(255, col.r * 255 * k); img.data[i + 1] = Math.min(255, col.g * 255 * k); img.data[i + 2] = Math.min(255, col.b * 255 * k); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export const World = {
  group: null, boxes: [], circles: [], camColliders: [], interactables: [], gates: [],
  bounds: null,

  clear() {
    if (this.group) Engine.scene.remove(this.group);
    this.group = new THREE.Group(); Engine.scene.add(this.group);
    this.boxes = []; this.circles = []; this.camColliders = []; this.interactables = []; this.gates = [];
  },

  height(x, z) { return 0; },

  /* រុញតួអង្គចេញពីជញ្ជាំង/ផ្ទះ/ដើមឈើ */
  resolve(p, r = 0.45) {
    for (const b of this.boxes) {
      if (b.off) continue;
      const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
        else { // នៅខាងក្នុងប្រអប់ — រុញទៅជ្រុងជិតបំផុត
          const opts = [[b.x0 - r - p.x, 0], [b.x1 + r - p.x, 0], [0, b.z0 - r - p.z], [0, b.z1 + r - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1])); p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
      if (d < m && d > 1e-5) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
    }
    if (this.bounds) {
      const bd = this.bounds, dx = p.x - bd.x, dz = p.z - bd.z, d = Math.hypot(dx, dz);
      if (d > bd.r) { p.x = bd.x + dx / d * bd.r; p.z = bd.z + dz / d * bd.r; }
    }
  },

  box(w, h, d, mat, x, y, z, solid = true, cam = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (solid) this.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    if (cam) this.camColliders.push(m);
    return m;
  },

  build(chapter) {
    this.clear();
    (BUILDERS[chapter.id] || BUILDERS[1]).call(this, chapter);
    this.optimize();
  },

  /* បញ្ចូលវត្ថុឋិតិវន្តទាំងអស់តាមសម្ភារៈ ដើម្បីឲ្យលឿនលើទូរសព្ទ (draw calls តិច) */
  optimize() {
    const g = this.group; g.updateMatrixWorld(true);
    const byMat = new Map(), remove = [], camSet = new Set(this.camColliders), camGeos = [];
    const visit = o => {
      if (o.userData.dynamic) return;
      if (o.isMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.visible) {
        let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
        geo.applyMatrix4(o.matrixWorld);
        const key = o.material.uuid;
        if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [], cast: false });
        const e = byMat.get(key); e.geos.push(geo); e.cast = e.cast || o.castShadow;
        if (camSet.has(o)) camGeos.push(geo);
        remove.push(o);
      }
      o.children.slice().forEach(visit);
    };
    g.children.slice().forEach(visit);
    remove.forEach(o => o.parent && o.parent.remove(o));
    for (const e of byMat.values()) {
      const merged = mergeGeometries(e.geos, false); if (!merged) continue;
      const m = new THREE.Mesh(merged, e.mat); m.castShadow = e.cast; m.receiveShadow = true; m.matrixAutoUpdate = false;
      g.add(m);
    }
    this.camColliders = [];
    if (camGeos.length) { const cm = new THREE.Mesh(mergeGeometries(camGeos, false)); cm.visible = false; cm.updateMatrixWorld(true); this.camColliders = [cm]; }
  }
};

/* ---------- ធាតុតុបតែង ---------- */
const colCache = new Map();
const colMat = (c, ds) => { const k = c + (ds ? 'd' : ''); if (!colCache.has(k)) colCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: ds ? THREE.DoubleSide : THREE.FrontSide })); return colCache.get(k); };
let M = null;
const mats = () => M || (M = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.9, side: THREE.DoubleSide }),
  oliveTrunk: new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 }),
  oliveLeaf: new THREE.MeshStandardMaterial({ color: 0x7c8b5a, roughness: 1, flatShading: true })
});
function palm(g, x, z, r, s = 1) {
  const trunkMat = mats().trunk, leafMat = mats().leaf;
  const t = new THREE.Group();
  const h = (6 + r() * 3) * s, bend = (r() - 0.5) * 0.6;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.28 * s, h / 7, 7), trunkMat);
    seg.position.set(bend * i * i * 0.05, h / 7 * (i + 0.5), 0); seg.castShadow = true; t.add(seg);
  }
  const top = new THREE.Vector3(bend * 36 * 0.05, h, 0);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 3.6 * s, 1, 4), leafMat);
    const pos = leaf.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) { const yy = pos.getY(k); pos.setZ(k, -Math.pow((yy + 1.8 * s) / (3.6 * s), 2) * 1.4 * s); }
    leaf.geometry.translate(0, 1.8 * s, 0);
    leaf.position.copy(top); leaf.rotation.set(-1.1 + r() * 0.3, i / 9 * Math.PI * 2, 0, "YXZ"); leaf.castShadow = true; t.add(leaf);
  }
  t.position.set(x, 0, z); g.add(t);
  World.circles.push({ x, z, r: 0.45 * s });
}
function olive(g, x, z, r) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 7), mats().oliveTrunk);
  trunk.position.y = 1.1; trunk.rotation.z = (r() - 0.5) * 0.4; trunk.castShadow = true; t.add(trunk);
  const lm = mats().oliveLeaf;
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + r() * 0.6, 0), lm);
    b.position.set((r() - 0.5) * 2, 2.6 + r() * 0.9, (r() - 0.5) * 2); b.castShadow = true; t.add(b);
  }
  t.position.set(x, 0, z); g.add(t); World.circles.push({ x, z, r: 0.5 });
}
function rock(g, x, z, s, r, mat) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
  m.position.set(x, s * 0.35, z); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.6 + r() * 0.4;
  m.castShadow = m.receiveShadow = true; g.add(m);
  if (s > 0.8) World.circles.push({ x, z, r: s * 0.8 });
}

/* ---------- ជំពូកទី ១ ---------- */
function buildCh1() {
  const g = this.group, r = seeded(30);
  this.sky = { elevation: 38, azimuth: 150, turbidity: 7, rayleigh: 1.4, sunColor: 0xfff0d2, sunIntensity: 2.8, fog: 0xe3d2b0, fogNear: 70, fogFar: 300, exposure: 0.85 };
  Engine.setSky(this.sky);
  this.bounds = { x: 0, z: -40, r: 150 };

  // ដី (ខ្សាច់ និងភ្នំនៅជុំវិញ)
  const geo = new THREE.PlaneGeometry(600, 600, 120, 120); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z + 40);
    const hill = Math.max(0, d - 120) * 0.22;
    pos.setY(i, hill * (0.7 + 0.3 * Math.sin(x * 0.03) * Math.cos(z * 0.025)) + Math.sin(x * 0.11) * Math.cos(z * 0.09) * Math.min(1, Math.max(0, d - 60) / 40) * 0.6);
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: noiseTex(0xd9bf8f, 0.18, 256, 1, 60), roughness: 1 }));
  ground.receiveShadow = true; g.add(ground);
  // ផ្លូវថ្មពីក្រុងទៅទីលានប្រកួត
  const roadMat = new THREE.MeshStandardMaterial({ map: noiseTex(0xb9a27a, 0.25, 256, 3, 1, true), roughness: 1 });
  roadMat.map.repeat.set(1.5, 18);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 150), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, -30); road.receiveShadow = true; g.add(road);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 48), new THREE.MeshStandardMaterial({ map: noiseTex(0xcdb88f, 0.2, 256, 3, 6, true), roughness: 1 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadow = true; g.add(plaza);

  const stone = c => new THREE.MeshStandardMaterial({ map: noiseTex(c, 0.16, 128, 2, 1, true), roughness: 0.95 });
  const stones = [0xe8dcc0, 0xdccdaa, 0xefe3c9, 0xd3c09a].map(stone);
  const wallMat = stone(0xcbb68a); wallMat.map.repeat.set(6, 1);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 1 });

  // កំពែងក្រុង (ការេ ៨៤ x ៨៤) ទ្វារខាងជើង និងខាងត្បូង
  const H = 42, wh = 7, wt = 2.2, gate = 5;
  [[-H, -gate], [gate, H]].forEach(([a, b]) => { const w = b - a; this.box(w, wh, wt, wallMat, (a + b) / 2, 0, -H); this.box(w, wh, wt, wallMat, (a + b) / 2, 0, H); });
  this.box(wt, wh, H * 2, wallMat, -H, 0, 0); this.box(wt, wh, H * 2, wallMat, H, 0, 0);
  // ប៉មទ្វារ និងប៉មជ្រុង
  [[-gate - 2, -H], [gate + 2, -H], [-gate - 2, H], [gate + 2, H], [-H, -H], [H, -H], [-H, H], [H, H]].forEach(([x, z]) => this.box(5, 10, 5, wallMat, x, 0, z));
  // ក្រឡោងលើទ្វារ
  [-H, H].forEach(z => { const a = this.box(gate * 2 + 4, 2, wt + 0.4, wallMat, 0, 8, z, false); });
  // ក្រេណូ (ធ្មេញកំពែង)
  for (let x = -H; x <= H; x += 3) [-H, H].forEach(z => { if (Math.abs(x) > gate + 3) this.box(1.2, 1, wt, wallMat, x, wh, z, false, false); });

  // ផ្ទះថ្មក្នុងក្រុង
  const houses = [];
  for (let x = -36; x <= 36; x += 11) for (let z = -36; z <= 36; z += 11) {
    if (Math.abs(x) < 8) continue;                    // ផ្លូវធំកណ្តាល
    if (Math.hypot(x, z) < 18) continue;              // ទីលានកណ្តាល
    if (x < -14 && x > -30 && z > -22 && z < -2) continue; // បន្ទប់ខាងលើ
    if (r() < 0.12) continue;
    houses.push([x + (r() - 0.5) * 2, z + (r() - 0.5) * 2]);
  }
  houses.forEach(([x, z]) => {
    const w = 6 + r() * 3, d = 6 + r() * 3, h = 3.5 + r() * 4;
    const m = stones[Math.floor(r() * stones.length)];
    this.box(w, h, d, m, x, 0, z);
    this.box(w + 0.3, 0.6, d + 0.3, m, x, h, z, false, false);       // ដំបូលរាបស្មើ
    if (r() < 0.5) this.box(w * 0.5, 2.2, d * 0.5, m, x + w * 0.2, h + 0.6, z - d * 0.2, false, false);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), dark);
    const side = Math.abs(x) < 20 ? Math.sign(-x) : (r() < 0.5 ? 1 : -1);
    door.position.set(x + side * (w / 2 + 0.01), 1.05, z); door.rotation.y = side * Math.PI / 2; g.add(door);
    if (r() < 0.6) { // ក្រណាត់ពណ៌ (awning)
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), colMat([0xb8462e, 0x2f6b8a, 0xd9a23a, 0x7a5c99][Math.floor(r() * 4)], true));
      cloth.position.set(x + side * (w / 2 + 0.7), 2.6, z); cloth.rotation.set(0, side * Math.PI / 2, 0); cloth.rotateX(-0.6); cloth.castShadow = true; g.add(cloth);
    }
  });

  // បន្ទប់ខាងលើ (ថ្ងៃបុណ្យទី៥០) — ផ្ទះធំមានពន្លឺកក់ក្តៅ
  this.box(12, 5, 10, stones[2], -22, 0, -12);
  this.box(9, 3.6, 8, stones[0], -22, 5, -12, false);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xffc66b }));
  for (let i = -1; i <= 1; i++) { const w2 = win.clone(); w2.position.set(-22 + i * 2.6, 6.8, -7.99); g.add(w2); }
  const warm = new THREE.PointLight(0xffb45a, 30, 16, 2); warm.position.set(-22, 3, -5.5); g.add(warm);
  // ជណ្តើរ
  for (let i = 0; i < 6; i++) this.box(1.6, 0.85 * (i + 1), 1, stones[1], -15.2, 0, -16 + i, false, false);

  // ទីលានកណ្តាល៖ អណ្តូង តូបលក់ដូរ ក្អម
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1, 16, 1, true), stones[1]); well.position.set(0, 0.5, 0); well.castShadow = true; g.add(well);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.25, 16), new THREE.MeshStandardMaterial({ color: 0x3a6d80, roughness: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.6; g.add(water);
  this.circles.push({ x: 0, z: 0, r: 1.5 });
  [[-9, 6], [9, 7], [-8, -8], [10, -6]].forEach(([x, z], i) => {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4), wood); p.position.set(x + a * 1.3, 1.2, z + b * 0.9); g.add(p); });
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), colMat([0xc0563a, 0x3d7a96, 0xe0b04a, 0x8a5aa8][i], true));
    roof.rotation.x = -Math.PI / 2 + 0.15; roof.position.set(x, 2.4, z); roof.castShadow = true; g.add(roof);
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.4), wood); table.position.set(x, 0.45, z); table.castShadow = true; g.add(table);
    this.boxes.push({ x0: x - 1.4, x1: x + 1.4, z0: z - 0.9, z1: z + 0.9 });
    for (let k = 0; k < 3; k++) { const jar = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), colMat(0xa8643a)); jar.scale.y = 1.3; jar.position.set(x - 0.8 + k * 0.8, 1.15, z); g.add(jar); }
  });

  // ដើមត្នោត និងដើមអូលីវក្នុងក្រុង
  [[-5, 14], [5, 20], [-5, -20], [5, -28], [14, 2], [-14, -1]].forEach(([x, z]) => palm(g, x, z, r));

  // ខាងក្រៅ៖ ដើមឈើ ថ្ម នៅលើវាលខ្សាច់
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xa89274, roughness: 1, flatShading: true });
  for (let i = 0; i < 80; i++) {
    const a = r() * Math.PI * 2, d = 50 + r() * 95; const x = Math.cos(a) * d, z = -40 + Math.sin(a) * d;
    if (Math.abs(x) < 6 && z < -40 && z > -110) continue;          // ផ្លូវ
    if (Math.hypot(x, z + 125) < 34) continue;                       // ទីលានប្រកួត
    if (Math.abs(x) < H + 4 && Math.abs(z) < H + 4) continue;         // ក្រុង
    const k = r(); if (k < 0.35) palm(g, x, z, r, 0.9 + r() * 0.4); else if (k < 0.6) olive(g, x, z, r); else rock(g, x, z, 0.5 + r() * 1.8, r, rockMat);
  }
  // គល់ឈើសម្រាប់ហាត់លោត (ផ្លូវខាងត្បូង)
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 10), wood); log.rotation.z = Math.PI / 2; log.position.set(0, 0.35, 50); log.castShadow = true; g.add(log);
  this.logZ = 50;

  // ទីលានប្រកួតនៅក្រុងស្មឺណា (Boss)
  const A = { x: 0, z: -125, r: 24 };
  this.arena = A;
  const arenaMat = stone(0xd8c49a); arenaMat.map.repeat.set(10, 2);
  const tiers = new THREE.Mesh(new THREE.CylinderGeometry(A.r + 8, A.r + 3, 9, 64, 1, true, 0.3, Math.PI * 2 - 0.6), arenaMat);
  tiers.material.side = THREE.DoubleSide; tiers.position.set(A.x, 4.5, A.z); tiers.castShadow = tiers.receiveShadow = true; g.add(tiers);
  this.camColliders.push(tiers);
  for (let i = 0; i < 36; i++) { // សសរ
    const a = i / 36 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.25) continue;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 9.5, 10), stones[2]);
    c.position.set(A.x + Math.cos(a) * (A.r + 8.3), 4.75, A.z + Math.sin(a) * (A.r + 8.3)); c.castShadow = true; g.add(c);
  }
  for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.18) continue; this.circles.push({ x: A.x + Math.cos(a) * (A.r + 2.2), z: A.z + Math.sin(a) * (A.r + 2.2), r: 2 }); }
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.2) continue; this.circles.push({ x: A.x + Math.cos(a) * (A.r + 6.5), z: A.z + Math.sin(a) * (A.r + 6.5), r: 2.6 }); }
  const sand = new THREE.Mesh(new THREE.CircleGeometry(A.r + 2, 64), new THREE.MeshStandardMaterial({ map: noiseTex(0xe2cba0, 0.15, 256, 1, 10), roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(A.x, 0.05, A.z); sand.receiveShadow = true; g.add(sand);
  // ទ្វារទីលាន (បិទរហូតដល់ដោះប្រស្នាចប់)
  const gz = A.z + A.r + 2.2;
  const bars = new THREE.Group();
  for (let i = -3; i <= 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x3b3b3b, metalness: 0.6, roughness: 0.4 })); b.position.set(i * 0.8, 3, 0); bars.add(b); }
  bars.position.set(A.x, 0, gz); bars.userData.dynamic = true; g.add(bars);
  const gateBox = { x0: A.x - 5, x1: A.x + 5, z0: gz - 0.6, z1: gz + 0.6 }; this.boxes.push(gateBox);
  this.gates.push({ mesh: bars, box: gateBox, open: false });
  // ផ្ទាំងថ្មសម្រាប់ដោះប្រស្នា
  const tablet = this.box(2.2, 2.6, 0.5, stones[3], A.x - 6, 0, gz + 4);
  const glowT = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.8), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.6 }));
  glowT.position.set(A.x - 6, 1.4, gz + 4.27); g.add(glowT);
  this.tabletPos = new THREE.Vector3(A.x - 6, 0, gz + 5.5);
  // ភ្លើងនៅទីលាន
  [[-1, 1], [1, 1]].forEach(([s]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.4), wood); t.position.set(A.x + s * 4.5, 1.2, gz + 1.5); g.add(t); const f = VFX.sprite(0xff9a3a, 1.4); f.position.set(A.x + s * 4.5, 2.6, gz + 1.5); g.add(f); const pl = new THREE.PointLight(0xff8a3a, 12, 10, 2); pl.position.copy(f.position); g.add(pl); });

  const motes = VFX.motes(new THREE.Vector3(0, 0, -20), 0xfff2c4, 90, 60); g.add(motes);

  /* ទីតាំងសម្រាប់ Quest */
  this.spots = {
    spawn: new THREE.Vector3(0, 0, 60), teacherStart: new THREE.Vector3(2.2, 0, 55),
    tutorialShadow: new THREE.Vector3(0, 0, 45.5),
    peter: new THREE.Vector3(4, 0, -3), polycarp: new THREE.Vector3(9, 0, -94),
    scrolls: [new THREE.Vector3(-17, 0, -5), new THREE.Vector3(16, 0, -62), new THREE.Vector3(-14, 0, -86)],
    camps: [[-6, -54, 2], [10, -70, 3], [-9, -90, 2], [9, -30, 2], [-30, 25, 2]],
    arenaCenter: new THREE.Vector3(A.x, 0, A.z), arenaGate: new THREE.Vector3(A.x, 0, gz + 2)
  };
}

const BUILDERS = { 1: buildCh1 };
