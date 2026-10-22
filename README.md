# TAF — Travail à Faire

**by Majin** · Organisateur de tâches collaboratives, archivage et retours d'expérience.

Application web autonome : aucun build, aucune dépendance, aucun serveur. Tout tient dans
des fichiers statiques déposés à la racine, prêts pour Cloudflare Pages.

---

## Nouveautés — liens et captures d'écran (octobre 2026)

**Dans la fiche d'une tâche**, une section *Liens et captures* sous le REX :

- **Liens internet**
  - collez une adresse, ou plusieurs d'un coup ;
  - chaque lien s'ouvre dans un nouvel onglet, se copie (ordinateur) ou se partage (mobile).
- **Captures d'écran**
  - `Win+Maj+S` puis `Ctrl+V` dans la fiche ouverte, glisser-déposer, ou *Ajouter une capture* ;
  - sur téléphone, boutons **Photo** et **Galerie** ;
  - les images sont réduites et compressées en WebP (environ 100 à 300 Ko) et rangées dans le navigateur (IndexedDB, pas `localStorage`) ;
  - clic sur une vignette pour l'agrandir ou la télécharger.
- **Indicateurs** dans le tableau, les fiches mobiles et le Kanban : icône lien + nombre, icône image + nombre.
- **REX avant / après**
  - dans la fiche d'une tâche archivée, marquez une capture *Avant* et une *Après* ;
  - elles s'affichent sur la carte d'archive, dans la Synthèse REX et sur son impression.
- **Sauvegarde avec images** : *Réglages* → *Mes données* → case *Inclure les captures d'écran*.
  - L'export JSON garde le même format, avec un champ `images` en plus.
  - L'import restaure les captures qui manquent sur l'appareil.
- **Synchronisation des captures** par Cloudflare R2, avec le **même code d'espace** que la synchro D1 (voir [docs/CLOUDFLARE-R2.md](docs/CLOUDFLARE-R2.md)).
  - Sans R2, tout fonctionne : les captures restent sur l'appareil où elles ont été ajoutées.

**Comportements à connaître :**

- *Dupliquer* recopie les liens et les captures sous de nouveaux identifiants : retirer une capture de la copie ne touche pas l'original.
- Une tâche récurrente replanifiée reprend les liens, pas les captures.
- Une tâche supprimée garde ses images 120 jours, comme sa trace de suppression, puis elles sont effacées ici et sur R2.
- Une nouvelle tâche qui n'a qu'un lien ou une capture n'est pas considérée comme vide.

**Fichiers ajoutés ou modifiés par cette version :**

| Fichier | |
|---|---|
| `index.html` | modifié : feuille et scripts du module, état des captures, case « Inclure les captures » |
| `app.js` | modifié : fiche, indicateurs, archives, synthèse, impression, export/import, synchro R2 |
| `styles.css` | modifié : quelques règles en fin de fichier |
| `sw.js` | modifié : nouveaux fichiers dans le cache hors ligne, version `taf-majin-v14` |
| `_headers` | modifié : `js/*` et `css/*` jamais mis en cache |
| `functions/api/[[path]].js` | modifié : route `/api/captures/:id` (R2), `r2` dans `/api/ping` |
| `css/taf-pieces-jointes.css` | **nouveau** |
| `js/taf-liens.js`, `js/taf-images.js`, `js/taf-captures-db.js`, `js/taf-captures-sync.js`, `js/taf-pieces-jointes.js`, `js/taf-rex-captures.js`, `js/taf-sauvegarde.js` | **nouveaux** |
| `docs/CLOUDFLARE-R2.md` | **nouveau** : pas à pas R2 |

Les données existantes ne bougent pas : même clé `pic-majin:v1`, mêmes tables D1, aucune migration à lancer.

---

## Ce que fait l'application

