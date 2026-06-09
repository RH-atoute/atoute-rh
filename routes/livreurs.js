// routes/livreurs.js — Gestion des livreurs
const router = require('express').Router();
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');
const emails = require('../services/email');

// GET /api/livreurs — Liste (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { depot, statut } = req.query;
    let q = `SELECT id, email, prenom, nom, siret, depot, statut, taux_horaire, contrat_signe, created_at FROM users WHERE role='livreur'`;
    const params = [];
    if (depot) { params.push(depot); q += ` AND depot=$${params.length}`; }
    if (statut) { params.push(statut); q += ` AND statut=$${params.length}`; }
    q += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/livreurs/:id — Profil complet
router.get('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.prenom, u.nom, u.telephone, u.siret, u.iban, u.depot,
              u.statut, u.taux_horaire, u.contrat_signe, u.contrat_signe_le, u.created_at,
              f.fiche_adaptation, f.fiche_parcours, f.fiche_terrain
       FROM users u
       LEFT JOIN formations f ON f.user_id = u.id
       WHERE u.id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Livreur introuvable' });

    // Documents
    const docs = await pool.query(
      'SELECT type, statut, expire_le FROM documents WHERE user_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ ...rows[0], documents: docs.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/livreurs/:id — Mise à jour profil
router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const { prenom, nom, telephone, siret, iban, depot } = req.body;
  try {
    await pool.query(
      `UPDATE users SET prenom=$1, nom=$2, telephone=$3, siret=$4, iban=$5, depot=$6, updated_at=NOW()
       WHERE id=$7`,
      [prenom, nom, telephone, siret, iban, depot, req.params.id]
    );
    res.json({ message: 'Profil mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/livreurs/:id/valider — Valider dossier (admin)
router.post('/:id/valider', auth, adminOnly, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET statut='formation', updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    emails.dossierValide(rows[0]).catch(console.error);
    res.json({ message: 'Dossier validé, livreur en formation' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/livreurs/:id/activer — Activer en poste (admin)
router.post('/:id/activer', auth, adminOnly, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET statut='actif', updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );
    res.json({ message: 'Livreur activé en poste' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/livreurs/:id/taux — Modifier taux horaire (admin)
router.put('/:id/taux', auth, adminOnly, async (req, res) => {
  const { taux, motif } = req.body;
  if (!taux || taux < 10) return res.status(400).json({ error: 'Taux invalide (min 10 €/h)' });
  if (!motif) return res.status(400).json({ error: 'Motif obligatoire' });
  try {
    const ancienTaux = await pool.query('SELECT taux_horaire FROM users WHERE id=$1', [req.params.id]);
    const delta = taux - ancienTaux.rows[0].taux_horaire;
    await pool.query('UPDATE users SET taux_horaire=$1, updated_at=NOW() WHERE id=$2', [taux, req.params.id]);
    await pool.query(
      'INSERT INTO modulations (user_id, delta, motif, applique_par) VALUES ($1,$2,$3,$4)',
      [req.params.id, delta, motif, req.user.id]
    );
    res.json({ message: `Taux mis à jour: ${taux} €/h`, delta });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/livreurs/:id/modulations — Historique des modulations
router.get('/:id/modulations', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.delta, m.motif, m.created_at, u.prenom||' '||u.nom AS applique_par
       FROM modulations m JOIN users u ON u.id=m.applique_par
       WHERE m.user_id=$1 ORDER BY m.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
