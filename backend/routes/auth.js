const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = db.users.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post('/register', (req, res) => {
  if (db.settings.get('allow_register') !== 'true')
    return res.status(403).json({ error: 'El registro está desactivado' });

  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  if (db.users.findByEmail(email)) return res.status(400).json({ error: 'El email ya está registrado' });

  const hashed = bcrypt.hashSync(password, 10);
  const user = db.users.create({ name, email, password: hashed });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

router.put('/profile', auth, (req, res) => {
  const { name, password, newPassword } = req.body;
  const user = db.users.findById(req.user.id);

  if (newPassword) {
    if (!password || !bcrypt.compareSync(password, user.password))
      return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.users.update(user.id, { name: name || user.name, password: hashed });
  } else {
    db.users.update(user.id, { name: name || user.name });
  }

  const updated = db.users.findById(user.id);
  res.json(publicUser(updated));
});

module.exports = router;
