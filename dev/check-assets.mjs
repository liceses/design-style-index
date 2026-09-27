// 静态完整性校验：数据 ↔ 文件 ↔ DOM ↔ CSS 变量互相对账，不启动任何浏览器。
// 用法: node dev/check-assets.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/developing/webdesign';
const SITE = path.join(ROOT, 'style-ref');
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail });

/* ---------- 1. data.js 解析 ---------- */
const dataRaw = fs.readFileSync(path.join(SITE, 'data.js'), 'utf8');
const jsonText = dataRaw.slice(dataRaw.indexOf('{'), dataRaw.lastIndexOf('}') + 1);
let data;
try {
  data = JSON.parse(jsonText);
  ok('data.js 可解析', true, '');
} catch (e) {
  ok('data.js 可解析', false, e.message);
  console.log('data.js 解析失败，后续检查跳过');
  process.exit(1);
}

const styles = data.styles || [];
ok('风格条数为 41（40 正片 + 1 加映）', styles.length === 41, 'count=' + styles.length);

/* ---------- 2. 编号与 slug ---------- */
const nums = styles.slice().sort((a, b) => a.n - b.n).map((s) => s.n);
ok('编号连续 1..41', nums.every((n, i) => n === i + 1), JSON.stringify(nums.slice(0, 5)) + '…');
const slugs = styles.map((s) => s.slug);
ok('slug 无重复', new Set(slugs).size === slugs.length, 'unique=' + new Set(slugs).size);

/* ---------- 3. 必填字段 ---------- */
const missing = [];
for (const s of styles) {
  for (const k of ['en', 'zh', 'desc', 't', 'tc', 'accent', 'accentInk', 'tint', 'tintLight', 'videoUrl']) {
    if (s[k] === undefined || s[k] === null || s[k] === '') missing.push(s.slug + '.' + k);
  }
  if (!Array.isArray(s.traits) || s.traits.length < 3) missing.push(s.slug + '.traits(<3)');
}
ok('41 条必填字段齐全（含浅色主题派生色）', missing.length === 0, missing.slice(0, 6).join(', '));

/* ---------- 3b. 编号顺序 = 视频时间轴顺序 ---------- */
const byN = styles.slice().sort((a, b) => a.n - b.n);
const ascending = byN.every((s, i) => i === 0 || byN[i - 1].t <= s.t);
ok('编号 n 与视频时间轴一致（“视频顺序”排序可信）', ascending,
  byN.slice(0, 4).map((s) => s.slug + '@' + s.tc).join(' '));
ok('编号顺序与字幕时间轴自洽（最小 t 在最前）', byN[0].t === Math.min(...styles.map((s) => s.t)),
  'first=' + byN[0].slug + ' t=' + byN[0].t);

/* ---------- 3c. 来自上传者字幕的内容 ---------- */
const noSay = styles.filter((s) => !s.say || !s.sayAt || !s.origin || !s.usage).map((s) => s.slug);
ok(`全部 ${styles.length} 条都有字幕原话与来源/用途`, noSay.length === 0, noSay.slice(0, 5).join(', '));
const shortSay = styles.filter((s) => (s.say || '').length < 20).map((s) => s.slug);
ok('原话没有过短的占位内容', shortSay.length === 0, shortSay.join(', '));

/* ---------- 4. 分组 ---------- */
const groupIds = new Set((data.groups || []).map((g) => g.id));
ok('分组合法（6 组）', data.groups.length === 6, 'groups=' + data.groups.length);
const badGroup = styles.filter((s) => !groupIds.has(s.group)).map((s) => s.slug);
ok('每条风格的分组都存在', badGroup.length === 0, badGroup.join(', '));
const emptyGroups = [...groupIds].filter((g) => !styles.some((s) => s.group === g));
ok('没有空分组', emptyGroups.length === 0, emptyGroups.join(', '));

/* ---------- 5. 图片文件存在 + 真尺寸（解析 JPEG SOF） ---------- */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

