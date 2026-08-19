'use strict';

/* ============================================================
   你和我 · 拍立得相册（纯静态版）
   照片放在 photos/ 文件夹里，文件名自带日期和留言，例如：
     2026-08-20 海边散步.jpg
   点击拍立得翻到背面写手写留言；日期显示在正面右下角。
   所有入口收在右上角 ⚙ 设置卡片里。
   ============================================================ */

const CONFIG = {
  repo: '',       // 例如 '你的用户名/our-photos'；留空 = 自动从 GitHub Pages 网址识别
  title: 'You & Me',
  subtitle: '我们的拍立得',
};

(() => {
  const wall = document.getElementById('wall');
  const countEl = document.getElementById('count');
  const gearBtn = document.getElementById('gear-btn');
  const settingsModal = document.getElementById('settings');
  const settingsClose = document.getElementById('settings-close');
  const uploadBtn = document.getElementById('upload-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const tokenInput = document.getElementById('token-input');
  const tokenStatus = document.getElementById('token-status');
  const tokenSave = document.getElementById('token-save');
  const tokenClear = document.getElementById('token-clear');
  const lightbox = document.getElementById('lightbox');
  const toastEl = document.getElementById('toast');

  const LAYOUT_KEY = 'instax-layout-v1';
  const NOTES_KEY = 'instax-notes-v1';
  const TOKEN_KEY = 'instax-token-v1';
  const INFO_CACHE_KEY = 'instax-repo-info';
  const LIST_CACHE_KEY = 'instax-list-cache-v2';

  // 直接双击 index.html 打开（file://）时的内置示例，方便先看效果
  const DEFAULT_SAMPLES = [
    { file: '2026-05-01 第一次约会.svg', note: '第一次约会', date: '2026.05.01' },
    { file: '2026-03-08 生日惊喜.svg', note: '生日惊喜', date: '2026.03.08' },
    { file: '2026-04-20 公园散步.svg', note: '公园散步', date: '2026.04.20' },
    { file: '2026-06-18 一起看日落.svg', note: '一起看日落', date: '2026.06.18' },
    { file: '2026-07-15 海边的风.svg', note: '海边的风', date: '2026.07.15' },
    { file: '2026-08-20 我们的猫.svg', note: '我们的猫', date: '2026.08.20' },
  ];

  let photos = [];
  let layout = loadStorage(LAYOUT_KEY, {});
  let repoInfo = null;          // { repo, branch }
  let repoMetaMap = {};         // GitHub photos.json 里的元数据（按文件名）
  let flippedId = null;         // 当前翻到背面的照片 id
  let currentIndex = -1;
  let toastTimer = null;
  let suppressClick = false;
  let loading = false;

  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadStorage(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function saveStorage(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toast(msg, ms = 3000) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  /* ---------- 仓库识别 ---------- */

  function detectRepo() {
    if (CONFIG.repo) {
      return CONFIG.repo.trim()
        .replace(/^https?:\/\/(www\.)?github\.com\//, '')
        .replace(/\/$/, '');
    }
    if (location.hostname.endsWith('.github.io')) {
      const owner = location.hostname.replace(/\.github\.io$/, '');
      const segs = location.pathname.split('/').filter(Boolean);
      const repo = segs[0] || (owner + '.github.io');
      return owner + '/' + repo;
    }
    return '';
  }

  async function getRepoInfo(force) {
    const repo = detectRepo();
    if (!repo) return null;
    const cached = loadStorage(INFO_CACHE_KEY, null);
    if (!force && cached && cached.repo === repo && Date.now() - cached.t < 10 * 60 * 1000) {
      repoInfo = cached;
      return cached;
    }
    const res = await fetch('https://api.github.com/repos/' + repo, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error('repo-' + res.status);
    const data = await res.json();
    repoInfo = { repo, branch: data.default_branch || 'main', t: Date.now() };
    saveStorage(INFO_CACHE_KEY, repoInfo);
    return repoInfo;
  }

  function pageBase() {
    if (location.hostname.endsWith('.github.io')) {
      const segs = location.pathname.split('/').filter(Boolean);
      return location.origin + (segs.length ? '/' + segs[0] + '/' : '/');
    }
    return './';
  }

  /* ---------- 文件名解析：2026-08-20 海边散步.jpg → 日期 + 留言 ---------- */

  function parseName(name) {
    const base = String(name || '').replace(/\.[^.]*$/, '');
    let date = '';
    let caption = base;
    const m = base.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})[ _\-]*(.*)$/);
    if (m) {
      date = m[1] + '.' + m[2].padStart(2, '0') + '.' + m[3].padStart(2, '0');
      caption = m[4];
    }
    caption = (caption || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { date, note: caption || '我们的回忆' };
  }

  /* ---------- 本地留言 ---------- */

  function localNotes() {
    return loadStorage(NOTES_KEY, {});
  }

  function setLocalOverride(file, meta) {
    const m = localNotes();
    m[file] = meta;
    saveStorage(NOTES_KEY, m);
  }

  function clearLocalOverrides() {
    saveStorage(NOTES_KEY, {});
  }

  /* ---------- GitHub photos.json 读写 ---------- */

  function atobUTF8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  async function fetchRepoMeta(info) {
    const res = await fetch('https://api.github.com/repos/' + info.repo + '/contents/photos.json', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) return { map: {}, sha: null };
    if (!res.ok) throw new Error('meta-' + res.status);
    const d = await res.json();
    let list = [];
    try {
      list = JSON.parse(atobUTF8(d.content));
    } catch {
      list = [];
    }
    const map = {};
    (Array.isArray(list) ? list : []).forEach((e) => {
      if (e && e.file) map[e.file] = e;
    });
    return { map, sha: d.sha };
  }

  async function pushMetaToGitHub() {
    const info = await getRepoInfo(true);
    let sha = null;
    try {
      const rm = await fetchRepoMeta(info);
      sha = rm.sha;
    } catch { sha = null; }

    const entries = photos.map((p) => ({
      file: p.file,
      note: p.note,
      date: p.date,
    }));
    const res = await fetch('https://api.github.com/repos/' + info.repo + '/contents/photos.json', {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + loadStorage(TOKEN_KEY, ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '更新相册留言 / 日期',
        content: toB64(JSON.stringify(entries, null, 2)),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) throw new Error('gh-' + res.status);
    return res.json();
  }

  async function validateToken(t) {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'Bearer ' + t },
    });
    if (!res.ok) throw new Error('token-' + res.status);
    const data = await res.json();
    return data.login || '';
  }

  /* ---------- 照片列表 ---------- */

  async function fetchListing(force) {
    const repo = detectRepo();
    const cached = loadStorage(LIST_CACHE_KEY, null);
    if (!force && cached && cached.repo === repo && cached.list && cached.list.length &&
        Date.now() - cached.t < 5 * 60 * 1000) {
      return cached.list;
    }

    let list = [];
    if (repo) {
      const info = await getRepoInfo(force);
      const res = await fetch('https://api.github.com/repos/' + info.repo + '/contents/photos', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('api-' + res.status);
      const items = await res.json();
      if (!Array.isArray(items)) throw new Error('api-list');
      list = items
        .filter((i) => i.type === 'file' && /\.(jpe?g|png|webp|gif|svg)$/i.test(i.name))
        .map((i) => {
          const { date, note } = parseName(i.name);
          return { id: i.sha, file: i.name, url: i.download_url, date, note };
        });

      // 仓库 photos.json 里的留言/日期（公开仓库可直接读）
      try {
        const rm = await fetchRepoMeta(info);
        repoMetaMap = rm.map;
      } catch {
        repoMetaMap = {};
      }
      list = list.map((e) => {
        const rm = repoMetaMap[e.file] || {};
        return {
          ...e,
          note: rm.note !== undefined ? rm.note : (rm.caption !== undefined ? rm.caption : e.note),
          date: rm.date !== undefined ? rm.date : e.date,
        };
      });
    } else {
      // 本地预览 / 自定义域名：读取 photos.json 清单
      let items2 = null;
      try {
        const res2 = await fetch('photos.json');
        if (res2.ok) items2 = await res2.json();
      } catch { items2 = null; }

      if (!items2) {
        // 直接双击 index.html（file://）时浏览器禁止 fetch，用内置示例顶替
        if (location.protocol === 'file:') items2 = DEFAULT_SAMPLES;
        else throw new Error('no-repo');
      }
      list = (Array.isArray(items2) ? items2 : []).map((p) => {
        const file = p.file || p.name || '';
        const { date, note } = parseName(file);
        return {
          id: file,
          file,
          url: p.url || pageBase() + 'photos/' + file.split('/').map(encodeURIComponent).join('/'),
          date: p.date || date,
          note: p.note || p.caption || note,
        };
      });
    }

    // 本机草稿优先
    const local = localNotes();
    list = list.map((e) => {
      const lo = local[e.file] || {};
      return {
        ...e,
        note: lo.note !== undefined ? lo.note : e.note,
        date: lo.date !== undefined ? lo.date : e.date,
      };
    });

    list.sort((a, b) => (b.date || '0').localeCompare(a.date || '0') || a.file.localeCompare(b.file));
    saveStorage(LIST_CACHE_KEY, { t: Date.now(), repo, list });
    return list;
  }

  /* ---------- 渲染 ---------- */

  function createCard(p, animate) {
    const fig = document.createElement('figure');
    fig.className = 'instax';
    if (animate) fig.classList.add('drop-in');
    fig.dataset.id = p.id;

    const polaroid = document.createElement('div');
    polaroid.className = 'polaroid';

    /* ---- 正面 ---- */
    const front = document.createElement('div');
    front.className = 'face front';

    const wrap = document.createElement('div');
    wrap.className = 'img-wrap';
    const img = document.createElement('img');
    img.src = p.url;
    img.alt = p.note;
    img.loading = 'lazy';
    img.draggable = false;
    img.addEventListener('error', () => {
      wrap.classList.add('err');
      wrap.textContent = '照片加载失败';
    });
    wrap.appendChild(img);
    front.appendChild(wrap);

    const hint = document.createElement('span');
    hint.className = 'strip-hint';
    hint.textContent = '✎ 翻面写留言';
    front.appendChild(hint);

    const dateEl = document.createElement('span');
    dateEl.className = 'cap-date hand';
    dateEl.textContent = p.date || '';
    front.appendChild(dateEl);

    const zoom = document.createElement('button');
    zoom.className = 'zoom-btn';
    zoom.title = '看大图';
    zoom.innerHTML = '🔍';
    zoom.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(p.id);
    });
    front.appendChild(zoom);

    const brand = document.createElement('span');
    brand.className = 'frame-brand';
    brand.textContent = 'instax mini';
    front.appendChild(brand);
    polaroid.appendChild(front);

    /* ---- 背面 ---- */
    const back = document.createElement('div');
    back.className = 'face back';

    const backTop = document.createElement('div');
    backTop.className = 'back-top';
    const flipBtn = document.createElement('button');
    flipBtn.className = 'back-flip';
    flipBtn.textContent = '✕ 翻回正面';
    flipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      flipTo(null);
    });
    const brand2 = document.createElement('span');
    brand2.className = 'back-brand';
    brand2.textContent = 'You & Me';
    backTop.appendChild(flipBtn);
    backTop.appendChild(brand2);
    back.appendChild(backTop);

    const noteView = document.createElement('div');
    noteView.className = 'note-view';
    const noteEl = document.createElement('p');
    noteEl.className = 'back-note hand';
    noteEl.textContent = p.note;
    const dateBack = document.createElement('p');
    dateBack.className = 'back-date hand';
    dateBack.textContent = p.date || '';
    noteView.appendChild(noteEl);
    noteView.appendChild(dateBack);
    back.appendChild(noteView);

    const editor = document.createElement('div');
    editor.className = 'editor hidden';
    const noteInput = document.createElement('textarea');
    noteInput.className = 'note-input hand';
    noteInput.maxLength = 120;
    noteInput.placeholder = '写点什么吧…';
    const dateInput = document.createElement('input');
    dateInput.className = 'date-input hand';
    dateInput.placeholder = '2026.08.20';
    dateInput.maxLength = 20;
    const edActions = document.createElement('div');
    edActions.className = 'editor-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn primary tiny';
    saveBtn.textContent = '保存';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn ghost tiny';
    cancelBtn.textContent = '取消';
    edActions.appendChild(saveBtn);
    edActions.appendChild(cancelBtn);
    editor.appendChild(noteInput);
    editor.appendChild(dateInput);
    editor.appendChild(edActions);
    back.appendChild(editor);

    const backActions = document.createElement('div');
    backActions.className = 'back-actions';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'browse';
    prevBtn.title = '上一张';
    prevBtn.textContent = '‹';
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✏️ 写留言';
    const zoomBtn2 = document.createElement('button');
    zoomBtn2.className = 'zoom-btn2';
    zoomBtn2.textContent = '🔍 大图';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'browse';
    nextBtn.title = '下一张';
    nextBtn.textContent = '›';
    backActions.appendChild(prevBtn);
    backActions.appendChild(editBtn);
    backActions.appendChild(zoomBtn2);
    backActions.appendChild(nextBtn);
    back.appendChild(backActions);

    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); stepBack(-1); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); stepBack(1); });
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEdit(fig); });
    zoomBtn2.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(p.id); });
    saveBtn.addEventListener('click', (e) => { e.stopPropagation(); saveNote(p, fig); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cancelEdit(fig); });

    polaroid.appendChild(back);
    fig.appendChild(polaroid);
    return fig;
  }

  function renderWall(animateIds) {
    wall.innerHTML = '';
    if (!photos.length) {
      wall.style.height = '';
      countEl.textContent = '0';
      wall.innerHTML =
        '<div class="empty">' +
        '<div class="empty-card"><span>📷</span></div>' +
        '<h2>墙上还空空的</h2>' +
        '<p>点右上角 ⚙ 设置里的「上传照片」，把第一张回忆贴上墙吧</p>' +
        '</div>';
      return;
    }

    countEl.textContent = String(photos.length);
    const frag = document.createDocumentFragment();
    for (const p of photos) {
      const fig = createCard(p, animateIds && animateIds.includes(p.id));
      frag.appendChild(fig);
    }
    wall.appendChild(frag);
    ensureLayout();
    applyLayout();
    updateWallHeight();
    syncFlipState();
  }

  function renderError(msg) {
    wall.innerHTML = '';
    wall.style.height = '';
    countEl.textContent = '0';
    wall.innerHTML =
      '<div class="empty">' +
      '<div class="empty-card"><span>🕰️</span></div>' +
      '<h2>照片暂时没找到</h2>' +
      '<p>' + msg + '</p>' +
      '</div>';
  }

  function describeError(err) {
    const m = err && err.message ? String(err.message) : '';
    if (m === 'no-repo') {
      return esc('没有检测到 GitHub 仓库地址。本地预览请用 http://localhost:8790 打开（不要双击 index.html 文件）；正式部署到 GitHub Pages 后会自动识别。');
    }
    if (/^(api|repo|meta)-404/.test(m)) {
      return esc('GitHub 上找不到 photos 文件夹，或仓库是私有的。请确认仓库是 Public，且照片放在 photos 文件夹里。');
    }
    if (/^(api|repo|meta|gh)-4(03|29)/.test(m)) {
      return esc('GitHub API 暂时限流了（免费额度 60 次/小时），等一会儿再点「刷新」就好。');
    }
    if (/^gh-409/.test(m)) {
      return esc('GitHub 上刚被其他设备更新过，刷新后再试一次。');
    }
    return esc('加载照片时出了点问题（' + m + '）。检查网络后点「刷新」再试。');
  }

  /* ---------- 散落摆放 ---------- */

  function ensureLayout() {
    const missing = photos.filter((p) => !layout[p.id]);
    if (!missing.length) return;

    const w = wall.clientWidth || document.body.clientWidth || 900;
    const cols = Math.max(2, Math.min(8, Math.floor(w / 250)));
    const rows = Math.max(1, Math.ceil(photos.length / cols));
    const cellW = w / cols;
    const cellH = 450;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) cells.push({ x: c * cellW, y: r * cellH });
    }
    const order = shuffled(cells).slice(0, missing.length);

    missing.forEach((p, i) => {
      const cell = order[i];
      layout[p.id] = {
        x: Math.round(cell.x + rand(-28, 28)),
        y: Math.round(cell.y + rand(-30, 36)),
        r: Math.round(rand(-6, 6) * 10) / 10,
        w: Math.round(rand(170, 226)),
      };
    });
    saveStorage(LAYOUT_KEY, layout);
  }

  function applyLayout() {
    for (const el of wall.querySelectorAll('.instax')) {
      const pos = layout[el.dataset.id];
      if (!pos) continue;
      el.style.width = pos.w + 'px';
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      el.style.setProperty('--r', pos.r + 'deg');
    }
  }

  function updateWallHeight() {
    let maxBottom = 0;
    for (const p of photos) {
      const pos = layout[p.id];
      if (pos) maxBottom = Math.max(maxBottom, pos.y + pos.w * (86 / 54));
    }
    wall.style.height = Math.round(maxBottom + 90) + 'px';
  }

  function reshuffle() {
    if (!photos.length) return;
    layout = {};
    ensureLayout();
    applyLayout();
    updateWallHeight();
    saveStorage(LAYOUT_KEY, layout);
    toast('重新摆好啦');
  }

  /* ---------- 翻面 ---------- */

  function figById(id) {
    return Array.from(wall.querySelectorAll('.instax')).find((f) => f.dataset.id === id) || null;
  }

  function syncFlipState() {
    for (const fig of wall.querySelectorAll('.instax')) {
      fig.classList.toggle('flipped', fig.dataset.id === flippedId);
      const editor = fig.querySelector('.editor');
      const noteView = fig.querySelector('.note-view');
      if (editor) editor.classList.add('hidden');
      if (noteView) noteView.classList.remove('hidden');
    }
  }

  function flipTo(id) {
    flippedId = id;
    currentIndex = id ? photos.findIndex((p) => p.id === id) : -1;
    syncFlipState();
    if (id) {
      const fig = figById(id);
      if (fig) fig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function stepBack(delta) {
    if (!photos.length) return;
    let idx = flippedId ? photos.findIndex((p) => p.id === flippedId) : currentIndex;
    if (idx === -1) idx = 0;
    idx = (idx + delta + photos.length) % photos.length;
    flipTo(photos[idx].id);
  }

  /* ---------- 编辑留言 ---------- */

  function openEdit(fig) {
    const p = photos.find((x) => x.id === fig.dataset.id);
    if (!p) return;
    fig.querySelector('.note-input').value = p.note;
    fig.querySelector('.date-input').value = p.date || '';
    fig.querySelector('.note-view').classList.add('hidden');
    fig.querySelector('.editor').classList.remove('hidden');
    fig.querySelector('.note-input').focus();
  }

  function cancelEdit(fig) {
    fig.querySelector('.editor').classList.add('hidden');
    fig.querySelector('.note-view').classList.remove('hidden');
  }

  async function saveNote(p, fig) {
    const note = fig.querySelector('.note-input').value.trim() || '我们的回忆';
    const date = fig.querySelector('.date-input').value.trim();
    p.note = note;
    p.date = date;

    fig.querySelector('.back-note').textContent = note;
    fig.querySelector('.back-date').textContent = date;
    fig.querySelector('.cap-date').textContent = date;
    fig.querySelector('.note-input').value = note;
    fig.querySelector('.date-input').value = date;
    cancelEdit(fig);

    const token = loadStorage(TOKEN_KEY, '');
    if (token && repoInfo) {
      try {
        await pushMetaToGitHub();
        clearLocalOverrides();
        toast('已同步到 GitHub，大家都能看到');
      } catch (err) {
        setLocalOverride(p.file, { note, date });
        toast('同步失败（' + (err.message || '') + '），已保存在本机');
      }
    } else {
      setLocalOverride(p.file, { note, date });
      toast('已保存在这台浏览器；在 ⚙ 设置里配置同步后大家都能看到');
    }
  }

  /* ---------- 拖拽摆放 ---------- */

  function initDrag() {
    wall.addEventListener('pointerdown', (e) => {
      const polaroid = e.target.closest('.polaroid');
      if (!polaroid) return;
      const fig = polaroid.closest('.instax');
      const pos = layout[fig.dataset.id];
      if (!pos) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = pos.x;
      const origY = pos.y;
      let moved = false;
      let captured = false;
      const pointerId = e.pointerId;

      fig.style.transition = 'none';

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (moved) {
          if (!captured) {
            captured = true;
            try { polaroid.setPointerCapture(pointerId); } catch { /* ignore */ }
          }
          fig.classList.add('dragging');
          pos.x = origX + dx;
          pos.y = origY + dy;
          fig.style.left = pos.x + 'px';
          fig.style.top = pos.y + 'px';
        }
      };

      const onUp = () => {
        polaroid.removeEventListener('pointermove', onMove);
        polaroid.removeEventListener('pointerup', onUp);
        polaroid.removeEventListener('pointercancel', onUp);
        if (captured) {
          try { polaroid.releasePointerCapture(pointerId); } catch { /* ignore */ }
        }
        fig.style.transition = '';
        fig.classList.remove('dragging');
        if (moved) {
          pos.x = clamp(Math.round(pos.x), 4, Math.max(4, wall.clientWidth - 60));
          pos.y = Math.max(4, Math.round(pos.y));
          fig.style.left = pos.x + 'px';
          fig.style.top = pos.y + 'px';
          saveStorage(LAYOUT_KEY, layout);
          updateWallHeight();
          suppressClick = true;
        } else {
          suppressClick = false;
        }
      };

      polaroid.addEventListener('pointermove', onMove);
      polaroid.addEventListener('pointerup', onUp);
      polaroid.addEventListener('pointercancel', onUp);
    });

    wall.addEventListener('click', (e) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const fig = e.target.closest('.instax');
      if (!fig) return;
      if (e.target.closest('button, textarea, input, a')) return;
      if (fig.classList.contains('flipped')) flipTo(null);
      else flipTo(fig.dataset.id);
    });
  }

  /* ---------- 灯箱 ---------- */

  function openLightbox(id) {
    const idx = photos.findIndex((p) => p.id === id);
    if (idx === -1) return;
    currentIndex = idx;
    renderLightbox();
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function stepLightbox(delta) {
    if (!photos.length) return;
    currentIndex = (currentIndex + delta + photos.length) % photos.length;
    renderLightbox();
  }

  function renderLightbox() {
    const p = photos[currentIndex];
    if (!p) return;
    document.getElementById('lb-img').src = p.url;
    document.getElementById('lb-note').textContent = p.note;
    document.getElementById('lb-date').textContent = p.date || '';
    document.getElementById('lb-index').textContent = (currentIndex + 1) + ' / ' + photos.length;
  }

  /* ---------- 同步设置 ---------- */

  function setTokenStatus(text, cls) {
    tokenStatus.textContent = text;
    tokenStatus.className = 'field-status' + (cls ? ' ' + cls : '');
  }

  async function saveToken() {
    const t = tokenInput.value.trim();
    if (!t) {
      setTokenStatus('先粘贴 Token 再保存', 'bad');
      return;
    }
    tokenSave.disabled = true;
    try {
      const login = await validateToken(t);
      saveStorage(TOKEN_KEY, t);
      setTokenStatus('已连接：' + login + ' ✓', 'ok');
      toast('Token 验证通过，以后保存留言会自动同步到 GitHub');
    } catch (err) {
      setTokenStatus('Token 无效或网络问题（' + (err.message || '') + '）', 'bad');
    } finally {
      tokenSave.disabled = false;
    }
  }

  function clearToken() {
    saveStorage(TOKEN_KEY, '');
    tokenInput.value = '';
    setTokenStatus('未连接');
    toast('已清除本地 Token');
  }

  /* ---------- 事件 ---------- */

  function setUploadLinks() {
    if (!repoInfo) {
      uploadBtn.removeAttribute('href');
      return;
    }
    uploadBtn.href = 'https://github.com/' + repoInfo.repo + '/tree/' + repoInfo.branch + '/photos';
  }

  function openSettings() {
    tokenInput.value = loadStorage(TOKEN_KEY, '');
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  function wireEvents() {
    gearBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });

    shuffleBtn.addEventListener('click', reshuffle);
    refreshBtn.addEventListener('click', () => loadPhotos(true));

    uploadBtn.addEventListener('click', (e) => {
      if (!repoInfo) {
        e.preventDefault();
        toast('先部署到 GitHub Pages，上传按钮就会指向你的 photos 文件夹');
      }
    });

    tokenSave.addEventListener('click', saveToken);
    tokenClear.addEventListener('click', clearToken);

    document.getElementById('lb-close').addEventListener('click', closeLightbox);
    document.getElementById('lb-prev').addEventListener('click', () => stepLightbox(-1));
    document.getElementById('lb-next').addEventListener('click', () => stepLightbox(1));
    document.getElementById('lb-back').addEventListener('click', () => {
      const p = photos[currentIndex];
      closeLightbox();
      if (p) flipTo(p.id);
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!lightbox.classList.contains('hidden')) closeLightbox();
        else if (!settingsModal.classList.contains('hidden')) closeSettings();
        return;
      }
      if (lightbox.classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!photos.length) return;
        const w = wall.clientWidth;
        for (const p of photos) {
          const pos = layout[p.id];
          if (pos) pos.x = clamp(Math.round(pos.x), 4, Math.max(4, w - 60));
        }
        applyLayout();
        updateWallHeight();
      }, 150);
    });
  }

  /* ---------- 启动 ---------- */

  async function loadPhotos(force) {
    if (loading) return;
    loading = true;
    wall.classList.add('loading');
    try {
      photos = await fetchListing(force);
      renderWall(null);
      setUploadLinks();
    } catch (err) {
      console.error(err);
      renderError(describeError(err));
    } finally {
      loading = false;
      wall.classList.remove('loading');
    }
  }

  async function init() {
    wireEvents();
    initDrag();

    const token = loadStorage(TOKEN_KEY, '');
    if (token) {
      validateToken(token)
        .then((login) => setTokenStatus('已连接：' + login + ' ✓', 'ok'))
        .catch(() => setTokenStatus('Token 已失效或网络不可用', 'bad'));
    }

    try {
      repoInfo = await getRepoInfo(false);
    } catch {
      repoInfo = null;
    }
    setUploadLinks();
    await loadPhotos(false);
  }

  init();
})();
