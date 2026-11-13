/* =============================================================
   ដំណើរផ្សងព្រេងនៃពួកជំនុំ — ម៉ាស៊ីនហ្គេម (Game Engine)
   ផ្នែក៖ ១.ជំនួយ ២.ការកំណត់ ៣.Save/Load ៤.UI ៥.សន្ទនា
         ៦.ផែនទីពិភពលោក ៧.ជំពូក/ការស្វែងរក ៨.ប្រស្នា ៩.ការប្រយុទ្ធ
         ១០.បញ្ចប់ជំពូក/ចុងបញ្ចប់ ១១.ម៉ឺនុយ ១២.ចាប់ផ្តើម
   ============================================================= */
"use strict";

/* ===================== ១. ជំនួយ ===================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = n => String(n).padStart(2, "0");
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shuffle(a, r = Math.random) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const seg = (typeof Intl !== "undefined" && Intl.Segmenter) ? new Intl.Segmenter("km", { granularity: "grapheme" }) : null;
const graphemes = s => seg ? [...seg.segment(s)].map(x => x.segment) : [...s];
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* ===================== ២. ការកំណត់ ===================== */
const DEFAULT_SETTINGS = { master: 0.9, music: 0.55, ambient: 0.6, sfx: 0.8, voice: 1, textSpeed: 2, voiceMode: "auto" };
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get("cha-settings") || {});
function applySettings() {
  Sound.setVolumes({ master: settings.master, music: settings.music, ambient: settings.ambient, sfx: settings.sfx, voice: settings.voice });
  Sound.setVoiceMode(settings.voiceMode);
  store.set("cha-settings", settings);
}

/* ===================== ៣. ស្ថានភាពហ្គេម និង Save/Load ===================== */
let S = null;   // ស្ថានភាពអ្នកលេង

function newState(name) {
  return {
    v: 1, name: name || "អ្នកធ្វើដំណើរ",
    level: 1, xp: 0, maxHp: 100, hp: 100, power: 18,
    score: 0, faith: 0, playTime: 0,
    unlocked: 1, chapters: {},        // {id:{done,stars,score}}
    cur: null,                        // វឌ្ឍនភាពក្នុងជំពូកដែលកំពុងលេង
    prologueSeen: false, finished: false, savedAt: 0
  };
}
function freshChapterProgress(id) {
  return { ch: id, px: 1, py: 6, scrolls: [], talked: [], choices: {}, puzzle: false, puzzleMistakes: 0,
           foes: [], boss: false, correct: 0, asked: 0, introSeen: false, score: 0 };
}
const SLOT_KEYS = ["cha-save-auto", "cha-save-1", "cha-save-2", "cha-save-3"];
const slotLabel = k => k === "cha-save-auto" ? "រក្សាទុកស្វ័យប្រវត្តិ" : "កន្លែងទី " + kh(k.slice(-1));

function saveTo(key) {
  if (!S) return false;
  if (G.mode === "explore" && S.cur) { S.cur.px = G.player.tx; S.cur.py = G.player.ty; }
  S.savedAt = Date.now();
  return store.set(key, S);
}
const autosave = () => saveTo("cha-save-auto");
function latestSave() {
  let best = null;
  SLOT_KEYS.forEach(k => { const d = store.get(k); if (d && d.v === 1 && (!best || d.savedAt > best.d.savedAt)) best = { k, d }; });
  return best;
}
function loadState(d) {
  S = Object.assign(newState(), d);
  S.hp = clamp(S.hp, 1, S.maxHp);
  if (S.cur) startChapter(S.cur.ch, true); else fadeTo(async () => openMap());
}
const encodeSave = d => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
const decodeSave = s => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));

/* ===================== ៤. UI ទូទៅ ===================== */
const G = { mode: "title", busy: false, keys: {}, t: 0 };

function show(id) {
  $$(".screen").forEach(s => s.classList.toggle("active", s.id === id));
}
async function fadeTo(fn) {
  $("#fade").classList.add("on"); await sleep(450);
  try { await Promise.race([fn(), sleep(1500)]); } catch (e) { console.error(e); }
  $("#fade").classList.remove("on"); await sleep(300);
}
function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), ms);
}
let modalResolve = null;
function modal(html, opts = {}) {
  $("#modal-box").innerHTML = html;
  $("#modal").classList.remove("hidden");
  return new Promise(res => {
    modalResolve = res;
    $$("#modal-box [data-m]").forEach(b => b.addEventListener("click", () => { Sound.sfx("select"); closeModal(b.dataset.m); }));
    if (opts.onOpen) opts.onOpen($("#modal-box"));
  });
}
function closeModal(v) {
  $("#modal").classList.add("hidden");
  const r = modalResolve; modalResolve = null; if (r) r(v);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nm = s => String(s).replace(/\{name\}/g, S ? S.name : "អ្នកធ្វើដំណើរ");

/* ===================== ៥. ប្រព័ន្ធសន្ទនា ===================== */
function speakerInfo(key, ch) {
  if (SPEAKERS[key]) return { name: nm(SPEAKERS[key].name), color: SPEAKERS[key].color, robe: key === "teacher" ? "#e8e2d0" : key === "player" ? "#3b6fb6" : null };
  if (key === "boss" && ch) return { name: ch.boss.name, color: "#ff8a7a", shadow: ch.boss.color };
  const npc = ch && ch.npcs.find(n => n.id === key);
  if (npc) return { name: npc.name, color: "#f2cf6b", robe: npc.robe };
  return { name: key, color: "#fff" };
}
function drawFace(cv, info, key) {
  const c = cv.getContext("2d"), w = cv.width;
  c.clearRect(0, 0, w, w);
  const g = c.createLinearGradient(0, 0, 0, w); g.addColorStop(0, "#3a2e1a"); g.addColorStop(1, "#1a140a");
  c.fillStyle = g; c.fillRect(0, 0, w, w);
  if (key === "narr") { c.font = "52px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("📖", w / 2, w / 2 + 4); return; }
  if (info.shadow) { drawShadowFoe(c, w / 2, w * 0.62, w * 0.42, info.shadow, G.t); return; }
  const sp = SPR[key];
  if (sp && sp.ok) { c.imageSmoothingEnabled = false; c.drawImage(sp.img, 14, 128 + 4, 36, 36, 0, 0, w, w); return; }
  drawPerson(c, w / 2, w * 0.98, w / 34, info.robe || "#777", key);
}
let dlgState = null;
function dialogue(lines, ch, prefix) {
  if (!lines || !lines.length) return Promise.resolve();
  return new Promise(resolve => {
    dlgState = { lines, ch, prefix, i: -1, typing: false, done: resolve };
    $("#dlg").classList.remove("hidden");
    $("#dlg-choices").innerHTML = "";
    nextLine();
  });
}
function nextLine() {
  const d = dlgState; if (!d) return;
  if (d.typing) { d.finish(); return; }
  d.i++;
  if (d.i >= d.lines.length) {
    $("#dlg").classList.add("hidden"); Sound.stopVoice();
    dlgState = null; d.done(); return;
  }
  const [key, raw] = d.lines[d.i];
  const info = speakerInfo(key, d.ch);
  const text = nm(raw);
  $("#dlg-name").textContent = info.name; $("#dlg-name").style.color = info.color;
  drawFace($("#dlg-face"), info, key);
  $("#dlg-next").style.visibility = "hidden";
  if (d.prefix) Sound.speak(d.prefix + "_" + pad2(d.i), text, key);
  else Sound.speak("", text, key);
  // អក្សរលេចឡើងម្តងមួយៗ (typewriter)
  const parts = graphemes(text), el = $("#dlg-text");
  const per = [0, 1, 2, 4][settings.textSpeed] || 2;
  let k = 0; d.typing = true;
  const finish = () => { clearInterval(d.timer); el.textContent = text; d.typing = false; $("#dlg-next").style.visibility = "visible"; };
  d.finish = finish;
  if (!per) { finish(); return; }
  el.textContent = "";
  d.timer = setInterval(() => {
    k += per; el.textContent = parts.slice(0, k).join("");
    if (k % 6 === 0) Sound.sfx("talk");
    if (k >= parts.length) finish();
  }, 28);
}
$("#dlg").addEventListener("click", e => { if (e.target.closest(".dlg-choices")) return; if (!$("#dlg-choices").children.length) nextLine(); });

function choose(prompt, options, ch) {
  return new Promise(resolve => {
    $("#dlg").classList.remove("hidden");
    const info = speakerInfo("player", ch);
    $("#dlg-name").textContent = info.name; $("#dlg-name").style.color = info.color;
    drawFace($("#dlg-face"), info, "player");
    $("#dlg-text").textContent = nm(prompt);
    $("#dlg-next").style.visibility = "hidden";
    const box = $("#dlg-choices"); box.innerHTML = "";
    options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "btn"; b.textContent = (i + 1) + ". " + nm(o.text);
      b.onclick = () => { Sound.sfx("select"); box.innerHTML = ""; $("#dlg").classList.add("hidden"); resolve(i); };
      box.appendChild(b);
    });
  });
}


