/* តួអង្គ៖ អ្នកលេង លោកគ្រូ NPC ពួកស្រមោល Boss · ប្រព័ន្ធប្រយុទ្ធ */
import * as THREE from "three";
import { Engine } from "./engine.js";
import { Avatar, getClipDuration } from "./assets.js";
import { Input } from "./input.js";
import { CameraRig } from "./camera.js";
import { World } from "./world.js";
import { VFX, damageNumber } from "./vfx.js";
import { clamp, angleDamp, rand, pick, kh } from "./util.js";
import { Bark } from "./ui.js";

const V = () => new THREE.Vector3();
const sfx = n => { try { Sound.sfx(n); } catch (e) {} };
const GRAV = -22;

/* ================= ប្រព័ន្ធប្រយុទ្ធ ================= */
export const Combat = {
  player: null, teacher: null, enemies: [], projectiles: [], boss: null, paused: false,
  reset() { this.enemies.forEach(e => e.remove()); this.enemies = []; this.projectiles.forEach(p => Engine.scene.remove(p.mesh)); this.projectiles = []; this.boss = null; },
  nearestEnemy(pos, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const e of this.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(pos); if (d < bd) { bd = d; best = e; } }
    return best;
  },
  /* វាយក្នុងមុំខាងមុខ */
  hitArc(pos, facing, range, arc, dmg, kb = 4) {
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = V().subVectors(e.pos, pos); d.y = 0; const dist = d.length() - e.radius;
      if (dist > range) continue;
      const ang = Math.atan2(d.x, d.z); let da = ang - facing; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > arc && dist > 0.6) continue;
      e.damage(dmg, d.normalize().multiplyScalar(kb)); hits++;
    }
    return hits;
  },
  hitRadius(pos, radius, dmg, kb = 6, stun = 0) {
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = V().subVectors(e.pos, pos); d.y = 0;
      if (d.length() - e.radius > radius) continue;
      e.damage(dmg, d.normalize().multiplyScalar(kb)); if (stun) e.stun = Math.max(e.stun, stun); hits++;
    }
    return hits;
  },
  shoot(o) {   // {from, dir, speed, dmg, owner, color, size, range, splash}
    const mesh = VFX.orb(o.color, o.size || 0.5);
    mesh.position.copy(o.from);
    this.projectiles.push({ ...o, mesh, vel: o.dir.clone().normalize().multiplyScalar(o.speed), dist: 0 });
  },
  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; const step = p.vel.clone().multiplyScalar(dt);
      p.mesh.position.add(step); p.dist += step.length();
      let hit = false;
      if (p.owner === "player") {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (V().subVectors(e.pos, p.mesh.position).setY(0).length() < e.radius + 0.6 && Math.abs(p.mesh.position.y - (e.pos.y + e.height * 0.5)) < e.height) { hit = true; break; }
        }
        if (hit) { this.hitRadius(p.mesh.position, p.splash || 1.5, p.dmg, 5); VFX.burst(p.mesh.position, p.color, 18, 6); VFX.ring(p.mesh.position.clone().setY(0), p.color, (p.splash || 1.5) + 1, 0.4); sfx("hit"); }
      } else {
        const pl = this.player;
        if (!pl.dead && V().subVectors(pl.pos, p.mesh.position).setY(0).length() < 0.8 && Math.abs(p.mesh.position.y - (pl.pos.y + 1)) < 1.4) { hit = true; pl.damage(p.dmg, p.vel.clone().setY(0).normalize().multiplyScalar(5)); VFX.burst(p.mesh.position, p.color, 12, 4); }
      }
      if (hit || p.dist > (p.range || 30) || p.mesh.position.y < 0) {
        Engine.scene.remove(p.mesh); p.mesh.traverse(o => { o.geometry && o.geometry.dispose(); });
        this.projectiles.splice(i, 1);
      }
    }
    this.enemies.forEach(e => e.update(dt));
    this.enemies = this.enemies.filter(e => !e.gone);
  }
};

/* ================= មូលដ្ឋានតួអង្គ ================= */
class Actor {
  constructor(look, height) {
    this.av = new Avatar(look, { height });
    this.pos = this.av.root.position; this.facing = 0; this.vy = 0; this.height = height || 1.75; this.radius = 0.45;
    Engine.scene.add(this.av.root);
  }
  place(p, facing = 0) { this.pos.copy(p); this.facing = facing; this.av.root.rotation.y = facing; }
  faceTo(p, dt, k = 12) { const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.facing = dt ? angleDamp(this.facing, a, k, dt) : a; }
  remove() { Engine.scene.remove(this.av.root); this.gone = true; }
  sync(dt) { this.av.root.rotation.y = this.facing; this.av.update(dt); }
}

