/*!
 * TAF — Travail à Faire (by Majin)
 * taf-captures-db.js — stockage des captures d'écran dans IndexedDB.
 *
 * Pourquoi IndexedDB et pas localStorage : localStorage est limité à ~5 Mo
 * et ne stocke que du texte (une image en base64 pèse ~33 % de plus).
 * IndexedDB stocke les Blob tels quels et dispose de plusieurs centaines de Mo.
 *
 * Les tâches gardent seulement les MÉTADONNÉES (id, nom, dimensions…) dans
 * tache.captures[] ; l'image elle-même vit ici, retrouvée par son id.
 */
(function (TAF) {
  'use strict';

  var NOM_BASE = 'taf-pieces-jointes';
  var VERSION = 1;
  var STORE = 'captures';
  var basePromise = null;

  function ouvrir() {
    if (basePromise) return basePromise;
    basePromise = new Promise(function (resoudre, rejeter) {
      if (!window.indexedDB) { rejeter(new Error('IndexedDB indisponible sur ce navigateur')); return; }
      var req = indexedDB.open(NOM_BASE, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('tacheId', 'tacheId', { unique: false });
        }
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); basePromise = null; };
        resoudre(db);
      };
      req.onerror = function () { basePromise = null; rejeter(req.error); };
    });
    return basePromise;
  }

  /** Exécute fn(store) dans une transaction et résout avec le résultat de la requête renvoyée. */
  function transaction(mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (resoudre, rejeter) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        var resultat;
        if (req) req.onsuccess = function () { resultat = req.result; };
        tx.oncomplete = function () { resoudre(resultat); };
        tx.onerror = function () { rejeter(tx.error); };
        tx.onabort = function () { rejeter(tx.error || new Error('Transaction annulée (espace disque plein ?)')); };
      });
    });
  }

  /**
   * Enregistre une capture.
   * @param {{id: string, tacheId: string, nom: string, blob: Blob, vignette: Blob,
   *          largeur: number, hauteur: number, taille: number, type: string, ajouteLe: string}} enr
   */
  function ajouter(enr) {
    return transaction('readwrite', function (s) { return s.put(enr); }).then(function () { return enr; });
  }

  function lire(id) {
    return transaction('readonly', function (s) { return s.get(id); });
  }

  function listerParTache(tacheId) {
    return transaction('readonly', function (s) { return s.index('tacheId').getAll(tacheId); })
      .then(function (liste) {
        return (liste || []).sort(function (a, b) { return a.ajouteLe < b.ajouteLe ? -1 : 1; });
      });
  }

  function supprimer(id) {
    return transaction('readwrite', function (s) { return s.delete(id); });
  }

  /** À appeler quand une tâche est supprimée définitivement (pas à l'archivage). */
  function supprimerParTache(tacheId) {
    return listerParTache(tacheId).then(function (liste) {
      return transaction('readwrite', function (s) {
        liste.forEach(function (c) { s.delete(c.id); });
        return null;
      }).then(function () { return liste.length; });
    });
  }

  /** Copie les captures d'une tâche vers une autre (bouton « Dupliquer »). */
  function dupliquerVers(tacheSourceId, tacheCibleId, nouvelId) {
    return listerParTache(tacheSourceId).then(function (liste) {
      var copies = liste.map(function (c) {
        return Object.assign({}, c, { id: nouvelId(), tacheId: tacheCibleId });
      });
      return transaction('readwrite', function (s) {
        copies.forEach(function (c) { s.put(c); });
        return null;
      }).then(function () { return copies; });
    });
  }

  /** Espace utilisé / disponible pour le site, en octets (si le navigateur le permet). */
  function estimerEspace() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    return Promise.resolve(null);
  }

  /** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
  function demanderPersistance() {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    return Promise.resolve(false);
  }

  TAF.capturesDb = {
    ajouter: ajouter,
    lire: lire,
    listerParTache: listerParTache,
    supprimer: supprimer,
    supprimerParTache: supprimerParTache,
    dupliquerVers: dupliquerVers,
    estimerEspace: estimerEspace,
    demanderPersistance: demanderPersistance
  };
})(window.TAF = window.TAF || {});