/* ===================== រូប Sprite តួអង្គ (LPC) ===================== */
// រូបភាពនីមួយៗផ្ទុកដោយ Image()។ បើផ្ទុកមិនបាន វាសាកពី URL សាធារណៈទីពីរ (GitHub)
// ហើយបើនៅតែមិនបានទៀត ហ្គេមនឹងគូរតួអង្គដោយកូដ (vector) ជំនួស។
const SPRITE_SOURCES = [
  id => "assets/sprites/" + id + ".png?v=3",
  id => "https://raw.githubusercontent.com/vannda-yoeurn/church-adventure/main/assets/sprites/" + id + ".png",
  id => "https://cdn.jsdelivr.net/gh/vannda-yoeurn/church-adventure@main/assets/sprites/" + id + ".png"
];
const SPR = {};
function loadSprite(id, k = 0) {
  if (k >= SPRITE_SOURCES.length) { SPR[id] = { ok: false }; return; }
  const img = new Image();
  img.onload = () => { SPR[id] = { ok: true, img }; };
  img.onerror = () => loadSprite(id, k + 1);
  img.src = SPRITE_SOURCES[k](id);
}
["player", "teacher"].concat(CHAPTERS.flatMap(c => c.npcs.map(n => n.id))).forEach(id => loadSprite(id));
const SPR_ROW = { up: 0, left: 1, down: 2, right: 3 };
function drawSprite(c, x, y, s, key, opt) {
  const sp = SPR[key]; if (!sp || !sp.ok) return false;
  const sc = s * 0.9, row = SPR_ROW[opt.dir || "down"], col = opt.walk ? 1 + Math.floor(G.t * 11) % 8 : 0;
  c.save();
  c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(x, y - 2 * s, 11 * s, 3.4 * s, 0, 0, Math.PI * 2); c.fill();
  c.imageSmoothingEnabled = false;
  c.drawImage(sp.img, col * 64, row * 64, 64, 64, x - 32 * sc, y - 62 * sc, 64 * sc, 64 * sc);
  if (key === "player" && opt.dir !== "up") {
    const lx = x + (opt.dir === "left" ? -12 : 12) * s, ly = y - 24 * s;
    const gl = c.createRadialGradient(lx, ly, 0, lx, ly, 14 * s);
    gl.addColorStop(0, "rgba(255,210,120,.85)"); gl.addColorStop(1, "rgba(255,180,60,0)");
    c.fillStyle = gl; c.beginPath(); c.arc(lx, ly, 14 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#b8861f"; c.fillRect(lx - 3 * s, ly, 6 * s, 3 * s);
    c.fillStyle = "#ffe08a"; c.beginPath(); c.ellipse(lx, ly - 2 * s, 1.8 * s, 3.2 * s, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  return true;
}
/* ===================== គំនូរតួអង្គ ===================== */
const ELDERS = new Set(["peter", "polycarp", "irenaeus", "athanasius", "monk", "wycliffe", "hus", "luther", "luther2", "calvin", "tyndale", "elder", "farmer", "carey", "anselm", "patrick", "francis", "teacher"]);
function drawPerson(c, x, y, s, robe, key, opt = {}) {
  if (drawSprite(c, x, y, s, key, opt)) return;
  c.save();
  // ស្រមោលនៅជើង
  c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(x, y - s, 8 * s, 2.6 * s, 0, 0, Math.PI * 2); c.fill();
  const bob = opt.walk ? Math.sin(G.t * 14) * 0.8 * s : 0;
  // អាវវែង (robe)
  c.fillStyle = robe;
  c.beginPath();
  c.moveTo(x - 5 * s, y - 24 * s + bob); c.lineTo(x + 5 * s, y - 24 * s + bob);
  c.lineTo(x + 8 * s, y - 2 * s); c.lineTo(x - 8 * s, y - 2 * s); c.closePath(); c.fill();
  c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(x - 0.6 * s, y - 22 * s + bob, 1.2 * s, 20 * s);
  // ខ្សែក្រវាត់មាស
  c.fillStyle = "#d4a537"; c.fillRect(x - 6 * s, y - 14 * s + bob, 12 * s, 1.6 * s);
  // ដៃ
  c.fillStyle = robe; c.beginPath(); c.ellipse(x - 6.5 * s, y - 17 * s + bob, 2 * s, 5 * s, 0.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x + 6.5 * s, y - 17 * s + bob, 2 * s, 5 * s, -0.3, 0, Math.PI * 2); c.fill();
  // ក្បាល
  c.fillStyle = "#c48a5a"; c.beginPath(); c.arc(x, y - 29 * s + bob, 5.4 * s, 0, Math.PI * 2); c.fill();
  // សក់
  const hair = key === "teacher" || key === "elder" ? "#e8e8e8" : ELDERS.has(key) ? "#5a4a3a" : "#1a1410";
  c.fillStyle = hair; c.beginPath(); c.arc(x, y - 30.5 * s + bob, 5.6 * s, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  if (ELDERS.has(key) && key !== "teacher" && key !== "farmer") {
    c.fillStyle = key === "elder" ? "#e8e8e8" : "#6a5a4a";
    c.beginPath(); c.moveTo(x - 4 * s, y - 27 * s + bob); c.quadraticCurveTo(x, y - 19 * s + bob, x + 4 * s, y - 27 * s + bob); c.fill();
  }
  // ភ្នែក
  c.fillStyle = "#1a1008";
  c.fillRect(x - 2.4 * s, y - 29.5 * s + bob, 1.2 * s, 1.2 * s); c.fillRect(x + 1.2 * s, y - 29.5 * s + bob, 1.2 * s, 1.2 * s);
  // ចង្កៀងរបស់អ្នកលេង
  if (key === "player") {
    const lx = x + 8.5 * s, ly = y - 14 * s + bob;
    const gl = c.createRadialGradient(lx, ly, 0, lx, ly, 10 * s);
    gl.addColorStop(0, "rgba(255,210,120,.85)"); gl.addColorStop(1, "rgba(255,180,60,0)");
    c.fillStyle = gl; c.beginPath(); c.arc(lx, ly, 10 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#b8861f"; c.fillRect(lx - 2 * s, ly, 4 * s, 2 * s);
    c.fillStyle = "#ffe08a"; c.beginPath(); c.ellipse(lx, ly - 1.4 * s, 1.2 * s, 2.2 * s, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
function drawShadowFoe(c, x, y, r, color, t, boss) {
  c.save();
  const by = y + Math.sin(t * 3) * r * 0.08;
  const g = c.createRadialGradient(x, by - r * 0.3, r * 0.1, x, by, r);
  g.addColorStop(0, color); g.addColorStop(0.7, "rgba(10,5,15,.85)"); g.addColorStop(1, "rgba(10,5,15,0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - r * 0.7, by);
  c.quadraticCurveTo(x - r * 0.8, by - r * 1.2, x, by - r * 1.15);
  c.quadraticCurveTo(x + r * 0.8, by - r * 1.2, x + r * 0.7, by);
  for (let i = 0; i <= 4; i++) {
    const px = x + r * 0.7 - (i / 4) * r * 1.4;
    c.quadraticCurveTo(px + r * 0.15, by + r * 0.35 + Math.sin(t * 5 + i) * r * 0.1, px, by + (i % 2 ? 0 : r * 0.12));
  }
  c.fill();
  // ភ្នែក
  const eye = boss ? "#ff4a3a" : "#ffd24a";
  c.shadowColor = eye; c.shadowBlur = r * 0.3; c.fillStyle = eye;
  c.beginPath(); c.ellipse(x - r * 0.22, by - r * 0.62, r * 0.09, r * 0.05, 0.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x + r * 0.22, by - r * 0.62, r * 0.09, r * 0.05, -0.3, 0, Math.PI * 2); c.fill();
  if (boss) { // មកុដងងឹត
    c.shadowBlur = 0; c.fillStyle = "rgba(60,20,20,.9)";
    c.beginPath(); c.moveTo(x - r * 0.35, by - r * 1.05);
    [-0.35, -0.2, 0, 0.2, 0.35].forEach((k, i) => c.lineTo(x + k * r, by - r * (i % 2 ? 1.1 : 1.35)));
    c.lineTo(x + r * 0.35, by - r * 1.05); c.fill();
  }
  c.restore();
}

/* ===================== ៦. ផែនទីពិភពលោក ===================== */
const NODE_POS = [[90, 460], [175, 380], [105, 285], [215, 185], [330, 115], [410, 215], [330, 320],
                  [450, 430], [575, 465], [635, 360], [560, 255], [670, 150], [790, 105], [870, 245], [900, 420]];
const PART_STYLE = [
  { fill: "#c79b5a", cx: 130, cy: 380, rx: 125, ry: 150, lx: 40, ly: 545 },
  { fill: "#6a6a7a", cx: 315, cy: 215, rx: 150, ry: 150, lx: 230, ly: 40 },
  { fill: "#5a8a5a", cx: 570, cy: 355, rx: 170, ry: 170, lx: 460, ly: 545 },
  { fill: "#5a7aaa", cx: 790, cy: 110, rx: 95, ry: 80, lx: 985, ly: 32, end: 1 },
  { fill: "#b9763a", cx: 890, cy: 335, rx: 95, ry: 160, lx: 985, ly: 545, end: 1 }
];
let mapSel = null;
function openMap() {
  G.mode = "map"; G.busy = false;
  Sound.playMusic("map"); Sound.setAmbient(["birds", "wind"]);
  show("scr-map");
  renderMap();
  selectNode(mapSel || clamp(S.unlocked, 1, 15));
}
function renderMap() {
  const svg = $("#world");
  let h = `<defs>
    <radialGradient id="parch" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#f3e3bb"/><stop offset="1" stop-color="#c9a96b"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect x="0" y="0" width="1000" height="560" rx="18" fill="url(#parch)"/>
  <rect x="8" y="8" width="984" height="544" rx="14" fill="none" stroke="#8a6a20" stroke-width="3" stroke-dasharray="2 6"/>`;
  PART_STYLE.forEach((p, i) => {
    h += `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${p.fill}" opacity=".35" filter="url(#soft)"/>`;
    h += `<text x="${p.lx}" y="${p.ly}" font-size="14"${p.end ? ' text-anchor="end"' : ""} fill="#5a3a10" font-weight="700">${PARTS[i].title} · ${PARTS[i].sub}</text>`;
  });
  // ផ្លូវ
  let d = `M ${NODE_POS[0][0]} ${NODE_POS[0][1]}`;
  for (let i = 1; i < NODE_POS.length; i++) {
    const [x0, y0] = NODE_POS[i - 1], [x1, y1] = NODE_POS[i];
    d += ` Q ${(x0 + x1) / 2 + (i % 2 ? 30 : -30)} ${(y0 + y1) / 2 + (i % 2 ? -20 : 20)} ${x1} ${y1}`;
  }
  h += `<path d="${d}" fill="none" stroke="#7a5a20" stroke-width="5" stroke-dasharray="10 8" stroke-linecap="round"/>`;
  // ស្លាកក្រុង
  h += `<text x="40" y="510" font-size="12" fill="#5a3a10">យេរូសាឡឹម</text><text x="905" y="470" font-size="13" fill="#7a1f1f" font-weight="700">កម្ពុជា</text>`;
  CHAPTERS.forEach((ch, i) => {
    const [x, y] = NODE_POS[i], st = S.chapters[ch.id] || {}, open = ch.id <= S.unlocked;
    const fill = st.done ? "#d4a537" : open ? "#7a1f1f" : "#7a7266";
    h += `<g class="node" data-ch="${ch.id}">
      ${open && !st.done ? `<circle cx="${x}" cy="${y}" r="27" fill="none" stroke="#f2cf6b" stroke-width="3" opacity=".8"><animate attributeName="r" values="24;31;24" dur="2s" repeatCount="indefinite"/></circle>` : ""}
      <circle class="ring" cx="${x}" cy="${y}" r="22" fill="${fill}" stroke="#2b1a05" stroke-width="3"/>
      <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${st.done ? "#2b1a05" : "#fff"}">${open ? kh(ch.id) : "🔒"}</text>
      ${st.done ? `<text x="${x}" y="${y + 40}" text-anchor="middle" font-size="13">${"⭐".repeat(st.stars || 1)}</text>` : ""}
      ${S.cur && S.cur.ch === ch.id ? `<text x="${x + 18}" y="${y - 16}" font-size="18">🪔</text>` : ""}
    </g>`;
  });
  svg.innerHTML = h;
  svg.querySelectorAll(".node").forEach(n => n.addEventListener("click", () => { Sound.sfx("select"); selectNode(+n.dataset.ch); }));
  const done = Object.values(S.chapters).filter(c => c.done).length;
  $("#map-stats").textContent = `${S.name} · Lv ${kh(S.level)} · ⭐ ${kh(S.score)} · 🕯️ ${kh(S.faith)} · បានបញ្ចប់ ${kh(done)}/១៥`;
}
function selectNode(id) {
  mapSel = id;
  const ch = CHAPTERS[id - 1], st = S.chapters[id] || {}, open = id <= S.unlocked, part = PARTS[ch.part - 1];
  const resume = S.cur && S.cur.ch === id;
  $("#map-panel").innerHTML = `<div class="info">
      <div class="meta">${part.title} · ${part.sub}</div>
      <h3>ជំពូកទី ${kh(id)}៖ ${esc(ch.title)}</h3>
      <div class="meta">📍 ${esc(ch.place)} · ${esc(ch.years)} ${st.done ? " · " + "⭐".repeat(st.stars) + " · ពិន្ទុ " + kh(st.score) : ""}</div>
    </div>
    ${open ? `<button class="btn gold" id="go-ch">${resume ? "បន្តជំពូកនេះ ▶" : st.done ? "លេងម្តងទៀត ↻" : "ចូលលេង ▶"}</button>` : `<div class="meta">🔒 សូមបញ្ចប់ជំពូកមុនសិន</div>`}`;
  if (open) $("#go-ch").onclick = async () => {
    Sound.sfx("select");
    if (S.cur && S.cur.ch !== id) {
      const ok = await modal(`<h2>ចាប់ផ្តើមជំពូកថ្មី?</h2><p>អ្នកកំពុងលេងជំពូកទី ${kh(S.cur.ch)} មិនទាន់ចប់។ បើចូលជំពូកនេះ វឌ្ឍនភាពក្នុងជំពូកនោះនឹងត្រូវចាប់ផ្តើមឡើងវិញ។</p>
        <div class="row"><button class="btn gold" data-m="yes">យល់ព្រម</button><button class="btn" data-m="no">ទេ</button></div>`);
      if (ok !== "yes") return;
      S.cur = null;
    }
    startChapter(id, resume);
  };
}
$("#map-menu").onclick = () => { Sound.sfx("select"); pauseMenu(); };

/* ===================== ៧. ជំពូក៖ ផែនទី ការស្វែងរក ===================== */
const COLS = 24, ROWS = 13, TS = 40;
const cv = $("#cv"), cx = cv.getContext("2d");
const TER = {
  desert:    { g: ["#d8b679", "#cfab6c"], path: "#bf9f6f", border: "rock",      deco: [["rock", .05], ["palm", .03], ["house", .025]] },
  library:   { g: ["#d9d1c1", "#cdc4b1"], path: "#b8ad96", border: "wall",      deco: [["shelf", .07], ["column", .03]], water: "pool" },
  city:      { g: ["#b9ae9e", "#aca18f"], path: "#978c79", border: "wall",      deco: [["house", .06], ["column", .03], ["tree", .02]] },
  dark:      { g: ["#3b3a46", "#34333f"], path: "#4c4958", border: "wall",      deco: [["deadtree", .05], ["ruin", .04]], dark: .8 },
  forest:    { g: ["#5d9447", "#558a40"], path: "#9a8358", border: "tree",      deco: [["tree", .12], ["rock", .02], ["flower", .03]], water: "stream" },
  monastery: { g: ["#6aa152", "#62984b"], path: "#b5aa95", border: "wall",      deco: [["hedge", .05], ["house", .03], ["tree", .03], ["flower", .03]] },
  town:      { g: ["#a99d8b", "#9f927f"], path: "#8a7f6d", border: "house",     deco: [["house", .07], ["tree", .03]] },
  lake:      { g: ["#6aa65a", "#61994f"], path: "#a9946a", border: "tree",      deco: [["tree", .06], ["rock", .02], ["flower", .04]], water: "lake" },
  coast:     { g: ["#dcc58f", "#d3bb84"], path: "#bba57a", border: "rock",      deco: [["rock", .04], ["palm", .04]], water: "sea" },
  war:       { g: ["#6e5c45", "#655340"], path: "#7d6b52", border: "ruin",      deco: [["ruin", .05], ["deadtree", .04], ["crater", .05]], dark: .35 },
  field:     { g: ["#79b05c", "#70a554"], path: "#b39d6e", border: "tree",      deco: [["tree", .04], ["flower", .09], ["fence", .03]] },
  jungle:    { g: ["#3f7f3a", "#387333"], path: "#8a7550", border: "bigtree",   deco: [["bigtree", .1], ["palm", .05], ["flower", .03]], water: "stream" },
  cambodia:  { g: ["#7dbb4f", "#74b048"], path: "#b99d68", border: "sugarpalm", deco: [["sugarpalm", .05], ["paddy", .2], ["stilthouse", .025]], water: "river" }
};
const WALKABLE = new Set(["floor", "path", "bridge", "flower", "paddy", "crater"]);

function buildMap(ch) {
  const ter = TER[ch.terrain], r = rng(ch.id * 7919 + 13);
  const T = [];
  for (let y = 0; y < ROWS; y++) { T.push([]); for (let x = 0; x < COLS; x++) T[y].push({ t: "floor", v: r() }); }
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) T[y][x].t = t; };
  // ទឹក
  if (ter.water === "pool") for (let y = 2; y <= 3; y++) for (let x = 10; x <= 13; x++) set(x, y, "water");
  if (ter.water === "stream") { let x = 11; for (let y = 0; y < ROWS; y++) { set(x, y, "water"); set(x + 1, y, "water"); if (r() < .3) x += r() < .5 ? -1 : 1; x = clamp(x, 9, 13); } }
  if (ter.water === "lake") for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (((x - 14) / 4.5) ** 2 + ((y - 9.5) / 2.6) ** 2 < 1) set(x, y, "water");
  if (ter.water === "sea") for (let y = 10; y < ROWS; y++) for (let x = 0; x < COLS; x++) set(x, y, "water");
  if (ter.water === "river") { for (let x = 0; x < COLS; x++) { set(x, 10, "water"); set(x, 11, "water"); } [6, 17].forEach(bx => { set(bx, 10, "bridge"); set(bx, 11, "bridge"); }); }
  // ការតុបតែង
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (T[y][x].t !== "floor" || (x < 3 && Math.abs(y - 6) < 2)) continue;
    let acc = 0; const p = r();
    for (const [t, d] of ter.deco) { acc += d; if (p < acc) { T[y][x].t = t; break; } }
  }
  // ព្រំដែន
  for (let x = 0; x < COLS; x++) { if (T[0][x].t !== "water") set(x, 0, ter.border); if (T[ROWS - 1][x].t !== "water") set(x, ROWS - 1, ter.border); }
  for (let y = 0; y < ROWS; y++) { set(0, y, ter.border); set(COLS - 1, y, ter.border); }
  // ផ្លូវដើរសំខាន់ (ធានាថាអាចទៅដល់ទ្វារ)
  let px = 1, py = 6;
  const path = [];
  while (px < COLS - 1) {
    path.push([px, py]);
    if (px > 2 && px < COLS - 4 && r() < .32) { const ny = clamp(py + (r() < .5 ? -1 : 1), 3, 8); if (ny !== py) { py = ny; path.push([px, py]); } }
    if (px >= COLS - 4 && py !== 6) { py += py < 6 ? 1 : -1; path.push([px, py]); continue; }
    px++;
  }
  path.forEach(([x, y]) => { T[y][x].t = T[y][x].t === "water" ? "bridge" : "path"; });
  set(COLS - 1, 6, "gate");
  return { T, ter, path };
}
const tileWalk = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && WALKABLE.has(G.map.T[y][x].t);

function bfsFrom(sx, sy, blocked) {
  const dist = {}, q = [[sx, sy]]; dist[sx + "," + sy] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (dist[k] !== undefined || !tileWalk(nx, ny) || (blocked && blocked(nx, ny))) continue;
      dist[k] = dist[x + "," + y] + 1; q.push([nx, ny]);
    }
  }
  return dist;
}
function placeEntities(ch) {
  const r = rng(ch.id * 104729 + 5), M = G.map;
  const reach = bfsFrom(1, 6);
  const onPath = new Set(M.path.map(([x, y]) => x + "," + y));
  const used = new Set(["1,6", (COLS - 2) + ",6"]);
  const free = (x, y) => reach[x + "," + y] !== undefined && !used.has(x + "," + y);
  const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => onPath.has((x + dx) + "," + (y + dy)));
  const farFromUsed = (x, y, d) => [...used].every(k => { const [ux, uy] = k.split(",").map(Number); return Math.abs(ux - x) + Math.abs(uy - y) >= d; });
  function pick(x0, x1, test) {
    const c = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = x0; x <= x1; x++) if (free(x, y) && test(x, y)) c.push([x, y]);
    if (!c.length) return null;
    const p = c[Math.floor(r() * c.length)]; used.add(p[0] + "," + p[1]); return p;
  }
  const solidSpot = (x0, x1) => pick(x0, x1, (x, y) => !onPath.has(x + "," + y) && near(x, y) && farFromUsed(x, y, 3))
                             || pick(x0, x1, (x, y) => !onPath.has(x + "," + y) && near(x, y))
                             || pick(2, COLS - 3, (x, y) => !onPath.has(x + "," + y) && near(x, y));
  const ents = [];
  ch.npcs.forEach((n, i) => { const p = solidSpot(i === 0 ? 4 : 10, i === 0 ? 8 : 15); if (p) ents.push({ kind: "npc", tx: p[0], ty: p[1], npc: n, solid: true }); });
  const ap = solidSpot(17, 20); if (ap) ents.push({ kind: "altar", tx: ap[0], ty: ap[1], solid: true });
  ents.push({ kind: "gate", tx: COLS - 1, ty: 6, solid: true });
  [[3, 9], [9, 15], [13, 21]].forEach(([a, b], i) => {
    const p = pick(a, b, (x, y) => farFromUsed(x, y, 3) && !onPath.has(x + "," + y)) || pick(a, b, () => true);
    if (p) ents.push({ kind: "scroll", tx: p[0], ty: p[1], idx: i });
  });
  const foeN = ch.id >= 8 ? 3 : 2;
  [[6, 10], [12, 16], [16, 20]].slice(0, foeN).forEach(([a, b], i) => {
    const p = pick(a, b, (x, y) => farFromUsed(x, y, 2)); if (p) ents.push({ kind: "foe", tx: p[0], ty: p[1], idx: i, cd: 1 + r() * 2 });
  });
  ents.forEach(e => { e.x = e.tx * TS; e.y = e.ty * TS; e.fx = e.x; e.fy = e.y; e.prog = 1; });
  return ents;
}

/* ---------- ចាប់ផ្តើមជំពូក ---------- */
let CH = null;
async function startChapter(id, resume) {
  await fadeTo(async () => {
    CH = CHAPTERS[id - 1];
    if (!resume || !S.cur || S.cur.ch !== id) S.cur = freshChapterProgress(id);
    G.map = buildMap(CH);
    G.ents = placeEntities(CH).filter(e =>
      !(e.kind === "scroll" && S.cur.scrolls.includes(e.idx)) && !(e.kind === "foe" && S.cur.foes.includes(e.idx)));
    G.player = { tx: S.cur.px, ty: S.cur.py, x: S.cur.px * TS, y: S.cur.py * TS, fx: 0, fy: 0, prog: 1, dir: "right", path: [], pending: null, inv: 0 };
    if (!tileWalk(G.player.tx, G.player.ty)) Object.assign(G.player, { tx: 1, ty: 6, x: TS, y: 6 * TS });
    prerenderTiles();
    G.mode = "explore"; G.busy = false;
    show("scr-game"); updateHud();
    Sound.playMusic(CH.mood); Sound.setAmbient(CH.ambient);
  });
  if (!S.cur.introSeen) {
    G.busy = true;
    await dialogue(chapterIntro(CH), CH, "c" + pad2(CH.id) + "_intro");
    S.cur.introSeen = true; G.busy = false; autosave();
  }
}

/* ---------- HUD ---------- */
const xpNeed = lv => 100 + (lv - 1) * 60;
function updateHud() {
  if (!S) return;
  $("#hud-ch").textContent = CH ? `ជំពូកទី ${kh(CH.id)}៖ ${CH.title}` : "";
  $("#hud-hp").style.width = (S.hp / S.maxHp * 100) + "%";
  $("#hud-hpn").textContent = kh(S.hp) + "/" + kh(S.maxHp);
  $("#hud-lv").textContent = "Lv " + kh(S.level);
  $("#hud-xp").style.width = (S.xp / xpNeed(S.level) * 100) + "%";
  $("#hud-sc").textContent = S.cur ? kh(S.cur.scrolls.length) + "/៣" : "-";
  $("#hud-faith").textContent = kh(S.faith);
  $("#hud-score").textContent = kh(S.score);
  const q = $("#quest");
  if (!S.cur || !CH) { q.textContent = ""; return; }
  const c = S.cur;
  q.textContent = c.scrolls.length < 3 ? `📜 ស្វែងរកក្រាំង (${kh(c.scrolls.length)}/៣)` :
                  !c.puzzle ? "🪨 ទៅដោះប្រស្នានៅផ្ទាំងថ្មដែលភ្លឺ" :
                  !c.boss ? "🚪 ទ្វារបើកហើយ! ទៅប្រឈមមុខនឹង " + CH.boss.name : "";
}
function gainXp(n, score) {
  S.xp += n; S.score += score || 0; if (S.cur) S.cur.score += score || 0;
  let up = false;
  while (S.xp >= xpNeed(S.level)) { S.xp -= xpNeed(S.level); S.level++; S.maxHp += 12; S.power += 3; S.hp = S.maxHp; up = true; }
  if (up) { Sound.sfx("levelup"); toast("🎉 ឡើងកម្រិត! Lv " + kh(S.level) + " · ជំនឿ +១២ · កម្លាំង +៣"); }
  updateHud();
}

/* ---------- ការបញ្ជា ---------- */
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
window.addEventListener("keydown", e => {
  Sound.init();
  if (dlgState && ["Space", "Enter", "KeyE"].includes(e.code)) { e.preventDefault(); if (!$("#dlg-choices").children.length) nextLine(); return; }
  if ($("#dlg-choices").children.length && /^Digit[1-4]$/.test(e.code)) { const b = $("#dlg-choices").children[+e.code.slice(5) - 1]; if (b) b.click(); return; }
  if (G.mode === "battle") { battleKey(e); return; }
  if (e.code === "Escape") { if (!$("#modal").classList.contains("hidden")) { closeModal(null); return; } if (G.mode === "explore" && !G.busy) pauseMenu(); return; }
  if (KEYMAP[e.code]) { G.keys[KEYMAP[e.code]] = true; G.player && (G.player.path = []); e.preventDefault(); }
  if (["Space", "Enter", "KeyE"].includes(e.code) && G.mode === "explore" && !G.busy) { e.preventDefault(); interactFacing(); }
});
window.addEventListener("keyup", e => { if (KEYMAP[e.code]) G.keys[KEYMAP[e.code]] = false; });
$$(".dpad button").forEach(b => {
  const d = b.dataset.d;
  const on = e => { e.preventDefault(); Sound.init(); G.keys[d] = true; if (G.player) G.player.path = []; };
  const off = e => { e.preventDefault(); G.keys[d] = false; };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
});
$("#btn-a").addEventListener("click", () => { if (dlgState) { nextLine(); return; } if (G.mode === "explore" && !G.busy) interactFacing(); });
$("#hud-menu").onclick = () => { Sound.sfx("select"); if (!G.busy) pauseMenu(); };
cv.addEventListener("pointerdown", e => {
  Sound.init();
  if (G.mode !== "explore" || G.busy) return;
  const rc = cv.getBoundingClientRect();
  const tx = Math.floor((e.clientX - rc.left) / rc.width * COLS), ty = Math.floor((e.clientY - rc.top) / rc.height * ROWS);
  const ent = G.ents.find(n => n.solid && n.tx === tx && n.ty === ty);
  const P = G.player;
  if (ent) {
    if (Math.abs(ent.tx - P.tx) + Math.abs(ent.ty - P.ty) === 1 && P.prog >= 1) { faceTo(ent); interact(ent); return; }
    const goal = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [ent.tx + dx, ent.ty + dy]).filter(([x, y]) => walkFree(x, y));
    const p = findPath(goal); if (p) { P.path = p; P.pending = ent; }
  } else if (walkFree(tx, ty)) { const p = findPath([[tx, ty]]); if (p) { P.path = p; P.pending = null; } }
});
const solidAt = (x, y) => G.ents.find(n => n.solid && n.tx === x && n.ty === y);
const walkFree = (x, y) => tileWalk(x, y) && !solidAt(x, y);
function findPath(goals) {
  const P = G.player, start = P.tx + "," + P.ty, prev = { [start]: null }, q = [[P.tx, P.ty]];
  const gs = new Set(goals.map(g => g.join(",")));
  while (q.length) {
    const [x, y] = q.shift(), k = x + "," + y;
    if (gs.has(k)) { const out = []; let c = k; while (c !== start) { out.unshift(c.split(",").map(Number)); c = prev[c]; } return out; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = nx + "," + ny;
      if (prev[nk] !== undefined || !walkFree(nx, ny)) continue;
      prev[nk] = k; q.push([nx, ny]);
    }
  }
  return null;
}
function faceTo(ent) {
  const P = G.player, dx = ent.tx - P.tx, dy = ent.ty - P.ty;
  P.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
function interactFacing() {
  const P = G.player; if (P.prog < 1) return;
  const [dx, dy] = DIRS[P.dir];
  let ent = solidAt(P.tx + dx, P.ty + dy);
  if (!ent) ent = G.ents.find(n => n.solid && Math.abs(n.tx - P.tx) + Math.abs(n.ty - P.ty) === 1);
  if (ent) { faceTo(ent); interact(ent); }
}

/* ---------- ចលនា ---------- */
function stepPlayer(dx, dy) {
  const P = G.player, nx = P.tx + dx, ny = P.ty + dy;
  P.dir = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
  const foe = G.ents.find(n => n.kind === "foe" && n.tx === nx && n.ty === ny);
  if (foe && P.inv <= 0) { startBattle(foe, false); return; }
  if (!walkFree(nx, ny)) return false;
  P.fx = P.tx * TS; P.fy = P.ty * TS; P.tx = nx; P.ty = ny; P.prog = 0;
  return true;
}
function onArrive() {
  const P = G.player;
  const sc = G.ents.find(n => n.kind === "scroll" && n.tx === P.tx && n.ty === P.ty);
  if (sc) { P.path = []; pickScroll(sc); return; }
  if (!P.path.length && P.pending) { const e = P.pending; P.pending = null; faceTo(e); interact(e); }
}
function update(dt) {
  G.t += dt;
  if (S && G.mode !== "title") S.playTime += dt;
  if (G.mode !== "explore") return;
  const P = G.player;
  if (P.inv > 0) P.inv -= dt;
  // ស្រមោលដើរ
  G.ents.forEach(f => {
    if (f.kind !== "foe") return;
    if (f.prog < 1) { f.prog = Math.min(1, f.prog + dt * 2.2); f.x = f.fx + (f.tx * TS - f.fx) * f.prog; f.y = f.fy + (f.ty * TS - f.fy) * f.prog; return; }
    if (G.busy) return;
    f.cd -= dt; if (f.cd > 0) return;
    f.cd = 0.8 + Math.random() * 1.4;
    const dist = Math.abs(f.tx - P.tx) + Math.abs(f.ty - P.ty);
    let opts = Object.values(DIRS);
    if (dist <= 4 && Math.random() < .6) opts = opts.filter(([dx, dy]) => Math.abs(f.tx + dx - P.tx) + Math.abs(f.ty + dy - P.ty) < dist);
    const [dx, dy] = opts[Math.floor(Math.random() * opts.length)] || [0, 0];
    const nx = f.tx + dx, ny = f.ty + dy;
    if (nx === P.tx && ny === P.ty && P.inv <= 0) { startBattle(f, false); return; }
    if (walkFree(nx, ny) && nx > 2 && !G.ents.some(o => o !== f && o.tx === nx && o.ty === ny)) { f.fx = f.x; f.fy = f.y; f.tx = nx; f.ty = ny; f.prog = 0; }
  });
  if (G.busy || G.mode !== "explore") return;
  if (P.prog < 1) {
    P.prog = Math.min(1, P.prog + dt * 5);
    P.x = P.fx + (P.tx * TS - P.fx) * P.prog; P.y = P.fy + (P.ty * TS - P.fy) * P.prog;
    if (P.prog >= 1) onArrive();
    return;
  }
  if (P.path.length) { const [x, y] = P.path.shift(); if (stepPlayer(x - P.tx, y - P.ty) === false) P.path = []; return; }
  for (const d of ["up", "down", "left", "right"]) if (G.keys[d]) { stepPlayer(...DIRS[d]); break; }
}

/* ---------- គំនូរផែនទី ---------- */
const bgCv = document.createElement("canvas"); bgCv.width = COLS * TS; bgCv.height = ROWS * TS;
const darkCv = document.createElement("canvas"); darkCv.width = COLS * TS; darkCv.height = ROWS * TS;
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => clamp(Math.round(v * f), 0, 255);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function drawGround(c, X, Y, ter, v) {
  c.fillStyle = ter.g[v < .5 ? 0 : 1]; c.fillRect(X, Y, TS, TS);
  c.fillStyle = "rgba(0,0,0,.06)";
  for (let i = 0; i < 3; i++) c.fillRect(X + ((v * 97 + i * 13) % 34) + 2, Y + ((v * 53 + i * 17) % 34) + 2, 2, 2);
}
function drawTile(c, x, y, tile, ter, chId) {
  const X = x * TS, Y = y * TS, v = tile.v, t = tile.t;
  if (t === "water" || t === "bridge") { c.fillStyle = "#2f6f9f"; c.fillRect(X, Y, TS, TS); }
  else drawGround(c, X, Y, ter, v);
  const C = X + TS / 2;
  switch (t) {
    case "path":
      c.fillStyle = ter.path; c.fillRect(X, Y, TS, TS);
      c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.ellipse(X + 12, Y + 14, 7, 4, 0, 0, 7); c.ellipse(X + 28, Y + 28, 8, 4, 0, 0, 7); c.fill();
      break;
    case "bridge":
      c.fillStyle = "#8a5a2a"; c.fillRect(X, Y + 2, TS, TS - 4);
      c.fillStyle = "#6a4420"; for (let i = 0; i < 5; i++) c.fillRect(X + i * 8, Y + 2, 1.5, TS - 4);
      break;
    case "rock":
      c.fillStyle = "#8a8072"; c.beginPath(); c.ellipse(C, Y + 26, 15, 11, 0, 0, 7); c.fill();
      c.fillStyle = "#a59b8b"; c.beginPath(); c.ellipse(C - 3, Y + 22, 9, 6, 0, 0, 7); c.fill(); break;
    case "palm":
      c.strokeStyle = "#7a5530"; c.lineWidth = 4; c.beginPath(); c.moveTo(C, Y + 38); c.quadraticCurveTo(C + 4, Y + 20, C, Y + 8); c.stroke();
      c.strokeStyle = "#3f8a3a"; c.lineWidth = 4;
      for (let a = 0; a < 6; a++) { const an = a / 6 * Math.PI * 2; c.beginPath(); c.moveTo(C, Y + 8); c.quadraticCurveTo(C + Math.cos(an) * 10, Y + 2, C + Math.cos(an) * 17, Y + 10 + Math.sin(an) * 6); c.stroke(); }
      break;
    case "house": {
      const roof = chId <= 3 || chId === 6 ? "#c9b48a" : chId === 9 || chId === 12 ? "#7a3a2a" : "#a04a3a";
      c.fillStyle = "#e6dcc6"; c.fillRect(X + 4, Y + 14, 32, 24);
      c.fillStyle = roof;
      if (chId <= 3 || chId === 6) c.fillRect(X + 2, Y + 10, 36, 6);
      else { c.beginPath(); c.moveTo(X + 1, Y + 16); c.lineTo(C, Y + 2); c.lineTo(X + 39, Y + 16); c.fill(); }
      c.fillStyle = "#5a3a20"; c.fillRect(C - 4, Y + 26, 8, 12);
      c.fillStyle = "#3a5a7a"; c.fillRect(X + 8, Y + 20, 6, 5); c.fillRect(X + 26, Y + 20, 6, 5);
      break; }
    case "wall":
      c.fillStyle = shade(ter.g[0], .62); c.fillRect(X, Y, TS, TS);
      c.fillStyle = "rgba(0,0,0,.25)";
      for (let r = 0; r < 4; r++) { c.fillRect(X, Y + r * 10, TS, 1.5); for (let k = 0; k < 3; k++) c.fillRect(X + ((k * 16 + (r % 2) * 8) % 40), Y + r * 10, 1.5, 10); }
      break;
    case "shelf":
      c.fillStyle = "#6a4426"; c.fillRect(X + 3, Y + 2, 34, 36);
      ["#8a2a2a", "#2a5a8a", "#3a7a3a", "#b8861f", "#5a3a7a"].forEach((col, i) => { c.fillStyle = col; c.fillRect(X + 6 + i * 6, Y + 6, 5, 13); c.fillRect(X + 6 + ((i + 2) % 5) * 6, Y + 22, 5, 13); });
      break;
    case "column":
      c.fillStyle = "#efe8d8"; c.fillRect(C - 7, Y + 6, 14, 32); c.fillRect(C - 10, Y + 2, 20, 5); c.fillRect(C - 10, Y + 34, 20, 5);
      c.fillStyle = "rgba(0,0,0,.1)"; c.fillRect(C - 3, Y + 7, 2, 27); c.fillRect(C + 2, Y + 7, 2, 27); break;
    case "deadtree":
      c.strokeStyle = "#2a2420"; c.lineWidth = 3; c.beginPath();
      c.moveTo(C, Y + 38); c.lineTo(C, Y + 14); c.lineTo(C - 10, Y + 4); c.moveTo(C, Y + 20); c.lineTo(C + 11, Y + 8); c.moveTo(C, Y + 26); c.lineTo(C - 8, Y + 20); c.stroke(); break;
    case "ruin":
      c.fillStyle = "#6e665a"; c.fillRect(X + 4, Y + 18, 14, 20); c.fillRect(X + 20, Y + 26, 16, 12); c.fillRect(X + 8, Y + 10, 6, 8);
      c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(X + 4, Y + 28, 32, 1.5); break;
    case "tree": case "bigtree": {
      const big = t === "bigtree";
      c.fillStyle = "#6a4426"; c.fillRect(C - 3, Y + 24, 6, 15);
      c.fillStyle = big ? "#245a24" : "#2f7a2f"; c.beginPath(); c.arc(C, Y + 17, big ? 19 : 15, 0, 7); c.fill();
      c.fillStyle = big ? "#2f6f2a" : "#3f9a3a"; c.beginPath(); c.arc(C - 4, Y + 13, big ? 11 : 8, 0, 7); c.fill(); break; }
    case "hedge":
      c.fillStyle = "#2f7a2f"; c.beginPath(); c.roundRect ? c.roundRect(X + 3, Y + 10, 34, 26, 10) : c.rect(X + 3, Y + 10, 34, 26); c.fill();
      c.fillStyle = "#3f9a3a"; c.beginPath(); c.arc(X + 14, Y + 16, 6, 0, 7); c.fill(); break;
    case "sugarpalm":
      c.strokeStyle = "#5a4030"; c.lineWidth = 3; c.beginPath(); c.moveTo(C, Y + 39); c.lineTo(C + 1, Y + 9); c.stroke();
      c.fillStyle = "#2f6a2a";
      for (let a = 0; a < 10; a++) { const an = a / 10 * Math.PI * 2; c.beginPath(); c.moveTo(C, Y + 8); c.lineTo(C + Math.cos(an) * 14, Y + 8 + Math.sin(an) * 10); c.lineTo(C + Math.cos(an + .25) * 10, Y + 8 + Math.sin(an + .25) * 7); c.fill(); }
      break;
    case "paddy":
      c.fillStyle = "#6fae7a"; c.fillRect(X, Y, TS, TS);
      c.fillStyle = "rgba(120,180,220,.35)"; c.fillRect(X + 1, Y + 1, TS - 2, TS - 2);
      c.strokeStyle = "#3f8a2a"; c.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const px = X + 6 + i * 9, py = Y + 9 + j * 9; c.beginPath(); c.moveTo(px, py); c.lineTo(px - 2, py - 5); c.moveTo(px, py); c.lineTo(px + 2, py - 5); c.stroke(); }
      c.strokeStyle = "#8a7a4a"; c.lineWidth = 2; c.strokeRect(X + 1, Y + 1, TS - 2, TS - 2); break;
    case "stilthouse":
      c.fillStyle = "#5a3a20"; [6, 16, 26, 33].forEach(px => c.fillRect(X + px, Y + 26, 2.5, 13));
      c.fillStyle = "#9a6a3a"; c.fillRect(X + 4, Y + 15, 32, 12);
      c.fillStyle = "#c9a45a"; c.beginPath(); c.moveTo(X, Y + 17); c.lineTo(C, Y + 1); c.lineTo(X + 40, Y + 17); c.fill(); break;
    case "fence":
      c.fillStyle = "#8a6a40"; c.fillRect(X, Y + 18, TS, 3); c.fillRect(X, Y + 28, TS, 3);
      for (let i = 0; i < 4; i++) c.fillRect(X + 3 + i * 10, Y + 12, 3, 24); break;
    case "flower":
      ["#e85a7a", "#f2cf6b", "#ffffff", "#c86ae8"].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(X + 8 + ((v * 50 + i * 9) % 26), Y + 10 + ((v * 70 + i * 11) % 22), 2.5, 0, 7); c.fill(); });
      break;
    case "crater":
      c.fillStyle = "rgba(30,20,10,.45)"; c.beginPath(); c.ellipse(C, Y + 22, 14, 9, 0, 0, 7); c.fill(); break;
  }
}
function prerenderTiles() {
  const c = bgCv.getContext("2d"), M = G.map;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const tl = M.T[y][x];
    if (tl.t === "gate") { drawGround(c, x * TS, y * TS, M.ter, tl.v); continue; }
    drawTile(c, x, y, tl, M.ter, CH.id);
  }
}
function drawWater(c) {
  const M = G.map;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (M.T[y][x].t !== "water") continue;
    const X = x * TS, Y = y * TS;
    c.fillStyle = "#2f6f9f"; c.fillRect(X, Y, TS, TS);
    c.strokeStyle = "rgba(200,230,255,.45)"; c.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const o = (G.t * 18 + x * 13 + i * 20) % 40;
      c.beginPath(); c.moveTo(X + o - 8, Y + 12 + i * 16); c.quadraticCurveTo(X + o - 4, Y + 9 + i * 16, X + o, Y + 12 + i * 16); c.stroke();
    }
  }
}
function drawEntity(c, e) {
  const X = e.x, Y = e.y, C = X + TS / 2, t = G.t;
  switch (e.kind) {
    case "npc":
      { const P = G.player, dx = P.tx - e.tx, dy = P.ty - e.ty, near = Math.abs(dx) + Math.abs(dy) <= 2;
        drawPerson(c, C, Y + TS - 1, 1.05, e.npc.robe, e.npc.id, { dir: !near ? "down" : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up") }); }
      if (!S.cur.talked.includes(e.npc.id)) {
        const by = Y - 12 + Math.sin(t * 4) * 3;
        c.fillStyle = "#f2cf6b"; c.beginPath(); c.arc(C, by, 9, 0, 7); c.fill();
        c.fillStyle = "#2b1a05"; c.font = "bold 14px sans-serif"; c.textAlign = "center"; c.fillText(e.npc.choice ? "?" : "!", C, by + 5);
      }
      break;
    case "scroll": {
      const by = Y + 18 + Math.sin(t * 3 + e.idx) * 3;
      const gl = c.createRadialGradient(C, by, 0, C, by, 22); gl.addColorStop(0, "rgba(255,230,140,.6)"); gl.addColorStop(1, "rgba(255,230,140,0)");
      c.fillStyle = gl; c.beginPath(); c.arc(C, by, 22, 0, 7); c.fill();
      c.fillStyle = "#f3e3bb"; c.fillRect(C - 11, by - 7, 22, 14);
      c.fillStyle = "#c9a96b"; c.fillRect(C - 13, by - 9, 4, 18); c.fillRect(C + 9, by - 9, 4, 18);
      c.fillStyle = "#a02a2a"; c.beginPath(); c.arc(C, by + 2, 3, 0, 7); c.fill();
      if (Math.sin(t * 5 + e.idx) > .7) { c.fillStyle = "#fff"; c.fillRect(C + 8, by - 14, 2, 6); c.fillRect(C + 6, by - 12, 6, 2); }
      break; }
    case "altar": {
      const ready = S.cur.scrolls.length >= 3 && !S.cur.puzzle;
      if (ready) { const gl = c.createRadialGradient(C, Y + 20, 0, C, Y + 20, 34 + Math.sin(t * 4) * 4); gl.addColorStop(0, "rgba(255,210,100,.7)"); gl.addColorStop(1, "rgba(255,210,100,0)"); c.fillStyle = gl; c.beginPath(); c.arc(C, Y + 20, 40, 0, 7); c.fill(); }
      c.fillStyle = "#7a7468"; c.fillRect(X + 6, Y + 30, 28, 9);
      c.fillStyle = "#a8a090"; c.beginPath(); c.moveTo(X + 9, Y + 31); c.lineTo(X + 9, Y + 10); c.quadraticCurveTo(C, Y - 2, X + 31, Y + 10); c.lineTo(X + 31, Y + 31); c.fill();
      c.fillStyle = S.cur.puzzle ? "#3fae6a" : "#5a5448"; for (let i = 0; i < 4; i++) c.fillRect(X + 13, Y + 13 + i * 4.5, 14 - (i % 2) * 4, 1.6);
      break; }
    case "gate": {
      const open = S.cur.puzzle;
      const church = CH.terrain === "cambodia";
      c.fillStyle = church ? "#f0e6d0" : "#8a7a60"; c.fillRect(X - 6, Y - 22, 46, 62);
      if (church) { c.fillStyle = "#a03a2a"; c.beginPath(); c.moveTo(X - 10, Y - 20); c.lineTo(C, Y - 44); c.lineTo(X + 50, Y - 20); c.fill(); c.fillStyle = "#d4a537"; c.fillRect(C - 1.5, Y - 62, 3, 18); c.fillRect(C - 7, Y - 56, 14, 3); }
      else { c.fillStyle = "#d4a537"; c.fillRect(X - 8, Y - 26, 50, 5); }
      c.fillStyle = open ? "#fff3c4" : "#2a1f14";
      c.beginPath(); c.moveTo(X + 2, Y + 40); c.lineTo(X + 2, Y + 2); c.quadraticCurveTo(C, Y - 16, X + 38, Y + 2); c.lineTo(X + 38, Y + 40); c.fill();
      if (open) { const gl = c.createRadialGradient(C, Y + 14, 0, C, Y + 14, 50); gl.addColorStop(0, "rgba(255,240,180,.75)"); gl.addColorStop(1, "rgba(255,240,180,0)"); c.fillStyle = gl; c.beginPath(); c.arc(C, Y + 14, 50, 0, 7); c.fill(); }
      else { c.strokeStyle = "#6a5a40"; c.lineWidth = 2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(X + 2 + i * 9, Y - 4); c.lineTo(X + 2 + i * 9, Y + 40); c.stroke(); } }
      if (open && !S.cur.boss) drawShadowFoe(c, X - TS / 2 + 4, Y + 36, 24, CH.boss.color, t, true);
      break; }
    case "foe":
      drawShadowFoe(c, C, Y + 34, 17, CH.enemy.color, t + e.idx);
      break;
  }
}
function renderExplore() {
  if (!S || !S.cur || !G.map) return;
  const c = cx;
  c.drawImage(bgCv, 0, 0);
  drawWater(c);
  const P = G.player;
  const list = G.ents.filter(e => e.kind !== "gate").concat([{ kind: "player", y: P.y, x: P.x }]).sort((a, b) => a.y - b.y);
  drawEntity(c, G.ents.find(e => e.kind === "gate"));
  list.forEach(e => {
    if (e.kind === "player") {
      if (P.inv > 0 && Math.floor(G.t * 10) % 2) return;
      drawPerson(c, P.x + TS / 2, P.y + TS - 1, 1.05, "#3b6fb6", "player", { walk: P.prog < 1 || !!P.path.length, dir: P.dir });
    } else drawEntity(c, e);
  });
  // ស្លាកឈ្មោះ NPC នៅពេលអ្នកលេងនៅជិត
  G.ents.forEach(e => {
    if (e.kind !== "npc" || Math.abs(e.tx - P.tx) + Math.abs(e.ty - P.ty) > 2) return;
    c.font = "13px 'Kantumruy Pro',sans-serif"; c.textAlign = "center";
    const w = c.measureText(e.npc.name).width + 12;
    c.fillStyle = "rgba(10,15,30,.75)"; c.fillRect(e.x + TS / 2 - w / 2, e.y - 34, w, 20);
    c.fillStyle = "#f2cf6b"; c.fillText(e.npc.name, e.x + TS / 2, e.y - 19);
  });
  // ភាពងងឹត និងពន្លឺចង្កៀង
  const dark = G.map.ter.dark;
  if (dark) {
    const d = darkCv.getContext("2d");
    d.globalCompositeOperation = "source-over"; d.clearRect(0, 0, darkCv.width, darkCv.height);
    d.fillStyle = `rgba(5,5,15,${dark})`; d.fillRect(0, 0, darkCv.width, darkCv.height);
    d.globalCompositeOperation = "destination-out";
    const holes = [[P.x + TS / 2, P.y + TS / 2, 150 + Math.sin(G.t * 6) * 4]];
    G.ents.forEach(e => { if (e.kind === "scroll" || e.kind === "altar") holes.push([e.x + TS / 2, e.y + TS / 2, 46]); if (e.kind === "gate") holes.push([e.x + TS / 2, e.y + TS / 2, 70]); });
    holes.forEach(([hx, hy, r]) => { const g = d.createRadialGradient(hx, hy, 0, hx, hy, r); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); d.fillStyle = g; d.beginPath(); d.arc(hx, hy, r, 0, 7); d.fill(); });
    c.drawImage(darkCv, 0, 0);
  }
}

/* ---------- អន្តរកម្ម ---------- */
async function interact(e) {
  if (G.busy) return;
  if (e.kind === "npc") return talkNpc(e);
  if (e.kind === "altar") return useAltar();
  if (e.kind === "gate") return useGate();
}
async function pickScroll(e) {
  G.busy = true;
  G.ents = G.ents.filter(x => x !== e);
  S.cur.scrolls.push(e.idx);
  Sound.sfx("pickup"); gainXp(20, 100);
  const s = CH.scrolls[e.idx];
  Sound.speak("c" + pad2(CH.id) + "_scroll" + e.idx + "_00", s.title + "។ " + s.text, "narr");
  await modal(`<div class="big-icon">📜</div><h2>${esc(s.title)}</h2>
    <div class="scroll-card"><p>${esc(s.text)}</p>${s.ref ? `<div class="ref">📖 ${esc(s.ref)}</div>` : ""}</div>
    <p class="note" style="text-align:center">ក្រាំង ${kh(S.cur.scrolls.length)}/៣ · +២០ XP · +១០០ ពិន្ទុ</p>
    <div class="row"><button class="btn gold" data-m="ok">យល់ហើយ ✓</button></div>`);
  Sound.stopVoice();
  if (S.cur.scrolls.length === 3) toast("🪨 ក្រាំងគ្រប់ហើយ! ទៅដោះប្រស្នានៅផ្ទាំងថ្ម");
  updateHud(); G.busy = false; autosave();
}
async function talkNpc(e) {
  G.busy = true;
  const n = e.npc, pre = "c" + pad2(CH.id) + "_" + n.id;
  await dialogue(n.lines, CH, pre);
  if (n.choice && S.cur.choices[n.id] === undefined) {
    const i = await choose(n.choice.prompt, n.choice.options, CH);
    const o = n.choice.options[i];
    S.cur.choices[n.id] = i; S.faith += o.faith;
    gainXp(o.xp, o.faith > 0 ? 100 : 10);
    await dialogue(o.reply, CH, pre + "_r" + i);
    if (o.faith > 0) toast("🕯️ ភាពស្មោះត្រង់ +" + kh(o.faith));
    else if (o.faith < 0) toast("🕯️ ភាពស្មោះត្រង់ " + "-" + kh(-o.faith));
  } else if (!S.cur.talked.includes(n.id)) gainXp(15, 30);
  if (!S.cur.talked.includes(n.id)) S.cur.talked.push(n.id);
  updateHud(); G.busy = false; autosave();
}
async function useAltar() {
  G.busy = true;
  if (S.cur.puzzle) { await dialogue([["teacher", "ប្រស្នានៅលើផ្ទាំងថ្មនេះ បានដោះស្រាយរួចហើយ។ ទ្វារកំពុងរង់ចាំអ្នក!"]], CH); G.busy = false; return; }
  if (S.cur.scrolls.length < 3) {
    await dialogue([["teacher", "ផ្ទាំងថ្មនេះមានអក្សរចារឹក ប៉ុន្តែយើងមិនទាន់យល់វាទេ។ ចូរប្រមូលក្រាំងទាំងបីជាមុនសិន (" + kh(S.cur.scrolls.length) + "/៣)។"]], CH);
    G.busy = false; return;
  }
  const mistakes = await runPuzzle(CH.puzzle);
  if (mistakes !== null) {
    S.cur.puzzle = true; S.cur.puzzleMistakes = mistakes;
    Sound.sfx("gate"); gainXp(50, Math.max(50, 200 - mistakes * 40));
    toast("🚪 ទ្វារបានបើកហើយ!");
    await dialogue([["teacher", "ល្អណាស់ {name}! ទ្វារបានបើកហើយ… ប៉ុន្តែមានស្រមោលធំមួយកំពុងឈរនៅមុខទ្វារ។ ចូរត្រៀមខ្លួន!"]], CH);
    autosave();
  }
  updateHud(); G.busy = false;
}
async function useGate() {
  G.busy = true;
  if (!S.cur.puzzle) {
    await dialogue([["teacher", "ទ្វារនៅតែបិទ។ " + (S.cur.scrolls.length < 3 ? "ចូរស្វែងរកក្រាំងទាំងបី (" + kh(S.cur.scrolls.length) + "/៣) " : "") + "ហើយដោះប្រស្នានៅលើផ្ទាំងថ្ម ដើម្បីបើកវា។"]], CH);
    G.busy = false; return;
  }
  if (!S.cur.boss) {
    await dialogue([["boss", CH.boss.taunt]], CH, "c" + pad2(CH.id) + "_boss");
    startBattle(null, true);
  }
}

/* ===================== ៨. ប្រស្នា (Puzzle) ===================== */
function runPuzzle(pz) {
  return new Promise(resolve => {
    let mistakes = 0;
    const finish = async () => {
      Sound.sfx("correct");
      await sleep(500);
      closeModal("done"); resolve(mistakes);
    };
    if (pz.type === "order") {
      const order = shuffle(pz.items.map((t, i) => ({ t, i })));
      let next = 0;
      modal(`<div class="big-icon">🪨</div><h2>ប្រស្នានៅលើផ្ទាំងថ្ម</h2><p>${esc(pz.prompt)}។<br><span class="note">ចុចលើព្រឹត្តិការណ៍ដែលកើតឡើងមុនគេ រួចបន្តតាមលំដាប់។</span></p>
        <div class="pz-list">${order.map(o => `<button class="pz-item" data-i="${o.i}"><span class="num">?</span><span>${esc(o.t)}</span></button>`).join("")}</div>
        <div class="row"><button class="btn red" data-m="cancel">ចាកចេញសិន</button></div>`, {
        onOpen: box => box.querySelectorAll(".pz-item").forEach(b => b.onclick = () => {
          if (b.disabled) return;
          if (+b.dataset.i === next) {
            Sound.sfx("select"); b.classList.add("done"); b.disabled = true; b.querySelector(".num").textContent = kh(next + 1); next++;
            if (next === pz.items.length) finish();
          } else {
            mistakes++; Sound.sfx("wrong"); b.classList.remove("bad"); void b.offsetWidth; b.classList.add("bad");
          }
        })
      }).then(v => { if (v === "cancel") resolve(null); });
    } else {
      const right = shuffle(pz.pairs.map((p, i) => ({ t: p[1], i })));
      let selL = null, left = 0;
      modal(`<div class="big-icon">🪨</div><h2>ប្រស្នានៅលើផ្ទាំងថ្ម</h2><p>${esc(pz.prompt)}។<br><span class="note">ចុចពាក្យនៅខាងឆ្វេង រួចចុចអត្ថន័យរបស់វានៅខាងស្តាំ។</span></p>
        <div class="pz-cols"><div class="pz-list">${pz.pairs.map((p, i) => `<button class="pz-item" data-l="${i}">${esc(p[0])}</button>`).join("")}</div>
        <div class="pz-list">${right.map(o => `<button class="pz-item" data-r="${o.i}">${esc(o.t)}</button>`).join("")}</div></div>
        <div class="row"><button class="btn red" data-m="cancel">ចាកចេញសិន</button></div>`, {
        onOpen: box => {
          box.querySelectorAll("[data-l]").forEach(b => b.onclick = () => {
            if (b.disabled) return; Sound.sfx("select");
            box.querySelectorAll("[data-l]").forEach(x => x.classList.remove("sel")); b.classList.add("sel"); selL = b;
          });
          box.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
            if (b.disabled || !selL) return;
            if (selL.dataset.l === b.dataset.r) {
              Sound.sfx("select"); [selL, b].forEach(x => { x.classList.remove("sel"); x.classList.add("done"); x.disabled = true; });
              selL = null; left++; if (left === pz.pairs.length) finish();
            } else { mistakes++; Sound.sfx("wrong"); b.classList.remove("bad"); void b.offsetWidth; b.classList.add("bad"); }
          });
        }
      }).then(v => { if (v === "cancel") resolve(null); });
    }
  });
}

