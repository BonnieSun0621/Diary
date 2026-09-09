// 应用入口：hash 路由（today / day/{date} / calendar / stats / settings）
console.log('%c拾光日记 build v3.1 (20260906)%c 若版本不对请 ⌘⇧R 强刷',
  'background:#A3B899;color:#17210f;padding:2px 8px;border-radius:4px;font-weight:600', 'color:#9a978f');
const App = { tree: [], tags: [] };

async function loadCats() {
  App.tree = await api.get('/api/categories');
  App.tags = flattenTags(App.tree);
}

const routes = {
  today: el => renderDayView(el, todayStr()),
  day: (el, arg) => renderDayView(el, arg),
  calendar: el => renderCalendar(el),
  stats: el => renderStats(el),
  settings: el => renderSettings(el),
};

async function route() {
  const hash = location.hash || '#/today';
  const [name, arg] = hash.slice(2).split('/');
  const view = document.getElementById('view');
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === (name === 'day' ? 'today' : name)));
  view.innerHTML = '<div class="dim" style="padding:40px;text-align:center">加载中…</div>';
  try {
    if (!App.tags.length) await loadCats();
    view.innerHTML = '';
    await (routes[name] || routes.today)(view, arg);
  } catch (e) {
    view.innerHTML = '';
    toast('出错了：' + e.message);
    console.error(e);
  }
}

window.addEventListener('hashchange', route);
route();

// ============ 主题切换（深色 / 墨绿纸 / 暖米纸） ============
const THEMES = [
  { id: 'dark',      name: '深色',   dot: '#141519' },
  { id: 'inkpaper',  name: '墨绿纸', dot: '#1b2a24' },
  { id: 'warmpaper', name: '暖米纸', dot: '#f6efe2' },
];
function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem('theme', id);
  document.querySelectorAll('.theme-dot').forEach(d =>
    d.classList.toggle('on', d.dataset.t === id));
}
function initThemeSwitcher() {
  const nav = document.getElementById('nav');
  const box = document.createElement('div');
  box.className = 'theme-box';
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'theme-dot';
    b.dataset.t = t.id;
    b.title = t.name;
    b.style.background = t.dot;
    b.onclick = () => { applyTheme(t.id); route(); };
    box.append(b);
  }
  nav.insertBefore(box, nav.querySelector('.ver'));
  applyTheme(localStorage.getItem('theme') || 'dark');
}
initThemeSwitcher();

// PWA：提示安装到 Dock
if (window.deferredPromptEvent) installHint();
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.deferredPromptEvent = e;
  installHint();
});
function installHint() {
  if (localStorage.getItem('install-hinted') || matchMedia('(display-mode: standalone)').matches) return;
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = '📲 安装到 Dock';
  b.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:50';
  b.onclick = async () => {
    window.deferredPromptEvent?.prompt();
    localStorage.setItem('install-hinted', '1');
    b.remove();
  };
  document.body.append(b);
}
