// Vercel-Adapter für die bestehende apps/youtube.html
// Die Frontend-Seite sendet: /api/yt?q=...
// Intern wird die funktionierende Original-API verwendet.

const ORIGINAL_API = 'https://unofficial-youtube-api.vercel.app/youtube/search';

async function search(kind, q) {
  const response = await fetch(`${ORIGINAL_API}?${kind}=${encodeURIComponent(q)}`);
  const data = await response.json();
  if (!response.ok) return [];
  return Array.isArray(data.result) ? data.result : [];
}

module.exports = async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();

  if (!q) {
    return res.status(400).json({
      error: 'Suchbegriff fehlt'
    });
  }

  try {
    const [videos, channels] = await Promise.all([
      search('video', q),
      search('channel', q)
    ]);

    return res.status(200).json({ result: videos, channels });
  } catch (error) {
    console.error('YouTube-Adapter-Fehler:', error);
    return res.status(502).json({
      error: 'Die Original-YouTube-API ist momentan nicht erreichbar'
    });
  }
};