/* ===================== ៩. ការប្រយុទ្ធ ===================== */
let B = null;
const bcv = $("#bcv"), bcx = bcv.getContext("2d");
function startBattle(foe, boss) {
  G.busy = true; G.keys = {}; G.player.path = []; G.player.pending = null;
  const n = CH.id;
  const hp = boss ? 110 + n * 12 : 40 + n * 6;
  B = { foe, boss, name: boss ? CH.boss.name : CH.enemy.name, color: boss ? CH.boss.color : CH.enemy.color,
        hp, maxHp: hp, atk: boss ? 12 + n * 1.5 : 8 + n * 1.2, prayers: 2, shield: false, streak: 0,
        pool: shuffle(CH.questions), busy: false, fx: [], shakeE: 0, shakeP: 0, flash: 0, halfTaunt: false };
  Sound.sfx("encounter");
  Sound.setAmbient([]); Sound.playMusic(boss ? "boss" : "battle");
  G.mode = "battle";
  show("scr-battle");
  $("#b-pname").textContent = S.name + " · Lv " + kh(S.level);
  $("#b-ename").textContent = B.name;
  $("#b-question").classList.add("hidden"); $("#b-actions").classList.remove("hidden");
  bLog(boss ? "⚠️ " + B.name + " បានលេចមក!" : B.name + " បានរារាំងផ្លូវរបស់អ្នក!");
  bUpdate();
}
function bLog(t) { $("#b-log").textContent = nm(t); }
function bUpdate() {
  $("#b-php").style.width = (S.hp / S.maxHp * 100) + "%"; $("#b-phpn").textContent = "ជំនឿ " + kh(Math.max(0, S.hp)) + "/" + kh(S.maxHp);
  $("#b-ehp").style.width = (B.hp / B.maxHp * 100) + "%"; $("#b-ehpn").textContent = kh(Math.max(0, Math.ceil(B.hp))) + "/" + kh(B.maxHp);
  $("#b-pray").textContent = "(" + kh(B.prayers) + ")";
  $("[data-b=pray]").disabled = B.prayers <= 0;
}
function floatText(txt, side, color) { B.fx.push({ txt, x: side === "e" ? 700 : 250, y: 120, life: 1.2, color }); }
$$("#b-actions [data-b]").forEach(b => b.addEventListener("click", () => battleAction(b.dataset.b)));
function battleKey(e) {
  if (!B || B.busy) return;
  const q = !$("#b-question").classList.contains("hidden");
  const m = /^Digit([1-4])$/.exec(e.code); if (!m) return;
  if (q) { const b = $("#bq-opts").children[+m[1] - 1]; if (b) b.click(); }
  else { const b = $$("#b-actions [data-b]")[+m[1] - 1]; if (b && !b.disabled) b.click(); }
}
async function battleAction(a) {
  if (!B || B.busy) return;
  Sound.sfx("select");
  if (a === "sword") { askQuestion(); return; }
  B.busy = true;
  if (a === "shield") { B.shield = true; S.hp = Math.min(S.maxHp, S.hp + 6); Sound.sfx("shield"); bLog("🛡️ អ្នកលើកខែលនៃសេចក្តីជំនឿ ហើយស្តារកម្លាំង +៦"); floatText("+៦", "p", "#8fd3ff"); }
  if (a === "pray") {
    if (B.prayers <= 0) { B.busy = false; return; }
    B.prayers--; const h = Math.round(S.maxHp * 0.35); S.hp = Math.min(S.maxHp, S.hp + h);
    Sound.sfx("heal"); bLog("🙏 អ្នកអធិស្ឋាន… ព្រះបានពង្រឹងជំនឿរបស់អ្នក +" + kh(h)); floatText("+" + kh(h), "p", "#7ae08a");
  }
  bUpdate(); await sleep(900); await enemyTurn(); B && (B.busy = false);
}
function askQuestion() {
  if (!B.pool.length) B.pool = shuffle(CH.questions);
  const q = B.pool.shift();
  $("#b-actions").classList.add("hidden"); $("#b-question").classList.remove("hidden");
  $("#bq-text").textContent = "⚔️ " + q.q;
  const box = $("#bq-opts"); box.innerHTML = "";
  shuffle(q.a.map((t, i) => ({ t, ok: i === 0 }))).forEach((o, i) => {
    const b = document.createElement("button"); b.className = "btn"; b.textContent = (i + 1) + ". " + o.t;
    b.onclick = async () => {
      if (B.busy) return; B.busy = true;
      [...box.children].forEach(x => x.disabled = true);
      S.cur.asked++;
      if (o.ok) { b.classList.add("ok"); S.cur.correct++; }
      else { b.classList.add("no"); [...box.children].find((x, k) => x.textContent.slice(3) === q.a[0])?.classList.add("ok"); }
      await sleep(o.ok ? 600 : 1300);
      $("#b-question").classList.add("hidden"); $("#b-actions").classList.remove("hidden");
      if (o.ok) {
        B.streak++;
        let dmg = Math.round(S.power + Math.random() * S.power * 0.3);
        const crit = B.streak >= 3 && B.streak % 3 === 0;
        if (crit) dmg = Math.round(dmg * 1.6);
        B.hp -= dmg; B.shakeE = 0.4; B.flash = 0.25; Sound.sfx("hit"); gainXp(0, 20);
        floatText((crit ? "✨ " : "-") + kh(dmg), "e", crit ? "#ffe08a" : "#ffffff");
        bLog(crit ? "✨ ចម្លើយត្រឹមត្រូវ ៣ ដងជាប់គ្នា! ការវាយប្រហារដ៏ខ្លាំង " + kh(dmg) + "!" : "✅ ត្រឹមត្រូវ! ព្រះបន្ទូលវាយ " + B.name + " " + kh(dmg));
        bUpdate();
        if (B.hp <= 0) { await sleep(700); return battleWin(); }
        if (B.boss && !B.halfTaunt && B.hp < B.maxHp / 2) { B.halfTaunt = true; await sleep(800); bLog("«ទេ!… ពន្លឺនេះខ្លាំងពេកហើយ!»"); }
      } else {
        B.streak = 0; Sound.sfx("wrong"); bLog("❌ មិនត្រឹមត្រូវទេ។ ចម្លើយត្រូវគឺ៖ " + q.a[0]);
      }
      await sleep(1000); await enemyTurn(); if (B) B.busy = false;
    };
    box.appendChild(b);
  });
}
async function enemyTurn() {
  if (!B || B.hp <= 0) return;
  let dmg = Math.round(B.atk * (0.8 + Math.random() * 0.4));
  if (B.shield) { dmg = Math.round(dmg * 0.3); B.shield = false; }
  S.hp -= dmg; B.shakeP = 0.4; Sound.sfx("hurt"); floatText("-" + kh(dmg), "p", "#ff8a7a");
  const lines = B.boss ? ["វាយប្រហារដោយការបោកបញ្ឆោត", "បញ្ចេញភាពងងឹតដ៏ខ្លាំង", "សង្កត់សង្កិនដោយការភ័យខ្លាច"] : ["ខ្សឹបពាក្យនៃការសង្ស័យ", "វាយប្រហារដោយការភ័យខ្លាច", "ព្យាយាមធ្វើឲ្យអ្នកបាក់ទឹកចិត្ត"];
  bLog(B.name + " " + lines[Math.floor(Math.random() * lines.length)] + "! ជំនឿ -" + kh(dmg));
  bUpdate(); updateHud();
  if (S.hp <= 0) { await sleep(900); return battleLose(); }
  await sleep(500);
}
async function battleWin() {
  const wasBoss = B.boss, foe = B.foe;
  Sound.fanfare();
  bLog("🎉 អ្នកបានឈ្នះ " + B.name + "!");
  gainXp(wasBoss ? 100 : 40, wasBoss ? 400 : 150);
  await sleep(1600);
  B = null;
  if (!wasBoss) {
    S.cur.foes.push(foe.idx);
    G.ents = G.ents.filter(e => e !== foe);
  } else S.cur.boss = true;
  G.player.inv = 1.5;
  G.mode = "explore"; show("scr-game"); updateHud();
  Sound.playMusic(CH.mood); Sound.setAmbient(CH.ambient);
  if (wasBoss) { await dialogue(CH.outro, CH, "c" + pad2(CH.id) + "_outro"); return chapterComplete(); }
  G.busy = false; autosave();
}
async function battleLose() {
  Sound.stopMusic(); Sound.sfx("defeat");
  S.score = Math.max(0, S.score - 50);
  const v = await modal(`<div class="big-icon">🕯️</div><h2>កុំបោះបង់!</h2>
    <p style="text-align:center">ជំនឿរបស់អ្នកអស់កម្លាំង… ប៉ុន្តែព្រះមិនដែលបោះបង់អ្នកទេ។<br>«ទោះបើខ្ញុំដួល ក៏ខ្ញុំនឹងក្រោកឡើងវិញ» (មីកា ៧:៨)</p>
    <div class="row"><button class="btn gold" data-m="retry">ព្យាយាមម្តងទៀត</button><button class="btn" data-m="back">ដកថយ ហើយរៀនសិន</button></div>`);
  S.hp = S.maxHp;
  if (v === "retry") { const f = B.foe, b = B.boss; startBattle(f, b); return; }
  B = null; S.hp = Math.round(S.maxHp * 0.6);
  Object.assign(G.player, { tx: 1, ty: 6, x: TS, y: 6 * TS, prog: 1, inv: 2.5 });
  G.mode = "explore"; show("scr-game"); updateHud();
  Sound.playMusic(CH.mood); Sound.setAmbient(CH.ambient);
  G.busy = false; autosave();
}
function renderBattle(dt) {
  if (!B) return;
  const c = bcx, W = 960, H = 300, ter = TER[CH.terrain];
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, B.boss ? "#2a0f1a" : "#1a1f3a"); g.addColorStop(0.6, shade(ter.g[0], .35)); g.addColorStop(1, shade(ter.g[1], .55));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = shade(ter.g[0], .5); c.beginPath(); c.ellipse(250, 262, 150, 26, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(700, 262, 170, 30, 0, 0, 7); c.fill();
  B.shakeE = Math.max(0, B.shakeE - dt); B.shakeP = Math.max(0, B.shakeP - dt); B.flash = Math.max(0, B.flash - dt);
  const ex = 700 + (B.shakeE ? (Math.random() - .5) * 18 : 0), px = 250 + (B.shakeP ? (Math.random() - .5) * 14 : 0);
  drawShadowFoe(c, ex, 250, B.boss ? 105 : 80, B.color, G.t, B.boss);
  drawPerson(c, px, 272, 3.4, "#3b6fb6", "player", { dir: "right" });
  if (B.shield) { c.strokeStyle = "rgba(143,211,255,.8)"; c.lineWidth = 4; c.beginPath(); c.arc(px, 200, 80 + Math.sin(G.t * 6) * 3, 0, 7); c.stroke(); }
  if (B.flash) { c.fillStyle = `rgba(255,240,180,${B.flash * 2})`; c.fillRect(0, 0, W, H); }
  B.fx = B.fx.filter(f => (f.life -= dt) > 0);
  B.fx.forEach(f => { c.globalAlpha = Math.min(1, f.life); c.fillStyle = f.color; c.font = "bold 34px 'Kantumruy Pro',sans-serif"; c.textAlign = "center"; c.fillText(f.txt, f.x, f.y - (1.2 - f.life) * 60); c.globalAlpha = 1; });
}

