const express = require('express');
const axios = require('axios');
const db = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

const getXtream = () => {
  const url  = db.settings.get('xtream_url')  || '';
  const user = db.settings.get('xtream_user') || '';
  const pass = db.settings.get('xtream_pass') || '';
  return { url, user, pass };
};

const xtreamApi = async (action, extra = {}) => {
  const { url, user, pass } = getXtream();
  if (!url || !user || !pass) throw new Error('Credenciales IPTV no configuradas. Ve al panel admin.');
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const res = await axios.get(`${baseUrl}/player_api.php`, {
    params: { username: user, password: pass, action, ...extra },
    timeout: 10000,
  });
  return res.data;
};

// Test connection
router.get('/test', async (req, res) => {
  try {
    const data = await xtreamApi('get_live_categories');
    res.json({ ok: true, categories: data.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Live categories
router.get('/live/categories', auth, async (req, res) => {
  try {
    const data = await xtreamApi('get_live_categories');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Live channels (all or by category)
router.get('/live/channels', auth, async (req, res) => {
  try {
    const params = {};
    if (req.query.category_id) params.category_id = req.query.category_id;
    const data = await xtreamApi('get_live_streams', params);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Search channels
router.get('/live/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    const data = await xtreamApi('get_live_streams');
    const filtered = data.filter(ch =>
      ch.name?.toLowerCase().includes(q) || ch.category_name?.toLowerCase().includes(q)
    );
    res.json(filtered.slice(0, 50));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stream URL (proxy redirect to hide credentials)
router.get('/live/stream/:stream_id', auth, (req, res) => {
  const { url, user, pass } = getXtream();
  if (!url || !user || !pass) return res.status(500).json({ error: 'IPTV no configurado' });
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const streamUrl = `${baseUrl}/${user}/${pass}/${req.params.stream_id}`;
  res.json({ url: streamUrl, hls: `${streamUrl}.m3u8` });
});

// EPG (guía de programación)
router.get('/epg/:stream_id', auth, async (req, res) => {
  try {
    const data = await xtreamApi('get_simple_data_table', { stream_id: req.params.stream_id });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