/* ================= អ្នកលេង ================= */
export class Player extends Actor {
  constructor() {
    super("player", 1.7);
    this.maxHp = 120; this.hp = 120; this.st = 100; this.en = 0;
    this.cd = { skill1: 0, skill2: 0 }; this.cdMax = { skill1: 5, skill2: 12 };
    this.state = "move"; this.stateT = 0; this.combo = 0; this.comboWindow = 0; this.iframe = 0; this.shield = 0; this.grounded = true;
    this.frozen = false; this.lowWarned = false;
    this.av.play("Idle");
  }
  get dead() { return this.state === "dead"; }

  setState(s) { this.state = s; this.stateT = 0; }

  update(dt) {
    const I = Input, mv = I.move;
    this.stateT += dt;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.iframe = Math.max(0, this.iframe - dt); this.shield = Math.max(0, this.shield - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt); if (this.comboWindow === 0 && this.state === "move") this.combo = 0;
    if (this.state !== "dash") this.st = Math.min(100, this.st + dt * 22);

    // ទិសដៅតាមកាមេរ៉ា
    const f = CameraRig.forward(), r = CameraRig.right();
    const wish = V().addScaledVector(f, mv.y).addScaledVector(r, mv.x);
    const mag = Math.min(1, wish.length()); if (mag > 0.01) wish.normalize();

    if (this.frozen || this.dead) {
      if (!this.dead && this.av.currentName !== "Idle" && this.grounded) this.av.play("Idle");
      this.gravity(dt); this.sync(dt); return;
    }

    // សកម្មភាព
    if (this.state === "move" || (this.state === "attack" && this.stateT > this.atkDur * 0.55)) {
      if (I.consume("dash")) this.dash(wish, mag);
      else if (I.consume("skill3")) this.ultimate();
      else if (I.consume("skill1")) this.skill1();
      else if (I.consume("skill2")) this.skill2();
      else if (I.consume("attack")) this.attack();
      else if (I.consume("jump") && this.grounded && this.state === "move") { this.vy = 8; this.grounded = false; this.av.play("Jump_Start", { once: true, speed: 1.4, onDone: () => { if (!this.grounded) this.av.play("Jump_Idle"); } }); sfx("select"); }
    } else { I.consume("dash"); }

    let speed = 0;
    if (this.state === "move") {
      speed = mag * 6.4;
      if (mag > 0.05) this.facing = angleDamp(this.facing, Math.atan2(wish.x, wish.z), 14, dt);
      this.pos.addScaledVector(wish, speed * dt);
      if (this.grounded) {
        const want = mag < 0.06 ? "Idle" : mag < 0.6 ? "Walking_A" : "Running_A";
        if (this.av.currentName !== want && !(this.av.currentName === "Jump_Land" && this.stateT < 0.2)) this.av.play(want, { speed: want === "Walking_A" ? 0.6 + mag : 1 });
      }
    } else if (this.state === "attack") {
      if (this.stateT < this.atkDur * 0.4) this.pos.addScaledVector(V().set(Math.sin(this.facing), 0, Math.cos(this.facing)), 2.2 * dt);
      if (!this.atkHit && this.stateT >= this.atkDur * 0.38) { this.atkHit = true; this.doHit(); }
      if (this.stateT >= this.atkDur) { this.setState("move"); this.comboWindow = 0.55; }
    } else if (this.state === "dash") {
      const k = 1 - this.stateT / 0.34;
      this.pos.addScaledVector(this.dashDir, 17 * Math.max(0.2, k) * dt);
      if (this.stateT > 0.34) this.setState("move");
    } else if (this.state === "skill") {
      if (this.skillFn && this.stateT >= this.skillAt) { const fn = this.skillFn; this.skillFn = null; fn(); }
      if (this.stateT >= this.skillDur) this.setState("move");
    } else if (this.state === "hurt") {
      if (this.stateT > 0.38) this.setState("move");
    }
    this.gravity(dt);
    World.resolve(this.pos, this.radius);
    if (!this.lowWarned && this.hp < this.maxHp * 0.3) { this.lowWarned = true; Bark.say("g_player_lowhp_00", this.av, 2); }
    if (this.hp > this.maxHp * 0.6) this.lowWarned = false;
    this.sync(dt);
  }

