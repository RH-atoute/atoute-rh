// services/email.js — Envoi d'emails via Resend
require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'noreply@atoute.fr';
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Template HTML commun
const template = (contenu) => `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#F4F6FF;margin:0;padding:20px;}
  .container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);}
  .header{background:#1B2A6B;padding:20px 28px;display:flex;align-items:center;}
  .header-title{color:#E63946;font-size:22px;font-weight:800;letter-spacing:-0.5px;}
  .header-sub{color:rgba(255,255,255,.6);font-size:11px;margin-top:2px;}
  .body{padding:28px;}
  .body h2{color:#1B2A6B;font-size:18px;margin-bottom:8px;}
  .body p{color:#444;font-size:14px;line-height:1.6;margin-bottom:12px;}
  .btn{display:inline-block;background:#1B2A6B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;margin-top:8px;}
  .info-box{background:#EEF1FB;border-left:4px solid #1B2A6B;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;}
  .info-box p{margin:0;color:#1B2A6B;font-size:13px;}
  .footer{background:#F4F6FF;padding:16px 28px;text-align:center;font-size:11px;color:#888;}
  .footer a{color:#1B2A6B;}
</style></head><body>
<div class="container">
  <div class="header">
    <div>
      <div class="header-title">À TOUTE !</div>
      <div class="header-sub">Plateforme RH Livreurs</div>
    </div>
  </div>
  <div class="body">${contenu}</div>
  <div class="footer">
    A TOUTE SAS · SIRET 885 374 637 00035<br>
    35 Rue de la Fédération, 93100 Montreuil<br>
    <a href="${APP_URL}">Accéder à la plateforme</a>
  </div>
</div>
</body></html>`;

const emails = {

  // Bienvenue à l'inscription
  async bienvenue(user) {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: 'Bienvenue sur la plateforme À TOUTE !',
      html: template(`
        <h2>Bienvenue ${user.prenom} 👋</h2>
        <p>Votre compte livreur a été créé sur la plateforme RH de A TOUTE SAS.</p>
        <div class="info-box"><p>Prochaine étape : déposez vos documents (CNI, Kbis, RIB, URSSAF) pour que votre dossier soit validé.</p></div>
        <a href="${APP_URL}" class="btn">Accéder à mon espace →</a>
      `)
    });
  },

  // Dossier validé → accès formation
  async dossierValide(user) {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: '✅ Votre dossier a été validé — À TOUTE',
      html: template(`
        <h2>Dossier validé, ${user.prenom} !</h2>
        <p>L'équipe A TOUTE a validé l'ensemble de vos documents. Vous passez maintenant en phase de formation.</p>
        <div class="info-box"><p>Connectez-vous à votre espace pour consulter vos fiches de formation.</p></div>
        <a href="${APP_URL}" class="btn">Voir ma formation →</a>
      `)
    });
  },

  // Contrat mensuel disponible
  async contratDisponible(user, mois, annee) {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: `📄 Votre contrat ${mois}/${annee} est disponible — À TOUTE`,
      html: template(`
        <h2>Contrat ${mois}/${annee} à signer</h2>
        <p>Bonjour ${user.prenom}, votre contrat de prestation pour ${moisLabel(mois)} ${annee} est disponible.</p>
        <div class="info-box"><p>⚠️ Vous devez signer ce contrat pour accéder à votre QR code de pointage.</p></div>
        <a href="${APP_URL}" class="btn">Signer mon contrat →</a>
      `)
    });
  },

  // Facture émise
  async factureEmise(user, facture) {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: `🧾 Facture ${facture.numero} émise — À TOUTE`,
      html: template(`
        <h2>Votre facture est disponible</h2>
        <p>Bonjour ${user.prenom}, votre facture pour ${moisLabel(facture.mois)} ${facture.annee} a été générée.</p>
        <div class="info-box">
          <p><strong>Référence :</strong> ${facture.numero}<br>
          <strong>Heures :</strong> ${facture.heures}h<br>
          <strong>Montant :</strong> ${Number(facture.montant_ht).toFixed(2)} € HT<br>
          <strong>Paiement :</strong> Sous 15 jours</p>
        </div>
        <a href="${APP_URL}" class="btn">Télécharger ma facture →</a>
      `)
    });
  },

  // Alerte document expirant
  async documentExpire(user, typeDoc, joursRestants) {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: `⚠️ Document à renouveler — ${typeDoc} — À TOUTE`,
      html: template(`
        <h2>Document à renouveler</h2>
        <p>Bonjour ${user.prenom}, votre <strong>${typeDoc}</strong> expire dans <strong>${joursRestants} jours</strong>.</p>
        <div class="info-box"><p>Déposez un document à jour dans votre espace avant l'expiration pour éviter toute suspension.</p></div>
        <a href="${APP_URL}" class="btn">Mettre à jour →</a>
      `)
    });
  },

  // Relance contrat non signé
  async relanceContrat(user, mois, annee) {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: `🔔 Rappel : contrat ${moisLabel(mois)} ${annee} non signé — À TOUTE`,
      html: template(`
        <h2>Rappel : contrat en attente</h2>
        <p>Bonjour ${user.prenom}, votre contrat de ${moisLabel(mois)} ${annee} n'a pas encore été signé.</p>
        <div class="info-box"><p>Sans signature, vous ne pouvez pas accéder à votre QR code de pointage.</p></div>
        <a href="${APP_URL}" class="btn">Signer maintenant →</a>
      `)
    });
  },

  // Notification admin — nouveau dossier
  async nouveauDossierAdmin(adminEmail, livreur) {
    await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: `📋 Nouveau dossier à valider — ${livreur.prenom} ${livreur.nom}`,
      html: template(`
        <h2>Nouveau dossier d'inscription</h2>
        <p><strong>${livreur.prenom} ${livreur.nom}</strong> vient de déposer son dossier et attend votre validation.</p>
        <a href="${APP_URL}" class="btn">Consulter le dossier →</a>
      `)
    });
  },
};

function moisLabel(m) {
  return ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][m];
}

module.exports = emails;
