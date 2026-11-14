/* ឥទ្ធិពលពន្លឺ (VFX)៖ ភាគល្អិត រលក សសរពន្លឺ សញ្ញាព្រមាន */
import * as THREE from "three";
import { Engine } from "./engine.js";
import { rand } from "./util.js";

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,0.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const items = [];   // {obj, life, max, update(t,dt)}
const add = (obj, life, update) => { Engine.scene.add(obj); items.push({ obj, life, max: life, update }); return obj; };

export const VFX = {
  sprite(color, size) {
    const m = new THREE.SpriteMaterial({ map: glow(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
  },

  /* ផ្កាភ្លើងពន្លឺ */
  burst(pos, color = 0xffd36b, n = 14, speed = 5, size = 0.35, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const s = this.sprite(color, size * rand(0.6, 1.3));
      s.position.copy(pos);
      const v = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
      add(s, life * rand(0.7, 1.2), (t, dt, it) => {
        s.position.addScaledVector(v, dt); v.y -= 6 * dt; v.multiplyScalar(1 - dt * 2);
        s.material.opacity = t; s.scale.setScalar(size * (0.4 + t));
      });
    }
  },

  /* រលកជារង្វង់នៅលើដី */
  ring(pos, color = 0xffe39a, radius = 6, life = 0.6, width = 0.5) {
    const g = new THREE.RingGeometry(0.8, 1, 64);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const r = new THREE.Mesh(g, m); r.rotation.x = -Math.PI / 2; r.position.copy(pos); r.position.y += 0.08;
    return add(r, life, t => { const s = radius * (1 - t) + 0.3; r.scale.setScalar(s); m.opacity = t; });
  },

  /* សសរពន្លឺធ្លាក់ពីលើមេឃ */
  pillar(pos, color = 0xfff0b0, radius = 1.4, height = 30, life = 0.9) {
    const g = new THREE.CylinderGeometry(radius, radius * 1.2, height, 24, 1, true);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const c = new THREE.Mesh(g, m); c.position.copy(pos); c.position.y += height / 2;
    const l = new THREE.PointLight(color, 40, 18, 2); l.position.set(0, -height / 2 + 2, 0); c.add(l);
    return add(c, life, t => { m.opacity = Math.min(1, t * 2) * 0.32; c.scale.x = c.scale.z = 0.3 + (1 - t) * 0.9; l.intensity = 40 * t; });
  },

  /* រង្វង់ព្រមានពណ៌ក្រហមនៅលើដី (ត្រូវគេចចេញ) */
  telegraph(pos, radius, life, color = 0xff3344) {
    const g = new THREE.CircleGeometry(1, 48);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false });
    const c = new THREE.Mesh(g, m); c.rotation.x = -Math.PI / 2; c.position.copy(pos); c.position.y += 0.06; c.scale.setScalar(radius);
    const rg = new THREE.RingGeometry(0.93, 1, 48);
    const rm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const edge = new THREE.Mesh(rg, rm); c.add(edge);
    const inner = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
    inner.position.z = 0.01; c.add(inner);
    return add(c, life, t => { inner.scale.setScalar(1 - t); m.opacity = 0.18 + 0.1 * Math.sin(t * 40); });
  },

  /* ពន្លឺជុំវិញខ្លួន (ខែល) */
  aura(target, color = 0x9fd8ff, life = 4, size = 1.4) {
    const g = new THREE.SphereGeometry(size, 24, 16);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Mesh(g, m);
    return add(s, life, (t) => { s.position.copy(target.position); s.position.y += 1; m.opacity = 0.12 + 0.1 * Math.sin(t * 30) + (t < 0.15 ? -0.1 : 0); });
  },

  /* គ្រាប់ពន្លឺ ឬគ្រាប់ស្រមោល ដែលហោះ */
  orb(color, size = 0.5) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const halo = this.sprite(color, size * 3);
    g.add(core, halo);
    const l = new THREE.PointLight(color, 8, 8, 2); g.add(l);
    Engine.scene.add(g);
    return g;
  },

  /* ធូលីពន្លឺនៅជុំវិញ (បរិយាកាស) */
  motes(center, color = 0xfff2c4, n = 60, radius = 30) {
    const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = rand(-radius, radius); p[i * 3 + 1] = rand(0.5, 7); p[i * 3 + 2] = rand(-radius, radius); }
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ map: glow(), color, size: 0.35, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, m); pts.position.copy(center);
    Engine.scene.add(pts);
    return pts;
  },

  update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.life -= dt;
      const t = Math.max(0, it.life / it.max);
      it.update(t, dt, it);
      if (it.life <= 0) {
        Engine.scene.remove(it.obj);
        it.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        items.splice(i, 1);
      }
    }
  },

  clear() { items.forEach(it => Engine.scene.remove(it.obj)); items.length = 0; }
};

/* លេខបង្ហាញការខូចខាត (DOM) */
const proj = new THREE.Vector3();
const nums = [];
export function damageNumber(pos, text, cls = "") {
  const el = document.createElement("div");
  el.className = "dmg " + cls; el.textContent = text;
  document.getElementById("float-layer").appendChild(el);
  nums.push({ el, pos: pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 2.2, 0)), t: 0.9 });
}
export function updateNumbers(dt) {
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]; n.t -= dt; n.pos.y += dt * 1.4;
    proj.copy(n.pos).project(Engine.camera);
    n.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px,${(-proj.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`;
    n.el.style.opacity = Math.min(1, n.t * 2);
    if (n.t <= 0 || proj.z > 1) { n.el.remove(); nums.splice(i, 1); }
  }
}
