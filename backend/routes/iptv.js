const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const db = require('../database');
const { auth } = require('../middleware/auth');

// Silence MaxListenersExceeded warnings on reused keep-alive sockets.
// Each axios request adds transient error listeners on the shared socket,
// which legitimately exceeds the default limit of 10.
EventEmitter.defaultMaxListeners = 50;

const router = express.Router();

// Persistent HTTP agents (keep-alive) so the IPTV server sees us as one session
const httpAgent  = new http.Agent({  keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
httpAgent.setMaxListeners(100);
httpsAgent.setMaxListeners(100);

// Cookie jar: hostname → Cookie header string  (simple, bounded)
const cookieJar = new Map();
const saveCookies = (hostname, setCookieArr) => {
  if (!setCookieArr?.length) return;
  const pairs = setCookieArr.map(c => c.split(';')[0]).join('; ');
  if (pairs) cookieJar.set(hostname, pairs);
};
const getCookies = (hostname) => cookieJar.get(hostname) || '';

const axiosIPTV = (opts) => axios({
  httpAgent, httpsAgent,
  maxRedirects: 5,
  ...opts,
});

// ─── In-memory cache (per-provider) ──────────────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000;
const M3U_TTL   = 15 * 60 * 1000;

// providerKey → { categories, catTs, channels, chTs }
const providerCache = new Map();
// providerKey → { map, ts }
const m3uCache = new Map();

const isStale = (ts, ttl = CACHE_TTL) => Date.now() - ts > ttl;

const getProviderCache = (key) => {
  if (!providerCache.has(key)) providerCache.set(key, { categories: null, catTs: 0, channels: null, chTs: 0 });
  return providerCache.get(key);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Returns credentials for a specific provider (by id) or the first active one
const getCredentials = (providerId) => {
  let p = null;
  if (providerId) p = db.providers.findById(Number(providerId));
  if (!p) {
    const active = db.providers.getActive();
    p = active[0] || null;
  }
  if (p) return { url: (p.url || '').replace(/\/$/, ''), user: p.username || '', pass: p.password || '', providerId: String(p.id) };
  return { url: '', user: '', pass: '', providerId: 'default' };
};

const xtreamGet = async (action, extra = {}, providerId) => {
  const { url, user, pass } = getCredentials(providerId);
  if (!url || !user || !pass) throw new Error('Credenciales IPTV no configuradas');
  const res = await axios.get(`${url}/player_api.php`, {
    params: { username: user, password: pass, action, ...extra },
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  return res.data;
};

// Fetch the full M3U_plus playlist from the provider; index URLs by stream ID.
const getSignedStreamMap = async (providerId) => {
  const key = String(providerId || 'default');
  const cached = m3uCache.get(key);
  if (cached && !isStale(cached.ts, M3U_TTL)) return cached.map;

  const { url, user, pass } = getCredentials(providerId);
  if (!url || !user || !pass) throw new Error('Credenciales IPTV no configuradas');

  const res = await axiosIPTV({
    url: `${url}/get.php`,
    method: 'GET',
    params: { username: user, password: pass, type: 'm3u_plus', output: 'ts' },
    timeout: 60000,
    responseType: 'text',
    headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
  });

  const map = new Map();
  const lines = String(res.data || '').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^https?:\/\//i.test(line)) continue;
    const m = line.match(/\/(\d+)(?:\.[a-z0-9]+)?(?:\?.*)?$/i);
    if (m) map.set(m[1], line);
  }
  m3uCache.set(key, { map, ts: Date.now() });
  return map;
};

const toBase64 = (str) => Buffer.from(str).toString('base64url');
const fromBase64 = (str) => Buffer.from(str, 'base64url').toString('utf8');

// SVG placeholder when logo fails
const TV_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="8" fill="#1f2937"/>
  <rect x="8" y="12" width="32" height="22" rx="3" fill="#374151"/>
  <polygon points="20,16 20,30 34,23" fill="#6b7280"/>
  <rect x="18" y="36" width="12" height="2" rx="1" fill="#4b5563"/>
</svg>`;

// Logo proxy cache (logo URL → buffer)
const logoCache = new Map();
const LOGO_CACHE_MAX = 500;

// ─── Logo proxy (eliminates 404/CORS errors for channel logos) ────────────────
router.get('/logo', async (req, res) => {
  const url = req.query.u ? fromBase64(req.query.u) : '';

  const sendPlaceholder = () => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(TV_PLACEHOLDER);
  };

  if (!url) return sendPlaceholder();

  // Serve from cache
  if (logoCache.has(url)) {
    const { data, type } = logoCache.get(url);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(data);
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 3,
    });

    const type = response.headers['content-type']?.split(';')[0] || 'image/png';
    const data = Buffer.from(response.data);

    // Keep cache bounded
    if (logoCache.size >= LOGO_CACHE_MAX) {
      const firstKey = logoCache.keys().next().value;
      logoCache.delete(firstKey);
    }
    logoCache.set(url, { data, type });

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(data);
  } catch {
    sendPlaceholder();
  }
});

// ─── Test connection ──────────────────────────────────────────────────────────
router.get('/test', async (req, res) => {
  try {
    const data = await xtreamGet('get_live_categories', {}, req.query.p);
    res.json({ ok: true, categories: Array.isArray(data) ? data.length : 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── List available providers ─────────────────────────────────────────────────
router.get('/providers', auth, (req, res) => {
  res.json(db.providers.getActive().map(p => ({ id: p.id, name: p.name })));
});

// Return the hidden-sets for a provider, as Sets of strings
const getHiddenSets = (providerId) => {
  const p = db.providers.findById(providerId);
  return {
    hiddenLiveCats:   new Set((p?.hidden_live_categories   || []).map(String)),
    hiddenLiveChans:  new Set((p?.hidden_live_channels     || []).map(String)),
    hiddenVodCats:    new Set((p?.hidden_vod_categories    || []).map(String)),
    hiddenSeriesCats: new Set((p?.hidden_series_categories || []).map(String)),
  };
};

// ─── Categories (cached per provider) ────────────────────────────────────────
router.get('/categories', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const pc = getProviderCache(providerId);
  try {
    if (!pc.categories || isStale(pc.catTs)) {
      pc.categories = await xtreamGet('get_live_categories', {}, pid);
      pc.catTs = Date.now();
    }
    const { hiddenLiveCats } = getHiddenSets(providerId);
    const list = Array.isArray(pc.categories) ? pc.categories : [];
    res.json(list.filter(c => !hiddenLiveCats.has(String(c.category_id))));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Channels (cached per provider) ──────────────────────────────────────────
router.get('/channels', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const pc = getProviderCache(providerId);
  try {
    if (!pc.channels || isStale(pc.chTs)) {
      pc.channels = await xtreamGet('get_live_streams', {}, pid);
      pc.chTs = Date.now();
    }
    let list = Array.isArray(pc.channels) ? pc.channels : [];
    const { hiddenLiveCats, hiddenLiveChans } = getHiddenSets(providerId);
    list = list.filter(c =>
      !hiddenLiveChans.has(String(c.stream_id)) &&
      !hiddenLiveCats.has(String(c.category_id))
    );
    if (req.query.category_id && req.query.category_id !== 'all')
      list = list.filter(c => String(c.category_id) === String(req.query.category_id));
    if (req.query.q) {
      const q = req.query.q.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q));
    }
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Force refresh cache ──────────────────────────────────────────────────────
router.post('/refresh', auth, (req, res) => {
  providerCache.clear();
  m3uCache.clear();
  res.json({ message: 'Caché limpiada, se recargará en la próxima petición' });
});

// ─── Stream URLs ──────────────────────────────────────────────────────────────
router.get('/stream/:id', auth, async (req, res) => {
  const pid = req.query.p;
  const { url, user, pass, providerId } = getCredentials(pid);
  if (!url) return res.status(500).json({ error: 'IPTV no configurado' });
  const id = req.params.id;

  let signed = null;
  try {
    const map = await getSignedStreamMap(providerId);
    signed = map.get(String(id)) || null;
  } catch {}

  const base = `${url}/${user}/${pass}/${id}`;
  const pParam = providerId ? `?p=${providerId}` : '';
  res.json({
    ts:         signed || base,
    m3u8:       signed ? signed.replace(/\.[a-z0-9]+(\?.*)?$/i, '') + '.m3u8' : `${base}.m3u8`,
    proxy_m3u8: `/api/iptv/proxy/${id}/index.m3u8${pParam}`,
    proxy_ts:   `/api/iptv/proxy/${id}/stream.ts${pParam}`,
    provider_id: providerId,
  });
});

// ─── Debug ────────────────────────────────────────────────────────────────────
router.get('/debug-m3u/:id', async (req, res) => {
  try {
    const { providerId } = getCredentials(req.query.p);
    const map = await getSignedStreamMap(providerId);
    const signed = map.get(String(req.params.id));
    res.json({ mapSize: map.size, requestedId: req.params.id, signedUrl: signed || null, sample: Array.from(map.entries()).slice(0, 5) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/debug/:id', async (req, res) => {
  const { url, user, pass } = getCredentials();
  if (!url) return res.status(500).json({ error: 'IPTV no configurado' });
  const urls = [
    `${url}/${user}/${pass}/${req.params.id}.m3u8`,
    `${url}/live/${user}/${pass}/${req.params.id}.m3u8`,
    `${url}/${user}/${pass}/${req.params.id}`,
  ];
  const results = [];
  for (const u of urls) {
    try {
      const r = await axios.get(u, {
        timeout: 5000, responseType: 'text',
        headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
        maxRedirects: 5,
      });
      results.push({ url: u, status: r.status, contentType: r.headers['content-type'], preview: r.data?.substring(0, 200) });
    } catch (e) {
      results.push({ url: u, error: e.message, code: e.response?.status });
    }
  }
  res.json(results);
});

// ─── Helper: fetch m3u8 trying multiple URL formats ──────────────────────────
const fetchM3u8 = async (url, user, pass, id, providerId) => {
  const candidates = [];
  try {
    const map = await getSignedStreamMap(providerId);
    console.log(`[IPTV M3U] map size=${map.size} lookup id=${id}`);
    const signed = map.get(String(id));
    if (signed) {
      console.log(`[IPTV M3U] signed URL: ${signed}`);
      const base = signed.replace(/\.[a-z0-9]+(\?.*)?$/i, '');
      candidates.push(`${base}.m3u8`, signed);
    } else {
      console.log(`[IPTV M3U] id ${id} NOT in map`);
    }
  } catch (e) {
    console.error(`[IPTV M3U] fetch error: ${e.message}`);
  }
  // 2) Fallbacks: standard Xtream URL formats
  candidates.push(
    `${url}/${user}/${pass}/${id}.m3u8`,
    `${url}/live/${user}/${pass}/${id}.m3u8`,
    `${url}/hls/${user}/${pass}/${id}.m3u8`,
  );
  for (const m3u8Url of candidates) {
    try {
      const parsed = new URL(m3u8Url);
      const response = await axiosIPTV({
        url: m3u8Url, method: 'GET',
        timeout: 15000,
        responseType: 'text',
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Referer': parsed.origin + '/',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          ...(getCookies(parsed.hostname) ? { Cookie: getCookies(parsed.hostname) } : {}),
        },
      });
      saveCookies(parsed.hostname, response.headers['set-cookie']);
      const data = response.data || '';
      if (typeof data === 'string' && (data.includes('#EXTM3U') || data.includes('#EXT-X'))) {
        return { m3u8Url, content: data };
      }
    } catch (e) {
      console.error(`[IPTV m3u8] ${e.response?.status || 'ERR'} ${m3u8Url}: ${e.message}`);
    }
  }
  return null;
};

// Resolve a URL line from an m3u8 file against its base
const resolveUrl = (line, baseUrl, origin) => {
  if (line.startsWith('http')) return line;
  if (line.startsWith('/')) return origin + line;
  return baseUrl + line;
};

// ─── PROXY: m3u8 playlist (rewrites segment URLs → through our server) ────────
router.get('/proxy/:id/index.m3u8', async (req, res) => {
  const pid = req.query.p;
  const { url, user, pass, providerId } = getCredentials(pid);
  if (!url) return res.status(500).send('# Error: IPTV no configurado');

  const result = await fetchM3u8(url, user, pass, req.params.id, providerId);
  if (!result) {
    return res.status(502).send('# Error: No se pudo obtener el stream m3u8 del servidor IPTV');
  }

  const { m3u8Url, content } = result;
  const parsed = new URL(m3u8Url);
  const origin  = parsed.origin;
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

  const rewritten = content.replace(/^((?!#).+)$/gm, (line) => {
    if (!line.trim()) return line;
    const absUrl = resolveUrl(line.trim(), baseUrl, origin);
    if (absUrl.endsWith('.m3u8')) {
      return `/api/iptv/proxy/sub/${toBase64(absUrl)}/playlist.m3u8`;
    }
    return `/api/iptv/proxy/seg/${toBase64(absUrl)}`;
  });

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(rewritten);
});

// ─── PROXY: sub-playlist (variant quality m3u8) ───────────────────────────────
router.get('/proxy/sub/:encoded/playlist.m3u8', async (req, res) => {
  let origUrl = '';
  let subOrigin = '';
  try {
    origUrl = fromBase64(req.params.encoded);
    const parsed = new URL(origUrl);
    subOrigin = parsed.origin;
    const response = await axiosIPTV({
      url: origUrl, method: 'GET',
      timeout: 15000, responseType: 'text',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Referer': subOrigin + '/',
        'Accept': '*/*',
        'Connection': 'keep-alive',
        ...(getCookies(parsed.hostname) ? { Cookie: getCookies(parsed.hostname) } : {}),
      },
    });
    saveCookies(parsed.hostname, response.headers['set-cookie']);

    let content = response.data;
    const baseUrl = origUrl.substring(0, origUrl.lastIndexOf('/') + 1);

    content = content.replace(/^((?!#).+)$/gm, (line) => {
      if (!line.trim()) return line;
      const absUrl = resolveUrl(line.trim(), baseUrl, subOrigin);
      return `/api/iptv/proxy/seg/${toBase64(absUrl)}`;
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(content);
  } catch (e) {
    console.error(`[IPTV sub] ${e.response?.status || 'ERR'} ${origUrl}: ${e.message}`);
    res.status(502).send(`# Error: ${e.message}`);
  }
});

// ─── PROXY: TS segment ────────────────────────────────────────────────────────
router.get('/proxy/seg/:encoded', async (req, res) => {
  let segUrl = '';
  try {
    segUrl = fromBase64(req.params.encoded);
    const parsed = new URL(segUrl);
    const response = await axiosIPTV({
      url: segUrl, method: 'GET',
      timeout: 30000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Referer': parsed.origin + '/',
        'Accept': '*/*',
        'Connection': 'keep-alive',
        ...(getCookies(parsed.hostname) ? { Cookie: getCookies(parsed.hostname) } : {}),
      },
      validateStatus: s => s >= 200 && s < 400,
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    response.data.pipe(res);

    response.data.on('error', () => res.end());
    req.on('close', () => { try { response.data.destroy(); } catch {} });
  } catch (e) {
    const status = e.response?.status;
    console.error(`[IPTV seg] ${status || 'ERR'} ${segUrl}: ${e.message}`);
    res.status(502).end();
  }
});

// ─── PROXY: direct TS stream ──────────────────────────────────────────────────
router.get('/proxy/:id/stream.ts', async (req, res) => {
  const pid = req.query.p;
  const { url, user, pass, providerId } = getCredentials(pid);
  if (!url) return res.status(500).end();

  const id = req.params.id;

  const candidates = [];
  try {
    const map = await getSignedStreamMap(providerId);
    const signed = map.get(String(id));
    if (signed) candidates.push(signed);
  } catch (e) {
    console.error(`[IPTV ts] m3u map error for id=${id}: ${e.message}`);
  }
  candidates.push(
    `${url}/${user}/${pass}/${id}`,
    `${url}/live/${user}/${pass}/${id}.ts`,
  );

  let lastError = null;
  for (const tsUrl of candidates) {
    try {
      const parsed = new URL(tsUrl);
      const response = await axiosIPTV({
        url: tsUrl, method: 'GET',
        timeout: 30000,
        responseType: 'stream',
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Referer': parsed.origin + '/',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          ...(getCookies(parsed.hostname) ? { Cookie: getCookies(parsed.hostname) } : {}),
        },
        validateStatus: s => s >= 200 && s < 400,
      });

      console.log(`[IPTV ts] ${response.status} id=${id} ${tsUrl}`);
      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      response.data.pipe(res);
      response.data.on('error', (err) => {
        console.error(`[IPTV ts] stream error id=${id}: ${err.message}`);
        res.end();
      });
      req.on('close', () => { try { response.data.destroy(); } catch {} });
      return;
    } catch (e) {
      const status = e.response?.status;
      lastError = e;
      console.error(`[IPTV ts] ${status || 'ERR'} id=${id} ${tsUrl}: ${e.message}`);
    }
  }

  // All candidates failed — return a diagnostic header for the frontend
  const status = lastError?.response?.status || 502;
  res.setHeader('X-IPTV-Error', lastError?.message?.slice(0, 200) || 'upstream failed');
  res.status(status >= 400 && status < 600 ? status : 502).end();
});

// ═══════════════════════════════════════════════════════════════════════════
// VOD (Movies) — uses Xtream get_vod_categories / get_vod_streams / get_vod_info
// ═══════════════════════════════════════════════════════════════════════════

// vod cache per provider: { cats, catTs, streams, strTs, info: Map<id, {data,ts}> }
const vodCache = new Map();
const getVodCache = (key) => {
  if (!vodCache.has(key)) vodCache.set(key, { cats: null, catTs: 0, streams: null, strTs: 0, info: new Map() });
  return vodCache.get(key);
};

router.get('/vod/categories', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const cache = getVodCache(providerId);
  try {
    if (!cache.cats || isStale(cache.catTs)) {
      cache.cats = await xtreamGet('get_vod_categories', {}, pid);
      cache.catTs = Date.now();
    }
    const { hiddenVodCats } = getHiddenSets(providerId);
    const list = Array.isArray(cache.cats) ? cache.cats : [];
    res.json(list.filter(c => !hiddenVodCats.has(String(c.category_id))));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/vod/movies', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const cache = getVodCache(providerId);
  try {
    if (!cache.streams || isStale(cache.strTs)) {
      cache.streams = await xtreamGet('get_vod_streams', {}, pid);
      cache.strTs = Date.now();
    }
    let list = Array.isArray(cache.streams) ? cache.streams : [];
    const { hiddenVodCats } = getHiddenSets(providerId);
    list = list.filter(m => !hiddenVodCats.has(String(m.category_id)));
    if (req.query.category_id && req.query.category_id !== 'all')
      list = list.filter(m => String(m.category_id) === String(req.query.category_id));
    if (req.query.q) {
      const q = req.query.q.toLowerCase();
      list = list.filter(m => (m.name || m.title || '').toLowerCase().includes(q));
    }
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 60);
    const total = list.length;
    const paged = list.slice((page - 1) * limit, page * limit);
    res.json({ total, page, pages: Math.ceil(total / limit), results: paged });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/vod/info/:id', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const cache = getVodCache(providerId);
  const key = String(req.params.id);
  try {
    const cached = cache.info.get(key);
    if (cached && !isStale(cached.ts, 30 * 60 * 1000)) return res.json(cached.data);
    const data = await xtreamGet('get_vod_info', { vod_id: req.params.id }, pid);
    cache.info.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Movie stream URL (proxied as m3u8 + ts for playback)
router.get('/vod/stream/:id', auth, async (req, res) => {
  const pid = req.query.p;
  const { url, user, pass, providerId } = getCredentials(pid);
  if (!url) return res.status(500).json({ error: 'IPTV no configurado' });
  const id = req.params.id;
  const ext = (req.query.ext || 'mp4').toLowerCase();
  const pParam = providerId ? `?p=${providerId}` : '';
  const direct = `${url}/movie/${user}/${pass}/${id}.${ext}`;
  res.json({
    direct,
    proxy: `/api/iptv/vod/proxy/${id}.${ext}${pParam}`,
    provider_id: providerId,
  });
});

router.get('/vod/proxy/:file', async (req, res) => {
  const pid = req.query.p;
  const { url, user, pass } = getCredentials(pid);
  if (!url) return res.status(500).end();
  const match = req.params.file.match(/^(\d+)\.([a-z0-9]+)$/i);
  if (!match) return res.status(400).end();
  const [, id, ext] = match;
  const candidates = [
    `${url}/movie/${user}/${pass}/${id}.${ext}`,
    `${url}/movies/${user}/${pass}/${id}.${ext}`,
  ];
  for (const target of candidates) {
    try {
      const parsed = new URL(target);
      const r = await axiosIPTV({
        url: target, method: 'GET',
        timeout: 30000,
        responseType: 'stream',
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Referer': parsed.origin + '/',
          ...(req.headers.range ? { Range: req.headers.range } : {}),
          ...(getCookies(parsed.hostname) ? { Cookie: getCookies(parsed.hostname) } : {}),
        },
        validateStatus: s => s >= 200 && s < 400,
      });
      res.status(r.status);
      if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type']);
      if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);
      if (r.headers['content-range']) res.setHeader('Content-Range', r.headers['content-range']);
      if (r.headers['accept-ranges']) res.setHeader('Accept-Ranges', r.headers['accept-ranges']);
      res.setHeader('Cache-Control', 'no-cache');
      r.data.pipe(res);
      req.on('close', () => { try { r.data.destroy(); } catch {} });
      return;
    } catch (e) {
      console.error(`[IPTV vod] ${e.response?.status || 'ERR'} ${target}: ${e.message}`);
    }
  }
  res.status(502).end();
});

// ═══════════════════════════════════════════════════════════════════════════
// Series — uses Xtream get_series_categories / get_series / get_series_info
// ═══════════════════════════════════════════════════════════════════════════

const seriesCache = new Map();
const getSeriesCache = (key) => {
  if (!seriesCache.has(key)) seriesCache.set(key, { cats: null, catTs: 0, list: null, listTs: 0, info: new Map() });
  return seriesCache.get(key);
};

router.get('/series/categories', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const cache = getSeriesCache(providerId);
  try {
    if (!cache.cats || isStale(cache.catTs)) {
      cache.cats = await xtreamGet('get_series_categories', {}, pid);
      cache.catTs = Date.now();
    }
    const { hiddenSeriesCats } = getHiddenSets(providerId);
    const list = Array.isArray(cache.cats) ? cache.cats : [];
    res.json(list.filter(c => !hiddenSeriesCats.has(String(c.category_id))));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const cache = getSeriesCache(providerId);
  try {
    if (!cache.list || isStale(cache.listTs)) {
      cache.list = await xtreamGet('get_series', {}, pid);
      cache.listTs = Date.now();
    }
    let list = Array.isArray(cache.list) ? cache.list : [];
    const { hiddenSeriesCats } = getHiddenSets(providerId);
    list = list.filter(s => !hiddenSeriesCats.has(String(s.category_id)));
    if (req.query.category_id && req.query.category_id !== 'all')
      list = list.filter(s => String(s.category_id) === String(req.query.category_id));
    if (req.query.q) {
      const q = req.query.q.toLowerCase();
      list = list.filter(s => (s.name || s.title || '').toLowerCase().includes(q));
    }
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 60);
    const total = list.length;
    const paged = list.slice((page - 1) * limit, page * limit);
    res.json({ total, page, pages: Math.ceil(total / limit), results: paged });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/series/:id', auth, async (req, res) => {
  const pid = req.query.p;
  const { providerId } = getCredentials(pid);
  const cache = getSeriesCache(providerId);
  const key = String(req.params.id);
  try {
    const cached = cache.info.get(key);
    if (cached && !isStale(cached.ts, 30 * 60 * 1000)) return res.json(cached.data);
    const data = await xtreamGet('get_series_info', { series_id: req.params.id }, pid);
    cache.info.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/episode/stream/:id', auth, (req, res) => {
  const pid = req.query.p;
  const { url, user, pass, providerId } = getCredentials(pid);
  if (!url) return res.status(500).json({ error: 'IPTV no configurado' });
  const id = req.params.id;
  const ext = (req.query.ext || 'mp4').toLowerCase();
  const pParam = providerId ? `?p=${providerId}` : '';
  res.json({
    direct: `${url}/series/${user}/${pass}/${id}.${ext}`,
    proxy: `/api/iptv/episode/proxy/${id}.${ext}${pParam}`,
    provider_id: providerId,
  });
});

router.get('/episode/proxy/:file', async (req, res) => {
  const pid = req.query.p;
  const { url, user, pass } = getCredentials(pid);
  if (!url) return res.status(500).end();
  const match = req.params.file.match(/^(\d+)\.([a-z0-9]+)$/i);
  if (!match) return res.status(400).end();
  const [, id, ext] = match;
  const target = `${url}/series/${user}/${pass}/${id}.${ext}`;
  try {
    const parsed = new URL(target);
    const r = await axiosIPTV({
      url: target, method: 'GET',
      timeout: 30000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Referer': parsed.origin + '/',
        ...(req.headers.range ? { Range: req.headers.range } : {}),
        ...(getCookies(parsed.hostname) ? { Cookie: getCookies(parsed.hostname) } : {}),
      },
      validateStatus: s => s >= 200 && s < 400,
    });
    res.status(r.status);
    if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type']);
    if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);
    if (r.headers['content-range']) res.setHeader('Content-Range', r.headers['content-range']);
    if (r.headers['accept-ranges']) res.setHeader('Accept-Ranges', r.headers['accept-ranges']);
    res.setHeader('Cache-Control', 'no-cache');
    r.data.pipe(res);
    req.on('close', () => { try { r.data.destroy(); } catch {} });
  } catch (e) {
    console.error(`[IPTV ep] ${e.response?.status || 'ERR'} ${target}: ${e.message}`);
    res.status(502).end();
  }
});

module.exports = router;
