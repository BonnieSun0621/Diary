// 记录录入器（需求 v3-R1）：一级/二级/三级各自"可搜索下拉 + 输入即新建"，
// 逐级独立选择，未选上级时下级禁用；选齐三级 + 时长即可保存。
function buildComposer(root, dateStr, onSaved) {
  const box = document.createElement('div');
  box.className = 'card';
  box.id = 'composer';
  root.appendChild(box);
  box.innerHTML = `
    <h2>记一条</h2>
    <div class="row ss-row">
      <div id="ss1"></div>
      <span class="dim">›</span>
      <div id="ss2"></div>
      <span class="dim">›</span>
      <div id="ss3"></div>
    </div>
    <div class="row" id="recent" style="margin-top:8px"></div>
    <div class="row" style="margin-top:10px">
      <span class="dim">时长</span>
      <button class="chip" data-add="15">+15m</button>
      <button class="chip" data-add="30">+30m</button>
      <button class="chip" data-add="60">+1h</button>
      <button class="chip" data-add="120">+2h</button>
      <input type="text" id="dur" placeholder="0" style="width:90px" title="支持 90 / 1h30m / 30m">
      <button class="chip" id="durclear">清零</button>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="dim">时段(选填)</span>
      <input type="time" id="t1"> <span class="dim">–</span> <input type="time" id="t2">
      <button class="chip" id="autoend" title="用时长推出结束时间">⚡自动</button>
      <input type="text" id="note" placeholder="备注…（可留空）" style="flex:1;min-width:160px">
      <div class="spacer"></div>
      <button class="btn primary" id="save">保存 ⏎</button>
    </div>`;

  const $ = s => box.querySelector(s);
  const st = { l1: null, l2: null, l3: null, dur: 0, editingId: null };
  const syncSave = () => { $('#save').disabled = !(st.l3 && (parseDur($('#dur').value) || st.dur)); };

  // ---- 三个可搜索下拉（ss.js） ----
  const ss1 = SearchSelect({
    level: 1, placeholder: '1️⃣ 一级 · 领域',
    getOptions: () => App.tree.map(n => ({ id: n.id, name: n.name, icon: n.icon, text: n.name, path: [n.name] })),
    onPick: id => {
      st.l1 = id; st.l2 = st.l3 = null;
      ss2.enable(id != null);   // null = 输入了未确认内容，级联整体复位
      ss3.enable(false);
      syncSave();
    },
  });
  const ss2 = SearchSelect({
    level: 2, placeholder: '先选一级',
    getOptions: () => {
      const n = App.tree.find(x => x.id === st.l1);
      return n ? (n.children || []).map(c => ({ id: c.id, name: c.name, icon: c.icon, text: c.name, path: [n.name, c.name] })) : [];
    },
    onPick: id => { st.l2 = id; st.l3 = null; ss3.reset(); ss3.enable(id != null); syncSave(); },
    getCreateParent: () => st.l1,
  });
  const ss3 = SearchSelect({
    level: 3, placeholder: '先选二级',
    getOptions: () => {
      const l1 = App.tree.find(x => x.id === st.l1), l2 = l1 && (l1.children || []).find(x => x.id === st.l2);
      return l2 ? (l2.children || []).map(c => ({ id: c.id, name: c.name, icon: c.icon || l2.icon, text: c.name, path: [l1.name, l2.name, c.name] })) : [];
    },
    onPick: id => { st.l3 = id; syncSave(); },
    getCreateParent: () => st.l2,
  });
  box.querySelector('#ss1').append(ss1);
  box.querySelector('#ss2').append(ss2);
  box.querySelector('#ss3').append(ss3);
  ss2.enable(false); ss3.enable(false);
  syncSave(); // 初始置灰，选齐三级+时长后点亮

  // ---- 最近使用快捷：点一下 = 三列同时填好 ----
  api.get('/api/categories/recent?limit=10').then(rows => {
    const r = $('#recent');
    r.innerHTML = '<span class="dim">最近：</span>';
    for (const t of rows) {
      const p = document.createElement('button');
      p.className = 'tag-pill';
      p.style.color = t.color;
      p.innerHTML = `<span>${t.icon || '🏷'}</span><span style="color:var(--text)">${esc(t.name)}</span><span class="dim">${esc(t.root_name)} › ${esc(t.parent_name)}</span>`;
      p.onclick = () => fillFromTagId(t.id);
      r.append(p);
    }
  }).catch(() => {});

  // 按三级标签 id 反查并填好三列（recent pill / 编辑回填共用）
  function fillFromTagId(id) {
    const l1 = App.tree.find(a => (a.children || []).some(b => (b.children || []).some(c => c.id === id)));
    if (!l1) return;
    const l2 = l1.children.find(b => b.children.some(c => c.id === id));
    st.l1 = l1.id; st.l2 = l2.id; st.l3 = id;
    ss1.setValue(l1.id); ss1.refresh();
    ss2.enable(true); ss2.setValue(l2.id); ss2.refresh();
    ss3.enable(true); ss3.setValue(id); ss3.refresh();
    syncSave();
  }

  // ---- 时长 ----
  const syncDur = () => { $('#dur').value = st.dur ? fmtDur(st.dur) : ''; };
  box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    st.dur = Math.min(1440, st.dur + +b.dataset.add); syncDur();
  });
  $('#durclear').onclick = () => { st.dur = 0; syncDur(); };
  $('#dur').onchange = () => { const v = parseDur($('#dur').value); st.dur = v == null ? st.dur : v; syncDur(); syncSave(); };
  const applyAutoEnd = () => {
    if ($('#t1').value && st.dur) $('#t2').value = min2hhmm(hhmm2min($('#t1').value) + st.dur);
  };
  $('#t1').onchange = applyAutoEnd;
  $('#autoend').onclick = applyAutoEnd;

  // ---- 保存 ----
  const save = async () => {
    const dur = parseDur($('#dur').value) || st.dur;
    if (!dur) return toast('请先填写时长');
    if (!st.l3) return toast('请选到第三级标签');
    const body = {
      date: dateStr, duration_min: dur,
      start_time: $('#t1').value || null, end_time: $('#t2').value || null,
      note: $('#note').value.trim() || null,
    };
    try {
      if (st.editingId) await api.patch('/api/entries/' + st.editingId, { ...body, category_id: st.l3 });
      else await api.post('/api/entries', { ...body, category_id: st.l3 });
      toast(st.editingId ? '已更新' : '记录成功 ✓');
      onSaved();
    } catch (err) { toast('保存失败：' + err.message); }
  };
  $('#save').onclick = save;
  $('#note').onkeydown = e => { if (e.key === 'Enter') save(); };

  // ---- 编辑已有记录：三列自动回填 ----
  box.loadEntry = e => {
    st.editingId = e.id;
    st.dur = e.duration_min; syncDur();
    $('#t1').value = e.start_time || ''; $('#t2').value = e.end_time || '';
    $('#note').value = e.note || '';
    fillFromTagId(e.category_id);
    box.scrollIntoView({ behavior: 'smooth' });
    box.querySelector('h2').textContent = '编辑记录（改完点保存）';
  };
}

