// db/init.js — Initialisation de la base de données
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const schema = `

-- ─── EXTENSION UUID ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── UTILISATEURS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'livreur' CHECK (role IN ('admin','livreur')),
  prenom        VARCHAR(100),
  nom           VARCHAR(100),
  telephone     VARCHAR(20),
  siret         VARCHAR(20),
  iban          VARCHAR(40),
  depot         VARCHAR(20) DEFAULT 'montreuil' CHECK (depot IN ('montreuil','courbevoie')),
  taux_horaire  DECIMAL(5,2) DEFAULT 15.00,
  statut        VARCHAR(20) DEFAULT 'inscription' CHECK (statut IN ('inscription','dossier','formation','actif','suspendu')),
  contrat_signe BOOLEAN DEFAULT FALSE,
  contrat_signe_le TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ─── DOCUMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('cni','kbis','rib','urssaf','contrat','facture','autre')),
  nom_fichier VARCHAR(255),
  chemin      VARCHAR(500),
  statut      VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente','valide','expire','rejete')),
  valide_par  UUID REFERENCES users(id),
  valide_le   TIMESTAMP,
  expire_le   DATE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── POINTAGES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pointages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('entree','pause','reprise','sortie')),
  depot       VARCHAR(20) NOT NULL CHECK (depot IN ('montreuil','courbevoie')),
  horodatage  TIMESTAMP DEFAULT NOW(),
  source      VARCHAR(20) DEFAULT 'qr' CHECK (source IN ('qr','manuel','admin')),
  note        TEXT,
  created_by  UUID REFERENCES users(id)
);

-- ─── HEURES MENSUELLES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heures_mensuelles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  annee         INTEGER NOT NULL,
  mois          INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  heures_s1     DECIMAL(5,2) DEFAULT 0,
  heures_s2     DECIMAL(5,2) DEFAULT 0,
  heures_s3     DECIMAL(5,2) DEFAULT 0,
  heures_s4     DECIMAL(5,2) DEFAULT 0,
  total_heures  DECIMAL(5,2) GENERATED ALWAYS AS (heures_s1+heures_s2+heures_s3+heures_s4) STORED,
  taux_applique DECIMAL(5,2),
  montant_total DECIMAL(8,2) GENERATED ALWAYS AS ((heures_s1+heures_s2+heures_s3+heures_s4) * taux_applique) STORED,
  valide        BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, annee, mois)
);

-- ─── CONTRATS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contrats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  annee       INTEGER NOT NULL,
  mois        INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  taux        DECIMAL(5,2) NOT NULL,
  depot       VARCHAR(20),
  statut      VARCHAR(20) DEFAULT 'envoye' CHECK (statut IN ('envoye','signe','expire')),
  signe_le    TIMESTAMP,
  pdf_chemin  VARCHAR(500),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, annee, mois)
);

-- ─── FACTURES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  numero        VARCHAR(30) UNIQUE NOT NULL,
  annee         INTEGER NOT NULL,
  mois          INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  heures        DECIMAL(5,2),
  taux          DECIMAL(5,2),
  montant_ht    DECIMAL(8,2),
  statut        VARCHAR(20) DEFAULT 'emise' CHECK (statut IN ('emise','payee','annulee')),
  emise_le      TIMESTAMP DEFAULT NOW(),
  payee_le      TIMESTAMP,
  pdf_chemin    VARCHAR(500),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── FORMATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS formations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fiche_adaptation BOOLEAN DEFAULT FALSE,
  fiche_parcours   BOOLEAN DEFAULT FALSE,
  fiche_terrain    BOOLEAN DEFAULT FALSE,
  notes_adaptation TEXT,
  notes_parcours   TEXT,
  notes_terrain    TEXT,
  valide_par       UUID REFERENCES users(id),
  valide_le        TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── MODULATIONS TARIF ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       DECIMAL(4,2) NOT NULL,
  motif       TEXT NOT NULL,
  applique_par UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── NOTIFICATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  message     TEXT NOT NULL,
  lue         BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── INDEX ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pointages_user_date ON pointages(user_id, horodatage);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_heures_user_periode ON heures_mensuelles(user_id, annee, mois);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, lue);

-- ─── ADMIN PAR DÉFAUT ───────────────────────────────────────────
-- Mot de passe: Admin@AToute2026 (à changer immédiatement)
INSERT INTO users (email, password_hash, role, prenom, nom, statut)
VALUES (
  'admin@atoute.fr',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFqMHHK9LbOj/Hy',
  'admin', 'Gladstone', 'Admin', 'actif'
) ON CONFLICT (email) DO NOTHING;

`;

async function init() {
  console.log('🔧 Initialisation de la base de données A TOUTE...');
  try {
    await pool.query(schema);
    console.log('✅ Toutes les tables créées avec succès');
    console.log('👤 Admin par défaut: admin@atoute.fr / Admin@AToute2026');
    console.log('⚠️  Changez le mot de passe admin immédiatement !');
  } catch (err) {
    console.error('❌ Erreur init BDD:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();

module.exports = pool;
