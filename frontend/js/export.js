// 导出 PNG 手帐长图（需求 §4-E）：日期+天气心情 → 时间轴色带 → 活动清单 →
// 迷你时间分布饼图 → 今日随想；深浅两色纸感；任意日期可导出。
async function exportJournalPng(day) {
  toast('正在生成长图…');
  const theme = localStorage.getItem('journal-theme') || 'light';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0';
  const j = document.createElement('div');
  j.className = 'journal ' + theme;

  const page = day.day_page || {};
  // 转变链渲染："☀️ 晴 ·14:00 → 🌧 雨"；无时刻则只显示值
  const chainHtml = seq => (seq && seq.length)
    ? seq.map(s => `<span class="j-seg">${esc(s.v)}${s.t ? `<small> ${s.t}</small>` : ''}</span>`).join('<span class="j-arrow">→</span>')
    : '';
  const emo = [chainHtml(page.weather), chainHtml(page.mood)].filter(Boolean).join('&nbsp;&nbsp;');
  const total = day.entries.reduce((s, e) => s + e.duration_min, 0);

  const esc2 = s => esc(s);
  const listHtml = day.entries.map(e => `
    <div class="j-entry">
      <span class="j-dot" style="background:${e.color}"></span>
      <div>${e.icon} ${e.path.join(' › ')}${e.start_time && e.end_time ? ` <span style="opacity:.6">${e.start_time}–${e.end_time}</span>` : ''}
        ${e.note ? `<span class="j-note">“${esc2(e.note)}”</span>` : ''}</div>
      <span class="j-dur">${fmtDur(e.duration_min)}</span>
    </div>`).join('') || '<div style="opacity:.6">这一天没有记录</div>';

  const timed = day.entries.filter(e => e.start_time && e.end_time);
  const tlHtml = timed.map(e => {
    const s = hhmm2min(e.start_time), en = hhmm2min(e.end_time);
    const spans = en >= s ? [[s, en]] : [[s, 1440], [0, en]];
    return spans.map(([a, b]) =>
      `<span class="blk" style="left:${a / 1440 * 100}%;width:${(b - a) / 1440 * 100}%;background:${e.color}"></span>`).join('');
  }).join('');

  j.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div class="j-date">${day.date.replaceAll('-', ' · ')}</div>
      <div class="j-emo">${emo}</div>
    </div>
    <div class="dim" style="opacity:.7">共记录 ${day.entries.length} 项 · ${fmtDur(total)}</div>
    <hr class="j-hr">
    ${timed.length ? `<div class="j-sec">时 间 轴</div><div class="j-tl">${tlHtml}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;opacity:.6;margin-top:2px"><span>0:00</span><span>12:00</span><span>24:00</span></div>` : ''}
    <div class="j-sec">今 日 行 迹</div>
    ${listHtml}
    <hr class="j-hr">
    ${total ? `<div class="j-sec">时 间 去 向</div>
      <div class="j-pie"><div id="jpie" style="width:220px;height:220px"></div><div class="j-legend" id="jlegend"></div></div>` : ''}
    ${page.text ? `<hr class="j-hr"><div class="j-sec">今 日 随 想</div><div class="j-text">${esc2(page.text)}</div>` : ''}
    <hr class="j-hr">
    <div style="text-align:center;font-size:12px;opacity:.55;letter-spacing:4px">— 拾光手帐 · ${day.date} —</div>`;

  wrap.append(j);
  document.body.append(wrap);

  // 迷你饼图（按一级大类聚合）
  if (total) {
    const byRoot = {};
    for (const e of day.entries) byRoot[e.path[0]] = (byRoot[e.path[0]] || 0) + e.duration_min;
    const colorOf = {};
    for (const t of App.tags) colorOf[t.path[0]] = t.color;
    const pie = echarts.init(j.querySelector('#jpie'));
    pie.setOption({
      tooltip: { show: false },
      series: [{ type: 'pie', radius: ['45%', '75%'],
        label: { show: false }, itemStyle: { borderColor: theme === 'light' ? '#f6efe2' : '#2b2823', borderWidth: 2 },
        data: Object.entries(byRoot).map(([n, v]) => ({ name: n, value: v, itemStyle: { color: colorOf[n] || '#999' } })) }],
    });
    j.querySelector('#jlegend').innerHTML = Object.entries(byRoot)
      .sort((a, b) => b[1] - a[1])
      .map(([n, v]) => `<span style="color:${colorOf[n] || '#999'}">●</span> ${n} ${fmtDur(v)}（${Math.round(v / total * 100)}%）`)
      .join('<br>');
    await new Promise(r => setTimeout(r, 300));
  }

  const canvas = await html2canvas(j, { scale: 2, backgroundColor: null });
  document.body.removeChild(wrap);
  const a = document.createElement('a');
  a.download = `diary-${day.date}-${theme}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('长图已导出');
}
