/* កាមេរ៉ាមើលពីក្រោយខ្នង បង្វិលបាន ៣៦០° និង Zoom រលូន */
import * as THREE from "three";
import { clamp, damp } from "./util.js";
import { Engine } from "./engine.js";

const ray = new THREE.Raycaster();
const tmp = new THREE.Vector3(), dir = new THREE.Vector3();

export const CameraRig = {
  yaw: 0, pitch: 0.32, dist: 7, distTarget: 7, curDist: 7,
  target: new THREE.Vector3(), colliders: [],
  cinematic: null,

  reset(yaw) { this.yaw = yaw; this.pitch = 0.32; },

  update(dt, focus, look) {
    const cam = Engine.camera;
    this.yaw -= look.x; this.pitch = clamp(this.pitch + look.y, -0.35, 1.25);
    this.distTarget = clamp(this.distTarget + look.z * 0.8, 2.6, 16);
    this.dist = damp(this.dist, this.distTarget, 10, dt);
    this.target.x = damp(this.target.x, focus.x, 14, dt);
    this.target.y = damp(this.target.y, focus.y + 1.45, 10, dt);
    this.target.z = damp(this.target.z, focus.z, 14, dt);

    dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // កុំឲ្យកាមេរ៉ាចូលក្នុងជញ្ជាំង
    let d = this.dist;
    if (this.colliders.length) {
      ray.set(this.target, dir); ray.far = this.dist;
      const hit = ray.intersectObjects(this.colliders, true)[0];
      if (hit) d = Math.max(1.2, hit.distance - 0.3);
    }
    this.curDist = d < this.curDist ? d : damp(this.curDist, d, 5, dt);
    tmp.copy(this.target).addScaledVector(dir, this.curDist);
    if (tmp.y < this.target.y - 1.2) tmp.y = this.target.y - 1.2;

    if (this.cinematic) {               // ពេលសន្ទនា៖ កាមេរ៉ាខិតចូលជិត
      const c = this.cinematic;
      tmp.lerp(c.pos, c.k); this.target.lerp(c.look, c.k);
    }
    cam.position.copy(tmp);
    if (Engine.shake > 0) {
      const s = Engine.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
      Engine.shake = Math.max(0, Engine.shake - dt * 2.5);
    }
    cam.lookAt(this.target);
  },

  /* ទិសដៅមុខ/ស្តាំ សម្រាប់ដើរតាមកាមេរ៉ា */
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); },
  right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
};
