/*!
 * TAF — Travail à Faire (by Majin)
 * taf-rex-captures.js — captures « avant / après » dans le retour d'expérience.
 *
 * Pas de nouvelle image : on marque des captures DÉJÀ jointes à la tâche.
 *   meta.rex = 'avant' | 'apres'   (une seule capture par rôle)
 *
 * Dépend de : taf-pieces-jointes.js (et ses dépendances).
 *
 * Usage :
 *   TAF.rexCaptures.monter(conteneur, { tache, onChange })   // choix dans la fenêtre « Écrire le REX »
 *   TAF.rexCaptures.affichage(tache).then(el => carte.appendChild(el))            // carte d'archive
 *   TAF.rexCaptures.affichage(tache, { impression: true }).then(...)              // Synthèse REX imprimable
 */
(function (TAF) {
  'use strict';

  var PJ = TAF.piecesJointes;
  var ROLES = [
    { k: '', label: 'Aucun' },
    { k: 'avant', label: 'Avant' },
    { k: 'apres', label: 'Après' }
  ];

  function paire(tache) {
    var caps = tache.captures || [];
    return {
      avant: caps.filter(function (c) { return c.rex === 'avant'; })[0] || null,
      apres: caps.filter(function (c) { return c.rex === 'apres'; })[0] || null
    };
  }

  function aDesCapturesRex(tache) {
    var p = paire(tache);
    return !!(p.avant || p.apres);
  }

  /** Interface de choix : chaque capture de la tâche avec un sélecteur Aucun / Avant / Après. */
  function monter(conteneur, options) {
    var tache = options.tache;
    var onChange = options.onChange || function () {};
    var el = PJ.el;
    var urls = [];
    var racine = el('section', { class: 'rex-choix', 'aria-label': 'Captures du REX' });

    function rendre() {
      racine.textContent = '';
      racine.appendChild(el('div', { class: 'pj-entete' }, [
        el('span', { class: 'pj-titre', text: 'Captures avant / après' }),
        el('span', { class: 'pj-compte', text: 'facultatif' })
      ]));
      var caps = tache.captures || [];
      if (!caps.length) {
        racine.appendChild(el('p', { class: 'pj-aide', text: 'Aucune capture sur cette tâche. Ajoutez-en depuis la fiche pour illustrer le REX.' }));
        return;
      }
      var grille = el('div', { class: 'rex-grille' });
      caps.forEach(function (meta) {
        var img = el('img', { alt: '' });
        PJ.obtenirCapture(meta, tache.id).then(function (enr) {
          if (enr) { var u = URL.createObjectURL(enr.vignette || enr.blob); urls.push(u); img.src = u; }
        });
        var groupe = el('div', { class: 'rex-roles', role: 'radiogroup', 'aria-label': 'Rôle de ' + meta.nom });
        ROLES.forEach(function (r) {
          var actif = (meta.rex || '') === r.k;
          groupe.appendChild(el('button', {
            type: 'button', role: 'radio', 'aria-checked': actif ? 'true' : 'false',
            class: 'rex-role' + (actif ? ' rex-role-on' : ''), text: r.label,
            onclick: function () { choisir(meta, r.k); }
          }));
        });
        grille.appendChild(el('figure', { class: 'rex-capture' + (meta.rex ? ' rex-' + meta.rex : '') }, [
          el('div', { class: 'rex-vignette' }, [img]),
          el('figcaption', { text: meta.nom, title: meta.nom }),
          groupe
        ]));
      });
      racine.appendChild(grille);
    }

    function choisir(meta, role) {
      (tache.captures || []).forEach(function (c) {
        if (role && c.rex === role) delete c.rex;   // un seul « avant » et un seul « après »
      });
      if (role) meta.rex = role; else delete meta.rex;
      onChange(tache);
      rendre();
    }

    conteneur.appendChild(racine);
    rendre();
    return {
      element: racine,
      detruire: function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); racine.remove(); }
    };
  }

  /** Bloc d'affichage Avant / Après (carte d'archive ou impression). Résout quand les images sont chargées. */
  function affichage(tache, options) {
    var impression = options && options.impression;
    var el = PJ.el;
    var p = paire(tache);
    var bloc = el('div', { class: impression ? 'rex-paire rex-paire-print' : 'rex-paire' });
    var chargements = [];
    [['avant', 'Avant'], ['apres', 'Après']].forEach(function (r) {
      var meta = p[r[0]];
      if (!meta) return;
      var img = el('img', { alt: r[1] + ' : ' + meta.nom });
      chargements.push(PJ.obtenirCapture(meta, tache.id).then(function (enr) {
        if (!enr) return;
        return new Promise(function (ok) {
          img.onload = img.onerror = ok;
          img.src = URL.createObjectURL(impression ? (enr.vignette || enr.blob) : enr.blob);
        });
      }));
      bloc.appendChild(el('figure', { class: 'rex-' + r[0] }, [
        el('div', { class: 'rex-vignette' }, [img, el('span', { class: 'rex-etiquette', text: r[1] })]),
        el('figcaption', { text: meta.nom + ' · ' + PJ.dateCourte(meta.ajouteLe) })
      ]));
    });
    return Promise.all(chargements).then(function () { return bloc; });
  }

  TAF.rexCaptures = { monter: monter, affichage: affichage, paire: paire, aDesCapturesRex: aDesCapturesRex };
})(window.TAF = window.TAF || {});
