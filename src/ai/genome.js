// 关卡基因组（LevelGenome）：AI 生成的关卡“DNA”
// 九关不是手写常量，而是由 AI 大脑按蓝图 + 种子实时生成出这份 JSON，再交给世界构建器。

import { clamp } from '../core/rng.js';

/** 九关设计蓝图：给 AI 的“设计意图 / 约束”，不是最终数据 */
/* 九重门的视觉主题：每关换一套“微环境”配色 */
const T = (label, bg, cyto, head, thin, exit, receptor, fog, particle) =>
  ({ label, bg, cyto, head, thin, exit, receptor, fog, particle });

export const LEVEL_BLUEPRINTS = [
  {
    index: 1, name: '离巢', codename: 'BUDDING',
    intent: '第一次弹射。外泌体从母体膜上脱落，在开阔组织液里收集 miRNA，找到膜上最软的一处钻进去。',
    mechanics: {}, difficulty: 0.0,
    theme: T('组织液',
      ['#07060f', '#100c22', '#151026'],
      ['rgba(50,44,110,0.5)', 'rgba(34,26,80,0.45)', 'rgba(24,18,60,0.35)'],
      '#b9a6ff', '#7ef0d0', '#8dffab', '#ffce8a', 'rgba(120,90,200,0.45)', '150,200,255'),
  },
  {
    index: 2, name: '糖萼', codename: 'GLYCOCALYX',
    intent: '膜外裹着厚厚的糖萼绒毛，会把高速冲来的囊泡弹开。必须轻推慢蹭，找到绒毛稀疏的缺口。',
    mechanics: { glycocalyx: 1 }, difficulty: 0.14,
    theme: T('糖萼丛',
      ['#0e0514', '#1b091e', '#250c22'],
      ['rgba(96,32,86,0.5)', 'rgba(70,22,64,0.45)', 'rgba(48,14,46,0.35)'],
      '#ff9fd8', '#ffd0f0', '#b6ffc8', '#ffce8a', 'rgba(210,80,150,0.42)', '255,170,220'),
  },
  {
    index: 3, name: '受体之门', codename: 'RECEPTOR-GATE',
    intent: '膜上分布着受体，只有按亮起的顺序从对应受体进入，膜才会内陷包裹你。',
    mechanics: { receptorSequence: 2 }, difficulty: 0.26,
    theme: T('门厅',
      ['#0f0a07', '#1c1309', '#25170c'],
      ['rgba(104,72,34,0.5)', 'rgba(78,52,26,0.45)', 'rgba(52,34,18,0.35)'],
      '#e8c07a', '#ffe6a8', '#c8ffb0', '#ffb060', 'rgba(225,155,70,0.4)', '255,215,150'),
  },
  {
    index: 4, name: '巨人之胃', codename: "GIANT'S-LAIR",
    intent: '进入细胞后才发现自己到了巨人国：线粒体像山一样。第一只巡逻的巨噬细胞也在此现身。',
    mechanics: { organelleRich: 1, urgent: 1, immune: 1 }, difficulty: 0.38,
    theme: T('肝细胞',
      ['#130806', '#200d0a', '#2a110c'],
      ['rgba(114,46,34,0.5)', 'rgba(84,32,24,0.45)', 'rgba(56,20,16,0.35)'],
      '#ff9a6b', '#ffd0a0', '#b6ff9a', '#ffb060', 'rgba(230,110,60,0.42)', '255,180,130'),
  },
  {
    index: 5, name: '信息排队', codename: 'CARGO-QUEUE',
    intent: '高尔基体的分拣站。密文必须按 1-2-3 排队装载，顺序错了整批作废。',
    mechanics: { queue: 3, receptorSequence: 1, immune: 1 }, difficulty: 0.5,
    theme: T('分拣站',
      ['#0a1008', '#121d10', '#172514'],
      ['rgba(84,92,40,0.5)', 'rgba(62,68,28,0.45)', 'rgba(40,44,18,0.35)'],
      '#dfe08a', '#b6ff9a', '#8dffc8', '#ffce8a', 'rgba(175,195,70,0.35)', '220,240,150'),
  },
  {
    index: 6, name: '能量枯竭', codename: 'ATP-DROUGHT',
    intent: '缺血灶。以太几乎耗尽，每一次弹射都在烧命；巨噬细胞会抢走你路过的 ATP。',
    mechanics: { atpDrought: 1, queue: 2, immune: 1 }, difficulty: 0.62,
    theme: T('缺血灶',
      ['#0a0708', '#140d10', '#1a1214'],
      ['rgba(78,52,60,0.5)', 'rgba(56,36,44,0.45)', 'rgba(38,24,30,0.35)'],
      '#c98f9a', '#e8b9b0', '#a8e0c0', '#ffb08a', 'rgba(150,80,90,0.3)', '200,170,180'),
  },
  {
    index: 7, name: '核周风暴', codename: 'PERINUCLEAR-STORM',
    intent: '炎症灶。细胞质在咆哮，动力蛋白的旋臂横扫，NK 细胞锁定你并冲刺。密文必须紧急送达。',
    mechanics: { hazards: 2, urgent: 1, queue: 2, immune: 2 }, difficulty: 0.74,
    theme: T('炎症灶',
      ['#12060a', '#200a10', '#2a0c14'],
      ['rgba(122,30,48,0.55)', 'rgba(90,20,34,0.48)', 'rgba(60,12,22,0.38)'],
      '#ff7a86', '#ffb0a0', '#ffd0a0', '#ff9a5a', 'rgba(230,60,80,0.5)', '255,140,150'),
  },
  {
    index: 8, name: '双膜迷宫', codename: 'DOUBLE-MEMBRANE',
    intent: '核域。核膜是第二道门：进核、装载、出核、再出细胞，两次渗透。',
    mechanics: { doubleMembrane: 1, queue: 3, receptorSequence: 2, immune: 4 }, difficulty: 0.86,
    theme: T('核域',
      ['#06061a', '#0b0b26', '#101033'],
      ['rgba(44,48,120,0.55)', 'rgba(30,32,86,0.48)', 'rgba(20,20,58,0.38)'],
      '#8fa0ff', '#a8ffe8', '#8dffab', '#ffce8a', 'rgba(90,110,255,0.42)', '170,190,255'),
  },
  {
    index: 9, name: '分泌终章', codename: 'SECRETION-FINALE',
    intent: '免疫突触。巨噬、NK、中性粒细胞胞外诱捕网全员出动，穿过连环之门把密文送到靶细胞。',
    mechanics: { chain: 2, doubleMembrane: true, queue: 3, hazards: 2, receptorSequence: 2, atpDrought: 1, immune: 5 }, difficulty: 1.0,
    theme: T('免疫突触',
      ['#04120f', '#08201c', '#0b2a24'],
      ['rgba(30,96,86,0.5)', 'rgba(20,70,62,0.45)', 'rgba(12,46,40,0.35)'],
      '#7ef0d0', '#d8ffe8', '#ffe9a8', '#ffce8a', 'rgba(80,220,190,0.42)', '150,255,230'),
  },
];

