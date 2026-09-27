// 等我开的那个 Edge 窗口登录后，抓该视频的字幕；抓完自己关窗口 + 删配置目录。
// 用法: node dev/subtitle-via-cdp.mjs [--wait] [--timeout 秒] [port] [profileDir]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const BVID = 'BV1anQwYZEw2';
const CID = '28838201883';
const ROOT = 'D:/developing/webdesign';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const REF = `https://www.bilibili.com/video/${BVID}`;
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

const argv = process.argv.slice(2);
const waitMode = argv.includes('--wait');
const timeout = Number((argv.find((a) => a.startsWith('--timeout')) || '--timeout=1800').split('=')[1] || 1800);
const positional = argv.filter((a) => !a.startsWith('--'));
const PORT = positional[0] || '9500';
const PROFILE = positional[1] || path.join(ROOT, 'dev/edge-profile');
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 只结束使用本脚本配置目录的 msedge（不会碰用户日常浏览器） */
function shutdownWindow() {
  spawnSync('pwsh', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" -ErrorAction SilentlyContinue | " +
    `Where-Object { $_.CommandLine -and ($_.CommandLine -like '*${PROFILE.replace(/'/g, "''")}*') } | ` +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"],
    { stdio: 'ignore' });
  for (let i = 0; i < 5; i++) {
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; }
    catch { spawnSync('pwsh', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 700'], { stdio: 'ignore' }); }
  }
}

async function cookieJar() {
  const list = await (await fetch(base + '/json/list')).json();
  const page = list.find((t) => t.type === 'page' && /bilibili\.com/.test(t.url)) || list.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的页面 target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method: m, params: p || {} }));
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
    }
  });
  let out;
  try { out = await send('Storage.getCookies', {}); }
  catch { await send('Network.enable'); out = await send('Network.getCookies', { urls: ['https://www.bilibili.com'] }); }
  ws.close();
  const jar = {};
  for (const c of out.cookies || []) if (/bilibili/.test(c.domain)) jar[c.name] = c.value;
  return jar;
}

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

try {
  console.log('连接窗口 (CDP ' + PORT + ')…');
  const t0 = Date.now();
  let jar = null;
  for (;;) {
    try { jar = await cookieJar(); } catch (e) { if (!waitMode) throw e; jar = null; }
    if (jar && jar.SESSDATA) break;
    const el = (Date.now() - t0) / 1000;
    if (!waitMode) throw new Error('窗口里还没有登录态');
    if (el > timeout) throw new Error(`等了 ${timeout}s 仍未登录，放弃`);
    if (Math.round(el) % 20 < 5) console.log(`  等你登录中… ${Math.round(el)}s`);
    await sleep(5000);
  }
  console.log('已取到登录态（cookie ' + Object.keys(jar).length + ' 条，值不落盘不打印）');

  const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const api = async (url) => (await fetch(url, {
    headers: { 'User-Agent': UA, Referer: REF, Origin: 'https://www.bilibili.com', Cookie: cookieHeader },
  })).json();

  const nav = await api('https://api.bilibili.com/x/web-interface/nav');
  console.log('isLogin =', nav.data && nav.data.isLogin, ' uname =', (nav.data && nav.data.uname) || '-');

  let list = [];
  if (nav.data && nav.data.wbi_img) {
    const imgKey = nav.data.wbi_img.img_url.split('/').pop().split('.')[0];
    const subKey = nav.data.wbi_img.sub_url.split('/').pop().split('.')[0];
    const mixin = MIXIN_KEY_ENC_TAB.map((i) => (imgKey + subKey)[i]).join('').slice(0, 32);
    const all = { bvid: BVID, cid: CID, wts: Math.round(Date.now() / 1000) };
    const q = Object.keys(all).sort().map((k) => `${k}=${encodeURIComponent(all[k])}`).join('&');
    const j = await api(`https://api.bilibili.com/x/player/wbi/v2?${q}&w_rid=${md5(q + mixin)}`);
    list = (j.data && j.data.subtitle && j.data.subtitle.subtitles) || [];
    console.log(`player/wbi/v2 字幕条数 = ${list.length}`);
  }
  if (!list.length) {
    const j = await api(`https://api.bilibili.com/x/player/v2?bvid=${BVID}&cid=${CID}`);
    list = (j.data && j.data.subtitle && j.data.subtitle.subtitles) || [];
    console.log(`player/v2 字幕条数 = ${list.length}`);
  }
  for (const s of list) console.log(`   ${s.lan} ${s.lan_doc || ''} ai_type=${s.ai_type} url=${s.subtitle_url ? '有' : '空'}`);

  if (!list.some((s) => s.subtitle_url)) {
    console.log('结果：登录了但仍然没有 subtitle_url');
    process.exitCode = 5;
  } else {
    const outDir = path.join(ROOT, 'dev/subtitle');
    fs.mkdirSync(outDir, { recursive: true });
    for (const s of list) {
      if (!s.subtitle_url) continue;
      const u = s.subtitle_url.startsWith('//') ? 'https:' + s.subtitle_url : s.subtitle_url;
      const j = await api(u);
      const body = j.body || [];
      const tag = s.lan || 'unknown';
      fs.writeFileSync(path.join(outDir, `subtitle-${tag}.json`), JSON.stringify(j, null, 1), 'utf8');
      const lines = body.map((b) => {
        const m = Math.floor((b.from || 0) / 60), sec = Math.floor((b.from || 0) % 60);
        return `[${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}] ${(b.content || '').trim()}`;
      });
      fs.writeFileSync(path.join(outDir, `transcript-${tag}.txt`), lines.join('\n'), 'utf8');
      console.log(`\n${tag}：${body.length} 条 -> dev/subtitle/transcript-${tag}.txt`);
    }
    console.log('SUBTITLE_OK');
  }
} catch (e) {
  console.error('ERR ' + (e && e.message || e));
  process.exitCode = 1;
} finally {
  shutdownWindow();
  console.log('已关闭窗口并删除配置目录: ' + PROFILE);
}
