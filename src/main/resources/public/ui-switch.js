/*
 * Bandeau d'invitation à la nouvelle IHM React de l'cahier de textes (CCTP 51C).
 *
 * Fichier SOURCE, servi tel quel (public/dist/, lui, reçoit la sortie du build Gulp/Webpack).
 * Volontairement en JavaScript natif, hors de l'application AngularJS : l'IHM historique n'a pas
 * à être modifiée pour accueillir sa relève, et ce fichier disparaîtra avec elle. Son balisage est
 * rendu par `view/diary.html` (les libellés passent ainsi par l'i18n du serveur) ; il ne reste
 * ici que la décision d'afficher et l'enregistrement du choix. Même mécanisme que l'Emploi du temps.
 *
 * L'état vit dans la préférence usager `diaryUi` (sans tiret : entcore retire les caractères non
 * alphanumériques des clés avant d'en faire un nom de propriété Cypher). Ex. :
 *   { "ui": "react", "invitationShown": 2, "returnShown": 1 }
 * `ui` est aussi lue par le serveur (DiaryController#preferredUi) pour servir la bonne IHM.
 */
(function () {
  'use strict';

  var PREFERENCE_URL = '/userbook/preference/diaryUi';
  /** Au-delà, l'usager a vu passer l'invitation : insister deviendrait pénible. */
  var MAX_INVITATIONS = 5;

  var banner = document.getElementById('diary-ui-switch');
  var fab = document.getElementById('diary-ui-fab');

  function xsrfHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    if (match) headers['X-XSRF-TOKEN'] = decodeURIComponent(match[1]);
    return headers;
  }

  function read() {
    return fetch(PREFERENCE_URL, { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        // L'enveloppe est { preference: "<json>" } — une CHAÎNE, pas un objet.
        if (!body || !body.preference) return {};
        try { return JSON.parse(body.preference) || {}; } catch (e) { return {}; }
      })
      .catch(function () { return {}; });
  }

  function write(preference) {
    return fetch(PREFERENCE_URL, {
      credentials: 'include',
      method: 'PUT',
      headers: xsrfHeaders(),
      body: JSON.stringify(preference),
    }).catch(function () { /* un choix d'habillage ne justifie pas d'alerter l'usager */ });
  }

  // Bascule permanente (bouton flottant), sans compteur : on peut aller et venir autant qu'on veut.
  // Elle n'écrit AUCUNE préférence (dérogation d'URL `?ui=` seule) et n'est montrée que si l'usager n'a
  // fait aucun choix dans les paramètres du compte : dès qu'une préférence y est affichée (nouvelle ou
  // ancienne version), la page de réglages gouverne et ce bouton disparaît.
  if (fab) {
    var menu = fab.querySelector('.diary-ui-fab-menu');
    fab.querySelector('[data-action="toggle"]').addEventListener('click', function () { menu.hidden = !menu.hidden; });
    Array.prototype.forEach.call(menu.querySelectorAll('[data-ui]'), function (item) {
      item.addEventListener('click', function () {
        window.location.href = '/diary?ui=' + item.getAttribute('data-ui');
      });
    });
    read().then(function (preference) {
      var explicit = preference.ui === 'react' || preference.ui === 'angular';
      var shown = typeof preference.invitationShown === 'number' ? preference.invitationShown : 0;
      // Le bouton laisse la place à l'invitation tant qu'elle est affichée, et prend le relais après.
      var invitationVisible = !!banner && !preference.invitationDismissed && shown < MAX_INVITATIONS;
      if (!explicit && !invitationVisible) fab.hidden = false;
    });
  }

  if (!banner) return;

  read().then(function (preference) {
    // Un choix explicite, dans un sens comme dans l'autre, clôt le sujet : quelqu'un qui est
    // REVENU à l'ancienne IHM a déjà tranché, le réinviter à chaque visite serait insistant.
    if (preference.ui === 'react' || preference.ui === 'angular') return;
    if (preference.invitationDismissed) return;
    var shown = typeof preference.invitationShown === 'number' ? preference.invitationShown : 0;
    if (shown >= MAX_INVITATIONS) return;

    banner.hidden = false;
    preference.invitationShown = shown + 1;
    write(preference);

    banner.querySelector('[data-action="try"]').addEventListener('click', function () {
      preference.ui = 'react';
      // `?ui=react` double l'enregistrement : la préférence fraîchement écrite peut manquer au cache
      // de la session en cours, la dérogation d'URL est honorée sans condition.
      write(preference).then(function () { window.location.href = '/diary?ui=react'; });
    });

    banner.querySelector('[data-action="later"]').addEventListener('click', function () {
      preference.invitationDismissed = true;
      write(preference);
      banner.hidden = true;
      if (fab) fab.hidden = false;
    });
  });
})();