  gravity(dt) {
    this.vy += GRAV * dt; this.pos.y += this.vy * dt;
    const gy = World.height(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      if (!this.grounded) { this.grounded = true; if (this.state === "move" && !this.dead) { this.av.play("Jump_Land", { once: true, speed: 2 }); this.stateT = 0; } }
      this.vy = 0;
    }
  }

  softLock(range = 7) {
    const e = Combat.nearestEnemy(this.pos, range);
    if (e) this.facing = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    return e;
  }

  attack() {
    const anims = ["1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Chop"];
    this.combo = (this.state === "attack" || this.comboWindow > 0) ? (this.combo % 3) + 1 : 1;
    this.softLock();
    this.setState("attack"); this.atkHit = false;
    const sp = this.combo === 3 ? 1.5 : 1.9;
    this.atkDur = this.av.play(anims[this.combo - 1], { once: true, speed: sp, restart: true, fade: 0.08 }) * 0.8;
    if (Math.random() < 0.18) Bark.say(pick(["g_player_atk_00", "g_player_atk_01", "g_player_atk_02"]), this.av, 0);
  }
  doHit() {
    const dmg = [0, 14, 16, 26][this.combo];
    const front = V().set(Math.sin(this.facing), 1.1, Math.cos(this.facing)).multiplyScalar(1).add(this.pos);
    VFX.burst(front.clone().addScaledVector(V().set(Math.sin(this.facing), 0, Math.cos(this.facing)), 0.8), 0xffe7a0, 6, 3, 0.25, 0.25);
    const n = Combat.hitArc(this.pos, this.facing, this.combo === 3 ? 3.0 : 2.6, 1.1, dmg, this.combo === 3 ? 7 : 3);
    if (n) { this.en = Math.min(100, this.en + 7 * n); sfx("hit"); if (this.combo === 3) Engine.addShake(0.25); }
  }

  dash(wish, mag) {
    if (this.st < 25) { Bark.say("g_player_noenergy_00", this.av, 0); return; }
    this.st -= 25; this.iframe = 0.32;
    this.dashDir = mag > 0.1 ? wish.clone() : V().set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.setState("dash"); this.av.play("Dodge_Forward", { once: true, speed: 1.8, restart: true, fade: 0.06 });
    VFX.burst(this.pos.clone().setY(0.3), 0xd9c9a8, 8, 3, 0.5, 0.4);
    if (Math.random() < 0.2) Bark.say("g_player_dash_00", this.av, 0);
  }

