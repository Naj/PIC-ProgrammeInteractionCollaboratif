# Pas à pas : captures d'écran sur tous vos appareils (Cloudflare R2)

**Résultat :** une capture ajoutée au bureau apparaît aussi sur le téléphone.

**Ce qui synchronise déjà, sans rien faire de plus :**
- les liens internet voyagent avec la tâche, par la synchronisation D1 existante ;
- les captures restent sur l'appareil tant que R2 n'est pas relié. TAF fonctionne normalement.

**Prérequis :**
- votre projet Pages est relié à GitHub (c'est déjà le cas, voir le README) ;
- la synchronisation par code d'espace est en place.

**Rien de nouveau à mémoriser :** les captures utilisent le **même code d'espace** que la synchronisation. Il n'y a ni clé supplémentaire, ni réglage à refaire sur chaque appareil.

Tout se fait dans le navigateur, sans rien installer. Comptez environ 10 minutes.

---

## Étape 1 — Créer le bucket

1. Allez sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. Menu de gauche : **R2 object storage**.
3. Si c'est la première fois, activez R2. Cloudflare peut demander un moyen de paiement même pour la partie gratuite (voir « Coût » plus bas).
4. Cliquez sur **Create bucket**.
5. Nom : `taf-captures`.
6. Emplacement : **Automatic**, ou **Europe (EU)** pour garder les images en Europe.
7. Classe de stockage : **Standard**.
8. Cliquez à nouveau sur **Create bucket**.

Laissez le bucket **privé** : n'activez ni « Public access » ni domaine `r2.dev`. Les images passent par l'API de TAF, qui vérifie le code d'espace.

## Étape 2 — Déposer la nouvelle version sur GitHub

Remplacez ou ajoutez les fichiers listés dans la section « Nouveautés » du README, puis validez le commit. Cloudflare redéploie tout seul.

Attention aux dossiers : `js/` et `css/` se placent à la racine, à côté de `index.html`. Le fichier `functions/api/[[path]].js` remplace l'existant.

## Étape 3 — Relier le bucket au projet

1. **Workers & Pages** → votre projet TAF.
2. Onglet **Settings** → **Bindings** → **Add** → **R2 bucket**.
3. **Variable name** : `TAF_CAPTURES` (exactement, en majuscules).
4. **R2 bucket** : `taf-captures`.
5. **Save**.

Si Cloudflare propose **Production** et **Preview**, faites-le au moins pour **Production**.

## Étape 4 — Redéployer

La liaison n'est prise en compte qu'au déploiement suivant.

Pour redéployer : **Deployments** → dernier déploiement → menu **⋯** → **Retry deployment**. Ou faites un petit commit sur GitHub.

## Étape 5 — Vérifier

Ouvrez `https://<votre-projet>.pages.dev/api/ping`. La réponse doit contenir `"r2":true`.

Exemple : `{"ok":true,"db":true,"push":true,"r2":true}`

Si vous voyez `"r2":false`, reprenez l'étape 3 (le nom doit être exactement `TAF_CAPTURES`) puis l'étape 4.

Ensuite, dans TAF : **Réglages** → **Synchronisation**. Sous l'empreinte de l'espace, le message doit être :

> Captures d'écran : disponibles sur tous vos appareils (Cloudflare R2).

Rechargez l'appli sur chaque appareil. Les captures ajoutées avant cette étape partent toutes seules au démarrage suivant.

---

## Ce que vous verrez ensuite

Sous les captures de chaque fiche, une pastille indique l'état :

| Pastille | Message | Signification |
|---|---|---|
| verte | Captures disponibles sur tous vos appareils | tout est envoyé |
| bleue | Envoi en cours… | patience |
| jaune | … seront envoyées dès que possible | hors ligne : l'envoi repartira tout seul |
| grise | Captures enregistrées sur cet appareil uniquement | synchro inactive, ou R2 pas encore relié |

## Comment c'est rangé, et qui peut y accéder

Dans le bucket, chaque espace a son dossier, nommé par l'empreinte du code d'espace : `<empreinte>/captures/…` et `<empreinte>/vignettes/…`.

Un espace ne voit jamais les images d'un autre. La règle d'accès est la même que pour vos tâches : quiconque connaît le code d'espace accède aux images de cet espace.

- **Retirer une capture** dans une fiche l'efface aussi de R2.
- **Supprimer une tâche** garde ses images 120 jours, le temps que l'annulation reste possible sur vos autres appareils. Elles disparaissent ensuite avec la trace de suppression.

## Coût

Partie gratuite de R2 (stockage Standard), par mois :
- 10 Go stockés ;
- 1 million d'écritures ;
- 10 millions de lectures ;
- sortie de données gratuite.

Une capture compressée pèse environ 100 à 300 Ko. Pour un usage personnel, TAF reste largement dans la partie gratuite. Le suivi se fait dans **R2 object storage** → **Metrics**.

## En cas de souci

| Symptôme | Piste |
|---|---|
| `/api/ping` ne montre pas `r2` du tout | l'ancien `functions/api/[[path]].js` est toujours en ligne : vérifiez qu'il a bien été remplacé sur GitHub |
| `"r2":false` | liaison absente ou mal nommée (étape 3), ou pas de redéploiement (étape 4) |
| « Image non disponible sur cet appareil » | l'appareil qui l'a ajoutée ne l'a pas encore envoyée (hors ligne, ou R2 relié après coup) : ouvrez TAF sur cet appareil-là |
| Vieille version affichée | rechargez deux fois ; `_headers` et le service worker interdisent pourtant le cache du code |

---

Sources :
- Liaisons des Pages Functions : https://developers.cloudflare.com/pages/functions/bindings/
- Création d'un bucket R2 : https://developers.cloudflare.com/r2/get-started/s3/
- Tarifs R2 : https://developers.cloudflare.com/r2/pricing/
