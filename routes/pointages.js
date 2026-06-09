// routes/pointages.js — Système de pointage QR
const router = require('express').Router();
const QRCode = require('qrcode');
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');

// Codes QR valides pour chaque dépôt (vérifiés côté serveur)
const CODES_DEPOTS = {
  'ATOUTE-MONTREUIL-2026':  'montreuil',
  'ATOUTE-COURBEVOIE-2026': 'courbevoie',
};

// GET /api/pointages/qr/:depot — Générer l'image QR du local (admin)
router.get('/qr/:depot', auth, adminOnly, async (req, res) => {
  const depot = req.params.depot;
  const codes = { montreuil: 'ATOUTE-MONTREUIL-2026', courbevoie: 'ATOUTE-COURBEVOIE-2026' };
  if (!codes[depot]) return res.status(400).json({ error: 'Dépôt inconnu' });
  try {
    const png = await QRCode.toBuffer(codes[depot], {
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#1B2A6B', light: '#FFFFFF' }
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) { res.status(500).json({ error: 'Erreur génération QR' }); }
});

// POST /api/pointages/scanner — Enregistrer un pointage par scan QR
router.post('/scanner', auth, async (req, res) => {
  const { code_qr, type } = req.body;
  if (!code_qr || !type) return res.status(400).json({ error: 'Code QR et type requis' });

  const typesValides = ['entree', 'pause', 'reprise', 'sortie'];
  if (!typesValides.includes(type)) return res.status(400).json({ error: 'Type de pointage invalide' });

  // Vérifier le code QR
  const depot = CODES_DEPOTS[code_qr];
  if (!depot) return res.status(400).json({ error: 'QR code non reconnu — ce n\'est pas un QR A TOUTE valide' });

  // Vérifier que le livreur est actif et contrat signé
  if (req.user.role === 'livreur') {
    if (req.user.statut !== 'actif') {
      return res.status(403).json({ error: 'Compte non actif — contactez l\'administration' });
    }
    const contrat = await pool.query(
      "SELECT id FROM contrats WHERE user_id=$1 AND statut='signe' AND mois=EXTRACT(MONTH FROM NOW()) AND annee=EXTRACT(YEAR FROM NOW())",
      [req.user.id]
    );
    if (!contrat.rows.length) {
      return res.status(403).json({ error: 'Contrat du mois non signé — signez votre contrat avant de pointer' });
    }
  }

  try {
    // Vérification logique de séquence (pas deux entrées d'affilée, etc.)
    const dernier = await pool.query(
      `SELECT type FROM pointages
       WHERE user_id=$1 AND horodatage::date = CURRENT_DATE
       ORDER BY horodatage DESC LIMIT 1`,
      [req.user.id]
    );

    if (dernier.rows.length) {
      const precedent = dernier.rows[0].type;
      if (precedent === 'sortie' && type !== 'entree') {
        return res.status(400).json({ error: 'Vous avez déjà pointé une sortie aujourd\'hui' });
      }
      if (precedent === type && type !== 'pause') {
        return res.status(400).json({ error: `Vous avez déjà enregistré une ${type} aujourd\'hui` });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO pointages (user_id, type, depot, source)
       VALUES ($1,$2,$3,'qr') RETURNING *`,
      [req.user.id, type, depot]
    );

    res.status(201).json({
      pointage: rows[0],
      message: `${type.charAt(0).toUpperCase()+type.slice(1)} enregistrée à ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}`,
      depot,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/pointages/manuel — Pointage manuel (admin)
router.post('/manuel', auth, adminOnly, async (req, res) => {
  const { user_id, type, depot, horodatage, note } = req.body;
  if (!user_id || !type || !depot) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO pointages (user_id, type, depot, source, note, created_by, horodatage)
       VALUES ($1,$2,$3,'manuel',$4,$5,$6) RETURNING *`,
      [user_id, type, depot, note || null, req.user.id, horodatage || new Date()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/pointages/journal — Journal du jour (admin = tous, livreur = soi)
router.get('/journal', auth, async (req, res) => {
  const { date, user_id, depot } = req.query;
  const dateFiltre = date || new Date().toISOString().split('T')[0];
  try {
    let q = `
      SELECT p.id, p.type, p.depot, p.source, p.note, p.horodatage,
             u.prenom||' '||u.nom AS livreur, u.id AS user_id
      FROM pointages p JOIN users u ON u.id=p.user_id
      WHERE p.horodatage::date=$1`;
    const params = [dateFiltre];

    if (req.user.role === 'livreur') {
      params.push(req.user.id); q += ` AND p.user_id=$${params.length}`;
    } else {
      if (user_id) { params.push(user_id); q += ` AND p.user_id=$${params.length}`; }
      if (depot)   { params.push(depot);   q += ` AND p.depot=$${params.length}`; }
    }
    q += ' ORDER BY p.horodatage ASC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/pointages/recap/:userId/:annee/:mois — Récapitulatif mensuel
router.get('/recap/:userId/:annee/:mois', auth, async (req, res) => {
  const { userId, annee, mois } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== userId) return res.status(403).json({ error: 'Accès refusé' });
  try {
    // Calcul des heures effectives par jour (entrée - sorties - pauses)
    const { rows } = await pool.query(
      `WITH jours AS (
        SELECT DATE(horodatage) AS jour,
               MAX(CASE WHEN type='entree' THEN horodatage END) AS entree,
               MAX(CASE WHEN type='sortie' THEN horodatage END) AS sortie
        FROM pointages
        WHERE user_id=$1
          AND EXTRACT(YEAR FROM horodatage)=$2
          AND EXTRACT(MONTH FROM horodatage)=$3
        GROUP BY DATE(horodatage)
      )
      SELECT jour, entree, sortie,
             ROUND(EXTRACT(EPOCH FROM (sortie - entree))/3600, 2) AS heures
      FROM jours WHERE entree IS NOT NULL
      ORDER BY jour`,
      [userId, annee, mois]
    );

    const totalHeures = rows.reduce((s, r) => s + (parseFloat(r.heures) || 0), 0);

    // Récupérer le taux du livreur
    const user = await pool.query('SELECT taux_horaire, prenom, nom FROM users WHERE id=$1', [userId]);
    const taux = parseFloat(user.rows[0]?.taux_horaire || 15);

    res.json({
      jours: rows,
      total_heures: Math.round(totalHeures * 100) / 100,
      taux,
      montant: Math.round(totalHeures * taux * 100) / 100,
      livreur: user.rows[0]
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
