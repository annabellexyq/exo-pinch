// AI 大脑层：本地生成脑（离线可用） + CloudBase 云脑（可选，自动降级） + AI 导演

import { makeRng, hashSeed, lerp, clamp } from '../core/rng.js';
import { LEVEL_BLUEPRINTS, GENOME_SCHEMA_HINT, validateGenome } from './genome.js';

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const BRIEF_WORDS = [
  '外域之液在缓慢地呼吸',
  '远处的胶原之柱已然倾塌',
  '膜面微微起伏，如一块活着的糖膏',
  '糖链在水中摇曳，似深海之藻',
  '巨者之影自核的方向压来',
  '此处万物，皆大于汝百倍',
  '时间里浸着黏稠的琥珀',
  '信号的余香正在散去',
];

const HINTS = {
  glycocalyx: ['糖萼吞汝之势——轻推，切勿强撞', '绒毛密处不可入，寻其稀疏之缺'],
  receptorSequence: ['依亮起之序而入，错序者必被弹出', '受体在闪，随其闪烁之序而行'],
  queue: ['密文台须依 1→2→3 之序而立', '排队！插队者，整批密文作废'],
  atpDrought: ['以太将尽，每一次弹射皆在燃命', '省着些：弹射与穿膜皆须耗以太'],
  urgent: ['时之窗甚短，勿停', '密文正在降解，速行'],
  hazards: ['旋转之臂会将汝抽飞，掐其间隙而过', '待臂扫过，再动'],
  doubleMembrane: ['核膜乃第二重门，入之，复出之', '两层膜，两次穿渡'],
  chain: ['接力诸门，一刻莫停', '穿过去，再穿过去'],
  base: ['引弓蓄力 → 松手弹射；撞膜须缓，方得渗入', '缓行者，乃得入膜'],
};

/** 本地生成脑：按蓝图 + 种子 + 玩家画像，生成一份关卡基因组 */
export function generateLocalGenome(blueprint, seed, profile = {}) {
  const s = hashSeed(`${blueprint.codename}:${seed}`);
  const rng = makeRng(s);
  const d = clamp(blueprint.difficulty + (profile.adjust || 0), 0, 1.2);
  const M = blueprint.mechanics || {};

  const mechanics = { ...M };
  if (M.receptorSequence) mechanics.receptorSequence = clamp(M.receptorSequence + (d > 0.7 && rng.chance(0.5) ? 1 : 0), 1, 4);
  if (M.queue) mechanics.queue = clamp(M.queue + (d > 0.75 && rng.chance(0.4) ? 1 : 0), 1, 5);
  if (M.hazards) mechanics.hazards = clamp(M.hazards + (d > 0.8 ? 1 : 0), 1, 4);

  const physics = {
    viscosityOutside: lerp(0.44, 0.66, rng()) + d * 0.08,
    viscosityInside: lerp(0.95, 1.6, rng()) + d * 0.25,
    restitution: clamp(lerp(0.8, 0.9, rng()) - d * 0.06, 0.5, 0.95),
    launchMax: lerp(560, 760, rng()) + d * 90,
    turbulence: lerp(6, 30, rng()) + d * 55 + (mechanics.hazards ? 18 : 0),
    gravity: rng.chance(0.35) ? lerp(4, 26, rng()) : 0,
    turbFreq: lerp(0.0012, 0.003, rng()),
  };

  const scale = {
    exoRadius: clamp(lerp(13, 16, rng()) - d * 1.5, 9, 18),
    cellRadius: lerp(950, 1420, rng()) - d * 60,
    worldRadius: lerp(2450, 3050, rng()),
  };

  const goals = {
    requiredCargo: Math.round(clamp(2 + d * 2.6 + rng.range(-0.4, 0.6), 2, 6)),
    timeLimit: Math.round(clamp(lerp(120, 72, d) + rng.range(-8, 10), 45, 200)),
    startEnergy: Math.round(clamp(lerp(100, 86, d), 65, 100)),
    energyDrain: clamp(lerp(1.0, 2.6, d) + rng.range(-0.2, 0.4), 0.5, 4),
    exitCell: rng.chance(0.7) ? 'last' : 'first',
  };

  const membrane = {
    hardness: clamp(lerp(0.45, 0.8, d), 0.2, 0.95),
    thinRatio: clamp(lerp(0.42, 0.26, d) + rng.range(-0.03, 0.05), 0.1, 0.45),
    softSpeed: clamp(lerp(155, 92, d), 45, 220),
    maxEntrySpeed: clamp(lerp(560, 400, d), 220, 700),
  };

  const counts = {
    cargo: Math.round(clamp(goals.requiredCargo + 1 + rng.range(0, 2.4), 2, 10)),
    atp: Math.round(clamp(lerp(10, 7, d) + rng.range(-1, 2), mechanics.atpDrought ? 3 : 5, 16)),
    organelles: Math.round(clamp(lerp(3, 6, rng()) + (mechanics.organelleRich ? 2 : 0), 1, 9)),
    hazards: mechanics.hazards ? Math.round(clamp(mechanics.hazards, 1, 4)) : 0,
    stations: mechanics.queue ? mechanics.queue : 0,
  };

  const hintPool = [];
  for (const k of Object.keys(mechanics)) if (HINTS[k] && mechanics[k]) hintPool.push(pick(rng, HINTS[k]));
  if (!hintPool.length) hintPool.push(pick(rng, HINTS.base));

  const raw = {
    name: blueprint.name,
    codename: blueprint.codename,
    brief: `${pick(rng, BRIEF_WORDS)}。${blueprint.intent}`,
    objective: `集齐 ${goals.requiredCargo} 道密文，穿出目标之膜`,
    hint: hintPool[0],
    mechanics,
    physics,
    scale,
    goals,
    membrane,
    counts,
    source: 'local-brain',
  };
  return validateGenome(raw, blueprint);
}

