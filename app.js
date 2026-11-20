'use strict';
/* =========================================================
   Konfiguration
   ========================================================= */
const API = 'https://mediathekviewweb.de/api';
const PAGE = 48;

const CHANNELS = [
  { id:'ard',          name:'Das Erste',    short:'ARD', color:'#0b5bd3', q:['ARD'],              re:/^ard$/i },
  { id:'ard-alpha',    name:'ARD alpha',    short:'α',   color:'#7b3fe4', q:['alpha'],            re:/^ard[- ]?alpha$/i },
  { id:'tagesschau24', name:'tagesschau24', short:'ts24',color:'#c0392b', q:['tagesschau24'],     re:/^tagesschau24$/i },
  { id:'one',          name:'ONE',          short:'ONE', color:'#e0561b', q:['ONE'],              re:/^(ard[- ])?one$/i },
  { id:'br',           name:'BR',           short:'BR',  color:'#0d86c7', q:['BR'],               re:/^br$/i },
  { id:'hr',           name:'hr',           short:'hr',  color:'#d6342b', q:['HR'],               re:/^hr$/i },
  { id:'mdr',          name:'MDR',          short:'MDR', color:'#1d7a8c', q:['MDR'],              re:/^mdr$/i },
  { id:'ndr',          name:'NDR',          short:'NDR', color:'#1f4e9c', q:['NDR'],              re:/^ndr$/i },
  { id:'rbb',          name:'rbb',          short:'rbb', color:'#c4163f', q:['RBB'],              re:/^rbb$/i },
  { id:'rb',           name:'Radio Bremen', short:'RB',  color:'#2a9d5b', q:['RB','Bremen'],      re:/^(rb|radio bremen.*)$/i },
  { id:'sr',           name:'SR',           short:'SR',  color:'#2476c9', q:['SR'],               re:/^sr$/i },
  { id:'swr',          name:'SWR',          short:'SWR', color:'#1b66b3', q:['SWR'],              re:/^swr$/i },
  { id:'wdr',          name:'WDR',          short:'WDR', color:'#1a5fa8', q:['WDR'],              re:/^wdr$/i },
];
const ALL_Q = Array.from(new Set(CHANNELS.flatMap(c => c.q)));
const isArd = ch => CHANNELS.some(c => c.re.test((ch || '').trim()));
const chanOf = name => CHANNELS.find(c => c.re.test((name || '').trim())) || { id:'', name:name || 'ARD', short:(name || 'ARD').slice(0,3), color:'#666', q:[], re:/./ };
const chanById = id => CHANNELS.find(c => c.id === id);

const CHIPS = [
  { label:'Neu',           q:'',             min:600 },
  { label:'Tatort',        q:'Tatort',       min:1800 },
  { label:'Dokumentation', q:'Dokumentation',min:900 },
  { label:'Nachrichten',   q:'Tagesschau',   min:0 },
  { label:'Krimi',         q:'Krimi',        min:900 },
  { label:'Serien',        q:'Serie',        min:600 },
  { label:'Filme',         q:'Spielfilm',    min:3600 },
  { label:'Sport',         q:'Sportschau',   min:0 },
  { label:'Kinder',        q:'Kinder',       min:300 },
  { label:'Comedy',        q:'Comedy',       min:300 },
  { label:'Wissen',        q:'Wissen',       min:300 },
  { label:'Reportage',     q:'Reportage',    min:600 },
  { label:'Musik',         q:'Konzert',      min:600 },
];
const HIDE_RE = /audiodeskription|hörfassung|gebärdensprache|\(mit untertitel|\(ad\)/i;

const $ = (s, r = document) => r.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const main = $('#main');

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}
function icon(name, cls = '') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'ic ' + cls);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('mt:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mt:' + k, JSON.stringify(v)); } catch {} }
};
const secure = u => (u || '').replace(/^http:\/\//i, 'https://');
const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
function rel(ts) {
  if (!ts) return '';
  const s = ts - Date.now() / 1000, a = Math.abs(s);
  for (const [sec, unit] of [[31536000,'year'],[2592000,'month'],[604800,'week'],[86400,'day'],[3600,'hour'],[60,'minute']])
    if (a >= sec) return rtf.format(Math.round(s / sec), unit);
  return 'gerade eben';
}
const fullDate = ts => ts ? new Date(ts * 1000).toLocaleDateString('de-DE', { day:'numeric', month:'long', year:'numeric' }) : '';
function fmtDur(s) {
  s = Math.max(0, Math.round(s || 0));
  const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = n => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  let b = $('#tblur'); if (!b) { b = h('div', { id:'tblur' }); document.body.append(b); }
  void b.offsetWidth; b.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('show'); b.classList.remove('show'); }, 2600);
}
const slim = e => ({ id:e.id, channel:e.channel, topic:e.topic, title:e.title, description:(e.description || '').slice(0, 600),
  timestamp:e.timestamp, duration:e.duration, url_website:e.url_website, url_subtitle:e.url_subtitle,
  url_video:e.url_video, url_video_low:e.url_video_low, url_video_hd:e.url_video_hd });

const cache = new Map();

async function api(path, body) {
  const r = await fetch(API + path, { method:'POST', headers:{ 'Content-Type':'text/plain' }, body:JSON.stringify(body) });
  if (!r.ok) throw new Error('Server antwortet mit Status ' + r.status);
  const j = await r.json();
  if (j.err) throw new Error(Array.isArray(j.err) ? j.err.join(', ') : String(j.err));
  return j.result;
}

async function search({ text = '', channel = null, topic = null, sort = 'timestamp', order = 'desc', offset = 0, size = PAGE, min = 0, max = 0, exact = '' } = {}) {
  const queries = (channel ? channel.q : ALL_Q).map(q => ({ fields:['channel'], query:q }));
  if (text)  queries.push({ fields:['title', 'topic'], query:text });
  if (topic) queries.push({ fields:['topic'], query:topic });
  const body = { queries, future:false, offset, size };
  if (sort && sort !== 'rel') { body.sortBy = sort; body.sortOrder = order; }
  if (min) body.duration_min = min;
  if (max) body.duration_max = max;
  const res = await api('/query', body);
  const raw = res.results || [];
  const total = res.queryInfo ? res.queryInfo.totalResults : 0;
  const showHidden = HIDE_RE.test(text);
  const items = raw.filter(e => (channel ? channel.re.test((e.channel || '').trim()) : isArd(e.channel)) && (showHidden || !HIDE_RE.test(e.title || '')) && (!exact || e.topic === exact));
  items.forEach(e => cache.set(e.id, e));
  return { items, raw: raw.length, total, done: raw.length < size || offset + raw.length >= total };
}

async function fetchEntry(id) {
  const res = await api('/entries', [id]);
  const e = (res.results || [])[0];
  if (!e) throw new Error('Video nicht gefunden');
  e.id = id; cache.set(id, e); return e;
}

const getProg = id => (store.get('prog', {}))[id];
function saveProg(e, pos, dur) {
  const p = store.get('prog', {});
  p[e.id] = { pos:Math.floor(pos), dur:Math.floor(dur || e.duration || 0), t:Date.now() };
  const keys = Object.keys(p);
  if (keys.length > 300) keys.sort((a, b) => p[a].t - p[b].t).slice(0, keys.length - 300).forEach(k => delete p[k]);
  store.set('prog', p);
}
function pushHistory(e) {
  const list = store.get('hist', []).filter(x => x.id !== e.id);
  list.unshift(slim(e)); store.set('hist', list.slice(0, 120));
}
const isSaved = id => store.get('saved', []).some(x => x.id === id);
function toggleSaved(e) {
  let list = store.get('saved', []);
  if (list.some(x => x.id === e.id)) { list = list.filter(x => x.id !== e.id); store.set('saved', list); return false; }
  list.unshift(slim(e)); store.set('saved', list); return true;
}
const loadSaved = id => [...store.get('hist', []), ...store.get('saved', [])].find(x => x.id === id);

let thumbActive = 0; const thumbQueue = [];
const thumbIO = new IntersectionObserver(entries => {
  for (const en of entries) if (en.isIntersecting) { thumbIO.unobserve(en.target); thumbQueue.push(en.target); pump(); }
}, { rootMargin:'600px' });
function pump() {
  while (thumbActive < 2 && thumbQueue.length) {
    const t = thumbQueue.pop();
    if (!t.isConnected) continue;
    thumbActive++;
    grabFrame(t._e, t.classList.contains('hbg')).then(cv => { if (t.isConnected) t.prepend(cv); }).catch(() => {}).finally(() => { thumbActive--; pump(); });
  }
}
function grabVideoFrame(e, hq) {
  return new Promise((res, rej) => {
    const src = hq ? (e.url_video_hd || e.url_video || e.url_video_low) : (e.url_video || e.url_video_low);
    const CW = hq ? 1280 : 640, CH = hq ? 720 : 360;
    if (!src || /\.m3u8/i.test(src)) return rej();
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    let fin = false;
    const end = cv => { if (fin) return; fin = true; clearTimeout(to); v.removeAttribute('src'); v.load(); cv ? res(cv) : rej(); };
    const to = setTimeout(() => end(null), hq ? 20000 : 12000);
    v.addEventListener('error', () => end(null));
    v.addEventListener('loadedmetadata', () => { const d = v.duration; v.currentTime = isFinite(d) ? Math.min(d * 0.12, 60) : 1; });
    v.addEventListener('seeked', () => {
      try {
        const w = v.videoWidth, hh = v.videoHeight;
        if (!w) return end(null);
        const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
        const s = Math.max(CW / w, CH / hh), cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(v, (CW - w * s) / 2, (CH - hh * s) / 2, w * s, hh * s);
        cv.className = 'frame'; end(cv);
      } catch { end(null); }
    });
    v.src = secure(src);
  });
}

/* Echtes ARD-Vorschaubild (teaserImage) holen, sonst Fallback auf Video-Frame */
const realThumbCache = new Map();
function realThumbUrl(e) {
  const m = /ardmediathek\.de\/.*\/([^\/?#]+)\/?(?:[?#].*)?$/i.exec(e.url_website || '');
  if (!m) return Promise.resolve(null);
  const id = m[1];
  let p = realThumbCache.get(id);
  if (!p) {
    const find = o => { if (!o || typeof o !== 'object') return null; if (o.teaserImage && o.teaserImage.src) return o.teaserImage.src; if (o.image && o.image.src) return o.image.src; for (const k in o) { const r = find(o[k]); if (r) return r; } return null; };
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    p = fetch('https://api.ardmediathek.de/page-gateway/pages/ard/item/' + id + '?devicetype=pc&embedded=true', { signal:ctl.signal })
      .then(r => r.ok ? r.json() : null).then(j => j ? find(j) : null).catch(() => null).finally(() => clearTimeout(to));
    realThumbCache.set(id, p);
  }
  return p;
}
function grabFrame(e, hq) {
  return realThumbUrl(e).then(src => new Promise((res, rej) => {
    if (!src) return rej();
    const im = new Image(), to = setTimeout(rej, 10000);
    im.onload = () => { clearTimeout(to); im.className = 'frame'; im.alt = ''; res(im); };
    im.onerror = () => { clearTimeout(to); rej(); };
    im.src = secure(src.replace('{width}', hq ? '1280' : '640'));
  })).catch(() => grabVideoFrame(e, hq));
}

function Avatar(ch, lg) { return h('span', { class:'avatar' + (lg ? ' lg' : ''), style:`--c:${ch.color}`, title:ch.name }, ch.short); }

function Card(e, { compact = false } = {}) {
  const ch = chanOf(e.channel), pr = getProg(e.id);
  const pct = pr && pr.dur ? Math.min(100, Math.round(pr.pos / pr.dur * 100)) : 0;
  const thumb = h('div', { class:'thumb', style:`--c:${ch.color}` },
    h('span', { class:'tmark' }, ch.short),
    h('span', { class:'play' }, icon('play', 'fill')),
    e.duration ? h('span', { class:'dur' }, fmtDur(e.duration)) : null,
    pct > 2 ? h('span', { class:'bar' }, h('i', { style:`width:${pct}%` })) : null);
  if (store.get('thumbs', true)) { thumb._e = e; thumbIO.observe(thumb); }
  const topic = e.topic && e.topic !== e.title ? e.topic : '';
  return h('a', { class:'card' + (compact ? ' compact' : ''), href:'#/watch/' + encodeURIComponent(e.id) },
    thumb,
    h('div', { class:'meta' }, compact ? null : Avatar(ch),
      h('div', { class:'txt' },
        h('h3', { title:e.title }, e.title),
        h('p', {}, ch.name + (topic ? ' · ' + topic : '')),
        h('p', {}, [rel(e.timestamp), pct > 2 ? `${pct}% gesehen` : ''].filter(Boolean).join(' · ')))));
}
function skeletons(n) {
  return Array.from({ length:n }, () => h('div', { class:'card sk' }, h('div', { class:'thumb' }),
    h('div', { class:'meta' }, h('div', { class:'txt', style:'width:100%' }, h('div', { class:'l', style:'width:90%' }), h('div', { class:'l', style:'width:55%' })))));
}
function emptyBox(ic, text, ...extra) { return h('div', { class:'empty' }, icon(ic), h('div', {}, text), ...extra); }
function errorBox(err, retry) {
  return emptyBox('alert', 'Die Mediathek ist gerade nicht erreichbar.',
    h('div', { style:'font-size:12.5px;color:var(--fg-4)' }, String(err.message || err)),
    h('button', { class:'btn primary', onclick:retry }, icon('refresh'), 'Erneut versuchen'));
}

let routeToken = 0, cleanups = [];
function Feed(host, page, { emptyText = 'Keine Videos gefunden.' } = {}) {
  const tok = routeToken, seen = new Set();
  let offset = 0, done = false, busy = false, count = 0;
  const grid = h('div', { class:'grid' }), foot = h('div', { class:'foot' });
  host.append(grid, foot);
  const io = new IntersectionObserver(es => { if (es[0].isIntersecting) more(); }, { rootMargin:'1800px' });
  io.observe(foot); cleanups.push(() => io.disconnect());
  async function more() {
    if (busy || done || tok !== routeToken) return;
    busy = true;
    const sk = skeletons(count ? 4 : 12); grid.append(...sk);
    try {
      let r, guard = 0;
      do { r = await page(offset); offset += r.raw; if (tok !== routeToken) return; guard++; } while (!r.items.length && !r.done && guard < 4);
      sk.forEach(s => s.remove());
      for (const e of r.items) if (!seen.has(e.id)) { seen.add(e.id); grid.append(Card(e)); count++; }
      done = r.done;
      foot.replaceChildren(!count ? emptyBox('search', emptyText) : '');
    } catch (err) {
      sk.forEach(s => s.remove());
      foot.replaceChildren(errorBox(err, () => { foot.replaceChildren(); busy = false; more(); }));
      return;
    }
    busy = false;
    io.unobserve(foot); io.observe(foot);
  }
  more();
}
function StaticList(host, items, emptyText) {
  const grid = h('div', { class:'grid' }); host.append(grid);
  if (!items.length) { host.append(emptyBox('film', emptyText)); return; }
  items.forEach(e => grid.append(Card(e)));
}

const norm = t => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function groupShows(items, q) {
  const m = new Map(), nq = norm(q), words = nq.split(' ').filter(Boolean);
  for (const e of items) {
    if (!e.topic) continue;
    const k = (e.channel || '') + '|' + e.topic, x = m.get(k) || { topic:e.topic, ch:chanOf(e.channel), n:0, nt:norm(e.topic) };
    x.n++; m.set(k, x);
  }
  let l = Array.from(m.values());
  if (words.length) l = l.filter(x => words.every(w => x.nt.includes(w)));
  const rank = x => x.nt === nq ? 0 : x.nt.startsWith(nq) ? 1 : 2;
  return l.sort((a, b) => rank(a) - rank(b) || b.n - a.n).slice(0, 14);
}
function ShowTile(x) {
  return h('a', { class:'xtile', href:'#/show/' + (x.ch.id || '_') + '/' + encodeURIComponent(x.topic) },
    Avatar(x.ch), h('b', {}, x.topic), h('span', { class:'sub' }, x.ch.name + ' · Sendung'));
}
function ShowsRow(slot, load, q) {
  load().then(r => {
    if (!slot.isConnected) return;
    const l = groupShows(r.items, q);
    if (l.length) slot.append(h('h2', { class:'rowh' }, 'Sendungen'), h('div', { class:'hrow' }, l.map(ShowTile)));
  }).catch(() => {});
}
function Show(arg) {
  const i = arg.indexOf('/'), chid = i < 0 ? '' : arg.slice(0, i), topic = i < 0 ? arg : arg.slice(i + 1);
  const ch = chanById(chid) || null, c = ch || { id:'', name:'ARD', short:'ARD', color:'#666' };
  document.title = `${topic} – Media +`;
  const host = h('div'); let order = 'desc';
  const sel = h('select', { class:'pick', 'aria-label':'Sortierung', onchange:ev => { order = ev.target.value; run(); } },
    h('option', { value:'desc' }, 'Neueste zuerst'), h('option', { value:'asc' }, 'Älteste zuerst'));
  main.append(h('div', { class:'page-h' }, Avatar(c, true),
    h('div', {}, h('h1', {}, topic), h('a', { class:'sub', href:ch ? '#/channel/' + ch.id : '#/' }, c.name + ' · Sendung')),
    h('span', { class:'grow' }), sel), host);
  function run() {
    host.replaceChildren(); routeToken++; cleanups.forEach(f => f()); cleanups = [];
    Feed(host, off => search({ channel:ch, topic, exact:topic, order, offset:off }), { emptyText:'Keine Folgen gefunden.' });
  }
  run();
}

function Continue(target) {
  const p = store.get('prog', {});
  const items = Object.entries(p).filter(([, v]) => v.pos > 15 && v.dur && v.pos < v.dur - 30).sort((a, b) => b[1].t - a[1].t)
    .map(([id]) => cache.get(id) || loadSaved(id)).filter(Boolean).slice(0, 12);
  if (!items.length) return;
  if (target) {
    document.body.classList.add('home-bar');
    const hero = document.querySelector('.hero');
    const prevs = items.map(e => {
      const bg = h('div', { class:'hbg' });
      if (store.get('thumbs', true)) bg._e = e;
      const el = h('div', { class:'hprev' }, bg);
      if (hero) hero.append(el);
      return { el, bg };
    });
    const info = h('div', { class:'hinfo' });
    let cur = -1;
    const fill = e => {
      const ch = chanOf(e.channel), pr = getProg(e.id);
      const pct = pr && pr.dur ? Math.min(100, Math.round(pr.pos / pr.dur * 100)) : 0;
      info.replaceChildren(
        h('span', { class:'hbadge' }, Avatar(ch), ch.name),
        h('h3', {}, e.title),
        h('div', { class:'hmeta' }, [pct > 2 ? pct + '% gesehen' : '', e.duration ? fmtDur(e.duration) : '', rel(e.timestamp)].filter(Boolean).join(' · ')),
        h('p', {}, (e.description || '').trim()));
    };
    const show = i => {
      if (i === cur) return; cur = i;
      prevs.forEach((p, k) => p.el.classList.toggle('on', k === i));
      if (hero) hero.classList.toggle('prev', i >= 0);
      document.body.classList.toggle('home-prev', i >= 0);
      glass.classList.toggle('sel', i >= 0);
      if (i < 0) row.scrollTo({ left:0, behavior:'smooth' });
      if (i >= 0) {
        fill(items[i]);
        info.classList.remove('in'); void info.offsetWidth; info.classList.add('in');
        const p = prevs[i];
        if (p.bg._e && !p.bg._q) { p.bg._q = 1; thumbQueue.push(p.bg); pump(); }
      }
    };
    const cards = items.map((e, i) => {
      const pr = getProg(e.id), ch = chanOf(e.channel);
      const pct = pr && pr.dur ? Math.min(100, Math.max(3, Math.round(pr.pos / pr.dur * 100))) : 0;
      const thumb = h('div', { class:'thumb', style:`--c:${ch.color}` }, h('span', { class:'bar' }, h('i', { style:`width:${pct}%` })));
      if (store.get('thumbs', true)) { thumb._e = e; thumbIO.observe(thumb); }
      const a = h('a', { class:'card compact', href:'#/watch/' + encodeURIComponent(e.id), 'aria-label':e.title }, thumb);
      a._i = i; return a;
    });
    const row = h('div', { class:'hrow' }, cards);
    const glass = h('section', { class:'hglass' }, h('div', { class:'hl' }, h('h2', { class:'rowh' }, 'Weiterschauen'), row), info);
    const idxOf = ev => { const c = ev.target.closest && ev.target.closest('.card'); return c && c._i != null ? c._i : -1; };
    row.addEventListener('focusin', ev => { const i = idxOf(ev); if (i >= 0) show(i); });
    row.addEventListener('mouseover', ev => { const i = idxOf(ev); if (i >= 0) { show(i); row.scrollTo({ left:Math.max(0, cards[Math.max(0, i - 1)].offsetLeft - cards[0].offsetLeft), behavior:'smooth' }); } });
    glass.addEventListener('focusout', ev => { if (!ev.relatedTarget || !glass.contains(ev.relatedTarget)) show(-1); });
    glass.addEventListener('mouseleave', () => { if (!glass.contains(document.activeElement)) show(-1); });
    target.append(glass);
    /* Ruhezustand: so viele Karten, wie in die Leiste passen */
    const fit = () => {
      if (!glass.isConnected) { window.removeEventListener('resize', fit); return; }
      glass.style.setProperty('--hfull', cards.length);
    };
    fit(); requestAnimationFrame(fit); setTimeout(fit, 400); window.addEventListener('resize', fit);
    return;
  }
  main.append(h('h2', { class:'rowh' }, 'Weiterschauen'), h('div', { class:'hrow' }, items.map(e => Card(e))));
}


/* ===== Apps (Store, Installation, Start) ===== */
const APPS_LOGO = 'https://github.com/patrickdevel/mediaplus-streaming/blob/main/applogo/apps.png?raw=true';
const APPS_SRC = 'https://raw.githubusercontent.com/patrickdevel/mediaplus-streaming/main/appstore.txt';
const rawGh = u => u || '';
const APPS_FALLBACK = [{ name:'sona. (SoundCloud Edition)', updated:'16.11.2026', description:'Stream your favorite music from everywhere!', installslite:'https://mediaplus-streaming.vercel.app/apps/sona.html/', logo:APPS_LOGO }];
let appWin = null, layerEl = null;
const appKey = a => a.installslite || a.name;
const LOGO_V = Date.now();
const bust = u => u ? u + (u.includes('?') ? '&' : '?') + 'v=' + LOGO_V : u;
const installedApps = () => { const cat = store.get('appcat', []); return store.get('apps', []).map(a => { const c = cat.find(x => appKey(x) === appKey(a)); return c ? { name:a.name, installslite:a.installslite, ...c } : { name:a.name, installslite:a.installslite }; }); };
async function fetchApps() {
  try {
    let t = null;
    for (const u of [APPS_SRC, 'https://github.com/patrickdevel/mediaplus-streaming/raw/main/appstore.txt', 'https://mediaplus-streaming.vercel.app/appstore.txt', 'https://raw.githubusercontent.com/patrickdevel/mediaplus-streaming/main/apps.html']) {
      try { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache:'no-store' }); if (r.ok) { t = await r.text(); break; } } catch {}
    }
    if (!t) throw 0;
    if (/<\w+[^>]*>/.test(t)) { t = t.replace(/<br\s*\/?>|<\/(p|div|li|pre|tr|h\d)>/gi, '\n'); const ta = document.createElement('textarea'); ta.innerHTML = t.replace(/<[^>]+>/g, ''); t = ta.value; }
    const list = t.split(/^\s*-{3,}\s*$/m).map(b => { const o = {}; b.split('\n').forEach(l => { const m = l.match(/^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/); if (m) o[m[1].toLowerCase()] = m[2]; }); return o; }).filter(o => o.name && o.installslite);
    if (!list.length) throw 0;
    store.set('appcat', list); return list;
  } catch { return store.get('appcat', APPS_FALLBACK); }
}
function Logo(a) {
  if (a.settings) { const g = h('div', { class:'alg set' }); g.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-settings"/></svg>'; return g; }
  const u = bust(a.logo || APPS_LOGO), w = h('div', { class:'alg' });
  const bg = h('img', { class:'lgb', src:u, alt:'' }), im = h('img', { class:'lgf', src:u, alt:'' });
  im.onload = () => { if (im.naturalWidth / im.naturalHeight > 1.6) w.classList.add('wide'); };
  im.onerror = () => { w.classList.add('ph'); if (a.name === 'Apps') w.innerHTML = '<svg viewBox="0 0 24 24" fill="#fff"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>'; else w.replaceChildren(h('b', {}, (a.name || '?')[0].toUpperCase())); };
  w.append(bg, im); return w;
}
const warmed = new Set();
function warm(u) { if (!u || warmed.has(u)) return; warmed.add(u); try { const o = new URL(u).origin; const p = document.createElement('link'); p.rel = 'preconnect'; p.href = o; p.crossOrigin = ''; document.head.append(p); const f = document.createElement('link'); f.rel = 'prefetch'; f.href = u; document.head.append(f); } catch {} }
const selSnd = new Audio('selectpitched.mp3'); selSnd.preload = 'auto';
function appTile(a, onOpen) {
  const lg = Logo(a), nm = h('span', {}, a.name), box = h('div', { class:'atm' }, nm);
  lg.append(h('div', { class:'atn' }, box));
  const b = h('button', { class:'atile', type:'button', 'aria-label':a.name }, lg);
  const measure = () => { const d = nm.scrollWidth - box.clientWidth; box.classList.toggle('scroll', d > 1); box.style.setProperty('--d', -d + 'px'); box.style.setProperty('--t', Math.max(2, d / 30) + 's'); };
  b.addEventListener('mouseenter', measure); b.addEventListener('focus', measure);
  b.onclick = () => { try { selSnd.currentTime = 0; selSnd.play().catch(() => {}); } catch {} onOpen(a, b); };
  if (a.installslite) { b.addEventListener('focus', () => warm(a.installslite)); b.addEventListener('mouseover', () => warm(a.installslite)); warm(a.installslite); }
  return b;
}
function AppsBar(target) {
  const row = h('div', { class:'arow' });
  const swipe = h('div', { class:'hswipe', 'aria-hidden':'true' }); swipe.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg><span>Für Vollbild nach oben wischen</span>';
  const wrap = h('section', { class:'happs' }, swipe, h('h2', { class:'rowh' }, 'Apps'), row);
  const paint = () => row.replaceChildren(appTile({ name:'Apps', logo:APPS_LOGO }, (a, b) => openStore(b)), appTile({ name:'Einstellungen', settings:true }, (a, b) => openSettings(b)), ...installedApps().map(a => appTile(a, (x, b) => launchApp(x, b))));
  paint(); wrap._paint = paint; window._appsPaint = paint;
  target.append(wrap);
  fetchApps().then(() => { if (wrap.isConnected) paint(); });
}
function openStore(opener) {
  if (layerEl) return;
  const svg = document.querySelector('svg symbol') && document.querySelector('svg symbol').parentNode;
  if (svg && !svg.querySelector('#i-sgrid')) svg.insertAdjacentHTML('beforeend', '<symbol id="i-sgrid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></symbol><symbol id="i-scheck" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></symbol><symbol id="i-scompass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></symbol><symbol id="i-sbox" viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/></symbol>');
  let cat = [], tab = 'start', det = null, q = '', timer = null;
  const isIn = a => store.get('apps', []).some(x => appKey(x) === appKey(a));
  const main = h('div', { class:'amain' });
  main.addEventListener('scroll', () => main.style.setProperty('--mt', main.scrollTop > 6 ? '9vh' : '0px'));
  const tabs = [['start', 'Start', 'sgrid'], ['installed', 'Installiert', 'scheck'], ['discover', 'Entdecken', 'scompass'], ['search', 'Suche', 'search']];
  const side = h('div', { class:'aside' },
    h('div', { class:'ahead' }, Logo({ name:'Apps', logo:APPS_LOGO }), h('h2', {}, 'Apps')),
    tabs.map(([k, l, ic]) => { const b = h('button', { class:'xt', type:'button', 'data-t':k }, icon(ic), h('span', {}, l)); b.onclick = () => { det = null; tab = k; render(); }; return b; }),
    h('div', { class:'afoot' }, 'Zurück schließt den Store'));
  const back = h('button', { class:'aback', type:'button', 'aria-label':'Zurück' });
  back.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg><span>Zurück</span>';
  const el = h('div', { class:'astore', role:'dialog', 'aria-label':'Apps' }, back, side, main);
  back.onclick = () => el._close();
  const tile = (a, i) => { const b = h('button', { class:'xtile', style:'--i:' + Math.min(i, 14), type:'button', 'aria-label':a.name }, Logo(a), h('b', {}, a.name), h('span', {}, a.description || ''), isIn(a) ? h('i', {}, icon('scheck'), 'Installiert') : null); b.onclick = () => { det = a; render(true); }; return b; };
  const grid = l => l.length ? h('div', { class:'agrid' }, l.map(tile)) : h('div', { class:'aempty' }, icon('sbox'), 'Nichts gefunden.');
  const sh = (t, n) => h('div', { class:'ash' }, h('h3', {}, t), n == null ? null : h('span', {}, String(n)));
  const instBtn = a => {
    const lbl = h('em'), bar = h('i'), btn = h('button', { class:'abtn pri', type:'button' }, bar, lbl); let busy = false;
    const upd = () => { bar.style.width = '0'; lbl.textContent = isIn(a) ? 'Öffnen' : 'Installieren'; };
    btn.onclick = () => {
      if (busy) return;
      if (isIn(a)) { close(); return launchApp(a, null); }
      busy = true; let p = 0;
      const t = setInterval(() => {
        p = Math.min(100, p + 3 + Math.random() * 9); bar.style.width = p + '%'; lbl.textContent = Math.floor(p) + ' %';
        if (p >= 100) { clearInterval(t); store.set('apps', [...store.get('apps', []), { name:a.name, installslite:a.installslite }]); busy = false; upd(); window._appsPaint && window._appsPaint(); toast(a.name + ' installiert'); const d = main.querySelector('.adel'); if (d) d.hidden = false; }
      }, 120);
    };
    upd(); return btn;
  };
  const detail = a => {
    const del = h('button', { class:'abtn adel', type:'button', hidden:!isIn(a) }, h('em', {}, 'Deinstallieren'));
    del.onclick = async () => { if (await askConfirm(a.name + ' deinstallieren?', 'Deinstallieren')) { store.set('apps', store.get('apps', []).filter(x => appKey(x) !== appKey(a))); window._appsPaint && window._appsPaint(); det = null; render(); } };
    const ib = instBtn(a);
    setTimeout(() => ib.focus({ preventScroll:true }), 50);
    return h('div', { class:'adet aglass' }, Logo(a), h('div', {}, h('h2', {}, a.name),
      h('div', { class:'meta' }, h('span', {}, 'Kostenlos'), a.updated ? h('span', {}, 'Aktualisiert ' + a.updated) : null, isIn(a) ? h('span', {}, 'Installiert') : null),
      h('p', {}, a.description || ''), h('div', { class:'acts' }, ib, del)));
  };
  function render(keepFocus) {
    clearInterval(timer);
    side.querySelectorAll('.xt').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    main.scrollTop = 0;
    el.classList.toggle('detail', !!det);
    if (det) { const more = cat.filter(x => appKey(x) !== appKey(det)); return main.replaceChildren(...[detail(det), more.length ? sh('Das könnte dir auch gefallen', more.length) : null, more.length ? grid(more.slice(0, 12)) : null].filter(Boolean)); }
    if (tab === 'start') {
      const feat = cat.slice(0, 5); let i = 0;
      const slides = feat.map((a, k) => { const l = Logo(a); if (!k) l.classList.add('on'); return l; });
      const dots = feat.map((a, k) => h('i', { class:k ? '' : 'on' }));
      const tt = h('b', {}, feat[0] ? feat[0].name : ''), dd = h('span', { class:'hd' }, feat[0] ? feat[0].description || '' : '');
      const hero = feat.length ? h('button', { class:'ahero', type:'button', 'aria-label':'Empfohlen' }, ...slides, h('div', { class:'ht' }, h('span', { class:'chip' }, 'Empfohlen'), tt, dd, h('span', { class:'cta' }, 'Ansehen')), h('div', { class:'dots' }, ...dots)) : null;
      if (hero) {
        hero.onclick = () => { det = feat[i]; render(true); };
        if (feat.length > 1) timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); slides[i].classList.remove('on'); dots[i].classList.remove('on'); i = (i + 1) % feat.length; slides[i].classList.add('on'); dots[i].classList.add('on'); tt.textContent = feat[i].name; dd.textContent = feat[i].description || ''; }, 5000);
      }
      const ins = cat.filter(isIn), rest = cat.filter(a => !isIn(a));
      main.replaceChildren(...[hero, ins.length ? sh('Installiert', ins.length) : null, ins.length ? grid(ins.slice(0, 6)) : null, sh('Entdecken', rest.length), grid(rest.slice(0, 12))].filter(Boolean));
    } else if (tab === 'installed') { const l = installedApps(); main.replaceChildren(sh('Installiert', l.length), grid(l)); }
    else if (tab === 'discover') main.replaceChildren(sh('Entdecken', cat.length), grid(cat));
    else {
      const sqt = h('span', {}), sq = h('div', { class:'asq', tabindex:'0', role:'textbox', 'aria-label':'Suche' }, icon('search'), sqt), res = h('div');
      const draw = () => { sqt.textContent = q || 'Apps suchen …'; sqt.style.color = q ? '#111' : 'rgba(0,0,0,.45)'; const l = cat.filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase())); res.replaceChildren(grid(l)); };
      const keys = h('div', { class:'akeys' }, [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '␣', '⌫'].map(k => h('button', { type:'button', onclick:() => { q = k === '⌫' ? q.slice(0, -1) : k === '␣' ? q + ' ' : q + k; draw(); } }, k)));
      sq.addEventListener('keydown', ev => { if (/^[a-z0-9 ]$/i.test(ev.key)) { q += ev.key; draw(); ev.stopPropagation(); } else if (ev.key === 'Backspace') { q = q.slice(0, -1); draw(); ev.stopPropagation(); } });
      main.replaceChildren(sq, keys, res); draw();
    }
    if (!keepFocus && !det) return;
  }
  function close() { clearInterval(timer); el.classList.remove('show'); layerEl = null; setTimeout(() => el.remove(), 300); if (opener && opener.isConnected) opener.focus({ preventScroll:true }); }
  el._close = (force) => { if (det && !force) { det = null; render(); const t = main.querySelector('.xtile,.ahero'); t && t.focus({ preventScroll:true }); } else close(); };
  document.body.append(el); layerEl = el; render();
  zoomOpen(opener, () => { el.classList.add('show'); (side.querySelector('.on') || side.querySelector('.xt')).focus({ preventScroll:true }); });
  fetchApps().then(l => { cat = l; if (!det) render(); });
}

