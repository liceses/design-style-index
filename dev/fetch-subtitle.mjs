// 尝试以匿名方式获取该视频的字幕（不启动任何浏览器）。
// 依次尝试：finger/spi 拿 buvid → nav 拿 wbi 密钥 → WBI 签名的 player/wbi/v2 → 旧版 player/v2
// 用法: node dev/fetch-subtitle.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BVID = 'BV1anQwYZEw2';
const CID = '28838201883';
const AID = '114152966199142';
const ROOT = 'D:/developing/webdesign';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const REF = `https://www.bilibili.com/video/${BVID}`;

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

const jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function get(url, json = true) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: REF, Origin: 'https://www.bilibili.com', Cookie: cookieHeader() },
  });
  const t = await r.text();
  return json ? JSON.parse(t) : t;
}

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map((i) => orig[i]).join('').slice(0, 32);
}

function encWbi(params, imgKey, subKey) {
  const mixin = getMixinKey(imgKey + subKey);
  const wts = Math.round(Date.now() / 1000);
  const all = { ...params, wts };
  const query = Object.keys(all).sort().map((k) => {
    const v = String(all[k]).replace(/[!'()*]/g, '');
    return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  }).join('&');
  return `${query}&w_rid=${md5(query + mixin)}`;
}

/* ---------- 1. buvid ---------- */
try {
  const spi = await get('https://api.bilibili.com/x/frontend/finger/spi');
  if (spi.code === 0) {
    jar.buvid3 = spi.data.b_3;
    jar.buvid4 = spi.data.b_4;
    jar.b_nut = String(Math.round(Date.now() / 1000));
    console.log('buvid3/buvid4 已获取');
  }
} catch (e) { console.log('finger/spi 失败: ' + e.message); }

/* ---------- 2. wbi 密钥 ---------- */
let imgKey = null, subKey = null;
try {
  const nav = await get('https://api.bilibili.com/x/web-interface/nav');
  const wbi = nav.data && nav.data.wbi_img;
  if (wbi) {
    imgKey = wbi.img_url.split('/').pop().split('.')[0];
    subKey = wbi.sub_url.split('/').pop().split('.')[0];
    console.log('wbi 密钥已获取  isLogin=' + nav.data.isLogin);
  }
} catch (e) { console.log('nav 失败: ' + e.message); }

/* ---------- 3. 逐个接口试 ---------- */
const tries = [];
if (imgKey && subKey) {
  tries.push(['player/wbi/v2', `https://api.bilibili.com/x/player/wbi/v2?${encWbi({ bvid: BVID, cid: CID }, imgKey, subKey)}`]);
}
tries.push(['player/v2', `https://api.bilibili.com/x/player/v2?bvid=${BVID}&cid=${CID}`]);
tries.push(['player/v2(+aid)', `https://api.bilibili.com/x/player/v2?aid=${AID}&cid=${CID}`]);

let found = null;
for (const [name, url] of tries) {
  try {
    const j = await get(url);
    const sub = j.data && j.data.subtitle;
    const list = (sub && sub.subtitles) || [];
    console.log(`\n[${name}] code=${j.code} ${j.message || ''}  字幕条数=${list.length}`);
    for (const s of list) {
      console.log(`   lan=${s.lan} ${s.lan_doc || ''} ai_type=${s.ai_type} url=${s.subtitle_url ? '有' : '空'}`);
    }
    if (list.some((s) => s.subtitle_url)) { found = { name, list }; break; }
  } catch (e) {
    console.log(`\n[${name}] 失败: ${e.message}`);
  }
}

/* ---------- 4. 抓到就存下来 ---------- */
if (!found) {
  console.log('\n结论：匿名状态下拿不到 subtitle_url（B 站 AI 字幕要求登录）。');
  console.log('视频本身有 zh-Hans 字幕条目，但接口只对已登录请求下发地址。');
  process.exit(3);
}

const outDir = path.join(ROOT, 'dev/subtitle');
fs.mkdirSync(outDir, { recursive: true });
for (const s of found.list) {
  if (!s.subtitle_url) continue;
  const u = s.subtitle_url.startsWith('//') ? 'https:' + s.subtitle_url : s.subtitle_url;
  const j = await get(u);
  const body = j.body || [];
  const tag = s.lan || 'unknown';
  fs.writeFileSync(path.join(outDir, `subtitle-${tag}.json`), JSON.stringify(j, null, 1), 'utf8');
  const lines = body.map((b) => {
    const t = (b.from != null) ? `[${String(Math.floor(b.from / 60)).padStart(2, '0')}:${String(Math.floor(b.from % 60)).padStart(2, '0')}] ` : '';
    return t + (b.content || '').trim();
  });
  fs.writeFileSync(path.join(outDir, `transcript-${tag}.txt`), lines.join('\n'), 'utf8');
  console.log(`\n[${found.name}] ${tag} 字幕：${body.length} 条 -> dev/subtitle/transcript-${tag}.txt`);
}
console.log('SUBTITLE_OK');
