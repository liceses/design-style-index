// 对 style-ref 站点做真机交互验收：搜索 / 分组 / 排序 / 详情 / 键盘 / hash / 断图 / 主题
// 会拉起一个 Edge headless 实例，跑完自动退出。
// 注意：跑之前/之后都会清理自己这一类残留实例，不会碰你日常的 Edge。
// 用法: node dev/verify-site.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = 'file:///D:/developing/webdesign/style-ref/index.html';
const PORT = 9411;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;

// 只清"自己这一类"实例（带 --headless 或 edge-verify-/edge-cdp- 临时配置目录）
function clearStaleHeadless() {
  try {
    spawnSync('pwsh', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.CommandLine -and ($_.CommandLine -match '--headless' -or $_.CommandLine -match 'edge-verify-' -or $_.CommandLine -match 'edge-cdp-') } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"],
      { stdio: 'ignore' });
  } catch { /* ignore */ }
}
clearStaleHeadless();   // 先清上次残留，避免实例堆积

const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-verify-'));
const edge = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-sync', '--disable-background-networking', '--mute-audio', '--no-sandbox',
  `--user-data-dir=${ud}`,
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1600,1200',
  `--remote-debugging-port=${PORT}`,
  'about:blank',
], { stdio: 'ignore' });

const results = [];
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); };

let ws, send, id = 0;
const pending = new Map();
const logs = [];

async function connect() {
  let ver = null;
  for (let i = 0; i < 100; i++) {
    try { ver = await (await fetch(base + '/json/version')).json(); break; } catch { await sleep(300); }
  }
  if (!ver) throw new Error('CDP 不可达');
  const t = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push('console.error ' + (m.params.args || []).map((a) => a.value).join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      logs.push('log.error ' + m.params.entry.text);
    }
  });
  send = (method, params) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(2600);
  return ver['Browser'];
}

async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval 抛错: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

const SNAP = `(function(){
  var imgs = Array.prototype.slice.call(document.images);
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    cards: document.querySelectorAll('.card').length,
    firstEn: (document.querySelector('.card .card__en')||{}).textContent || null,
    counts: (document.getElementById('count')||{}).textContent || '',
    broken: imgs.filter(function(i){return i.complete && i.naturalWidth===0}).map(function(i){return i.getAttribute('src')}),
    detailHidden: document.getElementById('detail').hidden,
    dTitle: document.getElementById('dTitle').textContent,
    dImgs: document.querySelectorAll('#dMedia img').length,
    hash: location.hash,
    sort: document.getElementById('sortBtn').textContent,
    refBadges: document.querySelectorAll('.card__badge--r').length,
    refExpected: (window.STYLE_DATA.styles.filter(function(s){return s.ref})).length,
    dImgsExpected: (function(){var h=location.hash.slice(1);var st=window.STYLE_DATA.styles.filter(function(x){return x.slug===h})[0];return st?(st.ref?2:1):null})(),
    refCaption: (function(){var c=document.querySelectorAll('#dMedia figcaption');return c.length?c[c.length-1].textContent:''})(),
    sayHidden: document.getElementById('dSay').hidden,
    sayText: (document.getElementById('dSayText')||{}).textContent || '',
    sayFrom: (document.getElementById('dSayFrom')||{}).textContent || '',
    origin: (document.getElementById('dOrigin')||{}).textContent || '',
    usage: (document.getElementById('dUsage')||{}).textContent || '',
    tips: document.querySelectorAll('#dTips li').length
  };
})()`;

const THEME_PROBE = `(function(){
  function parse(s){
    s = (s||'').trim();
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }
    var m = s.match(/[\\d.]+/g);
    return m ? m.slice(0,3).map(Number) : null;
  }
  function lin(v){ v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
  function lum(c){ return 0.2126*lin(c[0]) + 0.7152*lin(c[1]) + 0.0722*lin(c[2]); }
  function ratio(a,b){ var l1=lum(a), l2=lum(b); if (l1<l2){ var t=l1; l1=l2; l2=t; } return (l1+0.05)/(l2+0.05); }
  var cs = getComputedStyle(document.documentElement);
  var v = function(k){ return cs.getPropertyValue(k); };
  var bg = parse(v('--bg')), ink = parse(v('--ink')), ink2 = parse(v('--ink2')), muted = parse(v('--muted'));
  var card = document.querySelector('.card');
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bgVar: v('--bg').trim(),
    rInk: +ratio(ink,bg).toFixed(2),
    rInk2: +ratio(ink2,bg).toFixed(2),
    rMuted: +ratio(muted,bg).toFixed(2),
    cardTintLight: card ? card.style.getPropertyValue('--tint-light') : '',
    cardAccentInk: card ? card.style.getPropertyValue('--accent-ink') : '',
    btnText: (document.getElementById('themeBtn')||{}).textContent
  };
})()`;

