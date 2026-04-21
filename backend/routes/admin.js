const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const db = require('../database');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(adminOnly);

// ─── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  res.json({
    totalUsers:          db.users.count(),
    activeUsers:         db.users.count({ active: 1 }),
    adminUsers:          db.users.count({ role: 'admin' }),
    activeSubscriptions: db.subscriptions.countActive(),
    totalPlans:          db.plans.getActive().length,
    totalProviders:      db.providers.getActive().length,
    recentUsers:         db.users.recent(5),
  });
});

// ─── Users CRUD ───────────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const page   = parseInt(req.query.page) || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const result = db.users.search({ query: search, page, limit });
  result.users = result.users.map(u => {
    const sub  = db.subscriptions.findActive(u.id);
    const plan = sub ? db.plans.findById(sub.plan_id) : null;
    return { ...u, subscription: sub ? { id: sub.id, plan_name: plan?.name, plan_color: plan?.color, expires_at: sub.expires_at } : null };
  });
  res.json(result);
});

router.post('/users', (req, res) => {
  const { name, email, password, role = 'user' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (db.users.findByEmail(email)) return res.status(400).json({ error: 'El email ya existe' });
  const hashed = bcrypt.hashSync(password, 10);
  const user = db.users.create({ name, email, password: hashed, role });
  const { password: _, ...safe } = user;
  res.status(201).json(safe);
});

router.put('/users/:id', (req, res) => {
  const { name, email, password, role, active } = req.body;
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (email && email.toLowerCase().trim() !== user.email) {
    if (db.users.emailExists(email, user.id)) return res.status(400).json({ error: 'Email ya en uso' });
  }
  const updates = {};
  if (name)                 updates.name = name;
  if (email)                updates.email = email;
  if (password)             updates.password = bcrypt.hashSync(password, 10);
  if (role)                 updates.role = role;
  if (active !== undefined) updates.active = active ? 1 : 0;
  db.users.update(user.id, updates);
  const { password: _, ...safe } = db.users.findById(user.id);
  res.json(safe);
});

router.delete('/users/:id', (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  db.users.delete(user.id);
  res.json({ message: 'Usuario eliminado' });
});

// ─── General Settings ─────────────────────────────────────────────────────────
router.get('/settings', (req, res) => res.json(db.settings.getAll()));

router.put('/settings', (req, res) => {
  const allowed = ['site_name', 'tmdb_api_key', 'allow_register', 'featured_movie', 'accent_color'];
  const filtered = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) filtered[key] = value;
  }
  db.settings.setMany(filtered);
  res.json({ message: 'Configuración guardada' });
});

// ─── IPTV Providers ───────────────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  res.json(db.providers.getAll().map(p => ({ ...p, password: p.password ? '••••••••' : '' })));
});

router.get('/providers/:id', (req, res) => {
  const p = db.providers.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
  res.json(p);
});

// Test must come before /:id route to avoid conflict
router.post('/providers/test', async (req, res) => {
  const { url, username, password } = req.body;
  if (!url || !username) return res.status(400).json({ ok: false, error: 'URL y usuario requeridos' });
  try {
    const baseUrl = (url || '').replace(/\/$/, '');
    const r = await axios.get(`${baseUrl}/player_api.php`, {
      params: { username, password, action: 'get_live_categories' },
      timeout: 12000,
      headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
    });
    const cats = Array.isArray(r.data) ? r.data.length : 0;
    res.json({ ok: true, categories: cats, msg: `✓ Conectado — ${cats} categorías` });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.response?.data?.error || e.message });
  }
});

router.post('/providers', (req, res) => {
  const { name, url, username, password, active } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Nombre y URL son requeridos' });
  const provider = db.providers.create({ name, url, username, password, active });
  res.status(201).json({ ...provider, password: provider.password ? '••••••••' : '' });
});

router.put('/providers/:id', (req, res) => {
  const p = db.providers.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const { name, url, username, password, active } = req.body;
  const updates = {};
  if (name !== undefined)     updates.name = name;
  if (url !== undefined)      updates.url = url;
  if (username !== undefined) updates.username = username;
  if (password && password !== '••••••••') updates.password = password;
  if (active !== undefined)   updates.active = active;
  const updated = db.providers.update(p.id, updates);
  res.json({ ...updated, password: updated.password ? '••••••••' : '' });
});

router.delete('/providers/:id', (req, res) => {
  const p = db.providers.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
  db.providers.delete(p.id);
  res.json({ message: 'Proveedor eliminado' });
});

// ─── Plans ────────────────────────────────────────────────────────────────────
router.get('/plans', (req, res) => res.json(db.plans.getAll()));

router.post('/plans', (req, res) => {
  const { name, description, price, duration_days, color, features, active } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  res.status(201).json(db.plans.create({ name, description, price, duration_days, color, features, active }));
});

router.put('/plans/:id', (req, res) => {
  const plan = db.plans.findById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  res.json(db.plans.update(plan.id, req.body));
});

router.delete('/plans/:id', (req, res) => {
  const plan = db.plans.findById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  db.plans.delete(plan.id);
  res.json({ message: 'Plan eliminado' });
});

// ─── Subscriptions ────────────────────────────────────────────────────────────
router.get('/subscriptions', (req, res) => {
  const subs = db.subscriptions.getAll().map(s => {
    const user = db.users.findById(s.user_id);
    const plan = db.plans.findById(s.plan_id);
    return { ...s, user_name: user?.name || '(eliminado)', user_email: user?.email || '', plan_name: plan?.name || '(eliminado)', plan_color: plan?.color || '#6b7280' };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(subs);
});

router.post('/subscriptions', (req, res) => {
  const { user_id, plan_id, duration_days, starts_at, expires_at, notes } = req.body;
  if (!user_id || !plan_id) return res.status(400).json({ error: 'Usuario y plan son requeridos' });
  if (!db.users.findById(user_id)) return res.status(404).json({ error: 'Usuario no encontrado' });
  const plan = db.plans.findById(plan_id);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

  const startsAt = starts_at ? new Date(starts_at) : new Date();
  let expiresAt = expires_at ? new Date(expires_at) : null;
  if (!expiresAt && Number(duration_days) > 0) {
    expiresAt = new Date(startsAt);
    expiresAt.setDate(expiresAt.getDate() + Number(duration_days));
  } else if (!expiresAt && plan.duration_days > 0) {
    expiresAt = new Date(startsAt);
    expiresAt.setDate(expiresAt.getDate() + plan.duration_days);
  }

  const sub = db.subscriptions.create({
    user_id: Number(user_id), plan_id: Number(plan_id),
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    notes: notes || '',
  });
  res.status(201).json(sub);
});

router.put('/subscriptions/:id', (req, res) => {
  const sub = db.subscriptions.findById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });
  res.json(db.subscriptions.update(sub.id, req.body));
});

router.delete('/subscriptions/:id', (req, res) => {
  const sub = db.subscriptions.findById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });
  db.subscriptions.delete(sub.id);
  res.json({ message: 'Suscripción eliminada' });
});

module.exports = router;
