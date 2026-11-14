/* ឧបករណ៍ជំនួយទូទៅ */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const kh = n => String(n).replace(/\d/g, d => "០១២៣៤៥៦៧៨៩"[d]);
export function angleDamp(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// គ្រាប់ពូជចៃដន្យ (ដើម្បីឲ្យផែនទីដូចគ្នាគ្រប់ពេល)
export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------- ការកំណត់ (រក្សាទុកក្នុងឧបករណ៍) ---------- */
const KEY = "ca3d.settings";
const DEF = { voiceVol: 1, voiceMute: false, musicVol: 0.5, sfxVol: 0.8, quality: "auto", sens: 1, subtitles: true };
export const Settings = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(Settings)); } catch (e) {} }

/* ---------- ការរក្សាទុកដំណើរ ---------- */
const SKEY = "ca3d.save";
export const Save = Object.assign({ name: "", cleared: [], faith: 0, introDone: false }, (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })());
export function writeSave() { try { localStorage.setItem(SKEY, JSON.stringify(Save)); } catch (e) {} }

export const isTouch = () => matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
