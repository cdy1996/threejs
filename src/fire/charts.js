// 智慧消防大屏 - SVG 图表与 UI 数据填充
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/* ---------- 环形图 ---------- */
function renderDonut(containerId, segments, opts = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const size = box.clientWidth || 118;
  const stroke = opts.stroke || 10;
  const r = (size - stroke) / 2 - 2;
  const c = size / 2;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const svg = el('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  // 底环
  svg.appendChild(el('circle', {
    cx: c, cy: c, r, fill: 'none',
    stroke: 'rgba(46,201,255,.12)', 'stroke-width': stroke
  }));
  let angle = -90;
  for (const seg of segments) {
    const span = (seg.value / total) * 360;
    const gap = 2; // 段间间隙
    const a0 = (angle + gap / 2) * Math.PI / 180;
    const a1 = (angle + span - gap / 2) * Math.PI / 180;
    const large = span > 180 ? 1 : 0;
    const path = el('path', {
      d: `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`,
      fill: 'none', stroke: seg.color, 'stroke-width': stroke, 'stroke-linecap': 'butt',
      style: `filter:drop-shadow(0 0 4px ${seg.color})`
    });
    svg.appendChild(path);
    angle += span;
  }
  box.insertBefore(svg, box.firstChild);
}

/* ---------- 折线图 ---------- */
function renderLine(containerId, data, opts = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const w = box.clientWidth || 360, h = opts.height || 74;
  const pad = { l: 26, r: 8, t: 8, b: 16 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...data) * 1.2;
  const px = i => pad.l + (i / (data.length - 1)) * iw;
  const py = v => pad.t + ih - (v / max) * ih;
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` });

  // 网格 + y 轴刻度
  for (let g = 0; g <= 3; g++) {
    const y = pad.t + (g / 3) * ih;
    svg.appendChild(el('line', { x1: pad.l, y1: y, x2: w - pad.r, y2: y, stroke: 'rgba(46,201,255,.12)', 'stroke-dasharray': '3 4' }));
    const t = el('text', { x: pad.l - 4, y: y + 3, 'text-anchor': 'end', 'font-size': 8, fill: '#7fa8d8' });
    t.textContent = (max * (1 - g / 3)).toFixed(1);
    svg.appendChild(t);
  }
  // x 轴时间
  const labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];
  labels.forEach((s, i) => {
    const t = el('text', { x: pad.l + (i / 6) * iw, y: h - 4, 'text-anchor': 'middle', 'font-size': 8, fill: '#7fa8d8' });
    t.textContent = s;
    svg.appendChild(t);
  });

  const pts = data.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  // 面积渐变
  const gradId = containerId + '-g';
  const defs = el('defs');
  const lg = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.appendChild(el('stop', { offset: '0%', 'stop-color': 'rgba(46,201,255,.35)' }));
  lg.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(46,201,255,0)' }));
  defs.appendChild(lg);
  svg.appendChild(defs);
  svg.appendChild(el('polygon', {
    points: `${pad.l},${pad.t + ih} ${pts} ${w - pad.r},${pad.t + ih}`,
    fill: `url(#${gradId})`
  }));
  svg.appendChild(el('polyline', {
    points: pts, fill: 'none', stroke: '#2ec9ff', 'stroke-width': 1.5,
    style: 'filter:drop-shadow(0 0 4px rgba(46,201,255,.8))'
  }));
  // 端点
  const lastI = data.length - 1;
  svg.appendChild(el('circle', { cx: px(lastI), cy: py(data[lastI]), r: 2.5, fill: '#fff', stroke: '#2ec9ff', 'stroke-width': 1.5 }));
  box.appendChild(svg);
}

