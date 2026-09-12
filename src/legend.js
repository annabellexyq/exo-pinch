// 图例介绍：星图中每一张 AI 生成的画面 ↔ 游戏身份的对照表

const ROWS = [
  ['exo-normal.png', '常态囊泡', 'EXO-NORMAL', '半透明软糖囊泡，表面布满四跨膜蛋白触须', '主角 · 常态漂浮'],
  ['exo-squeeze.png', '挤膜之形', 'EXO-SQUEEZE', '四瓣挤压形变，被活膜卡住的扁囊泡', '主角 · 渗透挤膜中'],
  ['exo-cargo.png', '载文囊泡', 'EXO-CARGO', '内部可见 DNA 双螺旋与蛋白颗粒', '主角 · 已携带密文'],
  ['exo-low.png', '枯竭之形', 'EXO-LOW', '失色开裂、裂纹中火星外泄', '主角 · 以太告急 / 被降解'],
  ['organelle-mito.png', '线粒巨物', 'MITO', '金色折叠嵴的线粒体，如山丘般隆起', '巨人国 · 弹射台'],
  ['organelle-er.png', '内质潴泡', 'ER', '金色层叠起伏的膜潴泡', '巨人国 · 内质网'],
  ['organelle-golgi.png', '高尔基叠', 'GOLGI', '层层叠压的扁囊结构', '巨人国 · 高尔基体'],
  ['organelle-vesicle.png', '溶酶囊泡', 'VESICLE', '内部小泡密布的绿色囊泡', '巨人国 · 溶酶体 / 囊泡'],
  ['organelle-nucleus.png', '双膜之核', 'NUCLEUS', '双层核膜、环状核孔与核内 DNA', '巨人国 · 核（第 8 关第二道门）'],
  ['pick-atp.png', '以太颗粒', 'ATP', '发光的三磷酸分子链', '拾取物 · 补充以太'],
  ['signal.png', '信号本体', 'SIGNAL', '光核 + 发夹环，缓缓起伏（共四色）', '拾取物 · 密文（信号本身）',
    [['miRNA', '#7ef0d0'], ['mRNA', '#9db8ff'], ['蛋白', '#ffb46b'], ['脂质', '#ff8fd0']]],
  ['enemy-macrophage.png', '游走巨噬体', 'MACROPHAGE', '伸出伪足缓慢巡游的阿米巴', '敌人 · 巡逻弹开、吞以太'],
  ['enemy-nk.png', '杀手细胞', 'NK-CELL', '带棱核的尖刺球体', '敌人 · 蓄力冲刺'],
  ['enemy-virus.png', '尖刺病毒', 'VIRUS', '密布尖刺的小球，更小更快', '敌人 · 锁定冲刺、夺密文'],
  ['enemy-bacterium.png', '胶囊杆菌', 'BACTERIUM', '链状相连的发光杆菌', '敌人 · 体表毒素云'],
  ['hazard-net.png', '诱捕之网', 'NET', '网状交错的胞外诱捕网', '危险物 · 粘滞减速'],
];

export function mountLegend(root) {
  const rows = ROWS.map(([file, name, code, look, use, swatches]) => {
    const dots = swatches
      ? `<span class="sw">${swatches.map(([n, c]) => `<i style="--c:${c}" title="${n}"></i>`).join('')}</span>`
      : '';
    const hint = swatches
      ? ` title="信号本体共四色：${swatches.map(([n]) => n).join(' / ')}（拾取时按颜色对应）"`
      : '';
    return `
    <tr${hint}>
      <td><img src="./assets/${file}" alt="${name}" loading="lazy" /></td>
      <td><b>${name}</b><small>${code}</small>${dots}</td>
      <td>${look}</td>
      <td class="use">${use}</td>
    </tr>`;
  }).join('');
  root.innerHTML = `
    <thead>
      <tr><th>图例</th><th>名称</th><th>画面内容</th><th>星图中的身份</th></tr>
    </thead>
    <tbody>${rows}</tbody>`;
}

const table = document.getElementById('legend-table');
if (table) {
  mountLegend(table);
  const panel = document.getElementById('legend');
  document.getElementById('btn-legend').onclick = () => panel.classList.toggle('hidden');
  document.getElementById('legend-close').onclick = () => panel.classList.add('hidden');
}
