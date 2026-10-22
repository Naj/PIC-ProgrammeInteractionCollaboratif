/*!
 * TAF — Travail à Faire (by Majin)
 * taf-sauvegarde.js — sauvegarde complète (JSON) et restauration, images comprises.
 *
 * Le format est indépendant de la façon dont l'appli range ses données :
 * on lui passe un objet de listes, chaque élément ayant un « id ».
 *
 *   var donnees = { taches: [...], archives: [...], notes: [...] };
 *   TAF.sauvegarde.estimer(donnees)                          → { images, octets }
 *   TAF.sauvegarde.exporter(donnees, { images: true })        → télécharge taf-sauvegarde-AAAA-MM-JJ.json
 *   TAF.sauvegarde.lireFichier(file).then(sauv =>
 *     TAF.sauvegarde.restaurer(sauv, donneesActuelles))       → { donnees, ajoutees, images }
 *
 * Dépend de : taf-captures-db.js ; taf-pieces-jointes.js (facultatif, pour récupérer depuis R2).
 */
(function (TAF) {
  'use strict';

  var FORMAT = 'taf-sauvegarde';
  var VERSION = 1;

  function toutesLesCaptures(donnees) {
    var res = [];
    Object.keys(donnees || {}).forEach(function (k) {
      (Array.isArray(donnees[k]) ? donnees[k] : []).forEach(function (item) {
        (item && item.captures || []).forEach(function (meta) { res.push({ meta: meta, tacheId: item.id }); });
      });
    });
    return res;
  }

  function versDataUrl(blob) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function depuisDataUrl(dataUrl) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl || '');
    if (!m) return null;
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    var octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new Blob([octets], { type: m[1] });
  }

  function lireCapture(meta, tacheId) {
    if (TAF.piecesJointes && TAF.piecesJointes.obtenirCapture) return TAF.piecesJointes.obtenirCapture(meta, tacheId);
    return TAF.capturesDb.lire(meta.id);
  }

  /** Nombre d'images et poids approximatif (d'après les métadonnées, sans rien lire). */
  function estimer(donnees) {
    var caps = toutesLesCaptures(donnees);
    var octets = caps.reduce(function (s, c) { return s + (c.meta.taille || 0); }, 0);
    // base64 ≈ +33 %, plus les vignettes (~10 % du poids)
    return { images: caps.length, octets: Math.round(octets * 1.33 * 1.1) };
  }

  /**
   * Construit la sauvegarde et la propose au téléchargement.
   * @param {object} donnees  listes nommées
   * @param {{images?: boolean, nomFichier?: string, telecharger?: boolean}} [options]
   * @returns {Promise<{fichier: Blob, nom: string, images: number, manquantes: number}>}
   */
  function exporter(donnees, options) {
    var o = Object.assign({ images: true, telecharger: true }, options || {});
    var sauv = { format: FORMAT, version: VERSION, creeLe: new Date().toISOString(), donnees: donnees, images: {} };
    var manquantes = 0;

    var etape = !o.images ? Promise.resolve() : toutesLesCaptures(donnees).reduce(function (p, c) {
      return p.then(function () {
        return lireCapture(c.meta, c.tacheId).then(function (enr) {
          if (!enr) { manquantes++; return; }
          return Promise.all([versDataUrl(enr.blob), enr.vignette ? versDataUrl(enr.vignette) : null]).then(function (r) {
            sauv.images[c.meta.id] = { tacheId: c.tacheId, image: r[0], vignette: r[1] };
          });
        }, function () { manquantes++; });
      });
    }, Promise.resolve());

    return etape.then(function () {
      var fichier = new Blob([JSON.stringify(sauv)], { type: 'application/json' });
      var nom = o.nomFichier || ('taf-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json');
      if (o.telecharger) {
        var url = URL.createObjectURL(fichier);
        var a = document.createElement('a');
        a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }
      return { fichier: fichier, nom: nom, images: Object.keys(sauv.images).length, manquantes: manquantes };
    });
  }

  /** Lit et vérifie un fichier de sauvegarde choisi par l'utilisateur. */
  function lireFichier(fichier) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var s = JSON.parse(r.result);
          if (!s || s.format !== FORMAT) throw new Error('Ce fichier n\'est pas une sauvegarde TAF.');
          if (s.version > VERSION) throw new Error('Sauvegarde créée par une version plus récente de TAF.');
          ok(s);
        } catch (e) { ko(e instanceof SyntaxError ? new Error('Fichier illisible ou abîmé.') : e); }
      };
      r.onerror = function () { ko(new Error('Lecture du fichier impossible.')); };
      r.readAsText(fichier);
    });
  }

  /**
   * Fusionne une sauvegarde avec les données actuelles : les éléments déjà présents (même id)
   * sont CONSERVÉS tels quels ; seuls les manquants sont ajoutés. Les images des éléments ajoutés
   * sont rangées dans IndexedDB (et repartiront vers R2 si la synchro est active : synchro = false).
   * @returns {Promise<{donnees: object, ajoutees: number, images: number}>}
   */
  function restaurer(sauv, actuelles) {
    var resultat = {};
    var ajoutes = [];
    Object.keys(actuelles || {}).forEach(function (k) { resultat[k] = (actuelles[k] || []).slice(); });
    Object.keys(sauv.donnees || {}).forEach(function (k) {
      if (!Array.isArray(sauv.donnees[k])) return;
      var liste = resultat[k] || (resultat[k] = []);
      var ids = {};
      liste.forEach(function (it) { if (it && it.id != null) ids[it.id] = true; });
      sauv.donnees[k].forEach(function (it) {
        if (!it || it.id == null || ids[it.id]) return;
        (it.captures || []).forEach(function (m) { m.synchro = false; });
        liste.push(it); ajoutes.push(it); ids[it.id] = true;
      });
    });

    // Images : on complète TOUTES les captures absentes de cet appareil (tâches ajoutées,
    // mais aussi tâches déjà là, par exemple reçues par la synchro D1 sans leurs images).
    var nbImages = 0;
    var tousLesItems = [];
    Object.keys(resultat).forEach(function (k) { tousLesItems = tousLesItems.concat(resultat[k] || []); });
    var ecritures = tousLesItems.reduce(function (p, item) {
      return p.then(function () {
        return ((item && item.captures) || []).reduce(function (p2, meta) {
          return p2.then(function () {
            var img = sauv.images && sauv.images[meta.id];
            if (!img) return;
            return TAF.capturesDb.lire(meta.id).then(function (existe) {
              if (existe) return;
              var blob = depuisDataUrl(img.image);
              if (!blob) return;
              var vignette = depuisDataUrl(img.vignette) || blob;
              return TAF.capturesDb.ajouter(Object.assign({}, meta, { tacheId: item.id, blob: blob, vignette: vignette }))
                .then(function () { nbImages++; });
            });
          });
        }, Promise.resolve());
      });
    }, Promise.resolve());

    return ecritures.then(function () {
      return { donnees: resultat, ajoutees: ajoutes.length, images: nbImages };
    });
  }

  /**
   * Outil bas niveau pour une appli qui a déjà son propre format d'export :
   * lit les images des éléments donnés et les renvoie prêtes à ranger dans le JSON.
   * @param {Array} items  éléments (tâches) portant chacun id et captures[]
   * @returns {Promise<{images: object, nombre: number, manquantes: number}>}
   */
  function collecterImages(items) {
    var images = {}, manquantes = 0;
    var caps = toutesLesCaptures({ items: items || [] });
    return caps.reduce(function (p, c) {
      return p.then(function () {
        return lireCapture(c.meta, c.tacheId).then(function (enr) {
          if (!enr) { manquantes++; return; }
          return Promise.all([versDataUrl(enr.blob), enr.vignette ? versDataUrl(enr.vignette) : null]).then(function (r) {
            images[c.meta.id] = { tacheId: c.tacheId, image: r[0], vignette: r[1] };
          });
        }, function () { manquantes++; });
      });
    }, Promise.resolve()).then(function () {
      return { images: images, nombre: Object.keys(images).length, manquantes: manquantes };
    });
  }

  /**
   * Range dans IndexedDB les images d'un JSON importé, pour toutes les captures
   * des éléments donnés qui manquent sur cet appareil.
   * @returns {Promise<number>} nombre d'images restaurées
   */
  function restaurerImages(images, items) {
    var n = 0;
    if (!images) return Promise.resolve(0);
    return (items || []).reduce(function (p, item) {
      return p.then(function () {
        return ((item && item.captures) || []).reduce(function (p2, meta) {
          return p2.then(function () {
            var img = images[meta.id];
            if (!img) return;
            return TAF.capturesDb.lire(meta.id).then(function (existe) {
              if (existe) return;
              var blob = depuisDataUrl(img.image);
              if (!blob) return;
              var vignette = depuisDataUrl(img.vignette) || blob;
              return TAF.capturesDb.ajouter(Object.assign({}, meta, { tacheId: item.id, blob: blob, vignette: vignette }))
                .then(function () { n++; });
            });
          });
        }, Promise.resolve());
      });
    }, Promise.resolve()).then(function () { return n; });
  }

  TAF.sauvegarde = {
    estimer: estimer,
    exporter: exporter,
    lireFichier: lireFichier,
    restaurer: restaurer,
    collecterImages: collecterImages,
    restaurerImages: restaurerImages
  };
})(window.TAF = window.TAF || {});