/* ===== Einstellungen (nur echte Optionen) ===== */
(function(){ if (store.get('noanim', false)) document.body.classList.add('noanim'); if (store.get('cursor', false)) document.documentElement.style.cursor = 'auto'; })();
function openSettings(opener) {
  if (layerEl) return;
  const r = opener ? opener.getBoundingClientRect() : { top:innerHeight * .42, left:innerWidth * .42, right:innerWidth * .58, bottom:innerHeight * .58 };
  const el = h('div', { class:'aset', role:'dialog', 'aria-label':'Einstellungen' });
  el.style.setProperty('--t', r.top + 'px'); el.style.setProperty('--l', r.left + 'px'); el.style.setProperty('--r', (innerWidth - r.right) + 'px'); el.style.setProperty('--b', (innerHeight - r.bottom) + 'px');
  const title = h('h1', {}, 'Einstellungen'), list = h('div', { class:'slist' }), sname = h('small', {}, 'Einstellungen');
  const ico = h('div', { class:'sfl' }, h('div', { class:'sico' }, h('div', {}, h('b', {}, 'Media+'), sname)));
  const file = h('input', { type:'file', accept:'application/json,.json', hidden:true, onchange:async ev => { try { PLUS.importData(JSON.parse(await ev.target.files[0].text())); toast('Importiert'); route(); } catch { toast('Datei nicht lesbar'); } } });
  el.append(h('div', { class:'sin' }, title, ico, list), file);
  const chev = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = '<path d="m9 5 7 7-7 7"/>'; return s; };
  const g = (k, d) => store.get(k, d), same = (a, b) => typeof a === 'number' ? Math.abs(a - b) < .001 : a === b;
  const cue = () => g('cue', {}), setCue = o => { store.set('cue', { ...cue(), ...o }); PLUS.applyLook(); };
  /* Typen: toggle (an/aus), cycle (Werte durchschalten), action, link, info */
  const T = (label, get, set) => ({ t:'toggle', label, get, set });
  const TK = (label, key, def, fn) => T(label, () => g(key, def), v => { store.set(key, v); fn && fn(v); });
  const C = (label, vals, get, set) => ({ t:'cycle', label, vals, get, set });
  const CK = (label, key, vals, def, fn) => C(label, vals, () => g(key, def), v => { store.set(key, v); fn && fn(v); });
  const A = (label, fn, dng) => ({ t:'action', label, fn, dng });
  const L = (label, href) => ({ t:'link', label, href });
  const I = (label, val) => ({ t:'info', label, val: typeof val === 'function' ? val : () => val });
  const reroute = () => route();
  const saver = () => { ScreenSaver.schedule(); };
  const wipe = (key, label) => A(label, async () => { if (await askConfirm(label + '?', 'Löschen')) { store.set(key, Array.isArray(g(key, [])) ? [] : {}); markNav(); toast('Erledigt'); } }, true);
  const cats = [
    ['Darstellung', [
      T('Dunkles Design', () => document.documentElement.dataset.theme === 'dark', v => { store.set('theme', v ? 'dark' : 'light'); setTheme(v ? 'dark' : 'light'); }),
      TK('Vorschaubilder', 'thumbs', true, reroute),
      CK('Akzentfarbe', 'accent', [['Standard', ''], ['Blau', '#0070f3'], ['Rot', '#e5484d'], ['Grün', '#30a46c'], ['Orange', '#f5a623'], ['Lila', '#8e4ec6']], '', () => { PLUS.applyLook(); reroute(); }),
      CK('Kartengröße', 'cw', [['Klein', .8], ['Mittel', 1], ['Groß', 1.3]], 1, () => { PLUS.applyLook(); reroute(); }),
      CK('Helligkeit', 'bright', [['70 %', .7], ['100 %', 1], ['130 %', 1.3]], 1, () => PLUS.applyLook()),
      TK('Animationen reduzieren', 'noanim', false, v => document.body.classList.toggle('noanim', v)),
      TK('Maus-Zeiger anzeigen', 'cursor', false, v => { document.documentElement.style.cursor = v ? 'auto' : 'none'; })]],
    ['Wiedergabe', [
      TK('Nächstes Video automatisch', 'autonext', true),
      CK('Geschwindigkeit', 'speed', [['0,75×', .75], ['1×', 1], ['1,25×', 1.25], ['1,5×', 1.5], ['2×', 2]], 1),
      C('Untertitel-Größe', [['Klein', .8], ['Mittel', 1], ['Groß', 1.4], ['XL', 1.9]], () => cue().size || 1, v => setCue({ size:v })),
      C('Untertitel-Hintergrund', [['Aus', 'transparent'], ['Halb', 'rgba(0,0,0,.6)'], ['Schwarz', '#000']], () => cue().bg || 'rgba(0,0,0,.6)', v => setCue({ bg:v })),
      C('Untertitel-Farbe', [['Weiß', '#fff'], ['Gelb', '#ff0'], ['Cyan', '#0ff']], () => cue().fg || '#fff', v => setCue({ fg:v }))]],
    ['Bildschirmschoner', [
      TK('Bildschirmschoner', 'saverOn', true, v => v ? saver() : ScreenSaver.hide()),
      TK('Uhr anzeigen', 'saverClock', true, saver),
      CK('Starten nach', 'saverDelay', [['1 Min.', 1], ['5 Min.', 5], ['10 Min.', 10], ['20 Min.', 20], ['30 Min.', 30]], 5, saver),
      CK('Motiv', 'saverMode', [['Snoopy', 'snoopy'], ['Bilder', 'images']], 'snoopy', saver),
      TK('Empfehlungen anzeigen', 'saverRecs', true, saver),
      CK('Schwarz nach', 'saverBlack', [['Nie', 0], ['10 Min.', 10], ['20 Min.', 20], ['30 Min.', 30], ['60 Min.', 60]], 30, saver),
      CK('Bildwechsel', 'saverInterval', [['10 s', 10], ['30 s', 30], ['60 s', 60]], 30, saver)]],
    ['Apps', [
      I('Installierte Apps', () => String(store.get('apps', []).length)),
      TK('Beim Schließen nachfragen', 'askclose', true),
      A('App-Katalog neu laden', async () => { await fetchApps(); window._appsPaint && window._appsPaint(); toast('Katalog aktualisiert'); }),
      A('Alle Apps deinstallieren', async () => { if (await askConfirm('Alle Apps deinstallieren?', 'Deinstallieren')) { store.set('apps', []); window._appsPaint && window._appsPaint(); toast('Apps entfernt'); } }, true)]],
    ['Zugänglichkeit', [
      L('Audiodeskription', '#/access/ad'), L('Gebärdensprache', '#/access/dgs'), L('Mit Untertitel', '#/access/ut')]],
    ['Kopplung', [
      IS_TV ? L('Mit Handy koppeln (QR)', '#/pair') : L('An TV senden', '#/send')]],
    ['Daten', [
      A('Exportieren (JSON)', () => PLUS.exportData()),
      A('Importieren …', () => file.click()),
      wipe('hist', 'Verlauf löschen'), wipe('saved', 'Gemerkte Videos löschen'),
      A('Alles zurücksetzen', async () => { if (await askConfirm('Alle Einstellungen und Daten zurücksetzen?', 'Zurücksetzen')) { try { Object.keys(localStorage).filter(k => k.startsWith('mt:')).forEach(k => localStorage.removeItem(k)); } catch {} location.reload(); } }, true)]],
    ['Info', [
      I('Verlauf', () => String(store.get('hist', []).length)), I('Gemerkt', () => String(store.get('saved', []).length)),
      I('Netzwerk', () => navigator.onLine ? 'Verbunden' : 'Offline'),
      A('Verbindung testen', async () => { const t0 = Date.now(); try { await fetch(location.href, { cache:'no-store', method:'HEAD' }); toast('Online · ' + (Date.now() - t0) + ' ms'); } catch { toast('Keine Verbindung'); } })]]
  ];
  let sub = null;
  const pop = n => { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); };
  const row = (label, right, onclick, cls, i) => { const b = h('button', { class:'srow' + (cls ? ' ' + cls : ''), type:'button', style:'--i:' + i }, h('span', {}, label), right); if (onclick) b.onclick = onclick; return b; };
  const label = (it, v) => { const f = it.vals.find(x => same(x[1], v)); return f ? f[0] : it.vals[0][0]; };
  function draw(dir, focusIdx) {
    list.className = 'slist ' + dir; list.replaceChildren(); list.scrollTop = 0;
    const name = sub == null ? 'Einstellungen' : cats[sub][0];
    title.textContent = name; sname.textContent = name; pop(title); pop(sname);
    let i = 0;
    if (sub == null) cats.forEach(([n], k) => list.append(row(n, chev(), () => { sub = k; draw('fwd', 0); }, '', i++)));
    else {
      list.append(row('Zurück', '', () => { const k = sub; sub = null; draw('back', k); }, 'bk', i++));
      cats[sub][1].forEach(it => {
        if (it.t === 'toggle') {
          const tg = h('span', { class:'tg' + (it.get() ? ' on' : '') });
          list.append(row(it.label, tg, () => { const v = !it.get(); it.set(v); tg.classList.toggle('on', !!it.get()); }, '', i++));
        } else if (it.t === 'cycle') {
          const v = h('span', { class:'v' }, label(it, it.get()));
          list.append(row(it.label, v, () => { const cur = it.vals.findIndex(x => same(x[1], it.get())); const nx = it.vals[(cur + 1) % it.vals.length]; it.set(nx[1]); v.textContent = nx[0]; pop(v); }, '', i++));
        } else if (it.t === 'action') list.append(row(it.label, '', () => it.fn(), it.dng ? 'dng' : '', i++));
        else if (it.t === 'link') list.append(row(it.label, chev(), () => { el._close(true); location.hash = it.href; }, '', i++));
        else list.append(row(it.label, h('span', { class:'v' }, it.val()), null, 'inf', i++));
      });
    }
    const t = list.children[sub == null ? (focusIdx || 0) : Math.min(1, list.children.length - 1)]; if (t) t.focus({ preventScroll:true });
  }
  el._close = (force) => {
    if (sub != null && !force) { const k = sub; sub = null; draw('back', k); return; }
    el.classList.remove('show'); layerEl = null; setTimeout(() => el.remove(), 450);
    if (opener && opener.isConnected) opener.focus({ preventScroll:true });
  };
  el.addEventListener('scroll', ev => { if (ev.target !== list) { ev.target.scrollTop = 0; ev.target.scrollLeft = 0; } }, true);
  list.addEventListener('scroll', () => list.style.setProperty('--mt', list.scrollTop > 6 ? '9vh' : '0px'));
  document.body.append(el); layerEl = el; draw('fwd', 0); list.style.setProperty('--d', '120ms');
  zoomOpen(opener, () => { el.classList.add('show'); const f = list.children[0]; f && f.focus({ preventScroll:true }); });
}

/* ===== Kontrollzentrum (3-Punkte-Button neben der Uhr) ===== */
let sleepT = 0, sleepEnd = 0, sleepMin = 0;
function setSleep(min) {
  clearTimeout(sleepT); sleepT = 0; sleepEnd = 0; sleepMin = min;
  if (!min) return;
  sleepEnd = Date.now() + min * 60000;
  sleepT = setTimeout(() => {
    sleepT = 0; sleepEnd = 0; sleepMin = 0;
    document.querySelectorAll('video:not(.saver-video)').forEach(v => { try { v.pause(); } catch {} });
    ScreenSaver.show(true); toast('Einschlaf-Timer abgelaufen');
  }, min * 60000);
}
function ccSyms() {
  const f = document.querySelector('svg symbol'), svg = f && f.parentNode;
  if (!svg || svg.querySelector('#i-dots')) return;
  svg.insertAdjacentHTML('beforeend',
    '<symbol id="i-dots" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></symbol>' +
    '<symbol id="i-phone" viewBox="0 0 24 24"><rect x="6.5" y="2" width="11" height="20" rx="3"/><path d="M10.5 18.5h3"/></symbol>' +
    '<symbol id="i-shuffle" viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></symbol>' +
    '<symbol id="i-timer" viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="8"/><path d="M12 9.5v4l2.5 2M9.5 2h5"/></symbol>');
}
function openControl(opener) {
  if (layerEl) { if (layerEl.classList.contains('acc')) layerEl._close(); return; }
  ccSyms();
  const el = h('div', { class:'acc mz', role:'dialog', 'aria-label':'Kontrollzentrum' });
  const bg = h('div', { class:'acc-bg' });
  const tiles = [];
  const T = (cls, kids, fn, label) => { const b = h('button', { class:'t ' + cls, type:'button', 'aria-label':label }, ...kids); b.onclick = fn; tiles.push(b); return b; };
  const go = fn => { el._close(); setTimeout(fn, 300); };
  const dark = () => document.documentElement.dataset.theme === 'dark';

  const tm = h('b', { class:'ctime' });
  const tick = () => { const d = new Date(); tm.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const clock = T('big', [tm, h('span', {}, 'Bildschirmschoner')], () => go(() => ScreenSaver.show(true)), 'Bildschirmschoner mit Uhr starten');

  const thI = h('span', { class:'ti' }), thS = h('small', {});
  const paintTh = () => { thI.replaceChildren(icon(dark() ? 'moon' : 'sun')); thS.textContent = dark() ? 'Dunkel' : 'Hell'; };
  const theme = T('pill', [thI, h('span', { class:'tx' }, h('b', {}, 'Design'), thS)], () => { const v = dark() ? 'light' : 'dark'; store.set('theme', v); setTheme(v); paintTh(); }, 'Design wechseln');

  const SL = [0, 15, 30, 60], slS = h('small', {});
  const paintSl = () => { slS.textContent = sleepMin ? sleepMin + ' Min.' : 'Aus'; sleep.classList.toggle('on', !!sleepMin); };
  const sleep = T('pill', [h('span', { class:'ti' }, icon('timer')), h('span', { class:'tx' }, h('b', {}, 'Einschlafen'), slS)], () => { setSleep(SL[(SL.indexOf(sleepMin) + 1) % SL.length]); paintSl(); }, 'Einschlaf-Timer');

  const rand = T('pill wide', [h('span', { class:'ti' }, icon('shuffle')), h('span', { class:'tx' }, h('b', {}, 'Überrasch mich'), h('small', {}, 'Zufälliges Video'))], () => go(() => { location.hash = '#/random'; }), 'Zufälliges Video');

  const rnd = (ic, label, fn) => T('rnd', [icon(ic)], () => go(fn), label);
  const row = h('div', { class:'acc-row' },
    rnd('search', 'Suche', () => { location.hash = '#/suche'; }),
    rnd('phone', IS_TV ? 'Mit Handy koppeln' : 'An TV senden', () => { location.hash = IS_TV ? '#/pair' : '#/send'; }),
    rnd('grid', 'Apps', () => openStore(opener)),
    rnd('settings', 'Einstellungen', () => openSettings(opener)));
  const cap = h('div', { class:'acc-cap' });
  const panel = h('div', { class:'acc-panel' }, clock, theme, sleep, rand, row, cap);
  el.addEventListener('focusin', ev => { const t = ev.target.closest && ev.target.closest('.t'); cap.textContent = t && t.classList.contains('rnd') ? t.getAttribute('aria-label') : ''; });
  bg.addEventListener('mousedown', () => el._close());
  el.append(bg, panel);

  tick(); paintTh(); paintSl();
  const iv = setInterval(tick, 5000), hc = () => el._close();
  window.addEventListener('hashchange', hc);
  el._close = () => {
    if (el._closing) return; el._closing = true;
    clearInterval(iv); window.removeEventListener('hashchange', hc); opener.classList.remove('on');
    el.classList.remove('show', 'rdy'); if (layerEl === el) layerEl = null;
    setTimeout(() => el.remove(), 700);
    if (opener && opener.isConnected) opener.focus({ preventScroll:true });
  };
  document.body.append(el); layerEl = el; opener.classList.add('on');

  /* Start: jede Kachel fliegt vom Button aus an ihren Platz (nahe zuerst), beim Schließen zurück */
  const pr = panel.getBoundingClientRect(), o = opener.getBoundingClientRect(), ox = o.left + o.width / 2, oy = o.top + o.height / 2;
  const pos = tiles.map(t => { let x = 0, y = 0, n = t; while (n && n !== panel) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { t, cx:pr.left + x + t.offsetWidth / 2, cy:pr.top + y + t.offsetHeight / 2 }; });
  pos.forEach(p => { p.d = Math.hypot(ox - p.cx, oy - p.cy); }); pos.sort((a, b) => a.d - b.d);
  pos.forEach((p, i) => { p.t.style.setProperty('--dx', (ox - p.cx) * .9 + 'px'); p.t.style.setProperty('--dy', (oy - p.cy) * .9 + 'px'); p.t.style.setProperty('--od', i * 36 + 'ms'); p.t.style.setProperty('--cd', (pos.length - 1 - i) * 16 + 'ms'); });
  void el.offsetWidth;
  requestAnimationFrame(() => { el.classList.remove('mz'); el.classList.add('show'); clock.focus({ preventScroll:true }); });
  setTimeout(() => { if (layerEl === el) el.classList.add('rdy'); }, 1000);
}

/* Klick: Icon schrumpft kurz, springt dann federnd auf Vollbild, danach öffnet sich sofort die App */
function zoomOpen(from, ready) {
  if (!from || !from.isConnected) { requestAnimationFrame(() => ready && ready()); return; }
  const r = from.getBoundingClientRect(), lg = from.querySelector('.alg');
  const z = h('div', { class:'zoomic' }), bl = h('div', { class:'ablur' });
  z.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  if (lg) z.append(lg.cloneNode(true));
  document.body.append(bl, z); void z.offsetWidth;
  requestAnimationFrame(() => { z.classList.add('shr'); bl.classList.add('on'); });
  setTimeout(() => { z.classList.remove('shr'); z.classList.add('go'); z.style.cssText = 'left:0;top:0;width:100vw;height:100vh;border-radius:0'; }, 150);
  setTimeout(() => { ready && ready(); }, 560);
  setTimeout(() => { z.classList.add('out'); bl.classList.remove('on'); }, 600);
  setTimeout(() => { z.remove(); bl.remove(); }, 1000);
}
function launchApp(a, from) {
  if (appWin) return;
  const win = h('div', { class:'awin' });
  const sp = h('div', { class:'asplash' }, Logo(a), h('div', { class:'asp' }));
  const fr = h('iframe', { title:a.name, allow:'autoplay; fullscreen; encrypted-media', tabindex:'0' });
  fr.src = a.installslite;
  win.append(fr, sp); document.body.append(win);
  appWin = win; win._frame = fr; win._from = from;
  history.pushState({ mpApp:1 }, '');
  const t0 = Date.now();
  zoomOpen(from, () => win.classList.add('full'));
  const reveal = () => { sp.classList.add('out'); try { fr.focus(); fr.contentWindow.focus(); } catch {} };
  fr.addEventListener('load', () => hookFrameKeys(fr));
  fr.onload = () => setTimeout(reveal, Math.max(0, 640 - (Date.now() - t0)));
  setTimeout(reveal, 8000);
}

/* ===== Tasten-Klassen: Systemtasten bleiben beim System, OK wird normalisiert ===== */
const keyIsVol = (k, c) => /^(AudioVolume(Up|Down|Mute)|Volume(Up|Down|Mute))$/.test(k) || [173, 174, 175, 447, 448, 449].includes(c);
const keyIsSys = (k, c) => keyIsVol(k, c) || /^(VoiceAssist|LaunchAssistant|Assistant|VoiceDial|Settings|Menu|ContextMenu|Info|Help)$/.test(k) || [231, 93, 82, 457].includes(c);
const keyIsSearch = (k, c) => k === 'BrowserSearch' || k === 'Search' || c === 170 || c === 84 && false;
const keyIsOk = (k, c) => k === 'Enter' || c === 13 || k === 'Select' || k === 'OK' || k === 'Accept' || [23, 29443, 65376].includes(c);
window.addEventListener('message', ev => {
  const d = ev.data; if (!d || !appWin || !appWin._frame || ev.source !== appWin._frame.contentWindow) return;
  if (d.type === 'mp-app-search') openAppSearch();
});
function hookFrameKeys(fr) {
  try {
    fr.contentWindow.addEventListener('keydown', ev => {
      const k = ev.key, c = ev.keyCode;
      if (k === 'Home' || k === 'BrowserHome' || k === 'GoHome' || c === 36 || c === 458 || c === 10073) { ev.preventDefault(); goHomeNow(); return; }
      if (keyIsSearch(k, c)) { ev.preventDefault(); ev.stopImmediatePropagation(); openAppSearch(); return; }
      if (keyIsSys(k, c)) { ev.stopImmediatePropagation(); return; } /* App darf diese Tasten nicht abfangen, kein preventDefault -> System bekommt sie */
      if (k !== 'Enter' && c !== 13 && keyIsOk(k, c)) { ev.preventDefault(); ev.stopImmediatePropagation(); try { fr.contentWindow.postMessage({ type:'mp-key', key:'Enter', keyCode:13 }, '*'); } catch {} }
    }, true);
    ['keyup', 'keypress'].forEach(t => fr.contentWindow.addEventListener(t, ev => { if (keyIsSys(ev.key, ev.keyCode)) ev.stopImmediatePropagation(); }, true));
  } catch {}
}

/* ===== Suche aus der App heraus: App live verblurrt, Such-Pill oben rechts ===== */
let appSearch = null;
function openAppSearch(text) {
  if (appSearch) { if (text != null && appSearch._set) appSearch._set(text); return; }
  if (!appWin || dlgEl) return;
  const inp = h('input', { class:'aovl-inp', type:'search', placeholder:'Suchen …', 'aria-label':'Suche', autocomplete:'off', autocorrect:'off', spellcheck:'false' });
  const pill = h('div', { class:'aovl-pill' }, icon('search'), inp);
  const out = h('div', { class:'aovl-res' });
  const bg = h('div', { class:'aovl-bg' });
  const el = h('div', { class:'aovl', role:'dialog', 'aria-label':'Suche' }, bg, pill, out);
  document.body.append(el); appSearch = el;
  requestAnimationFrame(() => el.classList.add('on'));
  let t = 0, tok = 0;
  const q = () => inp.value.trim();
  const leave = async (target) => {
    if (el._asking) return; el._asking = true;
    const ok = await askConfirm('Die App wird verlassen. Fortfahren?', 'Verlassen');
    el._asking = false;
    if (!ok) { (el.contains(document.activeElement) ? document.activeElement : inp).focus(); return; }
    const w = appWin; closeAppSearch(true);
    if (w) { appWin = null; w.classList.remove('full'); setTimeout(() => w.remove(), 400); if (history.state && history.state.mpApp) history.back(); }
    setTimeout(() => { location.hash = target; }, 160);
  };
  const run = async () => {
    const text = q(), my = ++tok;
    if (!text) { out.replaceChildren(); return; }
    try {
      const r = await search({ text, size:12 });
      if (my !== tok || !appSearch) return;
      const shows = groupShows(r.items, text).slice(0, 6), vids = r.items.slice(0, 6);
      const nodes = [];
      if (shows.length) nodes.push(h('h2', { class:'rowh' }, 'Sendungen'), h('div', { class:'aovl-shows' }, shows.map(ShowTile)));
      if (vids.length) nodes.push(h('h2', { class:'rowh' }, 'Videos'), h('div', { class:'aovl-vids' }, vids.map(e => Card(e, { compact:true }))));
      if (!nodes.length) nodes.push(h('p', { class:'aovl-none' }, 'Keine Ergebnisse'));
      out.replaceChildren(...nodes);
    } catch { if (my === tok) out.replaceChildren(h('p', { class:'aovl-none' }, 'Suche nicht möglich')); }
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 280); });
  el.addEventListener('click', ev => {
    const a = ev.target.closest && ev.target.closest('a[href^="#/"]');
    if (!a) return; ev.preventDefault(); ev.stopPropagation(); leave(a.getAttribute('href'));
  }, true);
  const items = () => [inp, ...out.querySelectorAll('a[href^="#/"]')];
  el._key = ev => {
    if (dlgEl) return;
    const k = ev.key, c = ev.keyCode;
    if (keyIsSys(k, c)) { ev.stopPropagation(); return; }
    if (k === 'Home' || k === 'BrowserHome' || k === 'GoHome' || c === 36 || c === 458 || c === 10073) { closeAppSearch(true); return; }
    ev.stopPropagation();
    const typing = document.activeElement === inp;
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || c === 461 || c === 10009 || (k === 'Backspace' && !(typing && inp.value))) { ev.preventDefault(); closeAppSearch(); return; }
    if (keyIsOk(k, c)) {
      if (typing) { ev.preventDefault(); leave(q() ? '#/search/' + encodeURIComponent(q()) : '#/search'); }
      else if (document.activeElement && document.activeElement.click) { ev.preventDefault(); document.activeElement.click(); }
      return;
    }
    const dir = { ArrowUp:-1, ArrowDown:1, ArrowLeft:-1, ArrowRight:1 }[k] || ({ 38:-1, 40:1, 37:-1, 39:1 })[c];
    if (dir) {
      const horiz = k === 'ArrowLeft' || k === 'ArrowRight' || c === 37 || c === 39;
      if (typing && horiz) return;
      ev.preventDefault();
      const l = items(), i = Math.max(0, l.indexOf(document.activeElement)), n = Math.min(l.length - 1, Math.max(0, i + dir));
      if (l[n]) { l[n].focus(); if (n > 0) l[n].scrollIntoView({ block:'nearest', inline:'nearest' }); }
    }
  };
  el._set = v => { inp.value = v; clearTimeout(t); run(); try { inp.focus(); } catch {} };
  window.addEventListener('keydown', el._key, true);
  inp.focus();
  if (text) el._set(text);
}
function closeAppSearch(silent) {
  const el = appSearch; if (!el) return; appSearch = null;
  window.removeEventListener('keydown', el._key, true);
  el.classList.remove('on'); setTimeout(() => el.remove(), 300);
  if (!silent && appWin) { try { appWin._frame.focus(); appWin._frame.contentWindow.focus(); } catch {} }
}

async function askCloseApp() {
  if (!appWin || appWin._asking) return; appWin._asking = true;
  const ok = store.get('askclose', true) ? await askConfirm('App wirklich schließen?', 'Schließen') : true;
  if (!appWin) return; appWin._asking = false;
  if (ok) closeApp(); else { try { appWin._frame.focus(); } catch {} }
}
function closeApp() {
  const w = appWin; if (!w) return; appWin = null;
  w.classList.remove('full');
  setTimeout(() => w.remove(), 520);
  if (history.state && history.state.mpApp) history.back();
  if (w._from && w._from.isConnected) w._from.focus({ preventScroll:true });
}
window.addEventListener('popstate', () => {
  if (appWin && !(history.state && history.state.mpApp)) { history.pushState({ mpApp:1 }, ''); askCloseApp(); }
});
window.addEventListener('message', ev => { if (ev.data && ev.data.type === 'mp-home') return goHomeNow(); if (appWin && ev.data && ev.data.type === 'mp-app-exit') askCloseApp(); });

