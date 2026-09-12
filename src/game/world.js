// 世界构建：把关卡基因组 + 种子变成可运行的物理场景

import { makeRng, hashSeed, TAU, clamp, dist } from '../core/rng.js';
import { Membrane, SEG_THIN, SEG_RECEPTOR, SEG_EXIT } from './membrane.js';

export const CARGO_TYPES = [
  { id: 'miRNA', label: 'miRNA', color: '#7ef0d0' },
  { id: 'mRNA', label: 'mRNA', color: '#9db8ff' },
  { id: 'protein', label: '蛋白', color: '#ffb46b' },
  { id: 'lipid', label: '脂质', color: '#ff8fd0' },
];

export class World {
  constructor(genome, seed) {
    this.genome = genome;
    this.seed = seed >>> 0;
    this.rng = makeRng(hashSeed(`world:${genome.codename}:${this.seed}`));
    this.time = 0;
    this.cells = [];
    this.cargo = [];
    this.atp = [];
    this.hazards = [];
    this.medium = { viscosity: 0.6, gravity: { x: 0, y: 0 }, flow: { x: 0, y: 0 }, turbulence: 0, turbFreq: 0.0018 };
    this.build();
  }

  build() {
    const g = this.genome;
    const rng = this.rng;
    const M = g.mechanics;
    const cellR = g.scale.cellRadius;
    const cellCount = Math.max(1, M.chain || 1);
    const spacing = cellR * 2 + 340;

    // --- 细胞链（巨人国的巨人们）---
    for (let i = 0; i < cellCount; i++) {
      const x = (i - (cellCount - 1) / 2) * spacing;
      const y = cellCount > 1 ? (rng() - 0.5) * 260 : 0;
      const r = cellR * (i === cellCount - 1 ? 1 : rng.range(0.82, 0.95));
      const cell = {
        id: `C${i}`, x, y, r,
        kind: 'cell', order: i, isTarget: i === cellCount - 1,
        visited: false, entered: 0,
        organelles: [], stations: [], nucleus: null,
      };
      cell.membrane = new Membrane(cell, g, rng);
      this.cells.push(cell);
    }
    this.targetCell = this.cells[this.cells.length - 1];
    this.startCell = this.cells[0];

    // --- 核（双膜迷宫）---
    if (M.doubleMembrane) {
      const c = this.targetCell;
      const nr = c.r * 0.36;
      const nuc = {
        id: 'N0', x: c.x + rng.range(-0.18, 0.18) * c.r, y: c.y + rng.range(-0.18, 0.18) * c.r,
        r: nr, kind: 'nucleus', order: 99, isTarget: false, visited: false, entered: 0,
        organelles: [], stations: [], nucleus: null, parent: c,
      };
      nuc.membrane = new Membrane(nuc, g, rng);
      c.nucleus = nuc;
      this.cells.push(nuc);
    }

    // --- 细胞器（骨骼般的巨物，可弹射）---
    for (const cell of this.cells) {
      if (cell.kind !== 'cell') continue;
      const count = g.counts.organelles;
      let guard = 0;
      for (let i = 0; i < count && guard < 400; ) {
        guard++;
        const a = rng() * TAU;
        const rr = Math.sqrt(rng()) * (cell.r * 0.72);
        const x = cell.x + Math.cos(a) * rr;
        const y = cell.y + Math.sin(a) * rr;
        const rad = rng.range(80, 230);
        if (rr + rad > cell.r - 150) continue;
        let bad = false;
        for (const o of cell.organelles) if (dist(x, y, o.x, o.y) < rad + o.r + 90) { bad = true; break; }
        if (cell.nucleus && dist(x, y, cell.nucleus.x, cell.nucleus.y) < rad + cell.nucleus.r + 110) bad = true;
        if (bad) continue;
        cell.organelles.push({
          x, y, r: rad, kind: rng.pick(['mito', 'er', 'golgi', 'vesicle']),
          wob: rng() * TAU, spin: rng.range(-0.25, 0.25),
        });
        i++;
      }
    }

    // --- 装载站（排队携带信息）：必须避开细胞器，否则玩家会被弹开而够不着 ---
    if (M.queue > 0) {
      const host = this.targetCell.nucleus || this.targetCell;
      const n = M.queue;
      for (let i = 0; i < n; i++) {
        let x = host.x, y = host.y, guard = 0, ok = false;
        while (!ok && guard++ < 240) {
          const a = (i / n) * TAU + rng.range(-0.6, 0.6);
          const rr = host.r * rng.range(0.34, 0.7);
          x = host.x + Math.cos(a) * rr;
          y = host.y + Math.sin(a) * rr;
          ok = this.clearOfOrganelles(x, y, host, 74);
          if (ok) for (const s of host.stations) if (dist(x, y, s.x, s.y) < 140) { ok = false; break; }
        }
        host.stations.push({
          order: i + 1, x, y,
          r: 46, dwell: 0, done: false, flash: 0, host: host.id, pulse: rng() * TAU,
        });
      }
      this.stationHost = host;
    }

    // --- 危险物：动力蛋白旋臂 + 免疫细胞（巨噬 / NK / 诱捕网）---
    const host0 = this.targetCell;
    for (let i = 0; i < (M.hazards || 0); i++) {
      const nuc = host0.nucleus && i % 2 === 1 ? host0.nucleus : null;
      const base = nuc || host0;
      this.hazards.push({
        type: 'rotor', x: base.x, y: base.y, len: base.r * 1.9, w: 16,
        a: rng() * TAU, spin: rng.range(0.7, 1.5) * rng.sign(), zone: base.id,
      });
    }
    if (M.immune >= 1) {
      const a = rng() * TAU;
      this.hazards.push({
        type: 'macrophage', x: host0.x + Math.cos(a) * host0.r * 0.5, y: host0.y + Math.sin(a) * host0.r * 0.5,
        r: rng.range(64, 92), vx: rng.range(-60, 60), vy: rng.range(-60, 60),
        spin: rng.range(-0.5, 0.5), zone: host0.id, wob: rng() * TAU,
      });
    }
    if (M.immune >= 2) {
      const a = rng() * TAU;
      this.hazards.push({
        type: 'nk', x: host0.x + Math.cos(a) * host0.r * 0.66, y: host0.y + Math.sin(a) * host0.r * 0.66,
        r: 52, vx: rng.range(-30, 30), vy: rng.range(-30, 30), dashVx: 0, dashVy: 0,
        phase: 'idle', timer: rng.range(1.4, 2.6), zone: host0.id, wob: rng() * TAU,
      });
    }
    if (M.immune >= 3) {
      const a = rng() * TAU;
      this.hazards.push({
        type: 'net', x: host0.x + Math.cos(a) * host0.r * 0.42, y: host0.y + Math.sin(a) * host0.r * 0.42,
        r: rng.range(180, 260), spin: rng.range(-0.2, 0.2), zone: host0.id,
      });
    }
    if (M.immune >= 4) {
      const a = rng() * TAU;
      this.hazards.push({
        type: 'virus', x: host0.x + Math.cos(a) * host0.r * 0.74, y: host0.y + Math.sin(a) * host0.r * 0.74,
        r: 38, vx: rng.range(-40, 40), vy: rng.range(-40, 40), dashVx: 0, dashVy: 0,
        phase: 'idle', timer: rng.range(1, 2), zone: host0.id, wob: rng() * TAU,
      });
    }
    if (M.immune >= 5) {
      const a = rng() * TAU;
      this.hazards.push({
        type: 'bacterium', x: host0.x + Math.cos(a) * host0.r * 0.5, y: host0.y + Math.sin(a) * host0.r * 0.5,
        r: rng.range(96, 124), vx: rng.range(-30, 30), vy: rng.range(-30, 30),
        spin: rng.range(-0.4, 0.4), zone: host0.id, wob: rng() * TAU, toxin: 0,
      });
    }

    // --- 漂浮的信息包（细胞外 + 细胞内）---
    const total = g.counts.cargo;
    for (let i = 0; i < total; i++) {
      const inside = rng.chance(0.3);
      const c = rng.pick(this.cells.filter((x) => x.kind === 'cell'));
      let x, y, guard = 0;
      do {
        guard++;
        const a = rng() * TAU;
        const rr = inside ? Math.sqrt(rng()) * (c.r - 190) : c.r + rng.range(140, 560);
        x = c.x + Math.cos(a) * rr;
        y = c.y + Math.sin(a) * rr;
      } while (guard < 60 && (this.tooCloseToCell(x, y, inside) || (inside && !this.clearOfOrganelles(x, y, c, 46))));
      this.cargo.push({
        x, y, r: 20, taken: false, bob: rng() * TAU,
        type: rng.pick(CARGO_TYPES), inside, home: c.id,
      });
    }

    // --- ATP 补给 ---
    for (let i = 0; i < g.counts.atp; i++) {
      const c = rng.pick(this.cells.filter((x) => x.kind === 'cell'));
      const inside = rng.chance(0.5);
      let x, y, guard = 0;
      do {
        guard++;
        const a = rng() * TAU;
        const rr = inside ? Math.sqrt(rng()) * (c.r - 160) : c.r + rng.range(140, 800);
        x = c.x + Math.cos(a) * rr;
        y = c.y + Math.sin(a) * rr;
      } while (guard < 40 && inside && !this.clearOfOrganelles(x, y, c, 42));
      this.atp.push({
        x, y, r: 17,
        taken: false, respawn: 0, respawnDelay: g.mechanics.atpDrought ? 16 : 10,
        value: g.mechanics.atpDrought ? 42 : 30, bob: rng() * TAU, spin: rng.range(-2, 2),
      });
    }

    // --- 世界半径与起点 ---
    let maxX = 0;
    for (const c of this.cells) maxX = Math.max(maxX, Math.abs(c.x) + c.r);
    this.worldRadius = Math.max(g.scale.worldRadius, maxX + 520);
    this.start = {
      x: this.startCell.x - this.startCell.r - 300,
      y: this.startCell.y + rng.range(-140, 140),
    };
    this.exitCell = g.goals.exitCell === 'first' ? this.startCell : this.targetCell;
  }

