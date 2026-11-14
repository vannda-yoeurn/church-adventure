/* ផ្ទៃប្រើប្រាស់៖ ប្រអប់សន្ទនា HUD របារ Boss ម៉ឺនុយ ការកំណត់ ល្បែងប្រាជ្ញា និងសំណួរ */
import { Voice, LINES } from "./voice.js";
import { Settings, saveSettings, Save, kh, shuffle } from "./util.js";
import { Input } from "./input.js";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const sfx = n => { try { Sound.sfx(n); } catch (e) {} };
const freeCursor = () => { if (document.pointerLockElement) document.exitPointerLock(); };

/* ឈ្មោះ និងរូបតំណាងអ្នកនិយាយ */
const PORTRAIT = { teacher: "teacher", player: "player", peter: "peter", polycarp: "polycarp", boss: null, narr: null };
export function speakerInfo(key) {
  if (key === "narr") return { name: "អ្នកនិទាន", color: "#e9d8a6", icon: "📖" };
  if (key === "teacher") return { name: "លោកគ្រូ វ៉ាន់ដា", color: "#f2b84b", img: "teacher" };
  if (key === "player") return { name: Save.name || "អ្នកលេង", color: "#8fd3ff", img: "player" };
  if (key === "boss") return { name: UI.bossName || "មេស្រមោល", color: "#ff6b7a", icon: "👁️" };
  const npc = (UI.npcs || []).find(n => n.id === key);
  return { name: npc ? npc.name : key, color: "#c9e4b4", img: PORTRAIT[key] !== undefined ? PORTRAIT[key] : key };
}
export const fillName = t => String(t).replace(/\{name\}/g, Save.name || "មិត្ត");

/* ---------- ឃ្លាខ្លីៗពេលប្រយុទ្ធ (មិនផ្អាកហ្គេម) ---------- */
export const Bark = {
  cd: 0, avatar: null,
  say(id, avatar, prio = 0) {
    const L = LINES[id]; if (!L) return;
    if (UI.inDialogue) return;
    if (this.cd > 0 && prio < 2) return;
    if (Voice.playing && prio < 1) return;
    this.cd = prio >= 1 ? 1.2 : 3.2;
    const info = speakerInfo(L.speaker);
    const el = $("bark");
    el.innerHTML = `<b style="color:${info.color}">${esc(info.name)}</b> ${esc(fillName(L.text))}`;
    el.classList.add("show"); clearTimeout(this._t);
    this.avatar = avatar || null;
    const done = () => { el.classList.remove("show"); if (this.avatar) this.avatar.talk = 0; this.avatar = null; };
    const ok = Voice.play(id, done);
    this._t = setTimeout(done, ok ? 9000 : 1500 + L.text.length * 45);
  },
  update(dt) { this.cd -= dt; if (this.avatar) this.avatar.talk = Voice.playing ? 0.3 + Voice.level : 0; }
};

