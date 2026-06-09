// routes/factures.js — Génération et suivi des factures
const router = require('express').Router();
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');
const emails = require('../services/email');

// GET /api/factures — Liste des factures
router.get('/', auth, async (req, res) => {
  try {
    let q = `
      SELECT f.id, f.numero, f.annee, f.mois, f.heures, f.taux, f.montant_ht,
             f.statut, f.emise_le, f.payee_le,
             u.prenom||' '||u.nom AS livreur, u.id AS user_id
      FROM factures f JOIN users u ON u.id=f.user_id`;
    const params = [];
    if (req.user.role === 'livreur') {
      q += ' WHERE f.user_id=$1'; params.push(req.user.id);
    }
    q += ' ORDER BY f.annee DESC, f.mois DESC, u.nom ASC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/factures/emettre — Émettre les factures du mois (admin)
router.post('/emettre', auth, adminOnly, async (req, res) => {
  const now = new Date();
  const annee = req.body.annee || now.getFullYear();
  const mois  = req.body.mois  || now.getMonth() + 1;
  try {
    const { rows: livreurs } = await pool.query(
      "SELECT id, email, prenom, nom, taux_horaire, siret, iban FROM users WHERE role='livreur' AND statut='actif'"
    );

    const emises = [];
    for (const lv of livreurs) {
      // Récupérer les heures du mois depuis les pointages
      const heuresRes = await pool.query(
        `SELECT ROUND(SUM(EXTRACT(EPOCH FROM (s.horodatage - e.horodatage))/3600)::numeric, 2) AS heures
         FROM (SELECT DATE(horodatage) jour, MAX(horodatage) AS horodatage FROM pointages WHERE user_id=$1 AND type='entree' AND EXTRACT(YEAR FROM horodatage)=$2 AND EXTRACT(MONTH FROM horodatage)=$3 GROUP BY jour) e
         JOIN (SELECT DATE(horodatage) jour, MAX(horodatage) AS horodatage FROM pointages WHERE user_id=$1 AND type='sortie' AND EXTRACT(YEAR FROM horodatage)=$2 AND EXTRACT(MONTH FROM horodatage)=$3 GROUP BY jour) s ON e.jour=s.jour`,
        [lv.id, annee, mois]
      );

      const heures = parseFloat(heuresRes.rows[0]?.heures || 0);
      if (heures <= 0) continue; // Pas d'heures = pas de facture

      const taux = parseFloat(lv.taux_horaire);
      const montant = Math.round(heures * taux * 100) / 100;
      const initiales = `${lv.prenom[0]}${lv.nom[0]}`.toUpperCase();
      const numero = `FAC-${annee}-${String(mois).padStart(2,'0')}-${initiales}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

      const { rows } = await pool.query(
        `INSERT INTO factures (user_id, numero, annee, mois, heures, taux, montant_ht, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'emise')
         ON CONFLICT DO NOTHING RETURNING *`,
        [lv.id, numero, annee, mois, heures, taux, montant]
      );

      if (rows.length) {
        emails.factureEmise(lv, rows[0]).catch(console.error);
        emises.push({ livreur: `${lv.prenom} ${lv.nom}`, facture: rows[0] });
      }
    }

    res.json({
      message: `${emises.length} factures émises`,
      factures: emises
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/factures/:id/payer — Marquer comme payé (admin)
router.post('/:id/payer', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE factures SET statut='payee', payee_le=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/factures/stats — Stats financières (admin)
router.get('/stats', auth, adminOnly, async (req, res) => {
  const { annee, mois } = req.query;
  try {
    const q = `
      SELECT
        COUNT(*) AS nb_factures,
        SUM(montant_ht) AS total_ht,
        SUM(heures) AS total_heures,
        COUNT(*) FILTER (WHERE statut='payee') AS nb_payees,
        SUM(montant_ht) FILTER (WHERE statut='payee') AS montant_paye
      FROM factures
      WHERE ($1::int IS NULL OR annee=$1) AND ($2::int IS NULL OR mois=$2)`;
    const { rows } = await pool.query(q, [annee || null, mois || null]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
