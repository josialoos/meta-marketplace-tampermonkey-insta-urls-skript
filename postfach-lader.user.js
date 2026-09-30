// ==UserScript==
// @name         Postfach: eigene Markierungen
// @namespace    local.inbox-followups
// @version      2.8
// @description  Lädt den aktuellen Stand der Postfach-Markierungen aus dem Repo. Einmal installieren, danach reicht ein Neuladen der Seite.
// @match        https://business.facebook.com/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-lader.user.js
// @downloadURL  https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-lader.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      api.clickup.com
// @connect      aff-api.uppromote.com
// @sandbox      JavaScript
// ==/UserScript==

// ==========================================================================
// ACHTUNG, DIESER LADER IST ZURUECKGESTELLT UND DARF NICHT INSTALLIERT WERDEN.
//
// Am 30.09.2026 stand er versehentlich auf dem Windows-Rechner. Ergebnis: im
// Postfach gab es keine einzige Pille mehr, und die Ursache war von aussen
// nicht zu sehen. Der Grund ist die Kennung unten:
//
//   @name und @namespace sind absichtlich identisch mit dem Kernskript.
//   Im Tampermonkey-Dashboard heisst der Lader deshalb genauso und steht
//   auf aktiv. Unterscheiden lassen sich beide nur an der Versionsnummer:
//     2.8  = dieser Lader (zeigt nichts an)
//     2.9+ = das Kernskript postfach-markierungen.user.js (funktioniert)
//
//   Dazu zeigt die @updateURL hier auf die Lader-Datei. Der Lader bleibt
//   damit fuer immer auf 2.8 und zieht nie auf eine neuere Kernversion nach.
//
// Zurueck auf den Kern kommt man, indem man dessen Rohadresse aufruft und die
// Installation bestaetigt. Weil Name und Namespace gleich sind, ersetzt das den
// Lader und der Tampermonkey-Speicher mit Token und Markierungen bleibt erhalten.
// Nicht loeschen und neu installieren, das nimmt den Speicher mit.
//
// Bevor der Lader wiederbelebt wird: erst die fehlende Oberflaeche klaeren und
// ihm eine eigene Kennung geben, damit er nie wieder unbemerkt den Kern ersetzt.
// Der gemeinsame Speicher muss dann bewusst uebernommen werden.
// ==========================================================================

// Warum dieser Lader:
// Jede Änderung am Skript bedeutete bisher: Adresse aufrufen, Installation
// bestätigen. Bei der Menge an Korrekturen ist das lästig. Der Lader holt den
// Code bei jedem Seitenaufruf frisch aus dem Repo, danach genügt ein Neuladen.
//
// Name und Namespace sind bewusst identisch mit dem bisherigen Skript. Der
// Tampermonkey-Speicher hängt an dieser Kennung, und dort liegen Markierungen,
// Token und Handles. Ein anderer Name hätte sie alle verloren.
//
// Fällt GitHub aus, läuft die zuletzt erfolgreich geladene Fassung weiter, die
// liegt im Tampermonkey-Speicher.

(function () {
  'use strict';

  const KERN_URL = 'https://raw.githubusercontent.com/josialoos/'
    + 'meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-markierungen.user.js';
  const CACHE = 'kern:cache:v1';

  // Das Fragment sofort festhalten. Meta schreibt die Adresse beim Laden neu
  // und wirft es dabei weg, oft bevor der Kern überhaupt läuft.
  const startHash = String(location.hash || '');

  function holen() {
    return new Promise((erfuellen, ablehnen) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: KERN_URL + '?frisch=' + Date.now(),
        headers: { 'Cache-Control': 'no-cache' },
        timeout: 15000,
        onload: (a) => {
          if (a.status >= 200 && a.status < 300 && a.responseText) erfuellen(a.responseText);
          else ablehnen(new Error('HTTP ' + a.status));
        },
        onerror: () => ablehnen(new Error('Netzwerkfehler')),
        ontimeout: () => ablehnen(new Error('Zeitüberschreitung')),
      });
    });
  }

  function starten(code, herkunft) {
    try {
      // Die GM-Funktionen werden ausdrücklich übergeben. new Function erbt den
      // umgebenden Geltungsbereich nicht, damit ist klar, was der Kern bekommt.
      const fn = new Function(
        'GM_getValue', 'GM_setValue', 'GM_addValueChangeListener', 'GM_xmlhttpRequest',
        'IGFU_START_HASH', code,
      );
      fn(GM_getValue, GM_setValue, GM_addValueChangeListener, GM_xmlhttpRequest, startHash);
      console.info('[Markierungen] Kern geladen (' + herkunft + ').');
    } catch (e) {
      console.error('[Markierungen] Kern ließ sich nicht starten:', e && e.message);
    }
  }

  (async () => {
    let code = '';
    try {
      const frisch = await holen();
      // Grobe Plausibilität, damit eine Fehlerseite nicht als Code durchgeht
      if (frisch && frisch.length > 5000 && frisch.includes('igfu-launch')) {
        code = frisch;
        GM_setValue(CACHE, { code: frisch, stand: Date.now() });
      }
    } catch (e) {
      console.warn('[Markierungen] Konnte den Kern nicht laden:', e && e.message);
    }
    if (code) return starten(code, 'frisch aus dem Repo');

    const zwischen = GM_getValue(CACHE, null);
    if (zwischen && zwischen.code) {
      const alter = Math.round((Date.now() - (zwischen.stand || 0)) / 3600000);
      return starten(zwischen.code, 'zwischengespeichert, ' + alter + ' Stunden alt');
    }
    console.error('[Markierungen] Kein Code verfügbar, weder frisch noch zwischengespeichert.');
  })();
})();