export const UI = {
  inDialogue: false, npcs: [], bossName: "", avatars: {}, portraits: {},

  show(id, on = true) { $(id).classList.toggle("hidden", !on); },
  toast(t, ms = 2400) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove("show"), ms); },
  objective(t) { $("objective").innerHTML = t ? `<span>◆</span> ${t}` : ""; },
  fade(on) { $("fader").classList.toggle("on", on); },

  /* ---------- សន្ទនា ----------
     lines: [{id?, speaker, text}] · avatars: {speakerKey: Avatar} · ត្រឡប់ Promise */
  dialogue(lines, avatars = {}) {
    // ដាក់តាមជួរ បើមានសន្ទនាផ្សេងកំពុងដំណើរការ
    const run = () => this._dialogue(lines, avatars);
    this._dq = (this._dq || Promise.resolve()).then(run, run);
    return this._dq;
  },
  _dialogue(lines, avatars) {
    return new Promise(resolve => {
      this.inDialogue = true; Voice.stop(true); $("bark").classList.remove("show");
      const box = $("dialogue"); box.classList.remove("hidden");
      let i = -1, typing = null, cur = null;
      const next = () => {
        if (typing) { clearInterval(typing); typing = null; $("dlg-text").textContent = cur; return; }
        Object.values(avatars).forEach(a => a && (a.talk = 0));
        i++;
        if (i >= lines.length) { Voice.stop(true); box.classList.add("hidden"); this.inDialogue = false; this._adv = null; resolve(); return; }
        const L = lines[i], info = speakerInfo(L.speaker);
        $("dlg-name").textContent = info.name; $("dlg-name").style.color = info.color;
        const pic = UI.portraits[L.speaker] || (info.img && UI.portraits[info.img]);
        $("dlg-portrait").innerHTML = pic ? `<img src="${pic}" alt="">` : `<span>${info.icon || "💬"}</span>`;
        box.dataset.speaker = L.speaker;
        cur = fillName(L.text);
        if (Settings.subtitles) {
          let k = 0; $("dlg-text").textContent = "";
          typing = setInterval(() => { k += 2; $("dlg-text").textContent = cur.slice(0, k); if (k >= cur.length) { clearInterval(typing); typing = null; } }, 18);
        } else $("dlg-text").textContent = "";
        const av = avatars[L.speaker];
        this._talking = av || null;
        const has = L.id && Voice.play(L.id, () => { if (av) av.talk = 0; });
        $("dlg-voice").classList.toggle("on", !!has);
        sfx("talk");
      };
      this._adv = next;
      box.onclick = e => { e.stopPropagation(); next(); };
      next();
    });
  },
  advance() { if (this._adv) this._adv(); },
  updateTalk() { if (this.inDialogue && this._talking) this._talking.talk = Voice.playing ? 0.35 + Voice.level : 0.15; },

  choice(prompt, options) {
    return new Promise(resolve => {
      freeCursor();
      const el = $("choice"); el.classList.remove("hidden");
      el.innerHTML = `<div class="ch-prompt">${esc(fillName(prompt))}</div>` + options.map((o, i) => `<button class="btn" data-i="${i}">${esc(fillName(o.text))}</button>`).join("");
      el.querySelectorAll("button").forEach(b => b.onclick = () => { el.classList.add("hidden"); sfx("select"); resolve(+b.dataset.i); });
    });
  },

  /* ---------- HUD ---------- */
  hud(p) {
    $("hp-fill").style.width = (p.hp / p.maxHp * 100) + "%"; $("hp-num").textContent = kh(Math.ceil(p.hp)) + "/" + kh(p.maxHp);
    $("st-fill").style.width = p.st + "%"; $("en-fill").style.width = p.en + "%";
    $("en-wrap").classList.toggle("ready", p.en >= 100);
    [["skill1", "s1"], ["skill2", "s2"]].forEach(([k, id]) => {
      const v = p.cd[k] / p.cdMax[k];
      document.querySelectorAll(`[data-cd="${id}"]`).forEach(el => { el.style.setProperty("--cd", v); el.dataset.t = p.cd[k] > 0 ? kh(Math.ceil(p.cd[k])) : ""; });
    });
    document.querySelectorAll('[data-cd="ult"]').forEach(el => { el.style.setProperty("--cd", 1 - p.en / 100); el.classList.toggle("ready", p.en >= 100); });
  },
  bossBar(boss) {
    const el = $("bossbar");
    if (!boss) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    $("boss-name").textContent = boss.name + (boss.phase > 1 ? "  ·  ដំណាក់ទី " + kh(boss.phase) : "");
    $("boss-fill").style.width = (boss.hp / boss.maxHp * 100) + "%";
  },
  prompt(text) { const el = $("interact"); if (text) { el.innerHTML = `<b>${Input.touch ? "👆" : "F"}</b> ${esc(text)}`; el.classList.add("show"); } else el.classList.remove("show"); },

  /* ---------- ល្បែងប្រាជ្ញា៖ រៀបតាមលំដាប់ ---------- */
  orderPuzzle(pz) {
    return new Promise(resolve => {
      freeCursor();
      const el = $("panel"); el.classList.remove("hidden");
      let items = shuffle(pz.items); let sel = null;
      const render = () => {
        el.innerHTML = `<h2>ផ្ទាំងថ្មបុរាណ</h2><p class="muted">${esc(pz.prompt)}</p><p class="muted small">ចុចលើប្រអប់ពីរ ដើម្បីប្តូរទីតាំងគ្នា</p>
          <div class="order">${items.map((t, i) => `<button class="ord ${sel === i ? "sel" : ""}" data-i="${i}"><b>${kh(i + 1)}</b> ${esc(t)}</button>`).join("")}</div>
          <button class="btn gold" id="pz-ok">✔ ពិនិត្យចម្លើយ</button>`;
        el.querySelectorAll(".ord").forEach(b => b.onclick = () => {
          const i = +b.dataset.i; if (sel === null) sel = i; else { [items[sel], items[i]] = [items[i], items[sel]]; sel = null; sfx("select"); }
          render();
        });
        $("pz-ok").onclick = () => {
          if (items.every((t, i) => t === pz.items[i])) { sfx("correct"); el.classList.add("hidden"); resolve(true); }
          else { sfx("wrong"); el.querySelectorAll(".ord").forEach((b, i) => b.classList.toggle("ok", items[i] === pz.items[i])); this.toast("មិនទាន់ត្រូវទេ — ប្រអប់ពណ៌បៃតងគឺត្រូវហើយ"); }
        };
      };
      render();
    });
  },

  /* ---------- សំណួរពីសៀវភៅ ---------- */
  quiz(questions, n = 3) {
    return new Promise(resolve => {
      freeCursor();
      const qs = shuffle(questions).slice(0, n); let i = 0, score = 0;
      const el = $("panel"); el.classList.remove("hidden");
      const ask = () => {
        if (i >= qs.length) { el.classList.add("hidden"); resolve(score); return; }
        const q = qs[i]; const opts = shuffle(q.a.map((t, k) => ({ t, ok: k === 0 })));
        el.innerHTML = `<h2>សំណួរទី ${kh(i + 1)}/${kh(qs.length)}</h2><p class="q">${esc(q.q)}</p><div class="answers">${opts.map((o, k) => `<button class="btn" data-k="${k}">${esc(o.t)}</button>`).join("")}</div>`;
        el.querySelectorAll(".answers button").forEach(b => b.onclick = () => {
          const o = opts[+b.dataset.k];
          el.querySelectorAll(".answers button").forEach((x, k) => { x.disabled = true; if (opts[k].ok) x.classList.add("ok"); });
          if (o.ok) { score++; sfx("correct"); } else { b.classList.add("bad"); sfx("wrong"); }
          setTimeout(() => { i++; ask(); }, 1300);
        });
      };
      ask();
    });
  },

  /* ---------- ការកំណត់ ---------- */
  settingsHTML() {
    const q = Settings.quality;
    return `<h2>⚙ ការកំណត់</h2>
      <label>🔊 សំឡេងនិយាយ <input type="range" id="set-voice" min="0" max="1" step="0.05" value="${Settings.voiceVol}"></label>
      <label class="row"><input type="checkbox" id="set-mute" ${Settings.voiceMute ? "checked" : ""}> បិទសំឡេងនិយាយ (Mute)</label>
      <label>🎵 ភ្លេង <input type="range" id="set-music" min="0" max="1" step="0.05" value="${Settings.musicVol}"></label>
      <label>💥 សំឡេងប្រយុទ្ធ <input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${Settings.sfxVol}"></label>
      <label>🖱 ល្បឿនបង្វិលកាមេរ៉ា <input type="range" id="set-sens" min="0.3" max="2.5" step="0.1" value="${Settings.sens}"></label>
      <label>🖥 គុណភាពក្រាហ្វិក <select id="set-q">${["auto:ស្វ័យប្រវត្តិ", "low:ទាប (ទូរសព្ទខ្សោយ)", "medium:មធ្យម", "high:ខ្ពស់"].map(s => { const [v, t] = s.split(":"); return `<option value="${v}" ${q === v ? "selected" : ""}>${t}</option>`; }).join("")}</select></label>
      <label class="row"><input type="checkbox" id="set-sub" ${Settings.subtitles ? "checked" : ""}> បង្ហាញអក្សរសន្ទនា</label>
      <p class="muted small">ឯកសារសំឡេងដែលមាន៖ ${kh(Voice.manifest.size)} ឃ្លា</p>`;
  },
  bindSettings(onQuality) {
    const bind = (id, fn) => { const e = $(id); if (e) e.oninput = e.onchange = () => { fn(e); saveSettings(); }; };
    bind("set-voice", e => { Settings.voiceVol = +e.value; if (Voice.audio) Voice.audio.volume = Settings.voiceVol; });
    bind("set-mute", e => { Settings.voiceMute = e.checked; if (e.checked) Voice.stop(true); });
    bind("set-music", e => { Settings.musicVol = +e.value; try { Sound.setVolumes({ music: Settings.musicVol }); } catch (x) {} });
    bind("set-sfx", e => { Settings.sfxVol = +e.value; try { Sound.setVolumes({ sfx: Settings.sfxVol }); } catch (x) {} });
    bind("set-sens", e => { Settings.sens = +e.value; });
    bind("set-q", e => onQuality && onQuality(e.value));
    bind("set-sub", e => { Settings.subtitles = e.checked; });
  }
};
