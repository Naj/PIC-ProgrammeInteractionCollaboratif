# PIC — Programme d'Interaction Collaboratif

**by Majin** · Organisateur de tâches collaboratives, archivage et retours d'expérience.

Application web autonome : aucun build, aucune dépendance, aucun serveur. Tout tient dans
des fichiers statiques déposés à la racine, prêts pour Cloudflare Pages.

---

## Ce que fait l'application

**Tâches**
- Tableau reprenant la trame d'origine : Date, Sujet, Collaboration, Objectif, Date d'échéance, Action, Commentaire, REX.
- Saisie directe dans les cellules. `Tab` passe à la cellule suivante, `Échap` annule, `Ctrl+Entrée` valide un champ long.
- Tri sur n'importe quelle colonne (clic sur l'intitulé, second clic pour inverser). Le tri est mémorisé.
- Recherche plein texte, filtre par collaboration, filtre par échéance (en retard / aujourd'hui / sous 7 jours / sans échéance).
- Rail de couleur à gauche de chaque ligne : orange en retard, jaune aujourd'hui, bleu sous 7 jours, gris plus tard.

**Archivage et REX**
- Une case à cocher par ligne : la tâche part avec une animation et un son de validation.
- 7 secondes pour annuler via le bandeau qui s'affiche.
- L'onglet Archives présente chaque tâche close sous forme de fiche REX, avec le délai de traitement calculé.
- Le REX se rédige ou se corrige à tout moment. Une tâche archivée peut être réactivée.

**Impression**
- Bouton *Imprimer* : A4 paysage, mise en page identique au tableau d'origine (titre encadré, bloc noir « by Majin »).
- Le contenu est automatiquement mis à l'échelle pour tenir sur **une seule page**.
- Des lignes vides sont ajoutées pour compléter à la main.
- Ce qui est imprimé correspond aux filtres actifs à l'écran.

**Tableau de bord**
- Cinq indicateurs : en cours, en retard, sous 7 jours, archivées, taux de réalisation et délai moyen.
- Répartition par collaboration (en cours / archivées), activité sur 6 mois, état des échéances, prochaines échéances cliquables.

**Réglages**
- Renommage de chaque intitulé de colonne, masquage à l'écran comme à l'impression.
- Rappels d'échéance : bandeau dans l'application + notification système si autorisée. Délai réglable (jour même à 7 jours avant).
- Son de validation, affichage compact.
- Export JSON (sauvegarde complète), export CSV (point-virgule, ouvrable dans Excel), import JSON.

**Synchronisation multi-appareils**
- Un même **code d'espace** saisi sur plusieurs appareils suffit : tout se retrouve.
- Le code ne quitte jamais votre navigateur. Seule son empreinte SHA-256 part vers le serveur, qui ne peut donc pas lire vos données par lui-même — mais ne le perdez pas, il est irrécupérable.
- Fusion tâche par tâche : la version modifiée le plus récemment l'emporte. Deux appareils peuvent travailler hors ligne puis se rejoindre.
- Une suppression laisse une trace 120 jours, le temps qu'elle atteigne les autres appareils, puis disparaît.
- Voyant d'état dans l'en-tête : vert synchronisé, jaune en attente, orange en cours, gris hors ligne. Un clic force l'échange.

**Rappel du matin, application fermée**
- Un déclencheur Cron interroge chaque matin les échéances et envoie une notification aux appareils abonnés.
- Le message poussé est **vide** : le service worker demande le détail à l'API au moment d'afficher la notification. Rien de personnel ne transite par les serveurs de push de Google ou Apple.
- Sur iPhone : ajoutez d'abord PIC à l'écran d'accueil, puis activez les rappels depuis l'application installée (contrainte iOS, pas de PIC).

**Synthèse REX**
- Bouton *Synthèse REX* dans l'onglet Archives.
- Période au choix : trimestre en cours, trimestre précédent, année, depuis le début.
- Tâches closes, REX rédigés, collaborations engagées, délai moyen ; puis les REX regroupés par collaboration.
- Impression sur **une seule page**, trois colonnes, même en-tête que le reste.

**Ouverture animée**
- Séquence de 10 secondes avec partition Web Audio : les neuf carrés s'assemblent, le bloc PIC apparaît, le titre s'ouvre, les trois mots se posent, le tampon *by Majin* frappe, un balayage orange livre l'application.
- *Passer* à tout moment, ou `Échap`. Désactivable dans Réglages → Confort, où l'on peut aussi la revoir.
- Les navigateurs bloquent le son tant que rien n'a été touché : un bouton *Activer le son* apparaît le cas échéant, et le premier clic suffit.
- Animation réduite au strict minimum si le système demande de limiter les mouvements.

**Partout, tout le temps**
- Responsive : tableau sur grand écran, fiches empilées sur mobile.
- PWA installable (bouton *Installer*, ou « Ajouter à l'écran d'accueil » sur iOS).
- Service worker : fonctionne hors ligne une fois la première visite faite.

---

## Raccourcis clavier

| Touche | Effet |
|---|---|
| `N` | Nouvelle tâche |
| `Tab` | Cellule suivante |
| `Échap` | Annuler la saisie / fermer un panneau |
| `Ctrl` + `P` | Imprimer la liste filtrée |
| `Échap` | Passer l'ouverture animée |

---

## Où sont les données

Toujours dans le `localStorage` du navigateur, sous la clé `pic-majin:v1` : l'application
fonctionne intégralement sans serveur, hors ligne comprise.

Si la synchronisation est activée, une copie part en plus dans votre base D1, rangée sous
l'empreinte de votre code d'espace. Le local reste la référence de travail ; le serveur sert
de point de rendez-vous entre appareils.

**Exporter (JSON)** et **Importer** restent disponibles dans tous les cas — l'import est
additif, il ajoute les tâches absentes sans écraser les vôtres.

---

## Mise en ligne

### 1. Dépôt GitHub

```bash
git init
git add .
git commit -m "PIC — Programme d'Interaction Collaboratif"
git branch -M main
git remote add origin https://github.com/<votre-compte>/pic-majin.git
git push -u origin main
```

### 2. Cloudflare Pages

Dashboard Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
sélectionnez le dépôt, puis :

| Réglage | Valeur |
|---|---|
| Framework preset | `None` |
| Build command | *(laisser vide)* |
| Build output directory | `/` |
| Root directory | *(laisser vide)* |

Les fichiers de l'application sont **à la racine du dépôt** ; le dossier `functions/` est
détecté automatiquement par Pages et devient l'API `/api/*`. Chaque `git push` sur `main`
redéploie.

### 3. Base D1 (synchronisation)

```bash
npx wrangler d1 create pic
# notez le database_id affiché
npx wrangler d1 execute pic --remote --file=./schema.sql
```

Puis dans le projet Pages → **Settings** → **Bindings** → **D1 database bindings** :

| Variable | Base |
|---|---|
| `DB` | `pic` |

Vérifiez avec `https://<projet>.pages.dev/api/ping` → doit répondre `{"ok":true,"db":true,…}`.

Dans l'application : **Réglages** → **Synchronisation** → saisissez un code d'espace
(8 caractères minimum), puis le même code sur vos autres appareils.

### 4. Rappels poussés (worker Cron)

```bash
node tools/generate-vapid.mjs        # génère la paire de clés
cd worker-rappels
# renseignez database_id dans wrangler.toml
npx wrangler secret put VAPID_PUBLIC
npx wrangler secret put VAPID_JWK
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put CRON_TEST_KEY
npx wrangler deploy
```

Ajoutez aussi `VAPID_PUBLIC` comme **variable d'environnement du projet Pages** : c'est elle
que le navigateur récupère via `/api/push/vapid` pour s'abonner.

Test immédiat sans attendre le matin :
`https://pic-rappels.<votre-sous-domaine>.workers.dev/run?key=<CRON_TEST_KEY>`

Le Cron est réglé sur `0 6 * * *` (UTC) dans `wrangler.toml` — 8 h en heure d'été française.

### 5. Vérifications après le premier déploiement

- `https://<projet>.pages.dev/manifest.webmanifest` renvoie bien du JSON.
- Le bouton *Installer* apparaît dans l'en-tête (Chrome/Edge desktop et Android).
- Rechargez deux fois, coupez le réseau : l'application doit toujours s'ouvrir.

### Aperçu en local

```bash
python3 -m http.server 8080
# puis http://localhost:8080
```

Le service worker et l'installation PWA exigent `http://localhost` ou `https://` :
ils ne fonctionnent pas en `file://`.

---

## Fichiers

```
index.html                    structure de l'application
styles.css                    charte Orange, animations, responsive, feuilles d'impression
app.js                        logique complète (données, tri, archivage, REX, synchro, synthèse)
intro.js                      ouverture animée de 10 s et sa partition Web Audio
sw.js                         service worker : cache hors ligne + réception des rappels
manifest.webmanifest          déclaration PWA
schema.sql                    tables D1 (tasks, meta, subs)
functions/api/[[path]].js     API de synchronisation servie par Pages Functions
worker-rappels/               worker Cron qui envoie les rappels du matin
tools/generate-vapid.mjs      génération des clés de notification
favicon.svg                   icône navigateur
icon-192.png                  icône PWA
icon-512.png                  icône PWA
icon-maskable-512.png         icône Android adaptative
_headers                      en-têtes Cloudflare Pages (sécurité + cache)
```

---

## Charte graphique

Palette Orange (octobre 2015). Orange `#FF7900` pour l'action et l'urgence, noir et blanc pour
la structure, vert `#50BE87` pour ce qui est accompli, bleu `#4BB4E6` pour la collaboration,
jaune `#FFD200` pour l'imminent. Angles droits, pas d'arrondi, typographie Helvetica Neue / Arial.

## Mettre à jour la version en ligne

Après modification de `app.js` ou `styles.css`, incrémentez la constante `CACHE` dans `sw.js`
(`pic-majin-v2` → `pic-majin-v3`) pour forcer les navigateurs à récupérer les nouveaux fichiers.

## Ce que le serveur ne fait pas

Le code d'espace tient lieu de clé d'accès : quiconque le connaît accède aux données de
l'espace. C'est volontairement simple et sans compte à créer. Choisissez un code long et
gardez-le dans un gestionnaire de mots de passe. Si vos données deviennent sensibles,
l'étape suivante serait un chiffrement du contenu dans le navigateur avant envoi — le
serveur ne stockerait alors que des blocs illisibles.
