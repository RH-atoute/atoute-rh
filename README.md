# À TOUTE — Plateforme RH Livreurs
## Guide de déploiement complet — zéro à production

---

## 📁 Structure du projet

```
atoute-backend/
├── server.js              ← Point d'entrée principal
├── package.json           ← Dépendances
├── .env.example           ← Variables d'environnement (à copier en .env)
├── db/
│   ├── pool.js            ← Connexion PostgreSQL
│   └── init.js            ← Création des tables
├── middleware/
│   └── auth.js            ← Vérification JWT
├── routes/
│   ├── auth.js            ← Login / Register
│   ├── livreurs.js        ← Gestion livreurs
│   ├── documents.js       ← Upload documents
│   ├── pointages.js       ← Scan QR / pointage
│   ├── contrats.js        ← Contrats mensuels
│   ├── factures.js        ← Factures
│   └── formations.js      ← Fiches formation
├── services/
│   └── email.js           ← Envoi emails Resend
├── public/
│   └── index.html         ← (coller ici le fichier HTML de la plateforme)
└── uploads/               ← Documents livreurs (créé automatiquement)
```

---

## 🚀 Étape 1 — GitHub (gratuit, 5 minutes)

1. Allez sur **github.com** → créez un compte
2. Cliquez sur **"New repository"**
3. Nommez-le `atoute-rh` → Public ou Private → **Create**
4. Sur votre ordinateur, installez **Git** : git-scm.com/downloads
5. Ouvrez un terminal dans le dossier `atoute-backend/` et tapez :

```bash
git init
git add .
git commit -m "Initial commit - A TOUTE RH Platform"
git branch -M main
git remote add origin https://github.com/VOTRE_NOM/atoute-rh.git
git push -u origin main
```

---

## 🗄️ Étape 2 — Railway (hébergement + base de données)

1. Allez sur **railway.app** → **"Start a New Project"**
2. Connectez avec votre compte GitHub
3. Cliquez **"Deploy from GitHub repo"** → sélectionnez `atoute-rh`

### Ajouter la base de données PostgreSQL :
4. Dans votre projet Railway, cliquez **"+ New"** → **"Database"** → **"PostgreSQL"**
5. Railway crée la BDD automatiquement
6. Cliquez sur la base → onglet **"Variables"** → copiez la valeur de `DATABASE_URL`

### Configurer les variables d'environnement :
7. Cliquez sur votre service Node.js → **"Variables"** → **"Raw Editor"**
8. Collez et remplissez :

```
DATABASE_URL=postgresql://... (copiée depuis PostgreSQL)
JWT_SECRET=générez une clé longue sur: randomkeygen.com
RESEND_API_KEY=re_votre_clé (voir étape 3)
RESEND_FROM=noreply@atoute.fr
NODE_ENV=production
FRONTEND_URL=https://votre-app.up.railway.app
```

9. Railway redéploie automatiquement ✅

---

## 📧 Étape 3 — Resend (emails automatiques, gratuit)

1. Allez sur **resend.com** → créez un compte gratuit
2. **"API Keys"** → **"Create API Key"** → copiez la clé
3. Collez-la dans Railway : `RESEND_API_KEY=re_VOTRE_CLE`
4. (Optionnel) Vérifiez votre domaine pour envoyer depuis `@atoute.fr`
   - **"Domains"** → **"Add Domain"** → suivez les instructions DNS

---

## 🗃️ Étape 4 — Initialiser la base de données

Dans le terminal Railway ou en local (avec DATABASE_URL dans .env) :

```bash
node db/init.js
```

Cela crée toutes les tables et un compte admin par défaut :
- **Email :** admin@atoute.fr
- **Mot de passe :** Admin@AToute2026
- ⚠️ **Changez ce mot de passe immédiatement après connexion !**

---

## 🌐 Étape 5 — Mettre le frontend en ligne

1. Copiez votre fichier `atoute_platform.html` dans le dossier `public/`
2. Renommez-le `index.html`
3. Modifiez le fichier pour que les appels API pointent vers votre backend :

Au début du `<script>` dans index.html, ajoutez :
```javascript
const API_URL = 'https://votre-app.up.railway.app/api';
```

4. Poussez sur GitHub :
```bash
git add public/index.html
git commit -m "Ajout frontend"
git push
```

Railway redéploie automatiquement ✅

---

## 🔗 Étape 6 — Nom de domaine (optionnel, ~10 €/an)

1. Achetez `atoute.fr` ou `rh.atoute.fr` sur **ovh.com** ou **namecheap.com**
2. Dans Railway → votre service → **"Settings"** → **"Custom Domain"**
3. Entrez votre domaine → Railway vous donne un enregistrement CNAME
4. Ajoutez ce CNAME chez votre registrar
5. Attendez 1-24h pour la propagation DNS

---

## 🔌 API — Points d'accès disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/register` | Inscription livreur |
| POST | `/api/auth/login` | Connexion |
| GET | `/api/auth/me` | Profil connecté |
| GET | `/api/livreurs` | Liste livreurs (admin) |
| PUT | `/api/livreurs/:id/taux` | Modifier taux (admin) |
| POST | `/api/livreurs/:id/valider` | Valider dossier (admin) |
| POST | `/api/documents/upload` | Déposer un document |
| GET | `/api/documents/:userId` | Liste documents |
| PUT | `/api/documents/:docId/valider` | Valider document (admin) |
| GET | `/api/pointages/qr/:depot` | Image QR du local (admin) |
| POST | `/api/pointages/scanner` | Enregistrer scan QR |
| GET | `/api/pointages/journal` | Journal du jour |
| GET | `/api/pointages/recap/:id/:annee/:mois` | Récap mensuel |
| POST | `/api/contrats/generer` | Générer contrats du mois |
| POST | `/api/contrats/:id/signer` | Signer un contrat |
| POST | `/api/factures/emettre` | Émettre factures du mois |
| POST | `/api/factures/:id/payer` | Marquer payé (admin) |
| PUT | `/api/formations/:userId` | Mettre à jour formation |
| GET | `/api/health` | Santé du serveur |

---

## 💰 Budget mensuel

| Service | Coût |
|---------|------|
| Railway (hébergement + BDD) | 0 – 5 $/mois |
| Resend (emails) | 0 €/mois (3 000 gratuits) |
| Nom de domaine | ~0,80 €/mois |
| **Total** | **~5 – 10 €/mois** |

---

## 🆘 Support

En cas de problème, vérifiez dans cet ordre :
1. **Logs Railway** → votre service → onglet "Logs"
2. **Variables d'environnement** → sont-elles toutes renseignées ?
3. **Base de données** → `node db/init.js` a-t-il été exécuté ?
4. **Resend** → la clé API est-elle valide ?

---

*A TOUTE SAS · SIRET 885 374 637 00035 · APE 49.41B · 35 Rue de la Fédération, 93100 Montreuil*
