/* ដំណើរផ្សងព្រេងនៃពួកជំនុំ — កំណែ 3D Action-Adventure RPG */
import * as THREE from "three";
import { Engine } from "./engine.js";
import { loadAssets, makePortraits } from "./assets.js";
import { Input } from "./input.js";
import { CameraRig } from "./camera.js";
import { World } from "./world.js";
import { Combat, Player, Teacher } from "./actors.js";
import { UI, Bark } from "./ui.js";
import { Voice, buildLines } from "./voice.js";
import { VFX, updateNumbers } from "./vfx.js";
import { Quest } from "./quest.js";
import { Settings, Save, writeSave, kh, saveSettings } from "./util.js";

const $ = id => document.getElementById(id);
window.Combat = Combat;
const G = window.G = {
  mode: "loading", player: null, teacher: null, npcs: [], chapter: null, paused: false, t: 0,

  setTalking(on) {
    this.talking = on; Input.enabled = !on; this.player.frozen = on;
    Combat.paused = on;
    if (on) Input.clearPressed();
    document.body.classList.toggle("talking", on);
  },
  darken(on, phase = 2) {
    if (!on) return Engine.setSky(World.sky);
    Engine.setSky(Object.assign({}, World.sky, phase >= 3
      ? { elevation: 3, turbidity: 18, rayleigh: 3.5, sunColor: 0xff3a2a, sunIntensity: 1.6, fog: 0x3a1420, fogNear: 30, fogFar: 160, exposure: 0.75, hemi: 0.5, skyColor: 0x8a5070 }
      : { elevation: 9, turbidity: 12, rayleigh: 3, sunColor: 0xff8a50, sunIntensity: 2.1, fog: 0x7a4a48, fogNear: 45, fogFar: 220, exposure: 0.8, hemi: 0.7 }));
  },
  chapterComplete(ch, score) {
    this.setTalking(true); if (document.pointerLockElement) document.exitPointerLock();
    const el = $("panel"); el.classList.remove("hidden");
    el.innerHTML = `<h2>🎉 បានឆ្លងផុតជំពូកទី ${kh(ch.id)}</h2><p class="q">${ch.title}</p><p class="muted">ឆ្លើយសំណួរត្រូវ ${kh(score)}/៣ · ភាពស្មោះត្រង់ ${kh(Save.faith || 0)}</p>
      <p class="muted small">ជំពូកទី ២–១៥ នឹងបន្ថែមក្នុងដំណាក់កាលបន្ទាប់។</p><button class="btn gold" id="cc-ok">ត្រឡប់ទៅទំព័រដើម</button>`;
    $("cc-ok").onclick = () => location.reload();
  }
};

/* ---------- ចាប់ផ្តើម ---------- */
async function boot() {
  if (/[?&]voices\b/.test(location.search)) { location.replace("voices.html" + location.search); return; }
  buildLines();
  Engine.init($("game"));
  Input.init($("game"));
  const vp = Voice.load();
  $("load-fill").style.width = "5%";
  try {
    await loadAssets(p => $("load-fill").style.width = (5 + p * 90) + "%");
  } catch (e) { $("load-text").textContent = "មិនអាចផ្ទុកតួអង្គបានទេ៖ " + e.message; return; }
  await vp;
  UI.portraits = makePortraits(Engine.renderer, ["player", "teacher", "peter", "polycarp", "boss"]);
  document.querySelector("#stats .me").src = UI.portraits.player;
  // ផែនទីជំពូកទី ១ ជាផ្ទៃខាងក្រោយនៃទំព័រដើម
  G.chapter = CHAPTERS[0];
  World.build(G.chapter);
  CameraRig.colliders = World.camColliders;
  G.player = new Player(); G.teacher = new Teacher();
  Combat.player = G.player; Combat.teacher = G.teacher;
  G.player.place(World.spots.spawn, Math.PI); G.teacher.place(World.spots.teacherStart, Math.PI);
  CameraRig.reset(0); CameraRig.target.copy(G.player.pos);
  Combat.onPlayerDown = () => Quest.onPlayerDown();
  Combat.onEnemyKilled = () => { if (Math.random() < 0.35) G.teacher.cheer(); };
  $("loading").classList.add("hidden");
  G.mode = "title"; showTitle();
  requestAnimationFrame(loop);
}

function unlockAudio() {
  try { Sound.init(); Sound.setVolumes({ music: Settings.musicVol, sfx: Settings.sfxVol }); } catch (e) {}
  Voice.unlock();
}

function showTitle() {
  UI.show("title", true); UI.show("hud", false);
  $("btn-start").onclick = () => { unlockAudio(); try { Sound.sfx("select"); } catch (e) {} askName(); };
  $("btn-settings").onclick = () => { unlockAudio(); openSettings(() => showTitle()); };
  $("btn-classic").onclick = () => location.href = "index.html";
  try { Sound.playMusic("title"); } catch (e) {}
}