/* ===================== ១០. បញ្ចប់ជំពូក និងចុងបញ្ចប់ ===================== */
async function chapterComplete() {
  G.busy = true;
  const c = S.cur, acc = c.asked ? c.correct / c.asked : 1;
  const stars = 1 + (acc >= 0.5 && c.puzzleMistakes <= 3 ? 1 : 0) + (acc >= 0.8 && c.puzzleMistakes <= 1 ? 1 : 0);
  const bonus = stars * 100; S.score += bonus; c.score += bonus;
  const prev = S.chapters[CH.id] || {};
  S.chapters[CH.id] = { done: true, stars: Math.max(stars, prev.stars || 0), score: Math.max(c.score, prev.score || 0) };
  S.unlocked = Math.max(S.unlocked, Math.min(15, CH.id + 1));
  const id = CH.id; S.cur = null; S.hp = S.maxHp;
  autosave();
  Sound.fanfare();
  const partDone = id < 15 && CHAPTERS[id].part !== CHAPTERS[id - 1].part;
  await modal(`<div class="big-icon">🏆</div><h2>បេសកកម្មបានសម្រេច!</h2>
    <p style="text-align:center">ជំពូកទី ${kh(id)}៖ ${esc(CHAPTERS[id - 1].title)}</p>
    <div class="stars">${"⭐".repeat(stars)}${"☆".repeat(3 - stars)}</div>
    <div class="res-grid"><span>ចម្លើយត្រឹមត្រូវ</span><span>${kh(c.correct)}/${kh(c.asked)}</span>
      <span>កំហុសក្នុងប្រស្នា</span><span>${kh(c.puzzleMistakes)}</span>
      <span>ពិន្ទុជំពូកនេះ</span><span>${kh(c.score)}</span>
      <span>កម្រិត</span><span>Lv ${kh(S.level)}</span>
      <span>ភាពស្មោះត្រង់</span><span>🕯️ ${kh(S.faith)}</span></div>
    ${partDone ? `<p style="text-align:center;color:#7a1f1f;font-weight:700">🎉 ${PARTS[CHAPTERS[id - 1].part - 1].title} ចប់ហើយ! បន្តទៅ ${PARTS[CHAPTERS[id].part - 1].title}៖ ${PARTS[CHAPTERS[id].part - 1].sub}</p>` : ""}
    <div class="row"><button class="btn gold" data-m="ok">${id === 15 ? "មើលចុងបញ្ចប់ ▶" : "ទៅផែនទី ▶"}</button></div>`);
  G.busy = false;
  if (id === 15) return playEnding();
  mapSel = Math.min(15, id + 1);
  fadeTo(async () => openMap());
}
async function playEnding() {
  const k = S.faith >= 22 ? "high" : S.faith >= 10 ? "mid" : "low";
  G.mode = "scene"; show("scr-game"); $("#quest").textContent = ""; $("#hud-ch").textContent = ENDINGS[k].title;
  Sound.playMusic("ending"); Sound.setAmbient(["birds", "frogs", "wind"]);
  G.busy = true;
  await dialogue(ENDINGS[k].lines, null, "end_" + k);
  S.finished = true; autosave();
  await modal(`<div class="big-icon">🪔</div><h2>${ENDINGS[k].title}</h2>
    <p style="text-align:center">${esc(S.name)} · Lv ${kh(S.level)} · ពិន្ទុសរុប ${kh(S.score)} · 🕯️ ${kh(S.faith)}<br>
    ផ្កាយសរុប ${kh(Object.values(S.chapters).reduce((a, c) => a + (c.stars || 0), 0))}/៤៥</p>
    <div class="ornament" style="filter:brightness(.6)"></div>
    <p style="text-align:center;font-size:14px">ហ្គេមនេះផ្អែកលើសៀវភៅ<br><b>«ប្រវត្តិសាស្ត្រក្រុមជំនុំ ៖ ការសិក្សាស្វែងយល់តាមយុគសម័យ»</b><br>
    ដោយ គ្រូគង្វាល យឿន វ៉ាន់ដា<br>វិទ្យាស្ថានទេវសាស្ត្រថេអូខៃរ៉ុស<br><br>Soli Deo Gloria — សិរីល្អថ្វាយព្រះជាម្ចាស់តែមួយអង្គគត់</p>
    <div class="row"><button class="btn gold" data-m="ok">ទៅផែនទី</button></div>`);
  G.busy = false; mapSel = 15; openMap();
}

