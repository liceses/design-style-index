// 从下载好的视频里，为每个风格段落抽取多张候选帧。
// 用法：node dev/extract-candidates.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const VIDEO = path.join(ROOT, 'dev/style-video/video.mp4');
const OUT = path.join(ROOT, 'dev/style-video/cand');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';

const FRACTIONS = [0.18, 0.38, 0.58, 0.78];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const segs = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/segments.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

let made = 0;
for (const s of segs) {
  const dur = s.end - s.start;
  const name = slug(s.n);
  for (let i = 0; i < FRACTIONS.length; i++) {
    const t = (s.start + dur * FRACTIONS[i]).toFixed(2);
    const out = path.join(OUT, `${name}_${i}.jpg`);
    const r = spawnSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-ss', String(t), '-i', VIDEO, '-frames:v', '1', '-q:v', '2', out],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) {
      console.log(`FAIL ${name}_${i} @${t}s :: ${r.stderr}`);
      continue;
    }
    made++;
  }
  console.log(`${name} -> ${FRACTIONS.map((f) => (s.start + dur * f).toFixed(0) + 's').join(', ')}`);
}
console.log(`\n${made} frames in ${OUT}`);
