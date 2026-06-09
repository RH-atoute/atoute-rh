// routes/documents.js — Upload et validation de documents
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');

const TYPES_VALIDES = ['cni', 'kbis', 'rib', 'urssaf', 'autre'];
const FORMATS_VALIDES = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_PATH || './uploads';

// POST /api/documents/upload — Dépôt d'un document
router.post('/upload', auth, async (req, res) => {
  if (!req.files || !req.files.fichier) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }
  const { type, user_id } = req.body;
  const cible = user_id && req.user.role === 'admin' ? user_id : req.user.id;

  if (!TYPES_VALIDES.includes(type)) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }

  const fichier = req.files.fichier;
  const ext = path.extname(fichier.name).toLowerCase();
  if (!FORMATS_VALIDES.includes(ext)) {
    return res.status(400).json({ error: 'Format non accepté (PDF, JPG, PNG uniquement)' });
  }
  if (fichier.size > MAX_SIZE) {
    return res.status(400).json({ error: `Fichier trop lourd (max ${process.env.MAX_FILE_SIZE_MB || 10} Mo)` });
  }

  // Dossier par user
  const dossier = path.join(UPLOAD_DIR, cible);
  if (!fs.existsSync(dossier)) fs.mkdirSync(dossier, { recursive: true });

  const nomFichier = `${type}_${Date.now()}${ext}`;
  const chemin = path.join(dossier, nomFichier);

  try {
    await fichier.mv(chemin);

    // Supprimer l'ancien document du même type s'il existe
    await pool.query(
      "DELETE FROM documents WHERE user_id=$1 AND type=$2 AND statut != 'valide'",
      [cible, type]
    );

    // Calculer date d'expiration (URSSAF: 3 mois, Kbis: 3 mois, autres: 1 an)
    const expireIn = ['urssaf', 'kbis'].includes(type) ? 90 : 365;
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + expireIn);

    const { rows } = await pool.query(
      `INSERT INTO documents (user_id, type, nom_fichier, chemin, statut, expire_le)
       VALUES ($1,$2,$3,$4,'en_attente',$5) RETURNING *`,
      [cible, type, fichier.name, chemin, expireDate.toISOString().split('T')[0]]
    );

    // Vérifier si tous les docs requis sont déposés → passer en statut 'dossier'
    const requis = ['cni', 'kbis', 'rib', 'urssaf'];
    const depose = await pool.query(
      "SELECT DISTINCT type FROM documents WHERE user_id=$1 AND statut IN ('en_attente','valide')",
      [cible]
    );
    const typesDeposes = depose.rows.map(r => r.type);
    const complet = requis.every(t => typesDeposes.includes(t));

    if (complet) {
      await pool.query(
        "UPDATE users SET statut='dossier', updated_at=NOW() WHERE id=$1 AND statut='inscription'",
        [cible]
      );
    }

    res.status(201).json({ document: rows[0], dossierComplet: complet });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

// GET /api/documents/:userId — Liste des documents d'un livreur
router.get('/:userId', auth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.userId) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.type, d.nom_fichier, d.statut, d.expire_le, d.created_at,
              u.prenom||' '||u.nom AS valide_par_nom
       FROM documents d
       LEFT JOIN users u ON u.id = d.valide_par
       WHERE d.user_id=$1
       ORDER BY d.type, d.created_at DESC`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/documents/:docId/valider — Valider un document (admin)
router.put('/:docId/valider', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE documents SET statut='valide', valide_par=$1, valide_le=NOW()
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.docId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document introuvable' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/documents/:docId/rejeter — Rejeter un document (admin)
router.put('/:docId/rejeter', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE documents SET statut='rejete' WHERE id=$1 RETURNING *",
      [req.params.docId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document introuvable' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/documents/fichier/:docId — Télécharger un fichier (admin ou propriétaire)
router.get('/fichier/:docId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id=$1', [req.params.docId]);
    if (!rows.length) return res.status(404).json({ error: 'Document introuvable' });
    const doc = rows[0];
    if (req.user.role !== 'admin' && req.user.id !== doc.user_id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (!fs.existsSync(doc.chemin)) return res.status(404).json({ error: 'Fichier non trouvé sur le serveur' });
    res.download(doc.chemin, doc.nom_fichier);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