  /** NK 细胞：游弋 → 锁定蓄力（0.55s）→ 高速冲刺（0.45s）→ 冷却 */
  updateNK(h, dt, exo) {
    h.timer -= dt;
    h.wob += dt * 2;
    if (h.phase === 'idle') {
      h.vx *= 0.98; h.vy *= 0.98;
      if (h.timer <= 0 && exo) {
        const d = dist(h.x, h.y, exo.x, exo.y);
        if (d < 950) {
          h.phase = 'charge';
          h.timer = 0.55;
          h.lockX = (exo.x - h.x) / (d || 1);
          h.lockY = (exo.y - h.y) / (d || 1);
        } else {
          h.timer = 0.8;
        }
      }
    } else if (h.phase === 'charge') {
      h.vx *= 0.9; h.vy *= 0.9;
      if (exo) {
        const d = dist(h.x, h.y, exo.x, exo.y) || 1;
        // 蓄力时仍缓慢修正朝向，给玩家反应时间
        h.lockX = lerp(h.lockX, (exo.x - h.x) / d, 0.05);
        h.lockY = lerp(h.lockY, (exo.y - h.y) / d, 0.05);
      }
      if (h.timer <= 0) {
        h.phase = 'dash';
        h.timer = 0.45;
        h.vx = h.lockX * 620;
        h.vy = h.lockY * 620;
      }
    } else if (h.phase === 'dash') {
      if (h.timer <= 0) {
        h.phase = 'idle';
        h.timer = 2.4;
        h.vx *= 0.2; h.vy *= 0.2;
      }
    }
  }

