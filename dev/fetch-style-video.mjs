// 下载 BV1anQwYZEw2 的最高可用清晰度视频流（未登录上限通常 480P），并 remux 成 mp4。
// 用法：node dev/fetch-style-video.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BVID = 'BV1anQwYZEw2';
const CID = '28838201883';
const OUTDIR = 'D:/developing/webdesign/dev/style-video';
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';
const FFPROBE = 'D:/applications/ffmpeg/bin/ffprobe.exe';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const REF = `https://www.bilibili.com/video/${BVID}`;

fs.mkdirSync(OUTDIR, { recursive: true });

const api = `https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&fnval=16&qn=80&fourk=1`;
const res = await fetch(api, { headers: { 'User-Agent': UA, Referer: REF } });
const j = await res.json();
if (j.code !== 0) throw new Error('playurl failed: ' + j.code + ' ' + j.message);

const d = j.data;
console.log('requested qn=80, actual quality =', d.quality, d.format);
console.log('accept_description =', JSON.stringify(d.accept_description));

const vids = (d.dash && d.dash.video) || [];
console.log('\nvideo streams offered:');
for (const v of vids) {
  console.log(`  qn=${v.id} ${v.width}x${v.height} codec=${v.codecs} bw=${v.bandwidth}`);
}

// 选分辨率最高；同分辨率优先 avc（兼容性最好）
const pick = vids
  .slice()
  .sort((a, b) => b.width * b.height - a.width * a.height || (a.codecid === 7 ? -1 : 1))[0];
if (!pick) throw new Error('no video stream');
console.log(`\npicked: ${pick.width}x${pick.height} codec=${pick.codecs} bw=${pick.bandwidth}`);

const raw = path.join(OUTDIR, 'video.m4s');
const mp4 = path.join(OUTDIR, 'video.mp4');

console.log('\ndownloading ->', raw);
const vr = await fetch(pick.baseUrl, {
  headers: { 'User-Agent': UA, Referer: REF, Origin: 'https://www.bilibili.com' },
});
if (!vr.ok) throw new Error('cdn http ' + vr.status);

const total = Number(vr.headers.get('content-length') || 0);
let got = 0;
let lastLog = 0;
const out = fs.createWriteStream(raw);
const reader = vr.body.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  out.write(Buffer.from(value));
  got += value.length;
  const now = Date.now();
  if (now - lastLog > 3000) {
    lastLog = now;
    const pct = total ? ((got / total) * 100).toFixed(1) + '%' : '?';
    console.log(`  ${(got / 1048576).toFixed(1)} MB / ${(total / 1048576).toFixed(1)} MB (${pct})`);
  }
}
await new Promise((r) => out.end(r));
console.log(`downloaded ${(got / 1048576).toFixed(1)} MB`);

console.log('\nremux ->', mp4);
const r1 = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-c', 'copy', mp4], {
  encoding: 'utf8',
});
if (r1.status !== 0) throw new Error('ffmpeg failed: ' + r1.stderr);
console.log('remux ok');

const r2 = spawnSync(
  FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration,size', '-show_streams', '-of', 'json', mp4],
  { encoding: 'utf8' }
);
console.log(r2.stdout);
