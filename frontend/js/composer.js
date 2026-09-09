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
      <button class="chip" id="autoend" title="用时长推出结束时间">自动</button>
      <input type="text" id="note" placeholder="备注…（可留空）" style="flex:1;min-width:160px">
      <div class="spacer"></div>
      <button class="btn primary" id="save">保存 ⏎</button>
    </div>`;

  const $ = s => box.querySelector(s);
  const st = { l1: null, l2: null, l3: null, dur: 0, editingId: null };
  const curDur = () => parseDur($('#dur').value) || st.dur;
  // v3.2：只要选到一级即可保存（睡眠等不必有三级）；选到的最深层即挂载点
  const curCat = () => st.l3 || st.l2 || st.l1;
  const syncSave = () => { $('#save').disabled = !(curCat() && curDur()); };

  // ---- 三个可搜索下拉（ss.js） ----
  const ss1 = SearchSelect({
    level: 1, placeholder: '一级',
    getOptions: () => App.tree.map(n => ({ id: n.id, name: n.name, text: n.name, path: [n.name] })),
    onPick: id => {
      st.l1 = id; st.l2 = st.l3 = null;
      ss2.enable(id != null);   // null = 输入了未确认内容，级联整体复位
      ss3.enable(false);
      syncSave();
    },
  });
  const ss2 = SearchSelect({
    level: 2, placeholder: '二级',
    getOptions: () => {
      const n = App.tree.find(x => x.id === st.l1);
      return n ? (n.children || []).map(c => ({ id: c.id, name: c.name, text: c.name, path: [n.name, c.name] })) : [];  // v3.3：子级无图标
    },
    onPick: id => { st.l2 = id; st.l3 = null; ss3.reset(); ss3.enable(id != null); syncSave(); },
    getCreateParent: () => st.l1,
  });
  const ss3 = SearchSelect({
    level: 3, placeholder: '三级（可跳过）',
    getOptions: () => {
      const l1 = App.tree.find(x => x.id === st.l1), l2 = l1 && (l1.children || []).find(x => x.id === st.l2);
      return l2 ? (l2.children || []).map(c => ({ id: c.id, name: c.name, text: c.name, path: [l1.name, l2.name, c.name] })) : [];  // v3.3：子级无图标
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
      p.innerHTML = `<span style="color:var(--text)">${esc(t.name)}</span><span class="dim">${esc([t.root_name, t.parent_name].filter(Boolean).join(' › '))}</span>`;  // v3.3：pill 纯名称+路径
      p.onclick = () => fillFromCatId(t.id);
      r.append(p);
    }
  }).catch(() => {});

  // 按分类 id 逐级回填三列（记录可挂 1/2/3 任一级；recent pill / 编辑回填共用）
  function fillFromCatId(id) {
    st.l1 = st.l2 = st.l3 = null;
    ss1.setValue(null); ss2.enable(false); ss3.enable(false);
    const l1 = App.tree.find(a => a.id === id);
    if (l1) { st.l1 = l1.id; ss1.setValue(l1.id); ss1.refresh(); syncSave(); return; }
    let p2 = null, l2 = null;
    for (const a of App.tree) { const c = (a.children || []).find(b => b.id === id); if (c) { p2 = a; l2 = c; break; } }
    if (l2) { st.l1 = p2.id; st.l2 = l2.id; ss1.setValue(p2.id); ss1.refresh();
      ss2.enable(true); ss2.setValue(l2.id); ss2.refresh(); syncSave(); return; }
    for (const a of App.tree) for (const b of (a.children || [])) {
      const c = (b.children || []).find(x => x.id === id);
      if (c) { st.l1 = a.id; st.l2 = b.id; st.l3 = c.id;
        ss1.setValue(a.id); ss1.refresh();
        ss2.enable(true); ss2.setValue(b.id); ss2.refresh();
        ss3.enable(true); ss3.setValue(c.id); ss3.refresh(); syncSave(); return; }
    }
  }

  // ---- 时长：芯片/清零/手输全部联动保存按钮（修复"按钮不亮"） ----
  const syncDur = () => { $('#dur').value = st.dur ? fmtDur(st.dur) : ''; };
  box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    st.dur = Math.min(1440, st.dur + +b.dataset.add); syncDur(); syncSave();
  });
  $('#durclear').onclick = () => { st.dur = 0; syncDur(); syncSave(); };
  $('#dur').oninput = () => { st.dur = parseDur($('#dur').value) || 0; syncSave(); };
  $('#dur').onchange = () => { const v = parseDur($('#dur').value); st.dur = v == null ? st.dur : v; syncDur(); syncSave(); };
  const applyAutoEnd = () => {
    if ($('#t1').value && st.dur) $('#t2').value = min2hhmm(hhmm2min($('#t1').value) + st.dur);
  };
  $('#autoend').onclick = applyAutoEnd;

  // ---- 保存 ----
  const save = async () => {
    const dur = curDur();
    if (!dur) return toast('请先填写时长');
    if (!curCat()) return toast('请至少选择一级分类');
    const body = {
      date: dateStr, duration_min: dur,
      start_time: $('#t1').value || null, end_time: $('#t2').value || null,
      note: $('#note').value.trim() || null,
    };
    try {
      if (st.editingId) await api.patch('/api/entries/' + st.editingId, { ...body, category_id: curCat() });
      else await api.post('/api/entries', { ...body, category_id: curCat() });
      toast(st.editingId ? '已更新 ✓' : '记录成功 ✓');
      onSaved(); // 重渲染后录入器整体回到初始态，可直接录下一条
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
    fillFromCatId(e.category_id);
    box.querySelector('h2').textContent = '编辑记录（改完点保存）';
    box.scrollIntoView({ behavior: 'smooth' });
  };
}