/** 交付给云端大模型的结构说明（保证输出可被校验） */
export const GENOME_SCHEMA_HINT = `返回一个严格 JSON 对象（不要 markdown 代码块），字段：
{
 "name": string(2-6字), "codename": string, "brief": string(一句氛围描述),
 "objective": string(一句目标), "hint": string(一句操作提示),
 "physics": {"viscosityOutside":0.2-1.2,"viscosityInside":0.6-3.0,"restitution":0.5-0.95,
             "launchMax":420-900,"turbulence":0-90,"gravity":0-40},
 "scale": {"exoRadius":10-18,"cellRadius":700-1500,"worldRadius":2200-3200},
 "goals": {"requiredCargo":2-6,"timeLimit":40-150,"startEnergy":60-100,"energyDrain":0.6-4.0,"exitCell":"last"|"first"},
 "membrane": {"hardness":0.3-1.0,"thinRatio":0.08-0.35,"softSpeed":40-120,"maxEntrySpeed":260-520},
 "counts": {"cargo":3-8,"atp":2-10,"organelles":2-7,"hazards":0-3,"stations":0-4}
}
所有数值必须是数字，不得为字符串。`;

const num = (v, def, lo, hi) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return clamp(n, lo, hi);
};

/** 校验并归一化任意来源（LLM / 本地脑）的基因组，保证运行时永不炸 */
export function validateGenome(raw, blueprint) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const bp = blueprint;
  const m = g.mechanics && typeof g.mechanics === 'object' ? g.mechanics : bp.mechanics || {};
  const ph = g.physics || {};
  const sc = g.scale || {};
  const go = g.goals || {};
  const mb = g.membrane || {};
  const co = g.counts || {};

  const out = {
    index: bp.index,
    blueprint: bp,
    name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 12) : bp.name,
    codename: typeof g.codename === 'string' && g.codename.trim() ? g.codename.trim().slice(0, 24) : bp.codename,
    brief: typeof g.brief === 'string' && g.brief.trim() ? g.brief.slice(0, 200) : bp.intent,
    objective: typeof g.objective === 'string' && g.objective.trim() ? g.objective.slice(0, 160) : '携带全部信息包，穿出目标细胞膜',
    hint: typeof g.hint === 'string' && g.hint.trim() ? g.hint.slice(0, 120) : '拖拽蓄力 → 松手弹射；撞膜时速度要够慢才渗得进去',
    difficulty: bp.difficulty,
    mechanics: {
      glycocalyx: !!m.glycocalyx,
      receptorSequence: Math.round(num(m.receptorSequence, 0, 0, 4)),
      queue: Math.round(num(m.queue, 0, 0, 5)),
      atpDrought: !!m.atpDrought,
      urgent: !!m.urgent,
      organelleRich: !!m.organelleRich,
      doubleMembrane: !!m.doubleMembrane,
      chain: Math.round(num(m.chain, 0, 0, 3)),
      hazards: Math.round(num(m.hazards, 0, 0, 3)),
      immune: Math.round(num(m.immune, 0, 0, 5)),   // 免疫/病原等级：1 巨噬 / 2 +NK / 3 +诱捕网 / 4 +病毒 / 5 +细菌
    },
    theme: bp.theme,
    physics: {
      viscosityOutside: num(ph.viscosityOutside, 0.55, 0.05, 2),
      viscosityInside: num(ph.viscosityInside, 1.35, 0.2, 4),
      restitution: num(ph.restitution, 0.78, 0.4, 0.96),
      launchMax: num(ph.launchMax, 640, 300, 1100),
      turbulence: num(ph.turbulence, 14, 0, 120),
      gravity: num(ph.gravity, 0, 0, 60),
      turbFreq: num(ph.turbFreq, 0.0018, 0.0002, 0.01),
    },
    scale: {
      exoRadius: num(sc.exoRadius, 14, 8, 22),
      cellRadius: num(sc.cellRadius, 1150, 600, 1700),
      worldRadius: num(sc.worldRadius, 2700, 1800, 3600),
    },
    goals: {
      requiredCargo: Math.round(num(go.requiredCargo, 3, 1, 8)),
      timeLimit: num(go.timeLimit, 95, 35, 240),
      startEnergy: num(go.startEnergy, 100, 30, 100),
      energyDrain: num(go.energyDrain, 1.5, 0.2, 6),
      exitCell: go.exitCell === 'first' ? 'first' : 'last',
    },
    membrane: {
      hardness: num(mb.hardness, 0.62, 0.15, 1),
      thinRatio: num(mb.thinRatio, 0.22, 0.05, 0.45),
      softSpeed: num(mb.softSpeed, 96, 20, 220),
      maxEntrySpeed: num(mb.maxEntrySpeed, 380, 180, 700),
    },
    counts: {
      cargo: Math.round(num(co.cargo, 5, 1, 12)),
      atp: Math.round(num(co.atp, 6, 0, 16)),
      organelles: Math.round(num(co.organelles, 4, 0, 9)),
      hazards: Math.round(num(co.hazards, 0, 0, 4)),
      stations: Math.round(num(co.stations, 0, 0, 5)),
    },
    source: g.source || 'local',
  };

  // 蓝图机制与生成值的强制对齐（机制是关卡灵魂，不允许 AI 削弱）
  const M = out.mechanics;
  if (bp.mechanics.queue) M.queue = Math.max(M.queue, bp.mechanics.queue);
  if (bp.mechanics.receptorSequence) M.receptorSequence = Math.max(M.receptorSequence, bp.mechanics.receptorSequence);
  if (bp.mechanics.hazards) M.hazards = Math.max(M.hazards, bp.mechanics.hazards);
  if (bp.mechanics.immune) M.immune = Math.max(M.immune, bp.mechanics.immune);
  if (M.immune > 0) out.counts.hazards = Math.max(out.counts.hazards, M.immune);
  if (bp.mechanics.doubleMembrane) M.doubleMembrane = true;
  if (bp.mechanics.chain) M.chain = Math.max(M.chain, bp.mechanics.chain);
  if (M.queue > 0) out.counts.stations = Math.max(out.counts.stations, M.queue);
  if (M.hazards > 0) out.counts.hazards = Math.max(out.counts.hazards, M.hazards);
  if (out.mechanics.atpDrought) {
    out.counts.atp = Math.min(out.counts.atp, 4);
    out.goals.energyDrain = Math.max(out.goals.energyDrain, 2.4);
  }
  if (out.mechanics.urgent) out.goals.timeLimit = Math.min(out.goals.timeLimit, 100);
  // 多细胞接力关：目标数量收敛、时限放宽，否则链条太长
  if (out.mechanics.chain > 1) {
    out.goals.requiredCargo = Math.min(out.goals.requiredCargo, 4);
    out.goals.timeLimit = Math.min(200, out.goals.timeLimit + 28);
  }
  if (out.mechanics.organelleRich) out.counts.organelles = Math.max(out.counts.organelles, 5);

  return out;
}