  /** 病毒：游弋 → 锁定（0.4s）→ 频繁短促冲刺（0.5s）→ 冷却；比 NK 更小更快 */
  updateVirus(h, dt, exo) {
    h.timer -= dt;
    h.wob += dt * 4;
    if (h.phase === 'idle') {
      h.vx *= 0.97; h.vy *= 0.97;
      if (h.timer <= 0 && exo) {
        const d = dist(h.x, h.y, exo.x, exo.y);
        if (d < 1200) {
          h.phase = 'charge'; h.timer = 0.4;
          h.lockX = (exo.x - h.x) / (d || 1);
          h.lockY = (exo.y - h.y) / (d || 1);
        } else h.timer = 0.5;
      }
    } else if (h.phase === 'charge') {
      if (exo) {
        const d = dist(h.x, h.y, exo.x, exo.y) || 1;
        h.lockX = lerp(h.lockX, (exo.x - h.x) / d, 0.1);
        h.lockY = lerp(h.lockY, (exo.y - h.y) / d, 0.1);
      }
      if (h.timer <= 0) {
        h.phase = 'dash'; h.timer = 0.5;
        h.vx = h.lockX * 560; h.vy = h.lockY * 560;
      }
    } else if (h.phase === 'dash') {
      if (h.timer <= 0) {
        h.phase = 'idle'; h.timer = 1.5;
        h.vx *= 0.12; h.vy *= 0.12;
      }
    }
  }

