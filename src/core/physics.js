// 轻量刚体物理：粘滞介质积分、圆-圆冲量、圆-壁反弹

import { clamp } from './rng.js';

/**
 * 介质参数：
 *  viscosity  粘滞系数 (1/s)，速度会被拉向 flow
 *  gravity    重力/浮力加速度 (px/s^2)
 *  flow       介质本底漂移 (px/s)
 *  turbulence 湍流强度与频率
 */
export function integrateBody(b, dt, medium, time) {
  const vx0 = b.vx, vy0 = b.vy;

  // 重力 / 浮力
  b.vx += (medium.gravity?.x || 0) * dt;
  b.vy += (medium.gravity?.y || 0) * dt;

  // 湍流流场（位置相关，随时间演化）
  let fx = medium.flow?.x || 0;
  let fy = medium.flow?.y || 0;
  const t = medium.turbulence || 0;
  if (t > 0) {
    const f = medium.turbFreq || 0.0015;
    const s = medium.turbScale || 0.006;
    fx += Math.sin(b.y * s + time * 0.6) * t;
    fy += Math.cos(b.x * s * 1.3 + time * 0.5) * t;
    fx += Math.sin((b.x + b.y) * f + time * 0.23) * t * 0.6;
  }

  // 粘滞阻尼：指数收敛到介质流速
  const k = Math.max(0, medium.viscosity || 0);
  const damp = Math.exp(-k * dt);
  b.vx = fx + (b.vx - fx) * damp;
  b.vy = fy + (b.vy - fy) * damp;

  b.x += (vx0 + b.vx) * 0.5 * dt;
  b.y += (vy0 + b.vy) * 0.5 * dt;
}

/** 圆 vs 静态圆：side=1 表示 body 在圆外（撞外面），side=-1 表示 body 在圆内（撞内壁） */
export function collideStaticCircle(b, cx, cy, cr, opts = {}) {
  const restitution = opts.restitution ?? 0.72;
  const friction = opts.friction ?? 0.06;
  const dx = b.x - cx, dy = b.y - cy;
  const d = Math.hypot(dx, dy) || 1e-6;
  const side = opts.side ?? 1; // 1: body 在圆外撞外壁; -1: body 在圆内撞内壁
  const overlap = side === 1 ? b.r + cr - d : d + b.r - cr;
  if (overlap <= 0) return null;

  const ux = dx / d, uy = dy / d;          // 圆心 -> body
  const nx = ux * side, ny = uy * side;    // body 应被推开的方向
  b.x += nx * overlap;
  b.y += ny * overlap;

  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const tx = -ny, ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
    // 切向摩擦
    b.vx -= friction * vt * tx;
    b.vy -= friction * vt * ty;
  }
  return { nx, ny, speed: Math.abs(vn), cx: cx + ux * cr, cy: cy + uy * cr };
}

/** 圆 vs 运动圆（旋转纤毛 / 巨噬巡逻体）：带表面速度传递 */
export function collideMovingCircle(b, o, restitution = 0.8) {
  const dx = b.x - o.x, dy = b.y - o.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const overlap = b.r + o.r - d;
  if (overlap <= 0) return null;
  const nx = dx / d, ny = dy / d;
  b.x += nx * overlap;
  b.y += ny * overlap;
  // 障碍物表面速度（平移 + 自转在接触点的切向速度）
  const svx = (o.vx || 0) - (o.spin || 0) * (b.y - o.y);
  const svy = (o.vy || 0) + (o.spin || 0) * (b.x - o.x);
  const relvx = b.vx - svx, relvy = b.vy - svy;
  const vn = relvx * nx + relvy * ny;
  if (vn < 0) {
    const j = -(1 + restitution) * vn;
    b.vx += j * nx;
    b.vy += j * ny;
  }
  return { nx, ny, speed: Math.abs(vn) };
}

/** 圆 vs 轴对齐矩形世界边界（返回是否碰撞） */
export function clampToWorld(b, w, restitution = 0.6) {
  let hit = false;
  if (b.x - b.r < -w) { b.x = -w + b.r; b.vx = Math.abs(b.vx) * restitution; hit = true; }
  if (b.x + b.r > w) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * restitution; hit = true; }
  if (b.y - b.r < -w) { b.y = -w + b.r; b.vy = Math.abs(b.vy) * restitution; hit = true; }
  if (b.y + b.r > w) { b.y = w - b.r; b.vy = -Math.abs(b.vy) * restitution; hit = true; }
  return hit;
}

/** 圆 vs 胶囊（线段 + 半径），用于旋转臂 */
export function collideCapsule(b, ax, ay, bx, by, cr, restitution = 0.8) {
  const abx = bx - ax, aby = by - ay;
  const t = clamp(((b.x - ax) * abx + (b.y - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  const px = ax + abx * t, py = ay + aby * t;
  const dx = b.x - px, dy = b.y - py;
  const d = Math.hypot(dx, dy) || 1e-6;
  const overlap = b.r + cr - d;
  if (overlap <= 0) return null;
  const nx = dx / d, ny = dy / d;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
  }
  return { nx, ny, speed: Math.abs(vn) };
}

/** 预测轨迹（用于瞄准虚线） */
export function predictPath(b, medium, world, steps, dt, maxLen) {
  const p = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r };
  const pts = [];
  for (let i = 0; i < steps; i++) {
    integrateBody(p, dt, medium, world.time + i * dt);
    if (world.blocked && world.blocked(p)) break;
    pts.push(p.x, p.y);
    if (pts.length > maxLen * 2) break;
  }
  return pts;
}
