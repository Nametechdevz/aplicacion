const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(adminOnly);

// Dashboard stats
router.get('/stats', (req, res) => {
  res.json({
    totalUsers: db.users.count(),
    activeUsers: db.users.count({ active: 1 }),
    adminUsers: db.users.count({ role: 'admin' }),
    recentUsers: db.users.recent(5),
  });
});

// Users CRUD
router.get('/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  res.json(db.users.search({ query: search, page, limit }));
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
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (password) updates.password = bcrypt.hashSync(password, 10);
  if (role) updates.role = role;
  if (active !== undefined) updates.active = active ? 1 : 0;

  db.users.update(user.id, updates);
  const updated = db.users.findById(user.id);
  const { password: _, ...safe } = updated;
  res.json(safe);
});

router.delete('/users/:id', (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

  db.users.delete(user.id);
  res.json({ message: 'Usuario eliminado' });
});

// Settings
router.get('/settings', (req, res) => {
  res.json(db.settings.getAll());
});

router.put('/settings', (req, res) => {
  const allowed = ['site_name', 'tmdb_api_key', 'allow_register', 'featured_movie', 'accent_color'];
  const filtered = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) filtered[key] = value;
  }
  db.settings.setMany(filtered);
  res.json({ message: 'Configuración guardada' });
});

module.exports = router;
