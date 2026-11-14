/* ការបញ្ជា៖ ក្តារចុច + កណ្តុរ (PC) និង Joystick + ប៊ូតុង (ទូរសព្ទ) */
import { Settings, isTouch } from "./util.js";

export const Input = {
  keys: new Set(), pressed: new Set(),
  move: { x: 0, y: 0 },          // x = ឆ្វេង/ស្តាំ, y = មុខ/ក្រោយ (-1..1)
  look: { x: 0, y: 0 }, zoom: 0,
  enabled: true, touch: false, locked: false,
  stick: null,

  init(canvas) {
    this.canvas = canvas;
    this.touch = isTouch();
    addEventListener("keydown", e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.press(this.map(e.code));
      this.keys.add(e.code);
      if (["Space", "Tab"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", e => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());

    // កណ្តុរ៖ ចុចលើអេក្រង់ដើម្បីចាប់ផ្តើមបង្វិលកាមេរ៉ា (Pointer Lock)
    canvas.addEventListener("mousedown", e => {
      if (!this.enabled) return;
      if (!this.locked && !this.touch) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 0) this.press("attack");
      if (e.button === 2) this.press("skill2");
    });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener("mousemove", e => {
      if (this.locked) { this.look.x += e.movementX * 0.0025 * Settings.sens; this.look.y += e.movementY * 0.0025 * Settings.sens; }
    });
    addEventListener("wheel", e => { this.zoom += Math.sign(e.deltaY); }, { passive: true });

    if (this.touch) this.initTouch();
  },

  map(code) {
    return ({ Space: "jump", ShiftLeft: "dash", ShiftRight: "dash", Digit1: "skill1", Digit2: "skill2", Digit3: "skill3",
      KeyJ: "attack", KeyK: "skill1", KeyL: "skill2", KeyF: "interact", KeyE: "interact", Enter: "advance",
      Escape: "pause", KeyP: "pause", KeyQ: "skill1", KeyR: "skill3" })[code] || code;
  },
  press(a) { this.pressed.add(a); },
  consume(a) { const h = this.pressed.has(a); this.pressed.delete(a); return h; },
  peek(a) { return this.pressed.has(a); },
  clearPressed() { this.pressed.clear(); },

  update() {
    let x = 0, y = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.stick && this.stick.active) { x = this.stick.x; y = this.stick.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = this.enabled ? x : 0; this.move.y = this.enabled ? y : 0;
  },
  takeLook() { const l = { x: this.look.x, y: this.look.y, z: this.zoom }; this.look.x = this.look.y = 0; this.zoom = 0; return l; },

  /* ---------- ទូរសព្ទ ---------- */
  initTouch() {
    const base = document.getElementById("stick"), knob = document.getElementById("stick-knob");
    const st = this.stick = { active: false, id: null, x: 0, y: 0, cx: 0, cy: 0 };
    const looks = new Map();       // ម្រាមដៃដែលកំពុងអូសបង្វិលកាមេរ៉ា
    let pinch = null;
    const R = 56;
    const onStart = e => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest(".tbtn, .ui-block")) continue;
        if (t.clientX < innerWidth * 0.42 && !st.active) {
          st.active = true; st.id = t.identifier; st.cx = t.clientX; st.cy = t.clientY;
          base.style.left = (t.clientX - 70) + "px"; base.style.top = (t.clientY - 70) + "px"; base.classList.add("on");
          knob.style.transform = "translate(0px,0px)";
        } else looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (looks.size === 2) { const [a, b] = [...looks.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const onMove = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === st.id) {
          let dx = t.clientX - st.cx, dy = t.clientY - st.cy;
          const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
          st.x = dx / R; st.y = -dy / R;
          knob.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (looks.has(t.identifier)) {
          const p = looks.get(t.identifier);
          if (looks.size === 1) { this.look.x += (t.clientX - p.x) * 0.006 * Settings.sens; this.look.y += (t.clientY - p.y) * 0.006 * Settings.sens; }
          p.x = t.clientX; p.y = t.clientY;
        }
      }
      if (looks.size === 2 && pinch) {
        const [a, b] = [...looks.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom += (pinch - d) * 0.02; pinch = d;
      }
      e.preventDefault();
    };
    const onEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === st.id) { st.active = false; st.id = null; st.x = st.y = 0; base.classList.remove("on"); }
        looks.delete(t.identifier);
      }
      if (looks.size < 2) pinch = null;
    };
    const layer = document.getElementById("touch-layer");
    layer.addEventListener("touchstart", onStart, { passive: false });
    layer.addEventListener("touchmove", onMove, { passive: false });
    layer.addEventListener("touchend", onEnd); layer.addEventListener("touchcancel", onEnd);
    document.querySelectorAll(".tbtn").forEach(b => {
      b.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); this.press(b.dataset.act); b.classList.add("down"); }, { passive: false });
      b.addEventListener("touchend", () => b.classList.remove("down"));
    });
  }
};
