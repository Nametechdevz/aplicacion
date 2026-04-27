const jwt = require('jsonwebtoken');
const db = require('../database');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.users.findById(decoded.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    const { password, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const adminOnly = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    next();
  });
};

module.exports = { auth, adminOnly };
