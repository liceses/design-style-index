// 从「我开的那个 Edge 窗口」（独立 profile + CDP 9500）里取会话，请求 1080P 并下载。
// 会话只在内存里用，不写盘、不打印。--wait 时会等你登录（轮询到 SESSDATA 为止）。
// 用法: node dev/fetch-hd-cdp.mjs [--wait] [--timeout 秒] [qn] [port]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BVID = 'BV1anQwYZEw2';
const CID = '28838201883';
const ROOT = 'D:/developing/webdesign';
const OUTDIR = path.join(ROOT, 'dev/style-video');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const REF = `https://www.bilibili.com/video/${BVID}`;

const argv = process.argv.slice(2);
const waitMode = argv.includes('--wait');
const timeout = Number((argv.find((a) => a.startsWith('--timeout')) || '--timeout=1800').split('=')[1] || 1800);
const positional = argv.filter((a) => !a.startsWith('--'));
const qn = positional[0] || '80';
const PORT = positional[1] || '9500';
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const r = await fetch(base + '/json/list');
  return r.json();
}

async function cookieJar() {
  const list = await targets();
  const page = list.find((t) => t.type === 'page' && /bilibili\.com/.test(t.url)) || list.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的页面 target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
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
  try {
    out = await send('Storage.getCookies', {});
  } catch {
    await send('Network.enable');
    out = await send('Network.getCookies', { urls: ['https://www.bilibili.com'] });
  }
  ws.close();
  const jar = {};
  for (const c of out.cookies || []) {
    if (/bilibili\.com$/.test(c.domain.replace(/^\./, '')) || /bilibili/.test(c.domain)) jar[c.name] = c.value;
  }
  return jar;
}

/* ---------- 1. 拿会话 ---------- */
console.log('连接我开的 Edge 窗口 (CDP ' + PORT + ') …');
const t0 = Date.now();
let jar = null;
for (;;) {
  try {
    jar = await cookieJar();
  } catch (e) {
    if (!waitMode) throw e;
    console.log('  窗口还没就绪: ' + e.message);
    jar = null;
  }
  if (jar && jar.SESSDATA) break;
  const el = (Date.now() - t0) / 1000;
  if (!waitMode) throw new Error('窗口里还没有登录态（SESSDATA）');
  if (el > timeout) throw new Error(`等了 ${timeout}s 仍未检测到登录态，放弃`);
  if (Math.round(el) % 20 < 5) console.log(`  等你登录中… ${Math.round(el)}s（当前 cookie ${jar ? Object.keys(jar).length : 0} 条，无 SESSDATA）`);
  await sleep(5000);
}
console.log('已取到登录态：' + Object.keys(jar).length + ' 条 cookie（含 SESSDATA，值不落盘不打印）');

/* ---------- 2. 带登录态请求 playurl ---------- */
const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const api = `https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&fnval=16&qn=${qn}&fourk=1&platform=pc`;
const res = await fetch(api, { headers: { 'User-Agent': UA, Referer: REF, Cookie: cookieHeader } });
const j = await res.json();
if (j.code !== 0) throw new Error('playurl 失败: ' + j.code + ' ' + j.message);
const d = j.data;
console.log(`\n授予清晰度: qn=${d.quality} (${d.format})`);
const vids = (d.dash && d.dash.video) || [];
for (const v of vids) console.log(`  可选 qn=${v.id} ${v.width}x${v.height} ${v.codecs} bw=${v.bandwidth}`);

const pick = vids.filter((v) => v.codecid === 7).sort((a, b) => b.width * b.height - a.width * a.height)[0]
  || vids.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
if (!pick) throw new Error('没有可用视频流');
console.log(`\n选中 ${pick.width}x${pick.height} / 预计 ${((pick.bandwidth || 0) * 1855 / 8 / 1048576).toFixed(0)} MB`);

/* ---------- 3. 下载 ---------- */
const raw = path.join(OUTDIR, `video-${pick.height}.m4s`);
const mp4 = path.join(OUTDIR, `video-${pick.height}.mp4`);
const vr = await fetch(pick.baseUrl, {
  headers: { 'User-Agent': UA, Referer: REF, Origin: 'https://www.bilibili.com', Cookie: cookieHeader },
});
if (!vr.ok) throw new Error('CDN http ' + vr.status);
const total = Number(vr.headers.get('content-length') || 0);
let got = 0, last = 0;
const out = fs.createWriteStream(raw);
const reader = vr.body.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  out.write(Buffer.from(value));
  got += value.length;
  if (Date.now() - last > 5000) {
    last = Date.now();
    console.log(`  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`);
  }
}
await new Promise((r) => out.end(r));
console.log(`下载完成 ${(got / 1048576).toFixed(1)} MB`);

const r1 = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-c', 'copy', mp4], { encoding: 'utf8' });
if (r1.status !== 0) throw new Error('ffmpeg 失败: ' + r1.stderr);
console.log('remux ok -> ' + mp4);
fs.rmSync(raw, { force: true });
console.log('HD_DONE ' + mp4);
