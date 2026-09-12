// 入口：装配游戏、AI 大脑、HUD 与各类界面

import { Game } from './game/game.js?v=11';
import { Renderer } from './game/render.js?v=11';
import { CloudBrain } from './ai/brains.js';
import { LEVEL_BLUEPRINTS } from './ai/genome.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------ 进度与 AI ------------------------------ */

const KEY_UNLOCK = 'exo_pinch_unlocked';
const KEY_ENV = 'exo_pinch_env';
const progress = { unlocked: Math.max(1, Number(localStorage.getItem(KEY_UNLOCK) || 1)) };

let brain = null;

function setAIStatus(text, kind = 'ok') {
  $('ai-status').textContent = `AI 大脑：${text}`;
  const dot = $('ai-dot');
  dot.className = 'ai-dot' + (kind === 'ok' ? '' : kind === 'warn' ? ' warn' : ' off');
}

async function connectCloud(envId) {
  if (!envId) { setAIStatus('本地生成脑（未配置云环境）', 'off'); return; }
  const b = new CloudBrain({ env: envId, onStatus: (s) => setAIStatus(s, 'warn') });
  const ok = await b.init();
  if (ok) {
    brain = b;
    game.brain = b;
    game.director.cloud = b;
    localStorage.setItem(KEY_ENV, envId);
    setAIStatus(`云脑已连接 · ${b.modelId}`);
  } else {
    setAIStatus(`${b.reason || '云脑不可用'} · 已降级本地脑`, 'off');
  }
}

/* ------------------------------ 全程战绩 ------------------------------ */

