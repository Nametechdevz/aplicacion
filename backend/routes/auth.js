const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/register', (req, res) => {
  const allowRegister = db.prepare('SELECT value FROM settings WHERE key = ?').get('allow_register');
  if (allowRegister?.value !== 'true')
    return res.status(403).json({ error: 'El registro está desactivado' });

  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'El email ya está registrado' });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email.toLowerCase().trim(), hashed);
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);

  const token = signToken(user);
  res.status(201).json({ token, user });
});

router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

router.put('/profile', auth, (req, res) => {
  const { name, password, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (newPassword) {
    if (!password || !bcrypt.compareSync(password, user.password))
      return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET name = ?, password = ? WHERE id = ?').run(name || user.name, hashed, user.id);
  } else {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name || user.name, user.id);
  }

  const updated = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(user.id);
  res.json(updated);
});

module.exports = router;
