// 每日时间轴：0:00–24:00 色块分带；仅含有起止时间的记录；空隙留白（口径②）；
// 跨午夜（end<start）拆两段绘制（口径③已保证归属开始日）。
function renderTimeline(entries) {
  const box = document.createElement('div');
  box.className = 'timeline';
  const track = document.createElement('div');
  track.className = 'track';
  box.append(track);
  const base = document.createElement('div');
  base.className = 'baseline';
  box.append(base);
  const timed = entries.filter(e => e.start_time && e.end_time);
  for (const e of timed) {
    const s = hhmm2min(e.start_time), e2 = hhmm2min(e.end_time);
    const spans = e2 >= s ? [[s, e2]] : [[s, 1440], [0, e2]];
    for (const [a, b] of spans) {
      const blk = document.createElement('div');
      blk.className = 'blk';
      blk.style.left = (a / 1440 * 100) + '%';
      blk.style.width = ((b - a) / 1440 * 100) + '%';
      blk.style.setProperty('--c', e.color || '#888');
      track.append(blk);
      // 复刻旭日图交互：hover 自身高亮、其余色块弱化（dim 类）、信息卡出现在块右下角
      const tip = document.createElement('span');
      tip.className = 'tip tl-tip';
      tip.innerHTML = `<b>${esc(e.path[e.path.length - 1])}</b>
        <span class="tip-path">${esc(e.path.join(' › '))}</span>
        <span class="tip-time">${e.start_time}–${e.end_time} · ${fmtDur(e.duration_min)}</span>
        ${e.note ? `<i>“${esc(e.note)}”</i>` : ''}`;
      box.append(tip);
      blk.onmouseenter = () => {
        track.classList.add('dimming');
        blk.classList.add('hovering');
        tip.style.display = 'block';
        // 定位：块右下角（块右端 + 8px，块底缘 + 8px）
        const bw = box.clientWidth || 1;
        const rightPx = (b - a) / 1440 * bw + a / 1440 * bw;
        tip.style.left = Math.min(rightPx + 8, bw - 244) + 'px';
      };
      blk.onmouseleave = () => {
        track.classList.remove('dimming');
        blk.classList.remove('hovering');
        tip.style.display = 'none';
      };
    }
  }
  for (let h = 0; h <= 24; h += 6) {
    const t = document.createElement('span');
    t.className = 'tick';
    t.style.left = (h / 24 * 100) + '%';
    t.textContent = h === 24 ? '24' : h;
    box.append(t);
  }
  if (!timed.length) {
    const hint = document.createElement('span');
    hint.className = 'tick';
    hint.style.left = '0%'; hint.style.transform = 'none'; hint.style.top = '14px';
    hint.textContent = '（为记录填写起止时间后，这里会显示一天的色块分带）';
    box.append(hint);
  }
  return box;
}