/* ------------------------------------------------------------------ */
/*  云脑：CloudBase AI（可选）。未配置 env / 未登录 / 调用失败 -> 返回 null，由调用方降级 */
/* ------------------------------------------------------------------ */

const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@3/dist/cloudbase.full.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('非浏览器环境'));
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('无法加载 CloudBase SDK，请检查网络或刷新重试'));
    document.head.appendChild(s);
  });
}

export class CloudBrain {
  constructor(opts = {}) {
    this.env = opts.env || '';
    this.accessKey = opts.accessKey || '';
    this.region = opts.region || 'ap-shanghai';
    this.modelId = opts.modelId || 'deepseek-v4-flash';
    this.group = 'cloudbase';
    this.app = null;
    this.ready = false;
    this.reason = this.env ? '' : '未配置 CloudBase 环境 ID';
    this.onStatus = opts.onStatus || (() => {});
  }

  async init() {
    if (!this.env) { this.reason = '未配置 CloudBase 环境 ID'; return false; }
    if (!this.accessKey) { this.reason = '缺少 publishable accessKey（环境 API Key）'; return false; }
    try {
      this.onStatus('正在连接 CloudBase…');
      let cloudbase = typeof window !== 'undefined' ? (window.cloudbase || window.cloudbase?.default) : null;
      if (!cloudbase) {
        await loadScript(SDK_CDN);
        cloudbase = window.cloudbase || window.cloudbase?.default;
      }
      if (!cloudbase) throw new Error('CloudBase SDK 加载失败');
      this.app = cloudbase.init({
        env: this.env,
        region: this.region,
        accessKey: this.accessKey,
        auth: { detectSessionInUrl: true },
      });
      const { data, error } = await this.app.auth.getSession();
      if (error) throw new Error(error.message || '获取登录态失败');
      const session = data && data.session;
      if (!session) {
        this.reason = '尚未登录：云脑需要真实用户登录';
        this.onStatus(this.reason);
        return false;
      }
      if (session.user?.is_anonymous) {
        this.reason = 'AI 能力需要真实登录（匿名用户无权调用模型）';
        this.onStatus(this.reason);
        return false;
      }
      this.ready = true;
      this.onStatus('云脑已就绪');
      return true;
    } catch (e) {
      this.reason = `云脑不可用：${e?.message || e}`;
      this.onStatus(this.reason);
      return false;
    }
  }