/* ---------- 柱状图（近7日警情） ---------- */
function renderBar(containerId, data, opts = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const w = box.clientWidth || 360, h = opts.height || 76;
  const pad = { l: 20, r: 8, t: 10, b: 16 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.value)) * 1.25;
  const bw = iw / data.length * 0.42;
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  for (let g = 0; g <= 2; g++) {
    const y = pad.t + (g / 2) * ih;
    svg.appendChild(el('line', { x1: pad.l, y1: y, x2: w - pad.r, y2: y, stroke: 'rgba(46,201,255,.12)', 'stroke-dasharray': '3 4' }));
  }
  data.forEach((d, i) => {
    const cx = pad.l + ((i + 0.5) / data.length) * iw;
    const bh = (d.value / max) * ih;
    const color = d.hot ? '#ff4d5e' : '#2ec9ff';
    svg.appendChild(el('rect', {
      x: cx - bw / 2, y: pad.t + ih - bh, width: bw, height: bh, fill: color, opacity: d.hot ? .9 : .55,
      style: `filter:drop-shadow(0 0 4px ${color})`
    }));
    const tv = el('text', { x: cx, y: pad.t + ih - bh - 3, 'text-anchor': 'middle', 'font-size': 8, fill: d.hot ? '#ff8a94' : '#9fd8ff' });
    tv.textContent = d.value;
    svg.appendChild(tv);
    const tl = el('text', { x: cx, y: h - 4, 'text-anchor': 'middle', 'font-size': 8, fill: '#7fa8d8' });
    tl.textContent = d.label;
    svg.appendChild(tl);
  });
  box.appendChild(svg);
}