function askName() {
  UI.show("title", false);
  if (Save.name) return chapterSelect();
  const el = $("panel"); el.classList.remove("hidden");
  el.innerHTML = `<h2>តើអ្នកឈ្មោះអ្វី?</h2><input id="nm" maxlength="20" placeholder="សរសេរឈ្មោះរបស់អ្នក" autocomplete="off"><button class="btn gold" id="nm-ok">បន្ត ▶</button>`;
  const go = () => { Save.name = ($("nm").value || "").trim() || "មិត្ត"; writeSave(); el.classList.add("hidden"); chapterSelect(); };
  $("nm-ok").onclick = go; $("nm").onkeydown = e => { if (e.key === "Enter") go(); };
  setTimeout(() => $("nm").focus(), 50);
}

function chapterSelect() {
  const el = $("panel"); el.classList.remove("hidden");
  el.innerHTML = `<h2>ជ្រើសរើសសម័យកាល</h2><div class="chapters">${CHAPTERS.map(c => {
    const ok = c.id === 1, done = Save.cleared.includes(c.id);
    return `<button class="chap ${ok ? "" : "locked"}" data-id="${c.id}" ${ok ? "" : "disabled"}><b>ជំពូកទី ${kh(c.id)}</b><span>${c.title}</span><i>${ok ? c.years : "🔒 កំពុងរៀបចំ"}${done ? " ✔" : ""}</i></button>`;
  }).join("")}</div><button class="btn small" id="cs-back">◀ ត្រឡប់</button>`;
  el.querySelectorAll(".chap:not(.locked)").forEach(b => b.onclick = () => { el.classList.add("hidden"); startChapter(+b.dataset.id); });
  $("cs-back").onclick = () => { el.classList.add("hidden"); showTitle(); };
}

async function startChapter(id) {
  UI.fade(true);
  await new Promise(r => setTimeout(r, 500));
  G.chapter = CHAPTERS.find(c => c.id === id);
  G.mode = "play"; UI.show("hud", true);
  document.body.classList.add("playing");
  CameraRig.reset(0);
  UI.fade(false);
  Quest.run(G, G.chapter);
}

/* ---------- ផ្អាក ---------- */
function openPause() {
  if (G.mode !== "play" || G.paused) return;
  G.paused = true; Input.clearPressed();
  if (document.pointerLockElement) document.exitPointerLock();
  const el = $("pause"); el.classList.remove("hidden");
  el.innerHTML = `<h2>⏸ ផ្អាក</h2><button class="btn gold" id="pz-resume">▶ បន្តលេង</button><button class="btn" id="pz-set">⚙ ការកំណត់</button>
    <div class="keys muted small">${Input.touch ? "Joystick ខាងឆ្វេង៖ ដើរ · អូសខាងស្តាំ៖ បង្វិលកាមេរ៉ា · ម្រាមដៃពីរ៖ Zoom" :
    "W A S D ដើរ · កណ្តុរ បង្វិលកាមេរ៉ា · កង់កណ្តុរ Zoom · ចុចឆ្វេង វាយ · ចុចស្តាំ/2 ខែល · 1 ពន្លឺ · 3 ក្បាច់ធំ · Space លោត · Shift គេច · F និយាយ"}</div>
    <button class="btn small" id="pz-quit">ចាកចេញទៅទំព័រដើម</button>`;
  $("pz-resume").onclick = closePause;
  $("pz-set").onclick = () => openSettings(() => { G.paused = false; openPause(); });
  $("pz-quit").onclick = () => location.reload();
}
function closePause() { $("pause").classList.add("hidden"); $("panel").classList.add("hidden"); G.paused = false; }
function openSettings(back) {
  const el = $("pause"); el.classList.remove("hidden");
  el.innerHTML = UI.settingsHTML() + `<button class="btn gold" id="set-back">✔ រួចរាល់</button>`;
  UI.bindSettings(q => Engine.setQuality(q));
  $("set-back").onclick = () => { saveSettings(); el.classList.add("hidden"); back && back(); };
}
document.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement && G.mode === "play" && !G.talking && !G.paused && !Input.touch) openPause(); });
$("btn-pause").onclick = () => openPause();
$("btn-pause").ontouchstart = e => { e.preventDefault(); openPause(); };

/* ---------- រង្វិលជុំហ្គេម ---------- */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(G.dtMax || 0.05, (now - last) / 1000); last = now;
  if (G.paused) { Engine.render(); return; }
  G.t += dt;
  Input.update();
  if (Input.consume("pause")) openPause();
  if (UI.inDialogue && ["advance", "jump", "attack", "interact"].some(k => Input.consume(k))) UI.advance();

  Voice.update(); Bark.update(dt); UI.updateTalk();
  const P = G.player;
  if (G.mode === "title") {
    CameraRig.yaw += dt * 0.08;
    CameraRig.update(dt, P.pos, { x: 0, y: 0, z: 0 });
    P.sync(dt); G.teacher.sync(dt);
  } else if (G.mode === "play") {
    if (!Combat.paused) { P.update(dt); Combat.update(dt); }
    else P.update(dt);
    G.teacher.update(dt, P);
    G.npcs.forEach(n => n.update(dt, P));
    Quest.update(dt);
    const look = Input.takeLook();
    CameraRig.update(dt, P.pos, look);
    UI.hud(P); UI.bossBar(Combat.boss);
  }
  VFX.update(dt); updateNumbers(dt);
  Engine.followSun(P.pos);
  Engine.render();
}

boot();
