// 数学 / 随机 / 噪声 工具集

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** mulberry32：可复现的 32 位种子随机数 */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + rng() * (max - min);
  rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  return rng;
}

/** 字符串 -> 稳定种子 */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 一维值噪声，用于细胞质流场起伏 */
export function makeNoise1D(rng) {
  const N = 256;
  const table = new Float32Array(N);
  for (let i = 0; i < N; i++) table[i] = rng() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[((i % N) + N) % N];
    const b = table[(((i + 1) % N) + N) % N];
    return lerp(a, b, smoothstep(f));
  };
}

/** 角度归一化到 [0, TAU) */
export function wrapAngle(a) {
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
}
