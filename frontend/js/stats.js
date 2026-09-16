// 统计页：旭日图（三级下钻+面包屑）/ 堆叠柱（日周月年）/ 日历热力图（需求 §4-D）
// 图表主题与 CSS 设计令牌同源（style.css --text-2 等），保证视觉统一
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function glassGrad(color) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0,   color: hexA(color, .78) },
    { offset: .55, color: hexA(color, .48) },
    { offset: 1,   color: hexA(color, .58) },
  ]);
}
// 浅色主题（warmpaper/sky）下图表色整体加深：莫兰迪原色 vs 浅底对比度仅 ~1.7-2.2:1，
// 加深后 ≥3:1（WCAG 图形标准）；深色主题保持原色玻璃感。
function isLightTheme() {
  return ['warmpaper', 'sky'].includes(document.documentElement.dataset.theme);
}
function shade(hex, k) {   // k=0 原色，k=1 全黑
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(v => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('');
}
function chartColor(hex) { return isLightTheme() ? shade(hex, .35) : hex; }
function deepenRgba(rgbaStr) {   // 'rgba(r,g,b,a)' → 浅色主题下整体加深
  if (!isLightTheme()) return rgbaStr;
  const m = rgbaStr.match(/rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)/);
  if (!m) return rgbaStr;
  const f = v => Math.round(+v * .65);
  return `rgba(${f(m[1])},${f(m[2])},${f(m[3])},${m[4] ?? 1})`;
}
// 图表取色全部跟随主题（themeTokens 读 CSS 变量）；warmpaper/sky 均为浅色主题
// （v4.0 曾只把 warmpaper 当浅色，sky 的 tooltip 文字/格线沿用了深色取值导致发白）
function chartTheme() {
  const tk = themeTokens();
  const t = document.documentElement.dataset.theme;
  const light = t === 'warmpaper' || t === 'sky';
  return {
    dim: tk.dim, grid: tk.grid, tipBg: tk.tipBg, accent: tk.accent, border: tk.border,
    heatFrom: tk.heatFrom || (light ? '#e7dcc4' : '#232830'),
    sunLabel: tk.sunLabel || (light ? '#f6efe2' : '#17181c'),
    tooltipText: light ? '#4a4238' : '#eceae7',
    axisLine: light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.1)',   /* 轴线 */
    tipBorder: light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.1)',  /* tooltip 描边 */
    cellStroke: light ? (t === 'sky' ? 'rgba(46,58,69,.12)' : 'rgba(74,66,56,.12)') : 'rgba(255,255,255,.12)',  /* 热力图月格线 */
    cellFill: light ? (t === 'sky' ? 'rgba(46,58,69,.035)' : 'rgba(74,66,56,.04)') : 'rgba(255,255,255,.03)',   /* 热力图空格底 */
    hoverShadow: light ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.4)',      /* 旭日 hover 阴影 */
  };
}
let CHART_T = chartTheme();
const RANGE_PRESETS = {
  '本月': () => [todayStr().slice(0, 7) + '-01', todayStr()],
  '近30天': () => [addDays(todayStr(), -29), todayStr()],
  '本年度': () => [todayStr().slice(0, 4) + '-01-01', todayStr()],
  '上一年': () => { const y = +todayStr().slice(0, 4) - 1; return [y + '-01-01', y + '-12-31']; },
};