function Rows() {
  const tok = routeToken, used = new Set();
  const saved = store.get('saved', []);
  if (saved.length) main.append(h('h2', { class:'rowh' }, 'Gemerkt'), h('div', { class:'hrow' }, saved.slice(0, 14).map(e => Card(e))));
  const defs = [
    { t:'Neu in der Mediathek', q:'', min:600 }, { t:'Tatort', q:'Tatort', min:1800 }, { t:'Dokumentationen', q:'Dokumentation', min:900 },
    { t:'Nachrichten & Magazine', q:'Tagesschau', min:0 }, { t:'Krimi', q:'Krimi', min:900 }, { t:'Serien', q:'Serie', min:600 },
    { t:'Comedy & Kabarett', q:'Comedy', min:300 }, { t:'Wissen', q:'Wissen', min:300 }, { t:'Filme', q:'Spielfilm', min:3600 },
    { t:'Sport', q:'Sportschau', min:0 }, { t:'Kinder', q:'Kinder', min:300 }, { t:'Reportagen', q:'Reportage', min:600 }, { t:'Musik & Konzerte', q:'Konzert', min:600 }
  ];
  defs.forEach(d => {
    const row = h('div', { class:'hrow' }, skeletons(6)), wrap = h('section', { class:'hsec' }, h('h2', { class:'rowh' }, d.t), row);
    main.append(wrap);
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin:'900px' });
    io.observe(wrap); cleanups.push(() => io.disconnect());
    async function load() {
      try {
        const r = await search({ text:d.q, min:d.min, size:40 });
        if (tok !== routeToken) return;
        const items = r.items.filter(e => !used.has(e.id)).slice(0, 14);
        if (!items.length) return wrap.remove();
        items.forEach(e => used.add(e.id));
        row.replaceChildren(...items.map(e => Card(e)));
      } catch { wrap.remove(); }
    }
  });
  main.append(h('h2', { class:'rowh' }, 'Alle neuen Videos'));
}

function Browse(label) {
  const idx = Math.max(0, CHIPS.findIndex(c => c.label === label)), chip = CHIPS[idx];
  document.title = 'Media + – ARD-Videos';
  const row = h('div', { class:'chips' }, CHIPS.map(c => h('a', { class:'chip' + (c === chip ? ' active' : ''), href:c.label === 'Neu' ? '#/' : '#/browse/' + encodeURIComponent(c.label) }, c.label)));
  if (chip.label === 'Neu') {
    document.body.classList.add('home');
    main.append(h('div', { class:'hcover' }));
    Hero();
    const spacer = h('div', { class:'hspacer' }); main.append(spacer);
    const first = h('div', { class:'hfirst' }); spacer.append(first);
    AppsBar(first);
    Continue(spacer);
    main.append(row);
    const onScroll = () => {
      const y = window.scrollY, H = window.innerHeight, p = Math.min(1, Math.max(0, y / (H * .7)));
      document.body.style.setProperty('--hp', p.toFixed(3));
      const cp = document.querySelector('.chips'); document.body.classList.toggle('home-scrolled', !!cp && cp.getBoundingClientRect().top < H * .6);
    };
    const clk = h('div', { class:'hclock' });
    const tick = () => { const d = new Date(); clk.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    tick(); const ct = setInterval(tick, 10000); document.body.append(clk);
    ccSyms();
    const more = h('button', { class:'hmore', type:'button', 'aria-label':'Kontrollzentrum', onclick:() => openControl(more) }, icon('dots', 'fill'));
    document.body.append(more);
    cleanups.push(() => { clearInterval(ct); clk.remove(); more.remove(); });
    document.body.classList.add('home-ap');
    const apFocus = () => { const a = document.activeElement; document.body.classList.toggle('home-ap', !a || a === document.body || !!a.closest('.happs,#side,.hmore,.acc')); };
    const apOut = () => setTimeout(apFocus, 0);
    document.addEventListener('focusin', apFocus); document.addEventListener('focusout', apOut);
    cleanups.push(() => { document.removeEventListener('focusin', apFocus); document.removeEventListener('focusout', apOut); document.body.classList.remove('home-ap'); });
    window.addEventListener('scroll', onScroll, { passive:true }); onScroll();
    cleanups.push(() => { window.removeEventListener('scroll', onScroll); document.body.style.removeProperty('--hp'); });
    Rows();
  } else main.append(row);
  Feed(main, off => search({ text:chip.q, min:chip.min, offset:off }), { emptyText:'Dazu gibt es gerade nichts.' });
}

const SORTS = { rel:['Relevanz', { sort:'rel' }], new:['Neueste zuerst', { sort:'timestamp', order:'desc' }], old:['Älteste zuerst', { sort:'timestamp', order:'asc' }], long:['Längste zuerst', { sort:'duration', order:'desc' }] };
const DURS = { all:['Jede Länge', {}], s:['Unter 10 Min', { max:600 }], m:['10–45 Min', { min:600, max:2700 }], l:['Über 45 Min', { min:2700 }] };
let sortKey = 'rel', durKey = 'all';

/* =========================================================
   Suchscreen: Tabs (Videos/Songs) jetzt BEI den Treffern
   ========================================================= */
function SearchScreen(q0) {
  document.title = 'Suche – Media +';
  let q = q0 || '', t = 0, mode = 'videos';

  const disp = h('div', { class:'sdisp' });
  const resInner = h('div');

  const tabVideos = h('button', { class:'chip active', type:'button', 'data-mode':'videos', 'aria-pressed':'true' }, icon('film'), 'Videos');
  const tabSongs  = h('button', { class:'chip',         type:'button', 'data-mode':'songs',  'aria-pressed':'false' }, icon('music'), 'Songs');
  const tabs = h('div', { class:'stabs sres-tabs' }, tabVideos, tabSongs);

  const res = h('div', { class:'sres' }, tabs, resInner);

  const setMode = m => {
    if (m === mode) return;
    mode = m;
    tabVideos.classList.toggle('active', m === 'videos');
    tabSongs.classList.toggle('active',  m === 'songs');
    tabVideos.setAttribute('aria-pressed', String(m === 'videos'));
    tabSongs.setAttribute('aria-pressed',  String(m === 'songs'));
    document.title = (m === 'songs' ? 'Songsuche' : 'Suche') + ' – Media +';
    if (q.trim().length >= 2) go();
    else resInner.replaceChildren(emptyBox('search', 'Tippe links einen Suchbegriff ein.'));
  };
  tabs.addEventListener('click', ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    setMode(b.dataset.mode);
  });

  const draw = () => { disp.replaceChildren(h('span', {}, q || 'Suchbegriff eingeben …'), h('i', { class:'caret' })); disp.classList.toggle('ph', !q); };

  async function go(ff) {
    clearTimeout(t);
    const tok = routeToken, term = q.trim();
    const tl = term.toLowerCase();
    if (tl === '///clock') { ScreenSaver.show(true); return; }
    if (tl === '///hi') { Welcome.show(); return; }
    if (tl === '///reload') { history.replaceState(null, '', location.href.split('#')[0]); location.reload(); return; }
    resInner.replaceChildren();
    if (term.length < 2) { resInner.append(emptyBox('search', 'Tippe links einen Suchbegriff ein.')); return; }
    remember(term); drawHist();

    if (mode === 'songs') {
      const hd2 = h('h2', { class:'rowh' }, 'Songs · „' + term + '“');
      const slist = h('div', { class:'slist' }, emptyBox('search', 'Suche läuft …'));
      resInner.append(hd2, slist);
      try {
        const l = await SC.search(term);
        if (tok !== routeToken || term !== q.trim() || mode !== 'songs') return;
        if (!l.length) { slist.replaceChildren(emptyBox('music', `Keine Songs für „${term}“ gefunden.`)); }
        else {
          slist.replaceChildren(...l.map(SongRow));
          hd2.textContent = 'Songs · ' + l.length + ' Treffer';
          if (ff === true) { const a = slist.querySelector('.srow-a'); if (a) focusEl(a); }
        }
      } catch (err) {
        if (tok !== routeToken) return;
        slist.replaceChildren(emptyBox('alert', 'Die Songsuche ist gerade nicht möglich.',
          h('div', { style:'font-size:12.5px;color:var(--fg-4)' }, String(err.message || err))));
      }
      return;
    }

    const slot = h('div'), hd2 = h('h2', { class:'rowh' }, 'Folgen und Videos'),
          grid = h('div', { class:'grid' }, skeletons(4));
    resInner.append(slot, hd2, grid);
    ShowsRow(slot, async () => {
      const [a, b] = await Promise.all([search({ text:term, size:150 }), search({ topic:term, size:150 })]);
      const ids = new Set(a.items.map(x => x.id));
      return { items:[...a.items, ...b.items.filter(x => !ids.has(x.id))] };
    }, term);
    try {
      const r = await search({ text:term, size:24 });
      if (tok !== routeToken || term !== q.trim() || mode !== 'videos') return;
      if (!r.items.length) { resInner.replaceChildren(emptyBox('search', `Nichts gefunden für „${term}“.`)); return; }
      grid.replaceChildren();
      if (r.total) hd2.textContent = 'Folgen und Videos · ' + r.total.toLocaleString('de-DE') + ' Treffer';
      r.items.forEach(e => grid.append(Card(e, { compact:true })));
      if (ff === true) focusEl(grid.querySelector('a'));
    } catch (err) { if (tok === routeToken) resInner.replaceChildren(errorBox(err, go)); }
  }

  const edit = fn => { fn(); draw(); clearTimeout(t); t = setTimeout(go, 700); };
  const key = (label, fn, cls = '') => h('button', { class:'key ' + cls, type:'button', onclick:fn }, label);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜß0123456789'.split('');
  const kb = h('div', { class:'keys' },
    letters.map(c => key(c, () => edit(() => { q += c.toLowerCase(); }))),
    key('Leerzeichen', () => edit(() => { if (q && !q.endsWith(' ')) q += ' '; }), 'w3'),
    key('⌫ Löschen', () => edit(() => { q = q.slice(0, -1); }), 'w2'),
    key('Leeren', () => edit(() => { q = ''; }), 'w2'));

  const hist = h('div', { class:'shist' });
  const drawHist = () => {
    const list = store.get('recent', []);
    hist.hidden = !list.length;
    if (!list.length) { hist.replaceChildren(); return; }
    hist.replaceChildren(h('h4', {}, 'Verlauf'),
      ...list.map(x => h('button', { class:'hitem', type:'button', onclick:() => { q = x; draw(); clearTimeout(t); go(); } }, icon('history'), h('span', {}, x))),
      h('button', { class:'hitem clr', type:'button', onclick:async () => { if (await askConfirm('Suchverlauf wirklich leeren?')) { store.set('recent', []); drawHist(); const f = main.querySelector('.skb .key'); f && focusEl(f); } } }, 'Verlauf leeren'));
  };
  drawHist();

  main.append(h('div', { class:'sscreen' }, h('div', { class:'sleft' }, h('div', { class:'skb' }, disp, kb), hist), res));
  draw();
  if (q) go(); else resInner.append(emptyBox('search', 'Tippe links einen Suchbegriff ein.'));
}

function Channel(id) {
  const ch = chanById(id);
  if (!ch) return main.append(emptyBox('tv', 'Sender nicht gefunden.'));
  document.title = `${ch.name} – Media +`;
  const host = h('div');
  const slot = h('div');
  main.append(h('div', { class:'page-h' }, Avatar(ch, true), h('div', {}, h('h1', {}, ch.name), h('span', { class:'sub' }, 'Sender'))), slot, h('h2', { class:'rowh' }, 'Neueste Videos'), host);
  ShowsRow(slot, () => search({ channel:ch, min:300, size:150 }), '');
  Feed(host, off => search({ channel:ch, min:300, offset:off }));
}

function Library(tab) {
  const hist = tab !== 'saved';
  document.title = (hist ? 'Verlauf' : 'Gemerkt') + ' – Media +';
  const list = store.get(hist ? 'hist' : 'saved', []);
  const host = h('div');
  main.append(h('div', { class:'page-h' },
    h('h1', {}, hist ? 'Verlauf' : 'Gemerkt'),
    h('span', { class:'grow' }),
    list.length ? h('button', { class:'btn', onclick:async () => { if (await askConfirm((hist ? 'Verlauf' : 'Merkliste') + ' wirklich leeren?')) { store.set(hist ? 'hist' : 'saved', []); route(); } } }, icon('trash'), 'Leeren') : null), host);
  StaticList(host, list, hist ? 'Noch nichts angesehen.' : 'Noch nichts gemerkt. Tippe beim Video auf „Merken“.');
}

