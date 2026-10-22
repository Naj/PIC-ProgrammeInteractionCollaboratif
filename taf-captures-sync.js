/*!
 * TAF — Travail à Faire (by Majin)
 * taf-captures-sync.js — synchronisation des captures avec Cloudflare R2.
 *
 * Principe : IndexedDB reste la source locale (l'appli marche hors ligne).
 * - À l'ajout d'une capture, elle est envoyée vers R2 ; meta.synchro passe à true.
 * - Sur un autre appareil, une capture absente localement est téléchargée depuis R2
 *   puis rangée dans IndexedDB.
 * - Une capture non envoyée (hors ligne) repart à la prochaine ouverture de la fiche,
 *   au retour du réseau, ou via toutSynchroniser() au démarrage.
 *
 * Dépend de : taf-captures-db.js
 */
(function (TAF) {
  'use strict';

  var CLE_STOCKAGE = 'taf-r2-config';
  var DELAI_MS = 30000;
  /* Deux façons de s'identifier auprès de l'API :
     - espace : l'empreinte SHA-256 du code d'espace de TAF (celle de la synchro D1) ;
     - cle    : une clé partagée (variante autonome du module). */
  var config = { url: '/api/captures', cle: '', espace: '' };

  try { Object.assign(config, JSON.parse(localStorage.getItem(CLE_STOCKAGE)) || {}); } catch (e) {}

  /** Enregistre l'adresse de l'API et l'identifiant (espace ou clé). */
  function configurer(options) {
    if (options.url != null) config.url = String(options.url).replace(/\/+$/, '') || '/api/captures';
    if (options.cle != null) config.cle = String(options.cle);
    if (options.espace != null) config.espace = String(options.espace);
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(config)); } catch (e) {}
  }

  function desactiver() { configurer({ cle: '', espace: '' }); }
  function estActif() { return !!(config.cle || config.espace); }
  function lireConfig() { return { url: config.url, cleRenseignee: !!config.cle, espaceRenseigne: !!config.espace }; }

  function adresse(id, vignette) {
    return config.url + '/' + encodeURIComponent(id) + (vignette ? '?type=vignette' : '');
  }

  function requete(methode, id, vignette, corps, entetes) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var minuteur = ctrl ? setTimeout(function () { ctrl.abort(); }, DELAI_MS) : null;
    var h = {};
    if (config.espace) h['X-TAF-Espace'] = config.espace;
    if (config.cle) h['X-TAF-Cle'] = config.cle;
    Object.assign(h, entetes || {});
    return fetch(adresse(id, vignette), { method: methode, headers: h, body: corps, signal: ctrl && ctrl.signal, cache: 'no-store' })
      .then(function (r) {
        if (minuteur) clearTimeout(minuteur);
        if (r.status === 401) throw new Error(config.espace ? 'Espace refusé par le serveur' : 'Clé de synchronisation refusée');
        return r;
      }, function (err) {
        if (minuteur) clearTimeout(minuteur);
        throw new Error(navigator.onLine === false ? 'Hors ligne' : 'Serveur injoignable');
      });
  }

  /** Vérifie l'adresse et la clé. Résout avec un message lisible. */
  function tester() {
    if (!estActif()) return Promise.resolve({ ok: false, message: 'Aucune clé renseignée' });
    return requete('GET', '_ping').then(function (r) {
      if (r.status === 204) return { ok: true, message: 'Connexion à Cloudflare R2 réussie' };
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { ok: false, message: j.message || j.error || ('Réponse inattendue (' + r.status + ')') };
      });
    }, function (err) { return { ok: false, message: err.message }; });
  }

  /** Envoie une capture (et sa vignette) déjà présente dans IndexedDB. */
  function envoyer(id) {
    return TAF.capturesDb.lire(id).then(function (enr) {
      if (!enr) throw new Error('Capture absente de cet appareil');
      var entetes = { 'X-TAF-Tache': enr.tacheId || '', 'X-TAF-Nom': encodeURIComponent(enr.nom || '') };
      return requete('PUT', id, false, enr.blob, Object.assign({ 'Content-Type': enr.blob.type || 'image/webp' }, entetes))
        .then(verifierReponse)
        .then(function () {
          if (!enr.vignette) return;
          return requete('PUT', id, true, enr.vignette, Object.assign({ 'Content-Type': enr.vignette.type || 'image/webp' }, entetes))
            .then(verifierReponse);
        });
    });
  }

  function verifierReponse(r) {
    if (r.ok) return Promise.resolve(r);
    return r.json().catch(function () { return {}; }).then(function (j) {
      throw new Error(j.message || j.error || ('Erreur ' + r.status));
    });
  }

  /** Télécharge une capture absente localement et la range dans IndexedDB. Résout null si elle n'existe pas sur R2. */
  function recuperer(meta, tacheId) {
    return requete('GET', meta.id).then(function (r) {
      if (r.status === 404) return null;
      return verifierReponse(r).then(function (r2) { return r2.blob(); }).then(function (blob) {
        return requete('GET', meta.id, true).then(function (rv) {
          return rv.ok ? rv.blob() : null;
        }, function () { return null; }).then(function (vignette) {
          var enr = Object.assign({}, meta, { tacheId: tacheId, blob: blob, vignette: vignette || blob });
          return TAF.capturesDb.ajouter(enr);
        });
      });
    });
  }

  function supprimer(id) {
    return requete('DELETE', id).then(verifierReponse);
  }

  /**
   * Envoie les captures de la tâche qui ne l'ont pas encore été.
   * Résout avec le nombre de captures envoyées (meta.synchro mis à true : sauvegarder la tâche si > 0).
   */
  function synchroniserTache(tache) {
    if (!estActif()) return Promise.resolve(0);
    var aEnvoyer = (tache.captures || []).filter(function (c) { return !c.synchro; });
    var n = 0;
    return aEnvoyer.reduce(function (p, meta) {
      return p.then(function () {
        return envoyer(meta.id).then(function () { meta.synchro = true; n++; }, function (err) {
          if (/Clé|Espace|Hors ligne|injoignable|R2/.test(err.message)) throw err; // inutile d'insister
        });
      });
    }, Promise.resolve()).then(function () { return n; }, function () { return n; });
  }

  /** À appeler au démarrage de l'appli : envoie tout ce qui est en attente. onChange(tache) pour sauvegarder. */
  function toutSynchroniser(taches, onChange) {
    return (taches || []).reduce(function (p, t) {
      return p.then(function () {
        return synchroniserTache(t).then(function (n) { if (n && onChange) onChange(t); });
      });
    }, Promise.resolve());
  }

  /** Nombre de captures pas encore envoyées, pour l'affichage d'un état. */
  function enAttente(taches) {
    return (taches || []).reduce(function (s, t) {
      return s + (t.captures || []).filter(function (c) { return !c.synchro; }).length;
    }, 0);
  }

  TAF.capturesSync = {
    configurer: configurer,
    desactiver: desactiver,
    estActif: estActif,
    lireConfig: lireConfig,
    tester: tester,
    envoyer: envoyer,
    recuperer: recuperer,
    supprimer: supprimer,
    synchroniserTache: synchroniserTache,
    toutSynchroniser: toutSynchroniser,
    enAttente: enAttente
  };
})(window.TAF = window.TAF || {});
