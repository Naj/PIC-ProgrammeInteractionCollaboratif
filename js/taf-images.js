/*!
 * TAF — Travail à Faire (by Majin)
 * taf-images.js — préparation des captures d'écran avant stockage :
 * réduction de taille, compression WebP (repli JPEG), vignette.
 * Aucune dépendance. Fonctionne en script classique (y compris en file://).
 */
(function (TAF) {
  'use strict';

  var DEFAUTS = {
    maxCote: 1920,        // plus grand côté de l'image conservée (px)
    qualite: 0.82,        // qualité de compression (0 à 1)
    vignetteCote: 320,    // plus grand côté de la vignette (px)
    vignetteQualite: 0.7,
    poidsMaxEntree: 15 * 1024 * 1024 // refuse les fichiers de plus de 15 Mo
  };

  var TYPES_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

  function estImage(fichier) {
    return !!fichier && TYPES_ACCEPTES.indexOf(fichier.type) !== -1;
  }

  /** Décode un Blob en source dessinable (ImageBitmap si possible, sinon <img>). */
  function charger(blob) {
    if (window.createImageBitmap) {
      return createImageBitmap(blob).catch(function () { return chargerViaImg(blob); });
    }
    return chargerViaImg(blob);
  }

  function chargerViaImg(blob) {
    return new Promise(function (resoudre, rejeter) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resoudre(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rejeter(new Error('Image illisible')); };
      img.src = url;
    });
  }

  function dimensions(src) {
    return { l: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }

  /** Dessine la source dans un canvas dont le plus grand côté vaut au plus maxCote. */
  function versCanvas(src, maxCote) {
    var d = dimensions(src);
    var ratio = Math.min(1, maxCote / Math.max(d.l, d.h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(d.l * ratio));
    canvas.height = Math.max(1, Math.round(d.h * ratio));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function toBlob(canvas, type, qualite) {
    return new Promise(function (resoudre) { canvas.toBlob(resoudre, type, qualite); });
  }

  /** Encode en WebP ; si le navigateur ne sait pas (il renvoie du PNG), repli en JPEG. */
  function encoder(canvas, qualite) {
    return toBlob(canvas, 'image/webp', qualite).then(function (blob) {
      if (blob && blob.type === 'image/webp') return blob;
      return toBlob(canvas, 'image/jpeg', qualite);
    });
  }

  /**
   * Prépare un fichier image pour le stockage.
   * @param {Blob|File} fichier
   * @param {object} [options] surcharge de DEFAUTS
   * @returns {Promise<{blob: Blob, vignette: Blob, largeur: number, hauteur: number, type: string, taille: number}>}
   */
  function preparerCapture(fichier, options) {
    var o = Object.assign({}, DEFAUTS, options || {});
    if (!estImage(fichier)) return Promise.reject(new Error('Format non pris en charge (PNG, JPG, WebP, GIF)'));
    if (fichier.size > o.poidsMaxEntree) return Promise.reject(new Error('Image trop lourde (15 Mo maximum)'));

    return charger(fichier).then(function (src) {
      var largeurOrigine = dimensions(src).l;
      var grand = versCanvas(src, o.maxCote);
      var petit = versCanvas(grand, o.vignetteCote);
      if (src.close) src.close(); // libère l'ImageBitmap
      return Promise.all([encoder(grand, o.qualite), encoder(petit, o.vignetteQualite)]).then(function (r) {
        var blob = r[0];
        // Si la compression grossit le fichier (petite capture PNG très simple) sans l'avoir
        // redimensionné, on garde l'original.
        if (fichier.size < blob.size && grand.width === largeurOrigine) blob = fichier;
        return {
          blob: blob,
          vignette: r[1],
          largeur: grand.width,
          hauteur: grand.height,
          type: blob.type,
          taille: blob.size
        };
      });
    });
  }

  /** Formate un poids en octets pour l'affichage : « 245 Ko », « 1,2 Mo ». */
  function formaterPoids(octets) {
    if (octets < 1024) return octets + ' o';
    if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
    return (octets / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
  }

  TAF.images = {
    DEFAUTS: DEFAUTS,
    estImage: estImage,
    preparerCapture: preparerCapture,
    formaterPoids: formaterPoids
  };
})(window.TAF = window.TAF || {});
