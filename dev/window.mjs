// 对若干段落按比例均匀取样，输出到同一目录（文件名按风格前缀排序，便于拼联系表）
// 用法: node dev/window.mjs <outDirName> <count> <slug> <start> <end> [<slug> <start> <end> ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const VIDEO = path.join(ROOT, 'dev/style-video/video.mp4');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';

const argv = process.argv.slice(2);
const dirName = argv[0];
const count = Number(argv[1]);
const segs = [];
for (let i = 2; i + 2 < argv.length; i += 3) {
  segs.push({ slug: argv[i], start: Number(argv[i + 1]), end: Number(argv[i + 2]) });
}
if (!dirName || !count || !segs.length) {
  console.error('usage: node dev/window.mjs <outDir> <count> <slug> <start> <end> [...]');
  process.exit(2);
}

const outDir = path.join(ROOT, 'dev/style-video', dirName);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const s of segs) {
  const span = s.end - s.start;
  for (let k = 0; k < count; k++) {
    // 均匀分布，避开最首尾各 3%
    const f = 0.03 + (0.94 * k) / Math.max(1, count - 1);
    const t = s.start + span * f;
    const out = path.join(outDir, `${s.slug}__k${String(k + 1).padStart(2, '0')}.jpg`);
    const r = spawnSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', VIDEO, '-frames:v', '1', '-q:v', '3', out],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) console.error(`FAIL ${s.slug} k${k + 1}: ${r.stderr}`);
  }
  console.log(`${s.slug}: ${count} frames over ${s.start}-${s.end}s`);
}
console.log('-> ' + outDir);