  startSkill(anim, speed, at, fn, line) {
    this.setState("skill");
    this.skillDur = this.av.play(anim, { once: true, speed, restart: true, fade: 0.1 }) * 0.85;
    this.skillAt = this.skillDur * at; this.skillFn = fn;
    if (line) Bark.say(line, this.av, 1);
  }
  skill1() {
    if (this.cd.skill1 > 0) return;
    this.cd.skill1 = this.cdMax.skill1; this.softLock(16);
    this.startSkill("Spellcast_Shoot", 1.5, 0.4, () => {
      const dir = V().set(Math.sin(this.facing), 0, Math.cos(this.facing));
      Combat.shoot({ from: this.pos.clone().add(V().set(0, 1.3, 0)).addScaledVector(dir, 0.8), dir, speed: 24, dmg: 42, owner: "player", color: 0xffd36b, size: 0.7, range: 28, splash: 2.6 });
      sfx("heal");
    }, pick(["g_player_s1_00", "g_player_s1_01"]));
  }
  skill2() {
    if (this.cd.skill2 > 0) return;
    this.cd.skill2 = this.cdMax.skill2;
    this.startSkill("Spellcast_Raise", 1.6, 0.35, () => {
      this.shield = 5; this.heal(18);
      VFX.aura(this.av.root, 0x9fd8ff, 5, 1.3); VFX.ring(this.pos.clone(), 0x9fd8ff, 5, 0.5);
      Combat.hitRadius(this.pos, 4.2, 10, 9); sfx("shield");
    }, pick(["g_player_s2_00", "g_player_s2_01"]));
  }
  ultimate() {
    if (this.en < 100) { Bark.say("g_player_noenergy_00", this.av, 0); return; }
    this.en = 0; this.iframe = 1.6;
    this.startSkill("2H_Melee_Attack_Spin", 1.1, 0.45, () => {
      const c = this.pos.clone();
      VFX.pillar(c, 0xfff0b0, 2.6, 34, 1.3); VFX.ring(c, 0xffe39a, 10, 0.8); VFX.burst(c.clone().setY(1), 0xffe7a0, 40, 10, 0.5, 1);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const p = c.clone().add(V().set(Math.cos(a) * 5, 0, Math.sin(a) * 5)); setTimeout(() => VFX.pillar(p, 0xfff6cc, 1.1, 26, 0.8), 80 * i); }
      Combat.hitRadius(c, 8.5, 130, 10, 2.2); Engine.addShake(0.9); sfx("levelup");
    }, pick(["g_player_ult_00", "g_player_ult_01"]));
  }

  heal(v) { const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + v); if (this.hp > before) damageNumber(this.pos, "+" + kh(Math.round(this.hp - before)), "heal"); }

  damage(d, kb) {
    if (this.dead || this.iframe > 0 || this.frozen) return;
    if (this.shield > 0) d *= 0.3;
    d = Math.round(d); this.hp -= d; this.av.hitFlash(); damageNumber(this.pos, "-" + kh(d), "hurt"); sfx("hurt");
    Engine.addShake(0.2); this.iframe = 0.35;
    if (kb) this.pos.addScaledVector(kb, 0.12);
    if (this.hp <= 0) { this.hp = 0; this.setState("dead"); this.av.play("Death_A", { once: true }); Combat.onPlayerDown && Combat.onPlayerDown(); return; }
    if (this.state !== "skill") { this.setState("hurt"); this.av.play(pick(["Hit_A", "Hit_B"]), { once: true, speed: 1.6, restart: true, fade: 0.05 }); }
    if (Math.random() < 0.25) Bark.say(pick(["g_player_hurt_00", "g_player_hurt_01"]), this.av, 0);
  }
  revive() { this.hp = this.maxHp; this.st = 100; this.setState("move"); this.av.play("Idle", { restart: true }); this.iframe = 2; }
}

/* ================= លោកគ្រូ វ៉ាន់ដា (ដៃគូ) ================= */
export class Teacher extends Actor {
  constructor() { super("teacher", 1.78); this.castCd = 2; this.healCd = 0; this.cheerCd = 8; this.casting = 0; this.follow = true; this.av.play("Idle"); }
  update(dt, player) {
    this.castCd -= dt; this.healCd -= dt; this.cheerCd -= dt; this.casting -= dt;
    const enemy = Combat.nearestEnemy(player.pos, 15);
    let goal = null;
    if (this.follow) {
      const back = V().set(Math.sin(player.facing + 2.4), 0, Math.cos(player.facing + 2.4)).multiplyScalar(2.6);
      goal = player.pos.clone().add(back); goal.y = 0;
    }
    if (enemy && this.follow) {
      const de = enemy.pos.distanceTo(this.pos);
      if (de > 10) goal = enemy.pos.clone().add(V().subVectors(this.pos, enemy.pos).setY(0).normalize().multiplyScalar(8));
      if (this.castCd <= 0 && de < 13 && this.casting <= 0) {
        this.castCd = rand(2.6, 3.6); this.casting = 0.7; this.faceTo(enemy.pos);
        this.av.play("Spellcast_Shoot", { once: true, speed: 1.4, restart: true });
        setTimeout(() => {
          if (enemy.dead) return;
          const from = this.pos.clone().add(V().set(0, 1.4, 0));
          Combat.shoot({ from, dir: V().subVectors(enemy.pos.clone().setY(1.1), from), speed: 20, dmg: 12, owner: "player", color: 0xfff3c0, size: 0.45, range: 22, splash: 1.4 });
        }, 300);
        if (Math.random() < 0.15) Bark.say("g_teacher_s1_00", this.av, 0);
      }
    }
    if (player.hp < player.maxHp * 0.35 && this.healCd <= 0 && !player.dead) {
      this.healCd = 16; this.casting = 1; this.faceTo(player.pos);
      this.av.play("Spellcast_Raise", { once: true, speed: 1.3, restart: true });
      setTimeout(() => { player.heal(40); VFX.pillar(player.pos.clone(), 0xb8ffd0, 1.2, 12, 0.8); sfx("heal"); }, 400);
      Bark.say(pick(["g_teacher_heal_00", "g_teacher_warn_01", "g_teacher_s2_00"]), this.av, 1);
    }
    if (this.casting <= 0 && goal) {
      const d = V().subVectors(goal, this.pos).setY(0), dist = d.length();
      if (dist > 30) this.pos.copy(goal);
      else if (dist > 1.2) {
        const sp = Math.min(6.8, dist * 2); d.normalize();
        this.pos.addScaledVector(d, sp * dt); this.facing = angleDamp(this.facing, Math.atan2(d.x, d.z), 10, dt);
        this.av.play(sp > 3.5 ? "Running_A" : "Walking_A");
      } else { this.faceTo(enemy ? enemy.pos : player.pos, dt, 4); this.av.play("Idle"); }
      World.resolve(this.pos, 0.45);
    }
    this.pos.y = World.height(this.pos.x, this.pos.z);
    this.sync(dt);
  }
  cheer() { if (this.cheerCd > 0) return; this.cheerCd = 14; Bark.say(pick(["g_teacher_cheer_00", "g_teacher_cheer_01"]), this.av, 0); }
}