  async generateLevel(blueprint, seed, profile = {}) {
    if (!this.ready) return null;
    const sys = `你是细胞生物学游戏关卡设计师。只输出 JSON。
${GENOME_SCHEMA_HINT}
关卡：第${blueprint.index}关 ${blueprint.name}（${blueprint.codename}）
设计意图：${blueprint.intent}
机制开关：${JSON.stringify(blueprint.mechanics)}
难度：${blueprint.difficulty}（玩家自适应偏移 ${profile.adjust || 0}）
种子：${seed}
输出语言：简体中文。`;
    try {
      const model = this.app.ai().createModel(this.group);
      const res = await model.generateText({
        model: this.modelId,
        temperature: 0.9,
        messages: [{ role: 'user', content: sys }],
      });
      const text = (res?.text || '').replace(/```json?/gi, '').replace(/```/g, '').trim();
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      json.source = 'cloud-brain';
      return validateGenome(json, blueprint);
    } catch (e) {
      this.reason = `AI 生成失败，已降级本地脑：${e?.message || e}`;
      this.onStatus(this.reason);
      return null;
    }
  }

  async directorLine(event, ctx) {
    if (!this.ready) return null;
    try {
      const model = this.app.ai().createModel(this.group);
      const res = await model.generateText({
        model: this.modelId,
        temperature: 1,
        messages: [{
          role: 'user',
          content: `你是外泌体闯关游戏的 AI 导演。玩家事件：${event}。
上下文：${JSON.stringify(ctx)}。
用一句不超过 18 字的中文，给出即时提示或吐槽。只输出这一句，不要引号。`,
        }],
      });
      const t = (res?.text || '').trim().replace(/^["'“]|["'”]$/g, '');
      return t ? t.slice(0, 40) : null;
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  AI 导演：本地规则生成 + 可选云端润色                                */
/* ------------------------------------------------------------------ */

const DIRECTOR_LINES = {
  launchWeak: ['太轻了，如于糖水中呵欠', '这点劲道，推汝不动'],
  tooFast: ['太急！膜将汝弹回', '撞得过猛——缓行再入'],
  penetrated: ['渗入矣，膜已在身后合拢', '欢迎来到巨人之国'],
  wrongOrder: ['乱了序，此批密文作废', '排队！重来'],
  lowEnergy: ['以太将枯，速寻发光之粒', '以太不足，省着些弹'],
  timeLow: ['时之窗将闭', '密文开始降解'],
  cargoGot: ['密文已录', '又一卷入囊'],
  queueDone: ['装载已毕，去寻出口之膜', '排队已成，启程'],
  exit: ['出来了！下一重门', '穿膜功成'],
  dead: ['密文降解，此番传递落空', '囊泡归于尘土'],
};

export class Director {
  constructor(rng, cloud = null) {
    this.rng = rng;
    this.cloud = cloud;
    this.lastLine = '';
    this.lastAt = -99;
  }

  /** 返回一句提示；同类事件 1.6s 内不重复刷屏 */
  say(event, ctx = {}, now = 0) {
    if (now - this.lastAt < 1.6) return null;
    const pool = DIRECTOR_LINES[event];
    if (!pool) return null;
    const line = pick(this.rng, pool);
    this.lastLine = line;
    this.lastAt = now;
    if (this.cloud) {
      this.cloud.directorLine(event, ctx).then((t) => {
        if (t) { this.lastLine = t; if (this.onRemote) this.onRemote(t); }
      }).catch(() => {});
    }
    return line;
  }
}

/** 统一入口：优先云脑，降级本地脑 */
export async function generateLevel(brain, blueprint, seed, profile) {
  if (brain) {
    const g = await brain.generateLevel(blueprint, seed, profile);
    if (g) return g;
  }
  return generateLocalGenome(blueprint, seed, profile);
}

export { LEVEL_BLUEPRINTS };
