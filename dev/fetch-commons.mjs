// 从 Wikimedia Commons 为每个风格抓取候选清晰图（B 方案：公开版权补充图）
// 用法: node dev/fetch-commons.mjs [slug ...]   (不带参数 = 全部)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/developing/webdesign';
const OUT = path.join(ROOT, 'dev/pd-cand');
const UA = 'StyleRefStaticSite/1.0 (local build; contact: local user)';

// slug -> [首选检索词, 备选检索词...]
const TERMS = {
  'neoclassical': ['Neoclassicism painting', 'Neoclassical architecture'],
  'baroque': ['Baroque painting', 'Baroque architecture'],
  'aurora': ['Aurora borealis', 'Aurora australis'],
  'ethereal': ['Ethereal art', 'Fog landscape photography'],
  'filigree': ['Filigree', 'Filigree metalwork'],
  'acanthus': ['Acanthus ornament', 'Corinthian capital acanthus'],
  'anthropomorphic': ['Anthropomorphic art', 'Anthropomorphism'],
  'pixel-art': ['Pixel art', 'Pixel-art'],
  'conceptual-sketch': ['Conceptual sketch', 'Pencil sketch drawing'],
  'luxury-typography': ['Typography poster', 'Letterpress typography'],
  'japandi': ['Japandi interior', 'Japanese Scandinavian interior'],
  'memphis': ['Memphis Group', 'Memphis design 1980s'],
  'bohemian': ['Bohemian style interior', 'Bohemianism'],
  'shabby-chic': ['Shabby chic', 'Chintz floral fabric'],
  'farmhouse': ['Farmhouse', 'Rustic farmhouse interior'],
  'victorian': ['Victorian decorative arts', 'Victorian architecture'],
  'art-deco': ['Art Deco', 'Art Deco poster'],
  'art-nouveau': ['Art Nouveau', 'Art Nouveau poster'],
  'mystical-western': ['Western art painting', 'American frontier painting'],
  'kitsch': ['Kitsch', 'Kitsch art'],
  '3x3-grid': ['Grid layout design', 'Rule of thirds grid'],
  'y2k': ['Y2K aesthetic', 'Year 2000 fashion'],
  'bauhaus': ['Bauhaus', 'Bauhaus poster'],
  'brutalism': ['Brutalist architecture', 'Brutalism'],
  'cybercore': ['Cyberpunk', 'Cyberpunk art'],
  'synthwave': ['Synthwave', 'Retrowave'],
  'vaporwave': ['Vaporwave', 'Vaporwave art'],
  'pop-art': ['Pop art', 'Pop art painting'],
  'bento-box': ['Bento', 'Bento box lunch'],
  'graffiti': ['Graffiti', 'Graffiti art'],
  'tenebrism': ['Tenebrism', 'Chiaroscuro painting'],
  'gothic': ['Gothic architecture', 'Gothic art'],
  'pointilism': ['Pointillism', 'Neo-impressionism painting'],
  'mixed-media': ['Mixed media art', 'Collage art'],
  'steampunk': ['Steampunk', 'Steampunk art'],
  'kawaii': ['Kawaii', 'Kawaii culture'],
  'coquette': ['Coquette aesthetic', 'Rococo fashion'],
  'surrealism': ['Surrealism', 'Surrealist painting'],
  'utilitarian': ['Utilitarian design', 'Utility furniture'],
  'mid-century': ['Mid-century modern', 'Mid-century modern furniture'],
  'scrapbook': ['Scrapbooking', 'Scrapbook'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia 会限流：所有请求串行 + 最小间隔，遇到 429/503 指数退避
let lastReq = 0;
const MIN_GAP = 2500;
async function politeness() {
  const now = Date.now();
  const wait = lastReq + MIN_GAP - now;
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();
}

async function wm(url, asJson) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await politeness();
    let r;
    try {
      r = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(6000 * (attempt + 1));
      continue;
    }
    if (r.status === 429 || r.status === 503) {
      const wait = 15000 * (attempt + 1);
      console.log(`    ...${r.status} 限流，等 ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw new Error('http ' + r.status);
    return asJson ? r.json() : Buffer.from(await r.arrayBuffer());
  }
  throw new Error('rate limited after retries');
}

async function api(params) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams(params).toString();
  return wm(url, true);
}

async function search(term) {
  const j = await api({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${term} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1400',
  });
  const pages = (j.query && j.query.pages) || [];
  const out = [];
  for (const p of pages) {
    const ii = (p.imageinfo || [])[0];
    if (!ii) continue;
    const mime = ii.mime || '';
    if (!/^image\/(jpeg|png)$/.test(mime)) continue;
    const w = ii.width || 0;
    const h = ii.height || 0;
    if (w < 1100 || h < 650) continue;
    const ar = w / h;
    if (ar < 1.15 || ar > 2.4) continue; // 卡片是 16:9，优先横构图
    const em = ii.extmetadata || {};
    const val = (k) => (em[k] && em[k].value ? String(em[k].value).replace(/<[^>]*>/g, '').trim() : '');
    out.push({
      title: p.title.replace(/^File:/, ''),
      width: w,
      height: h,
      url: ii.thumburl || ii.url,
      page: ii.descriptionurl,
      artist: val('Artist'),
      license: val('LicenseShortName'),
      licenseUrl: val('LicenseUrl'),
      credit: val('Credit'),
      score: Math.min(ar, 1.9) * 1000 + Math.min(w, 3000) / 10,
    });
  }
  return out;
}

const only = process.argv.slice(2);
const slugs = only.length ? only : Object.keys(TERMS);
fs.mkdirSync(OUT, { recursive: true });

for (const slug of slugs) {
  const terms = TERMS[slug] || [slug];
  const dir = path.join(OUT, slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  let picked = [];
  for (const term of terms) {
    let res = [];
    try {
      res = await search(term);
    } catch (e) {
      console.log(`  ! ${slug} "${term}": ${e.message}`);
    }
    if (res.length) {
      picked = res.sort((a, b) => b.score - a.score).slice(0, 3);
      break;
    }
  }
  if (!picked.length) {
    console.log(`- ${slug.padEnd(20)} (no candidate)`);
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ slug, candidates: [] }, null, 2));
    continue;
  }

  const meta = { slug, candidates: [] };
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const file = path.join(dir, `c${i + 1}.jpg`);
    try {
      const buf = await wm(c.url, false);
      fs.writeFileSync(file, buf);
      meta.candidates.push({ ...c, file: `c${i + 1}.jpg`, bytes: buf.length });
      console.log(`- ${slug.padEnd(20)} c${i + 1} ${c.width}x${c.height} ${(buf.length / 1024).toFixed(0)}KB  ${c.license || '?'}  | ${c.title.slice(0, 58)}`);
    } catch (e) {
      console.log(`  ! ${slug} c${i + 1} download: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
}
console.log('\ndone ->', OUT);