/* ឈុតឆាក (ការចាប់ផ្តើម និងចុងបញ្ចប់) — ពេលល្ងាចនៅស្រុកម៉ាឡៃ */
function drawScene() {
  const c = cx, W = 960, H = 520;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1f2a5a"); g.addColorStop(0.45, "#c9663a"); g.addColorStop(0.62, "#f2b84b"); g.addColorStop(0.63, "#5a7a3a"); g.addColorStop(1, "#2f4a24");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,220,140,.9)"; c.beginPath(); c.arc(700, 318, 38, 0, 7); c.fill();
  // ដើមត្នោត
  [[80, 1.3], [180, 1], [820, 1.4], [900, 1.1], [600, .8]].forEach(([x, s]) => {
    c.strokeStyle = "#1a1a10"; c.lineWidth = 5 * s; c.beginPath(); c.moveTo(x, 330); c.lineTo(x + 3, 330 - 150 * s); c.stroke();
    c.fillStyle = "#1a1a10";
    for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2, cx0 = x + 3, cy0 = 330 - 150 * s; c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(cx0 + Math.cos(an) * 40 * s, cy0 + Math.sin(an) * 26 * s); c.lineTo(cx0 + Math.cos(an + .2) * 28 * s, cy0 + Math.sin(an + .2) * 18 * s); c.fill(); }
  });
  // ព្រះវិហារតូច
  c.fillStyle = "#1a1a10"; c.fillRect(380, 250, 120, 80); c.beginPath(); c.moveTo(370, 255); c.lineTo(440, 205); c.lineTo(510, 255); c.fill();
  c.fillRect(437, 160, 6, 46); c.fillRect(425, 172, 30, 6);
  c.fillStyle = "#f2cf6b"; c.fillRect(420, 290, 20, 40);
  // វាលស្រែ
  c.strokeStyle = "rgba(20,40,10,.4)"; c.lineWidth = 2;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 360 + i * 28); c.lineTo(W, 350 + i * 30); c.stroke(); }
  drawPerson(c, 430, 470, 2.6, "#e8e2d0", "teacher");
  drawPerson(c, 540, 470, 2.4, "#3b6fb6", "player");
  // ពពុះពន្លឺ
  for (let i = 0; i < 14; i++) { const x = (i * 137 + G.t * 20) % W, y = 380 + Math.sin(G.t + i) * 40 + (i % 3) * 30; c.fillStyle = `rgba(255,240,150,${.4 + .4 * Math.sin(G.t * 3 + i)})`; c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); }
}
async function playPrologue() {
  await fadeTo(async () => {
    G.mode = "scene"; show("scr-game"); CH = null; updateHud(); $("#hud-ch").textContent = "ការចាប់ផ្តើម"; $("#quest").textContent = "";
    Sound.playMusic("title"); Sound.setAmbient(["frogs", "crickets", "wind"]);
  });
  G.busy = true;
  await dialogue(PROLOGUE, null, "p");
  S.prologueSeen = true;
  startChapter(1, false);
}

