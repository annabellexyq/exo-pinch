// 膜系统：分段（硬区 / 薄区 / 受体 / 出口）+ 冲击凹陷形变 + 渗透判定

import { TAU, wrapAngle, clamp, lerp } from '../core/rng.js';

export const SEG_NORMAL = 0;
export const SEG_THIN = 1;
export const SEG_RECEPTOR = 2;
export const SEG_EXIT = 3;

export class Membrane {
  constructor(cell, genome, rng) {
    this.cell = cell;
    this.n = 56;
    this.thickness = 24;
    this.segs = [];
    this.nodes = new Float32Array(this.n);   // 法向偏移，正=向外凸
    this.nodeVel = new Float32Array(this.n);
    this.glyco = genome.mechanics.glycocalyx ? 78 : 0;
    this.mb = genome.membrane;
    this.rng = rng;
    this.build(genome, rng);
  }

  build(genome, rng) {
    const n = this.n;
    const M = genome.mechanics;
    for (let i = 0; i < n; i++) this.segs.push({ kind: SEG_NORMAL, order: 0, glow: 0, wob: rng() * TAU });

    // 出口：连续 3 段
    const exitStart = rng.int(0, n - 1);
    for (let k = 0; k < 3; k++) this.segs[(exitStart + k) % n].kind = SEG_EXIT;
    this.exitIndex = exitStart;

    // 薄区：2~4 个连续区块，长度 3~6 段
    const blocks = rng.int(2, 4);
    const thinTotal = Math.max(4, Math.round(n * this.mb.thinRatio));
    const per = Math.max(2, Math.floor(thinTotal / blocks));
    for (let b = 0; b < blocks; b++) {
      const start = rng.int(0, n - 1);
      const len = rng.int(Math.max(2, per - 1), per + 2);
      for (let k = 0; k < len; k++) {
        const idx = (start + k) % n;
        if (this.segs[idx].kind === SEG_NORMAL) this.segs[idx].kind = SEG_THIN;
      }
    }

    // 受体：按编号顺序分布
    if (M.receptorSequence > 0) {
      const count = M.receptorSequence;
      for (let i = 0; i < count; i++) {
        let idx = rng.int(0, n - 1), guard = 0;
        while (this.segs[idx].kind !== SEG_NORMAL && guard++ < 60) idx = rng.int(0, n - 1);
        for (let k = -1; k <= 1; k++) {
          const s = this.segs[(idx + k + n) % n];
          s.kind = SEG_RECEPTOR;
          s.order = i + 1;
        }
      }
      this.receptorCount = count;
    } else {
      this.receptorCount = 0;
    }
  }

  indexAt(angle) {
    const a = wrapAngle(angle);
    return Math.floor((a / TAU) * this.n) % this.n;
  }

  angleOf(i) {
    return ((i + 0.5) / this.n) * TAU;
  }

  /** 该角度处的膜半径（含形变） */
  radiusAt(angle) {
    const a = wrapAngle(angle);
    const f = (a / TAU) * this.n;
    const i0 = Math.floor(f) % this.n;
    const i1 = (i0 + 1) % this.n;
    const t = f - Math.floor(f);
    return this.cell.r + lerp(this.nodes[i0], this.nodes[i1], t);
  }

  update(dt, time) {
    // 弹簧回复 + 呼吸起伏
    const k = 46, c = 7.5;
    for (let i = 0; i < this.n; i++) {
      const breathe = Math.sin(time * 0.9 + i * 0.35) * 1.6;
      const acc = -(this.nodes[i] - breathe) * k - this.nodeVel[i] * c;
      this.nodeVel[i] += acc * dt;
      this.nodes[i] += this.nodeVel[i] * dt;
      this.nodes[i] = clamp(this.nodes[i], -70, 70);
      const s = this.segs[i];
      s.glow = Math.max(0, s.glow - dt * 1.4);
      s.wob += dt * (0.6 + (i % 5) * 0.05);
    }
  }

  /** 冲击：让膜局部凹陷（渗透时会持续下压） */
  impact(angle, amount) {
    const i = this.indexAt(angle);
    for (let k = -3; k <= 3; k++) {
      const idx = (i + k + this.n) % this.n;
      const fall = 1 - Math.abs(k) / 4;
      this.nodeVel[idx] -= amount * fall;
      this.segs[idx].glow = Math.min(1.6, this.segs[idx].glow + amount * 0.004 * fall);
    }
  }

  /**
   * 渗透判定
   * @param angle 接触点角度
   * @param inward true=由外向内
   * @param speed 法向速度大小
   * @param nextReceptor 当前应该进入的受体编号（0 表示无受体要求）
   */
  query(angle, inward, speed, nextReceptor) {
    const seg = this.segs[this.indexAt(angle)];
    // 越“软”的入口，容忍的撞击速度越高
    const softFactor = seg.kind === SEG_THIN ? 1.4 : seg.kind === SEG_RECEPTOR ? 1.15 : seg.kind === SEG_EXIT ? 1.5 : 0.8;
    const maxS = this.mb.maxEntrySpeed * softFactor;

    if (inward && seg.kind === SEG_EXIT) return { ok: false, reason: '此乃出口，不可入', seg };
    if (!inward && seg.kind === SEG_RECEPTOR) return { ok: false, reason: '受体只进不出', seg };

    if (speed > maxS) return { ok: false, reason: '太急，膜将汝弹开', seg, bounce: 1 };
    if (speed < 12) return { ok: false, reason: '太缓，贴膜滑走', seg };

    if (seg.kind === SEG_EXIT) return { ok: true, kind: 'exit', seg };
    if (seg.kind === SEG_THIN) return { ok: true, kind: 'thin', seg };
    if (seg.kind === SEG_RECEPTOR) {
      if (nextReceptor > 0 && seg.order === nextReceptor) return { ok: true, kind: 'receptor', seg };
      if (nextReceptor === 0) return { ok: true, kind: 'receptor', seg };
      return { ok: false, reason: nextReceptor > 0 ? `先寻 ${nextReceptor} 号受体` : '此处不可入', seg };
    }
    // 厚膜区：只要足够慢，也能硬挤进去，只是又慢又费以太
    if (speed <= this.mb.softSpeed) return { ok: true, kind: 'hard', slow: 1.8, seg };
    return { ok: false, reason: '膜太厚，须缓行再挤', seg };
  }
}
