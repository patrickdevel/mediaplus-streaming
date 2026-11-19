// Vercel-Adapter für die bestehende apps/youtube.html
// Die Frontend-Seite sendet: /api/yt?q=...
// Intern wird die funktionierende Original-API verwendet.

const ORIGINAL_API = 'https://unofficial-youtube-api.vercel.app/youtube/search';

module.exports = async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();

  if (!q) {
    return res.status(400).json({
      error: 'Suchbegriff fehlt'
    });
  }

  try {
    const url = `${ORIGINAL_API}?video=${encodeURIComponent(q)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Die YouTube-Suche ist fehlgeschlagen'
      });
    }

    return res.status(200).json({
      result: Array.isArray(data.result) ? data.result : []
    });
  } catch (error) {
    console.error('YouTube-Adapter-Fehler:', error);
    return res.status(502).json({
      error: 'Die Original-YouTube-API ist momentan nicht erreichbar'
    });
  }
};
