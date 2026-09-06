// 设置页：分类管理（逐级展开：L1 列表 → 点进 L2 → 点进 L3，各级独立增删改）
// + 备份恢复 + 导出主题（需求 v3-R1 / §4-F/G）
renderSettings.crumbs = renderSettings.crumbs || []; // 层级位置跨渲染保留
async function renderSettings(root) {
  root.innerHTML = '';
  await api.get('/api/categories'); // 确保树最新
  const reloadAll = () => renderSettings(root);
  async function act(fn) { try { await fn(); reloadAll(); } catch (e) { toast(e.message); } }

  // ---- 面包屑式层级导航（每个级别独立选择/管理） ----
  // crumbs 存在模块级，跨重渲染保留位置；长度>2 视为非法重置
  if (renderSettings.crumbs.length > 2) renderSettings.crumbs = [];
  const crumbs = renderSettings.crumbs;
  const l1 = crumbs[0] != null ? App.tree.find(x => x.id === crumbs[0]) : undefined;
  const l2 = l1 && crumbs[1] != null ? (l1.children || []).find(x => x.id === crumbs[1]) : undefined;
  const curNodes = crumbs.length === 2 && l2 ? (l2.children || [])
    : crumbs.length === 1 && l1 ? (l1.children || []) : App.tree;
  const curNames = [l1?.name, l2?.name].filter(Boolean);
  const go = () => renderSettings(root);

  const nav = document.createElement('div');
  nav.className = 'card';
  nav.innerHTML = `<h2>分类管理（逐级进入管理）</h2><div class="row" id="crumbs"></div>`;
  root.append(nav);
  const cb = nav.querySelector('#crumbs');
  const crumb = (label, depth) => {
    const b = document.createElement('button');
    b.className = 'chip' + (depth === crumbs.length ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { crumbs.length = depth; go(); };
    cb.append(b);
    if (depth < crumbs.length) { const s = document.createElement('span'); s.className = 'dim'; s.textContent = '›'; cb.append(s); }
  };
  crumb('🗂 一级 · 领域', 0);
  crumbs.forEach((id, d) => crumb(curNames[d] || '?', d + 1));

  const list = document.createElement('div');
  list.className = 'card';
  const typeName = ['一级 · 领域', '二级 · 类型', '三级 · 标签'][crumbs.length];
  list.innerHTML = `<h2>${crumbs.length ? '「' + curNames[crumbs.length - 1] + '」下的' : ''}${typeName}</h2>`;
  root.append(list);

  for (const n of curNodes) {
    const row = document.createElement('div');
    row.className = 'cat-node';
    const kidCount = (n.children || []).length;
    row.innerHTML = `
      <span class="cicon" style="background:${n.color}"></span>
      <span>${n.icon || ''} <b>${esc(n.name)}</b> ${crumbs.length < 2 ? `<span class="dim">${kidCount} 个子级</span>` : ''}</span>
      <div class="spacer"></div>
      ${crumbs.length < 2 ? '<button class="btn enter" style="padding:3px 12px">进入 →</button><button class="mini" title="加子级">＋子级</button>' : ''}
      <button class="mini" title="改名">✏️</button>
      ${crumbs.length ? '<button class="mini" title="合并">⇄</button>' : '<button class="mini" style="visibility:hidden">⇄</button>'}
      <button class="mini" title="删除">🗑</button>`;
    row.querySelector('[title=加子级]')?.addEventListener('click', () => act(async () => {
      const name = prompt(`在「${n.name}」下新增子级名称：`);
      if (name?.trim()) await api.post('/api/categories', { name: name.trim(), parent_id: n.id });
    }));
    row.querySelector('[title=改名]').onclick = () => act(async () => {
      const name = prompt('新名称：', n.name);
      if (name?.trim() && name !== n.name) await api.patch('/api/categories/' + n.id, { name: name.trim() });
    });
    row.querySelector('[title=合并]')?.addEventListener('click', () => act(async () => {
      const sibs = curNodes.filter(x => x.id !== n.id);
      if (!sibs.length) return toast('没有可合并的同级分类');
      const pick = prompt(`把「${n.name}」合并到（其子级与记录一并迁移）：\n` + sibs.map((s, i) => `${i + 1}. ${s.name}`).join('\n'));
      const t = sibs[+pick - 1];
      if (t) await api.post(`/api/categories/${n.id}/merge`, { target_id: t.id });
    }));
    row.querySelector('[title=删除]').onclick = () => act(async () => {
      if (confirm(`删除「${n.name}」？（有子级或记录时会被拒绝）`)) await api.del('/api/categories/' + n.id);
    });
    row.querySelector('.enter')?.addEventListener('click', () => { crumbs.push(n.id); go(); });
    list.append(row);
  }
  if (!curNodes.length) list.insertAdjacentHTML('beforeend', '<div class="dim">这一级还没有内容</div>');

  // ---- 本级新增输入框 ----
  const add = document.createElement('div');
  add.className = 'row';
  add.style.marginTop = '10px';
  const parentForNew = crumbs.length === 1 ? l1?.id : crumbs.length === 2 ? l2?.id : null;
  add.innerHTML = `<input type="text" id="nn" placeholder="${crumbs.length ? '在「' + curNames[curNames.length - 1] + '」下新增' + typeName.split(' · ')[1] : '新增一级领域'}…">
    <button class="btn" id="an">添加</button>`;
  list.append(add);
  add.querySelector('#an').onclick = () => act(async () => {
    const name = add.querySelector('#nn').value.trim();
    if (!name) return;
    await api.post('/api/categories', { name, parent_id: parentForNew });
  });

  // ---- 备份 / 恢复 / 导出主题 ----
  const bk = document.createElement('div');
  bk.className = 'card';
  bk.innerHTML = `<h2>数据</h2>
    <div class="row">
      <button class="btn" id="bexp">⬇️ 导出备份 JSON</button>
      <button class="btn" id="bimp">⬆️ 从备份恢复</button>
      <input type="file" id="bfile" accept="application/json" hidden>
      <div class="spacer"></div>
      <span class="dim">导出长图配色</span>
      <select id="jtheme">
        <option value="light">浅色纸感</option>
        <option value="dark">深色纸感</option>
      </select>
    </div>
    <p class="dim" style="margin-top:8px">数据库文件：data/diary.db（本地单文件，建议定期备份）</p>`;
  root.append(bk);
  const sel = bk.querySelector('#jtheme');
  sel.value = localStorage.getItem('journal-theme') || 'light';
  sel.onchange = () => { localStorage.setItem('journal-theme', sel.value); toast('已切换'); };
  bk.querySelector('#bexp').onclick = () => location.href = '/api/backup';
  bk.querySelector('#bimp').onclick = () => bk.querySelector('#bfile').click();
  bk.querySelector('#bfile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm('恢复将覆盖当前全部数据，确定？')) return;
    try {
      await api.post('/api/restore', JSON.parse(await f.text()));
      toast('恢复完成');
      reloadAll();
    } catch (err) { toast(err.message); }
  };
}
