/* បេសកកម្ម និងសាច់រឿងតាមជំពូក (ជំពូកទី ១ ពេញលេញ · ជំពូកផ្សេងនឹងបន្ថែមក្នុងដំណាក់ទី ២) */
import * as THREE from "three";
import { Engine } from "./engine.js";
import { World } from "./world.js";
import { Combat, Shadow, NPC, Boss } from "./actors.js";
import { UI, Bark, fillName } from "./ui.js";
import { Voice, LINES, linesWith } from "./voice.js";
import { VFX } from "./vfx.js";
import { Save, writeSave, kh, pick } from "./util.js";
import { Input } from "./input.js";
import { CameraRig } from "./camera.js";

const music = n => { try { Sound.playMusic(n); } catch (e) {} };
const sfx = n => { try { Sound.sfx(n); } catch (e) {} };
const wait = ms => new Promise(r => setTimeout(r, ms));

export const Quest = {
  G: null, interactables: [], marker: null, markerTarget: null, waiters: [], checkpoint: null,

  /* រង់ចាំលក្ខខណ្ឌ (ពិនិត្យរៀងរាល់ frame) */
  until(fn) { return new Promise(res => this.waiters.push({ fn, res })); },
  update(dt) {
    for (let i = this.waiters.length - 1; i >= 0; i--) if (this.waiters[i].fn()) { const w = this.waiters.splice(i, 1)[0]; w.res(); }
    // ប្រអប់ «ចុច F»
    const p = this.G.player.pos; let best = null, bd = 1e9;
    if (!UI.inDialogue) for (const it of this.interactables) { if (!it.active) continue; const d = it.pos.distanceTo(p); if (d < it.r && d < bd) { bd = d; best = it; } }
    UI.prompt(best ? best.label : "");
    if (best && Input.consume("interact")) { best.active = false; best.fn().then(() => { if (best.repeat) best.active = true; }); }
    else Input.consume("interact");
    // សញ្ញាគោលដៅ
    if (this.marker) {
      if (this.markerTarget) {
        this.marker.visible = true; this.marker.position.copy(this.markerTarget.position || this.markerTarget); this.marker.rotation.y += dt;
        const d = this.marker.position.distanceTo(p); this.marker.children[0].material.opacity = Math.min(0.22, Math.max(0, (d - 5) / 25) * 0.22);
      }
      else this.marker.visible = false;
    }
  },

  interact(pos, label, fn, r = 3.2, repeat = false) { const it = { pos, label, fn, r, active: true, repeat }; this.interactables.push(it); return it; },

  makeMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 13; g.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffe08a })); gem.position.y = 3.4; g.add(gem);
    Engine.scene.add(g); this.marker = g;
  },

  /* សន្ទនាតាម id ឃ្លា */
  talk(ids, extra = {}) {
    const G = this.G;
    const lines = ids.map(id => typeof id === "string" ? { id, ...LINES[id] } : id).filter(l => l.text);
    const avatars = { teacher: G.teacher.av, player: G.player.av, ...extra };
    G.setTalking(true);
    return UI.dialogue(lines, avatars).then(() => G.setTalking(false));
  },

  async run(G, ch) {
    this.G = G; this.interactables = []; this.waiters = [];
    if (!this.marker) this.makeMarker();
    if (ch.id === 1) return this.chapter1(G, ch);
  },

  /* ================= ជំពូកទី ១ ================= */
  async chapter1(G, ch) {
    const S = World.spots, P = G.player, T = G.teacher;
    const c = "c01";
    UI.npcs = ch.npcs; UI.bossName = ch.boss.name;
    this.checkpoint = S.spawn.clone();
    music("calm"); try { Sound.setAmbient(ch.ambient || ["wind"]); } catch (e) {}

    // NPC
    const peter = new NPC("peter", ch.npcs[0]); peter.place(S.peter, Math.PI);
    const poly = new NPC("polycarp", ch.npcs[1]); poly.place(S.polycarp, 0);
    G.npcs = [peter, poly];
    G.npcs.forEach(n => World.circles.push({ x: n.pos.x, z: n.pos.z, r: 0.5 }));
    const npcAv = { peter: peter.av, polycarp: poly.av };

    /* ---------- រឿងចាប់ផ្តើម + ហាត់បញ្ជា ---------- */
    if (!Save.introDone) {
      UI.objective(""); T.follow = false; T.place(S.teacherStart, Math.PI);
      await this.talk(linesWith("p_"));
      this.markerTarget = T.av.root; T.follow = false;
      await this.talk(["tut_00"]);
      UI.objective("ដើរទៅជិតលោកគ្រូ" + (Input.touch ? " (អូស Joystick ខាងឆ្វេង)" : " (W A S D · ចុចលើអេក្រង់ដើម្បីបង្វិលកាមេរ៉ាដោយកណ្តុរ)"));
      await this.until(() => P.pos.distanceTo(T.pos) < 3);
      await this.talk(["tut_01"]);
      this.markerTarget = new THREE.Vector3(0, 0, World.logZ - 2);
      UI.objective("លោតរំលងគល់ឈើ" + (Input.touch ? " (ប៊ូតុង ⤒)" : " (Space)"));
      await this.until(() => P.pos.z < World.logZ - 1);
      T.follow = true;
      await this.talk(["tut_02"]);
      UI.objective("គេចខ្លួនមួយដង" + (Input.touch ? " (ប៊ូតុង 💨)" : " (Shift)"));
      await this.until(() => P.state === "dash");
      await this.talk(["tut_03"]);
      const dummy = new Shadow(S.tutorialShadow, { hp: 40, dmg: 3, speed: 2.4 }); Combat.enemies.push(dummy);
      this.markerTarget = dummy.av.root;
      UI.objective("វាយស្រមោលជាឈុត" + (Input.touch ? " (ប៊ូតុង ⚔)" : " (ចុចកណ្តុរឆ្វេង ឬ J)"));
      await this.until(() => dummy.dead);
      await wait(800);
      await this.talk(["tut_04"]);
      const s1 = P.cd.skill1, s2 = P.cd.skill2; let u1 = false, u2 = false;
      UI.objective("សាកក្បាច់ពន្លឺ និងក្បាច់ខែល" + (Input.touch ? " (✦ និង 🛡)" : " (ចុច 1 និង 2)"));
      this.markerTarget = null;
      await this.until(() => { if (P.cd.skill1 > 0) u1 = true; if (P.cd.skill2 > 0) u2 = true; return u1 && u2; });
      P.en = 100; await wait(900);
      await this.talk(["tut_05"]);
      UI.toast(Input.touch ? "របារមាសពេញ៖ ចុចប៊ូតុង ✸ ដើម្បីប្រើក្បាច់ធំ" : "របារមាសពេញ៖ ចុច 3 ដើម្បីប្រើក្បាច់ធំ (Ultimate)", 4000);
      Save.introDone = true; writeSave();
    }

    /* ---------- ចូលក្រុង ---------- */
    S.camps.forEach(([x, z, n]) => { for (let i = 0; i < n; i++) Combat.enemies.push(new Shadow(new THREE.Vector3(x + (i - n / 2) * 1.6, 0, z + (i % 2) * 1.5), { name: ch.enemy.name })); });
    await this.talk([c + "_area_00", ...linesWith(c + "_intro_"), c + "_quest_00", "g_player_quest_00"]);
    this.checkpoint = new THREE.Vector3(0, 0, 36);

    // ពេត្រុស
    let metPeter = false;
    UI.objective("ជួប" + ch.npcs[0].name + "នៅទីលានកណ្តាលក្រុង");
    this.markerTarget = peter.av.root;
    this.interact(peter.pos, "និយាយជាមួយ " + ch.npcs[0].name, async () => {
      peter.talking = true; await this.talk(linesWith(c + "_peter_"), npcAv); peter.talking = false; metPeter = true;
    });
    await this.until(() => metPeter);
    await this.talk([c + "_quest_01"]);
    this.checkpoint = new THREE.Vector3(0, 0, -20);

    // ក្រាំង ៣ និងប៉ូលីកាប
    let found = 0, metPoly = false;
    const scrolls = S.scrolls.map((p, k) => this.spawnScroll(p, k, ch, () => { found++; refresh(); }));
    const refresh = () => {
      UI.objective(`ស្វែងរកក្រាំង (${kh(found)}/៣) · ${metPoly ? "✔" : ""} និយាយជាមួយ ${ch.npcs[1].name}`);
      const next = scrolls.find(s => !s.taken);
      this.markerTarget = next ? next.mesh : (metPoly ? null : poly.av.root);
    };
    refresh();
    this.interact(poly.pos, "និយាយជាមួយ " + ch.npcs[1].name, async () => {
      poly.talking = true;
      await this.talk(linesWith(c + "_polycarp_").filter(id => !/_r\d_/.test(id)), npcAv);
      const npc = ch.npcs[1];
      if (npc.choice) {
        const k = await UI.choice(npc.choice.prompt, npc.choice.options);
        Save.faith = (Save.faith || 0) + (npc.choice.options[k].faith || 0);
        await this.talk(linesWith(`${c}_polycarp_r${k}_`), npcAv);
      }
      poly.talking = false; metPoly = true; refresh();
    });
    await this.until(() => found >= 3 && metPoly);

    // ផ្ទាំងថ្ម
    UI.objective("ដោះប្រស្នាលើផ្ទាំងថ្ម នៅមុខទីលានប្រកួត");
    this.markerTarget = World.tabletPos;
    let solved = false;
    this.interact(World.tabletPos, "អានផ្ទាំងថ្ម", async () => {
      G.setTalking(true); await UI.orderPuzzle(ch.puzzle); G.setTalking(false); solved = true;
    }, 3);
    await this.until(() => solved);
    this.openGate(0); sfx("gate");
    await this.talk([c + "_quest_02"]);

    /* ---------- Boss ---------- */
    UI.objective("ចូលទៅក្នុងទីលានប្រកួត");
    this.markerTarget = S.arenaCenter;
    const boss = new Boss(S.arenaCenter.clone().add(new THREE.Vector3(0, 0, -6)), { name: ch.boss.name, hp: 1100 });
    await this.until(() => P.pos.distanceTo(S.arenaCenter) < 17);
    this.markerTarget = null; UI.objective("");
    this.checkpoint = S.arenaGate.clone().add(new THREE.Vector3(0, 0, -4));
    Bark.say("g_narr_checkpoint_00", null, 2);
    G.darken(true); music("boss");
    boss.faceTo(P.pos);
    await this.talk(["g_narr_bossappear_00", c + "_boss_00"], { boss: boss.av });
    Combat.boss = boss; Combat.enemies.push(boss); boss.awake = true; boss.state = "think"; boss.cool = 1;
    Combat.onBossPhase = (b, n) => {
      Bark.say(`${c}_bossp${n}_00`, b.av, 3);
      if (n === 3) setTimeout(() => { Bark.say(pick(["g_teacher_ult_00", "g_teacher_ult_01"]), T.av, 1); VFX.pillar(b.pos.clone(), 0xfff0b0, 3, 36, 1.2); b.hp -= 40; }, 3500);
      G.darken(true, n);
    };
    let bossDown = false;
    Combat.onBossDown = b => { bossDown = true; Bark.say(`${c}_bossfall_00`, b.av, 3); };
    await this.until(() => bossDown);
    await wait(4500);
    Combat.boss = null; UI.bossBar(null); G.darken(false); music("ending");
    T.av.play("Cheer", { once: true }); P.av.play("Cheer", { once: true });

    /* ---------- ឈ្នះ ---------- */
    await this.talk(["g_player_victory_00", "g_teacher_victory_00"]);
    G.setTalking(true);
    const score = await UI.quiz(ch.questions, 3);
    G.setTalking(false);
    UI.toast(`ឆ្លើយត្រូវ ${kh(score)}/៣`, 3000);
    await this.talk([...linesWith(c + "_outro_"), c + "_clear_00", c + "_clear_01"]);
    if (!Save.cleared.includes(1)) Save.cleared.push(1); writeSave();
    G.chapterComplete(ch, score);
  },

  spawnScroll(pos, k, ch, onTake) {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xf3e2b5, emissive: 0x6b4a10, emissiveIntensity: 0.6 }));
    paper.rotation.z = Math.PI / 2; g.add(paper);
    [-0.5, 0.5].forEach(x => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x6b3d1f })); r.position.x = x; g.add(r); });
    const halo = VFX.sprite(0xffd36b, 2.2); g.add(halo);
    const light = new THREE.PointLight(0xffd36b, 6, 6, 2); g.add(light);
    g.position.copy(pos).setY(1.2); Engine.scene.add(g);
    const s = { mesh: g, taken: false };
    const base = 1.2;
    this.until(() => { g.position.y = base + Math.sin(performance.now() / 400 + k) * 0.15; g.rotation.y += 0.02; return s.taken; });
    this.until(() => !s.taken && !UI.inDialogue && this.G.player.pos.distanceTo(g.position.clone().setY(0)) < 1.6).then(async () => {
      s.taken = true; Engine.scene.remove(g); sfx("pickup"); VFX.burst(pos.clone().setY(1.2), 0xffd36b, 24, 5);
      Bark.say("g_player_item_00", this.G.player.av, 2);
      const sc = ch.scrolls[k];
      await wait(700);
      await this.talk([{ id: `c01_scroll${k}_00`, speaker: "narr", text: sc.title + "។ " + sc.text + (sc.ref ? ` (${sc.ref})` : "") }]);
      onTake();
    });
    return s;
  },

  openGate(i) {
    const gt = World.gates[i]; if (!gt || gt.open) return;
    gt.open = true; gt.box.off = true;
    const m = gt.mesh, y0 = m.position.y;
    this.until(() => { m.position.y -= 0.06; return m.position.y < y0 - 6.2; });
  },

  /* ពេលអ្នកលេងដួល៖ លោកគ្រូជួយឲ្យក្រោកវិញ */
  async onPlayerDown() {
    const G = this.G;
    await wait(1600);
    Bark.say("g_narr_gameover_00", null, 3);
    UI.fade(true); await wait(900);
    G.player.place(this.checkpoint, CameraRig.yaw + Math.PI);
    G.teacher.place(this.checkpoint.clone().add(new THREE.Vector3(1.5, 0, 1.5)));
    G.player.revive();
    Combat.enemies.forEach(e => { if (e.state === "chase" || e.state === "attack") e.state = "idle"; });
    UI.fade(false); await wait(600);
    Bark.say(pick(["g_teacher_revive_00", "g_player_revive_00"]), G.teacher.av, 3);
  }
};