**Tâches**
- Tableau reprenant la trame d'origine : Date, Sujet, Collaboration, Objectif, Date d'échéance, Action, Commentaire, REX.
- Saisie directe dans les cellules. `Tab` passe à la cellule suivante, `Échap` annule, `Ctrl+Entrée` valide un champ long.
- Tri sur n'importe quelle colonne (clic sur l'intitulé, second clic pour inverser). Le tri est mémorisé.
- Recherche plein texte, filtre par collaboration, filtre par échéance (en retard / aujourd'hui / sous 7 jours / sans échéance).
- Rail de couleur à gauche de chaque ligne : orange en retard, jaune aujourd'hui, bleu sous 7 jours, gris plus tard.

**Notes en attente**
- Une case sous le tableau pour ce qui n'est pas encore une tâche : une idée, une relance, un point à creuser.
- Saisie au fil de l'eau, `Entrée` pour ajouter. Un clic sur une note la corrige.
- *En faire une tâche* : la note devient une ligne du tableau, son texte passe en sujet, la date du jour est posée et le curseur atterrit sur la collaboration.
- Les notes suivent la synchronisation comme les tâches, et s'impriment en bas de la feuille.

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
- Export JSON (sauvegarde complète), export CSV (point-virgule, ouvrable dans Excel).
- Import JSON pour restaurer une sauvegarde : fusion par horodatage, la version la plus récente l'emporte.
- **Import CSV pour ajouter des tâches en lot.** Le bouton *Télécharger le modèle CSV* produit un fichier aux intitulés de vos colonnes du moment, avec trois exemples à remplacer. Complétez-le dans votre tableur, réimportez-le : une ligne devient une tâche.

Le lecteur CSV accepte le point-virgule comme la virgule, les guillemets, les retours à la ligne
dans une cellule, les dates en `26/08/2026` comme en `2026-08-26`, les statuts avec ou sans
accents, et la difficulté en chiffre (1-5) comme en étoiles. Seule la colonne **Sujet** est
obligatoire : une ligne sans sujet est ignorée et signalée.

**Synchronisation multi-appareils**
- Un même **code d'espace** saisi sur plusieurs appareils suffit : tout se retrouve.
- Le code ne quitte jamais votre navigateur. Seule son empreinte SHA-256 part vers le serveur, qui ne peut donc pas lire vos données par lui-même — mais ne le perdez pas, il est irrécupérable.
- Fusion tâche par tâche : la version modifiée le plus récemment l'emporte. Deux appareils peuvent travailler hors ligne puis se rejoindre.
- Une suppression laisse une trace 120 jours, le temps qu'elle atteigne les autres appareils, puis disparaît.
- Voyant d'état dans l'en-tête : vert synchronisé, jaune en attente, orange en cours, gris hors ligne. Un clic force l'échange.

**Rappel du matin, application fermée**
- Un déclencheur Cron interroge chaque matin les échéances et envoie une notification aux appareils abonnés.
- Le message poussé est **vide** : le service worker demande le détail à l'API au moment d'afficher la notification. Rien de personnel ne transite par les serveurs de push de Google ou Apple.
- Sur iPhone : ajoutez d'abord TAF à l'écran d'accueil, puis activez les rappels depuis l'application installée (contrainte iOS, pas de TAF).

**Synthèse REX**
- Bouton *Synthèse REX* dans l'onglet Archives.
- Période au choix : trimestre en cours, trimestre précédent, année, depuis le début.
- Tâches closes, REX rédigés, collaborations engagées, délai moyen ; puis les REX regroupés par collaboration.
- Impression sur **une seule page**, trois colonnes, même en-tête que le reste.

**Ouverture animée**
- Séquence de 10 secondes avec partition Web Audio : les neuf carrés s'assemblent, le bloc TAF apparaît, le titre s'ouvre, les trois mots se posent, le tampon *by Majin* frappe, un balayage orange livre l'application.
- Partition **marimba** : bois chaud, gamme pentatonique montante sur les neuf carrés, roulé d'accord au final. Chaque frappe est une fondamentale sinus doublée d'une attaque brève à 3,94 fois la fréquence — c'est ce rapport inharmonique qui donne le bois.
- Le son se coupe dans Réglages → Confort sans désactiver l'animation.
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
| `Entrée` | Ajouter la note saisie |
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
git commit -m "TAF — Travail à Faire"
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

**Sans ligne de commande**, depuis le tableau de bord Cloudflare :
*Storage & Databases* → *D1 SQL Database* → **Create** → nommez la base `pic`.
Puis onglet **Console** de cette base : collez le contenu de `schema.sql` et exécutez.

Avec Wrangler si vous l'avez :

```bash
npx wrangler d1 create pic
npx wrangler d1 execute pic --remote --file=./schema.sql
```

Puis dans le projet Pages → **Settings** → **Bindings** → **D1 database bindings** :

| Variable | Base |
|---|---|
| `DB` | `pic` |

Facultatif, pour que les captures d'écran suivent sur tous les appareils : une liaison R2
`TAF_CAPTURES` vers un bucket `taf-captures` (pas à pas : [docs/CLOUDFLARE-R2.md](docs/CLOUDFLARE-R2.md)).

Vérifiez avec `https://<projet>.pages.dev/api/ping` → doit répondre `{"ok":true,"db":true,…}`.

Dans l'application : **Réglages** → **Synchronisation** → saisissez un code d'espace
(8 caractères minimum), puis le même code sur vos autres appareils.

### 4. Rappels poussés (worker Cron)

Les clés se génèrent **sans rien installer** : ouvrez `tools/generer-cles-vapid.html`
d'un double-clic. Tout se calcule dans le navigateur, hors ligne.

Le worker se crée aussi depuis le tableau de bord : *Workers & Pages* → **Create** →
*Start with Hello World*, collez le contenu de `worker-rappels/src/index.js`, puis dans
*Settings* ajoutez la liaison D1 `DB`, les quatre secrets, et le déclencheur Cron `0 6 * * *`.

Avec Wrangler si vous l'avez :

```bash
node tools/generate-vapid.mjs
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
js/                           liens, captures d'écran, REX avant / après, sauvegarde avec images
css/taf-pieces-jointes.css    styles des liens et captures
docs/CLOUDFLARE-R2.md         pas à pas pour synchroniser les captures
sw.js                         service worker : cache hors ligne + réception des rappels
manifest.webmanifest          déclaration PWA
schema.sql                    tables D1 (tasks, meta, subs)
functions/api/[[path]].js     API de synchronisation (D1) et des captures (R2), servie par Pages Functions
worker-rappels/               worker Cron qui envoie les rappels du matin
modele-taches-TAF.csv         modèle vierge pour l'import en lot
tools/generer-cles-vapid.html génération des clés dans le navigateur, sans installation
tools/generate-vapid.mjs      même chose en ligne de commande
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

Rien à faire : `git push` suffit. Le service worker interroge le réseau en premier pour
`index.html`, `app.js`, `styles.css` et `intro.js`, et `_headers` interdit leur mise en cache
côté navigateur comme côté CDN. Un déploiement s'applique au rechargement suivant.

Le cache ne sert plus que de secours hors ligne : si le réseau est absent, la dernière
version connue est servie. Les icônes et le manifeste, eux, restent en cache une semaine.

Quand une nouvelle version prend la main sur un onglet déjà ouvert, la page se recharge
une fois d'elle-même pour que l'écran corresponde au code servi. L'application vérifie
également l'existence d'une mise à jour toutes les quinze minutes.

## Détails d'implémentation utiles à savoir

Les notes en attente sont rangées dans la même liste que les tâches, avec un champ
`kind: "note"`. Elles héritent ainsi de la synchronisation, de la fusion par horodatage et
des pierres tombales sans qu'il faille toucher au schéma D1 ni à l'API. Partout ailleurs
elles sont filtrées : elles ne comptent pas dans les indicateurs, ne déclenchent pas de
rappel, n'apparaissent pas dans les archives.

Au chargement, une ligne de tâche entièrement vide est supprimée : une ligne créée puis
abandonnée n'encombre plus le tableau.

## Ce que le serveur ne fait pas

Le code d'espace tient lieu de clé d'accès : quiconque le connaît accède aux données de
l'espace. C'est volontairement simple et sans compte à créer. Choisissez un code long et
gardez-le dans un gestionnaire de mots de passe. Si vos données deviennent sensibles,
l'étape suivante serait un chiffrement du contenu dans le navigateur avant envoi — le
serveur ne stockerait alors que des blocs illisibles.


## Renommage

L'application s'appelait auparavant PIC — Programme d'Interaction Collaboratif.
La clé de stockage locale reste `pic-majin:v1` et la liaison D1 reste `DB` :
les renommer effacerait les données déjà présentes dans les navigateurs et
imposerait de tout resynchroniser. Le nom interne de l'API d'ouverture animée
(`window.PICIntro`) est également conservé.