  /** 细菌：缓慢游弋并朝玩家漂移，体表持续释放毒素云（区域减速+掉能量） */
  updateBacterium(h, dt, exo) {
    h.wob += dt * 1.4;
    h.toxin += (1 - h.toxin) * Math.min(1, dt * 2);
    if (exo) {
      const d = dist(h.x, h.y, exo.x, exo.y) || 1;
      if (d < 760) {
        h.vx += ((exo.x - h.x) / d) * 60 * dt;
        h.vy += ((exo.y - h.y) / d) * 60 * dt;
      }
    }
    const v = Math.hypot(h.vx, h.vy), max = 78;
    if (v > max) { h.vx *= max / v; h.vy *= max / v; }
  }

  /** 该点是否远离细胞器与核（用于放置可拾取物） */
  clearOfOrganelles(x, y, cell, pad = 50) {
    if (!cell) return true;
    for (const o of cell.organelles) if (dist(x, y, o.x, o.y) < o.r + pad) return false;
    if (cell.nucleus && dist(x, y, cell.nucleus.x, cell.nucleus.y) < cell.nucleus.r + pad) return false;
    return true;
  }

  tooCloseToCell(x, y, inside) {
    for (const c of this.cells) {
      const d = dist(x, y, c.x, c.y);
      if (inside) { if (d > c.r - 60 && d < c.r + 60) return true; }
      else if (d < c.r + 80) return true;
    }
    return false;
  }

  /** 最内层容器（细胞 / 核），没有则 null */
  containerOf(x, y, pad = 0) {
    let best = null;
    for (const c of this.cells) {
      const d = dist(x, y, c.x, c.y);
      if (d < c.r - pad && (!best || c.r < best.r)) best = c;
    }
    return best;
  }

  /** 当前所处介质（粘滞 / 流场 / 重力） */
  mediumAt(x, y, out) {
    const g = this.genome;
    const m = out || this.medium;
    const cont = this.containerOf(x, y);
    m.viscosity = cont ? g.physics.viscosityInside : g.physics.viscosityOutside;
    m.turbulence = g.physics.turbulence * (cont ? 1.5 : 1);
    m.turbFreq = g.physics.turbFreq;
    m.gravity.x = 0;
    m.gravity.y = g.physics.gravity;
    m.flow.x = 0;
    m.flow.y = 0;

    if (cont && cont.kind === 'nucleus') m.viscosity *= 1.25;

    // 糖萼层：膜外一圈黏糊糊的绒毛，速度会被吃掉
    for (const c of this.cells) {
      const d = dist(x, y, c.x, c.y);
      const glyco = c.membrane.glyco;
      if (glyco > 0 && d > c.r && d < c.r + glyco) {
        m.viscosity *= 3.4;
        break;
      }
    }
    m.zone = cont ? cont.id : 'OUT';
    return m;
  }

  update(dt, exo) {
    this.time += dt;
    for (const c of this.cells) c.membrane.update(dt, this.time);
    for (const h of this.hazards) {
      if (h.type === 'rotor') {
        h.a += h.spin * dt;
        continue;
      }
      if (h.type === 'net') {
        h.spin += 0;
        continue;
      }
      if (h.type === 'nk') {
        this.updateNK(h, dt, exo);
      } else if (h.type === 'virus') {
        this.updateVirus(h, dt, exo);
      } else if (h.type === 'bacterium') {
        this.updateBacterium(h, dt, exo);
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      const host = this.cells.find((c) => c.id === h.zone);
      if (host) {
        const d = dist(h.x, h.y, host.x, host.y);
        if (d > host.r - h.r - 20) {
          const nx = (h.x - host.x) / d, ny = (h.y - host.y) / d;
          const vn = h.vx * nx + h.vy * ny;
          h.vx -= 2 * vn * nx;
          h.vy -= 2 * vn * ny;
          h.x = host.x + nx * (host.r - h.r - 21);
          h.y = host.y + ny * (host.r - h.r - 21);
        }
      }
    }
    for (const c of this.cells) {
      for (const o of c.organelles) o.wob += dt * 0.6;
    }
    if (this.stationHost) {
      for (const st of this.stationHost.stations) {
        if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 1.5);
      }
    }
  }
}

export { SEG_THIN, SEG_RECEPTOR, SEG_EXIT };
