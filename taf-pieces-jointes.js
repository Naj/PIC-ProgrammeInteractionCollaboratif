/*!
 * TAF — Travail à Faire (by Majin)
 * taf-pieces-jointes.js — interface « Liens » et « Captures d'écran » de la fiche tâche.
 *
 * Dépend de : taf-liens.js, taf-images.js, taf-captures-db.js (à charger avant).
 *
 * Usage :
 *   var pj = TAF.piecesJointes.monter(document.querySelector('#pj'), {
 *     tache: maTache,                       // objet tâche (liens[] et captures[] créés si absents)
 *     onChange: function (tache) { ... }    // appelé à chaque modification → sauvegarder la tâche
 *   });
 *   ...
 *   pj.detruire(); // à la fermeture de la fiche (libère la mémoire, retire l'écoute du collage)
 *
 *   TAF.piecesJointes.indicateurs(tache)  // petit élément « 🔗 2 · 🖼 3 » pour la liste / le Kanban
 */
(function (TAF) {
  'use strict';

  var MAX_CAPTURES = 20;

  /* ---------- utilitaires DOM (pas d'innerHTML avec des données utilisateur) ---------- */

  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONES = {
    lien: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    image: '<rect x="3" y="5" width="18" height="14"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    copier: '<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    partager: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>'
  };
  function icone(nom, taille) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('width', taille || 18);
    s.setAttribute('height', taille || 18);
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONES[nom]; // contenu statique, sûr
    return s;
  }

  function dateCourte(iso) {
    try { return new Date(iso).toLocaleDateString('fr-FR'); } catch (e) { return ''; }
  }

  function estMobile() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  /* ---------- synchronisation R2 (facultative : active si taf-captures-sync.js est chargé et configuré) ---------- */

  function sync() {
    return TAF.capturesSync && TAF.capturesSync.estActif() ? TAF.capturesSync : null;
  }

  /** Lit une capture localement ; si elle manque et que la synchro est active, la télécharge depuis R2. */
  function obtenirCapture(meta, tacheId) {
    return TAF.capturesDb.lire(meta.id).then(function (enr) {
      if (enr || !sync()) return enr;
      return sync().recuperer(meta, tacheId).catch(function () { return null; });
    });
  }

  /* ---------- montage ---------- */

  function monter(conteneur, options) {
    var tache = options.tache;
    var onChange = options.onChange || function () {};
    if (!Array.isArray(tache.liens)) tache.liens = [];
    if (!Array.isArray(tache.captures)) tache.captures = [];

    var urlsObjets = [];       // object URLs à libérer
    var detruit = false;

    function notifier() { onChange(tache); }

    function annoncer(msg) {
      zoneStatut.textContent = '';
      // petit délai pour que les lecteurs d'écran relisent le message
      setTimeout(function () { zoneStatut.textContent = msg; }, 30);
    }

    /* ===== Liens ===== */

    var compteLiens = el('span', { class: 'pj-compte' });
    var listeLiens = el('ul', { class: 'pj-liens' });
    var champLien = el('input', {
      class: 'pj-champ', type: 'url', inputmode: 'url', autocomplete: 'off',
      placeholder: 'Coller une adresse : https://…', 'aria-label': 'Adresse du lien à ajouter'
    });
    var erreurLien = el('p', { class: 'pj-erreur', role: 'alert', hidden: true });

    function ajouterLiens(saisies) {
      var ajoutes = 0, invalides = 0, doublons = 0;
      saisies.forEach(function (s) {
        var lien = TAF.liens.creer(s);
        if (!lien) { invalides++; return; }
        if (TAF.liens.existeDeja(tache.liens, lien.url)) { doublons++; return; }
        tache.liens.push(lien); ajoutes++;
      });
      if (ajoutes) { rendreLiens(); notifier(); annoncer(ajoutes > 1 ? ajoutes + ' liens ajoutés' : 'Lien ajouté'); }
      if (invalides && !ajoutes) montrerErreurLien('Cette adresse ne semble pas valide.');
      else if (doublons && !ajoutes) montrerErreurLien('Ce lien est déjà attaché à la tâche.');
      else masquerErreurLien();
      return ajoutes;
    }

    function montrerErreurLien(msg) { erreurLien.textContent = msg; erreurLien.hidden = false; champLien.setAttribute('aria-invalid', 'true'); }
    function masquerErreurLien() { erreurLien.hidden = true; champLien.removeAttribute('aria-invalid'); }

    function validerSaisieLien() {
      var texte = champLien.value;
      var multiples = TAF.liens.extraire(texte);
      var n = ajouterLiens(multiples.length > 1 ? multiples : [texte]);
      if (n) champLien.value = '';
    }

    champLien.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); validerSaisieLien(); }
    });
    champLien.addEventListener('input', masquerErreurLien);

    function copier(url) {
      var fait = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(url)
        : Promise.reject();
      fait.then(function () { annoncer('Adresse copiée'); }, function () {
        champLien.value = url; champLien.select(); annoncer('Adresse placée dans le champ, copiez-la avec Ctrl+C');
      });
    }

    function partager(lien) {
      if (navigator.share) navigator.share({ title: lien.titre, url: lien.url }).catch(function () {});
      else copier(lien.url);
    }

    function rendreLiens() {
      listeLiens.textContent = '';
      compteLiens.textContent = tache.liens.length ? String(tache.liens.length) : '';
      listeLiens.hidden = tache.liens.length === 0;
      tache.liens.forEach(function (lien) {
        var mobile = estMobile();
        listeLiens.appendChild(el('li', { class: 'pj-lien' }, [
          icone('lien'),
          el('div', { class: 'pj-lien-texte' }, [
            el('a', { href: lien.url, target: '_blank', rel: 'noopener noreferrer', text: lien.titre, title: lien.url }),
            el('span', { class: 'pj-domaine', text: TAF.liens.domaine(lien.url) })
          ]),
          el('button', {
            type: 'button', class: 'pj-icone',
            'aria-label': (mobile ? 'Partager le lien ' : 'Copier l\'adresse de ') + lien.titre,
            onclick: function () { mobile ? partager(lien) : copier(lien.url); }
          }, [icone(mobile ? 'partager' : 'copier', 16)]),
          el('button', {
            type: 'button', class: 'pj-icone', 'aria-label': 'Retirer le lien ' + lien.titre,
            onclick: function () {
              tache.liens = tache.liens.filter(function (l) { return l.id !== lien.id; });
              rendreLiens(); notifier(); annoncer('Lien retiré'); champLien.focus();
            }
          }, [icone('fermer', 14)])
        ]));
      });
    }

    var sectionLiens = el('section', { class: 'pj-section', 'aria-label': 'Liens' }, [
      el('div', { class: 'pj-entete' }, [el('span', { class: 'pj-titre', text: 'Liens' }), compteLiens]),
      listeLiens,
      el('div', { class: 'pj-ajout' }, [
        champLien,
        el('button', { type: 'button', class: 'pj-bouton', text: 'Ajouter', onclick: validerSaisieLien })
      ]),
      erreurLien
    ]);

    /* ===== Captures ===== */

    var compteCaptures = el('span', { class: 'pj-compte' });
    var grille = el('div', { class: 'pj-grille' });
    var entreeFichier = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    var entreePhoto = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    var erreurCapture = el('p', { class: 'pj-erreur', role: 'alert', hidden: true });
    var enCours = 0;

    function montrerErreurCapture(msg) { erreurCapture.textContent = msg; erreurCapture.hidden = false; }

    function ajouterFichiers(fichiers) {
      var images = Array.prototype.filter.call(fichiers || [], TAF.images.estImage);
      if (!images.length) { montrerErreurCapture('Seules les images sont acceptées (PNG, JPG, WebP, GIF).'); return; }
      var place = MAX_CAPTURES - tache.captures.length - enCours;
      if (place <= 0) { montrerErreurCapture('Maximum ' + MAX_CAPTURES + ' captures par tâche.'); return; }
      if (images.length > place) montrerErreurCapture('Seules ' + place + ' image(s) ont été ajoutées (maximum ' + MAX_CAPTURES + ').');
      else erreurCapture.hidden = true;

      images.slice(0, place).forEach(function (f) {
        enCours++; rendreCaptures();
        TAF.images.preparerCapture(f).then(function (p) {
          var meta = {
            id: TAF.liens.nouvelId(),
            nom: nomFichier(f, p.type),
            largeur: p.largeur, hauteur: p.hauteur, taille: p.taille, type: p.type,
            ajouteLe: new Date().toISOString()
          };
          return TAF.capturesDb.ajouter(Object.assign({ tacheId: tache.id, blob: p.blob, vignette: p.vignette }, meta))
            .then(function () {
              tache.captures.push(meta); notifier(); annoncer('Capture ajoutée');
              envoyerEnArrierePlan(meta);
            });
        }).catch(function (err) {
          montrerErreurCapture(err && err.message ? err.message : 'Impossible d\'ajouter cette image.');
        }).then(function () { enCours--; if (!detruit) rendreCaptures(); });
      });
    }

    function nomFichier(f, type) {
      var ext = type === 'image/webp' ? '.webp' : type === 'image/jpeg' ? '.jpg' : '.png';
      var base = (f.name && f.name !== 'image.png') ? f.name.replace(/\.[^.]+$/, '') : 'capture-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      return base + ext;
    }

    /* ----- état de synchronisation ----- */
    var etatSync = el('p', { class: 'pj-sync' });
    var envoisEnCours = 0, derniereErreur = '';

    function majEtatSync() {
      var s = sync();
      etatSync.className = 'pj-sync';
      if (!s) {
        etatSync.hidden = !TAF.capturesSync || !tache.captures.length;
        etatSync.textContent = 'Captures enregistrées sur cet appareil uniquement';
        etatSync.classList.add('pj-sync-local');
        return;
      }
      etatSync.hidden = !tache.captures.length && !envoisEnCours;
      var attente = tache.captures.filter(function (c) { return !c.synchro; }).length;
      if (envoisEnCours) { etatSync.textContent = 'Envoi en cours…'; etatSync.classList.add('pj-sync-encours'); }
      else if (attente) {
        etatSync.textContent = (derniereErreur || 'En attente') + ' · ' + attente + (attente > 1 ? ' captures seront envoyées' : ' capture sera envoyée') + ' dès que possible';
        etatSync.classList.add('pj-sync-attente');
      } else { etatSync.textContent = 'Captures disponibles sur tous vos appareils'; etatSync.classList.add('pj-sync-ok'); }
    }

    function envoyerEnArrierePlan(meta) {
      var s = sync();
      if (!s) { majEtatSync(); return; }
      envoisEnCours++; majEtatSync();
      s.envoyer(meta.id).then(function () {
        meta.synchro = true; derniereErreur = ''; notifier();
      }, function (err) {
        derniereErreur = err.message;
      }).then(function () { envoisEnCours--; if (!detruit) majEtatSync(); });
    }

    function rattraper() {
      var s = sync();
      if (!s) return;
      envoisEnCours++; majEtatSync();
      s.synchroniserTache(tache).then(function (n) {
        if (n) notifier();
        derniereErreur = tache.captures.some(function (c) { return !c.synchro; }) && navigator.onLine === false ? 'Hors ligne' : '';
      }).then(function () { envoisEnCours--; if (!detruit) majEtatSync(); });
    }
    window.addEventListener('online', rattraper);

    function retirerCapture(meta) {
      if (sync() && meta.synchro) sync().supprimer(meta.id).catch(function () {});
      TAF.capturesDb.supprimer(meta.id).then(function () {
        tache.captures = tache.captures.filter(function (c) { return c.id !== meta.id; });
        notifier(); rendreCaptures(); majEtatSync(); annoncer('Capture retirée');
      });
    }

    function urlDe(blob) { var u = URL.createObjectURL(blob); urlsObjets.push(u); return u; }

    function rendreCaptures() {
      grille.textContent = '';
      compteCaptures.textContent = tache.captures.length ? String(tache.captures.length) : '';

      tache.captures.forEach(function (meta) {
        var img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
        obtenirCapture(meta, tache.id).then(function (enr) {
          if (enr && !detruit) img.src = urlDe(enr.vignette || enr.blob);
          else if (!enr) img.replaceWith(el('span', { class: 'pj-absente', text: 'Image non disponible sur cet appareil' }));
        });
        grille.appendChild(el('figure', { class: 'pj-capture' }, [
          el('div', { class: 'pj-cadre' }, [
            el('button', {
              type: 'button', class: 'pj-vignette', 'aria-label': 'Agrandir ' + meta.nom,
              onclick: function () { ouvrirVisionneuse(meta); }
            }, [img]),
            el('button', {
              type: 'button', class: 'pj-retirer', 'aria-label': 'Retirer la capture ' + meta.nom,
              onclick: function () { retirerCapture(meta); }
            }, [icone('fermer', 12)])
          ]),
          el('figcaption', { text: meta.nom, title: meta.nom }),
          el('span', { class: 'pj-meta', text: dateCourte(meta.ajouteLe) + ' · ' + TAF.images.formaterPoids(meta.taille) })
        ]));
      });

      for (var i = 0; i < enCours; i++) {
        grille.appendChild(el('div', { class: 'pj-capture pj-chargement', 'aria-hidden': 'true' }, [el('div', { class: 'pj-cadre' })]));
      }

      if (tache.captures.length + enCours < MAX_CAPTURES) {
        grille.appendChild(el('button', {
          type: 'button', class: 'pj-depot',
          onclick: function () { entreeFichier.click(); }
        }, [icone('image', 22), el('span', { text: 'Ajouter une capture' })]));
      }
    }

    entreeFichier.addEventListener('change', function () { ajouterFichiers(entreeFichier.files); entreeFichier.value = ''; });
    entreePhoto.addEventListener('change', function () { ajouterFichiers(entreePhoto.files); entreePhoto.value = ''; });

    var actionsMobile = el('div', { class: 'pj-actions-mobile' }, [
      el('button', { type: 'button', class: 'pj-bouton pj-plein', onclick: function () { entreePhoto.click(); } }, [icone('photo', 20), ' Photo']),
      el('button', { type: 'button', class: 'pj-bouton', onclick: function () { entreeFichier.click(); } }, [icone('image', 20), ' Galerie'])
    ]);

    var sectionCaptures = el('section', { class: 'pj-section pj-zone', 'aria-label': 'Captures d\'écran' }, [
      el('div', { class: 'pj-entete' }, [el('span', { class: 'pj-titre', text: 'Captures d\'écran' }), compteCaptures]),
      grille,
      actionsMobile,
      el('p', { class: 'pj-aide', text: 'Glissez une image ici, collez-la avec Ctrl+V ou parcourez vos fichiers · PNG, JPG ou WebP' }),
      etatSync,
      erreurCapture,
      entreeFichier, entreePhoto
    ]);

    /* Glisser-déposer */
    var profondeur = 0;
    sectionCaptures.addEventListener('dragenter', function (e) {
      if (!aDesFichiers(e)) return;
      e.preventDefault(); profondeur++; sectionCaptures.classList.add('pj-survol');
    });
    sectionCaptures.addEventListener('dragover', function (e) { if (aDesFichiers(e)) e.preventDefault(); });
    sectionCaptures.addEventListener('dragleave', function () {
      profondeur = Math.max(0, profondeur - 1);
      if (!profondeur) sectionCaptures.classList.remove('pj-survol');
    });
    sectionCaptures.addEventListener('drop', function (e) {
      e.preventDefault(); profondeur = 0; sectionCaptures.classList.remove('pj-survol');
      ajouterFichiers(e.dataTransfer.files);
    });
    function aDesFichiers(e) {
      return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
    }

    /* Collage (Ctrl+V) n'importe où dans la fiche ouverte :
       - une image  → nouvelle capture
       - du texte contenant des adresses, hors champ de saisie → nouveaux liens */
    function surCollage(e) {
      if (!e.clipboardData) return;
      var fichiers = Array.prototype.filter.call(e.clipboardData.items || [], function (it) {
        return it.kind === 'file' && it.type.indexOf('image/') === 0;
      }).map(function (it) { return it.getAsFile(); }).filter(Boolean);
      if (fichiers.length) { e.preventDefault(); ajouterFichiers(fichiers); return; }

      var cible = e.target;
      var dansUnChamp = cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable);
      if (dansUnChamp) return; // laisser le collage normal
      var urls = TAF.liens.extraire(e.clipboardData.getData('text'));
      if (urls.length) { e.preventDefault(); ajouterLiens(urls); }
    }
    document.addEventListener('paste', surCollage);

    /* ===== Visionneuse ===== */

    var visionneuse = null;
    function ouvrirVisionneuse(meta) {
      obtenirCapture(meta, tache.id).then(function (enr) {
        if (!enr) return;
        var url = urlDe(enr.blob);
        var dernierFocus = document.activeElement;
        visionneuse = el('dialog', { class: 'pj-visionneuse', 'aria-label': meta.nom }, [
          el('div', { class: 'pj-vis-barre' }, [
            el('span', { text: meta.nom + ' · ' + meta.largeur + '×' + meta.hauteur }),
            el('a', { href: url, download: meta.nom, class: 'pj-vis-lien', text: 'Télécharger' }),
            el('button', { type: 'button', class: 'pj-icone', 'aria-label': 'Fermer', onclick: function () { visionneuse.close(); } }, [icone('fermer')])
          ]),
          el('img', { src: url, alt: meta.nom })
        ]);
        visionneuse.addEventListener('click', function (e) { if (e.target === visionneuse) visionneuse.close(); });
        visionneuse.addEventListener('close', function () {
          visionneuse.remove(); visionneuse = null;
          if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
        });
        document.body.appendChild(visionneuse);
        if (visionneuse.showModal) visionneuse.showModal(); else visionneuse.setAttribute('open', '');
      });
    }

    /* ===== Assemblage ===== */

    var zoneStatut = el('div', { class: 'pj-sr', 'aria-live': 'polite' });
    var racine = el('div', { class: 'pj' }, [sectionLiens, sectionCaptures, zoneStatut]);
    conteneur.appendChild(racine);
    rendreLiens();
    rendreCaptures();
    majEtatSync();
    rattraper();
    TAF.capturesDb.demanderPersistance();

    return {
      element: racine,
      rafraichir: function () { rendreLiens(); rendreCaptures(); majEtatSync(); },
      detruire: function () {
        detruit = true;
        document.removeEventListener('paste', surCollage);
        window.removeEventListener('online', rattraper);
        if (visionneuse) visionneuse.close();
        urlsObjets.forEach(function (u) { URL.revokeObjectURL(u); });
        urlsObjets = [];
        racine.remove();
      }
    };
  }

  /* ---------- indicateurs pour la liste, le Kanban et le mobile ---------- */

  function indicateurs(tache) {
    var nl = (tache.liens || []).length, nc = (tache.captures || []).length;
    var box = el('span', { class: 'pj-indicateurs' });
    if (nl) box.appendChild(el('span', { class: 'pj-ind', role: 'img', title: nl + (nl > 1 ? ' liens' : ' lien'), 'aria-label': nl + (nl > 1 ? ' liens' : ' lien') }, [icone('lien', 16), String(nl)]));
    if (nc) box.appendChild(el('span', { class: 'pj-ind', role: 'img', title: nc + (nc > 1 ? ' captures' : ' capture'), 'aria-label': nc + (nc > 1 ? ' captures' : ' capture') }, [icone('image', 16), String(nc)]));
    return box;
  }

  /* ---------- bloc pour la fiche imprimable ----------
     Adresses complètes (lisibles sur papier) + vignettes. Résout quand les images
     sont chargées : appeler window.print() APRÈS la promesse. */

  function blocImpression(tache) {
    var liens = tache.liens || [], caps = tache.captures || [];
    var bloc = el('div', { class: 'pj-print' });
    if (!liens.length && !caps.length) return Promise.resolve(bloc);

    if (liens.length) {
      bloc.appendChild(el('section', {}, [
        el('h2', { class: 'pj-print-titre', text: 'Liens (' + liens.length + ')' })
      ].concat(liens.map(function (l) {
        return el('div', { class: 'pj-print-lien' }, [
          el('strong', { text: l.titre }), el('span', { text: l.url })
        ]);
      }))));
    }

    var chargements = [];
    if (caps.length) {
      var grilleP = el('div', { class: 'pj-print-grille' });
      caps.forEach(function (meta) {
        var img = el('img', { alt: meta.nom });
        chargements.push(obtenirCapture(meta, tache.id).then(function (enr) {
          if (!enr) return;
          return new Promise(function (ok) {
            img.onload = img.onerror = ok;
            img.src = URL.createObjectURL(enr.vignette || enr.blob);
          });
        }));
        grilleP.appendChild(el('figure', {}, [img, el('figcaption', { text: meta.nom + ' · ' + dateCourte(meta.ajouteLe) })]));
      });
      bloc.appendChild(el('section', {}, [
        el('h2', { class: 'pj-print-titre', text: 'Captures d\'écran (' + caps.length + ')' }), grilleP
      ]));
    }
    return Promise.all(chargements).then(function () { return bloc; });
  }

  TAF.piecesJointes = {
    monter: monter,
    indicateurs: indicateurs,
    blocImpression: blocImpression,
    obtenirCapture: obtenirCapture,
    el: el,
    icone: icone,
    dateCourte: dateCourte,
    MAX_CAPTURES: MAX_CAPTURES
  };
})(window.TAF = window.TAF || {});