const run = { t0: 0, levels: [] };
function resetRun() { run.t0 = performance.now(); run.levels = []; }
const levelScore = (s) => Math.round(s.energy * 10 + Math.max(0, s.timeLeft) * 4 + s.carried * 50);
function fmtTime(ms) {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${(sec < 10 ? '0' : '') + sec.toFixed(1)}`;
}

function showClear() {
  hideGuide(false);
  const spent = performance.now() - run.t0;
  const levels = run.levels.filter(Boolean);
  const avg = levels.length ? levels.reduce((a, s) => a + s.energy, 0) / levels.length : 0;
  const cargo = levels.reduce((a, s) => a + s.carried, 0);
  const total = levels.reduce((a, s) => a + levelScore(s), 0) + 1000;
  ['hud', 'controls', 'touch-btns', 'intro', 'result', 'menu']
    .forEach((id) => $(id).classList.add('hidden'));
  $('clear-sub').innerHTML = `通关时间 <b>${fmtTime(spent)}</b> · 九重门 · 密文已归其位`;
  $('clear-score').textContent = String(total);
  $('clear-stats').innerHTML = `<div>通关时间<b>${fmtTime(spent)}</b></div>
    <div>平均余以太<b>${Math.round(avg)}</b></div>
    <div>密文共计<b>${cargo}</b></div>`;
  $('clear-break').innerHTML = levels
    .map((s) => `<span>${s.level} 门 · 以太 ${Math.round(s.energy)} · ${levelScore(s)} 分</span>`)
    .join('');
  $('clear').classList.remove('hidden');
}

/* ------------------------------ 游戏实例 ------------------------------ */

const game = new Game(canvas, { brain, onEvent: handleEvent });
const renderer = new Renderer(ctx);
game.onFrame = (g) => {
  renderer.draw(g);
  updateHud(g);
};
game.start();

/* ------------------------------ 事件处理 ------------------------------ */

const KEY_TAUGHT = 'exo_pinch_taught';

/** 第一次玩：演示“弹弓式”拖拽怎么拽 */
function maybeShowGuide(index) {
  if (index !== 0 || localStorage.getItem(KEY_TAUGHT)) return;
  setTimeout(() => $('guide').classList.add('show'), 600);
}
function hideGuide(forever) {
  $('guide').classList.remove('show');
  if (forever) localStorage.setItem(KEY_TAUGHT, '1');
}

function handleEvent(type, data) {
  if (type === 'level') { showIntro(data.genome, data.index); hideGuide(false); }
  else if (type === 'play') maybeShowGuide(game.levelIndex);
  else if (type === 'launch') hideGuide(true);
  else if (type === 'msg') toast(data.text);
  else if (type === 'director') directorLine(data.text);
  else if (type === 'win') {
    run.levels[data.level - 1] = data;
    if (data.level >= LEVEL_BLUEPRINTS.length) {
      progress.unlocked = LEVEL_BLUEPRINTS.length;
      localStorage.setItem(KEY_UNLOCK, String(progress.unlocked));
      showClear();
    } else {
      showResult(true, data);
    }
  }
  else if (type === 'lose') showResult(false, data);
  else if (type === 'allclear') showClear();
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

let dirTimer = 0;
function directorLine(text) {
  const el = $('director');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(dirTimer);
  dirTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ------------------------------ 关卡过场 ------------------------------ */

function showIntro(g, index) {
  if (index === 0) resetRun();
  $('hud').classList.remove('hidden');
  $('controls').classList.remove('hidden');
  $('touch-btns').classList.remove('hidden');
  $('result').classList.add('hidden');
  $('menu').classList.add('hidden');
  $('in-stage').textContent = `第 ${index + 1} 重门 · ${index + 1}/${LEVEL_BLUEPRINTS.length}`;
  $('in-src').textContent = g.source === 'cloud-brain' ? '云脑开示' : '灵媒自生 · seed ' + game.seed;
  $('in-title').innerHTML = `${g.name} <em>${g.codename}</em>`;
  $('in-brief').textContent = g.brief;
  $('in-obj').textContent = `${g.objective}（时之窗 ${g.goals.timeLimit}s · 初始以太 ${g.goals.startEnergy}）`;
  $('in-hint').textContent = g.hint;
  $('in-tags').innerHTML = mechanicTags(g).map((t) => `<span>${t}</span>`).join('');
  $('intro').classList.remove('hidden');
  $('lv-num').textContent = String(index + 1);
  $('lv-name').textContent = g.name;
  $('lv-code').textContent = g.codename;
  $('obj').textContent = `集齐 ${g.goals.requiredCargo} 道密文 → 穿出目标之膜`;
}

function mechanicTags(g) {
  const m = g.mechanics;
  const tags = [`门之重 ${(g.difficulty * 100).toFixed(0)}%`];
  if (m.glycocalyx) tags.push('糖萼黏滞');
  if (m.receptorSequence) tags.push(`受体之序 ×${m.receptorSequence}`);
  if (m.queue) tags.push(`密文排队 ×${m.queue}`);
  if (m.atpDrought) tags.push('以太枯竭');
  if (m.hazards) tags.push(`巡游之厄 ×${m.hazards}`);
  if (m.doubleMembrane) tags.push('双膜之锁');
  if (m.chain) tags.push(`连环之门 ×${m.chain}`);
  if (m.urgent) tags.push('急递');
  if (m.organelleRich) tags.push('脏腑林立');
  if (m.immune >= 4) tags.push('病毒来袭');
  if (m.immune >= 5) tags.push('细菌滋生');
  return tags;
}

/* ------------------------------ HUD ------------------------------ */

function updateHud(g) {
  if (!g.genome || !g.exo) return;
  const exo = g.exo;
  const e = Math.max(0, exo.energy) / exo.maxEnergy;
  $('bar-energy').style.transform = `scaleX(${e})`;
  $('energy-txt').textContent = Math.round(Math.max(0, exo.energy));
  const need = g.genome.goals.requiredCargo;
  const got = Math.min(exo.carried.length, need);
  $('bar-cargo').style.transform = `scaleX(${need ? got / need : 0})`;
  $('cargo-txt').textContent = `${exo.carried.length} / ${need}`;
  const tl = Math.max(0, g.timeLeft);
  const timer = $('timer');
  timer.textContent = tl.toFixed(1);
  timer.classList.toggle('warn', tl < 15);
  const cont = g.world.containerOf(exo.x, exo.y);
  $('zone').textContent = cont ? (cont.kind === 'nucleus' ? '核域' : '胞内') : (g.pen ? '穿膜中' : '外域');
}

/* ------------------------------ 结算 ------------------------------ */

function showResult(win, data) {
  hideGuide(false);
  progress.unlocked = Math.max(progress.unlocked, Math.min(9, data.level + 1));
  localStorage.setItem(KEY_UNLOCK, String(progress.unlocked));
  renderLevelGrid();
  $('res-title').textContent = win ? '此门已开' : '密文散佚';
  $('res-sub').textContent = win
    ? `第 ${data.level} 重门已启 · 密文流向下一处`
    : `第 ${data.level} 重门 · ${data.reason || '此路不通'}`;
  $('res-stats').innerHTML = win
    ? `<div>余时<b>${data.timeLeft.toFixed(1)}s</b></div>
       <div>余下以太<b>${Math.round(data.energy)}</b></div>
       <div>密文<b>${data.carried}</b></div>`
    : `<div>门序<b>${data.level}</b></div><div>缘由<b style="font-size:15px">${data.reason || '—'}</b></div>`;
  $('res-next').classList.toggle('hidden', !win || data.level >= LEVEL_BLUEPRINTS.length);
  $('result').classList.remove('hidden');
}

/* ------------------------------ 菜单 ------------------------------ */

function renderLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVEL_BLUEPRINTS.forEach((bp, i) => {
    const b = document.createElement('button');
    const locked = i + 1 > progress.unlocked;
    b.className = locked ? 'locked' : i + 1 < progress.unlocked ? 'done' : '';
    b.innerHTML = `${i + 1}<small>${bp.name}</small>`;
    b.title = locked ? '未解锁' : bp.intent;
    if (!locked) b.onclick = () => game.loadLevel(i);
    grid.appendChild(b);
  });
}

function openMenu() {
  hideGuide(false);
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('controls').classList.add('hidden');
  $('touch-btns').classList.add('hidden');
  $('intro').classList.add('hidden');
  $('result').classList.add('hidden');
  renderLevelGrid();
}

/* ------------------------------ 绑定 ------------------------------ */

$('in-go').onclick = () => {
  $('intro').classList.add('hidden');
  game.beginPlay();
};
$('res-next').onclick = () => { $('result').classList.add('hidden'); game.nextLevel(); };
$('res-retry').onclick = () => { $('result').classList.add('hidden'); game.restart(); };
$('res-menu').onclick = () => { $('result').classList.add('hidden'); openMenu(); };
$('btn-play').onclick = () => game.loadLevel(Math.min(progress.unlocked - 1, LEVEL_BLUEPRINTS.length - 1));
$('btn-reroll').onclick = () => { game.baseSeed = (Math.random() * 1e9) | 0; toast('星盘已重掷'); };
$('btn-restart').onclick = () => game.restart();
$('btn-reroll2').onclick = () => { game.reroll(); toast('此门已由 AI 重铸'); };
$('env-btn').onclick = () => connectCloud($('env-input').value.trim());

renderLevelGrid();
const savedEnv = localStorage.getItem(KEY_ENV) || new URLSearchParams(location.search).get('env') || '';
if (savedEnv) {
  $('env-input').value = savedEnv;
  connectCloud(savedEnv);
} else {
  setAIStatus('本地生成脑（离线可用）', 'off');
}
function backToMenu() {
  game.state = 'menu';
  game.input.down = false;
  game.input.boost = false;
  openMenu();
}
window.__exoBackToMenu = backToMenu;          // 供 index.html 内联脚本兜底调用
window.addEventListener('exo:menu', backToMenu);
$('btn-menu').addEventListener('click', backToMenu);
$('clear-menu').onclick = () => { $('clear').classList.add('hidden'); openMenu(); };
$('clear-again').onclick = () => { $('clear').classList.add('hidden'); resetRun(); game.loadLevel(0); };
