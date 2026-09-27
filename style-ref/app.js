/* 40 种设计风格 · 参考图鉴 —— 交互层
   纯原生 JS，无依赖、无构建；数据来自同目录 data.js */
(function () {
  'use strict';

  var D = window.STYLE_DATA;
  if (!D || !D.styles) {
    document.getElementById('grid').innerHTML =
      '<p style="padding:20px 0;color:#82828e">数据未加载：请确认 data.js 与本页在同一目录。</p>';
    return;
  }

  var STYLES = D.styles;
  var GROUPS = D.groups;
  var GNAME = {};
  GROUPS.forEach(function (g) { GNAME[g.id] = g; });

  var state = { q: '', group: 'all', sort: 'video', view: [] };
  var current = -1;

  var $ = function (id) { return document.getElementById(id); };
  var grid = $('grid'), chips = $('chips'), qInput = $('q'), qClear = $('qClear');
  var countEl = $('count'), emptyEl = $('empty'), statsEl = $('stats');
  var detail = $('detail'), dMedia = $('dMedia'), dN = $('dN'), dGroup = $('dGroup');
  var dTitle = $('dTitle'), dZh = $('dZh'), dDesc = $('dDesc'), dTraits = $('dTraits');
  var dLinks = $('dLinks'), videoBtn = $('videoBtn'), copyBtn = $('copyBtn');
  var dSay = $('dSay'), dSayText = $('dSayText'), dSayFrom = $('dSayFrom');
  var dFacts = $('dFacts'), dOriginRow = $('dOriginRow'), dUsageRow = $('dUsageRow');
  var dOrigin = $('dOrigin'), dUsage = $('dUsage'), dTips = $('dTips');
  var prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), prevName = $('prevName'), nextName = $('nextName');
  var toastEl = $('toast'), sortBtn = $('sortBtn'), randBtn = $('randBtn');
  var themeBtn = $('themeBtn');

  /* ---------------- 主题（浅色 / 深色） ---------------- */
  var THEME_KEY = 'styleref.theme';
  var mq = null;
  try { mq = window.matchMedia('(prefers-color-scheme: light)'); } catch (e) {}

  function storedTheme() {
    try {
      var v = localStorage.getItem(THEME_KEY);
      return (v === 'light' || v === 'dark') ? v : null;
    } catch (e) { return null; }
  }
  function systemTheme() {
    try { return mq && mq.matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function paintThemeBtn() {
    var light = currentTheme() === 'light';
    themeBtn.innerHTML = light ? '<i>☀</i>浅色' : '<i>☾</i>深色';
    themeBtn.setAttribute('aria-label', light ? '当前浅色模式，点击切换到深色' : '当前深色模式，点击切换到浅色');
    themeBtn.title = (light ? '当前：浅色' : '当前：深色') + '（首次打开跟随系统）';
  }
  function applyTheme(t, persist) {
    document.documentElement.setAttribute('data-theme', t);
    if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
    paintThemeBtn();
  }
  themeBtn.addEventListener('click', function () {
    var next = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
    toast(next === 'light' ? '已切换到浅色模式' : '已切换到深色模式');
  });
  // 没手动选过时，跟着系统变
  if (mq) {
    var onSys = function () { if (!storedTheme()) applyTheme(systemTheme(), false); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }
  applyTheme(currentTheme(), false);

  /* ---------------- 工具 ---------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toastEl.classList.remove('show');
      setTimeout(function () { toastEl.hidden = true; }, 320);
    }, 1700);
  }

  /* ---------------- 顶部信息 ---------------- */
  (function initHead() {
    var v = D.video;
    $('videoLink').href = v.url;
    $('videoLink2').href = v.url;
    document.title = STYLES.length + ' 种设计风格 · 参考图鉴';

    var refCount = STYLES.filter(function (s) { return s.ref; }).length;
    var main = STYLES.filter(function (s) { return s.group !== 'bonus'; }).length;
    var bonus = STYLES.length - main;

    var items = [
      ['风格', main + (bonus ? ' + ' + bonus : '')],
      ['分组', String(GROUPS.filter(function (g) { return g.id !== 'bonus'; }).length)],
      ['视频原帧', String(STYLES.length)],
      ['参考图', refCount ? '+' + refCount : '—']
    ];
    statsEl.innerHTML = items.map(function (it) {
      return '<div><dt>' + esc(it[0]) + '</dt><dd>' + esc(it[1]) + '</dd></div>';
    }).join('');
    $('refStat').textContent = refCount
      ? '，另有 ' + refCount + ' 张 Wikimedia Commons 公开版权参考图'
      : '';
  })();

  /* ---------------- 筛选 ---------------- */
  function matches(s) {
    if (state.group !== 'all' && s.group !== state.group) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [s.en, s.zh, s.slug, s.desc, s.videoName || '', (s.traits || []).join(' ')].join(' ').toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function computeView() {
    var list = STYLES.filter(matches);
    if (state.sort === 'name') {
      list = list.slice().sort(function (a, b) { return a.en.toLowerCase() < b.en.toLowerCase() ? -1 : 1; });
    } else if (state.sort === 'group') {
      var order = {};
      GROUPS.forEach(function (g, i) { order[g.id] = i; });
      list = list.slice().sort(function (a, b) {
        return (order[a.group] - order[b.group]) || (a.n - b.n);
      });
    }
    state.view = list;
    return list;
  }

  /* ---------------- 卡片 ---------------- */
  function card(s) {
    var b = el('button', 'card');
    b.type = 'button';
    b.dataset.slug = s.slug;
    b.style.setProperty('--accent', s.accent);
    b.style.setProperty('--accent-ink', s.accentInk || s.accent);
    b.style.setProperty('--tint', s.tint);
    b.style.setProperty('--tint-light', s.tintLight || s.tint);
    b.setAttribute('aria-label', s.en + ' ' + s.zh + '，查看详情');

    var fig = el('div', 'card__fig');
    var img = el('img');
    img.src = s.thumb;
    img.alt = s.en + '（' + s.zh + '）风格示例，截取自来源视频 ' + s.tc;
    img.loading = 'lazy';
    img.width = 480; img.height = 270;
    fig.appendChild(img);

    var n = el('span', 'card__n', String(s.n).padStart(2, '0'));
    var g = el('span', 'card__grp', (GNAME[s.group] || {}).zh || '');
    var badge = el('span', 'card__badge', '视频 ' + s.tc);
    fig.appendChild(n); fig.appendChild(g); fig.appendChild(badge);
    if (s.ref) {
      var r = el('span', 'card__badge card__badge--r', '参考图 +1');
      fig.appendChild(r);
    }
    b.appendChild(fig);

    var head = el('div', 'card__head');
    head.appendChild(el('span', 'card__en', s.en));
    head.appendChild(el('span', 'card__zh', s.zh));
    b.appendChild(head);

    var ul = el('ul', 'card__traits');
    (s.traits || []).slice(0, 4).forEach(function (t) { ul.appendChild(el('li', null, t)); });
    b.appendChild(ul);

    b.addEventListener('click', function () { open(s.slug, true); });
    return b;
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = Number(e.target.dataset.i || 0);
      e.target.style.transitionDelay = (i % 6) * 45 + 'ms';
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;

  function render() {
    var list = computeView();
    grid.innerHTML = '';
    var frag = document.createDocumentFragment();
    list.forEach(function (s, i) {
      var c = card(s);
      c.dataset.i = i;
      if (!io) c.classList.add('in');
      frag.appendChild(c);
    });
    grid.appendChild(frag);
    if (io) Array.prototype.forEach.call(grid.children, function (c) { io.observe(c); });

    countEl.textContent = state.q || state.group !== 'all'
      ? '筛选出 ' + list.length + ' / ' + STYLES.length + ' 种'
      : '全部 ' + list.length + ' 种 · 按' + ({ video: '视频顺序', name: '名称', group: '分组' })[state.sort] + '排列';
    emptyEl.hidden = list.length > 0;
  }

  /* ---------------- 分组筛选条 ---------------- */
  function renderChips() {
    chips.innerHTML = '';
    var all = el('button', 'chip');
    all.type = 'button';
    all.setAttribute('aria-pressed', String(state.group === 'all'));
    all.innerHTML = '全部<b>' + STYLES.length + '</b>';
    all.addEventListener('click', function () { state.group = 'all'; syncChips(); render(); });
    chips.appendChild(all);

    GROUPS.forEach(function (g) {
      var c = STYLES.filter(function (s) { return s.group === g.id; }).length;
      if (!c) return;
      var b = el('button', 'chip');
      b.type = 'button';
      b.dataset.g = g.id;
      b.setAttribute('aria-pressed', String(state.group === g.id));
      b.innerHTML = esc(g.zh) + '<b>' + c + '</b>';
      b.title = g.desc || '';
      b.addEventListener('click', function () { state.group = g.id; syncChips(); render(); });
      chips.appendChild(b);
    });
  }
  function syncChips() {
    Array.prototype.forEach.call(chips.children, function (b) {
      var id = b.dataset.g || 'all';
      b.setAttribute('aria-pressed', String(state.group === id));
    });
  }

  /* ---------------- 详情 ---------------- */
  function figFor(s) {
    var fig = el('figure', 'detail__fig');
    var a = el('a');
    a.href = s.img; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.title = '在新标签页打开原图';
    var img = el('img');
    img.src = s.img;
    img.alt = s.en + '（' + s.zh + '）示例，来源视频 ' + s.tc;
    a.appendChild(img);
    fig.appendChild(a);

    var cap = el('figcaption');
    cap.innerHTML = '<b>视频原帧</b> · ' + esc(s.tc) +
      (s.videoName ? ' · 标题卡写作 “' + esc(s.videoName) + '”' : '') +
      ' · 480P 截图';
    fig.appendChild(cap);
    return fig;
  }

  function refFig(s) {
    var r = s.ref;
    var fig = el('figure', 'detail__fig');
    var a = el('a');
    a.href = r.img; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.title = '在新标签页打开原图';
    var img = el('img');
    img.src = r.img;
    img.alt = s.en + ' 的公开版权参考图：' + (r.title || '');
    img.loading = 'lazy';
    a.appendChild(img);
    fig.appendChild(a);

    var cap = el('figcaption');
    var parts = ['<b>公开版权参考图</b>'];
    if (r.title) parts.push(esc(r.title));
    if (r.artist) parts.push(esc(r.artist));
    if (r.license) {
      parts.push(r.licenseUrl
        ? '<a href="' + esc(r.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(r.license) + '</a>'
        : esc(r.license));
    }
    if (r.page) parts.push('<a href="' + esc(r.page) + '" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>');
    cap.innerHTML = parts.join(' · ');
    fig.appendChild(cap);
    return fig;
  }

  function open(slug, push) {
    var i = -1;
    for (var k = 0; k < state.view.length; k++) if (state.view[k].slug === slug) { i = k; break; }
    if (i < 0) { for (var j = 0; j < STYLES.length; j++) if (STYLES[j].slug === slug) { state.view = STYLES.slice(); i = j; break; } }
    if (i < 0) return;
    current = i;
    var s = state.view[i];

    dMedia.innerHTML = '';
    dMedia.appendChild(figFor(s));
    if (s.ref) dMedia.appendChild(refFig(s));

    dN.textContent = String(s.n).padStart(2, '0');
    dGroup.textContent = ((GNAME[s.group] || {}).zh || '') + ' · ' + s.tc;
    dTitle.textContent = s.en;
    dZh.textContent = s.zh;
    dDesc.textContent = s.desc;

    // 来自视频上传者自制中文字幕的内容
    if (s.say) {
      dSayText.textContent = s.say;
      dSayFrom.innerHTML = '创作者原话 · 视频 ' + esc(s.sayAt || s.tc) +
        ' <a href="' + esc(s.videoUrl) + '" target="_blank" rel="noopener noreferrer">听这一句 ↗</a>';
      dSay.hidden = false;
    } else {
      dSay.hidden = true;
    }

    dOrigin.textContent = s.origin || '';
    dUsage.textContent = s.usage || '';
    dOriginRow.hidden = !s.origin;
    dUsageRow.hidden = !s.usage;
    dFacts.hidden = !(s.origin || s.usage);

    dTips.innerHTML = '';
    (s.tips || []).forEach(function (t) { dTips.appendChild(el('li', null, t)); });
    dTips.hidden = !(s.tips && s.tips.length);

    dTraits.innerHTML = '';
    (s.traits || []).forEach(function (t) { dTraits.appendChild(el('li', null, t)); });

    dLinks.innerHTML = '';
    if (s.ref) {
      var p = el('p');
      p.innerHTML = '补充图来源：<a href="' + esc(s.ref.page || '#') + '" target="_blank" rel="noopener noreferrer">' +
        esc(s.ref.title || 'Wikimedia Commons') + '</a>';
      dLinks.appendChild(p);
    }

    videoBtn.href = s.videoUrl;

    var prev = state.view[(i - 1 + state.view.length) % state.view.length];
    var next = state.view[(i + 1) % state.view.length];
    prevName.textContent = prev.en;
    nextName.textContent = next.en;
    prevBtn.onclick = function () { open(prev.slug, true); };
    nextBtn.onclick = function () { open(next.slug, true); };

    var panel = $('dPanel');
    panel.style.setProperty('--accent', s.accent);
    panel.style.setProperty('--accent-ink', s.accentInk || s.accent);

    if (detail.hidden) {
      detail.hidden = false;
      document.body.style.overflow = 'hidden';
      lastFocus = document.activeElement;
      setTimeout(function () { panel.scrollTop = 0; }, 0);
      $('detail').querySelector('.detail__close').focus({ preventScroll: true });
    } else {
      panel.scrollTop = 0;
    }
    if (push) history.replaceState(null, '', '#' + s.slug);
  }

  var lastFocus = null;
  function close() {
    if (detail.hidden) return;
    detail.hidden = true;
    document.body.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function step(d) {
    if (detail.hidden || !state.view.length) return;
    var s = state.view[(current + d + state.view.length) % state.view.length];
    open(s.slug, true);
  }

  /* ---------------- 事件 ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (n) {
    n.addEventListener('click', close);
  });

  qInput.addEventListener('input', function () {
    state.q = qInput.value;
    qClear.hidden = !state.q;
    render();
  });
  qClear.addEventListener('click', function () {
    qInput.value = ''; state.q = ''; qClear.hidden = true; qInput.focus(); render();
  });

  sortBtn.addEventListener('click', function () {
    state.sort = state.sort === 'video' ? 'name' : state.sort === 'name' ? 'group' : 'video';
    sortBtn.textContent = { video: '视频顺序', name: '名称 A–Z', group: '按分组' }[state.sort];
    render();
  });

  randBtn.addEventListener('click', function () {
    var pool = state.view.length ? state.view : STYLES;
    open(pool[Math.floor(Math.random() * pool.length)].slug, true);
  });

  copyBtn.addEventListener('click', function () {
    var s = state.view[current];
    if (!s) return;
    var parts = [s.en + ' / ' + s.zh];
    parts.push('特征：' + (s.traits || []).join('、'));
    parts.push(s.desc);
    if (s.say) parts.push('原话（' + (s.sayAt || s.tc) + '）：' + s.say);
    if (s.usage) parts.push('今天用在哪：' + s.usage);
    if (s.origin) parts.push('来源：' + s.origin);
    if (s.tips && s.tips.length) parts.push('提示：' + s.tips.join('；'));
    parts.push('出处：' + s.videoUrl);
    var line = parts.join('\n');
    var done = function () { toast('已复制：' + s.en); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(line).then(done, function () { fallbackCopy(line, done); });
    } else fallbackCopy(line, done);
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
    if (e.key === 'Escape' && !detail.hidden) { close(); return; }
    if (!detail.hidden) {
      if (e.key === 'ArrowLeft') { step(-1); return; }
      if (e.key === 'ArrowRight') { step(1); return; }
      return;
    }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); qInput.focus(); }
  });

  window.addEventListener('hashchange', function () {
    var slug = location.hash.replace(/^#/, '');
    if (!slug) { close(); return; }
    if (detail.hidden || !state.view[current] || state.view[current].slug !== slug) open(slug, false);
  });

  /* ---------------- 启动 ---------------- */
  renderChips();
  render();
  var startSlug = location.hash.replace(/^#/, '');
  if (startSlug) open(startSlug, false);
})();
