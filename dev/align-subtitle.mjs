// 把字幕按时间码切分到各个风格段落，输出一份便于人工校订的分段稿。
// 段落边界取自视频简介的时间轴（dev/segments.json），不依赖字幕自身的断句。
// 用法: node dev/align-subtitle.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/developing/webdesign';
const SUB = path.join(ROOT, 'dev/subtitle');

function parseTranscript(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (const l of lines) {
    const m = l.match(/^\[(\d{2}):(\d{2})\]\s*(.*)$/);
    if (!m) continue;
    const t = Number(m[1]) * 60 + Number(m[2]);
    const text = m[3].trim();
    if (text) out.push({ t, text });
  }
  return out;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SLUG_FIX = { 'bonus-style': 'scrapbook' };

const segs = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/segments.json'), 'utf8'));
const wanted = segs
  .map((s) => ({ slug: SLUG_FIX[slug(s.n)] || slug(s.n), name: s.n, start: s.start, end: s.end }))
  .filter((s) => s.slug !== 'intro' && s.slug !== 'outro');

const human = parseTranscript(path.join(SUB, 'transcript-zh-Hans.txt'));
const ai = parseTranscript(path.join(SUB, 'transcript-ai-zh.txt'));
console.log(`上传者字幕 ${human.length} 条 / AI 字幕 ${ai.length} 条 / 段落 ${wanted.length} 个`);

const md = ['# 字幕按风格分段（用于校订）', ''];
const json = {};
for (const s of wanted) {
  // 段落内取 [start, end)；开头 3 秒常是上一段的收尾语，单独标注出来
  const inSeg = human.filter((l) => l.t >= s.start + 2 && l.t < s.end);
  const spill = human.filter((l) => l.t >= s.start - 4 && l.t < s.start + 2);
  json[s.slug] = {
    name: s.name,
    start: s.start,
    end: s.end,
    lines: inSeg.map((l) => ({ t: l.t, text: l.text })),
    headLines: spill.map((l) => ({ t: l.t, text: l.text })),
  };
  const mmss = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  md.push(`## ${s.name}  (${mmss(s.start)}–${mmss(s.end)})  slug=${s.slug}`);
  if (spill.length) md.push(`> 衔接（可能属于上一段）：${spill.map((l) => l.text).join(' ')}`);
  for (const l of inSeg) md.push(`- [${mmss(l.t)}] ${l.text}`);
  md.push('');
}

fs.mkdirSync(SUB, { recursive: true });
fs.writeFileSync(path.join(SUB, 'by-style.json'), JSON.stringify(json, null, 1), 'utf8');
fs.writeFileSync(path.join(SUB, 'by-style.md'), md.join('\n'), 'utf8');

const counts = wanted.map((s) => `${s.slug}:${json[s.slug].lines.length}`);
console.log('每段字幕条数：');
console.log('  ' + counts.join('  '));
const empty = wanted.filter((s) => json[s.slug].lines.length === 0).map((s) => s.slug);
if (empty.length) console.log('!! 没切到字幕的段落: ' + empty.join(', '));
console.log('\n-> dev/subtitle/by-style.md 与 by-style.json');
