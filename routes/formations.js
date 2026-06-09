// routes/formations.js — Suivi des fiches de formation
const router = require('express').Router();
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/formations — Toutes les formations (admin) ou la sienne (livreur)
router.get('/', auth, async (req, res) => {
  try {
    let q = `
      SELECT f.*, u.prenom||' '||u.nom AS livreur, u.id AS user_id, u.statut
      FROM formations f JOIN users u ON u.id=f.user_id`;
    const params = [];
    if (req.user.role === 'livreur') {
      q += ' WHERE f.user_id=$1'; params.push(req.user.id);
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/formations/:userId — Mettre à jour une fiche (admin)
router.put('/:userId', auth, adminOnly, async (req, res) => {
  const {
    fiche_adaptation, fiche_parcours, fiche_terrain,
    notes_adaptation, notes_parcours, notes_terrain
  } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE formations SET
         fiche_adaptation=$1, fiche_parcours=$2, fiche_terrain=$3,
         notes_adaptation=$4, notes_parcours=$5, notes_terrain=$6,
         updated_at=NOW()
       WHERE user_id=$7 RETURNING *`,
      [fiche_adaptation, fiche_parcours, fiche_terrain,
       notes_adaptation, notes_parcours, notes_terrain, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Formation introuvable' });

    // Si les 3 fiches validées → passer en actif
    if (fiche_adaptation && fiche_parcours && fiche_terrain) {
      await pool.query(
        `UPDATE formations SET valide_par=$1, valide_le=NOW() WHERE user_id=$2`,
        [req.user.id, req.params.userId]
      );
      await pool.query(
        "UPDATE users SET statut='actif', updated_at=NOW() WHERE id=$1 AND statut='formation'",
        [req.params.userId]
      );
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
