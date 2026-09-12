// 渲染：软糖质感外泌体、活的磷脂膜、巨人国尺度的细胞器

import { TAU, clamp, lerp, makeRng } from '../core/rng.js';
import { SEG_THIN, SEG_RECEPTOR, SEG_EXIT } from './membrane.js';

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

const SPRITES = [
  // 主角（AI 生成的软糖原画，四态）
  ['normal', './assets/exo-normal.png'],
  ['squeeze', './assets/exo-squeeze.png'],
  ['cargo', './assets/exo-cargo.png'],
  ['low', './assets/exo-low.png'],
  // 巨人国的巨物 + 能量颗粒，同一视觉语言
  ['mito', './assets/organelle-mito.png'],
  ['er', './assets/organelle-er.png'],
  ['golgi', './assets/organelle-golgi.png'],
  ['vesicle', './assets/organelle-vesicle.png'],
  ['nucleus', './assets/organelle-nucleus.png'],
  ['atp', './assets/pick-atp.png'],
  // 免疫 / 病原敌人（同一软糖视觉语言）
  ['macrophage', './assets/enemy-macrophage.png'],
  ['nk', './assets/enemy-nk.png'],
  ['virus', './assets/enemy-virus.png'],
  ['bacterium', './assets/enemy-bacterium.png'],
  ['net', './assets/hazard-net.png'],
];

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    const rng = makeRng(20260912);
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: rng.range(-3200, 3200), y: rng.range(-3200, 3200),
        r: rng.range(0.6, 2.6), a: rng.range(0.08, 0.5), p: rng() * TAU,
      });
    }
    this.glyco = [];
    for (let i = 0; i < 300; i++) this.glyco.push({ a: rng() * TAU, l: rng.range(14, 34), p: rng() * TAU });

    // AI 生成的软糖原画精灵：normal / squeeze（渗透挤压）/ cargo（携带信息）/ low（能量枯竭）
    this.sprites = {};
    for (const [key, src] of SPRITES) {
      const img = new Image();
      img.onload = () => { this.sprites[key] = prepareSprite(img); };
      img.src = src;
    }
  }

  draw(g) {
    const ctx = this.ctx;
    const c = g.canvas;
    const w = c.clientWidth, h = c.clientHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const dpr = c.width / w;
    ctx.scale(dpr, dpr);

    this.bg(ctx, w, h, g);

    if (!g.world) return;
    ctx.save();
    const sh = g.shake;
    if (sh > 0) ctx.translate((Math.random() - 0.5) * sh * 14, (Math.random() - 0.5) * sh * 14);
    ctx.translate(w / 2, h / 2);
    ctx.scale(g.cam.zoom, g.cam.zoom);
    ctx.translate(-g.cam.x, -g.cam.y);

    this.worldBounds(ctx, g);
    for (const cell of g.world.cells) if (cell.kind === 'cell') this.cell(ctx, cell, g);
    this.pickups(ctx, g);
    this.hazards(ctx, g);
    this.aim(ctx, g);
    this.exosome(ctx, g);
    ctx.restore();

    if (g.flash > 0) {
      ctx.fillStyle = `rgba(180,230,255,${g.flash * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  bg(ctx, w, h, g) {
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#080512');
    grd.addColorStop(0.5, '#120b22');
    grd.addColorStop(1, '#1b0f22');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // 视差漂浮颗粒（组织液里的碎屑）
    const z = g.cam?.zoom || 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(z, z);
    ctx.translate(-(g.cam?.x || 0) * 0.35, -(g.cam?.y || 0) * 0.35);
    for (const s of this.stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(g.time * 0.6 + s.p));
      ctx.fillStyle = `rgba(150,200,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // 巨人国的暗影：几团巨大的模糊结构
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.3) - (g.cam?.x || 0) * 0.06 * z;
      const y = h * (0.3 + (i % 2) * 0.35) - (g.cam?.y || 0) * 0.06 * z;
      const r = Math.max(w, h) * (0.35 + i * 0.12);
      const rg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      rg.addColorStop(0, 'rgba(150,110,90,0.45)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  worldBounds(ctx, g) {
    const r = g.world.worldRadius;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,255,0.16)';
    ctx.lineWidth = 6 / g.cam.zoom;
    ctx.setLineDash([30, 26]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------- 细胞 ------------------------------- */

  cell(ctx, cell, g) {
    const mem = cell.membrane;
    const t = g.world.time;

    // 细胞质
    ctx.save();
    const cg = ctx.createRadialGradient(cell.x - cell.r * 0.2, cell.y - cell.r * 0.2, cell.r * 0.1, cell.x, cell.y, cell.r);
    cg.addColorStop(0, 'rgba(58,32,96,0.55)');
    cg.addColorStop(0.65, 'rgba(38,26,74,0.45)');
    cg.addColorStop(1, 'rgba(28,20,60,0.35)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    this.membranePath(ctx, cell, mem, t, 0);
    ctx.fill();
    ctx.restore();

    // 核：铺一层 AI 生成的核原画，让第二道门有实体感
    if (cell.kind === 'nucleus' && this.sprites.nucleus) {
      const sp = this.sprites.nucleus;
      const L = (2 * cell.r) / Math.max(sp.box.w, sp.box.h) * 1.02;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.translate(cell.x, cell.y);
      ctx.rotate(t * 0.02);
      ctx.drawImage(sp.canvas, -sp.box.cx * L, -sp.box.cy * L, L, L);
      ctx.restore();
    }

    // 细胞器
    for (const o of cell.organelles) this.organelle(ctx, o, t);

    // 核（第二层膜）
    if (cell.nucleus) this.cell(ctx, cell.nucleus, g);

    // 装载站
    for (const st of cell.stations) this.station(ctx, st, g, t);

    // 糖萼
    if (mem.glyco > 0) this.glycocalyx(ctx, cell, mem, t);

    // 膜本体（磷脂双分子层）
    this.membrane(ctx, cell, mem, t, g);

    // 目标细胞标识
    if (cell === g.world.exitCell) {
      ctx.save();
      ctx.strokeStyle = `rgba(126,240,208,${0.25 + 0.15 * Math.sin(t * 2)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, mem.radiusAt(0) + 46, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  membranePath(ctx, cell, mem, t, offset) {
    const n = mem.n;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const a = (i / n) * TAU;
      const wob = Math.sin(t * 1.1 + idx * 0.4) * 1.4;
      const r = cell.r + mem.nodes[idx] + wob + offset;
      const x = cell.x + Math.cos(a) * r, y = cell.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  membrane(ctx, cell, mem, t, g) {
    const n = mem.n;
    const headR = mem.thickness * 0.34;

    // 分段底色
    for (let i = 0; i < n; i++) {
      const s = mem.segs[i];
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const r0 = cell.r + mem.nodes[i];
      let color = null;
      if (s.kind === SEG_THIN) color = `rgba(126,240,208,${0.13 + 0.06 * Math.sin(t * 2 + i)})`;
      else if (s.kind === SEG_RECEPTOR) {
        const active = g.nextReceptor === 0 || s.order === g.nextReceptor;
        color = active
          ? `rgba(255,180,107,${0.22 + 0.18 * Math.sin(t * 4 + i * 0.5)})`
          : 'rgba(255,180,107,0.07)';
      } else if (s.kind === SEG_EXIT) color = `rgba(140,255,170,${0.16 + 0.1 * Math.sin(t * 3)})`;

      // 撞击与渗透留下的金色余辉：膜被“点亮”的那一处
      if (s.glow > 0.02) {
        ctx.strokeStyle = `rgba(227,192,122,${Math.min(0.55, s.glow * 0.42)})`;
        ctx.lineWidth = mem.thickness * (1.5 + Math.min(1.6, s.glow));
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, r0, a0, a1);
        ctx.stroke();
      }
      if (!color) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = mem.thickness * 1.5;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, r0, a0, a1);
      ctx.stroke();
    }

    // 磷脂头（内外两层）
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const base = cell.r + mem.nodes[i] + Math.sin(t * 1.1 + i * 0.4) * 1.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      const isThin = mem.segs[i].kind === SEG_THIN;
      const isExit = mem.segs[i].kind === SEG_EXIT;
      const col = isExit ? '#8dffab' : isThin ? '#7ef0d0' : '#b9a6ff';
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      for (const s of [-1, 1]) {
        const rr = base + s * mem.thickness * 0.36;
        ctx.beginPath();
        ctx.arc(cell.x + ca * rr, cell.y + sa * rr, headR, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 受体编号
    if (mem.receptorCount > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const s = mem.segs[i];
        if (s.kind !== SEG_RECEPTOR || s.order === 0) continue;
        if (s.order !== g.nextReceptor && g.nextReceptor !== 0) continue;
        const a = (i / n) * TAU;
        const rr = cell.r + mem.nodes[i] + mem.thickness * 1.9;
        ctx.fillStyle = '#ffce8a';
        ctx.font = `bold ${Math.max(12, mem.thickness)}px ui-monospace, monospace`;
        ctx.fillText(String(s.order), cell.x + Math.cos(a) * rr, cell.y + Math.sin(a) * rr);
      }
      ctx.restore();
    }

    // 出口箭头
    const ei = mem.exitIndex;
    const ea = ((ei + 1.5) / n) * TAU;
    const er = cell.r + mem.nodes[ei] + mem.thickness * 2.4;
    ctx.save();
    ctx.translate(cell.x + Math.cos(ea) * er, cell.y + Math.sin(ea) * er);
    ctx.rotate(ea);
    ctx.fillStyle = '#8dffab';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-10, 10); ctx.lineTo(-10, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  glycocalyx(ctx, cell, mem, t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,150,220,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < this.glyco.length; i++) {
      const gg = this.glyco[i];
      const a = gg.a;
      const base = cell.r + mem.nodes[mem.indexAt(a)] + 4;
      const sway = Math.sin(t * 1.6 + gg.p) * 0.18;
      const x0 = cell.x + Math.cos(a) * base, y0 = cell.y + Math.sin(a) * base;
      const x1 = cell.x + Math.cos(a + sway) * (base + gg.l), y1 = cell.y + Math.sin(a + sway) * (base + gg.l);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,170,230,0.35)';
      ctx.beginPath();
      ctx.arc(x1, y1, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  organelle(ctx, o, t) {
    const sp = this.sprites[o.kind];
    if (sp) {
      const pulse = 1 + Math.sin(t * 0.8 + o.wob) * 0.02;
      const L = (2 * o.r) / Math.max(sp.box.w, sp.box.h) * 0.98;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.wob * 0.05 + Math.sin(t * 0.25 + o.wob) * 0.03);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = 0.94;
      ctx.drawImage(sp.canvas, -sp.box.cx * L, -sp.box.cy * L, L, L);
      ctx.restore();
      return;
    }
    ctx.save();
    const pulse = 1 + Math.sin(t * 0.8 + o.wob) * 0.02;
    ctx.translate(o.x, o.y);
    ctx.scale(pulse, pulse);
    const grd = ctx.createRadialGradient(-o.r * 0.3, -o.r * 0.35, o.r * 0.1, 0, 0, o.r);
    if (o.kind === 'mito') {
      grd.addColorStop(0, 'rgba(255,140,120,0.55)');
      grd.addColorStop(1, 'rgba(120,40,60,0.35)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(0, 0, o.r, o.r * 0.62, o.wob * 0.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,170,0.35)';
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, o.r * (0.25 + i * 0.11), o.r * 0.5, o.wob * 0.2, 0, TAU);
        ctx.stroke();
      }
    } else if (o.kind === 'er') {
      grd.addColorStop(0, 'rgba(160,200,255,0.45)');
      grd.addColorStop(1, 'rgba(60,90,160,0.3)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(200,225,255,0.3)';
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.arc(0, 0, o.r * (i / 4), 0, TAU); ctx.stroke();
      }
    } else if (o.kind === 'golgi') {
      grd.addColorStop(0, 'rgba(255,220,150,0.45)');
      grd.addColorStop(1, 'rgba(140,90,40,0.3)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,235,190,0.35)';
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(0, i * o.r * 0.28, o.r * (0.9 - Math.abs(i) * 0.18), Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    } else {
      grd.addColorStop(0, 'rgba(200,255,240,0.4)');
      grd.addColorStop(1, 'rgba(60,120,120,0.25)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(220,255,250,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, o.r * 0.7, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  station(ctx, st, g, t) {
    const active = st.order === g.nextStation;
    ctx.save();
    ctx.translate(st.x, st.y);
    const pulse = active ? 1 + Math.sin(t * 5) * 0.08 : 1;
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = st.done ? 'rgba(140,255,170,0.9)' : active ? 'rgba(255,220,140,0.95)' : 'rgba(180,180,220,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.2;
      const x = Math.cos(a) * st.r, y = Math.sin(a) * st.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = st.done ? 'rgba(140,255,170,0.16)' : 'rgba(255,220,140,0.1)';
    ctx.fill();

    if (st.dwell > 0 && active) {
      ctx.strokeStyle = '#ffdc8c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, st.r + 10, -Math.PI / 2, -Math.PI / 2 + (st.dwell / 0.4) * TAU);
      ctx.stroke();
    }

    // 密文台同样浮起符文环：装载中越转越快，录完时爆开一圈金光
    const prog = clamp(st.dwell / 0.4, 0, 1);
    const loading = active && !st.done && st.dwell > 0;
    if (loading || st.done || st.flash > 0) {
      this.drawRuneRing(ctx, 0, 0, st.r * (loading ? 1.5 : 1.18), t, {
        alpha: loading ? 0.34 + 0.5 * prog : 0.24,
        spin: loading ? 0.8 + prog * 2.2 : 0.3,
        fontSize: Math.max(9, st.r * 0.3),
        seed: st.order * 2,
        burst: st.flash > 0 ? 1 - st.flash : 0,
      });
    }
    ctx.fillStyle = st.done ? '#8dffab' : active ? '#ffdc8c' : 'rgba(200,200,230,0.5)';
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st.done ? '✓' : String(st.order), 0, 1);
    ctx.restore();
  }

  /* ------------------------------ 拾取物 ------------------------------ */

  pickups(ctx, g) {
    const t = g.world.time;
    for (const c of g.world.cargo) {
      if (c.taken) continue;
      const bob = Math.sin(t * 1.6 + c.bob) * 4;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, c.r * 2.6);
      grd.addColorStop(0, c.type.color);
      grd.addColorStop(0.35, c.type.color + '66');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, c.r * 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = c.type.color;
      ctx.beginPath(); ctx.arc(0, 0, c.r * 0.62, 0, TAU); ctx.fill();
      ctx.strokeStyle = c.type.color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // miRNA 画成小发夹，其余画成环绕弧
      if (c.type.id === 'miRNA') {
        ctx.arc(0, 0, c.r, -Math.PI * 0.8, Math.PI * 0.8);
      } else {
        ctx.arc(0, 0, c.r, t * 1.4, t * 1.4 + Math.PI * 1.3);
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const a of g.world.atp) {
      if (a.taken) continue;
      const bob = Math.sin(t * 2 + a.bob) * 3;
      ctx.save();
      ctx.translate(a.x, a.y + bob);
      ctx.rotate(t * 0.6 + a.spin);
      const sp = this.sprites.atp;
      if (sp) {
        const L = (2 * a.r * 1.6) / Math.max(sp.box.w, sp.box.h);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(sp.canvas, -sp.box.cx * L, -sp.box.cy * L, L, L);
      } else {
        const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, a.r * 2.4);
        grd.addColorStop(0, '#ffe680');
        grd.addColorStop(1, 'rgba(255,230,128,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, a.r * 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe680';
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * a.r * 0.55, Math.sin(ang) * a.r * 0.55, a.r * 0.3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  hazards(ctx, g) {
    const t = g.world.time;
    for (const h of g.world.hazards) {
      if (h.type === 'rotor') {
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.a);
        ctx.strokeStyle = 'rgba(255,110,150,0.75)';
        ctx.lineWidth = h.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(h.len, 0);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,140,180,0.9)';
        ctx.beginPath(); ctx.arc(h.len, 0, h.w * 0.9, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (h.type === 'net') {
        this.drawNet(ctx, h, t);
      } else {
        // 移动型敌人（巨噬 / NK / 病毒 / 细菌）用 AI 生成的软糖精灵
        if (h.type === 'bacterium') this.drawToxin(ctx, h, t);
        if (h.type === 'nk' && h.phase === 'charge') this.drawChargeWarn(ctx, h, t);
        if (h.type === 'virus' && h.phase === 'dash') {
          ctx.save();
          ctx.translate(h.x, h.y);
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = 'rgba(255,80,140,0.5)';
          ctx.beginPath(); ctx.arc(0, 0, h.r * 1.5, 0, TAU); ctx.fill();
          ctx.restore();
        }
        const sp = this.sprites[h.type];
        if (sp) {
          const grow = h.type === 'bacterium' ? 1.5 : 1.12;
          const L = (2 * h.r) / Math.max(sp.box.w, sp.box.h) * grow;
          ctx.save();
          ctx.translate(h.x, h.y);
          ctx.rotate(t * (h.spin || 0) * 0.5 + (h.type === 'virus' ? t * 3 : 0));
          ctx.globalAlpha = 0.97;
          ctx.drawImage(sp.canvas, -sp.box.cx * L, -sp.box.cy * L, L, L);
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(h.x, h.y);
          ctx.fillStyle = 'rgba(255,90,140,0.6)';
          ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  /** 中性粒细胞胞外诱捕网：缓慢自转的胶质网 + 范围警示圈 */
  drawNet(ctx, h, t) {
    const sp = this.sprites.net;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(t * (h.spin || 0) + 0.3);
    ctx.globalAlpha = 0.55;
    if (sp) {
      const L = (2 * h.r) / Math.max(sp.box.w, sp.box.h);
      ctx.drawImage(sp.canvas, -sp.box.cx * L, -sp.box.cy * L, L, L);
    } else {
      ctx.strokeStyle = 'rgba(150,255,200,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(150,255,200,0.85)';
    ctx.setLineDash([5, 11]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  drawToxin(ctx, h, t) {
    ctx.save();
    ctx.translate(h.x, h.y);
    const R = h.r * 1.5;
    const grd = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    grd.addColorStop(0, 'rgba(120,200,150,0.22)');
    grd.addColorStop(1, 'rgba(80,200,120,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawChargeWarn(ctx, h, t) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 12);
    ctx.strokeStyle = 'rgba(255,90,120,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, h.r + 14, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------ 外泌体 ------------------------------ */

  aim(ctx, g) {
    if (!g.aimPath || g.aimPath.length < 4) return;
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(180,240,255,${0.25 + g.aimPower * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(g.aimPath[0], g.aimPath[1]);
    for (let i = 2; i < g.aimPath.length; i += 2) ctx.lineTo(g.aimPath[i], g.aimPath[i + 1]);
    ctx.stroke();
    ctx.restore();

    // 力度弧
    const exo = g.exo;
    ctx.save();
    ctx.translate(exo.x, exo.y);
    ctx.strokeStyle = `rgba(255,${Math.round(220 - g.aimPower * 120)},120,0.85)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, exo.r + 14, -Math.PI / 2, -Math.PI / 2 + g.aimPower * TAU);
    ctx.stroke();
    ctx.restore();
  }

  exosome(ctx, g) {
    const exo = g.exo;
    if (!exo) return;
    const t = g.world.time;

    // 拖尾
    const tr = exo.trail;
    if (tr.length > 6) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 3; i < tr.length; i += 3) {
        const a = (i / tr.length) * 0.5 * (tr[i + 2] ?? 0.3);
        ctx.strokeStyle = `rgba(160,220,255,${a * 0.5})`;
        ctx.lineWidth = exo.r * (0.3 + (i / tr.length) * 0.9);
        ctx.beginPath();
        ctx.moveTo(tr[i - 3], tr[i - 2]);
        ctx.lineTo(tr[i], tr[i + 1]);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 渗透：接触点浮现金色符文环
    if (g.pen) this.runeRing(ctx, g, t);

    // 渗透进度环
    if (g.pen) {
      const p = clamp(g.pen.t, 0, 1);
      ctx.save();
      ctx.translate(exo.x, exo.y);
      ctx.strokeStyle = 'rgba(243,220,166,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, exo.r + 22, -Math.PI / 2, -Math.PI / 2 + p * TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 渗透速度环：青=当前速度能挤进膜，红=会被弹开
    const limit = g.entryLimit || 0;
    if (limit > 0 && !exo.dead) {
      const sp = exo.speed;
      const canEnter = sp <= limit;
      ctx.save();
      ctx.translate(exo.x, exo.y);
      ctx.strokeStyle = canEnter ? 'rgba(126,240,208,0.35)' : 'rgba(255,110,140,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, exo.r + 10, 0, TAU); ctx.stroke();
      ctx.strokeStyle = canEnter ? 'rgba(126,240,208,0.95)' : 'rgba(255,110,140,0.9)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, 0, exo.r + 10, -Math.PI / 2, -Math.PI / 2 + clamp(sp / (limit * 1.5), 0, 1) * TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 被诱捕网/细菌毒素云黏住：外圈亮一圈警示绿
    if (g.netStuck && !exo.dead) {
      ctx.save();
      ctx.translate(exo.x, exo.y);
      ctx.strokeStyle = 'rgba(150,255,200,0.6)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.arc(0, 0, exo.r + 16, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // 主角：优先用 AI 生成的软糖原画精灵，未就绪时回退到程序化软糖
    const key = this.pickSprite(g);
    const sp = this.sprites[key];
    if (sp) this.drawSprite(sp, exo, key);
    else this.drawBlob(ctx, exo);

    // 挂载的信息包
    ctx.save();
    for (let i = 0; i < exo.carried.length; i++) {
      const p = exo.cargoSlot(i, t);
      const col = exo.carried[i].color;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(exo.x, exo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------- 穿膜符文环（神秘学） ------------------- */

  runeRing(ctx, g, t) {
    const pen = g.pen, exo = g.exo;
    const p = clamp(pen.t, 0, 1);
    this.drawRuneRing(ctx, exo.x, exo.y, exo.r * (3.8 - p * 1.2), t, {
      alpha: 0.3 + 0.55 * Math.sin(p * Math.PI),   // 挤到一半时最盛
      spin: 0.5 + p * 1.8,
      fontSize: Math.max(11, exo.r * 1.05),
      seed: g.levelIndex * 3,
      burst: p > 0.85 ? (p - 0.85) / 0.15 : 0,
    });
  }

  /** 通用金色符文环：外环 + 反向虚线内环 + 环上卢恩符文；burst>0 时向外扩散一圈金光 */
  drawRuneRing(ctx, x, y, R, t, opts = {}) {
    const count = opts.count ?? 12;
    const alpha = opts.alpha ?? 0.6;
    const spin = opts.spin ?? 1;
    const seed = opts.seed ?? 0;

    ctx.save();
    ctx.translate(x, y);

    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = '#e3c07a';
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();

    ctx.save();
    ctx.rotate(-t * spin * 0.6);
    ctx.globalAlpha = alpha * 0.5;
    ctx.setLineDash([Math.max(3, R * 0.14), Math.max(5, R * 0.22)]);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.74, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    ctx.font = `${opts.fontSize ?? Math.max(10, R * 0.3)}px "Songti SC", ui-serif, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f7e3b4';
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + t * spin;
      const rr = R * 0.87;
      ctx.save();
      ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.rotate(a + Math.PI / 2);
      ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(t * 3.2 + i * 0.8));
      ctx.fillText(RUNES[(i + seed) % RUNES.length], 0, 0);
      ctx.restore();
    }

    if (opts.burst > 0) {
      const k = clamp(opts.burst, 0, 1);
      ctx.globalAlpha = (1 - k * 0.7) * 0.8;
      ctx.strokeStyle = '#fff3d6';
      ctx.lineWidth = Math.max(2, R * 0.1);
      ctx.beginPath(); ctx.arc(0, 0, R * (1 + k * 1.6), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------- AI 生成的软糖原画精灵 ------------------- */

  pickSprite(g) {
    const exo = g.exo;
    if (exo.dead || exo.energy < 25) return 'low';
    if (g.pen || exo.squash > 0.5) return 'squeeze';
    if (exo.carried.length > 0) return 'cargo';
    return 'normal';
  }

  drawSprite(sp, exo, key) {
    const ctx = this.ctx;
    const r = exo.r;
    // 让精灵里的主体直径正好等于 2r（自动补偿原图留白）
    const L = (2 * r) / Math.max(sp.box.w, sp.box.h) * 1.06;
    const sq = exo.squash * (key === 'squeeze' ? 0.32 : 1);
    ctx.save();
    ctx.translate(exo.x, exo.y);
    ctx.rotate(exo.squashAngle);
    ctx.scale(1 - sq * 0.34, 1 + sq * 0.26);
    // 身下的柔光晕，让原画自然融进暗场
    const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.1);
    halo.addColorStop(0, 'rgba(168,150,255,0.32)');
    halo.addColorStop(0.5, 'rgba(126,240,208,0.14)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, TAU); ctx.fill();
    ctx.globalAlpha = exo.dead ? 0.4 : 1;
    ctx.drawImage(sp.canvas, -sp.box.cx * L, -sp.box.cy * L, L, L);
    ctx.restore();
  }

  /** 回退方案：程序化软糖（精灵未加载完时使用） */
  drawBlob(ctx, exo) {
    ctx.save();
    ctx.translate(exo.x, exo.y);
    ctx.rotate(exo.squashAngle);
    const sq = exo.squash;
    ctx.scale(1 - sq * 0.42, 1 + sq * 0.34);
    const r = exo.r;
    const lowEnergy = exo.energy < 25;
    const grd = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.08, 0, 0, r * 1.25);
    grd.addColorStop(0, 'rgba(255,255,255,0.98)');
    grd.addColorStop(0.22, lowEnergy ? 'rgba(255,190,210,0.92)' : 'rgba(226,214,255,0.92)');
    grd.addColorStop(0.62, lowEnergy ? 'rgba(255,120,170,0.6)' : 'rgba(168,150,255,0.62)');
    grd.addColorStop(1, lowEnergy ? 'rgba(190,60,120,0.18)' : 'rgba(120,220,255,0.2)');
    ctx.globalAlpha = exo.dead ? 0.35 : 0.94;
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([r * 0.35, r * 0.28]);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.33, -r * 0.4, r * 0.26, r * 0.16, -0.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * 精灵预处理：按「亮度 / 饱和度取键」抠掉暗底（自动去背，含纯黑边）
 * 同时算出主体包围盒，用于把主体精确对齐到外泌体碰撞半径。
 */
function prepareSprite(img) {
  const s = 256;
  const box0 = { w: 0.72, h: 0.72, cx: 0.5, cy: 0.5 };
  try {
    let c;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(s, s);
    else { c = document.createElement('canvas'); c.width = s; c.height = s; }
    const cc = c.getContext('2d', { willReadFrequently: true });
    if (!cc) return { canvas: img, box: box0 };
    const k = s / Math.max(img.width, img.height);
    const w = img.width * k, h = img.height * k;
    cc.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
    const data = cc.getImageData(0, 0, s, s);
    const d = data.data;

    let minX = s, minY = s, maxX = -1, maxY = -1;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        // 亮度 / 饱和度取键：暗底（含纯黑边）一律透明，彩色暗部仍保留
        const r = d[i], g2 = d[i + 1], b2 = d[i + 2];
        const lum = 0.299 * r + 0.587 * g2 + 0.114 * b2;
        const sat = Math.max(r, g2, b2) - Math.min(r, g2, b2);
        const a = clamp((Math.max(lum, sat * 1.35) - 26) / 54, 0, 1) * 255;
        d[i + 3] = a;
        if (a > 26) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    cc.putImageData(data, 0, 0);
    const box = maxX < 0 ? box0 : {
      w: (maxX - minX + 1) / s,
      h: (maxY - minY + 1) / s,
      cx: (minX + maxX) / 2 / s,
      cy: (minY + maxY) / 2 / s,
    };
    return { canvas: c, box };
  } catch {
    return { canvas: img, box: box0 };
  }
}
