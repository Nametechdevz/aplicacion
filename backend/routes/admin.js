const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(adminOnly);

// Dashboard stats
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get().count;
  const adminUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
  const recentUsers = db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
  res.json({ totalUsers, activeUsers, adminUsers, recentUsers });
});

// Users CRUD
router.get('/users', (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const offset = (page - 1) * limit;
  const like = `%${search}%`;

  const users = db.prepare(
    'SELECT id, name, email, role, active, created_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(like, like, parseInt(limit), parseInt(offset));

  const total = db.prepare('SELECT COUNT(*) as count FROM users WHERE name LIKE ? OR email LIKE ?').get(like, like).count;
  res.json({ users, total, pages: Math.ceil(total / limit) });
});

router.post('/users', (req, res) => {
  const { name, email, password, role = 'user' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'El email ya existe' });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(name, email.toLowerCase().trim(), hashed, role);
  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

router.put('/users/:id', (req, res) => {
  const { name, email, password, role, active } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (email && email !== user.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), user.id);
    if (conflict) return res.status(400).json({ error: 'Email ya en uso' });
  }

  const updatedPassword = password ? bcrypt.hashSync(password, 10) : user.password;
  db.prepare('UPDATE users SET name = ?, email = ?, password = ?, role = ?, active = ? WHERE id = ?').run(
    name || user.name,
    email ? email.toLowerCase().trim() : user.email,
    updatedPassword,
    role || user.role,
    active !== undefined ? (active ? 1 : 0) : user.active,
    user.id
  );

  const updated = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(user.id);
  res.json(updated);
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ message: 'Usuario eliminado' });
});

// Settings
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const allowed = ['site_name', 'tmdb_api_key', 'allow_register', 'featured_movie', 'accent_color'];
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updateMany = db.transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      if (allowed.includes(key)) update.run(key, String(value));
    }
  });
  updateMany(req.body);
  res.json({ message: 'Configuración guardada' });
});

module.exports = router;
