/*!
 * TAF — Travail à Faire (by Majin)
 * taf-liens.js — liens internet attachés à une tâche :
 * normalisation, validation, domaine affiché, titre par défaut.
 */
(function (TAF) {
  'use strict';

  function nouvelId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Transforme une saisie libre en URL valide, ou renvoie null.
   * « github.com/x » → « https://github.com/x ». Seuls http et https sont acceptés.
   */
  function normaliser(saisie) {
    var s = String(saisie || '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!/\./.test(u.hostname) && u.hostname !== 'localhost') return null;
    return u.href;
  }

  /** « https://www.github.com/a/b » → « github.com » */
  function domaine(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  /** Titre par défaut quand l'utilisateur n'en donne pas : domaine + dernier segment lisible. */
  function titreParDefaut(url) {
    var d = domaine(url);
    try {
      var segs = new URL(url).pathname.split('/').filter(Boolean);
      var dernier = segs.length ? decodeURIComponent(segs[segs.length - 1]) : '';
      dernier = dernier.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim();
      return dernier ? d + ' — ' + dernier : d;
    } catch (e) { return d; }
  }

  /**
   * Crée un objet lien prêt à ranger dans tache.liens[].
   * @returns {{id: string, url: string, titre: string, ajouteLe: string} | null}
   */
  function creer(saisie, titre) {
    var url = normaliser(saisie);
    if (!url) return null;
    return {
      id: nouvelId(),
      url: url,
      titre: String(titre || '').trim() || titreParDefaut(url),
      ajouteLe: new Date().toISOString()
    };
  }

  /** Extrait toutes les adresses d'un texte collé (plusieurs liens d'un coup). */
  function extraire(texte) {
    var trouves = String(texte || '').match(/\bhttps?:\/\/[^\s<>"')]+/gi) || [];
    var vus = {};
    return trouves.map(function (u) { return u.replace(/[.,;:!?]+$/, ''); })
      .filter(function (u) { if (vus[u]) return false; vus[u] = 1; return true; });
  }

  /** Vrai si l'adresse est déjà attachée à la tâche. */
  function existeDeja(liens, url) {
    return (liens || []).some(function (l) { return l.url === url; });
  }

  TAF.liens = {
    nouvelId: nouvelId,
    normaliser: normaliser,
    domaine: domaine,
    titreParDefaut: titreParDefaut,
    creer: creer,
    extraire: extraire,
    existeDeja: existeDeja
  };
})(window.TAF = window.TAF || {});
