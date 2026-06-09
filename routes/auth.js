// routes/auth.js — Authentification
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const emails = require('../services/email');

// POST /api/auth/register — Inscription livreur
router.post('/register', async (req, res) => {
  const { prenom, nom, email, telephone, siret, password } = req.body;
  if (!prenom || !nom || !email || !password) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min)' });
  try {
    const existe = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existe.rows.length) return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, prenom, nom, telephone, siret, statut)
       VALUES ($1,$2,'livreur',$3,$4,$5,$6,'inscription')
       RETURNING id, email, role, prenom, nom, statut`,
      [email.toLowerCase(), hash, prenom, nom, telephone || null, siret || null]
    );
    const user = rows[0];

    // Créer fiche formation vide
    await pool.query('INSERT INTO formations (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);

    // Email de bienvenue (non bloquant)
    emails.bienvenue(user).catch(console.error);

    // Notifier admin
    const admin = await pool.query("SELECT email FROM users WHERE role='admin' LIMIT 1");
    if (admin.rows.length) emails.nouveauDossierAdmin(admin.rows[0].email, user).catch(console.error);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, role, prenom, nom, depot, statut, taux_horaire, contrat_signe FROM users WHERE email=$1',
      [email.toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me — Profil courant
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/password — Changement de mot de passe
router.put('/password', auth, async (req, res) => {
  const { current, nouveau } = req.body;
  if (!current || !nouveau || nouveau.length < 8) {
    return res.status(400).json({ error: 'Mot de passe invalide (8 caractères min)' });
  }
  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(current, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const hash = await bcrypt.hash(nouveau, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
