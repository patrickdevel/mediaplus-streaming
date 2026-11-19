// Vercel-Adapter: /api/yt?q=...  oder  /api/yt?channel=UC...
// Nutzt YouTubes interne Such-API (viele Ergebnisse), Fallback = alte Original-API.

const ORIGINAL_API = 'https://unofficial-youtube-api.vercel.app/youtube/search';
const INNER = 'https://www.youtube.com/youtubei/v1';
const CTX = { client: { clientName: 'WEB', clientVersion: '2.20250310.01.00', hl: 'de', gl: 'DE' } };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function inner(ep, body) {
  const r = await fetch(`${INNER}/${ep}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9' },
    body: JSON.stringify({ context: CTX, ...body })
  });
  if (!r.ok) throw new Error('inner ' + r.status);
  return r.json();
}

function collect(node, key, out = []) {
  if (Array.isArray(node)) node.forEach(n => collect(n, key, out));
  else if (node && typeof node === 'object') {
    for (const k in node) { if (k === key) out.push(node[k]); else collect(node[k], key, out); }
  }
  return out;
}
const txt = o => (o && (o.simpleText ?? (o.runs || []).map(r => r.text).join(''))) || '';
const img = u => (u ? (u.startsWith('//') ? 'https:' + u : u) : '');

function mapVideo(v, fallbackAuthor) {
  const owner = v.ownerText || v.longBylineText || v.shortBylineText;
  const views = txt(v.viewCountText).replace(/\D/g, '');
  const live = (v.badges || []).some(b => /LIVE/.test(JSON.stringify(b.metadataBadgeRenderer || ''))) ||
    (v.thumbnailOverlays || []).some(o => o.thumbnailOverlayTimeStatusRenderer && o.thumbnailOverlayTimeStatusRenderer.style === 'LIVE');
  return {
    videoId: v.videoId,
    title: txt(v.title),
    author: { name: txt(owner) || fallbackAuthor || '', id: owner && owner.runs && owner.runs[0] && owner.runs[0].navigationEndpoint && owner.runs[0].navigationEndpoint.browseEndpoint ? owner.runs[0].navigationEndpoint.browseEndpoint.browseId : undefined },
    views: { count: views ? Number(views) : undefined },
    publishedTime: txt(v.publishedTimeText),
    duration: { raw: txt(v.lengthText) },
    isLive: live
  };
}
function mapChannel(c) {
  const a = txt(c.subscriberCountText), b = txt(c.videoCountText);
  const handle = [a, b].find(x => x.startsWith('@')) || '';
  const subs = [a, b].find(x => x && !x.startsWith('@')) || '';
  const th = (c.thumbnail && c.thumbnail.thumbnails) || [];
  return {
    channelId: c.channelId,
    channelName: txt(c.title),
    handle, subs,
    avatar: img(th.length ? th[th.length - 1].url : ''),
    description: txt(c.descriptionSnippet),
    url: 'https://www.youtube.com/channel/' + c.channelId
  };
}
const uniq = (arr, key) => { const s = new Set(); return arr.filter(x => x[key] && !s.has(x[key]) && s.add(x[key])); };

async function searchVideos(q) {
  let data = await inner('search', { query: q, params: 'EgIQAQ==' });
  let list = collect(data, 'videoRenderer').map(v => mapVideo(v));
  try { // zweite Seite
    const tok = (collect(data, 'continuationCommand')[0] || {}).token;
    if (tok) { const d2 = await inner('search', { continuation: tok }); list = list.concat(collect(d2, 'videoRenderer').map(v => mapVideo(v))); }
  } catch {}
  return uniq(list, 'videoId');
}
async function searchChannels(q) {
  const data = await inner('search', { query: q, params: 'EgIQAg==' });
  return uniq(collect(data, 'channelRenderer').map(mapChannel), 'channelId');
}
async function channelVideos(id) {
  const data = await inner('browse', { browseId: id, params: 'EgZ2aWRlb3PyBgQKAjoA' });
  return uniq(collect(data, 'videoRenderer').map(v => mapVideo(v)), 'videoId');
}

async function legacy(kind, q) {
  try {
    const r = await fetch(`${ORIGINAL_API}?${kind}=${encodeURIComponent(q)}`);
    const d = await r.json();
    return r.ok && Array.isArray(d.result) ? d.result : [];
  } catch { return []; }
}

module.exports = async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();
  const channel = String((req.query && req.query.channel) || '').trim();
  if (!q && !channel) return res.status(400).json({ error: 'Suchbegriff fehlt' });
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    if (channel) return res.status(200).json({ result: await channelVideos(channel), channels: [] });

    const [v, c] = await Promise.allSettled([searchVideos(q), searchChannels(q)]);
    let videos = v.status === 'fulfilled' ? v.value : [];
    let channels = c.status === 'fulfilled' ? c.value : [];
    if (!videos.length) videos = await legacy('video', q);
    if (!channels.length) channels = await legacy('channel', q);
    if (!videos.length && !channels.length) throw new Error('keine Daten');
    return res.status(200).json({ result: videos, channels });
  } catch (error) {
    console.error('YouTube-Adapter-Fehler:', error);
    return res.status(502).json({ error: 'YouTube ist momentan nicht erreichbar' });
  }
};
