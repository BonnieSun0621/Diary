// 统计页：旭日图（三级下钻+面包屑）/ 堆叠柱（日周月年）/ 日历热力图（需求 §4-D）
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
    const [s, e] = range;
    ctrl.querySelector('#s').value = s;
    ctrl.querySelector('#e').value = e;
    const sunData = await api.get(`/api/stats/sunburst?start=${s}&end=${e}`);
    sun.setOption({
      tooltip: { formatter: p => `${p.name}<br/>${fmtDur(p.value)}` },
      series: [{ type: 'sunburst', radius: ['12%', '92%'], data: sunData.data,
        label: { minAngle: 8, color: '#17181c' }, itemStyle: { borderColor: '#17181c', borderWidth: 1 } }],
    }, true);
    const tr = await api.get(`/api/stats/trend?start=${s}&end=${e}&granularity=${gran}`);
    trend.setOption({
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#9a978f' }, top: 0 },
      grid: { left: 48, right: 16, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: tr.labels, axisLabel: { color: '#9a978f' } },
      yAxis: { type: 'value', name: '分钟', axisLabel: { color: '#9a978f' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: tr.series.map(x => ({ name: x.name, type: 'bar', stack: 't', itemStyle: { color: x.color }, data: x.data })),
    }, true);
    const y = +e.slice(0, 4);
    const hm = await api.get('/api/stats/heatmap?year=' + y);
    heat.setOption({
      tooltip: { formatter: p => `${p.value[0]}<br/>${fmtDur(p.value[1])}` },
      visualMap: { min: 0, max: Math.max(240, ...hm.days.map(d => d.total_min)), orient: 'horizontal', left: 10, bottom: 0,
        inRange: { color: ['#2a2d34', '#A3B899'] }, textStyle: { color: '#9a978f' } },
      calendar: { top: 40, left: 40, right: 20, bottom: 40, range: y, cellSize: ['auto', 16],
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } },
        itemStyle: { color: 'rgba(255,255,255,.04)', borderWidth: 4, borderColor: 'transparent' },
        dayLabel: { color: '#9a978f' }, monthLabel: { color: '#9a978f' }, yearLabel: { show: false } },
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