/* ================= NPC ================= */
export class NPC extends Actor {
  constructor(look, data) { super(look, 1.75); this.data = data; this.av.play("Idle"); this.talking = false; }
  update(dt, player) {
    if (player.pos.distanceTo(this.pos) < 6 || this.talking) this.faceTo(player.pos, dt, 4);
    this.sync(dt);
  }
}

/* ================= ស្រមោល (សត្រូវតូច) ================= */
export class Shadow extends Actor {
  constructor(home, o = {}) {
    super("shadow", o.height || 1.6);
    this.home = home.clone(); this.place(home, rand(0, 6));
    this.maxHp = this.hp = o.hp || 45; this.dmg = o.dmg || 9; this.speed = o.speed || 3.6;
    this.state = "idle"; this.t = rand(0, 2); this.stun = 0; this.kb = V(); this.wander = home.clone();
    this.av.play("Idle"); this.name = o.name || "";
    this.bar = makeBar(); this.av.root.add(this.bar.sprite); this.bar.sprite.position.y = this.height + 0.5;
    this.av.setOpacity(0.92);
  }
  get dead() { return this.state === "dead"; }
  damage(d, kb) {
    if (this.dead) return;
    d = Math.round(d * rand(0.9, 1.1)); this.hp -= d; this.av.hitFlash(); damageNumber(this.pos, kh(d));
    if (kb) this.kb.add(kb);
    this.bar.set(this.hp / this.maxHp); this.bar.sprite.visible = true;
    if (this.hp <= 0) return this.die();
    if (this.state !== "attack" || d > 20) { this.state = "hurt"; this.t = 0.3; this.av.play("Hit_B", { once: true, speed: 1.5, restart: true, fade: 0.05 }); }
  }
  die() {
    this.state = "dead"; this.t = 1.4; this.av.play("Death_A", { once: true, speed: 1.3 }); this.bar.sprite.visible = false;
    VFX.burst(this.pos.clone().setY(1), 0xb88cff, 22, 5, 0.4, 0.8); sfx("defeat");
    Combat.onEnemyKilled && Combat.onEnemyKilled(this);
  }
  update(dt) {
    const pl = Combat.player;
    this.t -= dt; this.stun = Math.max(0, this.stun - dt);
    if (this.kb.lengthSq() > 0.001) { this.pos.addScaledVector(this.kb, dt); this.kb.multiplyScalar(1 - dt * 8); }
    if (this.state === "dead") { this.av.setOpacity(Math.max(0, this.t / 1.4) * 0.92); if (this.t <= 0) this.remove(); this.sync(dt); return; }
    if (this.stun > 0) { this.av.play("Hit_A"); this.sync(dt); return; }
    const dp = pl.pos.distanceTo(this.pos);
    const aggro = !pl.dead && !pl.frozen && dp < 14 && this.home.distanceTo(pl.pos) < 28;
    switch (this.state) {
      case "idle":
        if (aggro) { this.state = "chase"; if (Math.random() < 0.3) Bark.say(pick(["g_shadow_00", "g_shadow_01"]), this.av, 0); break; }
        if (this.t <= 0) { this.t = rand(2, 5); this.wander = this.home.clone().add(V().set(rand(-5, 5), 0, rand(-5, 5))); }
        this.moveTo(this.wander, 1.4, dt, "Walking_A");
        break;
      case "chase":
        if (!aggro) { this.state = "idle"; break; }
        if (dp < 1.9) { this.state = "windup"; this.t = 0.45; this.av.play("Idle"); this.av.hitFlash(); break; }
        this.moveTo(pl.pos, this.speed, dt, "Running_A");
        break;
      case "windup":
        this.faceTo(pl.pos, dt, 10);
        if (this.t <= 0) { this.state = "attack"; this.t = 0.75; this.hitDone = false; this.av.play("1H_Melee_Attack_Stab", { once: true, speed: 1.4, restart: true }); }
        break;
      case "attack":
        if (!this.hitDone && this.t < 0.45) {
          this.hitDone = true;
          const d = V().subVectors(pl.pos, this.pos).setY(0);
          if (d.length() < 2.2) pl.damage(this.dmg, d.normalize().multiplyScalar(4));
        }
        if (this.t <= 0) { this.state = "recover"; this.t = rand(0.6, 1.1); this.av.play("Idle"); }
        break;
      case "recover": case "hurt":
        if (this.t <= 0) this.state = aggro ? "chase" : "idle";
        break;
    }
    // កុំឲ្យជាន់គ្នា
    for (const o of Combat.enemies) if (o !== this && !o.dead) { const d = V().subVectors(this.pos, o.pos).setY(0); const l = d.length(); if (l < 1.1 && l > 0.001) this.pos.addScaledVector(d, (1.1 - l) / l * 0.5); }
    World.resolve(this.pos, 0.45); this.pos.y = 0;
    this.sync(dt);
  }
  moveTo(p, speed, dt, anim) {
    const d = V().subVectors(p, this.pos).setY(0), l = d.length();
    if (l < 0.6) { this.av.play("Idle"); return; }
    d.normalize(); this.pos.addScaledVector(d, speed * dt); this.facing = angleDamp(this.facing, Math.atan2(d.x, d.z), 8, dt); this.av.play(anim);
  }
}