async function main() {
  const browser = await connect();
  console.log('browser: ' + browser);

  // 0. 主题：初始 / 切换 / 持久化 / 对比度
  let th = await ev(THEME_PROBE);
  const initial = th.theme;
  ok('初始主题已确定（跟随系统）', initial === 'light' || initial === 'dark', 'theme=' + initial);
  ok('卡片带浅色主题用的派生色', /^#/.test(th.cardTintLight) && /^#/.test(th.cardAccentInk),
    'tintLight=' + th.cardTintLight + ' accentInk=' + th.cardAccentInk);

  await ev(`document.getElementById('themeBtn').click()`);
  await sleep(320);
  const flipped = await ev(THEME_PROBE);
  ok('点击按钮切换主题', flipped.theme !== initial, initial + ' -> ' + flipped.theme);
  ok('切换后按钮文案跟着变', /浅色|深色/.test(flipped.btnText), flipped.btnText);
  ok('切换后配色变量确实变了', flipped.bgVar !== th.bgVar, th.bgVar + ' -> ' + flipped.bgVar);

  for (const t of ['dark', 'light']) {
    await ev(`document.documentElement.setAttribute('data-theme','${t}')`);
    await sleep(140);
    const c = await ev(THEME_PROBE);
    ok(`${t} 主题：正文对比度 ≥ 7`, c.rInk >= 7, 'ratio=' + c.rInk);
    ok(`${t} 主题：次级文字对比度 ≥ 4.5`, c.rInk2 >= 4.5, 'ratio=' + c.rInk2);
    ok(`${t} 主题：辅助文字对比度 ≥ 4`, c.rMuted >= 4, 'ratio=' + c.rMuted);
  }

  // 持久化：写回手动选择后重载
  await ev(`try{localStorage.setItem('styleref.theme','light')}catch(e){}`);
  await send('Page.reload', { ignoreCache: false });
  await sleep(2400);
  th = await ev(THEME_PROBE);
  ok('手动选择能持久化（重载后仍是 light）', th.theme === 'light', 'theme=' + th.theme);
  await ev(`try{localStorage.setItem('styleref.theme','dark')}catch(e){}`);
  await send('Page.reload', { ignoreCache: false });
  await sleep(2400);
  th = await ev(THEME_PROBE);
  ok('深色选择同样持久化', th.theme === 'dark', 'theme=' + th.theme);

  // 1. 首屏
  let s = await ev(SNAP);
  ok('首屏渲染 41 张卡片', s.cards === 41, 'cards=' + s.cards);
  ok('首屏无断图', s.broken.length === 0, JSON.stringify(s.broken.slice(0, 4)));
  ok('计数文案正确', /全部 41 种/.test(s.counts), s.counts);
  ok('详情层默认关闭', s.detailHidden === true, 'hidden=' + s.detailHidden);
  ok('「参考图 +1」角标数 = 有补充图的风格数',
    s.refBadges === s.refExpected && s.refExpected > 0,
    'badges=' + s.refBadges + ' expected=' + s.refExpected);

  // 2. 搜索
  await ev(`(function(){var i=document.getElementById('q');i.value='bauh';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  s = await ev(SNAP);
  ok('搜索 "bauh" 命中 1 种', s.cards === 1 && s.firstEn === 'Bauhaus', 'cards=' + s.cards + ' first=' + s.firstEn);

  await ev(`(function(){var i=document.getElementById('q');i.value='像素';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  s = await ev(SNAP);
  ok('中文搜索 "像素" 命中 Pixel Art', s.cards === 1 && s.firstEn === 'Pixel Art', 'cards=' + s.cards + ' first=' + s.firstEn);

  await ev(`(function(){document.getElementById('qClear').click();})()`);
  s = await ev(SNAP);
  ok('清空搜索恢复 41 种', s.cards === 41, 'cards=' + s.cards);

  // 3. 分组筛选
  await ev(`(function(){Array.prototype.find.call(document.querySelectorAll('#chips .chip'),function(c){return c.textContent.indexOf('数字与街头')===0}).click();})()`);
  s = await ev(SNAP);
  ok('分组「数字与街头」= 7 种', s.cards === 7, 'cards=' + s.cards);
  await ev(`(function(){document.querySelector('#chips .chip').click();})()`);
  s = await ev(SNAP);
  ok('回到「全部」= 41 种', s.cards === 41, 'cards=' + s.cards);

  // 4. 排序
  await ev(`document.getElementById('sortBtn').click()`);
  s = await ev(SNAP);
  ok('排序切到名称 A–Z 且首项为 3x3 Grid', s.sort === '名称 A–Z' && s.firstEn === '3x3 Grid', 'sort=' + s.sort + ' first=' + s.firstEn);
  await ev(`document.getElementById('sortBtn').click()`);
  await ev(`document.getElementById('sortBtn').click()`);
  s = await ev(SNAP);
  ok('排序循环回视频顺序', s.sort === '视频顺序' && s.firstEn === 'Neoclassical', 'sort=' + s.sort + ' first=' + s.firstEn);

  // 5. 详情：点击打开
  await ev(`document.querySelector('.card').click()`);
  await sleep(220);
  s = await ev(SNAP);
  ok('点卡片打开详情', s.detailHidden === false && s.dTitle === 'Neoclassical', 'hidden=' + s.detailHidden + ' title=' + s.dTitle);
  ok('详情图片数 = 1(视频帧) + 是否有补充图', s.dImgs === s.dImgsExpected, 'dImgs=' + s.dImgs + ' expected=' + s.dImgsExpected);
  ok('详情无断图', s.broken.length === 0, JSON.stringify(s.broken.slice(0, 4)));
  ok('hash 同步为 #neoclassical', s.hash === '#neoclassical', s.hash);

  // 5a. 字幕提炼的内容是否渲染出来
  ok('详情显示「创作者原话」', s.sayHidden === false && s.sayText.length > 15, 'hidden=' + s.sayHidden + ' len=' + s.sayText.length);
  ok('原话带时间码出处', /创作者原话/.test(s.sayFrom) && /\d\d:\d\d/.test(s.sayFrom), s.sayFrom);
  ok('详情显示「来源」与「今天用在哪」', s.origin.length > 5 && s.usage.length > 5, 'origin=' + s.origin.slice(0, 20) + ' usage=' + s.usage.slice(0, 20));
  ok('详情显示提示条目', s.tips >= 1, 'tips=' + s.tips);

  // 5b. 有补充图的风格：两张图 + 署名信息
  await ev(`location.hash='#victorian'`);
  await sleep(600);
  s = await ev(SNAP);
  ok('victorian 详情展开 2 张图（视频帧 + 补充图）', s.dImgs === 2, 'dImgs=' + s.dImgs);
  ok('补充图已附署名/许可', /公开版权参考图/.test(s.refCaption) && /CC|Public domain|CC0/i.test(s.refCaption),
    s.refCaption.slice(0, 140));
  ok('补充图无断图', s.broken.length === 0, JSON.stringify(s.broken.slice(0, 4)));
  // 回到 neoclassical 继续做键盘测试
  await ev(`location.hash='#neoclassical'`);
  await sleep(320);

  // 6. 键盘右箭头翻下一个
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(220);
  s = await ev(SNAP);
  ok('→ 翻到下一种 Baroque', s.dTitle === 'Baroque', 'title=' + s.dTitle);

  // 7. 键盘左箭头翻回
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await sleep(220);
  s = await ev(SNAP);
  ok('← 翻回 Neoclassical', s.dTitle === 'Neoclassical', 'title=' + s.dTitle);

  // 8. Esc 关闭
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(220);
  s = await ev(SNAP);
  ok('Esc 关闭详情并清掉 hash', s.detailHidden === true && s.hash === '', 'hidden=' + s.detailHidden + ' hash=' + s.hash);

  // 9. hash 直达
  await ev(`location.hash='#vaporwave'`);
  await sleep(320);
  s = await ev(SNAP);
  ok('hash 直达 #vaporwave', s.detailHidden === false && s.dTitle === 'Vaporwave', 'title=' + s.dTitle);

  // 10. 随机按钮
  await ev(`document.getElementById('detail').querySelector('[data-close]').click()`);
  await sleep(150);
  await ev(`document.getElementById('randBtn').click()`);
  await sleep(250);
  s = await ev(SNAP);
  ok('随机按钮能打开某种风格', s.detailHidden === false && s.dTitle.length > 0, 'title=' + s.dTitle);

  // 11. 复制按钮不报错
  await ev(`document.getElementById('detail').querySelector('.detail__close').click()`);
  await sleep(120);
  await ev(`document.getElementById('randBtn').click()`);
  await sleep(200);
  const before = logs.length;
  await ev(`document.getElementById('copyBtn').click()`);
  await sleep(320);
  s = await ev(SNAP);
  ok('复制要点未抛异常', logs.length === before, logs.slice(before).join(' | ') || 'ok');

  // 12. 控制台干净
  ok('全程无 console.error / 异常', logs.length === 0, logs.slice(0, 4).join(' | ') || 'clean');

  console.log('\n=== 验收结果 ===');
  let fail = 0;
  for (const r of results) {
    if (!r.pass) fail++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '   << ' + (r.detail || '')}`);
  }
  console.log(`\n${results.length - fail}/${results.length} 通过`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => { console.error('ERR ' + (e && e.stack || e)); process.exitCode = 2; })
  .finally(async () => {
    try { ws && ws.close(); } catch {}
    edge.kill('SIGKILL');
    await sleep(400);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch {}
    clearStaleHeadless();   // 兜底：确保不留孤儿进程
  });
