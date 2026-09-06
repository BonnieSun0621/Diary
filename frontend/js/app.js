// 应用入口：hash 路由（today / day/{date} / calendar / stats / settings）
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
