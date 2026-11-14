/* ផ្ទុកតួអង្គ 3D (KayKit Adventurers · CC0) និងចលនា */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";

const MODELS = ["Rogue", "Rogue_Hooded", "Mage", "Knight", "Barbarian"];
const store = { models: {}, clips: {}, height: 1 };

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const files = MODELS.concat(["anims"]);
  let done = 0;
  await Promise.all(files.map(name => loader.loadAsync("assets/models/" + name + ".glb").then(g => {
    if (name === "anims") {
      g.animations.forEach(c => { cleanRootMotion(c); store.clips[c.name] = c; });
    } else store.models[name] = g.scene;
    onProgress && onProgress(++done / files.length);
  })));
  const box = new THREE.Box3().setFromObject(store.models.Rogue);
  store.height = box.max.y - box.min.y || 1;
}

/* លុបចលនាផ្លាស់ទីលើផ្ទៃដី ពីឆ្អឹង hips/root (យើងរំកិលតួអង្គដោយកូដ) */
function cleanRootMotion(clip) {
  clip.tracks = clip.tracks.filter(t => !/^(root|Rig)\.position$/.test(t.name));
  clip.tracks.forEach(t => {
    if (t.name === "hips.position") {
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  });
}

const WEAPONS = /Knife|Crossbow|Throwable|Sword|Shield|Axe|Mug|Wand|Staff|Spellbook|Hat|Helmet/;

/* រូបរាងតួអង្គនីមួយៗ */
export const LOOKS = {
  player:   { model: "Rogue", show: ["Knife"], weaponGlow: 0xffd36b },
  teacher:  { model: "Mage", show: ["Spellbook"] },
  peter:    { model: "Barbarian", show: [], tint: 0xe7c9a4 },
  polycarp: { model: "Mage", show: [], tint: 0xb9b2c8 },
  elder:    { model: "Mage", show: [], tint: 0xc9c2b0 },
  npc:      { model: "Barbarian", show: [], tint: 0xd8c7aa },
  shadow:   { model: "Rogue_Hooded", show: ["Knife"], shadow: 0x7a3cff },
  boss:     { model: "Knight", show: ["2H_Sword", "Knight_Helmet"], shadow: 0xff2a3a, ei: 0.12 }
};

export class Avatar {
  constructor(look, opts = {}) {
    const L = typeof look === "string" ? (LOOKS[look] || LOOKS.npc) : look;
    this.root = new THREE.Group();
    const m = this.model = skClone(store.models[L.model]);
    const s = (opts.height || 1.75) / store.height;
    m.scale.setScalar(s);
    this.root.add(m);
    this.materials = [];
    m.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (WEAPONS.test(o.name) && !(L.show || []).some(n => o.name === n)) o.visible = false;
        o.material = o.material.clone();
        const mat = o.material;
        if (L.tint) mat.color.multiply(new THREE.Color(L.tint));
        if (L.weaponGlow && (L.show || []).includes(o.name)) {
          mat.emissive = new THREE.Color(L.weaponGlow); mat.emissiveIntensity = 2.2; o.scale.multiplyScalar(1.35);
        }
        if (L.shadow) {
          mat.color.setRGB(0.08, 0.05, 0.12);
          mat.emissive = new THREE.Color(L.shadow); mat.emissiveIntensity = L.ei ?? 0.35;
          mat.transparent = true; mat.opacity = 0.92; mat.roughness = 0.4;
        }
        this.materials.push(mat);
      }
      if (o.isBone && o.name === "head") this.head = o;
      if (o.name === "handslot.r") this.handR = o;
    });
    this.baseEmissive = this.materials.map(mt => mt.emissive ? mt.emissive.clone() : null);
    this.baseEI = this.materials.map(mt => mt.emissiveIntensity ?? 1);
    this.mixer = new THREE.AnimationMixer(m);
    this.actions = {};
    this.current = null;
    this.talk = 0;           // កម្រិតសំឡេងពេលនិយាយ (0..1)
    this.talkT = 0;
    this.flashT = 0;
    this.mixer.addEventListener("finished", e => { if (this._onDone && e.action === this.current) { const f = this._onDone; this._onDone = null; f(); } });
  }

  action(name) {
    if (!this.actions[name]) {
      const clip = store.clips[name];
      if (!clip) return null;
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }

  /* play(ឈ្មោះចលនា, {once, fade, speed, onDone}) */
  play(name, o = {}) {
    const a = this.action(name);
    if (!a) return 0;
    if (this.current === a && !o.restart) { a.timeScale = o.speed ?? 1; return a.getClip().duration; }
    a.reset();
    a.timeScale = o.speed ?? 1;
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.enabled = true;
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, o.fade ?? 0.18, false);
    a.play();
    this.current = a; this.currentName = name;
    this._onDone = o.onDone || null;
    return a.getClip().duration / (o.speed ?? 1);
  }

  hitFlash() { this.flashT = 0.15; }

  setOpacity(v) { this.materials.forEach(m => { m.transparent = true; m.opacity = v; }); }

  update(dt) {
    this.mixer.update(dt);
    // ក្បាលងក់ និងមាត់កម្រើក ពេលនិយាយ
    if (this.head) {
      this.talkT += dt * 9;
      const k = this.talk;
      this.head.rotation.x += Math.sin(this.talkT) * 0.09 * k + 0.05 * k;
      this.head.rotation.z += Math.sin(this.talkT * 0.5) * 0.04 * k;
      const sy = 1 + k * 0.05 * (0.5 + 0.5 * Math.sin(this.talkT * 2.3));
      this.head.scale.set(1, sy, 1);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      this.materials.forEach((m, i) => {
        if (!m.emissive) return;
        if (on) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.2; }
        else { m.emissive.copy(this.baseEmissive[i]); m.emissiveIntensity = this.baseEI[i]; }
      });
    }
  }
}

export const getClipDuration = n => store.clips[n] ? store.clips[n].duration : 1;

/* រូបតំណាងអ្នកនិយាយ ថតពីតួអង្គ 3D ផ្ទាល់ */
export function makePortraits(renderer, keys) {
  const out = {}, S = 256;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404060, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(1, 2, 3); scene.add(d);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  const rt = new THREE.WebGLRenderTarget(S, S); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(S * S * 4);
  const c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"); const img = g.createImageData(S, S);
  const prevTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  for (const k of keys) {
    const a = new Avatar(k, { height: 1.75 }); scene.add(a.root);
    a.play("Idle"); a.mixer.update(0.3);
    a.root.updateMatrixWorld(true);
    const hy = a.head ? a.head.getWorldPosition(new THREE.Vector3()).y : 1.3;
    cam.position.set(0.35, hy + 0.25, 1.9); cam.lookAt(0, hy + 0.12, 0);
    scene.background = new THREE.Color(k === "boss" || k === "shadow" ? 0x2a0f18 : 0x26305a);
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0); out[k] = c.toDataURL("image/png");
    scene.remove(a.root);
  }
  renderer.setRenderTarget(null); renderer.toneMapping = prevTM; rt.dispose();
  return out;
}
