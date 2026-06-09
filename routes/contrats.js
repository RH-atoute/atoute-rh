// routes/contrats.js — Gestion des contrats mensuels
const router = require('express').Router();
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');
const emails = require('../services/email');

const MOIS_LABELS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// GET /api/contrats — Liste des contrats (admin: tous, livreur: les siens)
router.get('/', auth, async (req, res) => {
  try {
    let q = `
      SELECT c.id, c.annee, c.mois, c.taux, c.depot, c.statut, c.signe_le, c.created_at,
             u.prenom||' '||u.nom AS livreur, u.id AS user_id, u.email
      FROM contrats c JOIN users u ON u.id=c.user_id`;
    const params = [];
    if (req.user.role === 'livreur') {
      q += ' WHERE c.user_id=$1'; params.push(req.user.id);
    }
    q += ' ORDER BY c.annee DESC, c.mois DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/contrats/generer — Générer les contrats du mois (admin)
router.post('/generer', auth, adminOnly, async (req, res) => {
  const now = new Date();
  const annee = req.body.annee || now.getFullYear();
  const mois  = req.body.mois  || (now.getMonth() + 1);
  try {
    // Récupérer tous les livreurs actifs
    const { rows: livreurs } = await pool.query(
      "SELECT id, email, prenom, nom, taux_horaire, depot FROM users WHERE role='livreur' AND statut='actif'"
    );

    const generes = [];
    for (const lv of livreurs) {
      // Upsert contrat
      const { rows } = await pool.query(
        `INSERT INTO contrats (user_id, annee, mois, taux, depot, statut)
         VALUES ($1,$2,$3,$4,$5,'envoye')
         ON CONFLICT (user_id, annee, mois) DO UPDATE SET taux=EXCLUDED.taux
         RETURNING *`,
        [lv.id, annee, mois, lv.taux_horaire, lv.depot]
      );
      // Marquer contrat_signe=false pour ce mois
      await pool.query(
        'UPDATE users SET contrat_signe=FALSE WHERE id=$1',
        [lv.id]
      );
      // Email non bloquant
      emails.contratDisponible(lv, mois, annee).catch(console.error);
      generes.push({ livreur: `${lv.prenom} ${lv.nom}`, contrat: rows[0] });
    }

    res.json({
      message: `${generes.length} contrats générés pour ${MOIS_LABELS[mois]} ${annee}`,
      contrats: generes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/contrats/:id/signer — Signer un contrat (livreur)
router.post('/:id/signer', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM contrats WHERE id=$1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contrat introuvable' });
    const contrat = rows[0];

    if (req.user.role !== 'admin' && req.user.id !== contrat.user_id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (contrat.statut === 'signe') {
      return res.status(400).json({ error: 'Contrat déjà signé' });
    }

    await pool.query(
      "UPDATE contrats SET statut='signe', signe_le=NOW() WHERE id=$1",
      [req.params.id]
    );
    await pool.query(
      'UPDATE users SET contrat_signe=TRUE, contrat_signe_le=NOW() WHERE id=$1',
      [contrat.user_id]
    );

    res.json({
      message: `Contrat signé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`,
      signe_le: new Date()
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/contrats/:id/relancer — Relancer un livreur (admin)
router.post('/:id/relancer', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.email, u.prenom, u.nom
       FROM contrats c JOIN users u ON u.id=c.user_id WHERE c.id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contrat introuvable' });
    const c = rows[0];
    emails.relanceContrat({ email: c.email, prenom: c.prenom }, c.mois, c.annee).catch(console.error);
    res.json({ message: `Email de relance envoyé à ${c.prenom} ${c.nom}` });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/contrats/mois-courant — Contrat du mois en cours pour le livreur connecté
router.get('/mois-courant', auth, async (req, res) => {
  const now = new Date();
  try {
    const { rows } = await pool.query(
      `SELECT * FROM contrats WHERE user_id=$1 AND annee=$2 AND mois=$3`,
      [req.user.id, now.getFullYear(), now.getMonth() + 1]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
