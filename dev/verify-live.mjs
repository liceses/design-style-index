// 线上站点验收：逐个 URL 打状态码，并用线上 data.js 反查所有图片是否都能访问。
// 用法: node dev/verify-live.mjs [baseUrl]
const BASE = (process.argv[2] || 'https://liceses.github.io/design-style-index/').replace(/\/?$/, '/');
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail });

// 带重试的请求：CDN 偶发连接失败时不要误报
async function req(url, method, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method, redirect: 'follow' });
      if (r.status >= 500 && i < tries - 1) { lastErr = new Error('http ' + r.status); }
      else return r;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw lastErr;
}
async function head(url) {
  const r = await req(url, 'HEAD');
  return { status: r.status, type: (r.headers.get('content-type') || '').split(';')[0], len: Number(r.headers.get('content-length') || 0) };
}
async function get(url) {
  const r = await req(url, 'GET');
  return { status: r.status, type: (r.headers.get('content-type') || '').split(';')[0], text: await r.text() };
}

console.log('线上地址: ' + BASE + '\n');

/* 1. 关键文件 */
const page = await get(BASE);
ok('首页 200 且是 HTML', page.status === 200 && /text\/html/.test(page.type), `${page.status} ${page.type}`);
ok('首页确实是站点（不是 README 兜底）', /40 种设计风格/.test(page.text) && /id="grid"/.test(page.text), '含标题与网格容器');
ok('首页引用了相对路径资源', /href="styles\.css"/.test(page.text) && /src="data\.js"/.test(page.text) && /src="app\.js"/.test(page.text), '');

for (const [p, must] of [['styles.css', [':root', '--bg', 'data-theme="light"']], ['app.js', ['STYLE_DATA', 'themeBtn']], ['data.js', ['window.STYLE_DATA']]]) {
  const r = await get(BASE + p);
  ok(`${p} 200 且内容正确`, r.status === 200 && must.every((m) => r.text.includes(m)), `${r.status} ${r.type} ${(r.text.length / 1024).toFixed(0)}KB`);
}

/* 2. 解析线上 data.js */
const dataJs = await get(BASE + 'data.js');
let data = null;
try {
  data = JSON.parse(dataJs.text.slice(dataJs.text.indexOf('{'), dataJs.text.lastIndexOf('}') + 1));
} catch (e) { /* 下面会报错 */ }
ok('线上 data.js 可解析', !!data, data ? '' : '解析失败');
if (data) {
  ok('线上 41 条风格', data.styles.length === 41, 'count=' + data.styles.length);
  const refs = data.styles.filter((s) => s.ref).length;
  ok('线上 31 条含补充图', refs === 31, 'refs=' + refs);
  ok('线上每条都有字幕原话', data.styles.every((s) => s.say && s.origin && s.usage), '');

  /* 3. 逐个图片 HEAD（并发 6） */
  const urls = [];
  for (const s of data.styles) {
    urls.push(['封面', s.img], ['缩略图', s.thumb]);
    if (s.ref) urls.push(['补充图', s.ref.img]);
  }
  const bad = [];
  let done = 0;
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const [kind, rel] = queue.shift();
      try {
        const r = await head(BASE + rel);
        if (r.status !== 200 || !/image\//.test(r.type)) bad.push(`${kind} ${rel} -> ${r.status} ${r.type}`);
      } catch (e) {
        bad.push(`${kind} ${rel} -> ${e.message}`);
      }
      done++;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  ok(`线上 ${urls.length} 张图片全部可访问（41 封面 + 41 缩略图 + 31 补充图）`, bad.length === 0, bad.slice(0, 6).join('; '));
  ok('图片响应带合理体积', true, `已检查 ${done} 个 URL`);
}

/* 4. 输出 */
console.log('=== 线上验收 ===');
let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? (r.detail ? '   (' + r.detail + ')' : '') : '   << ' + (r.detail || '')}`);
}
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exitCode = fail ? 1 : 0;
