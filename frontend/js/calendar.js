// 日历页：月视图网格，任意日期直达详情页（需求 §4-B）
async function renderCalendar(root, month) {
  month = month || todayStr().slice(0, 7);
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'day-nav';
  head.innerHTML = `
    <button class="btn" id="pm">◀</button>
    <div class="date-title">${month.replace('-', '年')}月</div>
    <button class="btn" id="nm">▶</button>
    <div class="spacer"></div>
    <button class="btn" id="ct">回到本月</button>`;
  root.append(head);
  head.querySelector('#pm').onclick = () => renderCalendar(root, shiftMonth(month, -1));
  head.querySelector('#nm').onclick = () => renderCalendar(root, shiftMonth(month, 1));
  head.querySelector('#ct').onclick = () => renderCalendar(root, todayStr().slice(0, 7));

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="cal-week">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal-grid" id="grid"></div>`;
  root.append(card);

  // ---- 日历概要：今天高亮、未来弱化、有记录日显示时长徽章 ----
  const data = await api.get('/api/stats/calendar?month=' + month);
  const byDate = Object.fromEntries(data.days.map(d => [d.date, d]));
  const grid = card.querySelector('#grid');
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 周一开头的前置空格数
  const dim = new Date(y, m, 0).getDate();
  const t = todayStr();

  for (let i = 0; i < lead; i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell empty';
    grid.append(e);
  }
  for (let d = 1; d <= dim; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    const info = byDate[ds];
    const cell = document.createElement('div');
    cell.className = 'cal-cell'
      + (ds === t ? ' today' : '')
      + (info ? ' has-rec' : '')
      + (ds > t ? ' future' : '');
    cell.innerHTML = `
      <div class="d">${d}</div>
      ${info ? `<div class="sum">${info.count} 条</div>
                <span class="badge">${fmtDur(info.total_min)}</span>
                <div class="dots">${info.colors.map(c => `<i style="background:${c}"></i>`).join('')}</div>` : ''}`;
    cell.onclick = () => location.hash = '#/day/' + ds;
    grid.append(cell);
  }
}
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}
