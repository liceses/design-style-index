// 为每个段落抽取封面候选：start+1(干净示例图) / start+2 / start+3(标题卡)
// 用法: node dev/extract-covers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const VIDEO = path.join(ROOT, 'dev/style-video/video.mp4');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';
const OUT = path.join(ROOT, 'dev/style-video/cover');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const segs = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/segments.json'), 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const OFFSETS = [
  { tag: 'clean', d: 1 },
  { tag: 'card2', d: 2.5 },
  { tag: 'card3', d: 4 },
];

for (const s of segs) {
  const n = slug(s.n);
  for (const o of OFFSETS) {
    const t = s.start + o.d;
    if (t >= s.end) continue;
    const out = path.join(OUT, `${n}__${o.tag}.jpg`);
    const r = spawnSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-ss', String(t), '-i', VIDEO, '-frames:v', '1', '-q:v', '2', out],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) console.error(`FAIL ${n} ${o.tag}: ${r.stderr}`);
  }
}
const n = fs.readdirSync(OUT).length;
console.log(`${n} cover candidates -> ${OUT}`);