function ttml2vtt(x) {
  const d = new DOMParser().parseFromString(x, 'application/xml');
  if (d.querySelector('parsererror')) return null;
  const ps = Array.from(d.getElementsByTagNameNS('*', 'p'));
  const tt = s => {
    if (!s) return NaN;
    if (/ms$/.test(s)) return parseFloat(s) / 1000;
    if (/s$/.test(s)) return parseFloat(s);
    const m = s.split(':').map(parseFloat);
    return m.length >= 3 ? m[0] * 3600 + m[1] * 60 + m[2] : NaN;
  };
  const txt = n => [...n.childNodes].map(c => c.nodeType === 3 ? c.nodeValue.replace(/\s+/g, ' ') : c.localName === 'br' ? '\n' : txt(c)).join('');
  const cues = ps.map(p => ({ b:tt(p.getAttribute('begin')), e:tt(p.getAttribute('end')), t:txt(p).trim() })).filter(c => isFinite(c.b) && isFinite(c.e) && c.t);
  if (!cues.length) return null;
  const off = Math.min(...cues.map(c => c.b)) >= 36000 ? 36000 : 0;
  const f = s => { s = Math.max(0, s - off); const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = (s % 60).toFixed(3).padStart(6, '0'); return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}:${sec}`; };
  return 'WEBVTT\n\n' + cues.map(c => `${f(c.b)} --> ${f(c.e)}\n${c.t}`).join('\n\n');
}

let hlsPromise;
function loadHls() {
  if (window.Hls) return Promise.resolve();
  return hlsPromise || (hlsPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js';
    s.onload = res; s.onerror = rej; document.head.append(s);
  }));
}

/* Einzeiliger Lauftext mit Fade links/rechts – nur wenn der Text nicht in die Zeile passt */
function mq(el) {
  if (!el || el._mq || !el.textContent.trim()) return;
  el._mq = 1; el.classList.add('mq');
  el.replaceChildren(h('span', { class:'mq-in' }, el.textContent));
}
function mqFit(el) {
  if (!el || !el._mq) return;
  el.classList.remove('mq-on');
  const sp = el.firstChild, over = sp.offsetWidth - el.clientWidth;
  if (over > 2) {
    const pad = 3 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 10);
    el.style.setProperty('--mq-p', pad + 'px');
    el.style.setProperty('--mq-x', -(over + pad) + 'px');
    el.style.setProperty('--mq-d', Math.max(8, over / 40 + 5).toFixed(1) + 's');
    el.classList.add('mq-on');
  }
}
function Hero() {
  const tok = routeToken, shell = h('section', { class:'hero' });
  const ld = h('div', { class:'hload' }, h('span', { class:'hload-t' }, 'Media', h('small', {}, '+')));
  shell.append(ld);
  document.body.insertBefore(shell, main);
  cleanups.push(() => shell.remove());
  search({ min:1800, size:30 }).then(r => {
    if (tok !== routeToken) return;
    const good = r.items.filter(x => (x.description || '').length > 80);
    const list = [], tops = new Set();
    for (const x of [...good, ...r.items]) {
      if (list.length >= 6) break;
      const k = x.topic || x.title;
      if (list.includes(x) || tops.has(k)) continue;
      tops.add(k); list.push(x);
    }
    if (!list.length) return shell.remove();
    const track = h('div', { class:'htrack' }), dots = h('div', { class:'hdots' });
    const slides = list.map((e, i) => {
      const ch = chanOf(e.channel), bg = h('div', { class:'hbg' });
      if (store.get('thumbs', true)) bg._e = e;
      const link = h('a', { class:'btn primary big', href:'#/watch/' + encodeURIComponent(e.id), tabindex:i ? '-1' : null }, icon('play', 'fill'), 'Jetzt abspielen');
      dots.append(h('i', {}));
      return { bg, link, el:h('div', { class:'hslide' }, bg, h('div', { class:'hin' },
        h('span', { class:'hbadge' }, Avatar(ch), ch.name),
        h('h2', {}, e.title),
        h('p', {}, (e.description || '').trim()),
        h('div', { class:'hact' }, link,
          h('span', { class:'sub' }, [e.duration ? fmtDur(e.duration) : '', rel(e.timestamp)].filter(Boolean).join(' · '))))) };
    });
    slides.forEach(s => track.append(s.el));
    shell.append(track, dots);
    ld.classList.add('out'); setTimeout(() => ld.remove(), 600);
    const mqEls = slides.flatMap(sl => [sl.el.querySelector('h2'), sl.el.querySelector('p')]);
    mqEls.forEach(mq);
    const mqAll = () => mqEls.forEach(mqFit);
    requestAnimationFrame(mqAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mqAll);
    window.addEventListener('resize', mqAll); cleanups.push(() => window.removeEventListener('resize', mqAll));
    const n = slides.length;
    if (store.get('thumbs', true)) { slides.slice().reverse().forEach(s => { if (s.bg._e) thumbQueue.push(s.bg); }); pump(); }
    let idx = 0, timer = 0, x0 = 0, y0 = 0;
    const go = i => {
      const prev = slides[idx];
      idx = ((i % n) + n) % n;
      track.style.transform = `translateX(-${idx * 100}%)`;
      Array.from(dots.children).forEach((d, k) => d.classList.toggle('on', k === idx));
      slides.forEach((s, k) => s.link.setAttribute('tabindex', k === idx ? '0' : '-1'));
      if (prev !== slides[idx] && prev.el.contains(document.activeElement)) slides[idx].link.focus({ preventScroll:true });
    };
    const start = () => {
      clearInterval(timer);
      if (n < 2) return;
      timer = setInterval(() => { if (!shell.isConnected) return clearInterval(timer); if (!document.hidden) go(idx + 1); }, 6000);
    };
    shell.addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive:true });
    shell.addEventListener('touchend', ev => {
      const dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { go(idx + (dx < 0 ? 1 : -1)); start(); }
    }, { passive:true });
    cleanups.push(() => clearInterval(timer));
    go(0); start();
    if (document.body.classList.contains('home') && window.scrollY < 5) {
      const ae = document.activeElement;
      if (!ae || ae === document.body) { window.scrollTo(0, 0); const t = $('.happs .atile'); (t || slides[0].link).focus({ preventScroll:true }); }
    }
  }).catch(() => shell.remove());
}

/* Player – FIX: kein exitFullscreen mehr */
function buildPlayer(video, perr) {
  const root = h('div', { class:'player', tabindex:'0' });
  const dur = () => isFinite(video.duration) ? video.duration : 0;
  const toggle = () => video.paused ? video.play().catch(() => {}) : video.pause();
  // NUR Vollbild betreten – niemals verlassen
  const fs = () => { if (document.fullscreenElement) return; root.requestFullscreen ? root.requestFullscreen().catch(() => {}) : video.webkitEnterFullscreen && video.webkitEnterFullscreen(); };
  const ib = (ic, label, fn, cls = '') => h('button', { class:'pb ' + cls, type:'button', 'aria-label':label, title:label, onclick:fn }, icon(ic, ic === 'play' || ic === 'pause' ? 'fill' : ''));

  const rl = h('div', { class:'ripple', style:'left:0' }, '−10 s'), rr = h('div', { class:'ripple', style:'right:0' }, '+10 s');
  const skip = (s, el) => {
    video.currentTime = Math.max(0, Math.min(dur() || 1e9, video.currentTime + s));
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  };
  const big = h('button', { class:'big-play', type:'button', 'aria-label':'Abspielen', onclick:toggle }, icon('play', 'fill'));
  const spin = h('div', { class:'spin' });

  const buf = h('i', { class:'buf' }), fill = h('i', { class:'fill' }), knob = h('i', { class:'knob' }), tip = h('span', { class:'tip' }, '0:00');
  const seek = h('div', { class:'seek', role:'slider', tabindex:'-1', 'aria-label':'Position' }, h('div', { class:'trk' }, buf, fill), knob, tip);
  const time = h('span', { class:'pt' }, '0:00 / 0:00');
  const paint = () => {
    const d = dur(), p = d ? video.currentTime / d * 100 : 0, b = video.buffered;
    fill.style.width = p + '%'; knob.style.left = p + '%';
    buf.style.width = (d && b.length ? b.end(b.length - 1) / d * 100 : 0) + '%';
    time.textContent = fmtDur(video.currentTime) + ' / ' + fmtDur(d);
  };
  const frac = ev => { const r = seek.getBoundingClientRect(); return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); };
  let drag = false;
  const go = ev => { const d = dur(); if (d) { video.currentTime = frac(ev) * d; paint(); } };
  seek.addEventListener('pointerdown', ev => { drag = true; seek.classList.add('drag'); seek.setPointerCapture(ev.pointerId); go(ev); });
  seek.addEventListener('pointermove', ev => { const f = frac(ev); tip.style.left = f * 100 + '%'; tip.textContent = fmtDur(f * dur()); if (drag) go(ev); });
  const endDrag = () => { drag = false; seek.classList.remove('drag'); };
  seek.addEventListener('pointerup', endDrag); seek.addEventListener('pointercancel', endDrag);

  const pp = ib('play', 'Wiedergabe (K)', toggle);
  const b10 = ib('back', '10 s zurück (J)', () => skip(-10, rl)); b10.append(h('small', {}, '10'));
  const f10 = ib('fwd', '10 s vor (L)', () => skip(10, rr)); f10.append(h('small', {}, '10'));
  const mute = ib('vol', 'Ton (M)', () => { video.muted = !video.muted; });
  const vol = h('input', { class:'vol', type:'range', min:0, max:1, step:.02, 'aria-label':'Lautstärke' });
  vol.value = store.get('vol', 1); video.volume = +vol.value;
  video.defaultPlaybackRate = video.playbackRate = store.get('speed', 1);
  vol.addEventListener('input', () => { video.muted = false; video.volume = +vol.value; store.set('vol', +vol.value); });
  video.addEventListener('volumechange', () => { mute.replaceChildren(icon(video.muted || !video.volume ? 'mute' : 'vol')); vol.value = video.muted ? 0 : video.volume; });

  const settingsBtn = h('button', { class:'pb', type:'button', 'aria-label':'Einstellungen', title:'Einstellungen' }, icon('settings'));
  const pmenu = h('div', { class:'pmenu', hidden:true });
  let qualities = [], currentQ = null, onQuality = null;
  const renderMenu = () => {
    pmenu.replaceChildren();
    pmenu.append(h('div', { class:'pmenu-lbl' }, 'Geschwindigkeit'));
    const sr = h('div', { class:'pmenu-opts' });
    [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach(s => {
      sr.append(h('button', { class:'pmenu-btn' + (Math.abs(video.playbackRate - s) < .01 ? ' on' : ''), type:'button', onclick:() => { video.defaultPlaybackRate = video.playbackRate = s; store.set('speed', s); renderMenu(); } }, s + '×'));
    });
    pmenu.append(sr);
    if (qualities.length > 1) {
      pmenu.append(h('div', { class:'pmenu-div' }));
      pmenu.append(h('div', { class:'pmenu-lbl' }, 'Qualität'));
      const qr = h('div', { class:'pmenu-opts' });
      qualities.forEach(q => {
        qr.append(h('button', { class:'pmenu-btn' + (q.value === currentQ ? ' on' : ''), type:'button', onclick:() => { currentQ = q.value; onQuality && onQuality(q); renderMenu(); } }, q.label));
      });
      pmenu.append(qr);
    }
    if (root.subTrack) {
      pmenu.append(h('div', { class:'pmenu-div' }));
      pmenu.append(h('div', { class:'pmenu-lbl' }, 'Untertitel'));
      const srow = h('div', { class:'pmenu-opts' });
      const isOn = root.subTrack.track && root.subTrack.track.mode === 'showing';
      srow.append(h('button', { class:'pmenu-btn' + (isOn ? ' on' : ''), type:'button', onclick:() => { root.toggleSubs && root.toggleSubs(); renderMenu(); } }, isOn ? 'An' : 'Aus'));
      pmenu.append(srow);
    }
  };
  settingsBtn.onclick = ev => {
    ev.stopPropagation();
    pmenu.hidden = !pmenu.hidden;
    if (!pmenu.hidden) renderMenu();
  };
  document.addEventListener('pointerdown', ev => {
    if (!pmenu.hidden && !settingsBtn.contains(ev.target) && !pmenu.contains(ev.target)) pmenu.hidden = true;
  });

  const cc = ib('captions', 'Untertitel', () => { root.toggleSubs && root.toggleSubs(); }); cc.hidden = true;
  const pip = document.pictureInPictureEnabled ? ib('pip', 'Bild-in-Bild', () => (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture()).catch(() => {}), 'pipb') : null;
  const fsb = ib('full', 'Vollbild (F)', fs);
  document.addEventListener('fullscreenchange', () => fsb.classList.toggle('on', document.fullscreenElement === root));

  const row = h('div', { class:'prow' },
    pp, b10, f10,
    h('div', { class:'vwrap' }, mute, vol),
    time, h('span', { class:'pf' }),
    cc, settingsBtn, pip, fsb);

  const sync = () => { root.classList.toggle('playing', !video.paused && !video.ended); pp.replaceChildren(icon(video.paused ? 'play' : 'pause', 'fill')); };
  ['play', 'pause', 'ended'].forEach(t => video.addEventListener(t, sync));
  video.addEventListener('waiting', () => root.classList.add('wait'));
  ['playing', 'canplay', 'pause', 'error'].forEach(t => video.addEventListener(t, () => root.classList.remove('wait')));
  ['timeupdate', 'progress', 'durationchange', 'loadedmetadata'].forEach(t => video.addEventListener(t, paint));

  let ct;
  video.addEventListener('click', ev => {
    if (!pmenu.hidden) { pmenu.hidden = true; return; }
    clearTimeout(ct);
    if (ev.detail > 1) {
      const r = video.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width;
      return x < .33 ? skip(-10, rl) : x > .67 ? skip(10, rr) : fs();
    }
    ct = setTimeout(toggle, 230);
  });

  let it;
  const HIDE_MS = 4000;
  const isPlaying = () => !video.paused && !video.ended;
  const armTimer = () => {
    clearTimeout(it);
    if (!isPlaying()) return;
    it = setTimeout(() => { if (isPlaying() && !root.classList.contains('panel') && !root.classList.contains('morep')) root.classList.add('idle'); }, HIDE_MS);
  };
  const wake = () => { root.classList.remove('idle'); armTimer(); };
  const showControls = () => { clearTimeout(it); root.classList.remove('idle'); };
  const onAnyInput = () => { if (root.isConnected) wake(); };

  root.addEventListener('pointermove', wake);
  root.addEventListener('pointerdown', wake);
  root.addEventListener('pointerleave', () => { if (isPlaying()) { clearTimeout(it); root.classList.add('idle'); } });
  document.addEventListener('keydown', onAnyInput, true);

  video.addEventListener('play', wake);
  video.addEventListener('playing', wake);
  video.addEventListener('waiting', showControls);
  video.addEventListener('pause', showControls);
  video.addEventListener('ended', showControls);

  cleanups.push(() => {
    clearTimeout(it);
    document.removeEventListener('keydown', onAnyInput, true);
  });

  const ptitle = h('span', {});
  // FIX: backBtn verlässt nie das Vollbild
  const backBtn = ib('left', 'Zurück', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
  root.setTitle = t => { ptitle.textContent = t; };
  root.skip = s => skip(s, s < 0 ? rl : rr);
  root.toggle = toggle;
  root.append(video, rl, rr, spin, big, perr, pmenu, h('div', { class:'ptop' }, backBtn, ptitle), h('div', { class:'pc' }, seek, row));
  root.ccBtn = cc;
  root.setQualities = (qs, cur, fn) => { qualities = qs; currentQ = cur; onQuality = fn; if (!pmenu.hidden) renderMenu(); };
  root.setSubs = (track, onToggle) => {
    root.subTrack = track;
    root.toggleSubs = onToggle;
    cc.hidden = !track;
    if (!pmenu.hidden) renderMenu();
  };
  sync(); paint();
  return root;
}

/* SoundCloud */
const SC_BASE = '';
const SC = (() => {
  const cache = new Map(), seen = new Set();
  const GEN = ['all-music', 'hiphoprap', 'electronic', 'pop', 'danceedm', 'house', 'techno', 'trap', 'rbsoul', 'ambient'];
  const api = async (p, q) => {
    const r = await fetch(SC_BASE + '/api/' + p + '?' + new URLSearchParams(q), { headers:{ 'x-key':sessionStorage.getItem('key') || '' } });
    if (r.status === 401) { const k = prompt('Zugriffscode:'); if (k) { sessionStorage.setItem('key', k); return api(p, q); } }
    const d = await r.json().catch(() => ({ error:'Ungültige Antwort' }));
    if (!r.ok) throw new Error(d.error || 'Fehler');
    return d;
  };
  const art = u => u ? String(u).replace(/-(large|t\d+x\d+|crop|badge|small|tiny)\./, '-t500x500.') : '';
  const stream = async t => {
    if (t.streamUrl) return t.streamUrl;
    const m = await api('track', { url:t.permalinkUrl });
    t.streamUrl = m.streamUrl; t.duration = t.duration || m.duration;
    if (!t.streamUrl) throw new Error('Kein Stream');
    return t.streamUrl;
  };
  const likes = () => { const l = store.get('scLikes', []); return Array.isArray(l) ? l : []; };
  const isLiked = id => likes().some(x => x.id == id);
  const toggleLike = t => {
    let l = likes(); const on = !l.some(x => x.id == t.id);
    l = on ? [{ id:t.id, title:t.title, permalinkUrl:t.permalinkUrl, duration:t.duration, artworkUrl:t.artworkUrl, artist:t.artist ? { username:t.artist.username } : null }, ...l] : l.filter(x => x.id != t.id);
    store.set('scLikes', l.slice(0, 300));
    document.querySelectorAll('#side [data-cnt="scLikes"]').forEach(n => { n.textContent = l.length || ''; });
    return on;
  };
  const norm = t => {
    const u = t.artist || t.user || {};
    return { id:t.id, title:t.title || 'Unbekannt', permalinkUrl:t.permalinkUrl || t.permalink_url || t.url || '',
      duration:t.duration, artworkUrl:t.artworkUrl || t.artwork_url || u.avatar_url || '', streamUrl:t.streamUrl,
      artist: (u.username || t.artistName) ? { username:u.username || t.artistName } : null };
  };
  const listFrom = d => {
    if (Array.isArray(d)) return d;
    if (!d || typeof d !== 'object') return [];
    for (const k of ['collection', 'tracks', 'items', 'results', 'data']) {
      const l = listFrom(d[k]); if (l.length) return l;
    }
    return [];
  };
  async function search(q) {
    const d = await api('search', { q, query:q, type:'tracks', kind:'tracks' });
    const l = listFrom(d);
    return l.map(norm).filter(t => t.id && t.permalinkUrl).map(t => {
      if (!cache.has(t.permalinkUrl)) cache.set(t.permalinkUrl, Object.assign({}, t));
      return t;
    });
  }
  async function feed(n) {
    const g = GEN[Math.floor(Math.random() * GEN.length)];
    const d = await api('explore', { type:'trending', genre:g, kind:'trending' });
    const raw = listFrom(d);
    const l = raw.map(norm).filter(t => t && t.id && t.permalinkUrl && !seen.has(t.id))
      .sort(() => Math.random() - .5).slice(0, n);
    return l.map(t => { seen.add(t.id); cache.set(t.permalinkUrl, t); return { sc:t, id:'sc' + t.id, title:t.title, topic:'' }; });
  }
  async function mix(arr) {
    let songs = []; try { songs = await feed(Math.max(1, Math.ceil(arr.length / 2))); } catch {}
    if (!songs.length) return arr;
    const out = [];
    arr.forEach((e, i) => { out.push(e); if (i % 2 === 1 && songs.length) out.push(songs.shift()); });
    return out.concat(songs);
  }
  return { api, art, norm, stream, feed, mix, search, cache, likes, isLiked, toggleLike };
})();

async function SongWatch(url) {
  Mini.close();
  const tok = routeToken, wrap = h('div', { class:'watch' });
  main.append(wrap);
  let t = SC.cache.get(url);
  try {
    if (!t || !t.streamUrl) { const m = await SC.api('track', { url }); t = Object.assign({}, t || {}, SC.norm(m)); t.permalinkUrl = t.permalinkUrl || url; SC.cache.set(url, t); }
  } catch (err) { wrap.append(h('div', { class:'perr show' }, icon('alert'), h('p', {}, 'Song konnte nicht geladen werden: ' + (err.message || err)))); return; }
  if (tok !== routeToken) return;
  document.title = `${t.title} – Media +`;
  const video = h('video', { playsinline:true, preload:'auto', autoplay:true });
  const perr = h('div', { class:'perr' }, icon('alert'), h('p', {}, 'Dieser Song lässt sich hier nicht abspielen.'));
  const player = buildPlayer(video, perr);
  player.setTitle(t.title); player.classList.add('song');
  const cov = SC.art(t.artworkUrl);
  player.prepend(h('div', { class:'sbg' }, h('div', { class:'sbg-b', style: cov ? `background-image:url("${cov}")` : '' }), h('div', { class:'sbg-c' }, cov ? h('img', { src:cov, alt:'' }) : null)));
  let hls = null;
  const kill = () => { if (hls) { hls.destroy(); hls = null; } video.pause(); video.removeAttribute('src'); video.load(); };
  const fail = () => perr.classList.add('show');
  video.addEventListener('error', fail);
  (async () => {
    try {
      const u = await SC.stream(t); if (tok !== routeToken) return;
      if (/\.m3u8/.test(u) && !video.canPlayType('application/vnd.apple.mpegurl')) {
        await loadHls(); if (tok !== routeToken) return;
        if (!window.Hls || !Hls.isSupported()) return fail();
        hls = new Hls(); hls.loadSource(u); hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
      } else video.src = u;
      video.play().catch(() => {});
    } catch { fail(); }
  })();
  cleanups.push(kill);
  if ('mediaSession' in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title:t.title, artist:t.artist?.username || '', artwork: cov ? [{ src:cov, sizes:'500x500' }] : [] }); } catch {}
  const lk = h('button', { class:'btn', type:'button' });
  const paintLk = () => { const on = SC.isLiked(t.id); lk.className = 'btn' + (on ? ' on' : ''); lk.replaceChildren(icon('heart', on ? 'fill' : ''), on ? 'Gemerkt' : 'Merken'); };
  lk.onclick = () => { const on = SC.toggleLike(t); toast(on ? 'Song gemerkt' : 'Aus Gemerkt entfernt'); paintLk(); }; paintLk();
  const info = h('div', { style:'padding:14px 2px' },
    h('div', { style:'font-size:1.2em;font-weight:700;line-height:1.3' }, t.title),
    h('div', { style:'opacity:.7;margin-top:4px' }, t.artist?.username || ''),
    h('div', { style:'display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:12px' }, lk,
      t.permalinkUrl ? h('a', { href:t.permalinkUrl, target:'_blank', rel:'noopener noreferrer', style:'text-decoration:underline;opacity:.85' }, 'Auf SoundCloud') : null));
  const relList = h('div', { class:'slist' });
  const related = h('aside', { class:'related' }, h('h2', {}, 'Weitere Musik'), relList);
  wrap.append(h('div', {}, player, info), related);
  fillSongRecommendations(relList, tok, t.id);
  player.focus({ preventScroll:true });
}

const fmtSongDur = ms => { const s = Math.round((ms || 0) / 1000); return s > 0 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; };
function SongRow(t) {
  const cov = SC.art(t.artworkUrl);
  const like = h('button', { class:'btn srow-l', type:'button', 'aria-label':'Song merken' });
  const paint = () => { const on = SC.isLiked(t.id); like.className = 'btn srow-l' + (on ? ' on' : ''); like.setAttribute('aria-pressed', String(on)); like.replaceChildren(icon('heart', on ? 'fill' : '')); };
  like.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); const on = SC.toggleLike(t); toast(on ? 'Song gemerkt' : 'Aus Gemerkt entfernt'); paint(); };
  paint();
  const meta = [t.artist && t.artist.username, fmtSongDur(t.duration)].filter(Boolean).join(' · ');
  return h('div', { class:'srow' },
    h('a', { class:'srow-a', href:'#/song/' + encodeURIComponent(t.permalinkUrl) },
      h('div', { class:'srow-c' }, cov ? h('img', { src:cov, alt:'', loading:'lazy' }) : icon('film')),
      h('div', { class:'txt' }, h('h3', { title:t.title }, t.title), h('p', {}, meta))),
    like);
}
async function fillSongRecommendations(list, tok, excludeId) {
  list.replaceChildren(h('p', { style:'color:var(--fg-3);font-size:13px' }, 'Empfehlungen werden geladen …'));
  try {
    const rows = await SC.feed(10);
    if (tok !== routeToken) return;
    const tracks = rows.map(x => x.sc).filter(t => t && t.id != excludeId);
    list.replaceChildren(...(tracks.length ? tracks.map(SongRow) : [h('p', { style:'color:var(--fg-3);font-size:13px' }, 'Keine Empfehlungen verfügbar.') ]));
  } catch (err) {
    if (tok !== routeToken) return;
    list.replaceChildren(h('p', { style:'color:var(--fg-3);font-size:13px' }, 'Empfehlungen konnten nicht geladen werden.'));
  }
}
function Songs(arg) {
  const tok = routeToken, liked = arg === 'liked', q = /^q\//.test(arg) ? arg.slice(2).trim() : '';
  document.title = (liked ? 'Gemerkte Songs' : q || 'Songs') + ' – Media +';
  const likes = SC.likes(), host = h('div', { class:'slist' });
  const clr = liked && likes.length ? h('button', { class:'btn', type:'button', onclick:() => { if (confirm('Alle gemerkten Songs entfernen?')) { store.set('scLikes', []); route(); } } }, icon('trash'), 'Leeren') : null;
  main.append(
    h('div', { class:'page-h' }, h('h1', {}, liked ? 'Gemerkte Songs' : 'Songs'), h('span', { class:'grow' }), clr),
    h('div', { class:'stabs' },
      h('a', { class:'chip' + (liked ? '' : ' active'), href:'#/songs' }, icon('search'), 'Suche'),
      h('a', { class:'chip' + (liked ? ' active' : ''), href:'#/songs/liked' }, icon('heart', liked ? 'fill' : ''), 'Gemerkt' + (likes.length ? ' (' + likes.length + ')' : ''))));
  if (liked) {
    main.append(host);
    if (!likes.length) host.append(emptyBox('heart', 'Noch keine Songs gemerkt.', h('a', { class:'btn primary', href:'#/songs' }, icon('search'), 'Songs suchen')));
    else likes.forEach(t => host.append(SongRow(t)));
    return;
  }
  const inp = h('input', { class:'sinp', type:'search', placeholder:'Song oder Künstler suchen …', 'aria-label':'Songsuche', enterkeyhint:'search', autocomplete:'off', autocorrect:'off', autocapitalize:'off', spellcheck:'false', value:q });
  main.append(h('form', { class:'ssearch', onsubmit:ev => {
    ev.preventDefault(); const v = inp.value.trim(); if (!v) return; inp.blur();
    const target = /^https?:\/\/([\w-]+\.)?soundcloud\.com\//i.test(v) ? '#/song/' + encodeURIComponent(v) : '#/songs/q/' + encodeURIComponent(v);
    if (location.hash === target) route(); else location.hash = target;
  } }, inp, h('button', { class:'btn primary', type:'submit', 'aria-label':'Suchen' }, icon('search'), 'Suchen')), host);
  if (!q) {
    const rec = h('div', { class:'slist' });
    host.append(h('p', { style:'color:var(--fg-3);font-size:13px' }, 'Suche nach Songs oder Künstlern – oder füge einen SoundCloud-Link ein.'), h('h2', { class:'rowh' }, 'Empfehlungen für dich'), rec);
    fillSongRecommendations(rec, tok, null);
    if (!IS_TV) setTimeout(() => inp.focus(), 60);
    return;
  }
  const run = async () => {
    host.replaceChildren(emptyBox('search', 'Suche läuft …'));
    try {
      const l = await SC.search(q); if (tok !== routeToken) return;
      host.replaceChildren(...(l.length ? l.map(SongRow) : [emptyBox('search', `Keine Songs für „${q}“ gefunden.`)]));
    } catch (err) {
      if (tok !== routeToken) return;
      host.replaceChildren(emptyBox('alert', 'Die Songsuche ist gerade nicht möglich.', h('div', { style:'font-size:12.5px;color:var(--fg-4)' }, String(err.message || err)), h('button', { class:'btn primary', type:'button', onclick:run }, icon('refresh'), 'Erneut versuchen')));
    }
  };
  run();
}

async function Watch(id) {
  Mini.close();
  const tok = routeToken;
  let e = cache.get(id) || loadSaved(id);
  const wrap = h('div', { class:'watch' });
  main.append(wrap);
  if (!e) {
    wrap.append(h('div', {}, h('div', { class:'player' }), ...skeletons(1)));
    try { e = await fetchEntry(id); } catch (err) { if (tok === routeToken) { wrap.replaceChildren(errorBox(err, () => route())); } return; }
    if (tok !== routeToken) return;
    wrap.replaceChildren();
  }
  document.title = `${e.title} – Media +`;
  const ch = chanOf(e.channel);

  const video = h('video', { playsinline:true, preload:'auto', autoplay:true });
  const perr = h('div', { class:'perr' }, icon('alert'), h('p', {}, 'Dieses Video lässt sich hier nicht abspielen.'),
    e.url_website ? h('a', { class:'btn primary', href:e.url_website, target:'_blank', rel:'noopener noreferrer' }, icon('external'), 'Bei der ARD ansehen') : null);
  const player = buildPlayer(video, perr);
  player.setTitle(e.title);
  TV.video = video; TV.player = player;
  const infoBtn = h('button', { class:'pb', type:'button', 'aria-label':'Info', title:'Info' }, icon('info'));
  const moreBtn = h('button', { class:'pb', type:'button', 'aria-label':'Weitere Inhalte', title:'Weitere Inhalte' }, icon('grid'));
  const xb = () => h('button', { class:'pclose', type:'button', 'aria-label':'Schließen', onclick:() => { player.closePanels(); player.focus(); } }, icon('x'));
  const infoP = h('div', { class:'ipanel', hidden:true }, xb(), h('h2', {}, e.title),
    h('div', { class:'im' }, [ch.name, e.topic, fullDate(e.timestamp), e.duration ? fmtDur(e.duration) : ''].filter(Boolean).join(' · ')),
    h('div', { class:'it' }, (e.description || '').trim() || 'Keine Beschreibung vorhanden.'));
  const moreRow = h('div', { class:'hrow' });
  const moreP = h('div', { class:'mpanel', hidden:true }, h('h2', { class:'rowh' }, 'Weitere Inhalte', xb()), moreRow);
  player.closePanels = () => { infoP.hidden = moreP.hidden = true; player.classList.remove('panel', 'morep'); };
  const tp = p => { const open = p.hidden; player.closePanels(); if (open) { p.hidden = false; player.classList.add('panel'); player.classList.toggle('morep', p === moreP); if (p === moreP) setTimeout(() => focusEl(moreRow.querySelector('a') || moreBtn), 0); } };
  infoBtn.onclick = () => tp(infoP); moreBtn.onclick = () => tp(moreP);
  player.querySelector('[aria-label="Einstellungen"]').before(infoBtn, moreBtn);
  player.append(infoP, moreP);
  moreP.addEventListener('click', ev => { const a = ev.target.closest('a.card'); if (a) { ev.preventDefault(); location.replace(a.getAttribute('href')); } });

  const srcs = [['HD', e.url_video_hd], ['SD', e.url_video], ['LQ', e.url_video_low]].filter(s => s[1]);
  const order = ['HD', 'SD', 'LQ'], pref = store.get('q', 'HD');
  let cur = srcs.find(s => order.indexOf(s[0]) >= order.indexOf(pref)) || srcs[0];
  let hls = null, curUrl = '', triedOrig = false, loadT = 0, keyT = 0;
  const onAnyKey = () => { keyT = Date.now(); };
  document.addEventListener('keydown', onAnyKey, true);
  cleanups.push(() => document.removeEventListener('keydown', onAnyKey, true));
  let resumes = 0, lastResume = 0;
  const autoResume = () => {
    const n = Date.now();
    if (video.ended || !video.paused || keyT > loadT || n - loadT > 8000 || resumes >= 3 || n - lastResume < 1500) return;
    resumes++; lastResume = n;
    video.play().catch(err => { if (err && err.name === 'NotAllowedError') { video.muted = true; video.play().catch(() => {}); } });
  };
  ['pause', 'canplay', 'loadeddata', 'stalled'].forEach(t => video.addEventListener(t, () => setTimeout(autoResume, 60)));
  const killHls = () => { if (hls) { hls.destroy(); hls = null; } };
  const fail = () => perr.classList.add('show');
  function load(url, t) {
    killHls(); perr.classList.remove('show');
    curUrl = url; triedOrig = false; loadT = Date.now();
    const u = secure(url);
    if (/\.m3u8(\?|$)/i.test(url) && !video.canPlayType('application/vnd.apple.mpegurl')) {
      loadHls().then(() => {
        if (!window.Hls || !Hls.isSupported()) return fail();
        hls = new Hls(); hls.loadSource(u); hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
      }).catch(fail);
    } else video.src = u;
    if (t) video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once:true });
    video.play().catch(() => {});
  }
  video.addEventListener('error', () => {
    if (!triedOrig && curUrl && curUrl !== secure(curUrl)) { triedOrig = true; video.src = curUrl; } else fail();
  });
  cleanups.push(() => {
    document.removeEventListener('keydown', onKey);
    TV.video = TV.player = null;
    const kill = () => { killHls(); video.pause(); video.removeAttribute('src'); video.load(); };
    if (false && !/^#\/watch\//.test(location.hash) && video.currentSrc && !perr.classList.contains('show') && !video.ended) Mini.open({ video, e, kill, from:video.getBoundingClientRect() });
    else kill();
  });

  const pr = getProg(e.id);
  const startAt = pr && pr.pos > 15 && pr.pos < (pr.dur || e.duration) - 30 ? pr.pos : 0;

  player.setQualities(
    srcs.map(s => ({ label: s[0], value: s[1] })),
    cur ? cur[1] : null,
    q => {
      if (!cur || q.value === cur[1]) return;
      const t = video.currentTime;
      cur = srcs.find(s => s[1] === q.value);
      store.set('q', cur[0]);
      load(q.value, t);
    }
  );

  if (cur) load(cur[1], startAt); else fail();
  if (startAt) toast('Weiter bei ' + fmtDur(startAt));

  let lastSave = 0, logged = false;
  video.addEventListener('play', () => { if (!logged) { logged = true; pushHistory(e); } });
  video.addEventListener('timeupdate', () => {
    const n = Date.now();
    if (n - lastSave > 5000 && video.currentTime > 3) { lastSave = n; saveProg(e, video.currentTime, video.duration); }
  });
  video.addEventListener('ended', () => saveProg(e, 0, video.duration));
  window.addEventListener('pagehide', () => { if (video.currentTime > 3) saveProg(e, video.currentTime, video.duration); }, { once:true });

  let nextE = null, nt = null;
  const nextBox = h('div', { class:'nextup' });
  player.append(nextBox);
  const stopNext = () => { clearInterval(nt); nextBox.classList.remove('show'); player.classList.remove('nexting'); };
  const goNext = () => { if (nextE) location.replace('#/watch/' + encodeURIComponent(nextE.id)); else toast('Kein weiteres Video'); };
  video.addEventListener('play', stopNext);
  video.addEventListener('ended', () => {
    if (!nextE || !store.get('autonext', true)) return;
    let n = 6;
    const nsm = h('small'), goBtn = h('button', { class:'btn primary', onclick:goNext }, 'Jetzt');
    nextBox.replaceChildren(nsm, h('b', {}, nextE.title), h('div', { class:'r' }, goBtn, h('button', { class:'btn', onclick:stopNext }, 'Abbrechen')));
    const draw = () => { nsm.textContent = `Nächstes Video in ${n} s`; };
    draw(); nextBox.classList.add('show'); player.classList.add('nexting');
    goBtn.focus({ preventScroll:true });
    nt = setInterval(() => { n--; if (n <= 0) { stopNext(); goNext(); } else draw(); }, 1000);
  });
  cleanups.push(stopNext);
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title:e.title, artist:ch.name, album:e.topic || '' }); } catch {}
    const ms = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
    ms('play', () => video.play()); ms('pause', () => video.pause());
    ms('seekbackward', () => { video.currentTime -= 10; }); ms('seekforward', () => { video.currentTime += 10; });
    ms('nexttrack', goNext);
  }

  function onKey(ev) {
    if (/input|select|textarea/i.test(ev.target.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase(), kc = ev.keyCode;
    if (k === ' ' || k === 'k') { if (ev.target.tagName === 'BUTTON') return; ev.preventDefault(); video.paused ? video.play() : video.pause(); }
    else if (k === 'f') { if (!document.fullscreenElement && player.requestFullscreen) player.requestFullscreen().catch(() => {}); }
    else if (k === 'm') video.muted = !video.muted;
    else if (k === 'j') video.currentTime -= 10;
    else if (k === 'l') video.currentTime += 10;
    else if (/^[0-9]$/.test(k) && video.duration) video.currentTime = video.duration * (+k / 10);
    else if (k === 'c' || kc === 403) player.toggleSubs && player.toggleSubs();
    else if (kc === 405) saveBtn.click();
    else if (k === 'n' || kc === 406 || k === 'mediatracknext') goNext();
  }
  document.addEventListener('keydown', onKey);

  const acts = h('div', { class:'acts' });
  const saveBtn = h('button', { class:'btn' + (isSaved(e.id) ? ' on' : '') }, icon('bookmark'), isSaved(e.id) ? 'Gemerkt' : 'Merken');
  saveBtn.onclick = () => {
    const on = toggleSaved(e);
    saveBtn.className = 'btn' + (on ? ' on' : ''); saveBtn.replaceChildren(icon('bookmark'), on ? 'Gemerkt' : 'Merken');
    toast(on ? 'Zur Merkliste hinzugefügt' : 'Aus Merkliste entfernt');
  };
  acts.append(saveBtn,
    h('button', { class:'btn tv-hide', onclick:async () => {
      const data = { title:e.title, url:location.href };
      try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); toast('Link kopiert'); } } catch {}
    } }, icon('share'), 'Teilen'),
    e.url_website ? h('a', { class:'btn tv-hide', href:e.url_website, target:'_blank', rel:'noopener noreferrer' }, icon('external'), 'ARD') : null,
    cur ? h('a', { class:'btn tv-hide', href:secure(cur[1]), target:'_blank', rel:'noopener noreferrer', download:'' }, icon('download')) : null);

  if (e.url_subtitle) (async () => {
    try {
      const r = await fetch(secure(e.url_subtitle)); if (!r.ok) return;
      const raw = await r.text(), vtt = /^\s*WEBVTT/.test(raw) ? raw : ttml2vtt(raw);
      if (!vtt || tok !== routeToken) return;
      const track = h('track', { kind:'subtitles', label:'Deutsch', srclang:'de', src:URL.createObjectURL(new Blob([vtt], { type:'text/vtt' })) });
      video.append(track);
      const apply = on => { track.track.mode = on ? 'showing' : 'disabled'; player.ccBtn.classList.toggle('on', on); };
      apply(store.get('subsOn', false));
      player.setSubs(track, () => { const on = track.track.mode !== 'showing'; apply(on); store.set('subsOn', on); });
    } catch {}
  })();

  const descText = (e.description || '').trim();
  const descBox = h('div', { class:'desc' },
    h('div', { class:'m' }, [fullDate(e.timestamp), e.duration ? fmtDur(e.duration) : ''].filter(Boolean).join(' · ')),
    h('div', { class:'t' }, descText || 'Keine Beschreibung vorhanden.'));
  if (descText.length > 180) {
    const more = h('button', { onclick:() => { const o = descBox.classList.toggle('open'); more.textContent = o ? 'Weniger anzeigen' : 'Mehr anzeigen'; } }, 'Mehr anzeigen');
    descBox.append(more);
  }

  const info = h('div', { class:'winfo' },
    h('h1', {}, e.title),
    h('div', { class:'wrow' },
      h('div', { class:'who' }, h('a', { href:ch.id ? '#/channel/' + ch.id : '#/' }, Avatar(ch)),
        h('div', {}, h('a', { href:ch.id ? '#/channel/' + ch.id : '#/' }, h('b', {}, ch.name)),
          e.topic ? h('a', { class:'topic-link', href:'#/show/' + (ch.id || '_') + '/' + encodeURIComponent(e.topic) }, e.topic) : null)),
      acts),
    descBox);

  const sticky = h('div', { class:'sticky-player' },
    h('div', { class:'sticky-inner' },
      h('div', { class:'sticky-video' }),
      h('div', { class:'sticky-info' },
        h('div', { class:'sticky-title' }, e.title),
        h('div', { class:'sticky-sub' }, ch.name + (e.topic ? ' · ' + e.topic : ''))
      ),
      h('div', { class:'sticky-actions' },
        h('button', { class:'btn', onclick:() => saveBtn.click() }, icon('bookmark'), 'Merken'),
        h('button', { class:'icon-btn play-toggle', onclick:() => video.paused ? video.play() : video.pause() }, icon('play', 'fill'))
      )
    ),
    h('div', { class:'sticky-progress' },
      h('div', { class:'sticky-progress-fill' })
    )
  );

  const stickyVideoContainer = sticky.querySelector('.sticky-video');
  const stickySaveBtn = sticky.querySelector('.btn');
  const stickyPlayBtn = sticky.querySelector('.play-toggle');
  const stickyProgress = sticky.querySelector('.sticky-progress-fill');

  const syncStickySave = () => {
    const saved = isSaved(e.id);
    stickySaveBtn.className = 'btn' + (saved ? ' on' : '');
    stickySaveBtn.replaceChildren(icon('bookmark'), saved ? 'Gemerkt' : 'Merken');
  };

  const origSave = saveBtn.onclick;
  saveBtn.onclick = () => {
    origSave();
    syncStickySave();
  };
  syncStickySave();

  const syncStickyPlay = () => {
    stickyPlayBtn.replaceChildren(icon(video.paused ? 'play' : 'pause', 'fill'));
  };
  ['play', 'pause', 'ended'].forEach(t => video.addEventListener(t, syncStickyPlay));
  syncStickyPlay();

  video.addEventListener('timeupdate', () => {
    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    stickyProgress.style.width = pct + '%';
  });

  const observer = new IntersectionObserver(([entry]) => {
    const show = !entry.isIntersecting;
    sticky.classList.toggle('show', show);
    if (show) {
      if (video.parentElement !== stickyVideoContainer) {
        stickyVideoContainer.appendChild(video);
        player.classList.add('video-moved');
      }
    } else {
      if (video.parentElement === stickyVideoContainer) {
        player.insertBefore(video, player.firstChild);
        player.classList.remove('video-moved');
      }
    }
  }, { rootMargin: '-120px 0px 0px 0px', threshold: 0 });

  cleanups.push(() => {
    observer.disconnect();
    if (video.parentElement === stickyVideoContainer) {
      player.insertBefore(video, player.firstChild);
    }
    sticky.remove();
    document.body.classList.remove('compact', 'sopen');
  });

  const relList = h('div', { class:'list' });
  const related = h('aside', { class:'related' }, h('h2', {}, e.topic ? 'Mehr aus „' + e.topic + '“' : 'Weitere Videos'), relList);
  wrap.append(h('div', {}, player, info), related);
  const from = Mini.takeRect();
  if (from && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    const to = player.getBoundingClientRect();
    player.style.zIndex = 49;
    player.animate([{ transform:`translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`, transformOrigin:'0 0' },
      { transform:'none', transformOrigin:'0 0' }], { duration:320, easing:'cubic-bezier(.2,.8,.2,1)' }).finished.then(() => { player.style.zIndex = ''; }).catch(() => {});
  }

  (async () => {
    try {
      const ids = new Set([e.id]); const out = [];
      const add = items => items.forEach(x => { if (!ids.has(x.id)) { ids.add(x.id); out.push(x); } });
      if (e.topic) add((await search({ topic:e.topic, size:30, min:120 })).items);
      if (out.length < 8 && ch.id) add((await search({ channel:ch, size:20, min:600 })).items);
      if (tok !== routeToken) return;
      out.slice(0, 30).forEach(x => moreRow.append(Card(x, { compact:true })));
      nextE = out[0] || null;
      if (!out.length) moreRow.append(h('p', { style:'color:var(--fg-3);font-size:13px' }, 'Keine ähnlichen Videos gefunden.'));
    } catch { if (tok === routeToken) relList.append(h('p', { style:'color:var(--fg-3);font-size:13px' }, 'Vorschläge konnten nicht geladen werden.')); }
  })();
}

/* Mini-Player (nicht genutzt im TV) */
const Mini = (() => {
  const M = 12;
  let v = null, e = null, kill = null, corner = store.get('minicorner', 'br'), xs = false, docked = null, wasPlaying = false, pos = { x:0, y:0 }, ct, fromRect = null, lastTap = 0;
  const slot = h('div', { class:'mv' }), shield = h('div', { class:'mshield' }), bar = h('i');
  const ib = (ic, label, fn, cls) => h('button', { class:'mbtn ' + cls, type:'button', 'aria-label':label, title:label, onclick:fn }, icon(ic, ic === 'play' || ic === 'pause' ? 'fill' : ''));
  const pp = ib('pause', 'Pause / Abspielen', () => v && (v.paused ? v.play() : v.pause()), 'c');
  const ctl = h('div', { class:'mctl' },
    ib('min', 'Ganz klein', () => { xs = true; ctlOff(); layout(); }, 'tl'),
    ib('x', 'Schließen', () => close(), 'tr'), pp,
    ib('full', 'Vergrößern', () => expand(), 'br'));
  const el = h('div', { class:'mini', hidden:true }, slot, shield, ctl, h('div', { class:'mprog' }, bar));
  const tab = h('button', { id:'mtab', hidden:true, 'aria-label':'Miniplayer öffnen', onclick:() => undock() }, icon('chev'));
  document.body.append(el, tab);
  const size = () => { const nar = innerWidth < 700, w = xs ? (nar ? 88 : 104) : Math.min(264, innerWidth * (nar ? .5 : .62)); return { w, h:w * 9 / 16 }; };
  const topY = () => (document.querySelector('.top')?.offsetHeight || 46) + M;
  const spot = c => { const { w, h } = size(); return { x:c[1] === 'l' ? M : innerWidth - w - M, y:c[0] === 't' ? topY() : innerHeight - h - M }; };
  const apply = () => { el.style.transform = `translate(${pos.x}px,${pos.y}px)`; };
  function layout(anim = true) { if (!anim) el.classList.add('na'); const { w, h } = size(); el.style.width = w + 'px'; el.style.height = h + 'px'; el.classList.toggle('xs', xs); if (!docked) { pos = spot(corner); apply(); } if (!anim) { void el.offsetWidth; el.classList.remove('na'); } }
  const ctlOff = () => { clearTimeout(ct); el.classList.remove('ctl'); };
  const ctlOn = () => { el.classList.add('ctl'); clearTimeout(ct); ct = setTimeout(ctlOff, 3200); };
  const sync = () => v && pp.replaceChildren(icon(v.paused ? 'play' : 'pause', 'fill'));
  const prog = () => { bar.style.width = (v && v.duration ? v.currentTime / v.duration * 100 : 0) + '%'; };
  function dock(side) { const { w, h } = size(); docked = side; wasPlaying = !v.paused; v.pause(); ctlOff(); pos.x = side === 'l' ? -w - 24 : innerWidth + 24; apply(); tab.dataset.s = side; tab.style.top = Math.max(topY(), Math.min(innerHeight - 70, pos.y + h / 2 - 28)) + 'px'; tab.hidden = false; }
  function undock() { const side = docked; docked = null; tab.hidden = true; corner = (pos.y + size().h / 2 < innerHeight / 2 ? 't' : 'b') + side; layout(); if (wasPlaying) v.play().catch(() => {}); }
  function release() { const { w, h } = size(), cx = pos.x + w / 2, cy = pos.y + h / 2; pos.y = Math.max(topY(), Math.min(innerHeight - h - M, pos.y)); if (pos.x < -w * .3) return dock('l'); if (pos.x + w > innerWidth + w * .3) return dock('r'); corner = (cy < innerHeight / 2 ? 't' : 'b') + (cx < innerWidth / 2 ? 'l' : 'r'); store.set('minicorner', corner); layout(); }
  let sx, sy, ox, oy, drag = false, moved = false;
  shield.addEventListener('pointerdown', ev => { drag = true; moved = false; sx = ev.clientX; sy = ev.clientY; ox = pos.x; oy = pos.y; shield.setPointerCapture(ev.pointerId); });
  shield.addEventListener('pointermove', ev => { if (!drag) return; const dx = ev.clientX - sx, dy = ev.clientY - sy; if (!moved && Math.hypot(dx, dy) < 6) return; if (!moved) { moved = true; el.classList.add('drag'); ctlOff(); } pos = { x:ox + dx, y:oy + dy }; apply(); });
  const up = () => { if (!drag) return; drag = false; el.classList.remove('drag'); if (moved) return release(); const n = Date.now(); if (!xs && n - lastTap < 320) { lastTap = 0; return expand(); } lastTap = n; if (xs) { xs = false; layout(); ctlOn(); } else el.classList.contains('ctl') ? ctlOff() : ctlOn(); };
  shield.addEventListener('pointerup', up); shield.addEventListener('pointercancel', up);
  addEventListener('resize', () => { if (v && !docked) layout(false); });
  function expand() { fromRect = el.getBoundingClientRect(); location.hash = '#/watch/' + encodeURIComponent(e.id); }
  function open(o) { close(); v = o.video; e = o.e; kill = o.kill; const pl = !v.paused; slot.replaceChildren(v); xs = false; docked = null; tab.hidden = true; ctlOff(); ['play', 'pause', 'ended'].forEach(t => v.addEventListener(t, sync)); v.addEventListener('timeupdate', prog); el.hidden = false; sync(); prog(); layout(false); if (pl) v.play().catch(() => {}); }
  function close() { if (!v) return; ['play', 'pause', 'ended'].forEach(t => v.removeEventListener(t, sync)); v.removeEventListener('timeupdate', prog); try { if (!v.ended && v.currentTime > 3) saveProg(e, v.currentTime, v.duration); } catch {} kill && kill(); v = null; slot.replaceChildren(); el.hidden = true; tab.hidden = true; docked = null; ctlOff(); }
  return { open, close, takeRect:() => { const r = fromRect; fromRect = null; return r; } };
})();

function route() {
  TV.pending = true;
  routeToken++; cleanups.forEach(f => f()); cleanups = [];
  thumbQueue.length = 0;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const a = parts[0] || '', arg = decodeURIComponent(parts.slice(1).join('/') || '');
  main.replaceChildren(); window.scrollTo(0, 0); document.body.classList.remove('sk-away', 'home', 'home-scrolled', 'home-bar', 'home-prev'); document.body.style.removeProperty('--hp');
  document.body.dataset.route = a || 'home';
  if (a !== 'search') $('#q').value = '';
  switch (a) {
    case 'watch':   Watch(arg); break;
    case 'search':
    case 'suche':   document.body.dataset.route = 'suche'; SearchScreen(arg); break;
    case 'channel': Channel(arg); break;
    case 'show':    Show(arg); break;
    case 'library': Library(arg); break;
    case 'browse':  Browse(arg); break;
    case 'live':    PLUS.live(arg); break;
    case 'subs':    PLUS.subsPage(); break;
    case 'random':  PLUS.random(); break;
    case 'shorts':  PLUS.shorts(); break;
    case 'song':    SongWatch(arg); break;
    case 'songs':   Songs(arg); break;
    case 'plus':    PLUS.more(); break;
    case 'access':  PLUS.access(arg); break;
    case 'send':    PLUS.sendPage(); break;
    case 'pair':    PLUS.pairPage(); break;
    default:        Browse('Neu');
  }
  document.body.classList.remove('overlay');
  applyPin(); markNav(); sugg.hidden = true;
}

const wide = () => false;
function applyPin() {
  const pin = wide() && document.body.dataset.route !== 'watch' && store.get('pin', true);
  document.body.classList.toggle('pinned', !!pin);
}
function markNav() {
  document.querySelectorAll('#side [data-cnt]').forEach(n => { const v = store.get(n.dataset.cnt, []).length; n.textContent = v || ''; });
  const hsh = location.hash || '#/';
  document.querySelectorAll('#side .nav[data-href]').forEach(n => n.classList.toggle('active', n.dataset.href === hsh || (n.dataset.href === '#/' && /^#\/(browse|)/.test(hsh) && !/^#\/(watch|search|channel|library|show|songs?)/.test(hsh))));
}

function buildSide() {
  const side = $('#side');
  const link = (ic, label, href, cnt) => h('a', { class:'nav', href, 'data-href':href },
    icon(ic), h('span', { class:'lbl' }, label), cnt ? h('span', { class:'cnt', 'data-cnt':cnt }) : null);
  const sw = (label, key, def, fn) => h('label', { class:'switch' },
    h('span', { class:'lbl' }, label),
    h('input', { type:'checkbox', checked:store.get(key, def), onchange:ev => { store.set(key, ev.target.checked); fn && fn(ev.target.checked); } }));
  const th = h('label', { class:'switch' },
    h('span', { class:'lbl' }, 'Dunkles Design'),
    h('input', { id:'thSw', type:'checkbox', checked:document.documentElement.dataset.theme === 'dark', onchange:ev => { const t = ev.target.checked ? 'dark' : 'light'; store.set('theme', t); setTheme(t); } }));
  const open = true;
  const grid = h('div', { class:'chgrid', hidden:!open }, CHANNELS.map(c => h('a', { class:'nav', href:'#/channel/' + c.id, 'data-href':'#/channel/' + c.id },
    h('span', { class:'dot', style:`--c:${c.color}` }, c.short.length > 3 ? c.short.slice(0, 3) : c.short),
    h('span', { class:'lbl' }, c.name))));
  const tog = h('div', { class:'side-h' }, 'Sender', h('span', { class:'n' }, ' ' + CHANNELS.length));
  side.append(
    h('div', { class:'logo side-logo' }, h('span', { class:'mark' }, icon('plus', 'fill')), h('span', { class:'t' }, 'Media', h('small', {}, '+'))),
    link('search', 'Suche', '#/suche'),
    link('home', 'Startseite', '#/'),
    link('history', 'Verlauf', '#/library/history', 'hist'),
    link('bookmark', 'Gemerkt', '#/library/saved', 'saved'),
    h('hr', { class:'sep' }), tog, grid,
    h('hr', { class:'sep' }),
    h('div', { class:'side-h' }, 'Einstellungen'),
    th,
    sw('Vorschaubilder', 'thumbs', true, () => { route(); }),
    sw('Nächstes Video automatisch', 'autonext', true),
    h('div', { class:'side-foot' }, 'Fernbedienung: Pfeile bewegen · OK wählt · Zurück geht zurück · Play/Pause · Rot Untertitel · Gelb Merken · Blau Nächstes', h('br'), 'Inoffizielles Projekt. Nicht mit der ARD verbunden. Inhalte stammen aus den ARD-Mediatheken, die Daten liefert MediathekViewWeb.'));
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#theme').replaceChildren(icon(t === 'dark' ? 'sun' : 'moon'));
  const ts = $('#thSw'); if (ts) ts.checked = t === 'dark';
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#000000' : '#ffffff';
}

const sugg = h('div', { class:'sugg', hidden:true });
document.body.append(sugg);
sugg.addEventListener('mousedown', ev => ev.preventDefault());
function remember(q) { store.set('recent', [q, ...store.get('recent', []).filter(x => x !== q)].slice(0, 8)); }
function showSugg() {
  const q = $('#q').value.trim().toLowerCase();
  const list = store.get('recent', []).filter(x => !q || x.toLowerCase().includes(q)).slice(0, 6);
  if (!list.length) { sugg.hidden = true; return; }
  const r = $('#sf').getBoundingClientRect();
  sugg.style.cssText = `left:${r.left}px;top:${r.bottom + 6}px;width:${r.width}px`;
  sugg.replaceChildren(h('div', { class:'side-h', style:'padding:8px 10px 4px' }, 'Zuletzt gesucht'),
    ...list.map(x => h('div', { class:'row' },
      h('a', { class:'nav', href:'#/search/' + encodeURIComponent(x) }, icon('history'), x),
      h('button', { class:'icon-btn', 'aria-label':'Entfernen', onclick:() => { store.set('recent', store.get('recent', []).filter(y => y !== x)); showSugg(); } }, icon('x')))));
  sugg.hidden = false;
}

const TV = { video:null, player:null, pending:true, last:null };
const navSnd = new Audio('navigate.mp3'); navSnd.preload = 'auto';
const TV_SAVER_IMAGES = ['tv-saver-lake.jpg', 'tv-saver-forest.jpg', 'tv-saver-sunset.jpg', 'tv-saver-mountains.jpg', 'tv-saver-night-lake.jpg', 'tv-saver-night-city.jpg', 'tv-saver-night-mountains.jpg', 'tv-saver-blue-night.jpg', 'tv-saver-sun-mountains.jpg', 'tv-saver-deep-forest.jpg'];

const ScreenSaver = (() => {
  let root = null, imgA = null, imgB = null, clockEl = null, dateEl = null, timer = 0, slideTimer = 0, index = 0, visible = false;
  let digits = [], lastHM = '', digitTimers = [];
  let recQ = [], recCur = null, recBusy = false, recEl = null, hintEl = null, blackEl = null, blackTimer = 0, black = false;
  const SNOOPY_URL = 'https://files.catbox.moe/heqbp1.mp4';
  let vid = null, vidReady = false, pendingShow = false;
  const blackAfter = () => { const v = Number(store.get('saverBlack', 30)); return isFinite(v) ? v * 60000 : 30 * 60000; };
  const useVideo = () => store.get('saverMode', 'snoopy') !== 'images';
  const recsOn = () => store.get('saverRecs', true) !== false;
  function loadVideo() {
    if (vid) return;
    vid = document.createElement('video');
    vid.className = 'saver-video';
    vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'auto';
    vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
    const ok = () => { if (vidReady) return; vidReady = true; try { vid.pause(); vid.currentTime = 0; } catch {} if (pendingShow) { pendingShow = false; show(); } };
    vid.addEventListener('canplaythrough', ok, { once:true });
    vid.addEventListener('loadeddata', () => { if (vid.readyState >= 4) ok(); });
    vid.addEventListener('error', () => { vidReady = false; if (pendingShow) { pendingShow = false; show(true); } });
    vid.src = SNOOPY_URL;
    try { vid.load(); } catch {}
  }
  const recSeen = new Set();
  const HINT = 'Taste oder Bewegung zum Fortfahren';
  async function fillRecs() {
    if (!recsOn() || recBusy || recQ.length >= 3) return;
    recBusy = true;
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const arr = k => { const v = store.get(k, []); return Array.isArray(v) ? v : []; };
    const topics = [...arr('subs'), ...arr('saved'), ...arr('hist').slice(0, 30)].map(x => x && x.topic).filter(Boolean);
    const seenW = store.get('seen', {}) || {};
    const okv = e => e && (e.url_video || e.url_video_hd || e.url_video_low) && !recSeen.has(e.id);
    for (let i = 0; i < 6 && recQ.length < 3; i++) {
      try {
        let r;
        if (topics.length && Math.random() < .6) r = await search({ topic:pick(topics), min:300, size:30 });
        else {
          const c = CHIPS[1 + Math.floor(Math.random() * (CHIPS.length - 1))], mn = Math.max(c.min, 600);
          r = await search({ text:c.q, min:mn, offset:Math.floor(Math.random() * 20), size:30 });
          if (!r.items.length) r = await search({ text:c.q, min:mn, size:30 });
        }
        let ok = r.items.filter(okv); const fresh = ok.filter(e => !seenW[e.id]); if (fresh.length) ok = fresh;
        if (ok.length) { const e = pick(ok); recSeen.add(e.id); recQ.push(e); frameOf(e); }
      } catch (err) { console.warn('Empfehlung', err); }
    }
    recBusy = false;
  }
  let recGone = 0, order = [], shufPending = null, recRO = null;
  const recFr = new Map();
  /* Vorschaubild schon im Hintergrund holen, sobald eine Empfehlung in der Warteschlange liegt */
  function frameOf(e) {
    let p = recFr.get(e.id);
    if (!p) { p = grabFrame(e, true); recFr.set(e.id, p); p.then(cv => { p.cv = cv; }, () => {}); }
    return p;
  }
  const setPos = () => order.forEach((c, i) => { c.classList.remove('p0', 'p1', 'p2'); c.classList.add('p' + i); });
  /* Blur-Fläche im Bild exakt an Kartengröße anpassen (wächst mit, wenn das Bild nachkommt) */
  function placeBlur() {
    if (!root || !recEl) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const L = recEl.offsetLeft, T = recEl.offsetTop - 1.8 * rem, R = L + recEl.offsetWidth, B = recEl.offsetTop + recEl.offsetHeight;
    const f = 2.6 * rem, o = .6 * rem, st = root.style;
    st.setProperty('--bx1', (L - o - f) + 'px'); st.setProperty('--bx2', (L - o) + 'px'); st.setProperty('--bx3', (R + o) + 'px'); st.setProperty('--bx4', (R + o + f) + 'px');
    st.setProperty('--by1', (T - o - f) + 'px'); st.setProperty('--by2', (T - o) + 'px'); st.setProperty('--by3', (B + o) + 'px'); st.setProperty('--by4', (B + o + f) + 'px');
  }
  function clearStack() { order.forEach(c => { c.replaceChildren(); c.classList.remove('fly'); }); setPos(); }
  function hideRec() {
    recCur = null; shufPending = null;
    if (root) root.classList.remove('rec-on');
    if (recEl) {
      recEl.classList.remove('on');
      clearTimeout(recGone);
      recGone = setTimeout(() => { if (!recEl.classList.contains('on')) { clearStack(); placeBlur(); } }, 900);
    }
  }
  function fillCard(card, e) {
    const th = h('div', { class:'srec-th' });
    const inn = h('div', { class:'srec-in bin' }, th, h('div', { class:'srec-tx' },
      h('div', { class:'srec-t' }, e.title),
      h('div', { class:'srec-row' }, h('div', { class:'srec-p' }, icon('play', 'fill'), 'Abspielen'), h('span', { class:'srec-tag' }, 'Empfehlung'))));
    const fp = frameOf(e); recFr.delete(e.id);
    if (fp.cv) { th.append(fp.cv); th.classList.add('pre', 'ready'); }
    card.replaceChildren(inn);
    if (!fp.cv) fp.then(cv => {
      if (recCur !== e || !inn.isConnected) return;
      th.append(cv);
      requestAnimationFrame(() => { th.style.height = Math.round(th.clientWidth * 9 / 16) + 'px'; th.classList.add('ready'); });
    }).catch(() => {});
    placeBlur();
  }
  function showRec(e) {
    if (!recEl || !order.length) return;
    clearTimeout(recGone);
    if (shufPending) shufPending();
    recCur = e;
    const wasOn = recEl.classList.contains('on'), front = order[0];
    if (!(wasOn && front.firstChild)) {
      fillCard(front, e);
    } else {
      /* Karte nehmen, linksrum hinter den Stapel schieben, alles rückt nach vorn – dann blurt der neue Text ein */
      const F = order[0], N = order[1];
      order = [order[1], order[2], F];
      setPos(); F.classList.add('fly');
      let done = false;
      const fin = () => {
        if (done) return; done = true; shufPending = null;
        F.classList.remove('fly'); F.replaceChildren();
        if (recCur === e) fillCard(N, e);
      };
      shufPending = fin;
      F.addEventListener('animationend', ev => { if (ev.animationName === 'srecFly') fin(); });
      setTimeout(fin, 1500);
    }
    recEl.classList.add('on');
    if (root) root.classList.add('rec-on');
    placeBlur();
  }
  function playRec() {
    if (!visible || !recCur) return false;
    const e = recCur; cache.set(e.id, e); hide(); location.hash = '#/watch/' + encodeURIComponent(e.id); return true;
  }
  const isPlayKey = ev => ev.key === 'MediaPlayPause' || ev.key === 'MediaPlay' || ev.key === 'Enter' || ev.key === ' ' || [179, 415, 10252, 13].includes(ev.keyCode);
  const goBlack = () => {
    if (!visible || black) return;
    black = true; clearTimeout(slideTimer); hideRec();
    if (root) root.classList.add('black');
  };
  const onKey = ev => {
    if (visible && black) { ev.preventDefault(); ev.stopImmediatePropagation(); hide(); return; }
    if (visible && recCur && isPlayKey(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); playRec(); return; }
    activity();
  };
  const playing = () => [...document.querySelectorAll('video:not(.saver-video)')].some(v => !v.paused && !v.ended);
  const delay = () => Math.max(1, Number(store.get('saverDelay', 5)) || 5) * 60000;
  const interval = () => Math.max(5, Number(store.get('saverInterval', 30)) || 30) * 1000;
  const pad = n => String(n).padStart(2, '0');
  const CYCLES = 10;
  const MID = 40; /* Start in Zyklus 4 (0-basiert) */
  const DH = 1.22; /* muss zu CSS --dh passen */
  const clearDigitTimers = () => { digitTimers.forEach(clearTimeout); digitTimers = []; };

  function makeDigit() {
    const spans = [];
    for (let c = 0; c < CYCLES; c++) for (let d = 0; d < 10; d++) spans.push(h('span', {}, String(d)));
    const strip = h('div', { class:'saver-strip' }, ...spans);
    const box = h('div', { class:'saver-digit' }, strip);
    return { box, strip, val: -1, pos: MID };
  }

  /* mode: 'set' | 'enter' | 'tick' – krass scrollen, schnell abstoppen */
  function setDigit(d, n, { mode = 'set', delayMs = 0, spin = 2 } = {}) {
    const target = ((n % 10) + 10) % 10;
    const y = p => `translateY(${-(p * DH)}em)`;
    const apply = () => {
      if (mode === 'set' || d.val < 0) {
        d.pos = MID + target;
        d.strip.style.transition = 'none';
        d.strip.style.transform = y(d.pos);
        void d.strip.offsetWidth;
        d.strip.style.transition = '';
        d.val = target;
        return;
      }
      const from = d.val < 0 ? 0 : d.val;
      let delta = (target - from + 10) % 10;
      if (delta === 0) delta = 10;
      const steps = spin * 10 + delta;
      d.pos = d.pos + steps;
      /* enter: etwas langsamer, kürzere Strecke; tick: kurz */
      const dur = mode === 'enter' ? 0.95 : 0.48;
      d.strip.style.transition = `transform ${dur}s cubic-bezier(0.08, 0.65, 0.15, 1)`;
      d.strip.style.transform = y(d.pos);
      d.val = target;
      if (d.pos > (CYCLES - 2) * 10) {
        setTimeout(() => {
          if (d.val !== target) return;
          d.pos = MID + target;
          d.strip.style.transition = 'none';
          d.strip.style.transform = y(d.pos);
          void d.strip.offsetWidth;
          d.strip.style.transition = '';
        }, dur * 1000 + 40);
      }
    };
    if (delayMs > 0) digitTimers.push(setTimeout(apply, delayMs));
    else apply();
  }

  /* Ziffernbreite an die tatsächlich geladene Schrift anpassen, damit nichts abgeschnitten wird */
  function fitDigits() {
    if (!clockEl) return;
    const fs = parseFloat(getComputedStyle(clockEl).fontSize); if (!fs) return;
    const m = h('span', { style:'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font:inherit;letter-spacing:inherit' });
    clockEl.append(m); let mx = 0;
    for (const d of '0123456789') { m.textContent = d; mx = Math.max(mx, m.offsetWidth); }
    m.remove();
    if (mx) clockEl.style.setProperty('--dw', (mx / fs + .03).toFixed(3) + 'em');
  }
  function buildClock() {
    digits = [makeDigit(), makeDigit(), makeDigit(), makeDigit()];
    clockEl.replaceChildren(
      digits[0].box, digits[1].box,
      h('span', { class:'saver-colon' }, ':'),
      digits[2].box, digits[3].box
    );
  }

  function rollTime(animate, stagger) {
    const now = new Date();
    const hh = pad(now.getHours()), mm = pad(now.getMinutes());
    const s = hh + mm;
    if (s === lastHM && animate) {
      dateEl.textContent = now.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' });
      return;
    }
    const changed = lastHM ? s.split('').map((c, i) => c !== lastHM[i]) : [true, true, true, true];
    const entrance = !lastHM && animate && stagger;
    lastHM = s;
    const base = stagger ? 40 : 0;
    digits.forEach((d, i) => {
      if (!animate) {
        setDigit(d, +s[i], { mode: 'set' });
        return;
      }
      if (!changed[i] && !entrance) return;
      if (entrance) {
        setDigit(d, +s[i], { mode: 'set' });
        setDigit(d, +s[i], { mode: 'enter', delayMs: base + i * 90, spin: 1 });
      } else {
        setDigit(d, +s[i], { mode: 'tick', delayMs: i * 30, spin: 1 });
      }
    });
    dateEl.textContent = now.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' });
  }

  const mkSlide = () => { const cv = h('canvas', { class:'saver-cv' }), ov = h('canvas', { class:'saver-cv' }); return { el:h('div', { class:'saver-slide' }, h('div', { class:'saver-kb' }, cv), h('div', { class:'saver-mk' }, h('div', { class:'saver-kb' }, ov))), cv, ov, kt:0 }; };
  const setSlide = (s, src) => new Promise(res => {
    const im = new Image();
    im.onload = async () => {
      try { if (im.decode) await im.decode(); } catch {}
      try {
        const W = Math.min(1920, innerWidth), H = Math.round(W * innerHeight / innerWidth), cv = s.cv;
        cv.width = W; cv.height = H;
        const c = cv.getContext('2d'), k = Math.max(W / im.naturalWidth, H / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
        c.drawImage(im, dx, dy, dw, dh);
        const sm = document.createElement('canvas'); sm.width = 256; sm.height = Math.max(64, Math.round(256 * H / W));
        const sc = sm.getContext('2d'); try { sc.filter = 'blur(5px)'; } catch {}
        const k2 = Math.max(256 / im.naturalWidth, sm.height / im.naturalHeight);
        sc.drawImage(im, (256 - im.naturalWidth * k2) / 2, (sm.height - im.naturalHeight * k2) / 2, im.naturalWidth * k2, im.naturalHeight * k2);
        const t = document.createElement('canvas'); t.width = W; t.height = H;
        const tc = t.getContext('2d'); tc.drawImage(sm, 0, 0, W, H);
        tc.globalCompositeOperation = 'destination-in'; tc.save(); tc.translate(.08 * W, .06 * H); tc.scale(.75 * W, .70 * H);
        const g = tc.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.24, 'rgba(0,0,0,1)'); g.addColorStop(.64, 'rgba(0,0,0,0)');
        tc.fillStyle = g; tc.fillRect(-1, -1, 4, 4); tc.restore();
        c.drawImage(t, 0, 0);
        /* zweite Ebene: komplett verblurrte Kopie; ausgeschnitten wird sie per CSS-Maske passend zur Kartengröße */
        const ov = s.ov; ov.width = W; ov.height = H;
        ov.getContext('2d').drawImage(sm, 0, 0, W, H);
      } catch {}
      res();
    };
    im.onerror = () => res();
    im.src = src;
  });
  function ensure() {
    if (root) return;
    imgA = mkSlide(); imgB = mkSlide();
    clockEl = h('div', { class:'saver-clock' });
    dateEl  = h('div', { class:'saver-date' });
    const clockWrap = h('div', { class:'saver-clock-wrap' }, clockEl, dateEl);
    root = h('div', { class:'tv-saver', role:'dialog', 'aria-label':'Screensaver' },
      h('div', { class:'saver-bg' }, imgA.el, imgB.el, (loadVideo(), vid)),
      h('div', { class:'saver-overlay' }),
      clockWrap, recEl = h('div', { class:'srec' }, ...(order = [0, 1, 2].map(i => h('div', { class:'srec-c p' + i })))),
      blackEl = h('div', { class:'saver-black' }));
    document.body.append(root);
    if (window.ResizeObserver) { recRO = new ResizeObserver(placeBlur); recRO.observe(recEl); }
    buildClock();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDigits);
    fitDigits();
    TV_SAVER_IMAGES.forEach(src => { const i = new Image(); i.src = src; });
  }

  function tickClock() {
    if (!clockEl || !visible) return;
    rollTime(true, false);
  }

  function nextImage() {
    if (!root || !visible || black || root.classList.contains('vmode')) return;
    index = (index + 1) % TV_SAVER_IMAGES.length;
    const next = index % 2 ? imgB : imgA, old = index % 2 ? imgA : imgB;
    const start = () => {
      if (!visible) return;
      next.el.style.zIndex = 2; old.el.style.zIndex = 1;
      next.el.classList.remove('on', 'ken'); void next.el.offsetWidth;
      next.el.classList.add('on', 'ken');
      if (recsOn() && recQ.length) showRec(recQ.shift()); else hideRec();
      fillRecs();
      clearTimeout(old.kt);
      old.kt = setTimeout(() => {
        if (old.el.style.zIndex !== '1') return;
        old.el.style.transition = 'none'; old.el.classList.remove('on', 'ken'); void old.el.offsetWidth; old.el.style.transition = '';
      }, 2500);
    };
    setSlide(next, TV_SAVER_IMAGES[index]).then(start);
    clearTimeout(slideTimer); slideTimer = setTimeout(nextImage, interval());
  }

  function hide() {
    if (!visible) return;
    visible = false; black = false; clearTimeout(blackTimer); hideRec();
    clearTimeout(slideTimer);
    if (vid) try { vid.pause(); } catch {}
    clearDigitTimers();
    /* Ziffern-Animationen sofort stoppen – kein Scroll beim Beenden */
    digits.forEach(d => {
      d.strip.style.transition = 'none';
      d.strip.style.transform = `translateY(${-(d.pos * DH)}em)`;
    });
    root.classList.add('leaving');
    root.classList.remove('show');
    document.body.classList.remove('saver-on');
    setTimeout(() => { if (root) { root.classList.remove('leaving'); if (!visible) root.classList.remove('black'); } }, 1000);
    schedule();
  }

  function show(force) {
    if (!force && (!store.get('saverOn', true) || playing() || appWin)) return schedule();
    ensure();
    const vm = useVideo() && (vidReady || (!force && !visible));
    if (useVideo() && !vidReady && !force && !visible) { pendingShow = true; return; }
    const already = visible;
    visible = true; lastHM = '';
    clearDigitTimers();
    digits.forEach(d => { d.val = -1; d.pos = MID; });
    if (!already) {
      black = false; if (root) root.classList.remove('black');
      clearTimeout(blackTimer); if (blackAfter() > 0) blackTimer = setTimeout(goBlack, blackAfter());
      index = 0;
      root.classList.toggle('vmode', vm && vidReady);
      if (vm && vidReady) { try { vid.currentTime = 0; const pr = vid.play(); pr && pr.catch && pr.catch(() => {}); } catch {} }
      root.style.setProperty('--kd', (interval() / 1000 + 6) + 's');
      [imgA, imgB].forEach(x => { clearTimeout(x.kt); x.el.style.zIndex = ''; x.el.classList.remove('on', 'ken'); });
      if (!(vm && vidReady)) {
      setSlide(imgB, TV_SAVER_IMAGES[1]);
      setSlide(imgA, TV_SAVER_IMAGES[0]).then(() => { if (!visible) return; void imgA.el.offsetWidth; imgA.el.classList.add('on', 'ken'); });
      }
    }
    root.classList.toggle('hide-clock', !store.get('saverClock', true));
    fitDigits();
    root.classList.remove('leaving');
    document.body.classList.add('saver-on');
    requestAnimationFrame(() => {
      root.classList.add('show');
      setTimeout(() => rollTime(true, true), already ? 40 : 180);
    });
    clearTimeout(slideTimer); if (!root.classList.contains('vmode')) slideTimer = setTimeout(nextImage, interval());
    fillRecs().then(() => setTimeout(() => { if (visible && !black && !recCur && recsOn() && recQ.length) showRec(recQ.shift()); }, 2500));
  }

  function schedule() { clearTimeout(timer); pendingShow = false; if (store.get('saverOn', true)) { if (useVideo()) loadVideo(); timer = setTimeout(show, delay()); } }
  function activity() { if (visible) hide(); else schedule(); }
  function start() {
    ensure();
    ['pointerdown', 'click', 'mousemove'].forEach(t => document.addEventListener(t, activity, true));
    document.addEventListener('keydown', onKey, true);
    setTimeout(fillRecs, 20000);
    document.addEventListener('play', ev => { if (ev.target && ev.target.classList && ev.target.classList.contains('saver-video')) return; hide(); }, true);
    if (useVideo()) loadVideo();
    setInterval(() => { if (visible) tickClock(); }, 1000);
    schedule();
  }
  return { start, show, hide, schedule, playRec };
})();

let tvFullscreenTried = false;
function enterTvFullscreen() {
  if (tvFullscreenTried || document.fullscreenElement) return;
  tvFullscreenTried = true;
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) Promise.resolve(fn.call(el)).catch(() => { tvFullscreenTried = false; });
}
function armTvFullscreen() {
  if (document.fullscreenElement) return;
  const wake = () => { enterTvFullscreen(); ['pointerdown', 'keydown', 'click'].forEach(t => document.removeEventListener(t, wake, true)); };
  ['pointerdown', 'keydown', 'click'].forEach(t => document.addEventListener(t, wake, true));
  setTimeout(enterTvFullscreen, 80);
}
function navTick() {
  if ([...document.querySelectorAll('video:not(.saver-video)')].some(v => !v.paused && !v.ended)) return;
  try { navSnd.currentTime = 0; navSnd.play().catch(() => {}); } catch {}
}
const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex="0"]';

let dlgEl = null;
function closeDlg(ret) {
  if (!dlgEl) return false;
  const d = dlgEl; dlgEl = null; d.classList.remove('show');
  setTimeout(() => d.remove(), 220);
  if (d._back && d._back.isConnected) d._back.focus({ preventScroll:true });
  return true;
}
function openDlg(title, content, opener) {
  closeDlg();
  const back = h('div', { class:'dlg-back', role:'dialog', 'aria-modal':'true', 'aria-label':title },
    h('div', { class:'dlg' }, h('h3', {}, title), ...content));
  back._back = opener;
  back.addEventListener('mousedown', ev => { if (ev.target === back) closeDlg(); });
  document.body.append(back); dlgEl = back;
  requestAnimationFrame(() => { back.classList.add('show'); const f = back.querySelector('.dopt.on') || back.querySelector('.dopt'); f && f.focus({ preventScroll:true }); });
}
function openChoice(sel) {
  const opts = Array.from(sel.options);
  openDlg(sel.getAttribute('aria-label') || 'Auswahl', opts.map(o => h('button', { class:'dopt' + (o.value === sel.value ? ' on' : ''), type:'button', onclick:() => {
    const ch = sel.value !== o.value; sel.value = o.value; closeDlg();
    if (ch) sel.dispatchEvent(new Event('change', { bubbles:true }));
  } }, o.textContent)), sel);
}
function askConfirm(text, okLabel = 'Leeren') {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } closeDlg(); };
    openDlg('Bestätigen', [h('p', {}, text), h('div', { class:'dacts' },
      h('button', { class:'dopt', type:'button', onclick:() => fin(false) }, 'Abbrechen'),
      h('button', { class:'dopt', type:'button', onclick:() => fin(true) }, okLabel))], document.activeElement);
    dlgEl._cancel = () => fin(false);
  });
}
document.addEventListener('mousedown', ev => { const s = ev.target.closest && ev.target.closest('select'); if (s) { ev.preventDefault(); openChoice(s); } }, true);
document.addEventListener('keydown', ev => {
  if (dlgEl && (ev.key === 'Escape')) { ev.preventDefault(); ev.stopPropagation(); (dlgEl._cancel || closeDlg)(); closeDlg(); return; }
  const s = ev.target.tagName === 'SELECT' ? ev.target : null;
  if (s && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); openChoice(s); }
}, true);

window.addEventListener('scroll', () => { document.body.classList.toggle('home-down', document.body.classList.contains('home') && window.scrollY > innerHeight * .45); }, { passive:true });
function canFocus(el) {
  if (el.disabled || el.hidden || el.tabIndex < 0) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || r.right <= 0 || r.left >= innerWidth) return false;
  if (el.closest('.sticky-player:not(.show)')) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && cs.display !== 'none';
}
function focusEl(el) {
  if (!el) return;
  el.focus({ preventScroll:true });
  const kp = el.closest('.sleft');
  if (kp) {
    const a = el.getBoundingClientRect(), b = kp.getBoundingClientRect(), m = 60;
    if (a.top < b.top + m) kp.scrollBy({ top:a.top - b.top - m, behavior:'smooth' });
    else if (a.bottom > b.bottom - m) kp.scrollBy({ top:a.bottom - b.bottom + m, behavior:'smooth' });
    return;
  }
  if (el.closest('.player')) {
    const row = el.closest('.hrow');
    if (row) { const a = el.getBoundingClientRect(), b = row.getBoundingClientRect(); row.scrollBy({ left:(a.left + a.width / 2) - (b.left + b.width / 2), behavior:'smooth' }); }
    return;
  }
  if (el.closest('.acc,.hmore')) return;
  if (el.closest('.astore')) { el.scrollIntoView({ block:'center', behavior:'smooth' }); return; }
  if (el.closest('.happs')) { if (window.scrollY > 2) window.scrollTo({ top:0, behavior:'smooth' }); const r = el.parentElement; r.scrollTo({ left:el.offsetLeft - r.offsetLeft - 10, behavior:'smooth' }); return; }
  if (document.body.classList.contains('home') && el.closest('.hero,.hglass')) {
    const gl = el.closest('.hglass');
    if (gl) { const t = gl.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 3 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 10); if (Math.abs(window.scrollY - t) > 4) window.scrollTo({ top:t, behavior:'smooth' }); }
    else if (window.scrollY > 2) window.scrollTo({ top:0, behavior:'smooth' });
    const row = el.closest('.hglass .hrow');
    if (row) { const cs = row.children, i = Array.prototype.indexOf.call(cs, el); row.scrollTo({ left:Math.max(0, cs[Math.max(0, i - 1)].offsetLeft - cs[0].offsetLeft), behavior:'smooth' }); }
    return;
  }
  const fixedBar = el.closest('.chips,.top,#side,.sticky-player,.pmenu,.sugg');
  /* Startseite: erster Schritt nach unten → Weiterschauen-Pill rutscht nach ganz oben, darunter geht es los */
  if (document.body.classList.contains('home') && !el.closest('.hero,.hglass,#side')) {
    const sp = document.querySelector('.hspacer'), chipEl = el.closest('.chips');
    if (chipEl && sp) {
      /* Chips (Neu, …) fokussiert → Chips stehen ganz oben, Weiterschauen ist weggescrollt */
      const top = sp.getBoundingClientRect().bottom + window.scrollY;
      const b = chipEl.getBoundingClientRect(), a = el.getBoundingClientRect();
      chipEl.scrollBy({ left:(a.left + a.width / 2) - (b.left + b.width / 2), behavior:'smooth' });
      if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior:'smooth' });
      return;
    }
    const g = document.querySelector('.hglass');
    if (g) {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
      const snap = g.getBoundingClientRect().top + window.scrollY - 2 * rem;
      if (window.scrollY < snap - 4) {
        const r = el.getBoundingClientRect(), want = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
        const row = el.closest('.chips,.hrow');
        if (row) { const a = r, b = row.getBoundingClientRect(); row.scrollBy({ left:(a.left + a.width / 2) - (b.left + b.width / 2), behavior:'smooth' }); }
        window.scrollTo({ top:fixedBar ? snap : Math.max(snap, want), behavior:'smooth' });
        return;
      }
    }
  }
  const inl = el.closest('.chips,.hrow') ? 'center' : 'nearest';
  if (!fixedBar) {
    /* Läge die Seite nach dem Zentrieren nur knapp unter dem Anfang, wäre oben etwas abgeschnitten (z. B. Überschrift, 2-zeilige Titel) → ganz nach oben */
    const r = el.getBoundingClientRect(), want = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
    if (want < window.innerHeight * .25 && !document.body.classList.contains('home')) {
      el.scrollIntoView({ block:'nearest', inline:inl, behavior:'smooth' });
      window.scrollTo({ top:0, behavior:'smooth' });
      return;
    }
  }
  el.scrollIntoView({ block:fixedBar ? 'nearest' : 'center', inline:inl, behavior:'smooth' });
}
function initialTarget() {
  if (document.body.dataset.route === 'suche') return $('main .key');
  if (document.body.dataset.route === 'watch') return $('.watch .player[tabindex]') || $('main .btn.primary');
  if (document.body.classList.contains('home')) return $('.happs .atile') || $('.hero .hslide a[tabindex="0"]') || $('.hero .btn.primary') || null;
  return $('main .chip.active, main .btn.primary, main .mopt, main .stile, main .card');
}
function openSide() { focusEl($('#side .nav.active') || $('#side .nav')); }
function closeSide() { const t = TV.last && TV.last.isConnected && canFocus(TV.last) ? TV.last : initialTarget(); focusEl(t || $('#menu')); }

function move(dir) {
  let cur = document.activeElement;
  if (!cur || cur === document.body || cur === document.documentElement) cur = null;
  if (cur && document.body.classList.contains('home') && window.scrollY < 4 && !dlgEl && !layerEl) {
    if (dir === 'down' && cur.closest('.hero')) { const t = $('.happs .atile'); if (t) { navTick(); return focusEl(t); } }
    if (dir === 'up' && cur.closest('.happs')) { const t = $('.hero .hslide a[tabindex="0"]'); if (t) { navTick(); return focusEl(t); } }
  }
  const all = Array.from(document.querySelectorAll(FOCUSABLE)).filter(el =>
    !el.closest('.mini') && !el.disabled && !el.hidden && el.tabIndex >= 0 &&
    (!(dlgEl || layerEl) || (dlgEl || layerEl).contains(el) || (!dlgEl && layerEl.classList.contains('acc') && el.classList.contains('hmore'))) &&
    !(cur && (el === cur || el.contains(cur) || cur.contains(el))) &&
    !(cur && cur.closest('.sleft') && (dir === 'up' || dir === 'down') && !el.closest('.sleft')) &&
    !(cur && cur.closest('#side') && (dir === 'up' || dir === 'down') && !el.closest('#side')));
  if (!cur) {
    const t = (TV.last && TV.last.isConnected && canFocus(TV.last) ? TV.last : null) || initialTarget() || all.find(canFocus);
    return focusEl(t);
  }
  /* Suche: erst am rechten Rand der Tastatur → Treffer/Pills */
  if (dir === 'right' && cur.closest('.sleft') && cur.classList.contains('key')) {
    const keys = Array.from(document.querySelectorAll('.sleft .key')).filter(canFocus);
    if (keys.length) {
      const maxR = Math.max(...keys.map(k => k.getBoundingClientRect().right));
      if (cur.getBoundingClientRect().right >= maxR - 12) {
        const result = document.querySelector('.sres .card, .sres .srow-a, .sres a.card, .sres .slist .srow-a');
        const tab = document.querySelector('.sres-tabs .chip.active, .sres-tabs .chip');
        const target = (result && canFocus(result)) ? result : (tab && canFocus(tab) ? tab : null);
        if (target) { TV.colFor = target; return focusEl(target); }
      }
    }
  }
  /* Suche: von Treffern nach oben → Pills (Videos/Songs) */
  if (dir === 'up' && cur.closest('.sres') && !cur.closest('.sres-tabs')) {
    const tab = document.querySelector('.sres-tabs .chip.active, .sres-tabs .chip');
    if (tab && canFocus(tab)) {
      const c0 = cur.getBoundingClientRect(), t0 = tab.getBoundingClientRect();
      if (t0.bottom <= c0.top + 4) { TV.colFor = tab; return focusEl(tab); }
    }
  }
  /* Suche: von Treffern/Pills links zurück zur Tastatur */
  if (dir === 'left' && cur.closest('.sres') && !cur.closest('.sleft')) {
    const keys = Array.from(document.querySelectorAll('.sleft .key')).filter(canFocus);
    if (keys.length) {
      const c0 = cur.getBoundingClientRect(), cy0 = c0.top + c0.height / 2;
      keys.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return Math.abs((ra.top + ra.height / 2) - cy0) - Math.abs((rb.top + rb.height / 2) - cy0) || rb.right - ra.right;
      });
      const key = keys[0];
      if (key) { TV.colFor = key; return focusEl(key); }
    }
  }
  const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2, horiz = dir === 'left' || dir === 'right';
  if (horiz || TV.colFor !== cur) TV.col = null;
  if (!horiz && TV.col == null) TV.col = cx;
  const colX = TV.col == null ? cx : TV.col;
  const scored = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right <= 0 || r.left >= innerWidth) continue;
    /* Startseite: der feste, weggeblurrte Hero-Button liegt am Bildschirm unten – nach dem Scrollen nie als Ziel von Runter/Seitwärts */
    if (dir !== 'up' && window.scrollY > 4 && el.closest('.hero')) continue;
    /* Auf der Tastatur: keine Sprünge zu Treffern während normaler Navigation */
    if (cur && cur.closest('.sleft') && el.closest('.sres')) continue;
    if (cur && cur.closest('.sres') && el.closest('.sleft') && dir !== 'left') continue;
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    let prim, gap, off;
    if (horiz) {
      if (dir === 'right' ? ex <= cx + 1 : ex >= cx - 1) continue;
      prim = dir === 'right' ? r.left - c.right : c.left - r.right;
      gap = Math.max(0, r.top - c.bottom, c.top - r.bottom);
      if (gap > 8) continue;
      off = Math.abs(ey - cy);
    } else {
      if (dir === 'down' ? ey <= cy + 1 : ey >= cy - 1) continue;
      prim = dir === 'down' ? r.top - c.bottom : c.top - r.bottom;
      gap = Math.max(0, r.left - c.right, c.left - r.right);
      off = Math.abs(ex - colX);
    }
    scored.push([Math.max(0, prim) + gap * 3 + off * .5 + (gap === 0 ? 0 : 1000), el]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  const hit = scored.find(s => canFocus(s[1]));
  if (hit) { TV.colFor = hit[1]; return focusEl(hit[1]); }
  if (cur.closest('#side') && dir === 'right') return closeSide();
  if (dir === 'left' && !cur.closest('#side,.pmenu,.player,.sticky-player,.sugg,.sleft,.acc,.hmore.on')) openSide();
}

/* FIX: goBack verlässt NIE das Vollbild */
function goBack() {
  if (dlgEl) { (dlgEl._cancel || closeDlg)(); closeDlg(); return true; }
  if (layerEl) { (layerEl._close)(); return true; }
  if (appWin) { askCloseApp(); return true; }
  if (TV.player && TV.player.classList.contains('panel')) { TV.player.closePanels(); focusEl(TV.player); return true; }
  const pm = document.querySelector('.pmenu:not([hidden])');
  if (pm) { pm.hidden = true; focusEl(TV.player && TV.player.querySelector('[aria-label="Einstellungen"]')); return true; }
  if (!sugg.hidden) { sugg.hidden = true; return true; }
  const a = document.activeElement;
  if (TV.player && a && a !== TV.player && a.closest('.pc,.ptop')) { focusEl(TV.player); return true; }

  const hash = location.hash;
  if (hash && hash !== '#/' && hash !== '#') {
    if (history.length > 1) history.back(); else location.hash = '#/';
    return true;
  }
  // Kein exitFullscreen mehr – Vollbild bleibt immer erhalten
  return false;
}

function goHomeNow() {
  if (typeof dlgEl !== 'undefined' && dlgEl) { try { (dlgEl._cancel || closeDlg)(); closeDlg(); } catch {} }
  if (appSearch) closeAppSearch(true);
  if (appWin) closeApp();
  if (layerEl && layerEl._close) layerEl._close(true);
  document.querySelectorAll('.astore,.aset').forEach(e => e._close && e._close(true));
  const already = !location.hash || location.hash === '#/';
  if (!already) location.hash = '#/';
  else {
    /* schon auf dem Homescreen: ganz nach oben, Reihen zurücksetzen */
    window.scrollTo({ top:0, behavior:'smooth' }); document.documentElement.scrollTop = 0;
    document.querySelectorAll('main .hrow,main .arow').forEach(r => { try { r.scrollTo({ left:0, behavior:'smooth' }); } catch {} });
  }
  let tries = 0;
  const focusHero = () => {
    const f = document.body.classList.contains('home') ? initialTarget() : null;
    if (f) { focusEl(f); window.scrollTo({ top:0, behavior:'smooth' }); } else if (++tries < 14) setTimeout(focusHero, 150);
  };
  setTimeout(focusHero, already ? 420 : 350);
}
function tvKey(ev) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  TV.pending = false;
  const k = ev.key, c = ev.keyCode, t = ev.target;

  if (k === 'Home' || k === 'BrowserHome' || k === 'GoHome' || c === 36 || c === 458 || c === 10073) { ev.preventDefault(); goHomeNow(); return; }
  /* App offen: ALLE Tasten (auch Zurück) an die App weiterreichen – die App meldet per mp-app-exit, wenn sie geschlossen werden soll */
  if (appWin && !dlgEl) {
    if (appSearch || keyIsSys(k, c)) return; /* Lautstärke, Sprachsuche, Einstellungen, Menü bleiben beim System */
    ev.preventDefault();
    if (keyIsSearch(k, c)) return openAppSearch();
    const ok = keyIsOk(k, c), fk = ok ? 'Enter' : k, fc = ok ? 13 : c;
    try { appWin._frame.focus(); appWin._frame.contentWindow.focus(); } catch {}
    try { appWin._frame.contentWindow.postMessage({ type:'mp-key', key:fk, keyCode:fc }, '*'); } catch {}
    return;
  }
  if (k === 'GoBack' || k === 'BrowserBack' || c === 461 || c === 10009 || k === 'Escape' || (k === 'Backspace' && !/^(input|textarea|select)$/i.test(t.tagName))) {
    if (goBack()) ev.preventDefault();
    return;
  }
  const p = TV.player, v = TV.video;
  if (p && v && document.body.dataset.route === 'watch') {
    const eat = f => { ev.preventDefault(); f(); };
    if (k === 'MediaPlayPause' || c === 179 || c === 10252) return eat(() => p.toggle());
    if (k === 'MediaPlay' || c === 415) return eat(() => v.play().catch(() => {}));
    if (k === 'MediaPause' || c === 19 || k === 'MediaStop' || c === 413) return eat(() => v.pause());
    if (k === 'MediaRewind' || c === 412) return eat(() => p.skip(-10));
    if (k === 'MediaFastForward' || c === 417) return eat(() => p.skip(10));
  }

  const dir = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' }[k] || ({ 37:'left', 38:'up', 39:'right', 40:'down' })[c];
  if (dir) {
    if (t.tagName === 'INPUT' && !/^(checkbox|range|button)$/.test(t.type)) {
      if (dir === 'left' && t.selectionStart > 0) return;
      if (dir === 'right' && t.selectionEnd < t.value.length) return;
    }
    ev.preventDefault();
    if (p && t === p) {
      if (dir === 'up' || dir === 'down') { navTick(); return focusEl(p.querySelector('.prow .pb')); }
      return;
    }
    navTick();
    return move(dir);
  }

  if (k === 'Enter' || c === 13) {
    if (p && (t === p || t.classList.contains('seek'))) { ev.preventDefault(); p.toggle(); }
    else if (t.tagName === 'INPUT' && t.type === 'checkbox') { ev.preventDefault(); t.click(); }
    else if (t.tagName === 'SELECT') { ev.preventDefault(); openChoice(t); }
  }
}
document.addEventListener('keydown', tvKey);

document.addEventListener('focusin', ev => {
  if (document.body.dataset.route !== 'suche') return;
  const t = ev.target;
  if (t.closest && t.closest('.sleft')) {
    document.body.classList.remove('sk-away');
    if (t.classList && t.classList.contains('key')) {
      window.scrollTo({ top:0, behavior:'smooth' });
      const sl = t.closest('.sleft'); if (sl.scrollTop) sl.scrollTo({ top:0, behavior:'smooth' });
    }
  }
  else if (main.contains(t)) document.body.classList.add('sk-away');
});

const killEv = ev => { if (ev.cancelable) ev.preventDefault(); ev.stopImmediatePropagation(); };
['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, killEv, { capture:true, passive:false }));
['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, ev => { if (ev.pointerType === 'touch' || ev.pointerType === 'pen') killEv(ev); }, true));
['contextmenu', 'dragstart'].forEach(t => document.addEventListener(t, ev => ev.preventDefault()));
document.documentElement.dataset.input = 'remote';

document.addEventListener('focusin', ev => { if (main.contains(ev.target)) TV.last = ev.target; });

new MutationObserver(() => {
  if (!TV.pending) return;
  const t = initialTarget();
  if (t) { TV.pending = false; focusEl(t); }
}).observe(main, { childList:true, subtree:true });

document.addEventListener('click', ev => {
  if (!TV.player || !ev.target.closest) return;
  const el = ev.target.closest('[aria-label="Einstellungen"],.pmenu-btn');
  if (!el) return;
  const idx = el.classList.contains('pmenu-btn') ? Array.from(TV.player.querySelectorAll('.pmenu-btn')).indexOf(el) : -1;
  setTimeout(() => {
    const pm = TV.player && TV.player.querySelector('.pmenu');
    if (!pm || pm.hidden) return;
    const btns = pm.querySelectorAll('.pmenu-btn');
    focusEl(idx >= 0 && btns[idx] ? btns[idx] : (pm.querySelector('.pmenu-btn.on') || btns[0]));
  }, 0);
}, true);

$('#side').addEventListener('click', ev => {
  if (!ev.target.closest('a')) return;
  setTimeout(() => {
    const a = document.activeElement;
    if (!a || a === document.body || a.closest('#side')) focusEl(initialTarget());
  }, 150);
});

/* =========================================================
   WELCOME – Willkommens-Overlay (Blur + welcome.gif + Weiter)
   ========================================================= */
const Welcome = (() => {
  let el = null, stepEl = null, open = false, step = 0, prevFocus = null, name = '', canClose = false, connected = false, statusEl = null;
  const STEPS = 3;
  const BACK = ['GoBack', 'BrowserBack', 'Escape'];
  const isBack = (k, c) => BACK.includes(k) || c === 461 || c === 10009 || c === 27;
  const addCh = c => { if (name.length >= 20) return; name += (!name || name.endsWith(' ')) ? c.toUpperCase() : c.toLowerCase(); };
  function ensure() {
    if (el) return;
    el = h('div', { id:'welcome', class:'wz', role:'dialog', 'aria-modal':'true', 'aria-label':'Willkommen' });
    document.body.append(el);
    document.addEventListener('mp-phone', () => { connected = true; paintStatus(); });
  }
  function paintStatus() {
    if (!statusEl) return;
    statusEl.classList.toggle('ok', connected);
    statusEl.lastChild.textContent = connected ? 'Handy verbunden' : 'Warte auf Handy …';
  }
  const WZI = {
    tv:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>'
  };
  function wzIc(n) {
    const sv = document.createElementNS(NS, 'svg');
    sv.setAttribute('class', 'wz-ic'); sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('aria-hidden', 'true');
    sv.innerHTML = WZI[n];
    return sv;
  }
  function dots() { return h('div', { class:'wz-dots' }, Array.from({ length:STEPS }, (_, i) => h('i', { class:i === step ? 'on' : '' }))); }
  function goto(n) {
    step = Math.max(0, Math.min(STEPS - 1, n));
    const build = [s1, s0, s2][step];  /* 0 = Fernbedienung koppeln, 1 = Erklärung, 2 = Name */
    stepEl = build();
    el.replaceChildren(stepEl);
    const f = stepEl.querySelector('button.btn.primary, button.go') || stepEl.querySelector('button');
    setTimeout(() => { if (open && f) focusEl(f); }, 60);
  }
  /* Schritt 1: Erklärung */
  function s0() {
    const card = (ic, t, d) => h('div', { class:'wz-card' }, icon(ic), h('b', {}, t), h('span', {}, d));
    return h('div', { class:'wz-step' }, dots(), h('div', { class:'wz-logo' }, 'Media+'), h('h1', {}, wzIc('tv'), 'Willkommen'),
      h('p', { class:'wz-lead' }, 'Fernsehen mit der ARD-Mediathek, Livesendern und Musik – bedient mit der Fernbedienung oder dem Handy.'),
      h('div', { class:'wz-cards' },
        card('tv', 'Mediathek & Live', 'Sendungen der ARD, Livesender und Shorts an einem Ort.'),
        card('search', 'Suchen & Weiterschauen', 'Mit der Bildschirmtastatur suchen. Media+ merkt sich, wo du aufgehört hast.'),
        card('share', 'Handy als Fernbedienung', 'Am Handy tippen oder Videos direkt auf den TV schicken.')),
      h('div', { class:'wz-row' },
        h('button', { class:'btn', type:'button', onclick:() => goto(0) }, 'Zurück'),
        h('button', { class:'btn primary', type:'button', onclick:() => goto(2) }, 'Weiter')));
  }
  /* Schritt 1 (zuerst gezeigt): Handy als Fernbedienung koppeln */
  function s1() {
    const t = store.get('pairTopic') || '';
    const base = store.get('mobileUrl') || location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, 'mobile.html');
    const url = base + '?tv=' + t + '#/remote';
    const box = h('div', { class:'qrbox wz-qr' }, 'QR-Code wird erzeugt …');
    new Promise((res, rej) => {
      if (window.qrcode) return res();
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = res; s.onerror = rej; document.head.append(s);
    }).then(() => { const q = qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize:6, margin:0 }); })
      .catch(() => { box.textContent = 'QR-Code nicht verfügbar'; });
    statusEl = null;
    return h('div', { class:'wz-step' }, dots(), h('h1', {}, wzIc('phone'), 'Fernbedienung einrichten'),
      h('p', { class:'wz-lead' }, 'Scanne den QR-Code mit der Handy-Kamera – fertig.'),
      h('div', { class:'wz-pair' }, box),
      h('div', { class:'wz-row' },
        h('button', { class:'btn primary', type:'button', onclick:() => goto(1) }, 'Weiter')));
  }
  /* Schritt 3: Name (TV-Tastatur) */
  function s2() {
    const disp = h('div', { class:'sdisp wz-disp' });
    const draw = () => { disp.classList.toggle('ph', !name); disp.replaceChildren(name ? h('span', { style:'color:inherit' }, name + '▍') : h('span', {}, 'Dein Name')); };
    const edit = fn => { fn(); draw(); };
    const key = (l, fn, cls = '') => h('button', { class:'key ' + cls, type:'button', onclick:fn }, l);
    const kb = h('div', { class:'keys wz-keys' },
      'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜß'.split('').map(c => key(c, () => edit(() => addCh(c)))),
      key('Leerzeichen', () => edit(() => { if (name && !name.endsWith(' ')) name += ' '; }), 'w3'),
      key('⌫ Löschen', () => edit(() => { name = name.slice(0, -1); }), 'w2'),
      key('Fertig', finish, 'w2 go'));
    s2.draw = draw;
    const st = h('div', { class:'wz-step' }, dots(), h('h1', {}, wzIc('user'), 'Wie heißt du?'),
      h('p', { class:'wz-lead' }, 'Dein Name wird in Media+ gespeichert und später gebraucht.'),
      h('div', { class:'wz-name' }, disp, kb),
      h('div', { class:'wz-row' }, h('button', { class:'btn', type:'button', onclick:() => goto(1) }, 'Zurück')));
    draw();
    return st;
  }
  function finish() {
    const n = name.trim();
    if (!n) { toast('Bitte gib deinen Namen ein'); return; }
    store.set('userName', n);
    store.set('setupDone', true);
    store.set('welcomed', true);
    hide();
    toast('Hallo, ' + n + '!');
  }
  function nav(dir) {
    const items = [...stepEl.querySelectorAll('button')];
    const cur = document.activeElement;
    if (!items.includes(cur)) { focusEl(items[0]); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = 1e9;
    items.forEach(o => {
      if (o === cur) return;
      const q = o.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const prim = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const sec = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
      if (prim < 2) return;
      const s = prim + sec * 2.5;
      if (s < bs) { bs = s; best = o; }
    });
    if (best) focusEl(best);
  }
  function onKey(ev) {
    if (!open) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key, c = ev.keyCode;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (step === 2) {
      if (k.length === 1 && /[A-Za-zÄÖÜäöüß]/.test(k)) { addCh(k); s2.draw(); return; }
      if (k === ' ' && document.activeElement && !document.activeElement.matches('.btn')) { if (name && !name.endsWith(' ')) name += ' '; s2.draw(); return; }
      if (k === 'Backspace') { name = name.slice(0, -1); s2.draw(); return; }
    }
    const dir = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' }[k] || ({ 37:'left', 38:'up', 39:'right', 40:'down' })[c];
    if (dir) { nav(dir); return; }
    if (keyIsOk(k, c)) { const a = document.activeElement; if (a && stepEl.contains(a)) a.click(); else nav('down'); return; }
    if (isBack(k, c)) { if (step > 0) goto(step - 1); else if (canClose) hide(); }
  }
  function show() {
    ensure();
    if (open) return;
    open = true;
    canClose = store.get('setupDone', false) === true;
    name = store.get('userName', '') || '';
    connected = false;
    prevFocus = document.activeElement;
    goto(0);
    void el.offsetWidth;
    el.classList.add('show');
    document.body.classList.add('welcome-on');
    document.addEventListener('keydown', onKey, true);
  }
  function hide() {
    if (!open) return;
    open = false;
    el.classList.remove('show');
    document.body.classList.remove('welcome-on');
    document.removeEventListener('keydown', onKey, true);
    try { if (prevFocus && prevFocus.isConnected && prevFocus !== document.body) prevFocus.focus(); } catch {}
    prevFocus = null;
  }
  /* Erststart: erst nach der Boot-Animation anzeigen */
  function firstRun() {
    if (store.get('setupDone', false)) return;
    if (!store.get('theme', null)) { store.set('theme', 'dark'); setTheme('dark'); }
    const wait = setInterval(() => {
      if (document.readyState !== 'complete' || (window.BOOT && BOOT.active)) return;
      clearInterval(wait);
      setTimeout(show, 700);
    }, 250);
  }
  return { show, hide, firstRun, isOpen:() => open };
})();

/* =========================================================
   PLUS
   ========================================================= */
const IS_TV = typeof TV !== 'undefined';
const PLUS = (() => {
  const LIVE = [
    { id:'ard',          name:'Das Erste',    url:'https://mcdn.daserste.de/daserste/de/master.m3u8' },
    { id:'tagesschau24', name:'tagesschau24', url:'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8' },
    { id:'one',          name:'ONE',          url:'https://mcdn.one.ard.de/ardone/hls/master.m3u8' },
    { id:'ard-alpha',    name:'ARD alpha',    url:'https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8' },
    { id:'wdr',          name:'WDR',          url:'https://wdrfs247.akamaized.net/hls/live/681509/wdrfs247/index.m3u8' },
    { id:'ndr',          name:'NDR',          url:'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_hh/master.m3u8' },
  ];
  const COLORS = ['#0070f3', '#e5484d', '#30a46c', '#f5a623', '#8e4ec6'];
  const now = () => Math.floor(Date.now() / 1000);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hd = t => h('div', { class:'page-h' }, h('h1', {}, t));
  let cur = null, sleepT = 0, sleepMin = 0, wl = null, es = null;

  function live(arg) {
    document.title = 'Live-TV – Media +';
    let i = Math.max(0, LIVE.findIndex(c => c.id === arg)), hls = null;
    const video = h('video', { playsinline:true, autoplay:true });
    const perr = h('div', { class:'perr' }, icon('alert'), h('p', {}, 'Dieser Livestream lässt sich hier nicht abspielen.'),
      h('a', { class:'btn primary', href:'https://www.ardmediathek.de/live', target:'_blank', rel:'noopener noreferrer' }, icon('external'), 'Bei der ARD ansehen'));
    const player = buildPlayer(video, perr), fail = () => perr.classList.add('show');
    video.addEventListener('error', fail);
    const btns = LIVE.map((c, k) => h('button', { class:'chip', type:'button', onclick:() => tune(k) }, (k + 1) + ' · ' + c.name));
    function tune(k) {
      i = (k + LIVE.length) % LIVE.length; const u = LIVE[i].url;
      player.setTitle('LIVE · ' + LIVE[i].name); btns.forEach((b, j) => b.classList.toggle('active', j === i));
      perr.classList.remove('show'); if (hls) { hls.destroy(); hls = null; }
      if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = u; video.play().catch(() => {}); return; }
      loadHls().then(() => {
        if (!window.Hls || !Hls.isSupported()) return fail();
        hls = new Hls(); hls.loadSource(u); hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
        video.play().catch(() => {});
      }).catch(fail);
    }
    cur = { player, tune, get i() { return i; } };
    cleanups.push(() => { cur = null; if (hls) hls.destroy(); video.pause(); video.removeAttribute('src'); video.load(); });
    main.append(h('div', { style:'max-width:1200px;margin:0 auto' }, player, h('div', { class:'lvchips' }, ...btns),
      h('p', { style:'color:var(--fg-3);font-size:.9em' }, 'Zahlentasten 1–' + LIVE.length + ' oder ↑/↓ und CH+/CH− wechseln den Sender.')));
    tune(i);
    if (IS_TV) { TV.pending = false; setTimeout(() => player.focus(), 50); }
  }

  const subs = () => { const v = store.get('subs', []); return Array.isArray(v) ? v : []; }, sk = (c, t) => c + '/' + t;
  const isSub = (c, t) => subs().some(s => s.k === sk(c, t));
  function toggleSub(c, t) {
    let l = subs();
    if (l.some(s => s.k === sk(c, t))) { store.set('subs', l.filter(s => s.k !== sk(c, t))); return false; }
    l.push({ k:sk(c, t), ch:c, topic:t, seen:now() }); store.set('subs', l); return true;
  }
  const latest = async s => (await search({ channel:chanById(s.ch) || null, topic:s.topic, exact:s.topic, size:8 })).items;
  async function refreshBadge() {
    const ids = [];
    for (const s of subs().slice(0, 12)) { try { (await latest(s)).forEach(x => { if (x.timestamp > s.seen) ids.push(x.id); }); } catch {} }
    store.set('subNew', ids); markNav();
  }
  function subsPage() {
    document.title = 'Abos – Media +'; main.append(hd('Abos'));
    const l = subs(), tok = routeToken;
    if (!l.length) return main.append(emptyBox('plus', 'Noch keine Abos. Öffne eine Sendung und tippe auf „Abonnieren“.'));
    l.forEach(s => {
      const c = chanById(s.ch) || { id:'', name:'ARD', short:'ARD', color:'#666' };
      const nb = h('span', { class:'newb', hidden:true }), grid = h('div', { class:'grid' });
      main.append(h('div', { class:'page-h', style:'padding:18px 0 8px' }, Avatar(c),
        h('a', { href:'#/show/' + s.ch + '/' + encodeURIComponent(s.topic) }, h('h2', { style:'margin:0;font-size:1.2em' }, s.topic)), nb), grid);
      latest(s).then(items => {
        if (tok !== routeToken) return;
        items.slice(0, 4).forEach(x => grid.append(Card(x)));
        const n = items.filter(x => x.timestamp > s.seen).length;
        if (n) { nb.hidden = false; nb.textContent = n + ' neu'; }
        if (!items.length) grid.append(h('p', {}, 'Keine Folgen gefunden.'));
      }).catch(() => {});
    });
    store.set('subNew', []); markNav();
    const t = now(), all = subs(); all.forEach(s => { s.seen = t; }); setTimeout(() => store.set('subs', all), 4000);
  }

  function access(arg) {
    const V = { ad:['Audiodeskription', 'Audiodeskription'], dgs:['Gebärdensprache', 'Gebärdensprache'], ut:['Mit Untertitel', '(mit Untertitel'] };
    const v = V[arg] || V.ad; document.title = v[0] + ' – Media +';
    const chips = Object.entries(V).map(([k, x]) => h('a', { class:'chip' + (x === v ? ' active' : ''), href:'#/access/' + k }, x[0]));
    main.append(hd(v[0]), h('div', { class:'lvchips', style:'padding-top:0' }, ...chips));
    const host = h('div'); main.append(host);
    Feed(host, off => search({ text:v[1], min:300, offset:off }), { emptyText:'Dazu gibt es gerade nichts.' });
  }
  async function random() {
    main.append(h('div', { class:'empty' }, h('div', {}, 'Überraschung wird gesucht …')));
    const tok = routeToken, T = ['Spielfilm', 'Krimi', 'Komödie', 'Drama', 'Dokumentation', 'Tatort', 'Reportage', 'Kabarett'];
    try {
      const t = T[Math.floor(Math.random() * T.length)];
      let r = await search({ text:t, min:2400, offset:Math.floor(Math.random() * 60), size:24 });
      if (!r.items.length) r = await search({ text:t, min:2400, size:24 });
      if (tok !== routeToken) return;
      const e = r.items[Math.floor(Math.random() * r.items.length)];
      if (e) { cache.set(e.id, e); location.replace('#/watch/' + encodeURIComponent(e.id)); } else toast('Nichts gefunden');
    } catch { toast('Das hat nicht geklappt'); }
  }

  const KEYS = ['hist', 'saved', 'prog', 'subs', 'seen', 'recent'], OBJ = { prog:1, seen:1 };
  function exportData() {
    const o = { v:1 }; KEYS.forEach(k => { o[k] = store.get(k, OBJ[k] ? {} : []); });
    const a = h('a', { href:URL.createObjectURL(new Blob([JSON.stringify(o)], { type:'application/json' })), download:'media-plus-daten.json' });
    document.body.append(a); a.click(); a.remove(); toast('Exportiert');
  }
  function importData(o) {
    const arr = (k) => Array.isArray(o[k]) ? o[k] : [];
    ['hist', 'saved'].forEach(k => { const a = store.get(k, []), ids = new Set(a.map(x => x.id)); store.set(k, [...a, ...arr(k).filter(x => x && x.id && !ids.has(x.id))].slice(0, 500)); });
    const sb = subs(), ks = new Set(sb.map(x => x.k)); store.set('subs', [...sb, ...arr('subs').filter(x => x && x.k && !ks.has(x.k))]);
    const p = store.get('prog', {}); Object.entries(o.prog || {}).forEach(([id, v]) => { if (!p[id] || p[id].t < v.t) p[id] = v; }); store.set('prog', p);
    store.set('seen', { ...store.get('seen', {}), ...(o.seen || {}) });
    store.set('recent', [...new Set([...store.get('recent', []), ...arr('recent')])].slice(0, 8));
  }
  function applyLook() {
    const r = document.documentElement, f = store.get('cw', 1), ac = store.get('accent', '');
    if (ac) r.style.setProperty('--accent', ac); else r.style.removeProperty('--accent');
    r.style.setProperty('--cw', IS_TV ? (19 * f) + 'rem' : (280 * f) + 'px'); r.classList.toggle('cw', f !== 1);
    const c = store.get('cue', {});
    r.style.setProperty('--cs', c.size || 1); r.style.setProperty('--cb', c.bg || 'rgba(0,0,0,.6)'); r.style.setProperty('--cf', c.fg || '#fff');
    r.style.setProperty('--bright', store.get('bright', 1)); r.classList.toggle('br', store.get('bright', 1) !== 1);
  }

  function more() {
    document.title = 'Mehr – Media +';
    const B = (ic, l, fn, on) => h('button', { class:'mopt' + (on ? ' on' : ''), type:'button', onclick:fn }, icon(ic), h('span', {}, l));
    const L = (ic, l, href) => h('a', { class:'mopt', href }, icon(ic), h('span', {}, l));
    const SEC = (title, ...items) => h('section', { class:'msec' }, h('h2', { class:'msec-h' }, title), h('div', { class:'mgrid' }, ...items));
    const file = h('input', { type:'file', accept:'application/json,.json', hidden:true, onchange:async ev => {
      try { importData(JSON.parse(await ev.target.files[0].text())); toast('Importiert'); route(); } catch { toast('Datei nicht lesbar'); } } });

    const wrap = h('div', { class:'mwrap' },
      SEC('Entdecken',
        L('tv', 'Live-TV', '#/live'),
        L('shorts', 'Shorts', '#/shorts'),
        L('refresh', 'Überrasch mich', '#/random')),
      SEC('Zugänglichkeit',
        L('captions', 'Audiodeskription', '#/access/ad'),
        L('captions', 'Gebärdensprache', '#/access/dgs'),
        L('captions', 'Mit Untertitel', '#/access/ut')),
      SEC('Kopplung Handy ↔ TV',
        IS_TV ? L('share', 'Mit Handy koppeln (QR)', '#/pair') : L('share', 'An TV senden', '#/send')),
      SEC('Einstellungen', B('settings', 'Einstellungen öffnen', () => openSettings())),
      file
    );
    main.append(hd('Mehr'), wrap);
  }

  
  /* ---------- Direktverbindung Handy <-> TV (WebRTC über PeerJS, Fallback ntfy) ---------- */
  const PEER_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  let peerP = null;
  const loadPeer = () => window.Peer ? Promise.resolve() : (peerP || (peerP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PEER_SRC; s.onload = res;
    s.onerror = () => { peerP = null; rej(new Error('peerjs')); }; document.head.append(s); })));
  const PID = t => 'mplus-' + t;
  let phPeer = null, phConn = null, phP = null, p2pDown = 0, p2pLast = 'noch nicht verbunden';
  /* Jede Nachricht hat eine ID und wird vom TV bestätigt (ack). Kommt kein ack, ist die Leitung
     still gestorben (z. B. NAT/Standby) – dann sofort ntfy nutzen und neu verbinden. */
  const ackWait = new Map();
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dropConn = c => { if (!c) return; try { c.close(); } catch {} if (phConn === c) phConn = null; };
  function phoneConn() {
    const t = store.get('tvTopic'); if (!t) return Promise.reject(new Error('no-tv'));
    if (phConn && phConn.peer !== PID(t)) { try { phConn.close(); } catch {} phConn = null; }
    if (phConn && phConn.open) return Promise.resolve(phConn);
    if (phP) return phP;
    phP = (async () => {
      await loadPeer();
      if (!phPeer || phPeer.destroyed) {
        const p = phPeer = new Peer();
        try {
          await new Promise((res, rej) => { p.once('open', res); p.once('error', rej); setTimeout(() => rej(new Error('peer-timeout')), 8000); });
        } catch (e) { try { p.destroy(); } catch {} if (phPeer === p) phPeer = null; throw e; }
        p.on('disconnected', () => { try { p.reconnect(); } catch {} });
        p.on('close', () => { if (phPeer === p) { phPeer = null; phConn = null; } });
      }
      const p = phPeer;
      return await new Promise((res, rej) => {
        const c = p.connect(PID(t), { reliable:true, serialization:'json' });
        c.on('data', d => { try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; } if (d && d.t === 'ack' && ackWait.has(d.i)) ackWait.get(d.i)(); });
        const onErr = e => { if (e && e.type === 'peer-unavailable') fail(e); };
        const fail = e => { clearTimeout(to); p.off('error', onErr); if (phConn === c) phConn = null; try { c.close(); } catch {} rej(e); };
        const to = setTimeout(() => fail(new Error('conn-timeout')), 5000);
        p.on('error', onErr);
        c.on('open', () => { clearTimeout(to); p.off('error', onErr); phConn = c; res(c); });
        c.on('close', () => { if (phConn === c) phConn = null; });
        c.on('error', fail);
      });
    })().then(c => { p2pLast = 'Direkt verbunden (P2P)'; return c; }, e => { p2pLast = 'P2P-Fehler: ' + (e && (e.type || e.message) || e); throw e; }).finally(() => { phP = null; });
    return phP;
  }
  async function sendP2P(d, tmo = 1800) {
    const c = await phoneConn();
    const i = d.i || newId(); d.i = i;
    await new Promise((res, rej) => {
      const to = setTimeout(() => { ackWait.delete(i); rej(new Error('no-ack')); }, tmo);
      ackWait.set(i, () => { clearTimeout(to); ackWait.delete(i); res(); });
      try { c.send(d); } catch (e) { clearTimeout(to); ackWait.delete(i); rej(e); }
    }).catch(e => { dropConn(c); throw e; });
    p2pDown = 0; p2pLast = 'Direkt verbunden (P2P)';
  }
  async function sendMsg(d) {
    const t = store.get('tvTopic'); if (!t) throw new Error('no-tv');
    d = { ...d, i:newId() };
    /* Nie auf einen Verbindungsaufbau warten: ist keine offene P2P-Leitung da, geht die Taste sofort über ntfy,
       die Leitung wird nebenbei neu aufgebaut. Gibt es nach 450 ms kein ack, geht dieselbe Nachricht zusätzlich
       über ntfy (der TV filtert Doppelte per ID). */
    const viaNtfy = async () => {
      const r = await fetch('https://ntfy.sh/' + t, { method:'POST', body:JSON.stringify(d), keepalive:true });
      if (!r.ok) throw new Error(r.status);
      p2pLast = 'Nur ntfy (' + p2pLast + ')';
      return 'ntfy';
    };
    const c = phConn;
    if (!(c && c.open)) { phoneConn().catch(() => {}); return viaNtfy(); }
    return new Promise((res, rej) => {
      let done = false, t1 = 0, t2 = 0;
      const fin = (ok, v) => { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); ackWait.delete(d.i); ok(v); };
      ackWait.set(d.i, () => { p2pDown = 0; p2pLast = 'Direkt verbunden (P2P)'; fin(res, 'p2p'); });
      try { c.send(d); } catch (e) { dropConn(c); phoneConn().catch(() => {}); return viaNtfy().then(v => fin(res, v), er => fin(rej, er)); }
      t1 = setTimeout(() => { viaNtfy().then(v => fin(res, v), er => { if (!ackWait.has(d.i)) fin(rej, er); }); }, 450);
      t2 = setTimeout(() => { if (done) return; dropConn(c); phoneConn().catch(() => {}); fin(rej, new Error('no-ack')); }, 3000);
    });
  }

  const sendTv = async d => {
    if (!store.get('tvTopic')) return toast('Erst mit dem TV koppeln');
    try { await sendMsg(d); toast('An TV gesendet'); } catch (e) { toast(String(e && e.message) === '429' ? 'ntfy-Limit erreicht – kurz warten' : 'Senden fehlgeschlagen'); }
  };
  let osdEl = null, osdT = 0;
  function osd(ic, text, pct) {
    if (!osdEl) { osdEl = h('div', { id:'osd', role:'status' }); document.body.append(osdEl); }
    osdEl.replaceChildren(...[icon(ic), h('span', {}, text), pct == null ? null : h('span', { class:'ob' }, h('i', { style:'width:' + pct + '%' }))].filter(Boolean));
    osdEl.classList.add('show'); clearTimeout(osdT); osdT = setTimeout(() => osdEl.classList.remove('show'), 1700);
  }
  let vhEl = null, vhT = 0;
  function volHud(vol, muted) {
    if (!vhEl) { vhEl = h('div', { id:'vhud', role:'status' }, h('i', { class:'vf' }), h('span', { class:'vi' })); document.body.append(vhEl); }
    const pc = muted ? 0 : Math.round(vol * 100);
    vhEl.querySelector('.vf').style.width = pc + '%';
    vhEl.querySelector('.vi').replaceChildren(icon(muted || !pc ? 'mute' : 'vol'));
    vhEl.classList.add('show'); clearTimeout(vhT); vhT = setTimeout(() => vhEl.classList.remove('show'), 1700);
  }
  /* Globale Lautstärke: gilt für JEDES Video auf jeder Seite (Player, Vorschau, Shorts, Live) und wird an Apps im Fenster gesendet */
  const gAudio = {
    vids() { return Array.from(document.querySelectorAll('video:not(.saver-video)')); },
    ref() { const P = TV.player || (cur && cur.player), V = P && P.querySelector('video'); if (V) return V; const l = this.vids(); return l.find(v => !v.paused && !v.ended) || l[0] || null; },
    state() { const r = this.ref(); return r ? { vol:r.volume, muted:r.muted || !r.volume } : { vol:+store.get('vol', 1), muted:!!store.get('gmute', false) }; },
    apply(vol, muted) {
      vol = clamp(vol, 0, 1); store.set('vol', vol); store.set('gmute', !!muted);
      this.vids().forEach(v => { try { v.volume = vol; v.muted = !!muted; } catch {} });
      document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage({ mplus:'audio', volume:vol, muted:!!muted }, '*'); } catch {} });
    }
  };
  if (IS_TV) document.addEventListener('loadstart', ev => { const v = ev.target; if (v && v.tagName === 'VIDEO') { const x = store.get('vol'); if (x != null) try { v.volume = +x; } catch {} } }, true);
  function remoteKey(k) {
    if ((k === 'ok' || k === 'pp') && ScreenSaver.playRec()) return;
    if (k === 'home') { goHomeNow(); return; }
    if (k === 'menu') { openSide(); return; }
    if (k === 'settings') { openSettings(); return; }
    /* App offen: Handy-Tasten gehen an die App (OK = Enter), Suche-Overlay hat Vorrang */
    if (appWin && !dlgEl && !appSearch && ['up','down','left','right','ok','back'].includes(k)) {
      const M = { up:['ArrowUp',38], down:['ArrowDown',40], left:['ArrowLeft',37], right:['ArrowRight',39], ok:['Enter',13], back:['Escape',27] }[k];
      try { appWin._frame.focus(); appWin._frame.contentWindow.focus(); } catch {}
      try { appWin._frame.contentWindow.postMessage({ type:'mp-key', key:M[0], keyCode:M[1] }, '*'); } catch {}
      return;
    }
    if (appSearch && !dlgEl && k === 'ok') { window.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true, cancelable:true })); return; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Shift', bubbles:true }));
    const P = TV.player || (cur && cur.player), V = P && P.querySelector('video');
    const a = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    const fire = (key, code) => a.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode:code, bubbles:true, cancelable:true }));
    const NAV = { up:['ArrowUp',38], down:['ArrowDown',40], left:['ArrowLeft',37], right:['ArrowRight',39], back:['Escape',27] };
    if (NAV[k]) return fire(...NAV[k]);
    if (k === 'ok') {
      if (P && a === P && V) { P.toggle(); setTimeout(() => osd(V.paused ? 'pause' : 'play', V.paused ? 'Pause' : 'Wiedergabe'), 80); }
      else if (a !== document.body && a.click) a.click();
      return;
    }
    if (k === 'pp') { if (P && V) { P.toggle(); setTimeout(() => osd(V.paused ? 'pause' : 'play', V.paused ? 'Pause' : 'Wiedergabe'), 80); } return; }
    if (k === 'rew' || k === 'ff') { if (P && V) { P.skip(k === 'ff' ? 10 : -10); osd(k === 'ff' ? 'fwd' : 'back', k === 'ff' ? '+10 s' : '−10 s'); } return; }
    if (k === 'mute') {
      const st = gAudio.state(); let vol = st.vol, m = !st.muted;
      if (!m && !(vol > 0)) vol = .5;
      gAudio.apply(vol, m); volHud(vol, m); return;
    }
    if (k === 'vup' || k === 'vdn') {
      const st = gAudio.state(); const vol = clamp((st.muted && k === 'vup' && !(st.vol > 0) ? 0 : st.vol) + (k === 'vup' ? .1 : -.1), 0, 1);
      gAudio.apply(vol, false); volHud(vol, false);
      return;
    }
    if (k === 'cc') {
      fire('c', 67);
      setTimeout(() => { const t = P && P.subTrack; osd('captions', t ? (t.track.mode === 'showing' ? 'Untertitel an' : 'Untertitel aus') : 'Keine Untertitel'); }, 80);
      return;
    }
    if (k === 'chup' || k === 'chdn') {
      fire(k === 'chup' ? 'ChannelUp' : 'ChannelDown', k === 'chup' ? 427 : 428);
      if (cur) setTimeout(() => osd('tv', LIVE[cur.i].name), 100);
      return;
    }
    if (k === 'next') fire('n', 78);
  }
    const seenIds = [];
    const isDupe = i => { if (!i) return false; if (seenIds.includes(i)) return true; seenIds.push(i); if (seenIds.length > 300) seenIds.shift(); return false; };
    function handleMsg(d) {
      if (!d || isDupe(d.i) || d.t === 'ping') return;
      document.dispatchEvent(new Event('mp-phone'));
      if (window.BOOT && BOOT.active) { if (d.t === 'skip' || (d.t === 'q' && String(d.v).trim().toLowerCase() === '///skip')) BOOT.skip(); return; }
      if (d.t === 'skip' || (d.t === 'q' && String(d.v).trim().toLowerCase() === '///skip')) return;
      if (d.t === 'reload' || (d.t === 'q' && String(d.v).trim().toLowerCase() === '///reload')) {
        history.replaceState(null, '', location.href.split('#')[0]); location.reload(); return;
      }
      if (d.t === 'clock' || (d.t === 'q' && String(d.v).trim().toLowerCase() === '///clock')) {
        ScreenSaver.show(true); return;
      }
      if (d.t === 'hi' || (d.t === 'q' && String(d.v).trim().toLowerCase() === '///hi')) { Welcome.show(); return; }
      if (d.t === 'k') { remoteKey(d.v); return; }
      if (d.t === 'q' && (appWin || appSearch)) { openAppSearch(String(d.v)); return; }
      if (d.t === 'q') location.hash = '#/search/' + encodeURIComponent(d.v);
      else if (d.t === 'w') { if (d.e && d.e.id) cache.set(d.v, d.e); location.hash = '#/watch/' + encodeURIComponent(d.v); }
      toast('Vom Handy: ' + (d.n || d.v));
  }

  /* TV-Seite: nimmt beliebig viele Handys/Laptops gleichzeitig an (jede Verbindung hat ihre eigene ID). */
  let tvPeer = null, tvWatchT = 0, tvRetry = 0, tvOpened = false, tvErrShown = false;
  const tvConns = new Set();
  async function tvServe() {
    const t = store.get('pairTopic'); if (!t) return;
    if (!tvWatchT) tvWatchT = setInterval(() => {
      if (!store.get('pairTopic')) return;
      if (!tvPeer || tvPeer.destroyed) tvServe();
      else if (tvPeer.disconnected) { try { tvPeer.reconnect(); } catch {} }
    }, 5000);
    try { await loadPeer(); } catch { return; }
    /* läuft schon? Dann NICHT neu starten – das würde alle offenen Verbindungen kappen */
    if (tvPeer) {
      if (!tvPeer.destroyed) { if (tvPeer.disconnected) { try { tvPeer.reconnect(); } catch {} } return; }
      tvPeer = null;
    }
    const p = tvPeer = new Peer(PID(t));
    p.on('connection', c => {
      tvConns.add(c);
      document.dispatchEvent(new Event('mp-phone'));
      c.on('data', d => {
        try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; }
        if (!d) return;
        if (d.i) { try { c.send({ t:'ack', i:d.i }); } catch {} }
        try { handleMsg(d); } catch {}
      });
      const gone = () => tvConns.delete(c);
      c.on('close', gone); c.on('error', gone);
    });
    p.on('disconnected', () => setTimeout(() => { if (tvPeer === p && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch {} } }, 1500));
    p.on('close', () => { tvConns.clear(); if (tvPeer === p) { tvPeer = null; setTimeout(tvServe, Math.min(20000, 3000 * (++tvRetry))); } });
    p.on('open', () => { tvRetry = 0; if (!tvOpened) { tvOpened = true; toast('Fernbedienung bereit'); } });
    p.on('error', err => {
      if (tvPeer !== p) return;
      const ty = err && err.type;
      if (ty === 'unavailable-id') { try { p.destroy(); } catch {} return; }   /* alte Anmeldung hängt noch am Server → mit Pause neu versuchen */
      if (ty === 'peer-unavailable') return;
      if (!tvErrShown) { tvErrShown = true; toast('P2P-Fehler: ' + ty); setTimeout(() => { tvErrShown = false; }, 30000); }
    });
  }
  let esLast = 0;
  function listen() {
    const t = store.get('pairTopic'); if (!t || !window.EventSource) return;
    if (es) es.close(); es = new EventSource('https://ntfy.sh/' + t + '/sse');
    es.onerror = () => { if (es && es.readyState === 2) setTimeout(listen, 3000); };
    esLast = Date.now();
    es.onmessage = ev => { esLast = Date.now(); try {
      const m = JSON.parse(ev.data); if (m.event !== 'message') return;
      const d = JSON.parse(m.message);
      handleMsg(d);
    } catch {} };
  }
  function pairPage() {
    document.title = 'Koppeln – Media +';
    const base = store.get('mobileUrl') || location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, 'mobile.html');
    const url = base + '?tv=' + store.get('pairTopic') + '#/remote';
    const box = h('div', { class:'qrbox' }, 'QR-Code wird erzeugt …');
    new Promise((res, rej) => {
      if (window.qrcode) return res();
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = res; s.onerror = rej; document.head.append(s);
    }).then(() => { const q = qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize:6, margin:0 }); })
      .catch(() => { box.textContent = 'QR-Code nicht verfügbar – Adresse unten am Handy öffnen.'; });
    const inp = h('input', { class:'pick', type:'url', autocomplete:'off', spellcheck:'false', value:base, 'aria-label':'Adresse der Handy-Seite', style:'width:100%;max-width:40em' });
    main.append(hd('Mit Handy koppeln'),
      h('p', {}, 'Scanne den Code mit dem Handy. Dort kannst du Suchbegriffe eintippen oder Videos auf den TV schicken.'), box,
      h('div', { class:'side-h', style:'padding:16px 0 6px' }, 'Oder Code am Handy eingeben (Mehr → TV koppeln)'),
      h('div', { style:'font-size:2.6em;font-weight:700;letter-spacing:.14em;font-variant-numeric:tabular-nums;padding:4px 0 10px' }, store.get('pairTopic').slice(2).toUpperCase().replace(/(.{5})(?=.)/g, '$1 ')),
      h('p', { style:'word-break:break-all;color:var(--fg-3)' }, url),
      h('div', { class:'side-h', style:'padding:16px 0 6px' }, 'Adresse der Handy-Seite'), inp,
      h('div', { style:'padding-top:10px' }, h('button', { class:'btn', type:'button', onclick:() => { store.set('mobileUrl', inp.value.trim()); route(); } }, 'Speichern')));
    listen();
  }
  /* Handy-Fernbedienung: Mute + Lautstärke (halten = wiederholen) – wirkt am TV auf jeder Seite */
  function remoteBar(big) {
    const press = k => sendMsg({ t:'k', v:k }).catch(e => toast(String(e && e.message) === '429' ? 'ntfy-Limit erreicht – kurz warten' : 'TV nicht erreichbar'));
    const btn = (ic, label, k, rep) => {
      const b = h('button', { class:'rbtn', type:'button', 'aria-label':label, title:label }, icon(ic));
      let t1 = 0, t2 = 0; const stop = () => { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerdown', ev => { ev.preventDefault(); press(k); if (rep) { t1 = setTimeout(() => { t2 = setInterval(() => press(k), 170); }, 420); } });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(e => b.addEventListener(e, stop));
      b.addEventListener('contextmenu', ev => ev.preventDefault());
      return b;
    };
    return h('div', { class:'rbar' + (big ? ' big' : '') }, btn('mute', 'Ton an/aus', 'mute'), btn('minus', 'Leiser', 'vdn', true), btn('vol', 'Lauter', 'vup', true), ...(big ? [btn('pause', 'Play/Pause', 'pp'), btn('back', '10 s zurück', 'rew'), btn('fwd', '10 s vor', 'ff')] : []));
  }
  function mountRemote() {
    const fab = h('div', { id:'rfab' }, remoteBar(false));
    document.body.append(fab);
    const paint = () => { fab.hidden = !store.get('tvTopic') || /^#\/send/.test(location.hash); };
    window.addEventListener('hashchange', paint); paint(); setInterval(paint, 3000);
  }
  function sendPage() {
    document.title = 'An TV senden – Media +';
    const t = store.get('tvTopic'); main.append(hd('An TV senden'));
    if (!t) return main.append(emptyBox('share', 'Nicht gekoppelt. Scanne am TV unter „Mehr → Mit Handy koppeln“ den QR-Code.'));
    const inp = h('input', { class:'pick', type:'search', autocomplete:'off', autocorrect:'off', autocapitalize:'off', spellcheck:'false', placeholder:'Am TV suchen …', 'aria-label':'Suchbegriff für den TV', enterkeyhint:'send', style:'width:100%;max-width:40em' });
    const go = () => { const v = inp.value.trim(); if (v) { sendTv({ t:'q', v }); inp.value = ''; } };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    main.append(h('div', { class:'side-h', style:'padding:4px 0 8px' }, 'Fernbedienung'), remoteBar(true), h('div', { class:'side-h', style:'padding:20px 0 8px' }, 'Suchen'),
      h('div', { style:'display:flex;gap:8px;flex-wrap:wrap' }, inp, h('button', { class:'btn primary', type:'button', onclick:go }, 'Senden')),
      h('div', { class:'side-h', style:'padding:20px 0 6px' }, 'Zuletzt angesehen'));
    store.get('hist', []).slice(0, 12).forEach(x => {
      main.append(h('div', { style:'display:flex;gap:8px;align-items:center;padding:6px 0' },
        h('span', { style:'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, x.title),
        h('button', { class:'btn', type:'button', onclick:() => sendTv({ t:'w', v:x.id, n:x.title, e:{ ...slim(x), description:(x.description || '').slice(0, 300) } }) }, icon('tv'), 'Auf TV')));
    });
  }

  function enhance(p) {
    const v = p.querySelector('video'), row = p.querySelector('.prow'); if (!v || !row) return;
    p.dataset.plus = 1;
    const menu = h('div', { class:'pmenu plus', hidden:true }); p.append(menu);
    const st = () => store.get('cue', {}), setSt = o => { store.set('cue', { ...st(), ...o }); applyLook(); };
    const opt = (l, on, fn) => h('button', { class:'pmenu-btn' + (on ? ' on' : ''), type:'button', onclick:ev => {
      const i = Array.from(menu.querySelectorAll('.pmenu-btn')).indexOf(ev.currentTarget); fn(); draw(); const b = menu.querySelectorAll('.pmenu-btn')[i]; b && b.focus(); } }, l);
    const grp = (t, ...o) => [h('div', { class:'pmenu-lbl' }, t), h('div', { class:'pmenu-opts' }, ...o), h('div', { class:'pmenu-div' })];
    const draw = () => menu.replaceChildren(
      ...grp('Sleep-Timer', ...[0, 15, 30, 60].map(m => opt(m ? m + ' Min' : 'Aus', sleepMin === m, () => {
        clearTimeout(sleepT); sleepMin = m;
        if (m) { sleepT = setTimeout(() => { v.pause(); sleepMin = 0; toast('Sleep-Timer: pausiert'); }, m * 60000); toast('Pausiert in ' + m + ' Min'); } }))),
      ...grp('Untertitel-Größe', ...[['S', .8], ['M', 1], ['L', 1.4], ['XL', 1.9]].map(([l, x]) => opt(l, (st().size || 1) === x, () => setSt({ size:x })))),
      ...grp('Untertitel-Hintergrund', ...[['Aus', 'transparent'], ['Halb', 'rgba(0,0,0,.6)'], ['Schwarz', '#000']].map(([l, x]) => opt(l, (st().bg || 'rgba(0,0,0,.6)') === x, () => setSt({ bg:x })))),
      ...grp('Untertitel-Farbe', ...[['Weiß', '#fff'], ['Gelb', '#ff0'], ['Cyan', '#0ff']].map(([l, x]) => opt(l, (st().fg || '#fff') === x, () => setSt({ fg:x })))),
      ...grp('Helligkeit', ...[['70 %', .7], ['100 %', 1], ['130 %', 1.3]].map(([l, x]) => opt(l, store.get('bright', 1) === x, () => { store.set('bright', x); applyLook(); }))),
      ...((v.remote || v.webkitShowPlaybackTargetPicker) ? [h('div', { class:'pmenu-opts' }, opt('Cast / AirPlay …', false, () => { try { v.remote ? v.remote.prompt().catch(() => toast('Kein Gerät gefunden')) : v.webkitShowPlaybackTargetPicker(); } catch {} }))] : []));
    const btn = h('button', { class:'pb', type:'button', 'aria-label':'Mehr', title:'Sleep-Timer, Untertitel-Stil, Cast' }, h('span', { style:'font-size:1.5em;line-height:1' }, '⋯'));
    btn.onclick = ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) { draw(); setTimeout(() => { const b = menu.querySelector('.pmenu-btn.on') || menu.querySelector('.pmenu-btn'); b && b.focus(); }, 0); } };
    document.addEventListener('pointerdown', ev => { if (!menu.hidden && !btn.contains(ev.target) && !menu.contains(ev.target)) menu.hidden = true; });
    const fsb = row.querySelector('[aria-label^="Vollbild"]'); row.insertBefore(btn, fsb || null);
    if (!IS_TV) {
      let t0 = null;
      v.addEventListener('touchstart', ev => { const t = ev.touches[0], r = v.getBoundingClientRect(); t0 = { y:t.clientY, left:t.clientX - r.left < r.width / 2, b:store.get('bright', 1), vol:v.volume }; }, { passive:true });
      v.addEventListener('touchmove', ev => {
        if (!t0 || document.fullscreenElement !== p) return;
        const dy = (t0.y - ev.touches[0].clientY) / v.clientHeight; if (Math.abs(dy) < .03) return; ev.preventDefault();
        if (t0.left) { store.set('bright', +clamp(t0.b + dy, .4, 1.6).toFixed(2)); applyLook(); } else { v.muted = false; v.volume = clamp(t0.vol + dy, 0, 1); }
      }, { passive:false });
    }
  }
  const lock = async () => { try { if (navigator.wakeLock && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch {} };

  function init() {
    document.querySelector('svg symbol').parentNode.insertAdjacentHTML('beforeend', '<symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol><symbol id="i-heart" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></symbol><symbol id="i-shorts" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20"/><path d="m10.5 9.5 4 2.5-4 2.5z"/></symbol><symbol id="i-music" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></symbol>');
    if (!IS_TV) mountRemote();
    if (!IS_TV) {
      const bn = h('nav', { id:'bnav', 'aria-label':'Hauptnavigation' }, h('a', { href:'#/', 'data-r':'home' }, icon('home'), 'Start'), h('a', { href:'#/shorts', 'data-r':'shorts' }, icon('shorts'), 'Shorts'));
      document.body.append(bn);
      const paintB = () => bn.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.r === document.body.dataset.route));
      window.addEventListener('hashchange', paintB); paintB();
    }
    const nav = (ic, label, href, cnt) => h('a', { class:'nav', href, 'data-href':href },
      icon(ic), h('span', { class:'lbl' }, label), cnt ? h('span', { class:'cnt', 'data-cnt':cnt }) : null);
    // FIX: "Songs" aus der Navigation entfernt – Songs sind jetzt in der Suche
    const home = document.querySelector('#side .nav[data-href="#/"]');
    if (home) home.after(
      nav('shorts', 'Shorts', '#/shorts'),
      nav('tv', 'Live-TV', '#/live'),
      nav('plus', 'Abos', '#/subs', 'subNew'),
      nav('refresh', 'Überrasch mich', '#/random'),
      nav('settings', 'Mehr', '#/plus'));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      document.querySelector('svg symbol').parentNode.insertAdjacentHTML('beforeend', '<symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></symbol>');
      const btn = $('#sbtn');
      if (btn) btn.before(h('button', { class:'icon-btn', type:'button', 'aria-label':'Sprachsuche', title:'Sprachsuche', onclick:() => {
        try { const r = new SR(); r.lang = 'de-DE'; r.onresult = ev => { $('#q').value = ev.results[0][0].transcript; $('#sf').requestSubmit(); }; r.onerror = () => toast('Sprachsuche nicht möglich'); r.start(); toast('Sprich jetzt …'); } catch { toast('Sprachsuche nicht möglich'); } } }, icon('mic')));
    }
    try {
      const m = { name:'Media +', short_name:'Media +', start_url:location.href.split('#')[0], display:'standalone', background_color:'#000000', theme_color:'#000000',
        icons:[{ src:document.querySelector('link[rel=icon]').href, sizes:'any', type:'image/svg+xml' }] };
      document.head.append(h('link', { rel:'manifest', href:'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m)) }));
    } catch {}
    applyLook();
    armTvFullscreen();
    ScreenSaver.start();
    new MutationObserver(() => {
      main.querySelectorAll('.player:not([data-plus])').forEach(enhance);
      main.querySelectorAll('.acts:not([data-plus])').forEach(a => {
        a.dataset.plus = 1;
        if (!IS_TV && store.get('tvTopic')) a.append(h('button', { class:'btn', type:'button', onclick:() => {
          const id = decodeURIComponent(location.hash.split('/')[2] || ''); const en = cache.get(id) || loadSaved(id); sendTv({ t:'w', v:id, n:document.title.replace(/ – Media \+$/, ''), e:en ? { ...slim(en), description:(en.description || '').slice(0, 300) } : undefined }); } }, icon('tv'), 'Auf TV'));
      });
    }).observe(main, { childList:true, subtree:true });
    lock();
    document.addEventListener('play', lock, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) lock(); });
    document.addEventListener('keydown', ev => {
      if (/input|textarea|select/i.test(ev.target.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key, c = ev.keyCode, up = k === 'ChannelUp' || c === 427, dn = k === 'ChannelDown' || c === 428;
      const eat = fn => { ev.preventDefault(); ev.stopImmediatePropagation(); fn(); };
      if (cur) {
        if (up || k === 'PageUp') return eat(() => cur.tune(cur.i + 1));
        if (dn || k === 'PageDown') return eat(() => cur.tune(cur.i - 1));
        if (/^[1-9]$/.test(k) && LIVE[k - 1]) return eat(() => cur.tune(k - 1));
        if ((k === 'ArrowUp' || k === 'ArrowDown') && (ev.target === cur.player || ev.target === document.body)) return eat(() => cur.tune(cur.i + (k === 'ArrowUp' ? 1 : -1)));
      } else if (up || dn) eat(() => scrollBy({ top:(up ? -1 : 1) * innerHeight * .8, behavior:'smooth' }));
    }, true);
    if (IS_TV) { setInterval(() => { if (store.get('pairTopic') && (!es || es.readyState === 2 || Date.now() - esLast > 75000)) listen(); }, 10000); document.addEventListener('visibilitychange', () => { if (!document.hidden && (!es || es.readyState === 2)) listen(); }); if (!store.get('pairTopic')) store.set('pairTopic', 'mp' + Math.random().toString(36).slice(2, 12)); listen(); tvServe(); }
    else { const p = new URLSearchParams(location.search).get('tv'); if (p) store.set('tvTopic', p.replace(/[^\w-]/g, '')); if (store.get('tvTopic')) setTimeout(() => phoneConn().catch(() => {}), 500); document.addEventListener('visibilitychange', () => { if (!document.hidden && store.get('tvTopic')) phoneConn().catch(() => {}); });
      /* Herzschlag: erkennt tote P2P-Leitungen, bevor die nächste Taste verloren geht */
      setInterval(() => { if (!store.get('tvTopic') || document.hidden) return; sendP2P({ t:'ping' }, 2500).catch(() => {}); }, 5000); }
    setTimeout(refreshBadge, 3000); setInterval(refreshBadge, 600000);
  }

  const _Card = Card; Card = (e, o) => {
    const a = _Card(e, o);
    if (store.get('seen', {})[e.id]) { const t = a.querySelector('.thumb'); if (t) t.append(h('span', { class:'seenb', title:'Gesehen' }, '✓ Gesehen')); }
    return a;
  };
  const _sp = saveProg; saveProg = (e, pos, dur) => {
    _sp(e, pos, dur); const d = dur || e.duration || 0;
    if (d && (pos < 1 || pos / d > .92)) { const s = store.get('seen', {}), k = Object.keys(s); if (k.length > 800) delete s[k[0]]; s[e.id] = 1; store.set('seen', s); }
  };
  const _Show = Show; Show = arg => {
    _Show(arg);
    const i = arg.indexOf('/'), c = i < 0 ? '' : arg.slice(0, i), t = i < 0 ? arg : arg.slice(i + 1), bar = main.querySelector('.page-h'); if (!bar) return;
    const b = h('button', { class:'btn', type:'button' });
    const paint = () => { const on = isSub(c, t); b.className = 'btn' + (on ? ' on' : ''); b.replaceChildren(icon('bookmark'), on ? 'Abonniert' : 'Abonnieren'); };
    b.onclick = () => { toast(toggleSub(c, t) ? 'Sendung abonniert' : 'Abo beendet'); paint(); };
    paint(); bar.insertBefore(b, bar.querySelector('select'));
    const l = subs(), s = l.find(x => x.k === sk(c, t)); if (s) { s.seen = now(); store.set('subs', l); setTimeout(refreshBadge, 800); }
  };

  const SH_Q = ['Comedy', 'Kabarett', 'Dokumentation', 'Wissen', 'Tatort', 'Krimi', 'Reportage', 'Sport', 'Musik', 'Natur', 'Reise', 'Satire', 'Serie', 'Spielfilm', 'Kinder', 'Tagesschau'];
  const shSeen = new Set();
  function shBump(t, d) { if (!t || !d) return; const w = store.get('shW', {}); w[t] = Math.max(-5, Math.min(12, (w[t] || 0) + d)); const k = Object.keys(w); if (k.length > 150) delete w[k[0]]; store.set('shW', w); }
  function shProfile() {
    const m = new Map(), add = (t, w) => { if (t) m.set(t, (m.get(t) || 0) + w); }, arr = k => { const v = store.get(k, []); return Array.isArray(v) ? v : []; };
    arr('subs').forEach(x => add(x.topic, 3)); arr('saved').forEach(x => add(x.topic, 3)); arr('hist').slice(0, 40).forEach(x => add(x.topic, 1));
    const w = store.get('shW', {}); for (const t in w) add(t, w[t]);
    return [...m].filter(([, v]) => v > 0);
  }
  function shPick(p) { let r = Math.random() * p.reduce((a, [, v]) => a + v, 0); for (const [t, v] of p) { r -= v; if (r <= 0) return t; } return p[0][0]; }
  async function shFetch(n) {
    const out = []; let err;
    const old = store.get('shSeenIds', []), seen = new Set([...(Array.isArray(old) ? old : []), ...Object.keys(store.get('seen', {}))]);
    const prof = shProfile();
    for (let i = 0; i < 5 && out.length < n; i++) {
      const pers = prof.length && Math.random() < .67, t = pers ? shPick(prof) : SH_Q[Math.floor(Math.random() * SH_Q.length)];
      try {
        let r;
        if (pers) r = await search({ topic:t, min:120, offset:Math.floor(Math.random() * 8), size:30 });
        else { try { r = await search({ text:t, min:300, offset:Math.floor(Math.random() * 60), size:30 }); if (!r.items.length) r = await search({ text:t, size:30 }); } catch (x) { r = await search({ text:t, size:30 }); } }
        const ok = r.items.filter(e => { const u = e.url_video || e.url_video_low || e.url_video_hd; return u && !/\.m3u8/i.test(u) && !shSeen.has(e.id) && !seen.has(e.id); }).sort(() => Math.random() - .5);
        for (const e of ok.slice(0, pers ? 3 : n - out.length)) { shSeen.add(e.id); out.push(e); }
      } catch (x) { err = x; }
    }
    if (!out.length && err) throw err;
    return out.sort(() => Math.random() - .5).slice(0, n);
  }
  function shorts() {
    document.title = 'Shorts – Media +';
    const tok = routeToken, tv = IS_TV, sound = () => store.get('shSound', true);
    let lastErr, els = [], ci = -1, loading = false, wantNext = false;
    const root = h('div', { class:'sh' + (tv ? ' tv' : '') }), feed = h('div', { class:'sh-feed' });
    const msg = h('div', { class:'sh-msg' }, 'Shorts werden geladen …');
    root.append(feed, msg); main.append(root);
    const lab = (a, b) => tv ? b : a;

    function build(e) {
      if (e.sc) return buildSong(e);
      const ch = chanOf(e.channel), topic = e.topic || '', cid = ch.id || '_', v = h('video', { class:'sh-v', playsinline:true, preload:'none' });
      v.muted = true; v.setAttribute('webkit-playsinline', '');
      const bar = h('i'), art = h('article', { class:'sh-it paused' });
      const s = { art, v, e, loaded:false, ready:false, t:0 };
      s.stage = h('div', { class:'sh-stage', tabindex:'0' }, v, h('span', { class:'sh-pp' }, icon('play', 'fill')), h('div', { class:'sh-grad' }),
        h('div', { class:'sh-info' }, h('div', { class:'sh-ch' }, Avatar(ch), h('span', {}, ch.name)), h('div', { class:'sh-t' }, e.title || topic),
          topic && topic !== e.title ? h('div', { class:'sh-s' }, topic) : null), h('div', { class:'sh-prog' }, bar));
      s.toggle = () => s.done ? 0 : v.paused ? play(s) : v.pause();
      if (tv) s.stage.onclick = s.toggle;
      else {
        let lastTap = 0, tapT = 0;
        s.stage.onclick = ev => {
          const now = Date.now();
          if (now - lastTap < 300) {
            clearTimeout(tapT); lastTap = 0;
            const hh = h('span', { class:'sh-heart' }, icon('heart', 'fill'));
            s.stage.append(hh); hh.addEventListener('animationend', () => hh.remove());
            if (!isSaved(e.id)) { toggleSaved(e); shBump(e.topic, 3); paintLike(); }
            if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
          } else { lastTap = now; tapT = setTimeout(s.toggle, 280); }
        };
      }
      const like = h('button', { class:'sh-b', type:'button', 'aria-label':'Gefällt mir' });
      const paintLike = () => { const on = isSaved(e.id); like.classList.toggle('on', on); like.replaceChildren(icon('heart', on ? 'fill' : ''), h('span', {}, on ? lab('Gemerkt', 'Gemerkt') : 'Like')); };
      like.onclick = ev => { ev.stopPropagation(); const on = toggleSaved(e); shBump(e.topic, on ? 3 : -3); toast(on ? 'Gemerkt' : 'Like entfernt'); paintLike(); };
      const sub = h('button', { class:'sh-b', type:'button', 'aria-label':'Sendung abonnieren' });
      const paintSub = () => { const on = isSub(cid, topic); sub.classList.toggle('on', on); sub.replaceChildren(icon('plus'), h('span', {}, on ? 'Abonniert' : lab('Abo', 'Abonnieren'))); };
      sub.onclick = ev => { ev.stopPropagation(); const on = toggleSub(cid, topic); shBump(topic, on ? 3 : -2); toast(on ? 'Sendung abonniert' : 'Abo beendet'); paintSub(); };
      const snd = h('button', { class:'sh-b', type:'button', 'aria-label':'Ton' });
      s.paintSound = () => snd.replaceChildren(icon(v.muted ? 'mute' : 'vol'), h('span', {}, v.muted ? 'Ton aus' : 'Ton an'));
      snd.onclick = ev => { ev.stopPropagation(); store.set('shSound', !sound()); els.forEach(x => { x.v.muted = !sound(); x.paintSound(); }); };
      const show = h('a', { class:'sh-b', href:'#/show/' + cid + '/' + encodeURIComponent(topic || e.title || ''), 'aria-label':'Zur Sendung' }, icon('film'), h('span', {}, 'Sendung'));
      const full = h('a', { class:'sh-b', href:'#/watch/' + encodeURIComponent(e.id), 'aria-label':'Ganzes Video ansehen' }, icon('play', 'fill'), h('span', {}, lab('Ganz', 'Ganzes Video')));
      paintLike(); paintSub(); s.paintSound();
      s.acts = h('div', { class:'sh-acts' }, show, topic ? sub : null, like, full, snd);
      const cont = h('button', { class:'sh-b pri', type:'button', 'aria-label':'Weiterschauen' }, icon('play', 'fill'), h('span', {}, 'Weiterschauen'));
      cont.onclick = ev => { ev.stopPropagation(); try { saveProg(e, v.currentTime, e.duration); } catch {} location.hash = '#/watch/' + encodeURIComponent(e.id); };
      const show2 = h('a', { class:'sh-b', href:show.getAttribute('href') }, icon('film'), h('span', {}, 'Zur Sendung'));
      s.end = h('div', { class:'sh-end', onclick:ev => ev.stopPropagation() }, h('div', { class:'sh-end-t' }, 'Ausschnitt beendet – Wisch weiter oder schau das ganze Video'), cont, show2);
      s.cont = cont; s.stage.append(s.end);
      full.addEventListener('click', () => { try { saveProg(e, v.currentTime, e.duration); } catch {} });
      art.append(s.stage, s.acts); focusable(s, false);
      v.addEventListener('play', () => { art.classList.remove('paused'); s.paintSound(); });
      v.addEventListener('pause', () => { if (!v.ended) art.classList.add('paused'); });
      v.addEventListener('volumechange', s.paintSound);
      v.addEventListener('timeupdate', () => {
        if (!s.ready) return;
        const st = s.start || 0, len = Math.min(60, (v.duration || 60) - st);
        if (len > 0) bar.style.width = Math.min(100, (v.currentTime - st) / len * 100) + '%';
        if (!s.done && v.currentTime - st >= 60) finish(s);
      });
      v.addEventListener('ended', () => finish(s));
      v.addEventListener('error', () => { if (v.getAttribute('src') && els[ci] === s && v.error) { toast('Nicht abspielbar – weiter'); go(ci + 1); } });
      return s;
    }

    function buildSong(e) {
      const t = e.sc, cov = SC.art(t.artworkUrl), v = h('audio', { preload:'none' });
      v.muted = true;
      const bar = h('i'), art = h('article', { class:'sh-it sh-song paused' });
      const s = { art, v, e, loaded:false, ready:false, t:0, song:true, hls:null };
      const time = h('div', { class:'sh-s' }, '');
      const fmt = x => isFinite(x) ? Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0') : '0:00';
      const prog = h('div', { class:'sh-prog' }, bar);
      prog.onclick = ev => { ev.stopPropagation(); if (!isFinite(v.duration)) return; const r = prog.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * v.duration; };
      s.stage = h('div', { class:'sh-stage', tabindex:'0' },
        h('div', { class:'sh-bg', style: cov ? `background-image:url("${cov}")` : '' }),
        h('div', { class:'sh-cover' }, cov ? h('img', { src:cov, alt:'' }) : null), v,
        h('span', { class:'sh-pp' }, icon('play', 'fill')), h('div', { class:'sh-grad' }),
        h('div', { class:'sh-info' }, h('span', { class:'sh-tag' }, '♪ Song'), h('div', { class:'sh-t' }, t.title), h('div', { class:'sh-ch' }, t.artist ? t.artist.username : ''), time), prog);
      s.toggle = () => s.failed ? 0 : v.paused ? play(s) : v.pause();
      s.stage.onclick = s.toggle;
      const like = h('button', { class:'sh-b', type:'button', 'aria-label':'Gefällt mir' });
      const paintLike = () => { const on = SC.isLiked(t.id); like.classList.toggle('on', on); like.replaceChildren(icon('heart', on ? 'fill' : ''), h('span', {}, on ? 'Gemerkt' : 'Like')); };
      like.onclick = ev => { ev.stopPropagation(); const on = SC.toggleLike(t); toast(on ? 'Song gemerkt' : 'Like entfernt'); paintLike(); };
      const seek = (d, g, l) => { const b = h('button', { class:'sh-b', type:'button', 'aria-label':l }, h('span', { class:'sh-g' }, g), h('span', {}, l)); b.onclick = ev => { ev.stopPropagation(); if (isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d)); }; return b; };
      const snd = h('button', { class:'sh-b', type:'button', 'aria-label':'Ton' });
      s.paintSound = () => snd.replaceChildren(icon(v.muted ? 'mute' : 'vol'), h('span', {}, v.muted ? 'Ton aus' : 'Ton an'));
      snd.onclick = ev => { ev.stopPropagation(); store.set('shSound', !sound()); els.forEach(x => { x.v.muted = !sound(); x.paintSound(); }); };
      const vid = h('a', { class:'sh-b', href:'#/song/' + encodeURIComponent(t.permalinkUrl), 'aria-label':'Als Video ansehen' }, icon('film'), h('span', {}, lab('Video', 'Als Video')));
      vid.addEventListener('click', () => { try { v.pause(); } catch {} });
      paintLike(); s.paintSound();
      s.acts = h('div', { class:'sh-acts' }, like, seek(-10, '−10', 'Zurück'), seek(10, '+10', 'Vor'), vid, snd);
      s.cd = h('div', { class:'sh-cd' }, '');
      const nxt = h('button', { class:'sh-b pri', type:'button', 'aria-label':'Weiter zum nächsten Short' }, icon('play', 'fill'), h('span', {}, 'Weiter'));
      nxt.onclick = ev => { ev.stopPropagation(); clearInterval(s.ft); go(ci + 1); };
      const again = h('button', { class:'sh-b', type:'button', 'aria-label':'Song erneut laden' }, icon('refresh'), h('span', {}, 'Erneut versuchen'));
      again.onclick = ev => { ev.stopPropagation(); songRetry(s); };
      s.end = h('div', { class:'sh-end sh-fail', onclick:ev => ev.stopPropagation() }, icon('alert'), h('div', { class:'sh-end-t' }, 'Dieser Song kann nicht geladen werden'),
        h('div', { class:'sh-end-s' }, [t.title, t.artist ? t.artist.username : ''].filter(Boolean).join(' – ')), s.cd, nxt, again);
      s.cont = nxt; s.stage.append(s.end);
      art.append(s.stage, s.acts); focusable(s, false);
      v.addEventListener('play', () => { art.classList.remove('paused'); s.paintSound();
        if ('mediaSession' in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title:t.title, artist:t.artist ? t.artist.username : '', artwork: cov ? [{ src:cov, sizes:'500x500' }] : [] }); } catch {} });
      v.addEventListener('pause', () => { if (!v.ended) art.classList.add('paused'); });
      v.addEventListener('volumechange', s.paintSound);
      v.addEventListener('timeupdate', () => { const d = v.duration; if (d > 0) bar.style.width = Math.min(100, v.currentTime / d * 100) + '%'; time.textContent = fmt(v.currentTime) + ' / ' + fmt(d || (t.duration || 0) / 1000); });
      v.addEventListener('ended', () => { if (els[ci] === s) go(ci + 1); });
      v.addEventListener('error', () => { if (v.getAttribute('src') && v.error) songFail(s); });
      return s;
    }
    function songLoad(s, act) {
      const v = s.v;
      if (s.loaded) { if (act) v.preload = 'auto'; return; }
      s.loaded = true; s.ready = false;
      const bad = () => songFail(s);
      v.addEventListener('canplay', () => { if (s.ready) return; s.ready = true; clearTimeout(s.t); if (els[ci] === s) play(s); }, { once:true });
      clearTimeout(s.t); s.t = setTimeout(() => { if (!s.ready && s.loaded) bad(); }, 20000);
      (async () => {
        try {
          const u = await SC.stream(s.e.sc); if (!s.loaded) return;
          if (/\.m3u8/.test(u) && !v.canPlayType('application/vnd.apple.mpegurl')) {
            await loadHls(); if (!s.loaded) return;
            if (!window.Hls || !Hls.isSupported()) throw new Error('HLS');
            s.hls = new Hls(); s.hls.loadSource(u); s.hls.attachMedia(v);
            s.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) bad(); });
          } else v.src = u;
          v.preload = 'auto';
        } catch { bad(); }
      })();
    }
    function songFail(s) {
      if (s.failed) return;
      s.failed = true; clearTimeout(s.t);
      if (s.hls) { s.hls.destroy(); s.hls = null; }
      try { s.v.pause(); } catch {}
      s.art.classList.remove('paused'); s.art.classList.add('failed');
      if (els[ci] === s) { failCount(s); if (tv) s.cont.focus(); }
    }
    function failCount(s) {
      clearInterval(s.ft); let n = 4; s.cd.textContent = `Weiter in ${n} s …`;
      s.ft = setInterval(() => {
        if (els[ci] !== s || !s.failed) { clearInterval(s.ft); return; }
        if (--n <= 0) { clearInterval(s.ft); go(ci + 1); } else s.cd.textContent = `Weiter in ${n} s …`;
      }, 1000);
    }
    function songRetry(s) {
      clearInterval(s.ft); s.failed = false; s.loaded = false; s.ready = false; s.art.classList.remove('failed');
      songLoad(s, true);
    }
    function focusable(s, on) { [s.stage, ...s.acts.querySelectorAll('.sh-b'), ...s.end.querySelectorAll('.sh-b')].forEach(el => { el.tabIndex = on ? 0 : -1; }); }
    function finish(s) {
      if (s.done) return; s.done = true; s.v.pause(); s.art.classList.add('ended');
      if (IS_TV && els[ci] === s) s.cont.focus();
    }
    function play(s) {
      if (s.done) return;
      const v = s.v; v.muted = !sound();
      const p = v.play();
      if (p) p.catch(() => { v.muted = true; return v.play(); }).catch(() => {}).then(s.paintSound);
    }
    function load(s, act) {
      if (s.song) return songLoad(s, act);
      const v = s.v;
      if (!s.loaded) {
        s.loaded = true; s.ready = false;
        const fin = () => { if (s.ready) return; s.ready = true; clearTimeout(s.t); if (els[ci] === s) play(s); };
        v.addEventListener('loadedmetadata', () => {
          const d = v.duration;
          if (isFinite(d) && d > 30) { v.addEventListener('seeked', fin, { once:true }); try { s.start = d * (.08 + Math.random() * .7); v.currentTime = s.start; } catch { fin(); } } else fin();
        }, { once:true });
        s.t = setTimeout(fin, 5000);
        v.preload = act ? 'auto' : 'metadata'; v.src = secure(s.e.url_video || s.e.url_video_low || s.e.url_video_hd);
      } else if (act) v.preload = 'auto';
    }
    function release(s) { clearTimeout(s.t); if (s.hls) { s.hls.destroy(); s.hls = null; } s.v.pause(); s.v.removeAttribute('src'); s.v.load(); s.loaded = false; s.ready = false; clearInterval(s.ft); if (s.failed) { s.failed = false; s.art.classList.remove('failed'); } }
    function activate(i) {
      if (i === ci || !els[i]) return;
      const pv = els[ci]; if (pv && pv.t0) { const d = Date.now() - pv.t0; shBump(pv.e.topic, d < 2500 ? -1 : d > 8000 ? 1 : 0); }
      els[i].t0 = Date.now(); { const l = store.get('shSeenIds', []); l.push(els[i].e.id); store.set('shSeenIds', (Array.isArray(l) ? l : []).slice(-300)); }
      ci = i;
      els.forEach((x, j) => { if (j !== i) { x.v.pause(); focusable(x, false); if (Math.abs(j - i) > 2 && x.loaded) release(x); } });
      const s = els[i]; focusable(s, true); load(s, true);
      if (s.ready) play(s);
      if (s.failed) { failCount(s); if (tv) s.cont.focus(); }
      if (els[i + 1]) load(els[i + 1], false);
      if (i >= els.length - 3) more();
      const a = document.activeElement;
      if (tv && (!a || a === document.body || a.classList.contains('sh-stage'))) s.stage.focus({ preventScroll:true });
    }
    function go(i) {
      if (i < 0) return;
      if (i >= els.length) { wantNext = true; return more(); }
      feed.scrollTo({ top:i * feed.clientHeight, behavior:'smooth' });
    }
    const io = new IntersectionObserver(en => { for (const x of en) if (x.isIntersecting) activate(x.target._i); }, { root:feed, threshold:.6 });
    async function more() {
      if (loading) return; loading = true;
      try {
        let arr = await shFetch(els.length ? 8 : 6);
        try { arr = await SC.mix(arr); } catch {}
        if (tok !== routeToken) return;
        if (!arr.length && !els.length) throw new Error('Keine Videos gefunden');
        arr.forEach(e => { try { const s = build(e); s.art._i = els.length; els.push(s); feed.append(s.art); io.observe(s.art); } catch (x) { console.error('Shorts build', x); lastErr = x; } });
        if (!els.length) throw lastErr || new Error('Keine Videos gefunden');
        msg.remove();
        if (wantNext && arr.length) { wantNext = false; go(ci + 1); }
      } catch (err) {
        if (tok !== routeToken || els.length) return;
        console.error('Shorts', err); msg.replaceChildren('Shorts konnten nicht geladen werden.', h('small', { style:'opacity:.6;max-width:320px' }, String((err && err.message) || err)), h('button', { class:'sh-b', type:'button', onclick:() => { msg.replaceChildren('Shorts werden geladen …'); loading = false; more(); } }, 'Erneut versuchen'));
        root.append(msg);
        if (tv) msg.querySelector('button').focus();
      } finally { loading = false; }
    }
    const onKey = ev => {
      if (tok !== routeToken || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key, c = ev.keyCode, t = ev.target, s = els[ci], eat = f => { ev.preventDefault(); ev.stopImmediatePropagation(); f(); };
      const mid = t === document.body || t.classList.contains('sh-stage');
      if (s && (k === 'MediaPlayPause' || c === 179 || c === 10252)) return eat(s.toggle);
      if (mid && (k === 'ArrowDown' || c === 40 || k === 'PageDown')) return eat(() => go(ci + 1));
      if (mid && (k === 'ArrowUp' || c === 38 || k === 'PageUp')) return eat(() => go(ci - 1));
      if (s && mid && (k === 'ArrowRight' || c === 39)) return eat(() => { const b = s.acts.querySelector('.sh-b'); b && b.focus(); });
      if (s && mid && (k === 'Enter' || c === 13 || k === ' ')) return eat(s.toggle);
      if (s && t.classList.contains('sh-b') && (k === 'ArrowLeft' || c === 37)) return eat(() => s.stage.focus({ preventScroll:true }));
    };
    document.addEventListener('keydown', onKey, true);
    cleanups.push(() => { document.removeEventListener('keydown', onKey, true); io.disconnect(); els.forEach(s => { clearTimeout(s.t); clearInterval(s.ft); if (s.hls) { s.hls.destroy(); s.hls = null; } s.v.pause(); s.v.removeAttribute('src'); s.v.load(); }); });
    more();
  }

  return { shorts, live, subsPage, access, random, more, pairPage, sendPage, sendTv, init, applyLook, exportData, importData };
})();

(function init() {
  $('#menu').append(icon('menu'));
  $('#logoMark').append(icon('plus', 'fill'));
  $('#sbtn').append(icon('search'));
  setTheme(store.get('theme', 'dark'));
  buildSide();

  $('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('theme', t); setTheme(t); };
  $('#menu').onclick = () => { document.body.classList.toggle('overlay'); };
  $('#scrim').onclick = () => document.body.classList.remove('overlay');
  $('#sbtn').addEventListener('click', ev => {
    const b = document.body.classList;
    if (b.contains('compact') && !b.contains('sopen')) { ev.preventDefault(); b.add('sopen'); $('#q').focus(); }
  });
  $('#q').addEventListener('focus', () => setTimeout(showSugg, document.body.classList.contains('compact') ? 380 : 0));
  $('#q').addEventListener('input', showSugg);
  $('#q').addEventListener('blur', () => { setTimeout(() => { if (sugg.contains(document.activeElement)) return; sugg.hidden = true; document.body.classList.remove('sopen'); }, 200); });
  sugg.addEventListener('focusout', ev => { if (!sugg.contains(ev.relatedTarget) && ev.relatedTarget !== $('#q')) sugg.hidden = true; });
  $('#side').addEventListener('click', ev => { if (ev.target.closest('a')) document.body.classList.remove('overlay'); });
  $('#sf').onsubmit = ev => {
    ev.preventDefault();
    const q = $('#q').value.trim();
    const ql = q.toLowerCase();
    if (ql === '///reload' && store.get('tvTopic')) { PLUS.sendTv({ t:'reload' }); $('#q').value = ''; return; }
    if (ql === '///skip') { if (store.get('tvTopic')) PLUS.sendTv({ t:'skip' }); $('#q').value = ''; return; }
    if (ql === '///hi') {
      if (store.get('tvTopic')) PLUS.sendTv({ t:'hi' });
      else Welcome.show();
      $('#q').value = ''; return;
    }
    if (ql === '///clock') {
      if (store.get('tvTopic')) PLUS.sendTv({ t:'clock' });
      else ScreenSaver.show(true);
      $('#q').value = ''; return;
    }
    if (q) { remember(q); location.hash = '#/search/' + encodeURIComponent(q); $('#q').blur(); }
  };
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') document.body.classList.remove('overlay');
    if (ev.key === '/' && !/input|textarea|select/i.test(ev.target.tagName)) { ev.preventDefault(); $('#q').focus(); }
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', applyPin);
  PLUS.init();
  route();
  Welcome.firstRun();
})();
