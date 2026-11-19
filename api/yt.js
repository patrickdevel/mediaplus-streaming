// Vercel-Adapter: /api/yt?q=...  |  /api/yt?channel=UC...  |  &debug=1 zeigt, welche Quelle klappt
// Quellen parallel (alle mit Timeout): 1) YouTube intern  2) Piped  3) alte Original-API

const ORIGINAL_API = 'https://unofficial-youtube-api.vercel.app/youtube/search';
const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee', 'https://pipedapi.leptons.xyz'];
const INNER = 'https://www.youtube.com/youtubei/v1';
const VER = '2.20250310.01.00';
const CTX = { client: { clientName: 'WEB', clientVersion: VER, hl: 'de', gl: 'DE' } };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchT(url, opts = {}, ms = 5000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ac.signal });
    if (!r.ok) throw new Error(r.status + ' ' + url.slice(0, 60));
    return await r.json();
  } finally { clearTimeout(t); }
}
const inner = (ep, body) => fetchT(`${INNER}/${ep}?prettyPrint=false`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9', origin: 'https://www.youtube.com', 'x-youtube-client-name': '1', 'x-youtube-client-version': VER, cookie: 'CONSENT=YES+cb; SOCS=CAI' },
  body: JSON.stringify({ context: CTX, ...body })
}, 6000);

function collect(node, key, out = []) {
  if (Array.isArray(node)) node.forEach(n => collect(n, key, out));
  else if (node && typeof node === 'object') for (const k in node) { if (k === key) out.push(node[k]); else collect(node[k], key, out); }
  return out;
}
const txt = o => (o && (o.simpleText ?? (o.runs || []).map(r => r.text).join(''))) || '';
const img = u => (u ? (u.startsWith('//') ? 'https:' + u : u) : '');
const uniq = (arr, key) => { const s = new Set(); return arr.filter(x => x && x[key] && !s.has(x[key]) && s.add(x[key])); };
function parseViews(t) {
  if (!t) return undefined;
  const m = /([\d.,]+)\s*(Mio|Mrd|Tsd|K|M|B)?/i.exec(t); if (!m) return undefined;
  const u = (m[2] || '').toLowerCase();
  if (!u) { const d = m[1].replace(/\D/g, ''); return d ? Number(d) : undefined; }
  return Math.round(parseFloat(m[1].replace(',', '.')) * ({ mio: 1e6, m: 1e6, mrd: 1e9, b: 1e9, tsd: 1e3, k: 1e3 })[u]);
}
const fmtDur = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };

/* ---------- 1) YouTube intern ---------- */
function mapVideo(v, fb) {
  const owner = v.ownerText || v.longBylineText || v.shortBylineText;
  const be = owner && owner.runs && owner.runs[0] && owner.runs[0].navigationEndpoint && owner.runs[0].navigationEndpoint.browseEndpoint;
  const live = JSON.stringify(v.badges || []).includes('LIVE') || JSON.stringify(v.thumbnailOverlays || []).includes('"LIVE"');
  return { videoId: v.videoId, title: txt(v.title), author: { name: txt(owner) || fb || '', id: be && be.browseId }, views: { count: parseViews(txt(v.viewCountText) || txt(v.shortViewCountText)) }, publishedTime: txt(v.publishedTimeText), duration: { raw: txt(v.lengthText) }, isLive: live };
}
function mapLockup(l, fb) {
  if (!l.contentId || (l.contentType && !/VIDEO/.test(l.contentType))) return null;
  const md = l.metadata && l.metadata.lockupMetadataViewModel; if (!md) return null;
  const parts = collect(md, 'metadataParts').flat().map(p => p.text && p.text.content).filter(Boolean);
  const views = parts.find(t => /Aufrufe|Zuschauer|views|watching/i.test(t));
  const pub = parts.find(t => /^vor |ago$/i.test(t));
  const author = parts.find(t => t !== views && t !== pub);
  const badge = collect(l, 'thumbnailBadgeViewModel')[0];
  return { videoId: l.contentId, title: (md.title && md.title.content) || '', author: { name: author || fb || '' }, views: { count: parseViews(views) }, publishedTime: pub || '', duration: { raw: (badge && badge.text) || '' }, isLive: /LIVE/i.test(JSON.stringify(badge || '')) };
}
const videosOf = (data, fb) => uniq([...collect(data, 'videoRenderer').map(v => mapVideo(v, fb)), ...collect(data, 'lockupViewModel').map(l => mapLockup(l, fb))], 'videoId').filter(v => v.title);
function mapChannel(c) {
  const a = txt(c.subscriberCountText), b = txt(c.videoCountText), th = (c.thumbnail && c.thumbnail.thumbnails) || [];
  return { channelId: c.channelId, channelName: txt(c.title), handle: [a, b].find(x => x.startsWith('@')) || '', subs: [a, b].find(x => x && !x.startsWith('@')) || '', avatar: img(th.length ? th[th.length - 1].url : ''), description: txt(c.descriptionSnippet), url: 'https://www.youtube.com/channel/' + c.channelId };
}
async function ytVideos(q) {
  const d = await inner('search', { query: q, params: 'EgIQAQ==' });
  let list = videosOf(d);
  try { const tok = (collect(d, 'continuationCommand')[0] || {}).token; if (tok) list = uniq(list.concat(videosOf(await inner('search', { continuation: tok }))), 'videoId'); } catch {}
  return list;
}
const ytChannels = async q => uniq(collect(await inner('search', { query: q, params: 'EgIQAg==' }), 'channelRenderer').map(mapChannel), 'channelId');
async function ytChannelVideos(id) {
  const d = await inner('browse', { browseId: id, params: 'EgZ2aWRlb3PyBgQKAjoA' });
  const name = txt((collect(d, 'channelMetadataRenderer')[0] || {}).title);
  let list = videosOf(d, name);
  try { const tok = (collect(d, 'continuationCommand')[0] || {}).token; if (tok) list = uniq(list.concat(videosOf(await inner('browse', { continuation: tok }), name)), 'videoId'); } catch {}
  return list;
}

