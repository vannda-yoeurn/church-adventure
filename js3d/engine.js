/* ម៉ាស៊ីន 3D — renderer, មេឃ, ពន្លឺ, ស្រមោល */
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { Settings, isTouch, lerp } from "./util.js";

export const Engine = {
  renderer: null, scene: null, camera: null, sun: null, hemi: null, sky: null,
  pmrem: null, envRT: null, shake: 0, quality: "high",

  init(canvas) {
    this.quality = Settings.quality === "auto" ? (isTouch() ? "medium" : "high") : Settings.quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== "low", powerPreference: "high-performance" });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = this.quality !== "low";
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);

    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x8a6a45, 0.9);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.castShadow = r.shadowMap.enabled;
    const sm = this.quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    const c = sun.shadow.camera; c.left = -32; c.right = 32; c.top = 32; c.bottom = -32; c.near = 1; c.far = 160;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);

    this.sky = new Sky(); this.sky.scale.setScalar(800);
    this.scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.sunDir = new THREE.Vector3();
    this.applyQuality();
    addEventListener("resize", () => this.resize());
    this.resize();
  },

  applyQuality() {
    const cap = { low: 1, medium: 1.5, high: 2 }[this.quality] || 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    this.resize();
  },

  setQuality(q) {
    Settings.quality = q;
    this.quality = q === "auto" ? (isTouch() ? "medium" : "high") : q;
    this.renderer.shadowMap.enabled = this.quality !== "low";
    this.sun.castShadow = this.renderer.shadowMap.enabled;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.applyQuality();
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 55;
    this.camera.updateProjectionMatrix();
  },

  /* មេឃ៖ elevation (ដឺក្រេ), azimuth, ពណ៌អ័ព្ទ, ពន្លឺ */
  setSky(o) {
    const u = this.sky.material.uniforms;
    u.turbidity.value = o.turbidity ?? 6;
    u.rayleigh.value = o.rayleigh ?? 1.6;
    u.mieCoefficient.value = o.mie ?? 0.006;
    u.mieDirectionalG.value = 0.85;
    const phi = THREE.MathUtils.degToRad(90 - (o.elevation ?? 35));
    const theta = THREE.MathUtils.degToRad(o.azimuth ?? 140);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.sun.color.set(o.sunColor ?? 0xfff1d6);
    this.sun.intensity = o.sunIntensity ?? 2.6;
    this.hemi.color.set(o.skyColor ?? 0xdfe9ff);
    this.hemi.groundColor.set(o.groundColor ?? 0x8a6a45);
    this.hemi.intensity = o.hemi ?? 0.9;
    this.renderer.toneMappingExposure = o.exposure ?? 0.9;
    this.scene.fog = new THREE.Fog(o.fog ?? 0xd9c9a8, o.fogNear ?? 60, o.fogFar ?? 260);
    // ពន្លឺបរិស្ថានពីមេឃ (ធ្វើឲ្យសម្ភារៈមើលទៅពិត)
    const tmp = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(800);
    Object.keys(u).forEach(k => { if (s2.material.uniforms[k]) s2.material.uniforms[k].value = u[k].value.clone ? u[k].value.clone() : u[k].value; });
    tmp.add(s2);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(tmp, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = o.env ?? 0.55;
  },

  followSun(target) {
    this.sun.position.copy(target).addScaledVector(this.sunDir, 70);
    this.sun.target.position.copy(target);
  },

  addShake(v) { this.shake = Math.min(1.2, this.shake + v); },

  render() { this.renderer.render(this.scene, this.camera); }
};
