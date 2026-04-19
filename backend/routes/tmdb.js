const express = require('express');
const axios = require('axios');
const db = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';

const getApiKey = () => {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdb_api_key');
  return setting?.value || process.env.TMDB_API_KEY;
};

const tmdb = async (path, params = {}) => {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'your_tmdb_api_key_here')
    throw new Error('TMDB API Key no configurada. Ve al panel de administración.');

  const res = await axios.get(`${TMDB_BASE}${path}`, {
    params: { api_key: apiKey, language: 'es-ES', ...params },
  });
  return res.data;
};

// Movies
router.get('/movies/trending', async (req, res) => {
  try {
    const data = await tmdb('/trending/movie/week', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movies/popular', async (req, res) => {
  try {
    const data = await tmdb('/movie/popular', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movies/top-rated', async (req, res) => {
  try {
    const data = await tmdb('/movie/top_rated', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movies/now-playing', async (req, res) => {
  try {
    const data = await tmdb('/movie/now_playing', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movies/upcoming', async (req, res) => {
  try {
    const data = await tmdb('/movie/upcoming', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movies/genre/:id', async (req, res) => {
  try {
    const data = await tmdb('/discover/movie', { with_genres: req.params.id, page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movie/:id', async (req, res) => {
  try {
    const [details, credits, videos, similar] = await Promise.all([
      tmdb(`/movie/${req.params.id}`, { append_to_response: 'genres' }),
      tmdb(`/movie/${req.params.id}/credits`),
      tmdb(`/movie/${req.params.id}/videos`),
      tmdb(`/movie/${req.params.id}/similar`),
    ]);
    res.json({ ...details, credits, videos: videos.results, similar: similar.results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Series
router.get('/series/trending', async (req, res) => {
  try {
    const data = await tmdb('/trending/tv/week', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series/popular', async (req, res) => {
  try {
    const data = await tmdb('/tv/popular', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series/top-rated', async (req, res) => {
  try {
    const data = await tmdb('/tv/top_rated', { page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series/genre/:id', async (req, res) => {
  try {
    const data = await tmdb('/discover/tv', { with_genres: req.params.id, page: req.query.page || 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series/:id', async (req, res) => {
  try {
    const [details, credits, videos, similar] = await Promise.all([
      tmdb(`/tv/${req.params.id}`),
      tmdb(`/tv/${req.params.id}/credits`),
      tmdb(`/tv/${req.params.id}/videos`),
      tmdb(`/tv/${req.params.id}/similar`),
    ]);
    res.json({ ...details, credits, videos: videos.results, similar: similar.results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series/:id/season/:season', async (req, res) => {
  try {
    const data = await tmdb(`/tv/${req.params.id}/season/${req.params.season}`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Search
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'multi', page = 1 } = req.query;
    if (!q) return res.json({ results: [] });
    const data = await tmdb(`/search/${type}`, { query: q, page });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Genres
router.get('/genres/movies', async (req, res) => {
  try {
    const data = await tmdb('/genre/movie/list');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/genres/series', async (req, res) => {
  try {
    const data = await tmdb('/genre/tv/list');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Watchlist
router.get('/watchlist', auth, (req, res) => {
  const items = db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/watchlist', auth, (req, res) => {
  const { tmdb_id, media_type, title, poster_path } = req.body;
  try {
    db.prepare('INSERT OR IGNORE INTO watchlist (user_id, tmdb_id, media_type, title, poster_path) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, tmdb_id, media_type, title, poster_path);
    res.json({ message: 'Agregado a Mi Lista' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/watchlist/:tmdb_id/:media_type', auth, (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?')
    .run(req.user.id, req.params.tmdb_id, req.params.media_type);
  res.json({ message: 'Eliminado de Mi Lista' });
});

module.exports = router;
