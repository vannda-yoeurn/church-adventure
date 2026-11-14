/* សំឡេងនិយាយខ្មែរ៖ ចាក់ពី audio/voice/<id>.wav តែក្រោយពិនិត្យ manifest.json ប៉ុណ្ណោះ
   (មិនហៅ TTS API ពេលលេងហ្គេមទេ) · បន្ថយភ្លេងពេលនិយាយ (ducking) · វាស់កម្រិតសំឡេងសម្រាប់មាត់/ក្បាល */
import { Settings } from "./util.js";

/* ឃ្លាទាំងអស់ (ចាស់ ២៥៥ ពី data.js + ថ្មី ១៨០ ពី voice-lines-3d.js) */
export const LINES = {};
const SPK = { "អ្នកនិទាន": "narr", "លោកគ្រូ វ៉ាន់ដា": "teacher", "អ្នកលេង": "player", "មេស្រមោល": "boss" };
export function buildLines() {
  allVoiceLines().forEach(l => { LINES[l.id] = { speaker: l.speaker, text: l.text }; });
  VOICE3D_LINES.forEach(([id, who, text]) => { LINES[id] = { speaker: SPK[who] || "narr", text }; });
}
export const linesWith = prefix => Object.keys(LINES).filter(k => k.startsWith(prefix)).sort();

const BASE = "audio/voice/";      // = https://vannda-yoeurn.github.io/church-adventure/audio/voice/
export const Voice = {
  manifest: new Set(), audio: null, ctx: null, analyser: null, data: null,
  playing: null, level: 0, onEnd: null,

  async load() {
    try { const r = await fetch(BASE + "manifest.json", { cache: "no-cache" }); const a = await r.json(); if (Array.isArray(a)) this.manifest = new Set(a); } catch (e) {}
  },
  has(id) { return this.manifest.has(id); },

  /* ត្រូវហៅក្រោយការចុចដំបូង (browser តម្រូវ) */
  unlock() {
    if (this.audio) { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); return; }
    this.audio = new Audio(); this.audio.preload = "auto";
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 256;
      this.data = new Uint8Array(this.analyser.fftSize);
      src.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
    this.audio.addEventListener("ended", () => this._finish());
    this.audio.addEventListener("error", () => this._finish());
  },

  /* ចាក់ id · ត្រឡប់ true បើមានឯកសារ */
  play(id, onEnd) {
    this.stop(true);
    this.onEnd = onEnd || null;
    if (!this.audio || Settings.voiceMute || !this.manifest.has(id)) return false;
    this.playing = id;
    this.audio.src = BASE + id + ".wav";
    this.audio.volume = Math.max(0, Math.min(1, Settings.voiceVol));
    const p = this.audio.play(); if (p && p.catch) p.catch(() => this._finish());
    this.duck(true);
    return true;
  },
  stop(silent) {
    if (this.audio && this.playing) { this.audio.pause(); }
    const had = this.playing; this.playing = null; this.level = 0;
    if (had) this.duck(false);
    if (!silent && this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); }
    if (silent) this.onEnd = null;
  },
  _finish() { if (!this.playing) return; this.playing = null; this.level = 0; this.duck(false); if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); } },

  duck(on) {
    if (typeof Sound === "undefined") return;
    Sound.setVolumes({ music: on ? Settings.musicVol * 0.25 : Settings.musicVol, ambient: on ? 0.25 : 0.6 });
  },

  update() {
    if (!this.playing) { this.level = 0; return; }
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.data);
      let s = 0; for (let i = 0; i < this.data.length; i++) { const v = (this.data[i] - 128) / 128; s += v * v; }
      const rms = Math.sqrt(s / this.data.length);
      this.level = Math.min(1, rms * 6);
    } else this.level = 0.6;
  }
};
