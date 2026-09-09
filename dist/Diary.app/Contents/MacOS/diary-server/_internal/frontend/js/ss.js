// 可搜索下拉：输入即过滤现有选项，点击选择；输入的内容与当前级别所有选项都不同
// 时回车 = 自动新建（一级挂根 / 二级挂已选一级 / 三级挂已选二级）。需求 v3-R1。
function SearchSelect({ level, placeholder, getOptions, onPick, getCreateParent }) {
  const box = document.createElement('div');
  box.className = 'picker ss';
  box.innerHTML = `
    <input type="text" placeholder="${placeholder}" autocomplete="off">
    <div class="picker-pop" hidden></div>`;
  const input = box.querySelector('input'), pop = box.querySelector('.picker-pop');
  let items = [], picked = null;

  const display = it => (it ? it.text : '');  // v3.3：图标只在一级下拉的选项前显示，回显纯名称
  const setValue = v => { picked = v; const it = items.find(x => x.id === v); input.value = display(it); };
  const close = () => { pop.hidden = true; };
  const open = () => {
    items = getOptions() || [];
    const kw = input.value.trim().toLowerCase();
    const exact = items.some(t => t.text.toLowerCase() === input.value.trim());
    const hits = kw ? items.filter(t => t.text.toLowerCase().includes(kw) || t.path.join(' ').toLowerCase().includes(kw)) : items;
    pop.innerHTML = '';
    const addOpt = (icon, label, sub, fn) => {
      const o = document.createElement('div');
      o.className = 'opt';
      o.innerHTML = `<span>${icon}</span><span>${esc(label)}</span><span class="dim" style="margin-left:auto">${esc(sub || '')}</span>`;
      o.onmousedown = e => { e.preventDefault(); fn(); };
      pop.append(o);
    };
    for (const t of hits.slice(0, 40))
      // v3.3：一级选项带大类图标，二/三级纯名称（数据里 icon 仅一级有）
      addOpt(t.icon || '', t.name, t.path.slice(0, -1).join(' › '), () => { setValue(t.id); close(); onPick(t.id); });
    if (kw && !exact)
      addOpt('＋', `新建「${input.value.trim()}」`, '回车确认', () => doCreate(input.value.trim()));
    if (!pop.children.length) { close(); return; }
    pop.hidden = false;
  };
  async function doCreate(name) {
    name = name.trim();
    if (!name) return;
    const hit = items.find(t => t.name === name);
    if (hit) { setValue(hit.id); close(); onPick(hit.id); return; } // 同名 = 选中已有
    const parent_id = level > 1 ? (getCreateParent ? getCreateParent() : null) : null;
    if (level > 1 && parent_id == null) { toast('请先选择上一级'); return; }
    try {
      const node = await api.post('/api/categories', { name, parent_id });
      App.tree = await api.get('/api/categories');
      App.tags = flattenTags(App.tree);
      items = getOptions();
      setValue(node.id);
      close();
      onPick(node.id, true);
      toast(`已新建「${name}」`);
    } catch (e) { toast(e.message); }
  }
  input.oninput = () => { picked = null; open(); };
  input.onfocus = open;
  input.onblur = () => setTimeout(() => {
    close();
    // 离开时若输入了未确认的内容：清空并向上传播"取消选择"，保持级联一致
    if (picked == null && input.value.trim() !== '') { input.value = ''; onPick(null); }
  }, 120);
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (picked != null) onPick(picked);
      else doCreate(input.value);
    }
  };
  box.setValue = setValue;
  box.reset = () => setValue(null);
  box.refresh = () => { items = getOptions(); const it = items.find(x => x.id === picked); input.value = display(it); };
  box.enable = on => {
    input.disabled = !on;
    box.classList.toggle('off', !on);
    input.placeholder = on ? placeholder : '先选上一级';
    if (!on) setValue(null);
  };
  return box;
}