/* ---------- 2) Piped ---------- */
const piped = path => Promise.any(PIPED.map(b => fetchT(b + path, { headers: { 'user-agent': UA } }, 5000)));
const idOf = u => (/[?&]v=([\w-]{11})/.exec(u || '') || [])[1];
const pMap = (x, fb) => ({ videoId: idOf(x.url), title: x.title, author: { name: x.uploaderName || fb || '', id: ((x.uploaderUrl || '').split('/channel/')[1]) }, views: { count: x.views >= 0 ? x.views : undefined }, publishedTime: x.uploadedDate || '', duration: { raw: x.duration > 0 ? fmtDur(x.duration) : '' }, isLive: x.duration === -1 });
async function pVideos(q) {
  const d = await piped(`/search?q=${encodeURIComponent(q)}&filter=videos`);
  let list = (d.items || []).filter(x => x.type === 'stream' || idOf(x.url)).map(x => pMap(x));
  return uniq(list, 'videoId');
}
async function pChannels(q) {
  const d = await piped(`/search?q=${encodeURIComponent(q)}&filter=channels`);
  return (d.items || []).map(x => ({ channelId: (x.url || '').split('/channel/')[1], channelName: x.name, handle: '', subs: x.subscribers >= 0 ? parseInt(x.subscribers).toLocaleString('de-DE') + ' Abonnenten' : '', avatar: x.thumbnail || '', description: x.description || '', url: 'https://www.youtube.com' + x.url })).filter(c => c.channelId);
}
async function pChannelVideos(id) {
  const d = await piped(`/channel/${id}`);
  let list = (d.relatedStreams || []).map(x => pMap(x, d.name));
  try { if (d.nextpage) { const d2 = await piped(`/nextpage/channel/${id}?nextpage=${encodeURIComponent(d.nextpage)}`); list = list.concat((d2.relatedStreams || []).map(x => pMap(x, d.name))); } } catch {}
  return uniq(list, 'videoId');
}

/* ---------- 3) alte API ---------- */
async function legacy(kind, q) { const d = await fetchT(`${ORIGINAL_API}?${kind}=${encodeURIComponent(q)}`, {}, 6000); return Array.isArray(d.result) ? d.result : []; }

/* erste Quelle mit Ergebnissen gewinnt (Reihenfolge = Priorität) */
async function firstNonEmpty(sources, dbg, label) {
  const ps = sources.map(([n, p]) => p.then(r => ({ n, r }), e => ({ n, e: String(e.message || e) })));
  for (const p of ps) { const x = await p; dbg[label + ':' + x.n] = x.e ? 'FEHLER ' + x.e : (x.r || []).length; if (x.r && x.r.length) return x.r; }
  return [];
}

module.exports = async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();
  const channel = String((req.query && req.query.channel) || '').trim();
  if (!q && !channel) return res.status(400).json({ error: 'Suchbegriff fehlt' });
  const dbg = {};
  try {
    let videos = [], channels = [];
    if (channel) {
      videos = await firstNonEmpty([['yt', ytChannelVideos(channel)], ['piped', pChannelVideos(channel)]], dbg, 'kanal');
    } else {
      [videos, channels] = await Promise.all([
        firstNonEmpty([['yt', ytVideos(q)], ['piped', pVideos(q)], ['legacy', legacy('video', q)]], dbg, 'videos'),
        firstNonEmpty([['yt', ytChannels(q)], ['piped', pChannels(q)], ['legacy', legacy('channel', q)]], dbg, 'kanaele')
      ]);
    }
    if (req.query && req.query.debug) return res.status(200).json({ dbg, videos: videos.length, channels: channels.length });
    if (!videos.length && !channels.length && !channel) throw new Error('keine Quelle lieferte Daten ' + JSON.stringify(dbg));
    if (videos.length) res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ result: videos, channels });
  } catch (error) {
    console.error('YouTube-Adapter-Fehler:', error);
    return res.status(502).json({ error: String(error.message || error) });
  }
};
