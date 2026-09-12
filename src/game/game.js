// 游戏主逻辑：状态机、物理步进、碰撞/渗透、目标判定、相机

import { clamp, lerp, dist, TAU, makeRng, hashSeed } from '../core/rng.js';
import {
  integrateBody, collideStaticCircle, collideMovingCircle, collideCapsule, clampToWorld, predictPath,
} from '../core/physics.js';
import { World, CARGO_TYPES } from './world.js';
import { Exosome } from './exosome.js';
import { generateLevel, Director, LEVEL_BLUEPRINTS } from '../ai/brains.js?v=15';

const FIXED = 1 / 120;

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.brain = opts.brain || null;
    this.onEvent = opts.onEvent || (() => {});
    this.onLevelLoaded = opts.onLevelLoaded || (() => {});

    this.state = 'menu';          // menu | intro | playing | won | lost
    this.levelIndex = 0;
    this.baseSeed = (Math.random() * 1e9) | 0;
    this.profile = { adjust: 0, fails: 0, wins: 0 };
    this.rng = makeRng(hashSeed('director'));
    this.director = new Director(this.rng, this.brain);

    this.cam = { x: 0, y: 0, zoom: 0.34, tx: 0, ty: 0, tzoom: 1 };
    this.shake = 0;
    this.flash = 0;
    this.time = 0;
    this.acc = 0;
    this.lastFrame = 0;

    this.input = { down: false, sx: 0, sy: 0, cx: 0, cy: 0, boost: false };
    this.aimPath = [];
    this.genome = null;
    this.world = null;
    this.exo = null;
    this.pen = null;
    this.message = '';
    this.messageT = 0;

    this.bindInput();
  }

  /* ------------------------------ 关卡装载 ------------------------------ */

  async loadLevel(index, seed) {
    this.levelIndex = clamp(index, 0, LEVEL_BLUEPRINTS.length - 1);
    const bp = LEVEL_BLUEPRINTS[this.levelIndex];
    const s = seed ?? (this.baseSeed + this.levelIndex * 7919);
    this.seed = s >>> 0;
    this.genome = await generateLevel(this.brain, bp, this.seed, this.profile);
    this.world = new World(this.genome, this.seed);
    this.world.blocked = (p) => {
      for (const c of this.world.cells) {
        const d = dist(p.x, p.y, c.x, c.y);
        if (d < c.r + p.r + 4) return true;
      }
      return false;
    };

    const g = this.genome;
    this.exo = new Exosome(this.world.start.x, this.world.start.y, g.scale.exoRadius);
    this.exo.energy = g.goals.startEnergy;
    this.exo.maxEnergy = Math.max(100, g.goals.startEnergy);
    this.capacity = g.goals.requiredCargo + 1;

    this.timeLeft = g.goals.timeLimit;
    this.nextReceptor = g.mechanics.receptorSequence > 0 ? 1 : 0;
    this.nextStation = this.world.stationHost ? 1 : 0;
    this.pen = null;
    this.message = '';
    this.messageT = 0;
    this.shake = 0;
    this.flash = 0;

    this.cam.x = this.exo.x; this.cam.y = this.exo.y;
    this.cam.zoom = 0.3; this.cam.tzoom = 0.95;
    this.state = 'intro';
    this.introT = 0;

    this.onLevelLoaded(this.genome, this.levelIndex);
    this.onEvent('level', { genome: this.genome, index: this.levelIndex });
  }

  restart() {
    this.loadLevel(this.levelIndex, this.seed);
  }

  nextLevel() {
    if (this.levelIndex >= LEVEL_BLUEPRINTS.length - 1) {
      this.state = 'menu';
      this.onEvent('allclear', {});
      return;
    }
    this.loadLevel(this.levelIndex + 1, (this.baseSeed + (this.levelIndex + 1) * 7919) >>> 0);
  }

  reroll() {
    this.baseSeed = (Math.random() * 1e9) | 0;
    this.loadLevel(this.levelIndex, (this.baseSeed + this.levelIndex * 7919) >>> 0);
  }

  /* ------------------------------ 输入 ------------------------------ */

  bindInput() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointerdown', (e) => {
      if (this.state === 'intro') { this.beginPlay(); return; }
      if (this.state !== 'playing') return;
      c.setPointerCapture?.(e.pointerId);
      this.input.pid = e.pointerId;
      const p = pos(e);
      this.input.down = true;
      this.input.sx = p.x; this.input.sy = p.y;
      this.input.cx = p.x; this.input.cy = p.y;
      this.input.boost = true;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.input.down) return;
      const p = pos(e);
      this.input.cx = p.x; this.input.cy = p.y;
    });
    // 若松手时指针正落在「返回星图」上，视作点按钮而非弹射
    const overMenuBtn = (e) => {
      if (!e || e.clientX == null || e.clientY == null) return false;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return !!(el && el.closest && el.closest('#btn-menu'));
    };
    const release = (e) => {
      if (this.input.pid != null) {
        try { c.releasePointerCapture(this.input.pid); } catch { /* 已自动释放 */ }
        this.input.pid = null;
      }
      if (!this.input.down) { this.input.boost = false; return; }
      this.input.down = false;
      this.input.boost = false;
      if (this.state !== 'playing' || this.pen) return;
      if (overMenuBtn(e)) { window.__exoBackToMenu?.(); return; }
      this.launch();
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    // 在窗口外松手可能收不到 pointerup：窗口级兜底，避免指针捕获残留导致按钮点不动
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    // 触摸时手指短暂移出画布不应提前发射（有 pointer capture 兜底）
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      release();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.state === 'intro') this.beginPlay();
        else if (this.state === 'playing') this.input.boost = true;
      }
      if (e.code === 'KeyR' && this.state !== 'menu') this.restart();
      if (e.code === 'KeyN' && this.state !== 'menu') this.reroll();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.input.boost = false;
    });
  }

  beginPlay() {
    this.state = 'playing';
    this.cam.tzoom = 1;
    this.onEvent('play', {});
  }

  screenToWorld(sx, sy) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return {
      x: (sx - w / 2) / this.cam.zoom + this.cam.x,
      y: (sy - h / 2) / this.cam.zoom + this.cam.y,
    };
  }

  launch() {
    const exo = this.exo;
    if (!exo) return;
    const dx = this.input.sx - this.input.cx;
    const dy = this.input.sy - this.input.cy;
    const len = Math.hypot(dx, dy);
    if (len < 12) return;
    const power = clamp(len / 170, 0, 1);
    const imp = power * this.genome.physics.launchMax;
    const nx = dx / len, ny = dy / len;
    const cost = 0.8 + power * 1.6 * (1 + this.genome.difficulty * 0.3);
    if (exo.energy < cost) {
      this.say('lowEnergy');
      this.showMsg('以太不足以弹射');
      return;
    }
    exo.energy -= cost;
    exo.vx += nx * imp;
    exo.vy += ny * imp;
    exo.hit(Math.atan2(ny, nx) + Math.PI / 2, 8, imp);
    this.flash = Math.max(this.flash, 0.25 * power);
    if (power < 0.22) this.say('launchWeak');
    this.onEvent('launch', { power });
  }

  /* ------------------------------ 主循环 ------------------------------ */

  start() {
    const loop = (ts) => {
      const t = ts / 1000;
      if (!this.lastFrame) this.lastFrame = t;
      let dt = Math.min(0.05, t - this.lastFrame);
      this.lastFrame = t;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    this.time += dt;
    if (this.state === 'playing') {
      this.acc += dt;
      let guard = 0;
      while (this.acc >= FIXED && guard++ < 12) {
        this.step(FIXED);
        this.acc -= FIXED;
      }
    } else if (this.state === 'intro') {
      this.introT += dt;
      this.world?.update(dt);
      if (this.introT > 0.05) this.cam.tzoom = lerp(0.95, 1.0, clamp(this.introT / 2.2, 0, 1));
    } else {
      this.world?.update(dt * 0.4);
    }
    this.updateCamera(dt);
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.messageT = Math.max(0, this.messageT - dt);
    if (this.onFrame) this.onFrame(this);
  }

  step(dt) {
    const exo = this.exo, world = this.world, g = this.genome;
    this.timeLeft -= dt;
    this.netStuck = false;

    if (this.pen) { this.stepPenetration(dt); this.postStep(dt); return; }

    const medium = world.mediumAt(exo.x, exo.y);
    this.applyHazardZones(exo, medium, dt);
    integrateBody(exo, dt, medium, world.time);
    exo.update(dt, world.time);

    this.collideCells(dt);
    this.collideOrganelles();
    this.collideHazards();
    clampToWorld(exo, world.worldRadius, 0.62);

    // 静止漂浮几乎不耗 ATP，运动才烧能量：鼓励停下来瞄准
    const sp = exo.speed;
    exo.energy -= g.goals.energyDrain * dt * (0.08 + 0.32 * Math.min(1, sp / 320));
    this.postStep(dt);
  }

  postStep(dt) {
    const exo = this.exo, g = this.genome;
    // ATP 会慢慢再生，避免陷入无能量的死局
    for (const a of this.world.atp) {
      if (!a.taken) continue;
      a.respawn -= dt;
      if (a.respawn <= 0) a.taken = false;
    }
    this.collectPickups();
    this.visitStations(dt);

    if (exo.energy <= 0) { this.fail('以太耗尽 · 囊泡归于尘土'); return; }
    if (this.timeLeft <= 0) { this.fail('时之窗闭 · 密文散佚'); return; }
  }

  /* ------------------------------ 碰撞 ------------------------------ */

  collideCells(dt) {
    const exo = this.exo;
    for (const cell of this.world.cells) {
      const dx = exo.x - cell.x, dy = exo.y - cell.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ang = Math.atan2(dy, dx);
      const memR = cell.membrane.radiusAt(ang);
      const half = cell.membrane.thickness * 0.5;
      const inside = d < memR;
      const gap = inside ? memR - d : d - memR;

      if (gap > exo.r + half) continue;

      const nx = dx / d, ny = dy / d;
      const vn = exo.vx * nx + exo.vy * ny;
      const inward = !inside;                    // 由外向内 = 向内
      const impactSpeed = Math.abs(vn);

      // 只有"朝膜运动"时才判定渗透
      if ((inward && vn < 0) || (!inward && vn > 0)) {
        const q = cell.membrane.query(ang, inward, impactSpeed, this.nextReceptorFor(cell));
        if (q.ok && exo.energy < 12) {
          this.showMsg('以太不足，挤不进膜', 1.1);
          this.say('lowEnergy');
          this.bounceOffMembrane(cell, ang, inward, exo.r + half - gap, impactSpeed);
          return;
        }
        if (q.ok) { this.startPenetration(cell, ang, inward, impactSpeed, q.slow || 1); return; }
        if (q.bounce || impactSpeed > 24) {
          this.bounceOffMembrane(cell, ang, inward, exo.r + half - gap, impactSpeed);
          if (q.reason) this.showMsg(q.reason, 0.9);
          if (impactSpeed > this.genome.membrane.maxEntrySpeed) this.say('tooFast');
          return;
        }
      }
      // 贴着膜滑动：只做位置修正
      const target = memR + (inside ? -(exo.r + half) : (exo.r + half));
      exo.x = cell.x + nx * target;
      exo.y = cell.y + ny * target;
    }
  }

  nextReceptorFor(cell) {
    if (cell.kind === 'nucleus') return 0;
    return this.nextReceptor;
  }

  bounceOffMembrane(cell, ang, inward, depth, speed) {
    const exo = this.exo;
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const sign = inward ? 1 : -1;   // 推离膜的方向：外->向外，内->向内
    exo.x += nx * sign * depth;
    exo.y += ny * sign * depth;
    const vn = exo.vx * nx + exo.vy * ny;
    const rest = 0.68 + this.genome.membrane.hardness * 0.26;
    if ((inward && vn < 0) || (!inward && vn > 0)) {
      exo.vx -= (1 + rest) * vn * nx;
      exo.vy -= (1 + rest) * vn * ny;
    }
    cell.membrane.impact(ang, clamp(speed * 0.06, 2, 26));
    exo.hit(ang, speed * 0.05, speed);
    exo.energy -= Math.min(1.2, speed * 0.0025);
    this.shake = Math.min(1, this.shake + speed * 0.0016);
  }

  collideOrganelles() {
    const exo = this.exo;
    const cont = this.world.containerOf(exo.x, exo.y, 0);
    if (!cont) return;
    for (const o of cont.organelles) {
      const hit = collideStaticCircle(exo, o.x, o.y, o.r, {
        restitution: 0.86, friction: 0.08, side: 1,
      });
      if (hit) {
        exo.hit(Math.atan2(hit.ny, hit.nx), hit.speed * 0.05, hit.speed);
        exo.energy -= Math.min(2.5, hit.speed * 0.004);
        this.shake = Math.min(1, this.shake + hit.speed * 0.0009);
        this.onEvent('bounce', { speed: hit.speed });
      }
    }
  }

  /** 诱捕网 / 细菌毒素云：进入区域则粘滞翻倍 + 持续掉能量 */
  applyHazardZones(exo, medium, dt) {
    let inZone = false;
    for (const h of this.world.hazards) {
      if (h.type === 'net') {
        if (dist(exo.x, exo.y, h.x, h.y) < h.r) { inZone = true; exo.energy -= 3.2 * dt; }
      } else if (h.type === 'bacterium') {
        if (dist(exo.x, exo.y, h.x, h.y) < h.r * 1.5) { inZone = true; exo.energy -= 2.6 * dt; }
      }
    }
    if (inZone) { medium.viscosity *= 4.5; this.netStuck = true; }
  }

  collideHazards() {
    const exo = this.exo;
    for (const h of this.world.hazards) {
      if (h.type === 'rotor') {
        const ex = h.x + Math.cos(h.a) * h.len, ey = h.y + Math.sin(h.a) * h.len;
        const hit = collideCapsule(exo, h.x, h.y, ex, ey, h.w, 1.15);
        if (hit) {
          exo.hit(Math.atan2(hit.ny, hit.nx), 0.5, hit.speed + 260);
          exo.energy -= 7;
          this.shake = 1;
          this.say('tooFast');
          this.showMsg('被动力蛋白抽中', 0.8);
        }
        continue;
      }
      if (h.type === 'net') continue;   // 诱捕网只造成区域粘滞，不硬碰撞
      const hit = collideMovingCircle(exo, h, 1.05);
      if (!hit) continue;
      exo.hit(Math.atan2(hit.ny, hit.nx), 0.4, hit.speed + 200);
      if (h.type === 'macrophage') {
        exo.energy -= 6;
        this.shake = Math.min(1, this.shake + 0.5);
        this.showMsg('被巨噬体吞噬', 0.8);
      } else if (h.type === 'nk') {
        const dmg = h.phase === 'dash' ? 16 : 8;
        exo.energy -= dmg;
        this.shake = Math.min(1, this.shake + (h.phase === 'dash' ? 0.9 : 0.5));
        this.showMsg(h.phase === 'dash' ? 'NK 细胞撞上你了！' : '撞上 NK 细胞', 0.8);
        if (h.phase === 'dash') this.say('tooFast');
      } else if (h.type === 'virus') {
        exo.energy -= 12;
        this.shake = Math.min(1, this.shake + 0.7);
        if (exo.carried.length > 0) { exo.carried.pop(); this.showMsg('密文被病毒夺走', 1.0); }
        else this.showMsg('病毒侵蚀', 0.8);
        this.say('tooFast');
      } else if (h.type === 'bacterium') {
        exo.energy -= 10;
        this.shake = Math.min(1, this.shake + 0.6);
        this.showMsg('撞上细菌，毒性侵蚀', 0.8);
      }
    }
  }

  /* ------------------------------ 渗透 ------------------------------ */

  startPenetration(cell, ang, inward, speed, slow = 1) {
    const exo = this.exo;
    const mem = cell.membrane;
    const memR = mem.radiusAt(ang);
    const half = mem.thickness * 0.5;
    const from = memR + (inward ? 1 : -1) * (exo.r + half - 2);
    const to = memR - (inward ? 1 : -1) * (exo.r + half + 6);
    const base = 0.8 + this.genome.membrane.hardness * 0.85 + (this.genome.mechanics.glycocalyx ? 0.25 : 0);
    this.pen = {
      cell, ang, inward, from, to, t: 0, slow,
      dur: base * slow,
      nx: Math.cos(ang), ny: Math.sin(ang),
      entry: speed,
    };
    exo.state = 'penetrating';
    exo.vx = 0; exo.vy = 0;
    this.flash = Math.max(this.flash, 0.2);
  }

  stepPenetration(dt) {
    const exo = this.exo, pen = this.pen, g = this.genome;
    const boost = this.input.boost ? 1.85 : 1;
    pen.t += (dt / pen.dur) * boost;
    const p = clamp(pen.t, 0, 1);
    const rad = lerp(pen.from, pen.to, p);
    exo.x = pen.cell.x + pen.nx * rad;
    exo.y = pen.cell.y + pen.ny * rad;
    exo.vx = 0; exo.vy = 0;
    exo.squashAngle = pen.ang + Math.PI / 2;
    exo.squash = Math.max(exo.squash, 0.35 + Math.sin(p * Math.PI) * 0.35);
    exo.trail.push(exo.x, exo.y, 0.2);
    if (exo.trail.length > 180) exo.trail.splice(0, 3);

    pen.cell.membrane.impact(pen.ang, 34 * dt * 60 * (pen.inward ? 1 : -0.7));
    exo.energy -= g.goals.energyDrain * dt * (boost > 1 ? 3.2 : 1.9) * (1 + (pen.slow - 1) * 0.45);

    if (exo.energy <= 0) { this.fail('以太耗尽 · 困于膜中'); return; }
    if (pen.t >= 1) this.finishPenetration();
  }

  finishPenetration() {
    const exo = this.exo, pen = this.pen, cell = pen.cell;
    const mem = cell.membrane;
    const memR = mem.radiusAt(pen.ang);
    const outR = memR - (pen.inward ? 1 : -1) * (exo.r + mem.thickness * 0.5 + 8);
    exo.x = cell.x + pen.nx * outR;
    exo.y = cell.y + pen.ny * outR;
    const residual = (pen.inward ? -1 : 1) * 46;
    exo.vx = pen.nx * residual;
    exo.vy = pen.ny * residual;
    exo.state = 'free';
    exo.squash = 0.5;
    exo.squashAngle = pen.ang + Math.PI / 2;
    mem.impact(pen.ang, 40);
    this.pen = null;
    this.flash = 0.45;

    const seg = mem.segs[mem.indexAt(pen.ang)];
    if (pen.inward) {
      cell.visited = true;
      cell.entered++;
      if (cell.kind === 'cell' && seg.kind === 2 && this.nextReceptor > 0 && seg.order === this.nextReceptor) {
        this.nextReceptor++;
        if (this.nextReceptor > this.genome.mechanics.receptorSequence) this.nextReceptor = 0;
      }
      this.say('penetrated');
      this.showMsg(pen.cell.kind === 'nucleus' ? '入核域' : '渗入门内', 1.1);
    } else {
      this.say('exit');
      this.showMsg('穿门而出', 1.0);
      if (cell === this.world.exitCell) this.tryWin();
    }
    this.onEvent('penetrated', { inward: pen.inward, cell: cell.id });
  }

  /* ------------------------------ 拾取 / 排队 ------------------------------ */

  collectPickups() {
    const exo = this.exo;
    for (const c of this.world.cargo) {
      if (c.taken) continue;
      if (dist(exo.x, exo.y, c.x, c.y) < exo.r + c.r + 14) {
        if (exo.carried.length >= this.capacity) {
          this.showMsg('密文已满', 0.7);
          continue;
        }
        c.taken = true;
        exo.addCargo(c.type);
        exo.energy += 2;
        this.say('cargoGot');
        this.flash = Math.max(this.flash, 0.3);
        this.onEvent('cargo', { total: exo.carried.length });
      }
    }
    for (const a of this.world.atp) {
      if (a.taken) continue;
      // 能量告急时 ATP 会被“吸”过来一点，避免陷入无解
      const magnet = exo.energy < 25 ? 40 : 0;
      if (dist(exo.x, exo.y, a.x, a.y) < exo.r + a.r + 22 + magnet) {
        a.taken = true;
        a.respawn = a.respawnDelay;
        exo.energy = Math.min(exo.maxEnergy, exo.energy + a.value);
        this.flash = Math.max(this.flash, 0.35);
        this.showMsg(`+${a.value} 以太`, 0.7);
        this.onEvent('atp', { value: a.value });
      }
    }
  }

  visitStations(dt) {
    const host = this.world.stationHost;
    if (!host) return;
    const exo = this.exo;
    for (const st of host.stations) {
      const near = dist(exo.x, exo.y, st.x, st.y) < st.r + exo.r + 6;
      if (!near) { st.dwell = Math.max(0, st.dwell - dt * 1.5); continue; }
      if (st.done) continue;
      if (st.order === this.nextStation) {
        st.dwell += dt;
        if (st.dwell >= 0.4) {
          st.done = true;
          st.dwell = 0;
          st.flash = 1;
          this.nextStation++;
          const type = CARGO_TYPES[(st.order - 1) % CARGO_TYPES.length];
          exo.addCargo(type);
          exo.energy += 4;
          this.flash = Math.max(this.flash, 0.4);
          this.say(this.nextStation > host.stations.length ? 'queueDone' : 'cargoGot');
          this.showMsg(`密文台 ${st.order} 已录 ${this.nextStation > host.stations.length ? '· 密文齐备' : `· 下一位 ${this.nextStation}`}`, 1.2);
          this.onEvent('station', { order: st.order });
        }
      } else if (st.dwell <= 0) {
        st.dwell = 1.2;
        exo.energy -= 6;
        this.say('wrongOrder');
        this.showMsg(`尚未轮到 ${st.order} 号密文台`, 1.0);
        this.shake = Math.min(1, this.shake + 0.4);
      }
    }
  }

  /* ------------------------------ 胜负 ------------------------------ */

  objectivesDone() {
    const g = this.genome;
    if (this.exo.carried.length < g.goals.requiredCargo) return false;
    if (g.mechanics.doubleMembrane && !(this.targetCell?.nucleus?.visited)) return false;
    if (g.mechanics.chain > 1) {
      for (const c of this.world.cells) {
        if (c.kind === 'cell' && !c.visited) return false;
      }
    }
    return true;
  }

  get targetCell() { return this.world?.targetCell; }

  /** 当前速度低于此值才可能渗进膜（薄区阈值，用于速度环提示） */
  get entryLimit() { return this.genome ? this.genome.membrane.maxEntrySpeed * 1.4 : 0; }

  tryWin() {
    if (!this.objectivesDone()) {
      const missing = this.genome.goals.requiredCargo - this.exo.carried.length;
      this.showMsg(missing > 0 ? `还差 ${missing} 份信息包` : '还有膜没穿过', 1.4);
      return;
    }
    this.state = 'won';
    this.profile.wins++;
    this.profile.adjust = clamp(this.profile.adjust + 0.05, -0.25, 0.25);
    this.flash = 0.8;
    this.onEvent('win', {
      level: this.levelIndex + 1,
      timeLeft: this.timeLeft,
      energy: this.exo.energy,
      carried: this.exo.carried.length,
    });
  }

  fail(reason) {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    this.profile.fails++;
    this.profile.adjust = clamp(this.profile.adjust - 0.06, -0.25, 0.25);
    this.exo.dead = true;
    this.say('dead');
    this.onEvent('lose', { reason, level: this.levelIndex + 1 });
  }

  /* ------------------------------ 相机 / 提示 ------------------------------ */

  updateCamera(dt) {
    if (!this.exo) return;
    const exo = this.exo;
    const sp = exo.speed;
    const inCell = !!this.world.containerOf(exo.x, exo.y);
    let tz = clamp(1.0 - sp / 1500, 0.42, 1.0);
    if (this.input.down && !this.pen) tz *= 0.88;
    if (this.state === 'intro') tz = lerp(0.3, 0.95, clamp(this.introT / 2.2, 0, 1));
    if (inCell) tz *= 0.92;
    this.cam.tzoom = tz;
    this.cam.zoom = lerp(this.cam.zoom, this.cam.tzoom, 1 - Math.exp(-dt * 2.6));

    // 视线前瞻
    const lead = 0.22;
    this.cam.tx = exo.x + exo.vx * lead;
    this.cam.ty = exo.y + exo.vy * lead;
    const k = 1 - Math.exp(-dt * 5.5);
    this.cam.x = lerp(this.cam.x, this.cam.tx, k);
    this.cam.y = lerp(this.cam.y, this.cam.ty, k);

    // 瞄准预测线
    if (this.state === 'playing' && this.input.down && !this.pen) {
      const m = this.world.mediumAt(exo.x, exo.y);
      const dx = this.input.sx - this.input.cx, dy = this.input.sy - this.input.cy;
      const len = Math.hypot(dx, dy);
      const power = clamp(len / 170, 0, 1);
      const probe = { x: exo.x, y: exo.y, vx: (dx / len) * power * this.genome.physics.launchMax, vy: (dy / len) * power * this.genome.physics.launchMax, r: exo.r };
      this.aimPower = power;
      this.aimPath = predictPath(probe, { ...m }, this.world, 90, 1 / 45, 90);
    } else {
      this.aimPath = [];
      this.aimPower = 0;
    }
  }

  showMsg(text, dur = 1.2) {
    this.message = text;
    this.messageT = dur;
    this.onEvent('msg', { text });
  }

  say(event) {
    const line = this.director.say(event, {
      level: this.levelIndex + 1,
      energy: Math.round(this.exo?.energy || 0),
      time: Math.round(this.timeLeft || 0),
      carried: this.exo?.carried.length || 0,
    }, this.time);
    if (line) {
      this.director.onRemote = (t) => this.showMsg(t, 1.6);
      this.onEvent('director', { text: line });
    }
  }
}
