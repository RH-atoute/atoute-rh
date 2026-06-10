// server.js — Serveur principal A TOUTE RH Platform
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const fileUpload = require('express-fileupload');
const path       = require('path');
const fs         = require('fs');

const app = express();

// ─── SÉCURITÉ ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: false,
}));
app.options('*', cors());

// Rate limiting — 100 requêtes / 15 min par IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes' }
}));

// Rate limiting strict sur l'auth — 10 tentatives / 15 min
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' }
}));

// ─── BODY PARSING & UPLOAD ───────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024 },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: '/tmp/',
}));

// ─── DOSSIER UPLOADS ─────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── ROUTES API ──────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/livreurs',   require('./routes/livreurs'));
app.use('/api/documents',  require('./routes/documents'));
app.use('/api/pointages',  require('./routes/pointages'));
app.use('/api/contrats',   require('./routes/contrats'));
app.use('/api/factures',   require('./routes/factures'));
app.use('/api/formations', require('./routes/formations'));

// ─── SANTÉ ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'A TOUTE RH Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── FRONTEND (fichier HTML statique) ────────────────────────────
// En production, Railway sert le fichier HTML de la plateforme
const frontendPath = path.join(__dirname, 'public');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ─── ERREUR GLOBALE ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err.message);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ─── DÉMARRAGE ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║     A TOUTE — Plateforme RH Livreurs      ║
  ║     Serveur démarré sur le port ${PORT}       ║
  ║     ${new Date().toLocaleString('fr-FR')}           ║
  ╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;