const missingImg = [];
const badFull = [];
const badThumb = [];
let fullBytes = 0, thumbBytes = 0;
for (const s of styles) {
  const full = path.join(SITE, s.img);
  const thumb = path.join(SITE, s.thumb);
  if (!fs.existsSync(full)) missingImg.push(s.img);
  else {
    fullBytes += fs.statSync(full).size;
    const d = jpegSize(full);
    if (!d || d.w !== 1600) badFull.push(s.slug + ':' + (d ? d.w + 'x' + d.h : 'decode-fail'));
  }
  if (!fs.existsSync(thumb)) missingImg.push(s.thumb);
  else {
    thumbBytes += fs.statSync(thumb).size;
    const d = jpegSize(thumb);
    if (!d || d.w !== 720) badThumb.push(s.slug + ':' + (d ? d.w + 'x' + d.h : 'decode-fail'));
  }
}
ok('41 张封面 + 41 张缩略图都存在', missingImg.length === 0, missingImg.slice(0, 4).join(', '));
ok('41 张封面均为 1600px 宽（1080P 源 → 高清）', badFull.length === 0, badFull.slice(0, 4).join(', '));
ok('41 张缩略图均为 720px 宽', badThumb.length === 0, badThumb.slice(0, 4).join(', '));

/* ---------- 6. 公开版权补充图 ---------- */
const refStyles = styles.filter((s) => s.ref);
const refProblems = [];
let refBytes = 0;
for (const s of refStyles) {
  const f = path.join(SITE, s.ref.img);
  if (!fs.existsSync(f)) { refProblems.push(s.slug + ':缺文件'); continue; }
  refBytes += fs.statSync(f).size;
  for (const k of ['title', 'license', 'page']) {
    if (!s.ref[k]) refProblems.push(s.slug + ':缺 ' + k);
  }
}
ok(`补充图 ${refStyles.length} 张文件与署名齐全`, refProblems.length === 0, refProblems.slice(0, 4).join(', '));
ok('补充图数量与 README 一致（31）', refStyles.length === 31, 'refs=' + refStyles.length);

/* ---------- 7. index.html ↔ app.js 的 DOM id 对账 ---------- */
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(SITE, 'app.js'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const usedIds = new Set([
  ...[...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]),
  ...[...app.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]),
]);
const missingIds = [...usedIds].filter((id) => !htmlIds.has(id));
ok('app.js 用到的 DOM id 都在 index.html 里', missingIds.length === 0, missingIds.join(', '));

const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
ok('index.html 引用了三个本地资源',
  /href="styles\.css"/.test(html) && /src="data\.js"/.test(html) && /src="app\.js"/.test(html), '');
ok('无任何外部资源引用（离线可用）',
  !/(src|href)="(https?:)?\/\//.test(html.replace(/https:\/\/www\.bilibili\.com[^"]*/g, '')), '');

/* ---------- 8. CSS 变量定义/使用对账 ---------- */
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
const usedVars = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
const undefinedVars = [...usedVars].filter((v) => !defined.has(v));
ok('styles.css 里没有未定义的 CSS 变量', undefinedVars.length === 0, undefinedVars.join(', '));
ok('浅色主题覆盖了关键 token',
  /html\[data-theme="light"\]\{[\s\S]*?--bg:/.test(css) && /html\[data-theme="light"\]\{[\s\S]*?--ink:/.test(css), '');

/* ---------- 输出 ---------- */
console.log('=== 静态完整性校验（不启动浏览器） ===');
let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '   << ' + (r.detail || '')}`);
}
console.log(`\n${results.length - fail}/${results.length} 通过`);
console.log(`封面合计 ${(fullBytes / 1048576).toFixed(1)} MB，缩略图 ${(thumbBytes / 1048576).toFixed(2)} MB，补充图 ${(refBytes / 1048576).toFixed(1)} MB`);
const siteBytes = (function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) =>
    s + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
})(SITE);
console.log(`站点合计 ${(siteBytes / 1048576).toFixed(1)} MB`);
process.exitCode = fail ? 1 : 0;