/* ===================== ១១. ម៉ឺនុយ ===================== */
async function pauseMenu() {
  const inCh = G.mode === "explore";
  if (inCh) G.busy = true;
  const v = await modal(`<h2>ម៉ឺនុយ</h2>
    <div class="menu" style="max-width:320px;margin:0 auto">
      <button class="btn gold" data-m="resume">បន្តលេង</button>
      <button class="btn" data-m="save">រក្សាទុក</button>
      <button class="btn" data-m="load">ផ្ទុកការរក្សាទុក</button>
      <button class="btn" data-m="settings">ការកំណត់</button>
      ${inCh ? `<button class="btn" data-m="map">ផែនទីពិភពលោក</button>` : ""}
      <button class="btn red" data-m="title">ទៅទំព័រដើម</button>
    </div>
    <p class="note" style="text-align:center">ហ្គេមរក្សាទុកដោយស្វ័យប្រវត្តិ ក្រោយព្រឹត្តិការណ៍សំខាន់ៗ។</p>`);
  if (v === "save") await slotsMenu("save");
  else if (v === "load") { if (await slotsMenu("load")) return; }
  else if (v === "settings") await settingsMenu();
  else if (v === "map") { autosave(); fadeTo(async () => openMap()); return; }
  else if (v === "title") { autosave(); goTitle(); return; }
  if (inCh) G.busy = false;
}
function slotInfo(d) {
  if (!d) return "<b>ទទេ</b>";
  const where = d.cur ? "ជំពូកទី " + kh(d.cur.ch) : "ផែនទីពិភពលោក";
  const dt = new Date(d.savedAt), mins = Math.floor((d.playTime || 0) / 60);
  return `<b>${esc(d.name)}</b> · Lv ${kh(d.level)} · ${where}<br>⭐ ${kh(d.score)} · 🕯️ ${kh(d.faith)} · ${kh(mins)} នាទី · ${kh(dt.getDate())}/${kh(dt.getMonth() + 1)}/${kh(dt.getFullYear())} ${kh(pad2(dt.getHours()))}:${kh(pad2(dt.getMinutes()))}`;
}
async function slotsMenu(mode) {
  const html = () => `<h2>${mode === "save" ? "រក្សាទុកហ្គេម" : "ផ្ទុកការរក្សាទុក"}</h2>
    <div class="slots">${SLOT_KEYS.map(k => {
      const d = store.get(k);
      if (mode === "save" && k === "cha-save-auto") return "";
      return `<div class="slot"><div class="s-info"><div style="font-size:13px;color:#7a5a20">${slotLabel(k)}</div>${slotInfo(d)}</div>
        ${mode === "save" ? `<button class="btn gold small" data-k="${k}" data-a="save">រក្សាទុក</button>` : d ? `<button class="btn gold small" data-k="${k}" data-a="load">ផ្ទុក</button>` : ""}
        ${d && k !== "cha-save-auto" ? `<button class="btn red small" data-k="${k}" data-a="del">លុប</button>` : ""}</div>`;
    }).join("")}</div>
    <details style="margin-top:14px"><summary style="cursor:pointer;font-size:14px">ផ្ទេរការរក្សាទុកទៅឧបករណ៍ផ្សេង (កូដ)</summary>
      ${mode === "save" && S ? `<p class="note">ចម្លងកូដនេះ ហើយបិទភ្ជាប់នៅលើឧបករណ៍ផ្សេង៖</p><textarea readonly id="exp">${encodeSave(Object.assign({}, S, { savedAt: Date.now() }))}</textarea>` : ""}
      <p class="note">បិទភ្ជាប់កូដដើម្បីផ្ទុក៖</p><textarea id="imp" placeholder="បិទភ្ជាប់កូដនៅទីនេះ…"></textarea>
      <div class="row"><button class="btn small" data-a="import">ផ្ទុកពីកូដ</button></div></details>
    <div class="row"><button class="btn" data-m="close">ត្រឡប់ក្រោយ</button></div>`;
  return new Promise(resolve => {
    const bind = box => box.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
      Sound.sfx("select");
      const k = b.dataset.k, a = b.dataset.a;
      if (a === "save") { saveTo(k); toast("✅ បានរក្សាទុកនៅ " + slotLabel(k)); box.innerHTML = html(); bindAll(box); }
      if (a === "del") { store.del(k); box.innerHTML = html(); bindAll(box); }
      if (a === "load") { const d = store.get(k); closeModal("x"); resolve(true); loadState(d); }
      if (a === "import") {
        try { const d = decodeSave(box.querySelector("#imp").value); if (d.v !== 1) throw 0; closeModal("x"); resolve(true); loadState(d); }
        catch (e) { toast("❌ កូដមិនត្រឹមត្រូវ"); }
      }
    });
    const bindAll = box => { bind(box); box.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { closeModal("close"); }); };
    modal(html(), { onOpen: bindAll }).then(v => { if (v !== "x") resolve(false); });
  });
}
async function settingsMenu() {
  const sl = (k, l) => `<div class="set-row"><label>${l}</label><input type="range" min="0" max="1" step="0.05" value="${settings[k]}" data-s="${k}"></div>`;
  await modal(`<h2>ការកំណត់</h2>
    ${sl("master", "កម្រិតសំឡេងទូទៅ")}${sl("music", "🎵 ភ្លេង")}${sl("ambient", "🐦 សំឡេងធម្មជាតិ")}${sl("sfx", "🔔 សំឡេងប្រតិកម្ម")}${sl("voice", "🗣️ សំឡេងនិយាយ")}
    <div class="set-row"><label>របៀបសំឡេងនិយាយ</label><select data-s="voiceMode">
      <option value="auto">ស្វ័យប្រវត្តិ (ឯកសារថត → សំឡេងអានរបស់ឧបករណ៍)</option>
      <option value="file">តែឯកសារដែលបានថតប៉ុណ្ណោះ</option>
      <option value="tts">តែសំឡេងអានរបស់ឧបករណ៍ (TTS)</option>
      <option value="off">បិទសំឡេងនិយាយ</option></select></div>
    <div class="set-row"><label>ល្បឿនអក្សរ</label><select data-s="textSpeed">
      <option value="1">យឺត</option><option value="2">មធ្យម</option><option value="3">លឿន</option><option value="4">បង្ហាញភ្លាមៗ</option></select></div>
    <p class="note">• ឯកសារសំឡេងថតដែលបានដាក់៖ <b>${kh(Sound.voiceFileCount())}</b> ប្រយោគ<br>
       • សំឡេងអានភាសាខ្មែររបស់ឧបករណ៍នេះ (km-KH)៖ <b>${Sound.hasTTS() ? "មាន ✅" : "គ្មាន"}</b><br>
       • អាចដាក់សំឡេងថតផ្ទាល់ខ្លួន តាមរយៈ audio/voice/ (សូមមើល README)</p>
    <div class="row"><button class="btn small" id="t-voice">សាកល្បងសំឡេង</button><button class="btn gold" data-m="ok">រួចរាល់</button></div>`, {
    onOpen: box => {
      box.querySelectorAll("[data-s]").forEach(el => {
        el.value = settings[el.dataset.s];
        el.oninput = () => { const k = el.dataset.s; settings[k] = el.type === "range" ? +el.value : k === "textSpeed" ? +el.value : el.value; applySettings(); };
      });
      box.querySelector("#t-voice").onclick = () => { Sound.init(); Sound.sfx("pickup"); Sound.speak("p_03", nm(PROLOGUE[3][1]), "teacher"); };
    }
  });
  applySettings();
}
function goTitle() {
  Sound.stopVoice(); G.mode = "title"; G.busy = false; CH = null;
  show("scr-title"); Sound.playMusic("title"); Sound.setAmbient(["wind", "crickets"]);
  $("#btn-continue").disabled = !latestSave();
}
async function newGame() {
  const v = await modal(`<h2>ចាប់ផ្តើមដំណើរថ្មី</h2><p style="text-align:center">តើអ្នកឈ្មោះអ្វី?</p>
    <div class="set-row"><input type="text" id="pname" maxlength="20" placeholder="សរសេរឈ្មោះរបស់អ្នក" value="${esc((latestSave() || { d: {} }).d.name || "")}"></div>
    <div class="row"><button class="btn gold" data-m="go">ចេញដំណើរ ▶</button><button class="btn" data-m="no">ត្រឡប់ក្រោយ</button></div>`,
    { onOpen: box => { const i = box.querySelector("#pname"); setTimeout(() => i.focus(), 50); i.onkeydown = e => { if (e.key === "Enter") closeModal("go"); }; newGame.inp = i; } });
  if (v !== "go") return;
  const name = (newGame.inp.value || "").trim() || "អ្នកធ្វើដំណើរ";
  S = newState(name);
  playPrologue();
}
async function quitGame() {
  const v = await modal(`<h2>ចាកចេញពីហ្គេម?</h2><p style="text-align:center">វឌ្ឍនភាពរបស់អ្នកត្រូវបានរក្សាទុករួចហើយ។</p>
    <div class="row"><button class="btn red" data-m="yes">ចាកចេញ</button><button class="btn" data-m="no">ទេ</button></div>`);
  if (v !== "yes") return;
  if (S) autosave();
  Sound.stopMusic(); Sound.stopAmbient();
  document.body.innerHTML = `<div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px;font-family:'Kantumruy Pro',sans-serif;color:#f6ecd2;background:#0b1224">
    <div style="font-size:54px">🪔</div><div style="font-family:Moul,serif;font-size:24px;color:#f2cf6b;line-height:1.8">សូមអរគុណដែលបានលេង!</div>
    <div>សូមព្រះប្រទានពរ។ អ្នកអាចបិទផ្ទាំងនេះបានហើយ។</div>
    <button onclick="location.reload()" style="font:inherit;padding:10px 20px;border-radius:12px;border:2px solid #d4a537;background:#1f2d52;color:#f6ecd2;cursor:pointer">ត្រឡប់មកលេងវិញ</button></div>`;
  try { window.close(); } catch (e) {}
}
$$("#scr-title [data-act]").forEach(b => b.addEventListener("click", async () => {
  Sound.init(); applySettings(); Sound.sfx("select");
  const a = b.dataset.act;
  if (a === "new") newGame();
  if (a === "continue") { const l = latestSave(); if (l) loadState(l.d); }
  if (a === "load") slotsMenu("load");
  if (a === "settings") settingsMenu();
  if (a === "quit") quitGame();
}));
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" && !$("#modal-box .pz-list")) closeModal(null); });

/* ===================== ១២. ចាប់ផ្តើម ===================== */
if ("ontouchstart" in window || navigator.maxTouchPoints > 0) document.body.classList.add("touch");
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    update(dt);
    if (G.mode === "explore") renderExplore();
    else if (G.mode === "scene") drawScene();
    else if (G.mode === "battle") renderBattle(dt);
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener("pointerdown", function first() {
  Sound.init(); applySettings();
  if (G.mode === "title") { Sound.playMusic("title"); Sound.setAmbient(["wind", "crickets"]); }
  window.removeEventListener("pointerdown", first);
}, { once: false });
window.addEventListener("beforeunload", () => { if (S && G.mode !== "title") autosave(); });
$("#btn-continue").disabled = !latestSave();
