// 今日页 / 任意历史日详情页 —— 同一组件，由 dateStr 驱动（需求 §4-A/B）
const MOODS = ['😄 开心', '🙂 平静', '😐 一般', '🙁 低落', '😫 疲惫'];
const WEATHERS = ['☀️', '🌤', '☁️', '🌧', '⛈', '❄️', '🌬', '🌫'];

async function renderDayView(root, dateStr) {
  const isToday = dateStr === todayStr();
  const day = await api.get(`/api/days/${dateStr}`);
  root.innerHTML = '';

  // ---- 日期导航：◀ ▶ + 直跳 + 回到今天 ----
  const nav = document.createElement('div');
  nav.className = 'day-nav';
  nav.innerHTML = `
    <button class="btn" id="prev" title="前一天">◀</button>
    <div>
      <div class="date-title">${isToday ? '今天 · ' : ''}${dateLabel(dateStr)}</div>
      <div class="dim">${isToday ? '记录此刻，或随时回看补记' : '正在查看过去的一天 · 可直接编辑'}</div>
    </div>
    <button class="btn" id="next" title="后一天">▶</button>
    <input type="date" id="jump" value="${dateStr}">
    ${isToday ? '' : '<button class="btn" id="back-today">回到今天</button>'}
    <div class="spacer"></div>
    <button class="btn" id="export">📤 导出长图</button>`;
  root.append(nav);
  nav.querySelector('#prev').onclick = () => location.hash = '#/day/' + addDays(dateStr, -1);
  nav.querySelector('#next').onclick = () => location.hash = '#/day/' + addDays(dateStr, 1);
  nav.querySelector('#jump').onchange = e => { if (e.target.value) location.hash = '#/day/' + e.target.value; };
  const bt = nav.querySelector('#back-today');
  if (bt) bt.onclick = () => location.hash = '#/today';
  nav.querySelector('#export').onclick = () => exportJournalPng(day);

  // ---- 心情 / 天气：日内转变链，最多 5 项，每项可带时刻（需求 v3-R2） ----
  const emo = document.createElement('div');
  emo.className = 'card';
  const page = day.day_page || {};
  emo.innerHTML = `<h2>此刻状态（一天内可转变，最多 5 段）</h2>
    <div class="row" style="align-items:center">心情 <span id="moods" class="chain"></span></div>
    <div class="row" style="align-items:center;margin-top:8px">天气 <span id="wts" class="chain"></span></div>`;
  root.append(emo);

  const saveStates = async (field, seq) => {
    try {
      await api.put(`/api/days/${dateStr}`, {
        text: page.text ?? null,
        mood: field === 'mood' ? seq : (page.mood || []),
        weather: field === 'weather' ? seq : (page.weather || []),
      });
      Object.assign(page, { [field]: seq });
      renderDayView(root, dateStr);
    } catch (e) { toast(e.message); }
  };
  const paintChain = (box, seq, field, opts) => {
    box.innerHTML = '';
    seq = seq || [];
    seq.forEach((item, i) => {
      if (i) { const a = document.createElement('span'); a.className = 'arrow'; a.textContent = '→'; box.append(a); }
      const chip = document.createElement('button');
      chip.className = 'chip on';
      chip.innerHTML = `${esc(item.v)}${item.t ? ` <span class="dim">${item.t}</span>` : ''} <span class="mini">✏️</span>`;
      chip.onclick = () => editItem(i);
      box.append(chip);
      const del = document.createElement('button');
      del.className = 'mini'; del.textContent = '🗑'; del.title = '删除此段';
      del.onclick = async e => { e.stopPropagation(); await saveStates(field, seq.filter((_, j) => j !== i)); };
      box.append(del);
    });
    if (seq.length < 5) {
      const add = document.createElement('button');
      add.className = 'chip';
      add.textContent = '＋ 转变';
      add.onclick = () => editItem(seq.length, true);
      box.append(add);
    }
    function editItem(idx, isNew) {
      const cur = seq[idx] || { v: '', t: '' };
      // 全屏遮罩 + 居中弹窗：不受卡片布局裁切（修复"展开不完整"）
      const backdrop = document.createElement('div');
      backdrop.className = 'pop-backdrop';
      const pop = document.createElement('div');
      pop.className = 'state-pop';
      pop.innerHTML = `<h3>${field === 'mood' ? '心情' : '天气'} · 第 ${idx + 1} 段 / 5</h3>
        <div class="row wrap">${opts.map(o =>
        `<button class="chip${o.value === cur.v ? ' on' : ''}" data-v="${o.value}">${o.label}</button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><span class="dim">时刻(选填)</span>
        <input type="time" value="${cur.t || ''}">
        <div class="spacer"></div>
        <button class="btn" data-act="cancel">取消</button>
        <button class="btn primary" data-act="ok">好</button></div>`;
      backdrop.append(pop);
      document.body.append(backdrop);
      let v = cur.v;
      pop.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        v = b.dataset.v;
        pop.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b));
      });
      const close = () => backdrop.remove();
      backdrop.onclick = e => { if (e.target === backdrop) close(); };
      pop.querySelector('[data-act=cancel]').onclick = close;
      pop.querySelector('[data-act=ok]').onclick = async () => {
        if (!v) return toast('选一个状态');
        const t = pop.querySelector('input').value || null;
        const next = seq.slice();
        next[idx] = { v, t };
        close();
        await saveStates(field, next);
      };
    }
  };
  paintChain(emo.querySelector('#moods'), page.mood, 'mood',
    MOODS.map(s => ({ value: s.split(' ')[0], label: s })));
  paintChain(emo.querySelector('#wts'), page.weather, 'weather',
    WEATHERS.map(s => ({ value: s, label: s })));

  // ---- 时间轴 + 活动清单 ----
  const list = document.createElement('div');
  list.className = 'card';
  const total = day.merged_total_min ?? day.entries.reduce((s, e) => s + e.duration_min, 0);
  list.innerHTML = `<h2>活动记录 <span class="dim">实际投入 ${fmtDur(total)}${day.merged_total_min != null && day.merged_total_min !== day.sum_total_min ? `（累加 ${fmtDur(day.sum_total_min)}，已去重）` : ''}</span></h2>`;
  list.append(renderTimeline(day.entries));
  const ul = document.createElement('div');
  list.append(ul);
  root.append(list);
  for (const e of day.entries) {
    const row = document.createElement('div');
    row.className = 'entry';
    const time = e.start_time && e.end_time ? `<span class="dim">${e.start_time}–${e.end_time}</span> ` : '';
    row.innerHTML = `
      <span class="dot" style="background:${e.color}"></span>
      <div class="path">${time}${e.path.join(' › ')}
        ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</div>
      <div class="dur">${fmtDur(e.duration_min)}</div>
      <div class="acts">
        <button class="mini" title="编辑">✏️</button>
        <button class="mini" title="删除">🗑</button>
      </div>`;
    attachTip(row.querySelector('.path'), () =>
      `<b>${esc(e.path[e.path.length - 1])}</b>
       <span class="tip-path">${esc(e.path.join(' › '))}</span>
       <span class="tip-time">${e.start_time ? `${e.start_time}–${e.end_time} · ` : ''}${fmtDur(e.duration_min)}</span>
       ${e.note ? `<i>“${esc(e.note)}”</i>` : ''}`);
    row.querySelector('[title=编辑]').onclick = () => composer.loadEntry(e);
    row.querySelector('[title=删除]').onclick = async () => {
      if (!confirm('删除这条记录？')) return;
      await api.del('/api/entries/' + e.id);
      renderDayView(root, dateStr);
    };
    ul.append(row);
  }
  if (!day.entries.length) ul.innerHTML = '<div class="dim" style="padding:10px 12px">还没有记录，在下面记第一条吧 ↓</div>';

  buildComposer(root, dateStr, () => renderDayView(root, dateStr));

  // ---- 每日自由文字（自动保存）——次要卡片，视觉退后 ----
  const txt = document.createElement('div');
  txt.className = 'card secondary';
  txt.innerHTML = `<h2>今日随想</h2><textarea id="daytext" placeholder="想写就写，不写也行…"></textarea>`;
  root.append(txt);
  const ta = txt.querySelector('#daytext');
  ta.value = page.text || '';
  ta.oninput = debounce(async () => {
    await api.put(`/api/days/${dateStr}`, { text: ta.value, mood: page.mood || [], weather: page.weather || [] });
  }, 600);
}
