// 对指定时间段做密集抽帧：每秒 1/fps 张
// 用法: node dev/dense.mjs <slug> <start> <end> [fps]   (fps 默认 0.5 = 每 2 秒一张)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/developing/webdesign';
const VIDEO = path.join(ROOT, 'dev/style-video/video.mp4');
const FFMPEG = 'D:/applications/ffmpeg/bin/ffmpeg.exe';

const [slug, start, end, fpsArg] = process.argv.slice(2);
if (!slug || !start || !end) {
  console.error('usage: node dev/dense.mjs <slug> <start> <end> [fps]');
  process.exit(2);
}
const fps = fpsArg || '0.5';
const outDir = path.join(ROOT, 'dev/style-video', slug);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const dur = Number(end) - Number(start);
const r = spawnSync(
  FFMPEG,
  [
    '-y', '-loglevel', 'error',
    '-ss', String(start), '-t', String(dur),
    '-i', VIDEO,
    '-vf', `fps=${fps}`,
    '-q:v', '3',
    path.join(outDir, 'f_%03d.jpg'),
  ],
  { encoding: 'utf8' }
);
if (r.status !== 0) {
  console.error('ffmpeg failed: ' + r.stderr);
  process.exit(1);
}
const n = fs.readdirSync(outDir).length;
console.log(`${slug}: ${n} frames @${fps}fps -> ${outDir}  (t0=${start}s, span=${dur}s, step≈${(1 / Number(fps)).toFixed(1)}s)`);
