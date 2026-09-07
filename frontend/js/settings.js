// 设置页：分类管理（Finder 式原位展开树：▸/▾ 展开收起，各级原位增删改）
// + 备份恢复 + 导出主题（需求 v3-R1 / §4-F/G）
renderSettings.opened = renderSettings.opened || new Set(); // 展开状态跨渲染保留
async function renderSettings(root) {
  root.innerHTML = '';
  App.tree = await api.get('/api/categories'); // 确保树最新
  App.tags = flattenTags(App.tree);
  const reload = () => renderSettings(root);
  async function act(fn) { try { await fn(); reload(); } catch (e) { toast(e.message); } }

  const cat = document.createElement('div');
  cat.className = 'card';
  cat.innerHTML = `<h2>分类管理</h2>
    <p class="dim" style="margin-bottom:10px">点 ▸ 展开子级；🗑 删除母级会连带其所有子级与对应记录（会先确认）</p>`;
  const addRoot = document.createElement('div');
  addRoot.className = 'row';
  addRoot.innerHTML = `<input type="text" id="nr" placeholder="新增一级领域…"><button class="btn" id="abr">添加</button>`;
  cat.append(addRoot);
  addRoot.querySelector('#abr').onclick = () => act(async () => {
    const name = addRoot.querySelector('#nr').value.trim();
    if (name) await api.post('/api/categories', { name });
  });
  const treeBox = document.createElement('div');
  cat.append(treeBox);
  root.append(cat);

  // Finder 式展开树：原位缩进展开，不需要"进入"
  function nodeRow(n, depth) {
    const kids = n.children || [];
    const opened = renderSettings.opened.has(n.id);
    const row = document.createElement('div');
    row.className = 'cat-node';
    row.style.marginLeft = depth * 22 + 'px';
    const arrow = kids.length
      ? `<button class="mini arrow">${opened ? '▾' : '▸'}</button>`
      : '<span class="mini arrow" style="visibility:hidden">▸</span>';
    row.innerHTML = `
      ${arrow}
      <span class="cicon" style="background:${n.color}"></span>
      <span>${n.level === 1 ? `<button class="mini" title="icon" style="font-size:16px;opacity:1">${n.icon || '➕'}</button> ` : ''}<b>${esc(n.name)}</b> <span class="dim">L${n.level}${kids.length ? ` · ${kids.length} 子级` : ''}</span></span>
      <div class="spacer"></div>
      ${n.level < 3 ? '<button class="mini" title="add">＋子级</button>' : ''}
      <button class="mini" title="rename">✏️</button>
      ${n.level > 1 ? '<button class="mini" title="merge">⇄</button>' : '<button class="mini" style="visibility:hidden">⇄</button>'}
      <button class="mini" title="del">🗑</button>`;
    row.querySelector('.arrow')?.addEventListener('click', () => {
      opened ? renderSettings.opened.delete(n.id) : renderSettings.opened.add(n.id);
      reload();
    });
    row.querySelector('[title=add]')?.addEventListener('click', () => act(async () => {
      const name = prompt(`在「${n.name}」下新增子级名称：`);
      if (name?.trim()) {
        await api.post('/api/categories', { name: name.trim(), parent_id: n.id });
        renderSettings.opened.add(n.id);
      }
    }));
    row.querySelector('[title=icon]')?.addEventListener('click', () => {
      pickEmoji(n.icon || '', async emoji => {
        try { await api.patch('/api/categories/' + n.id, { icon: emoji }); reload(); }
        catch (e) { toast(e.message); }
      });
    });
    row.querySelector('[title=rename]').onclick = () => act(async () => {
      const name = prompt('新名称：', n.name);
      if (name?.trim() && name !== n.name) await api.patch('/api/categories/' + n.id, { name: name.trim() });
    });
    row.querySelector('[title=merge]')?.addEventListener('click', () => act(async () => {
      const sibs = ((n.parent_id ? findParentKids(n) : App.tree) || []).filter(x => x.id !== n.id);
      if (!sibs.length) return toast('没有可合并的同级分类');
      const pick = prompt(`把「${n.name}」合并到（其子级与记录一并迁移）：\n` + sibs.map((s, i) => `${i + 1}. ${s.name}`).join('\n'));
      const t = sibs[+pick - 1];
      if (t) await api.post(`/api/categories/${n.id}/merge`, { target_id: t.id });
    }));
    row.querySelector('[title=del]').onclick = () => act(async () => {
      const size = await api.get(`/api/categories/${n.id}/subtree-size`);
      const msg = size.entries
        ? `删除「${n.name}」将连带删除：\n· ${size.categories} 个分类（含所有子级）\n· ${size.entries} 条活动记录\n\n确定删除？`
        : `删除「${n.name}」（含 ${size.categories - 1} 个子级）？`;
      if (!confirm(msg)) return;
      const r = await api.del('/api/categories/' + n.id);
      toast(`已删除 ${r.deleted.categories} 个分类、${r.deleted.entries} 条记录`);
      for (const id of collectIds(n)) renderSettings.opened.delete(id);
    });
    return row;
  }
  function findParentKids(n) {
    const p = App.tree.find(x => x.id === n.parent_id);
    return p ? (p.children || []) : App.tree;
  }
  function collectIds(n) {
    const out = [n.id];
    for (const c of n.children || []) out.push(...collectIds(c));
    return out;
  }
  function renderNodes(nodes, depth, container) {
    for (const n of nodes) {
      container.append(nodeRow(n, depth));
      if ((n.children || []).length && renderSettings.opened.has(n.id)) {
        renderNodes(n.children, depth + 1, container);
      }
    }
  }
  renderNodes(App.tree, 0, treeBox);
  if (!App.tree.length) treeBox.innerHTML = '<div class="dim">还没有分类</div>';

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
      reload();
    } catch (err) { toast(err.message); }
  };
}
