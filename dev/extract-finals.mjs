// 按 dev/finals.json 里各风格选定的时间点，导出网站用的封面图。
// - 全尺寸：宽 1600（detail 用）存为 style-ref/img/<slug>.jpg
// - 缩略图：宽 720（网格卡片用）存为 style-ref/img/thumbs/<slug>.jpg
// 用法: node dev/extract-finals.mjs [视频文件]
//   默认优先用 video-1080.mp4（登录后下载的高清源），否则回退 video.mp4
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';
const IMG = path.join(ROOT, 'style-ref/img');
const THUMBS = path.join(IMG, 'thumbs');

const hd = path.join(ROOT, 'dev/style-video/video-1080.mp4');
const sd = path.join(ROOT, 'dev/style-video/video.mp4');
const VIDEO = process.argv[2] || (fs.existsSync(hd) ? hd : sd);
if (!fs.existsSync(VIDEO)) throw new Error('找不到视频源: ' + VIDEO);
console.log('视频源: ' + VIDEO);

const FULL_W = 1600;
const THUMB_W = 720;

const finals = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/finals.json'), 'utf8'));
fs.mkdirSync(THUMBS, { recursive: true });

let n = 0;
const report = [];
for (const [slug, cfg] of Object.entries(finals)) {
  if (slug.startsWith('_')) continue;
  const full = path.join(IMG, `${slug}.jpg`);
  const r1 = spawnSync(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-ss', String(cfg.t), '-i', VIDEO,
     '-frames:v', '1', '-vf', `scale=${FULL_W}:-2:flags=lanczos`, '-q:v', '4', full],
    { encoding: 'utf8' }
  );
  if (r1.status !== 0) {
    report.push(`FAIL ${slug}: ${r1.stderr}`);
    continue;
  }
  const thumb = path.join(THUMBS, `${slug}.jpg`);
  const r2 = spawnSync(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-i', full, '-vf', `scale=${THUMB_W}:-2:flags=lanczos`, '-q:v', '5', thumb],
    { encoding: 'utf8' }
  );
  if (r2.status !== 0) report.push(`FAIL thumb ${slug}: ${r2.stderr}`);
  n++;
}
console.log(`\n${n} 张封面 -> ${IMG}`);
const total = fs.readdirSync(IMG).filter((f) => f.endsWith('.jpg'))
  .reduce((s, f) => s + fs.statSync(path.join(IMG, f)).size, 0);
console.log(`全尺寸合计 ${(total / 1048576).toFixed(1)} MB`);
if (report.length) console.log(report.join('\n'));
