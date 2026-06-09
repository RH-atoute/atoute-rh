// middleware/auth.js — Vérification JWT
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// Vérification du token JWT
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant ou invalide' });
    }
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, email, role, prenom, nom, depot, statut, taux_horaire FROM users WHERE id=$1',
      [payload.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'Utilisateur introuvable' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// Réservé à l'admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé à l\'administration' });
  }
  next();
};

module.exports = { auth, adminOnly };