async function renderStats(root) {
  root.innerHTML = '';
  let range = RANGE_PRESETS['近30天']();
  let gran = 'day';

  const ctrl = document.createElement('div');
  ctrl.className = 'card';
  ctrl.innerHTML = `<h2>统计范围</h2><div class="row" id="presets"></div>
    <div class="row" style="margin-top:8px"><input type="date" id="s"> <span class="dim">至</span> <input type="date" id="e"></div>`;
  root.append(ctrl);

  const sunCard = mkChartCard('时间分布 · 旭日图（点击环层可下钻）', 'sun', 'chart-sun');
  const trendCard = mkChartCard('趋势 · 各类别堆叠', 'trend', 'chart');
  const heatCard = mkChartCard('日历热力图（点击某天跳转该日日记）', 'heat', 'chart');
  root.append(sunCard, trendCard, heatCard);

  const sun = echarts.init(sunCard.querySelector('.chart'));
  const trend = echarts.init(trendCard.querySelector('.chart'));
  const heat = echarts.init(heatCard.querySelector('.chart'));

  const paint = async () => {
    CHART_T = chartTheme();   /* 切主题后重渲染取新色 */
    const [s, e] = range;
    ctrl.querySelector('#s').value = s;
    ctrl.querySelector('#e').value = e;
    const sunData = await api.get(`/api/stats/sunburst?start=${s}&end=${e}`);
    sun.setOption({
      tooltip: { backgroundColor: CHART_T.tipBg, borderColor: CHART_T.tipBorder,
        textStyle: { color: CHART_T.tooltipText }, formatter: p => `${p.name}<br/><b>${fmtDur(p.value)}</b>` },
      series: [{ type: 'sunburst', radius: ['12%', '92%'],
        data: JSON.parse(JSON.stringify(sunData.data), (k, v) =>
          typeof v === 'string' && /^rgba?\(/.test(v) ? deepenRgba(v) : v),
        label: { minAngle: 8, color: CHART_T.sunLabel, fontSize: 12 },
        itemStyle: { borderColor: CHART_T.border, borderWidth: 1.5 },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: CHART_T.hoverShadow } } }],
    }, true);
    const tr = await api.get(`/api/stats/trend?start=${s}&end=${e}&granularity=${gran}`);
    trend.setOption({
      tooltip: { trigger: 'axis', backgroundColor: CHART_T.tipBg, borderColor: CHART_T.tipBorder,
        textStyle: { color: CHART_T.tooltipText },
        valueFormatter: v => fmtDur(v) + '（' + (v / 60).toFixed(1) + 'h）' },
      legend: { textStyle: { color: CHART_T.dim }, top: 0, icon: 'circle', itemWidth: 8 },
      grid: { left: 48, right: 16, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: tr.labels, axisLabel: { color: CHART_T.dim },
        axisLine: { lineStyle: { color: CHART_T.axisLine } } },
      yAxis: { type: 'value', name: '小时', nameTextStyle: { color: CHART_T.dim },
        axisLabel: { color: CHART_T.dim, formatter: v => (v / 60) + 'h' },
        splitLine: { lineStyle: { color: CHART_T.grid } } },
      series: tr.series.map(x => ({ name: x.name, type: 'bar', stack: 't',
        itemStyle: { color: glassGrad(chartColor(x.color)), borderRadius: [4, 4, 0, 0],
          borderColor: hexA(chartColor(x.color), .9), borderWidth: 1 }, barMaxWidth: 42, data: x.data })),
    }, true);
    const y = +e.slice(0, 4);
    const hm = await api.get('/api/stats/heatmap?year=' + y);
    heat.setOption({
      tooltip: { backgroundColor: CHART_T.tipBg, borderColor: CHART_T.tipBorder,
        textStyle: { color: CHART_T.tooltipText }, formatter: p => `${p.value[0]}<br/><b>${fmtDur(p.value[1])}</b>` },
      visualMap: { min: 0, max: Math.max(240, ...hm.days.map(d => d.total_min)), orient: 'horizontal', left: 10, bottom: 0,
        inRange: { color: [CHART_T.heatFrom, chartColor(CHART_T.accent)] }, textStyle: { color: CHART_T.dim } },
      calendar: { top: 40, left: 40, right: 20, bottom: 40, range: y, cellSize: ['auto', 16],
        splitLine: { lineStyle: { color: CHART_T.cellStroke } },
        itemStyle: { color: CHART_T.cellFill, borderWidth: 4, borderColor: 'transparent', borderRadius: 4 },
        dayLabel: { color: CHART_T.dim, fontSize: 11 }, monthLabel: { color: CHART_T.dim }, yearLabel: { show: false } },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar',
        data: hm.days.map(d => [d.date, d.total_min]) }],
    }, true);
    heat.off('click');
    heat.on('click', p => { if (p.value && p.value[0]) location.hash = '#/day/' + p.value[0]; });
  };

  const box = ctrl.querySelector('#presets');
  for (const name of Object.keys(RANGE_PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip' + (name === '近30天' ? ' on' : '');
    b.textContent = name;
    b.onclick = () => {
      box.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      range = RANGE_PRESETS[name]();
      paint();
    };
    box.append(b);
  }
  const gbox = document.createElement('div');
  gbox.className = 'row';
  gbox.style.marginTop = '10px';
  gbox.innerHTML = `<span class="dim">趋势粒度</span>` +
    ['day', 'week', 'month', 'year'].map((g, i) =>
      `<button class="chip${i === 0 ? ' on' : ''}" data-g="${g}">${['日', '周', '月', '年'][i]}</button>`).join('');
  ctrl.append(gbox);
  gbox.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
    gbox.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    gran = b.dataset.g;
    paint();
  });
  ctrl.querySelector('#s').onchange = e => { range = [e.target.value, range[1]]; paint(); };
  ctrl.querySelector('#e').onchange = e => { range = [range[0], e.target.value]; paint(); };

  await paint();
}
function mkChartCard(title, h) {
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML = `<h2>${title}</h2><div class="chart ${h}"></div>`;
  return c;
}
