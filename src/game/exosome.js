// 外泌体：一颗会形变的软糖囊泡（能量、携带信息、拖尾）

import { clamp, TAU } from '../core/rng.js';

export class Exosome {
  constructor(x, y, r) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = r;
    this.energy = 100;
    this.maxEnergy = 100;
    this.carried = [];
    this.squash = 0;        // 形变量 0~1
    this.squashAngle = 0;   // 形变方向
    this.spin = 0;
    this.trail = [];
    this.trailTimer = 0;
    this.state = 'free';    // free | penetrating
    this.dead = false;
    this.born = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  addCargo(type) {
    this.carried.push(type);
  }

  hit(angle, amount, speed) {
    this.squashAngle = angle;
    this.squash = clamp(Math.max(this.squash, amount * 0.02 + Math.min(speed / 900, 0.5)), 0, 1);
  }

  update(dt, time) {
    this.born = time;
    this.squash *= Math.exp(-dt * 5.5);
    // 沿运动方向轻微拉伸（软糖被甩长）
    const sp = this.speed;
    if (sp > 30) {
      const a = Math.atan2(this.vy, this.vx);
      const stretch = clamp(sp / 2600, 0, 0.32);
      if (stretch > Math.abs(this.squash) * 0.9) {
        this.squashAngle = a;
        this.squash = Math.max(this.squash * 0.6, stretch);
      }
    }
    this.spin += (this.vx * 0.0004 + 0.2) * dt;

    this.trailTimer += dt;
    if (this.trailTimer > 0.016) {
      this.trailTimer = 0;
      this.trail.push(this.x, this.y, Math.min(1, sp / 700));
      if (this.trail.length > 180) this.trail.splice(0, 3);
    }
  }

  /** 挂载的信息包环绕轨道位置 */
  cargoSlot(i, time) {
    const n = this.carried.length;
    const a = (i / Math.max(1, n)) * TAU + time * 0.8;
    const rr = this.r + 16;
    return { x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr };
  }
}
