import * as THREE from 'three';

// First-person walk controls: WASD/arrows + mouse-drag look on desktop,
// virtual joystick (left) + drag-to-look (anywhere else) on touch.
// Collision against axis-aligned boxes on the floor plane.
export class WalkControls {
  constructor(camera, dom, colliders, bounds) {
    this.camera = camera; this.dom = dom; this.colliders = colliders; this.bounds = bounds;
    this.enabled = false;
    this.yaw = 0; this.pitch = -0.08;
    this.yawT = 0; this.pitchT = -0.08; // look targets (smoothed)
    this.vel = new THREE.Vector2();
    this.pos = new THREE.Vector3(-2.6, 0, 5.4);
    this.eye = 1.62; this.radius = 0.3; this.speed = 2.6;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.tween = null;
    this._look = null;
    this._bind();
  }
  _bind() {
    addEventListener('keydown', e => { if (this.enabled && !isTyping(e)) this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.dom.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      this._look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    });
    addEventListener('pointermove', e => {
      if (!this._look || e.pointerId !== this._look.id) return;
      const dx = e.clientX - this._look.x, dy = e.clientY - this._look.y;
      this._look.x = e.clientX; this._look.y = e.clientY; this._look.moved += Math.abs(dx) + Math.abs(dy);
      const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
      this.yawT -= dx * k; this.pitchT = THREE.MathUtils.clamp(this.pitchT - dy * k, -1.1, 0.9);
      this.tween = null;
    });
    const end = e => { if (this._look && e.pointerId === this._look.id) this._look = null; };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
  }
  lookMoved() { return this._look ? this._look.moved : 0; }
  setJoystick(x, y) { this.joy.x = x; this.joy.y = y; if (x || y) this.tween = null; }
  // Smoothly move to a standing spot and look at a point
  goTo(spot, lookAt) {
    const d = new THREE.Vector3().subVectors(lookAt, new THREE.Vector3(spot.x, this.eye, spot.z));
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.tween = { from: this.pos.clone(), to: new THREE.Vector3(spot.x, 0, spot.z), yaw0: this.yaw, yaw1: this.yaw + wrap(yaw - this.yaw), p0: this.pitch, p1: pitch, t: 0 };
  }
  update(dt) {
    if (!this.enabled) return;
    if (this.tween) {
      const tw = this.tween; tw.t = Math.min(1, tw.t + dt / 1.2);
      const k = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
      this.pos.lerpVectors(tw.from, tw.to, k);
      this.yaw = tw.yaw0 + (tw.yaw1 - tw.yaw0) * k; this.pitch = tw.p0 + (tw.p1 - tw.p0) * k;
      this.yawT = this.yaw; this.pitchT = this.pitch; this.vel.set(0, 0);
      if (tw.t >= 1) this.tween = null;
    } else {
      let f = 0, s = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
      if (this.keys.has('KeyD')) s += 1;
      if (this.keys.has('KeyA')) s -= 1;
      if (this.keys.has('ArrowLeft')) this.yawT += dt * 1.8;
      if (this.keys.has('ArrowRight')) this.yawT -= dt * 1.8;
      const kl = 1 - Math.exp(-dt * 16);
      this.yaw += (this.yawT - this.yaw) * kl; this.pitch += (this.pitchT - this.pitch) * kl;
      f += -this.joy.y; s += this.joy.x;
      const len = Math.hypot(f, s);
      if (len > 1) { f /= len; s /= len; }
      // smooth acceleration / deceleration toward the desired velocity
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.8 : 1;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const tx = (fx * f + rx * s) * this.speed * run, tz = (fz * f + rz * s) * this.speed * run;
      const ka = 1 - Math.exp(-dt * (len > 0.01 ? 7 : 9));
      this.vel.x += (tx - this.vel.x) * ka; this.vel.y += (tz - this.vel.y) * ka;
      if (this.vel.lengthSq() > 1e-6) this._move(this.vel.x * dt, this.vel.y * dt);
    }
    this._bobT = (this._bobT || 0) + this.vel.length() * dt * 3.2;
    const bob = Math.sin(this._bobT * 2) * 0.018 * Math.min(1, this.vel.length() / this.speed);
    this.camera.position.set(this.pos.x, this.eye + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  _move(dx, dz) {
    // axis separated so you slide along walls
    this.pos.x += dx; if (this._hits()) this.pos.x -= dx;
    this.pos.z += dz; if (this._hits()) this.pos.z -= dz;
    const b = this.bounds, r = this.radius;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX + r, b.maxX - r);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ + r, b.maxZ - r);
  }
  _hits() {
    const { x, z } = this.pos, r = this.radius;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }
  isFree(x, z) { const p = this.pos.clone(); this.pos.set(x, 0, z); const h = this._hits(); this.pos.copy(p); return !h; }
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const isTyping = e => /INPUT|TEXTAREA/.test(e.target.tagName);

// Virtual joystick element (touch + mouse)
export function createJoystick(el, onChange) {
  const knob = el.querySelector('.knob');
  let id = null, cx = 0, cy = 0; const R = 50;
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault(); id = e.pointerId; el.setPointerCapture(id);
    const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e);
  });
  const move = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; onChange(dx / R, dy / R);
  };
  el.addEventListener('pointermove', move);
  const up = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onChange(0, 0); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