/* ---------- 图标工厂 ---------- */
const icon = p => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><g stroke="#2ec9ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${p}</g></svg>`;
const ICONS = {
  alarm: icon('<path d="M12 4a6 6 0 0 1 6 6v4l1.5 3h-15L6 14v-4a6 6 0 0 1 6-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  spray: icon('<path d="M8 3h8v4H8zM12 7v4"/><path d="M7 14c0 4 2 7 5 7s5-3 5-7"/><path d="M9 11h6"/>'),
  smoke: icon('<path d="M4 15h13a3 3 0 1 0-3-3"/><path d="M3 18h9M7 21h8"/><path d="M6 12h8a2.5 2.5 0 1 0-2.5-2.5"/>'),
  broadcast: icon('<path d="M4 10v4h3l6 4V6l-6 4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  elevator: icon('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M8.5 8l2-2 2 2"/>'),
  light: icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.7.5-1 1.3-1 2.1h-5c0-.8-.3-1.6-1-2.1A6 6 0 0 1 12 3z"/>'),
  power: icon('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>'),
  door: icon('<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="14.5" cy="12" r="1" fill="#2ec9ff"/>'),
  camera: icon('<circle cx="12" cy="12" r="3.2"/><path d="M4 8h3l2-3h6l2 3h3v11H4V8z"/>'),
  hydrant: icon('<path d="M9 21v-8a3 3 0 0 1 6 0v8M7 21h10M12 10V7M9 7h6M10 4h4"/><path d="M6 14h3M15 14h3"/>'),
  pump: icon('<circle cx="12" cy="12" r="4"/><path d="M12 8V4M12 20v-4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="8"/>'),
  valve: icon('<circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>'),
  exit: icon('<path d="M10 4h8v16h-8M13 12H3m4-4-4 4 4 4"/>'),
  home: icon('<path d="M3 11 12 4l9 7M5 10v10h14V10"/>'),
  monitor: icon('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M9 20h6M12 16v4"/><path d="M7 12l2.5-3 2 2L15 8"/>'),
  device: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM12 1v3M12 20v3M1 12h3M20 12h3"/>'),
 巡检: icon('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>'),
  plan: icon('<path d="M6 3h9l4 4v14H6V3z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>'),
  command: icon('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2M12 2v2M12 20v2M2 12h2M20 12h2"/>'),
  analysis: icon('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  setting: icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>')
};

/* ---------- 填充：设备运行状态 ---------- */
function renderDevices() {
  const row = document.getElementById('dev-row');
  if (!row) return;
  const devs = [
    { icon: ICONS.camera, name: '视频监控', n: '328', total: '/352' },
    { icon: ICONS.alarm, name: '烟感探测', n: '198', total: '/210' },
    { icon: ICONS.hydrant, name: '消防栓', n: '285', total: '/300' },
    { icon: ICONS.spray, name: '喷淋系统', n: '158', total: '/160' },
    { icon: ICONS.pump, name: '消防水泵', n: '120', total: '/121' }
  ];
  row.innerHTML = devs.map(d => `
    <div class="dev-cell">
      <div class="ico">${d.icon}</div>
      <div class="name">${d.name}</div>
      <div class="n">${d.n}<i>${d.total}</i></div>
    </div>`).join('');
}

/* ---------- 填充：系统联动状态 ---------- */
function renderLinkage() {
  const grid = document.getElementById('link-grid');
  if (!grid) return;
  const items = [
    { icon: ICONS.alarm, name: '火灾自动报警', st: '已启动', cls: 'run' },
    { icon: ICONS.spray, name: '自动喷水灭火', st: '进行中', cls: 'run' },
    { icon: ICONS.smoke, name: '防排烟系统', st: '进行中', cls: 'run' },
    { icon: ICONS.broadcast, name: '应急广播', st: '正常', cls: 'ok' },
    { icon: ICONS.elevator, name: '消防电梯', st: '正常', cls: 'ok' },
    { icon: ICONS.light, name: '应急照明', st: '正常', cls: 'ok' },
    { icon: ICONS.power, name: '电梯迫降', st: '正常', cls: 'ok' },
    { icon: ICONS.door, name: '防火分隔门', st: '待命', cls: 'warn' }
  ];
  grid.innerHTML = items.map(d => `
    <div class="link-cell">
      <div class="ico">${d.icon}</div>
      <div class="name">${d.name}</div>
      <div class="st ${d.cls}">${d.st}</div>
    </div>`).join('');
}

/* ---------- 填充：历史报警记录 ---------- */
function renderAlarms() {
  const tbody = document.getElementById('alarm-tbody');
  if (!tbody) return;
  const rows = [
    ['15:24:32', '16F', '1612 办公室', '感烟报警', 'doing', '处理中'],
    ['15:10:15', '8F', '805 机房', '温感报警', 'done', '已处理'],
    ['14:55:22', '3F', '301 仓库', '手动报警', 'done', '已处理'],
    ['14:32:18', '15F', '1505 办公室', '故障报警', 'done', '已处理'],
    ['13:48:09', 'B1', '配电室', '水压异常', 'done', '已处理'],
    ['11:20:44', '22F', '2208 会议室', '感烟报警', 'done', '已处理']
  ];
  tbody.innerHTML = rows.map(r =>
    `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]} ${r[3]}</td><td><span class="tag ${r[4]}">${r[5]}</span></td></tr>`
  ).join('');
}

/* ---------- 填充：底部导航 ---------- */
function renderNav() {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;
  const items = [
    { icon: ICONS.home, name: '首页总览', active: true },
    { icon: ICONS.monitor, name: '消防监测' },
    { icon: ICONS.device, name: '设备管理' },
    { icon: ICONS.巡检, name: '巡检管理' },
    { icon: ICONS.plan, name: '预案管理' },
    { icon: ICONS.command, name: '应急指挥' },
    { icon: ICONS.analysis, name: '数据分析' },
    { icon: ICONS.setting, name: '系统设置' }
  ];
  nav.innerHTML = items.map(d => `
    <div class="nav-item ${d.active ? 'active' : ''}">
      <div class="nico">${d.icon}</div>${d.name}
    </div>`).join('');
}

/* ---------- 时钟 ---------- */
function startClock() {
  const dateEl = document.getElementById('clock-date');
  const weekEl = document.getElementById('clock-week');
  const weeks = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const pad = n => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    dateEl.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    weekEl.textContent = weeks[d.getDay()];
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- 启动 ---------- */
renderDonut('donut-facility', [
  { value: 1042, color: '#2ec9ff' },
  { value: 85, color: '#ffc53d' },
  { value: 28, color: '#ff4d5e' },
  { value: 131, color: '#5a7ba6' }
], { stroke: 11 });

renderDonut('donut-evac', [
  { value: 986, color: '#37e2a0' },
  { value: 262, color: 'rgba(90,123,166,.5)' }
], { stroke: 9 });

renderBar('bar-alarm', [
  { label: '05-14', value: 8 }, { label: '05-15', value: 12 }, { label: '05-16', value: 6 },
  { label: '05-17', value: 15 }, { label: '05-18', value: 9 }, { label: '05-19', value: 18 },
  { label: '今日', value: 28, hot: true }
]);

renderLine('line-water',
  [0.62, 0.60, 0.61, 0.58, 0.60, 0.63, 0.66, 0.68, 0.70, 0.68, 0.66, 0.64,
   0.62, 0.63, 0.65, 0.67, 0.66, 0.64, 0.63, 0.62, 0.64, 0.65, 0.66, 0.65]);

renderDevices();
renderLinkage();
renderAlarms();
renderNav();
startClock();
