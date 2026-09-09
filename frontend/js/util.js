// 通用工具
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function dateLabel(s) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日 ${WEEK[t.getDay()]}`;
}
function fmtDur(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function parseDur(str) {
  // 支持 "90" / "1h30m" / "1.5h" / "30m"
  str = (str || '').trim().toLowerCase();
  if (!str) return null;
  if (/^\d+$/.test(str)) return +str > 0 && +str <= 1440 ? +str : null;
  let m = str.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m)?$/) || str.match(/^(\d+)m$/);
  if (!m) return null;
  if (str.endsWith('m') && !str.includes('h')) return +m[1] <= 1440 ? +m[1] : null;
  const min = Math.round(+m[1] * 60) + (m[2] ? +m[2] : 0);
  return min > 0 && min <= 1440 ? min : null;
}
function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hhmm2min(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function min2hhmm(m) { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
// 一级大类 emoji 选择器：常用图标网格 + 自由输入（v3.4 前端可编辑图标）
const EMOJI_CHOICES = ['💼','🎮','🚗','🍜','💪','📚','🥂','🧾','🗂','📌','🎯','🌱','🧰','☕','🎲','🧭','🛋','📷','💤','🚶','🏠','✈️','🎵','📺','🧹','🛒','👋','🩺','🏃','📕','🎓','🌐','💻','🎨','⚙️','🌍','🍎','📞','🧘','🎬'];
function pickEmoji(current, onDone) {
  const backdrop = document.createElement('div');
  backdrop.className = 'pop-backdrop';
  const pop = document.createElement('div');
  pop.className = 'state-pop';
  pop.innerHTML = '<h3>选择大类图标</h3>' +
    '<div class="row wrap emoji-grid"></div>' +
    '<div class="row" style="margin-top:12px"><span class="dim">或直接输入</span>' +
    '<input type="text" maxlength="4" style="width:64px;text-align:center" placeholder="🙂">' +
    '<div class="spacer"></div>' +
    '<button class="btn" data-act="clear">清除</button>' +
    '<button class="btn" data-act="cancel">取消</button></div>';
  backdrop.append(pop);
  document.body.append(backdrop);
  const grid = pop.querySelector('.emoji-grid');
  for (const e of EMOJI_CHOICES) {
    const b = document.createElement('button');
    b.className = 'chip emoji' + (e === current ? ' on' : '');
    b.textContent = e;
    b.onclick = () => { close(); onDone(e); };
    grid.append(b);
  }
  const inp = pop.querySelector('input');
  inp.onkeydown = ev => { if (ev.key === 'Enter' && inp.value.trim()) { close(); onDone(inp.value.trim()); } };
  pop.querySelector('[data-act=clear]').onclick = () => { close(); onDone(''); };
  pop.querySelector('[data-act=cancel]').onclick = () => backdrop.remove();
  backdrop.onclick = ev => { if (ev.target === backdrop) backdrop.remove(); };
  function close() { backdrop.remove(); }
}

// 全局统一悬浮提示：固定宽 232px、≤5 行、淡入上浮 150ms（与统计页 tooltip 同一质感）
// 用法：attachTip(el, () => htmlString)  —— 悬停时计算并展示，移开即收起
let _tipEl = null;
function attachTip(el, contentFn) {
  el.addEventListener('mouseenter', () => {
    if (!_tipEl) {
      _tipEl = document.createElement('div');
      _tipEl.className = 'global-tip';
      document.body.append(_tipEl);
    }
    _tipEl.innerHTML = contentFn();
    _tipEl.style.display = 'block';
    const r = el.getBoundingClientRect();
    const tw = _tipEl.offsetWidth, vw = document.documentElement.clientWidth;
    let left = r.left + r.width / 2 - tw / 2;          // 默认以元素中心对齐
    left = Math.max(8, Math.min(left, vw - tw - 8));   // 夹在视口内
    _tipEl.style.left = left + 'px';
    _tipEl.style.top = (r.top - 8) + 'px';
    _tipEl.classList.add('show');
  });
  el.addEventListener('mouseleave', () => {
    if (_tipEl) { _tipEl.classList.remove('show'); _tipEl.style.display = 'none'; }
  });
}

// 把分类树拍平成三级标签列表（含引用），供搜索选择
function flattenTags(tree) {
  const out = [];
  for (const l1 of tree)
    for (const l2 of l1.children || [])
      for (const l3 of l2.children || [])
        out.push({ id: l3.id, name: l3.name,
                   color: l1.color, path: [l1.name, l2.name, l3.name], parent2: l2 });  // v3.3：图标只属于一级
  return out;
}
