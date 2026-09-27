// 在若干段落的开头按固定步长取样，用于找出"标题卡"出现的偏移。
// 用法: node dev/probe-window.mjs <step> <count> <slug> <start> [<slug> <start> ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const VIDEO = path.join(ROOT, 'dev/style-video/video.mp4');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';

const argv = process.argv.slice(2);
const step = Number(argv[0]);
const count = Number(argv[1]);
const pairs = [];
for (let i = 2; i + 1 < argv.length; i += 2) pairs.push({ slug: argv[i], start: Number(argv[i + 1]) });
if (!step || !count || !pairs.length) {
  console.error('usage: node dev/probe-window.mjs <step> <count> <slug> <start> [...]');
  process.exit(2);
}

const outDir = path.join(ROOT, 'dev/style-video/probe');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const p of pairs) {
  for (let k = 1; k <= count; k++) {
    const t = p.start + k * step;
    const out = path.join(outDir, `${p.slug}__t${String(k).padStart(2, '0')}.jpg`);
    const r = spawnSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-ss', String(t), '-i', VIDEO, '-frames:v', '1', '-q:v', '3', out],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) console.error(`FAIL ${p.slug} t=${t}: ${r.stderr}`);
  }
  console.log(`${p.slug}: sampled start+${step}..start+${(count * step).toFixed(0)}s`);
}
