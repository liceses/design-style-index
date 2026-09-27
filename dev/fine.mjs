// 按固定步长(默认1s)对指定段落开头取样，写入同一目录，按风格前缀排序
// 用法: node dev/fine.mjs <outDir> <step> <slug> <start> <count> [<slug> <start> <count> ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const VIDEO = path.join(ROOT, 'dev/style-video/video.mp4');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';

const argv = process.argv.slice(2);
const dirName = argv[0];
const step = Number(argv[1]);
const specs = [];
for (let i = 2; i + 2 < argv.length; i += 3) {
  specs.push({ slug: argv[i], start: Number(argv[i + 1]), count: Number(argv[i + 2]) });
}
if (!dirName || !step || !specs.length) {
  console.error('usage: node dev/fine.mjs <outDir> <step> <slug> <start> <count> [...]');
  process.exit(2);
}

const outDir = path.join(ROOT, 'dev/style-video', dirName);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const s of specs) {
  for (let i = 0; i < s.count; i++) {
    const t = s.start + i * step;
    const out = path.join(outDir, `${s.slug}__s${String(i).padStart(2, '0')}.jpg`);
    const r = spawnSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', VIDEO, '-frames:v', '1', '-q:v', '3', out],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) console.error(`FAIL ${s.slug} #${i}: ${r.stderr}`);
  }
  console.log(`${s.slug}: ${s.count} frames @${step}s from ${s.start}s`);
}
console.log('-> ' + outDir);