/* របារឈាមតូចលើក្បាល */
function makeBar() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 16; const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true })); sprite.visible = false;
  sprite.scale.set(1.2, 0.15, 1); sprite.renderOrder = 10;
  const set = v => { g.clearRect(0, 0, 128, 16); g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, 128, 16); g.fillStyle = "#b34cff"; g.fillRect(2, 2, 124 * Math.max(0, v), 12); tex.needsUpdate = true; };
  set(1); return { sprite, set };
}

/* ================= Boss៖ ស្រមោលនៃការបៀតបៀន (៣ ដំណាក់) ================= */
export class Boss extends Actor {
  constructor(pos, cfg) {
    super("boss", 4.1);
    this.cfg = cfg; this.name = cfg.name; this.radius = 1.3;
    this.maxHp = this.hp = cfg.hp || 1100; this.phase = 1; this.state = "intro"; this.t = 1.5; this.cool = 1.5; this.stun = 0; this.kb = V();
    this.place(pos, 0); this.av.play("Idle"); this.awake = false; this.minionsSummoned = 0;
    this.light = new THREE.PointLight(0xff3344, 20, 14, 2); this.light.position.y = 3; this.av.root.add(this.light);
  }
  get dead() { return this.state === "dead"; }
  damage(d, kb) {
    if (this.dead || this.state === "phase" || !this.awake) return;
    d = Math.round(d * rand(0.9, 1.1)); this.hp -= d; this.av.hitFlash(); damageNumber(this.pos.clone().setY(2), kh(d), "big");
    if (kb) this.kb.add(kb.multiplyScalar(0.15));
    const ratio = this.hp / this.maxHp;
    if (this.hp <= 0) { this.hp = 0; return this.die(); }
    if (this.phase === 1 && ratio < 0.7) this.toPhase(2);
    else if (this.phase === 2 && ratio < 0.35) this.toPhase(3);
  }
  toPhase(n) {
    this.phase = n; this.state = "phase"; this.t = 2.6;
    this.av.play("Spellcast_Long", { once: true, speed: 1 });
    VFX.ring(this.pos.clone(), 0xff2a3a, 14, 1.2); VFX.burst(this.pos.clone().setY(2), 0xff3344, 40, 8, 0.6, 1.2); Engine.addShake(0.7);
    Combat.onBossPhase && Combat.onBossPhase(this, n);
    if (n === 3) { this.speedMul = 1.4; this.light.intensity = 40; }
  }
  die() {
    this.state = "dead"; this.t = 4; this.av.play("Death_A", { once: true, speed: 0.7 });
    VFX.pillar(this.pos.clone(), 0xfff0b0, 4, 40, 3); VFX.burst(this.pos.clone().setY(2), 0xffe39a, 60, 12, 0.7, 1.5); Engine.addShake(1);
    Combat.enemies.forEach(e => { if (e !== this && !e.dead) e.die(); });
    Combat.onBossDown && Combat.onBossDown(this);
  }
  update(dt) {
    const pl = Combat.player;
    this.t -= dt; this.cool -= dt;
    if (this.kb.lengthSq() > 0.001) { this.pos.addScaledVector(this.kb, dt); this.kb.multiplyScalar(1 - dt * 6); }
    if (this.state === "dead") { this.av.setOpacity(Math.max(0, this.t / 4)); this.light.intensity = Math.max(0, this.t * 5); if (this.t <= 0) this.remove(); this.sync(dt); return; }
    if (!this.awake) { this.faceTo(pl.pos, dt, 3); this.sync(dt); return; }
    const sp = 3.1 * (this.speedMul || 1);
    const dp = V().subVectors(pl.pos, this.pos).setY(0); const dist = dp.length();
    switch (this.state) {
      case "phase": if (this.t <= 0) { this.state = "think"; this.cool = 0.5; if (this.phase === 2) this.summon(3); } break;
      case "intro": if (this.t <= 0) this.state = "think"; break;
      case "think": {
        if (pl.dead) { this.av.play("Idle"); break; }
        this.faceTo(pl.pos, dt, 6);
        if (this.cool > 0) { if (dist > 4) { this.pos.addScaledVector(dp.normalize(), sp * dt); this.av.play("Walking_A", { speed: 0.8 * (this.speedMul || 1) }); } else this.av.play("Idle"); break; }
        const opts = ["swing", "swing", "slam"];
        if (this.phase >= 2) opts.push("orbs", "wave");
        if (this.phase >= 3) opts.push("meteor", "meteor", "orbs");
        if (this.phase >= 2 && this.minionsSummoned < 2 && Combat.enemies.length < 3) opts.push("summon");
        this.begin(dist < 4.5 ? pick(opts) : pick(opts.filter(o => o !== "swing").concat(["chase"])));
        break;
      }
      case "chase":
        this.faceTo(pl.pos, dt, 6); this.pos.addScaledVector(dp.normalize(), sp * 1.5 * dt); this.av.play("Running_A", { speed: 0.8 });
        if (dist < 4 || this.t <= 0) this.begin("swing");
        break;
      case "swing":
        if (this.t > 0.55) this.faceTo(pl.pos, dt, 5);
        if (!this.done && this.t <= 0.55) {
          this.done = true;
          const front = this.pos.clone().add(V().set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(2.6));
          if (V().subVectors(pl.pos, front).setY(0).length() < 3.2) pl.damage(22 + this.phase * 4, V().subVectors(pl.pos, this.pos).setY(0).normalize().multiplyScalar(8));
          VFX.burst(front.setY(0.5), 0xff3344, 12, 5); Engine.addShake(0.3); sfx("hit");
        }
        if (this.t <= 0) this.end(1.2);
        break;
      case "slam":
        if (!this.done && this.t <= 0.3) {
          this.done = true; VFX.ring(this.pos.clone(), 0xff3344, 7, 0.6); VFX.burst(this.pos.clone().setY(0.4), 0x5a1020, 30, 7);
          if (dist < 6.2 && pl.pos.y < 0.8) pl.damage(30, dp.clone().normalize().multiplyScalar(10)); Engine.addShake(0.6); sfx("encounter");
        }
        if (this.t <= 0) this.end(1.4);
        break;
      case "orbs":
        if (this.shots > 0 && this.t <= this.nextShot) {
          this.shots--; this.nextShot -= 0.35;
          const n = this.phase >= 3 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(dp.x, dp.z) + (i - (n - 1) / 2) * 0.22;
            Combat.shoot({ from: this.pos.clone().add(V().set(0, 2.2, 0)), dir: V().set(Math.sin(a), -0.05, Math.cos(a)), speed: 13, dmg: 14, owner: "enemy", color: 0xff3a4a, size: 0.7, range: 34 });
          }
          sfx("encounter");
        }
        this.faceTo(pl.pos, dt, 4);
        if (this.t <= 0) this.end(1);
        break;
      case "wave":
        if (this.waveR !== undefined) {
          this.waveR += dt * 11;
          const d = dist;
          if (!this.waveHit && Math.abs(d - this.waveR) < 0.9 && pl.pos.y < 0.7) { this.waveHit = true; pl.damage(20, dp.clone().normalize().multiplyScalar(9)); }
          if (this.waveR > 26) this.end(1);
        } else if (this.t <= 0.9) {
          this.waveR = 1; this.waveHit = false; VFX.ring(this.pos.clone(), 0xff5566, 26, 2.3, 1); Engine.addShake(0.4); sfx("encounter");
        }
        break;
      case "meteor":
        if (!this.done && this.t <= 0.2) {
          this.done = true;
          this.marks.forEach(m => { VFX.pillar(m, 0xff3344, 2.6, 26, 0.7); VFX.burst(m.clone().setY(0.5), 0xff5a3a, 16, 6); if (V().subVectors(pl.pos, m).setY(0).length() < 3 && pl.pos.y < 1) pl.damage(28, V().subVectors(pl.pos, m).setY(0).normalize().multiplyScalar(8)); });
          Engine.addShake(0.8); sfx("encounter");
        }
        if (this.t <= 0) this.end(1.6);
        break;
      case "summon":
        if (!this.done && this.t <= 0.6) { this.done = true; this.summon(3); }
        if (this.t <= 0) this.end(1);
        break;
    }
    World.resolve(this.pos, this.radius); this.pos.y = 0;
    this.sync(dt);
  }
  begin(s) {
    const pl = Combat.player;
    this.state = s; this.done = false; this.waveR = undefined;
    if (s === "chase") { this.t = 2.4; return; }
    if (s === "swing") { this.t = this.av.play("1H_Melee_Attack_Chop", { once: true, speed: 0.75 * (this.speedMul || 1), restart: true }) * 0.9; VFX.telegraph(this.pos.clone().add(V().set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(2.6)), 3.2, Math.max(0.2, this.t - 0.55)); return; }
    if (s === "slam") { this.t = 1.5; this.av.play("Spellcast_Raise", { once: true, speed: 0.8, restart: true }); VFX.telegraph(this.pos.clone(), 6.2, 1.2); return; }
    if (s === "orbs") { this.t = 1.6; this.shots = this.phase >= 3 ? 3 : 2; this.nextShot = 1.1; this.av.play("Spellcast_Shoot", { once: true, speed: 0.7, restart: true }); return; }
    if (s === "wave") { this.t = 1.4; this.av.play("2H_Melee_Attack_Spin", { once: true, speed: 0.8, restart: true }); VFX.telegraph(this.pos.clone(), 3, 0.5, 0xff8844); Bark.say("g_teacher_warn_00", Combat.teacher && Combat.teacher.av, 0); return; }
    if (s === "meteor") {
      this.t = 1.6; this.av.play("Spellcast_Long", { once: true, speed: 1.1, restart: true });
      this.marks = [pl.pos.clone().setY(0)];
      for (let i = 0; i < 4; i++) this.marks.push(pl.pos.clone().add(V().set(rand(-7, 7), 0, rand(-7, 7))).setY(0));
      this.marks.forEach(m => VFX.telegraph(m, 3, 1.4));
      return;
    }
    if (s === "summon") { this.t = 1.4; this.av.play("Spellcast_Long", { once: true, restart: true }); return; }
  }
  end(c) { this.state = "think"; this.cool = c / (this.speedMul || 1); }
  summon(n) {
    this.minionsSummoned++;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2); const p = this.pos.clone().add(V().set(Math.cos(a) * 5, 0, Math.sin(a) * 5));
      const s = new Shadow(p, { hp: 40, dmg: 8 }); s.state = "chase"; s.home = this.pos.clone(); Combat.enemies.push(s);
      VFX.burst(p.clone().setY(1), 0x9b5cff, 16, 4);
    }
  }
}
