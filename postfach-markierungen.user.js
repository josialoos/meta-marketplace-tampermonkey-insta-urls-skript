// ==UserScript==
// @name         Postfach: eigene Markierungen
// @namespace    local.inbox-followups
// @version      8.8
// @description  Eigene Follow-up-Markierungen in den Instagram-Nachrichten, dazu die Anbindung an ClickUp und das Erfassen von Creatorn im Creator Marketing Hub.
// @match        https://business.facebook.com/*
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/vorlagen-im-hauptskript/postfach-markierungen.user.js
// @downloadURL  https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/vorlagen-im-hauptskript/postfach-markierungen.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      api.clickup.com
// @connect      aff-api.uppromote.com
// @connect      graph.facebook.com
// @sandbox      JavaScript
// ==/UserScript==

// Hinweis zum @match: Die Business Suite wechselt zwischen Bereichen ohne neu zu
// laden. Das Skript muss deshalb auf der ganzen Domain geladen werden, prüft aber
// ständig den Pfad und tut außerhalb von /latest/inbox nichts.
//
// Hinweis zum Speicher: Die Markierungen liegen in Tampermonkeys eigenem Speicher.
// Der Seitenspeicher (localStorage) wird von Meta beim Laden aufgeräumt und ist
// deshalb ungeeignet. @sandbox JavaScript sorgt dafür, dass das Skript Metas
// Seitendaten (die Thread-IDs) lesen kann.
//
// Hinweis zu ClickUp: Der API-Token liegt ausschliesslich in Tampermonkeys Speicher
// und wird bei jeder Anfrage frisch von dort gelesen. Er landet nie am window-Objekt,
// nie im DOM und nie in einer Fehlermeldung. Alle Anfragen laufen ueber
// GM_xmlhttpRequest, nie ueber fetch, weil das Skript im Seitenkontext von Meta laeuft.
//
// Hinweis zu Updates: Tampermonkey holt neue Versionen automatisch von GitHub
// (@updateURL). Manuell: Tampermonkey-Menü → „Nach Userscript-Updates suchen".
// Der Speicher gehört zum installierten Skript und bleibt bei Updates erhalten.

(function () {
  'use strict';

  // Meta schreibt die Adresse beim Laden neu und wirft dabei das Fragment
  // #igfu=<threadID> weg. Gemessen war es schon nach zwei Sekunden verschwunden,
  // lange bevor die Unterhaltungsliste ueberhaupt existiert. Deshalb wird es
  // hier als Allererstes festgehalten.
  const HASH_MUSTER = /igfu=([A-Za-z0-9_-]+)/;
  // Laeuft dieser Kern ueber den Lader, hat der das Fragment schon vor uns
  // gelesen und reicht es als IGFU_START_HASH herein. Laeuft er allein
  // installiert, gibt es die Variable nicht.
  const vomLader = typeof IGFU_START_HASH === 'string' ? IGFU_START_HASH : '';
  let gemerkterThread = (String(location.hash || vomLader).match(HASH_MUSTER) || [])[1]
    || (String(vomLader).match(HASH_MUSTER) || [])[1] || '';

  // ---------- Aussehen ----------

  const PINK = '#e1306c';
  const BLACK = '#1c1e21';   // Ungelesen
  const YELLOW = '#f7c600';  // Follow-up

  const CSS = `
    .igfu-tags {
      position: absolute; bottom: 7px; z-index: 2;
      display: flex; flex-direction: row; flex-wrap: nowrap; gap: 6px;
      width: max-content;
      /* Der Streifen darf keine Klicks abfangen, sonst laesst sich das untere
         Drittel der Zeile nicht anklicken und Meta oeffnet die Unterhaltung
         nicht. Nur sichtbare Knoepfe nehmen Klicks an, siehe unten. */
      pointer-events: none;
    }
    .igfu-tags > .igfu-tag {
      position: static; flex: none;
      display: inline-flex; align-items: center; gap: 4px;
      height: 20px; padding: 0 8px; border-radius: 10px;
      border: 1px solid #ccd0d5; background: #fff; color: #65676b;
      font-family: inherit; font-size: 11px; font-weight: 600; line-height: 1;
      cursor: pointer; opacity: 0; transition: opacity .12s;
      pointer-events: none;
    }
    .igfu-tag[data-kind="followup"]::before { content: "⚑"; font-size: 11px; }
    [data-igfu-row]:hover .igfu-tag, .igfu-tag:focus-visible { opacity: 1; pointer-events: auto; }
    .igfu-tag:focus-visible { outline: 2px solid ${PINK}; outline-offset: 1px; }
    .igfu-tag.on { opacity: 1; pointer-events: auto; }
    .igfu-tag.on[data-kind="followup"] { background: ${YELLOW}; border-color: #e0b400; color: ${BLACK}; }
    .igfu-tag[data-kind="crm"]::before {
      content: ""; width: 7px; height: 7px; border-radius: 2px;
      background: currentColor; box-sizing: border-box;
    }
    .igfu-tag[data-kind="crm"].on { color: #fff; }
    .igfu-tag[data-kind="crm"].on::before { background: #fff; }
    .igfu-tag[data-kind="crm"][hidden] { display: none; }

    /* Follow-up: gelber Balken links */
    [data-igfu-follow] { box-shadow: inset 3px 0 0 ${YELLOW}; }


    [data-igfu-flash] { animation: igfu-flash 1.8s ease-out; }
    @keyframes igfu-flash { 0%, 30% { background-color: #fde7ef; } 100% { background-color: transparent; } }

    #igfu-launch {
      position: fixed; left: 88px; bottom: 14px; z-index: 2147483000;
      display: inline-flex; align-items: center; gap: 10px;
      height: 32px; padding: 0 14px; border-radius: 16px;
      border: 1px solid #ccd0d5; background: #fff; color: #1c2b33;
      font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,.12);
    }
    #igfu-launch.has { background: ${PINK}; border-color: ${PINK}; color: #fff; }
    #igfu-launch:focus-visible { outline: 2px solid #1c2b33; outline-offset: 2px; }
    .igfu-due-badge { background: #fff; color: #b4103a; border-radius: 9px; padding: 2px 7px; font-size: 11px; }

    #igfu-refresh {
      position: fixed; left: 88px; bottom: 14px; z-index: 2147483000;
      display: inline-flex; align-items: center; gap: 8px;
      height: 32px; padding: 0 14px; border-radius: 16px;
      border: 1px solid ${PINK}; background: #fff; color: ${PINK};
      font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,.12);
    }
    #igfu-refresh:hover { background: #fff0f5; }
    #igfu-filter {
      position: fixed; z-index: 2147483000; cursor: pointer;
      border: 1px solid #dadde1; border-radius: 999px; background: #fff;
      color: #1c1e21; font: 500 12px/1 system-ui, sans-serif; padding: 7px 12px;
    }
    #igfu-filter:hover { background: #f2f3f5; }
    #igfu-filter.on { background: ${BLACK}; border-color: ${BLACK}; color: #fff; }
    #igfu-filter[hidden] { display: none; }
    #igfu-refresh[disabled] { cursor: default; opacity: .75; }
    #igfu-refresh:focus-visible { outline: 2px solid ${PINK}; outline-offset: 2px; }
    #igfu-refresh::before { content: "⟳"; font-size: 15px; line-height: 1; }
    #igfu-refresh[hidden] { display: none; }

    #igfu-tipp {
      position: fixed; z-index: 2147483002;
      width: 320px; padding: 12px 14px; border-radius: 10px;
      background: #1c2b33; color: #fff;
      font-family: inherit; font-size: 12px; line-height: 1.5;
      box-shadow: 0 8px 24px rgba(0,0,0,.24);
      opacity: 0; pointer-events: none; transition: opacity .12s;
    }
    #igfu-tipp.show { opacity: 1; }
    #igfu-tipp b { display: block; margin-bottom: 6px; font-size: 13px; }
    #igfu-tipp ul { margin: 0; padding-left: 16px; }
    #igfu-tipp li { margin: 2px 0; }
    #igfu-tipp .igfu-tipp-fuss { margin-top: 8px; color: #b9c3c9; }

    #igfu-panel {
      position: fixed; left: 88px; bottom: 54px; z-index: 2147483000;
      width: 360px; max-height: min(72vh, 640px);
      display: flex; flex-direction: column;
      background: #fff; color: #1c2b33; font-family: inherit; font-size: 13px;
      border: 1px solid #dadde1; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.18);
    }
    #igfu-panel[hidden] { display: none; }

    /* Nachfrage nach einem fehlenden Handle. Bewusst kein echter Modal-Dialog:
       das Anlegen laeuft weiter, der Kasten haelt niemanden auf. */
    #igfu-frage {
      position: fixed; inset: 0; z-index: 2147483100;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.35);
    }
    .igfu-frage-kasten {
      width: 420px; max-width: calc(100vw - 32px);
      display: flex; flex-direction: column; gap: 8px;
      background: #fff; color: #1c2b33; font-family: inherit; font-size: 13px;
      border-radius: 12px; padding: 18px 20px;
      box-shadow: 0 16px 48px rgba(0,0,0,.28);
    }
    .igfu-frage-kasten b { font-size: 15px; }
    .igfu-frage-wer { font-weight: 600; color: ${PINK}; }
    .igfu-frage-text { color: #65676b; line-height: 1.45; }
    .igfu-frage-kasten input {
      width: 100%; box-sizing: border-box; padding: 7px 9px; font: inherit;
      border: 1px solid #dadde1; border-radius: 8px;
    }
    .igfu-frage-kasten input:focus { outline: 2px solid ${PINK}; outline-offset: -1px; }
    .igfu-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 10px 16px; border-bottom: 1px solid #e4e6eb; }
    .igfu-head h2 { margin: 0; font-size: 15px; font-weight: 700; }
    .igfu-head-actions { display: flex; align-items: center; gap: 4px; }
    .igfu-body { overflow-y: auto; }
    .igfu-section-title { margin: 0; padding: 12px 16px 4px; font-size: 12px; font-weight: 700; color: #65676b; }
/* Instagram liefert seine Farben als CSS-Variablen, und zwar als RGB-Tripel
   („12, 16, 20"), nicht als fertige Farben — deshalb rgb(var(--…)). Im
   dunklen Modus tragen dieselben Variablen dunkle Werte, das Panel folgt
   also von allein, auch wenn Instagram in der Oberflaeche umgeschaltet wird.
   Die Angaben hinter dem Komma sind der Rueckfall, falls Meta die Variablen
   eines Tages umbenennt.

   Feste Farben standen hier bis 8.1 und waren der Grund, warum der Knopf im
   dunklen Modus kaum zu sehen war und die Schrift im Formular hell auf hell
   stand. Das „Reparieren" mit anderen festen Farben hatte den Fehler nur auf
   die andere Seite verschoben. */
.igfu-vl-knopf { display: flex; align-items: center; gap: 6px; border: 0; background: transparent;
  cursor: pointer; padding: 6px 10px; border-radius: 8px; font: inherit; font-size: 14px;
  color: rgb(var(--ig-primary-text, 12, 16, 20)); }
.igfu-vl-knopf:hover { background: rgb(var(--ig-highlight-background, 243, 245, 247)); }
.igfu-vl-panel { position: fixed; z-index: 2147483000; width: 380px; max-height: 60vh; display: flex;
  flex-direction: column; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.28);
  font: 14px/1.45 system-ui, -apple-system, sans-serif;
  background: rgb(var(--ig-elevated-background, 255, 255, 255));
  color: rgb(var(--ig-primary-text, 12, 16, 20));
  border: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-vl-kopf { display: flex; gap: 8px; align-items: center; padding: 10px;
  border-bottom: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-vl-liste { overflow: auto; padding: 6px; }
.igfu-vl-eintrag { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border-radius: 8px; cursor: pointer; }
.igfu-vl-eintrag:hover { background: rgb(var(--ig-highlight-background, 243, 245, 247)); }
.igfu-vl-text { flex: 1; min-width: 0; }
.igfu-vl-titel { font-weight: 600; margin-bottom: 2px; }
.igfu-vl-kuerzel { margin-left: 6px; font-weight: 400; font-size: 11px;
  color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-vl-leiste { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 10px;
  border-bottom: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-vl-wer { border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px;
  cursor: pointer; background: transparent;
  border: 1px solid rgb(var(--ig-separator, 219, 223, 228));
  color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-vl-wer:hover { background: rgb(var(--ig-highlight-background, 243, 245, 247)); }
.igfu-vl-wer-an { background: rgb(var(--ig-primary-text, 12, 16, 20));
  border-color: rgb(var(--ig-primary-text, 12, 16, 20));
  color: rgb(var(--ig-elevated-background, 255, 255, 255)); }
.igfu-vl-vorschau { color: rgb(var(--ig-secondary-text, 106, 113, 122)); font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.igfu-vl-fuss { display: flex; gap: 8px; padding: 8px 10px; align-items: center;
  border-top: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-vl-form { padding: 10px; overflow: auto; }
.igfu-vl-feld, .igfu-vl-suche { width: 100%; box-sizing: border-box; border-radius: 8px;
  padding: 8px; font: inherit; margin-bottom: 8px;
  border: 1px solid rgb(var(--ig-separator, 219, 223, 228));
  background: rgb(var(--ig-primary-background, 255, 255, 255));
  color: rgb(var(--ig-primary-text, 12, 16, 20)); }
.igfu-vl-suche { flex: 1; width: auto; margin-bottom: 0; }
.igfu-vl-feld::placeholder, .igfu-vl-suche::placeholder { color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-vl-gross { min-height: 160px; resize: vertical; }

/* --- Knoepfe in den beiden hellen/dunklen Panels (Anfang) ---
   .igfu-link und .igfu-close tragen global color: #1c2b33 auf durchsichtigem
   Grund. Im Dark Mode ist das fast schwarz auf dunkel, also unsichtbar — und
   erst beim Ueberfahren kommt ein heller Hintergrund dazu und macht die
   Schrift lesbar. Am 26.10.2026 im Vorlagen-Widget aufgefallen.

   Die Farben kommen aus Instagrams eigenen Token, am 27.10.2026 an der
   laufenden Seite abgefragt:

       --ig-primary-button    74, 93, 249   das Blau/Lila der Oberflaeche
       --ig-text-on-color    255, 255, 255  Schrift auf farbigem Grund

   Warum nicht den Modus erkennen und zwei Farbsaetze pflegen: eine eigene
   Erkennung kann dem widersprechen, was Instagram tatsaechlich rendert. Am
   27.10.2026 gemessen — die Klasse __fb-light-mode auf <html> gegen
   __fb-dark-mode zu tauschen aendert die Variablen *nicht*. Wer sich auf die
   Klasse verliesse, laege falsch. Instagrams Klassennamen selbst zu benutzen
   scheidet auch aus, die sind verschleiert und wechseln mit jedem Deploy.
   Die Variablen sind die stabile Schnittstelle.

   Was keine Farbe braucht, erbt: color: inherit nimmt die Schriftfarbe des
   Panels, und die setzen beide Panels bereits aus --ig-primary-text. Schrift
   und Grund koennen so gar nicht auseinanderlaufen. Die Hintergruende beim
   Ueberfahren sind durchscheinendes Grau — das hellt auf hellem Grund auf
   und dunkelt auf dunklem ab, ohne eine Farbe zu kennen.

   Global geht das alles nicht: #igfu-panel hat noch einen fest eingebauten
   weissen Grund. */
.igfu-vl-panel .igfu-link, .igfu-ko .igfu-link {
  color: rgb(var(--ig-primary-button, 74, 93, 249)); }
.igfu-vl-panel .igfu-done, .igfu-ko .igfu-done {
  background: rgb(var(--ig-primary-button, 74, 93, 249));
  color: rgb(var(--ig-text-on-color, 255, 255, 255)); }
.igfu-vl-panel .igfu-done:hover, .igfu-ko .igfu-done:hover { filter: brightness(1.1); }
.igfu-vl-panel .igfu-done:disabled, .igfu-ko .igfu-done:disabled { opacity: .55; }
.igfu-vl-panel .igfu-link:hover, .igfu-vl-panel .igfu-close:hover,
.igfu-ko .igfu-link:hover, .igfu-ko .igfu-close:hover {
  background: rgba(128, 128, 128, .20); }
.igfu-vl-panel .igfu-close, .igfu-ko .igfu-close { color: inherit; opacity: .7; }
.igfu-vl-panel .igfu-empty, .igfu-ko .igfu-empty { color: inherit; opacity: .7; }
/* --- Knoepfe in den beiden Panels (Ende) --- */

/* Die Leiste neben dem Namen in der geoeffneten Unterhaltung. Dieselben
   Knoepfe wie an den Zeilen, nur sitzen sie fest statt absolut und sind
   immer sichtbar — hier gibt es kein Ueberfahren der Zeile. */
.igfu-kopf { position: static; bottom: auto; z-index: auto;
  margin-left: 10px; align-self: center; pointer-events: auto;
  /* In die Breite, nicht in die Hoehe: die Leiste sitzt in derselben Zeile
     wie der Name und bricht nie um. Wird es eng, laesst sie sich seitlich
     schieben, statt den Kopf hoeher zu machen. */
  flex-wrap: nowrap; width: auto; max-width: min(62vw, 760px);
  overflow-x: auto; scrollbar-width: none; }
.igfu-kopf::-webkit-scrollbar { display: none; }
.igfu-kopf > .igfu-tag { max-width: 180px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.igfu-tag[data-kind="tag"].on { color: #fff; }
.igfu-tag[data-kind="tagmenue"] { font-weight: 700; }
.igfu-kopf > .igfu-tag { opacity: 1; pointer-events: auto; }
.igfu-tag[data-kind="postfach"]::before {
  content: ""; width: 8px; height: 8px; border-radius: 50%;
  background: #d93025; box-sizing: border-box; }
.igfu-tag[data-kind="postfach"].on::before { background: #0b8043; }
.igfu-tag[data-kind="postfach"][disabled] { cursor: default; opacity: .7; }

/* Das Auswahlmenue an der Status- und an der Tag-Pille */
.igfu-menue { position: fixed; z-index: 2147483100; min-width: 220px; max-width: 280px;
  max-height: 60vh; overflow: auto; padding: 6px; border-radius: 10px;
  border: 1px solid rgb(var(--ig-separator, 219, 223, 228)); box-shadow: 0 8px 28px rgba(0,0,0,.28);
  background: rgb(var(--ig-elevated-background, 255, 255, 255));
  color: rgb(var(--ig-primary-text, 12, 16, 20));
  font: 13px/1.4 system-ui, -apple-system, sans-serif; }
.igfu-menue-zeile { display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 8px; border: 0; border-radius: 8px; background: transparent;
  color: inherit; font: inherit; text-align: left; cursor: pointer; }
.igfu-menue-zeile:hover:not(:disabled) { background: rgba(128, 128, 128, .20); }
.igfu-menue-zeile:disabled { opacity: .45; cursor: default; }
.igfu-menue-text { flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.igfu-menue-punkt { width: 9px; height: 9px; border-radius: 50%; flex: none;
  background: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-menue-haken { flex: none; opacity: .8; }
.igfu-menue-trenner { height: 1px; margin: 5px 4px; background: rgb(var(--ig-separator, 219, 223, 228)); }

/* Notizen am rechten Rand */
.igfu-ko { position: fixed; right: 0; top: 84px; z-index: 2147483000;
  display: flex; align-items: stretch; max-height: calc(100vh - 168px);
  font: 13px/1.45 system-ui, -apple-system, sans-serif; }
.igfu-ko-griff { display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: 30px; padding: 10px 0; cursor: pointer; font: inherit;
  border: 1px solid rgb(var(--ig-separator, 219, 223, 228)); border-right: none; border-radius: 10px 0 0 10px;
  background: rgb(var(--ig-elevated-background, 255, 255, 255));
  color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-ko-griff:hover { background: rgb(var(--ig-highlight-background, 243, 245, 247)); }
.igfu-ko-schrift { writing-mode: vertical-rl; text-orientation: mixed;
  font-size: 11px; font-weight: 600; letter-spacing: .02em; }
.igfu-ko-koerper { width: 300px; display: flex; flex-direction: column; min-height: 0;
  border: 1px solid rgb(var(--ig-separator, 219, 223, 228)); border-right: none;
  background: rgb(var(--ig-elevated-background, 255, 255, 255));
  color: rgb(var(--ig-primary-text, 12, 16, 20));
  box-shadow: -8px 0 28px rgba(0,0,0,.18); }
.igfu-ko-kopf { display: flex; justify-content: space-between; align-items: center;
  padding: 10px; border-bottom: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-ko-handle { display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-bottom: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-ko-at { font-weight: 600; text-decoration: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: rgb(var(--ig-primary-text, 12, 16, 20)); }
.igfu-ko-at:hover { text-decoration: underline; }
.igfu-ko-kopie { margin-left: auto; flex: none; }
.igfu-ko-leer { color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-ko-verlauf { flex: 1; min-height: 0; overflow: auto; padding: 4px 10px; }
.igfu-ko-eintrag { padding: 8px 0; border-bottom: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-ko-eintrag:last-child { border-bottom: none; }
.igfu-ko-zeile { display: flex; gap: 8px; justify-content: space-between;
  font-size: 11px; margin-bottom: 3px;
  color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
.igfu-ko-wer { font-weight: 600; }
.igfu-ko-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.igfu-ko-fuss { display: flex; flex-direction: column; gap: 6px;
  padding: 8px 10px; border-top: 1px solid rgb(var(--ig-separator, 219, 223, 228)); }
.igfu-ko-feld { width: 100%; box-sizing: border-box; min-height: 64px; resize: vertical;
  border-radius: 8px; padding: 8px; font: inherit; border: 1px solid rgb(var(--ig-separator, 219, 223, 228));
  background: rgb(var(--ig-primary-background, 255, 255, 255));
  color: rgb(var(--ig-primary-text, 12, 16, 20)); }
.igfu-ko-feld::placeholder { color: rgb(var(--ig-secondary-text, 106, 113, 122)); }
    .igfu-list { list-style: none; margin: 0; padding: 0 0 4px; }
    .igfu-empty { padding: 20px 16px; color: #65676b; line-height: 1.45; }
    .igfu-item { padding: 10px 16px 12px; border-bottom: 1px solid #f0f2f5; }
    .igfu-list:last-child .igfu-item:last-child { border-bottom: 0; }
    .igfu-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .igfu-name { all: unset; font-weight: 700; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .igfu-name:hover { text-decoration: underline; }
    .igfu-name:focus-visible { outline: 2px solid ${PINK}; outline-offset: 2px; border-radius: 3px; }
    .igfu-due { flex: none; font-size: 12px; color: #65676b; }
    .igfu-due.today { color: #1c2b33; font-weight: 700; }
    .igfu-due.late { color: #b4103a; font-weight: 700; }
    .igfu-item-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .igfu-date { display: flex; align-items: center; gap: 6px; margin-right: auto; font-size: 12px; color: #65676b; }
    .igfu-date input { font: inherit; font-size: 12px; color: #1c2b33; border: 1px solid #ccd0d5; border-radius: 6px; padding: 2px 4px; }
    .igfu-note {
      display: block; box-sizing: border-box; width: 100%; margin-top: 8px; resize: vertical;
      font: inherit; font-size: 12px; line-height: 1.4; color: #1c2b33;
      border: 1px solid #ccd0d5; border-radius: 6px; padding: 6px 8px;
    }
    .igfu-note:focus, .igfu-date input:focus { outline: 2px solid ${PINK}; outline-offset: 0; border-color: transparent; }
    .igfu-meta { margin-top: 6px; font-size: 11px; color: #8a8d91; }
    .igfu-auswahl { margin-top: 6px; max-width: 100%; font-size: 12px; padding: 4px 6px;
      border: 1px solid #dadde1; border-radius: 6px; background: #fff; color: #1c1e21; }
    .igfu-link, .igfu-done, .igfu-close {
      font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
      border-radius: 6px; padding: 4px 8px; border: 0; background: transparent; color: #1c2b33;
    }
    .igfu-link:hover, .igfu-close:hover { background: #f0f2f5; }
    .igfu-done { background: #f0f2f5; }
    .igfu-done:hover { background: #e4e6eb; }
    .igfu-close { font-size: 18px; line-height: 1; padding: 2px 8px; color: #65676b; }
    .igfu-link:focus-visible, .igfu-done:focus-visible, .igfu-close:focus-visible { outline: 2px solid ${PINK}; outline-offset: 1px; }

    .igfu-crm-pille {
      display: block; width: fit-content; margin-top: 3px; padding: 1px 9px 2px;
      border-radius: 999px; border: 1px solid #ccd0d5; background: #fff; color: #65676b;
      font: inherit; font-size: 11px; font-weight: 600; line-height: 16px;
      white-space: nowrap; cursor: pointer; user-select: none;
    }
    .igfu-crm-pille[data-an="1"] { color: #fff; border-color: transparent; }

    .igfu-form { padding: 14px 16px 16px; border-bottom: 1px solid #e4e6eb; background: #f7f8fa; }
    .igfu-form[hidden] { display: none; }
    .igfu-form label { display: block; margin-bottom: 10px; font-size: 12px; font-weight: 600; color: #65676b; }
    .igfu-form input {
      display: block; box-sizing: border-box; width: 100%; margin-top: 4px;
      font: inherit; font-size: 12px; color: #1c2b33;
      border: 1px solid #ccd0d5; border-radius: 6px; padding: 6px 8px;
    }
    .igfu-form input:focus { outline: 2px solid ${PINK}; outline-offset: 0; border-color: transparent; }
    .igfu-form-hinweis { margin: 0 0 10px; font-size: 11px; line-height: 1.45; color: #8a8d91; }
    .igfu-form-knoepfe { display: flex; flex-wrap: wrap; gap: 6px; }

    #igfu-toast {
      position: fixed; left: 88px; bottom: 54px; z-index: 2147483001;
      max-width: 340px; padding: 10px 14px; border-radius: 8px;
      background: #1c2b33; color: #fff; font-family: inherit; font-size: 13px; line-height: 1.4;
      opacity: 0; transform: translateY(6px); pointer-events: none; transition: opacity .15s, transform .15s;
    }
    #igfu-toast.show { opacity: 1; transform: none; }

    @media (prefers-reduced-motion: reduce) {
      .igfu-tag, #igfu-toast { transition: none; }
      [data-igfu-flash] { animation: none; outline: 2px solid ${PINK}; outline-offset: -2px; }
    }
  `;

  // Muss mit @version im Kopf uebereinstimmen; ein Test prueft das. Sie steht
  // im Panel, weil „habe ich eigentlich die neue Fassung?" sonst jedes Mal
  // Ratearbeit ist — und zweimal schon in die falsche Richtung gefuehrt hat.
  const VERSION = '8.8';
  const INBOX_PATH = /^\/latest\/inbox(\/|$)/;
  // Seit Oktober 2026 wird auf instagram.com gearbeitet. Meta hat die
  // Partner-Nachrichten in den Creator Marketing Hub ausgelagert, und der kennt
  // keinen Deep-Link — weder auf eine Unterhaltung noch auf eine Suche. Ohne
  // Verlinkung aus ClickUp heraus ist das Arbeiten zu aufwendig.
  //
  // instagram.com hat einen, und zwar seit Jahren unveraendert:
  //     https://www.instagram.com/direct/t/<thread_key>/
  // Dort wird gelesen, geschrieben und erstangeschrieben. Der Hub bleibt fuer
  // die Recherche, das alte Postfach laeuft weiter, bis die Altlinks umgestellt
  // sind.
  const IG_HOST = 'www.instagram.com';
  const IG_PATH = /^\/direct(\/|$)/;
  const isIG = () => location.hostname === IG_HOST && IG_PATH.test(location.pathname);
  // „Postfach" meint ab hier beide Listen. Alles darauf — Chips, Pillen, Panel,
  // Uebertragung — ist in beiden gleich.
  const isInbox = () => (location.hostname !== IG_HOST && INBOX_PATH.test(location.pathname)) || isIG();
  // Der Marketplace ist die Stelle, an der das Handle sicher bekannt ist. Wer hier
  // erfasst wird, hat es von Anfang an im Task stehen.
  const MARKT_PATH = /^\/(latest\/creator_marketplace|creator_marketing_hub)(\/|$)/;
  const isMarkt = () => MARKT_PATH.test(location.pathname);
  // Die Inhalte-Seite des Creator-Marketing-Hubs. Dort liegt pro Content-Kachel,
  // ob wir darauf eine Anzeige schalten duerfen.
  const INHALTE_PATH = /^\/creator_marketing_hub\/ad_content(\/|$)/;
  const isInhalte = () => INHALTE_PATH.test(location.pathname);
  // Nach Datum sortiert, sonst zeigt Meta nach Relevanz vor allem fremde Creator.
  //
  // Business und Asset muessen mit, sonst landet Meta auf dem zuletzt benutzten
  // Konto. Genau das ist am 01.10. passiert: der Knopf oeffnete Oberland Messer
  // statt Tzampas. Beide Werte stehen in der Adresse des Postfachs, von dort
  // werden sie uebernommen statt fest verdrahtet — damit stimmt es auch, wenn
  // jemand mit einem anderen Konto arbeitet.
  function inhalteZiel() {
    const jetzt = new URLSearchParams(location.search);
    const business = jetzt.get('business_id');
    const asset = jetzt.get('asset_id');
    const p = new URLSearchParams({ sort_index: 'upac_publish_time' });
    if (business) p.set('business_id', business);
    if (asset) { p.set('asset_id', asset); p.set('selected_business_page_id', asset); }
    return {
      url: 'https://business.facebook.com/creator_marketing_hub/ad_content/?' + p.toString(),
      vollstaendig: !!(business && asset),
    };
  }

  // ---------- Speicher ----------
  // Follow-ups: { [threadID]: { title, flaggedAt, due: 'YYYY-MM-DD' | '', note } }
  // Der Schlüssel ist derselbe wie in Version 1.0, damit bestehende
  // Markierungen erhalten bleiben.
  //
  // Die eigene „Ungelesen"-Markierung ist in 6.1 entfallen: Instagram kann das
  // selbst, und zwei Ungelesen-Zustaende nebeneinander stiften nur Verwirrung.
  // Der alte Schluessel `igfu:unread:v1` wird nicht mehr gelesen und auch nicht
  // geloescht — wer ihn braucht, findet ihn in Tampermonkeys Speicher.

  const KEY_FOLLOW = 'igfu:v1';
  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

  function load(key) {
    try {
      if (hasGM) return GM_getValue(key, {}) || {};
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) { return {}; }
  }
  function store(key, value) {
    if (hasGM) GM_setValue(key, value);
    else localStorage.setItem(key, JSON.stringify(value));
  }

  let follow = load(KEY_FOLLOW);
  const saveFollow = () => store(KEY_FOLLOW, follow);

  // Änderungen aus anderen Tabs übernehmen
  function onExternalChange() {
    follow = load(KEY_FOLLOW);
    scanRows();
    if (panelOpen) renderPanel();
    updateLauncher();
  }
  if (hasGM && typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(KEY_FOLLOW, (name, oldVal, newVal, remote) => { if (remote) onExternalChange(); });
  } else {
    window.addEventListener('storage', (e) => { if (e.key === KEY_FOLLOW) onExternalChange(); });
  }

  // ---------- ClickUp ----------
  // Die Liste ist die gemeinsame Wahrheit, der lokale Speicher bleibt als Spiegel
  // bestehen. Faellt ClickUp aus, arbeitet das Postfach unveraendert weiter und die
  // offenen Schreibvorgaenge stehen in der Warteschlange.

  const CU_TOKEN = 'clickup:token:v1';
  const CU_LIST = 'clickup:list:v1';
  const CU_SPACE = 'clickup:space:v1';
  const CU_TASKS = 'clickup:tasks:v1';
  // Zeitpunkt des letzten erfolgreichen Durchlaufs. Daran erkennt der schnelle
  // Lauf, wie weit er nach unten muss.
  const LETZTER_LAUF = 'igfu:letzterlauf:v1';
  const CU_QUEUE = 'clickup:queue:v1';

  // Custom Fields sind bewusst nicht im Spiel: ClickUp Free erlaubt nur 60
  // Befuellungen im gesamten Workspace, allein die Erstuebernahme braucht mehr.
  // Die Thread-ID steht deshalb in der Beschreibung, das Follow-up ist ein Tag.
  // Beschreibungen und Tags haben kein Kontingent.
  const CU_TAG = 'follow-up';
  // Haengt an jedem Task, bei dem jemals nutzbarer Content gesehen wurde.
  // Anders als der Status bleibt er stehen, auch wenn der Task weiterwandert.
  const CU_TAG_ADCODE = 'ad-code';
  // Macht sichtbar, was sonst stillschweigend durchfaellt: ohne Handle ist ein
  // Task fuer saemtliche Automatiken unsichtbar.
  const CU_TAG_OHNE_HANDLE = 'handle-fehlt';
  // Ein als Karteileiche markierter Task ist absichtlich stillgelegt: ein altes
  // Konto, ein Testkonto, eine Dopplung, die nicht geloescht werden darf, weil
  // der naechste Import sie sonst wieder anlegt. Das Skript laesst ihn
  // vollstaendig in Ruhe — kein Status, keine Frist, keine Prioritaet, keine
  // Tags, keine Luecken-Meldung.
  //
  // Eine Ausnahme, und die ist der Zweck der Sache: beim Import zaehlt er
  // weiter mit. Sein Handle und seine Mailadresse gelten als vergeben, damit
  // derselbe Datensatz nicht beim naechsten Lauf erneut entsteht.
  const CU_TAG_LEICHE = 'karteileiche';
  const ROT = '#e5484d';
  const FELD_THREAD = 'Thread-ID';   // wird nur noch gelesen, falls vorhanden
  const CU_HANDLES = 'clickup:handles:v1';
  // Handles, die von UpPromote abweichen. Ergebnis der Gegenprobe, nicht mehr —
  // geaendert wird nichts automatisch.
  const HANDLE_ZWEIFEL = 'clickup:handle-zweifel:v1';
  // Was der letzte volle Durchlauf gesehen hat. Die Diagnosezeile im Panel
  // zaehlt nur die Zeilen, die Meta gerade im Dokument haelt — nach einem
  // Durchlauf sind das wieder ein Dutzend, und damit sagt sie nichts darueber,
  // wie viele Unterhaltungen es insgesamt gibt. Genau diese Verwechslung hat
  // am 07.10.2026 zwei Runden gekostet.
  const LETZTER_DURCHLAUF = 'igfu:durchlauf:v1';
  // { handle: { bereit: bool, anfragen: bool, stand: ms } }
  const CU_CONTENT = 'clickup:content:v1';

  // Seit „recherchiert" der erste Status der Liste ist, waere er die Vorgabe beim
  // Anlegen. Eine Unterhaltung im Postfach heisst aber, dass schon geschrieben
  // wurde, deshalb wird der Status hier ausdruecklich gesetzt.
  const CU_STATUS_NEU = 'angeschrieben';
  const CU_STATUS_MARKT = 'recherchiert';
  const CU_STATUS_ONBOARD = 'ongeboardet';
  const CU_STATUS_WARE = 'erste ware versendet';
  const CU_STATUS_CONTENT = 'erster content';
  const CU_STATUS_SALES = 'hat sales';

  // Die Pipeline ist eine Leiter, und das Skript darf einen Task nur nach vorn
  // schieben. Ohne diese Regel nehmen sich die Pruefungen gegenseitig das
  // Ergebnis weg: der UpPromote-Abgleich setzt alles Aktive auf „ongeboardet"
  // und wuerde damit „erste ware versendet" und „hat sales" bei jedem Lauf
  // wieder einkassieren.
  const STATUS_LEITER = ['recherchiert', 'angeschrieben', 'kommunikation', 'zugesagt',
    CU_STATUS_ONBOARD, CU_STATUS_WARE, CU_STATUS_CONTENT, CU_STATUS_SALES];
  // Wer hier liegt, wurde von Hand einsortiert. Daran fasst das Skript nichts an,
  // dieselbe Regel wie bei der Prioritaet.
  // „ignore" ist seit 12.10.2026 ein eigener Status in der Liste (Typ „done").
  // Josia schiebt Profile dorthin, mit denen er abgeschlossen hat, und sie
  // sollen dort bleiben: ohne diesen Eintrag haette der UpPromote-Abgleich sie
  // beim naechsten Lauf wieder auf „hat sales" gezogen.
  const STATUS_ENDE = ['abgesagt', 'ignore', 'keine antwort', 'beendet'];
  const statusRang = (s) => STATUS_LEITER.indexOf(String(s || '').toLowerCase().trim());
  function darfSetzen(alt, neu) {
    const a = String(alt || '').toLowerCase().trim();
    if (STATUS_ENDE.includes(a)) return false;
    const rn = statusRang(neu);
    return rn >= 0 && rn > statusRang(a);
  }

  // UpPromote kennt den Freigabestatus der Affiliates. Shopify kennt ihn nicht,
  // dort steht nur ein Tag ohne Aussage. Die Zuordnung laeuft ueber das
  // Instagram-Profil, das UpPromote bei jedem Affiliate mitliefert.
  // ---------- Meta Conversations API ----------
  // Der Handle steht im Postfach nirgends in der Liste: bei normalen DMs lautet
  // der Vorschautext „Name: Text", und der Anzeigename traegt meist nur den
  // Vornamen plus Beiwerk. Die Conversations-API nennt ihn dagegen direkt, als
  // `participants.username`. Das ist der einzige verlaessliche Weg, der ohne
  // Oeffnen der Unterhaltung auskommt — und Oeffnen wuerde sie als gelesen
  // markieren, was nicht in Frage kommt.
  const META_TOKEN = 'meta:token:v1';
  const META_PAGE = 'meta:page:v1';
  const META_FUNDE = 'meta:funde:v1';
  const META_VERSION = 'v21.0';
  const metaToken = () => String(GM_getValue(META_TOKEN, '') || '').trim();
  // Die Seiten-ID steht als asset_id in jeder Postfach-Adresse. Einmal gesehen,
  // wird sie behalten, damit sie auch ausserhalb des Postfachs zur Verfuegung
  // steht.
  function metaSeite() {
    const ausAdresse = new URLSearchParams(location.search).get('asset_id');
    if (ausAdresse) {
      if (String(GM_getValue(META_PAGE, '')) !== ausAdresse) GM_setValue(META_PAGE, ausAdresse);
      return ausAdresse;
    }
    return String(GM_getValue(META_PAGE, '') || '').trim();
  }

  function metaRequest(pfad) {
    return new Promise((erfuellen, ablehnen) => {
      const token = metaToken();
      if (!token) return ablehnen(Object.assign(new Error('Kein Meta-Token hinterlegt.'), { blockierend: true }));
      let grund = '';
      const fehler = (text, art) => ablehnen(Object.assign(new Error(text + grund), {
        wiederholbar: art === 'wiederholbar', blockierend: art === 'blockierend',
      }));
      GM_xmlhttpRequest({
        method: 'GET',
        // Der Token geht als Kopfzeile mit, nicht als Parameter in der Adresse.
        // In der Adresse stuende er in jedem Protokoll und jeder Fehlermeldung.
        url: /^https:/.test(pfad) ? pfad : 'https://graph.facebook.com/' + META_VERSION + pfad,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        timeout: 25000,
        onload: (a) => {
          let k = null;
          try { k = a.responseText ? JSON.parse(a.responseText) : {}; } catch (e) { k = null; }
          if (k && k.error && k.error.message) grund = ' (' + k.error.message + ')';
          if (a.status === 401 || a.status === 403) return fehler('Meta lehnt den Token ab.', 'blockierend');
          if (a.status === 429) return fehler('Meta-Limit erreicht.', 'wiederholbar');
          if (a.status >= 500) return fehler('Meta antwortet gerade nicht.', 'wiederholbar');
          if (a.status < 200 || a.status >= 300) return fehler('Meta meldet Fehler ' + a.status + '.');
          if (!k) return fehler('Antwort von Meta war nicht lesbar.');
          erfuellen(k);
        },
        onerror: () => fehler('Keine Verbindung zu Meta.', 'wiederholbar'),
        ontimeout: () => fehler('Meta hat zu lange gebraucht.', 'wiederholbar'),
      });
    });
  }

  // Holt die Unterhaltungen samt Teilnehmern. Geblaettert wird ueber
  // paging.next; die Adresse kommt vollstaendig zurueck, deshalb darf
  // metaRequest sie auch vollstaendig entgegennehmen.
  async function metaUnterhaltungen(melden) {
    const seite = metaSeite();
    if (!seite) throw Object.assign(new Error('Die Seiten-ID ist unbekannt. Einmal das Postfach öffnen, '
      + 'dort steht sie als asset_id in der Adresse.'), { blockierend: true });
    const raus = [];
    let pfad = '/' + encodeURIComponent(seite) + '/conversations'
      + '?platform=instagram&fields=participants,updated_time&limit=50';
    for (let runde = 0; runde < 20; runde++) {
      if (melden) melden('Frage Meta ab, Seite ' + (runde + 1) + ' \u2026');
      const d = await metaRequest(pfad);
      for (const u of d.data || []) raus.push(u);
      const weiter = d.paging && d.paging.next;
      if (!weiter || !(d.data || []).length) break;
      pfad = weiter;
    }
    return raus;
  }

  // Aus der Antwort das herausziehen, was wir brauchen: Handle und Zeitpunkt.
  // Die eigene Seite steht bei den Teilnehmern mit drin und faellt raus — sie
  // ist daran zu erkennen, dass ihre ID die Seiten-ID ist.
  function metaFunde(unterhaltungen) {
    const seite = metaSeite();
    const raus = [];
    for (const u of unterhaltungen || []) {
      const teilnehmer = (u.participants && u.participants.data) || [];
      for (const t of teilnehmer) {
        const name = String((t && t.username) || '').trim().toLowerCase();
        if (!name || String(t.id || '') === seite) continue;
        const zeit = Date.parse(u.updated_time || '');
        raus.push({ handle: name, zeit: isNaN(zeit) ? 0 : zeit, id: String(u.id || '') });
      }
    }
    return raus;
  }

  // Verbindet Handle und Unterhaltung ueber den Zeitpunkt. Die API nennt den
  // Handle, aber ihre Unterhaltungs-ID ist nicht das selected_item_id, mit dem
  // das Postfach arbeitet. Gemeinsam haben beide den Zeitpunkt der letzten
  // Nachricht — auf die Sekunde derselbe Vorgang.
  //
  // Zugeordnet wird nur, wenn genau ein Fund in das Zeitfenster faellt. Bei
  // zwei Treffern waere es geraten, und ein falscher Handle verknuepft den
  // falschen Creator.
  const META_FENSTER = 120000;
  function handleAusApi(thread) {
    const funde = GM_getValue(META_FUNDE, null);
    if (!funde || !funde.liste || !funde.liste.length || !thread || !thread.timestamp) return '';
    const passend = funde.liste.filter((f) => f.zeit && Math.abs(f.zeit - thread.timestamp) <= META_FENSTER);
    return passend.length === 1 ? passend[0].handle : '';
  }

  const UP_TOKEN = 'uppromote:token:v1';
  // Mehr als das braucht keine realistische Affiliate-Liste. Schuetzt davor,
  // minutenlang gegen eine Schnittstelle zu laufen, die nicht blaettert.
  const UP_MAX_SEITEN = 10;
  // Nur dieses Programm wird importiert. Andere Programme im selben Konto
  // bleiben aussen vor.
  const UP_PROGRAMM = 'TZAMPAS Affiliate Programm';
  const upToken = () => String(GM_getValue(UP_TOKEN, '') || '').trim();

  const cuListe = () => String(GM_getValue(CU_LIST, '') || '').trim();
  // scanRows laeuft mehrmals pro Sekunde ueber jede Zeile. Der Zustand wird
  // deshalb gemerkt und nur nach Aenderungen an den Einstellungen neu gelesen.
  let cuBereit = null;
  function cuEingerichtet() {
    if (cuBereit === null) {
      cuBereit = !!(cuListe() && String(GM_getValue(CU_TOKEN, '') || '').trim());
    }
    return cuBereit;
  }
  const cuEinstellungenGeaendert = () => { cuBereit = null; };

  let cuTasks = (GM_getValue(CU_TASKS, {}) || {}).tasks || {};
  let cuBilder = (GM_getValue(CU_TASKS, {}) || {}).bilder || {};
  // Benutzer-ID → Task. Der fuehrende Index; Bild und Handle sind Rueckfall.
  let cuNutzer = (GM_getValue(CU_TASKS, {}) || {}).nutzer || {};
  // Tasks ohne Unterhaltung. Bis Version 3.9 fielen die beim Laden einfach
  // heraus, weil cuTasks nach Thread-ID gefuehrt wird — ein importierter
  // Affiliate, der nie ueber das Partner-Postfach angeschrieben wurde, waere
  // damit fuer jede Automatik unsichtbar gewesen.
  let cuOhneThread = (GM_getValue(CU_TASKS, {}) || {}).ohneThread || [];
  // Alles, was die Automatiken durchgehen muessen — mit und ohne Unterhaltung.
  // Ein Task kann unter mehreren Thread-IDs eingetragen sein, wenn dieselbe
  // Person zwei Unterhaltungen hat. Hier muss er trotzdem genau einmal
  // vorkommen, sonst arbeitet jede Automatik ihn doppelt ab.
  function alleTasks() {
    const raus = [];
    const gesehen = new Set();
    for (const t of Object.values(cuTasks).concat(cuOhneThread)) {
      if (!t || gesehen.has(t.taskId)) continue;
      gesehen.add(t.taskId);
      raus.push(t);
    }
    return raus;
  }
  let cuLetzterAbruf = 0;
  let cuLaeuft = false;

  // Metas eigener Link auf eine Unterhaltung. Das Briefing sagte, so etwas
  // gebe es nicht, inzwischen gibt es das: selected_item_id oeffnet die
  // Unterhaltung direkt, ganz ohne Zutun des Skripts. Live geprueft.
  // Ein Format fuer beides. Am 05.10.2026 live geprueft: dieselbe Adresse
  // oeffnet eine normale Instagram-DM genauso wie eine Partner-Unterhaltung.
  // partnership_messages=true braucht es dafuer nicht — es stand bisher nur
  // drin, weil der Link aus der Partner-Ansicht stammte.
  //
  // Business und Asset kommen aus der aktuellen Adresse, sonst oeffnet Meta
  // unter Umstaenden das zuletzt benutzte Konto.
  // Zwei Kennungen, zwei Welten — und sie sind am Format zu unterscheiden.
  //
  // Das alte Postfach vergibt 39-stellige Nummern
  // (340282366841710301244259840012452280991), der Creator Hub kurze
  // (1629424262158448). Und der kurze Schluessel des Hubs funktioniert
  // unveraendert auf instagram.com:
  //
  //     https://www.instagram.com/direct/t/1629424262158448/
  //
  // Am 09.10.2026 geprueft. Das ist die Loesung fuer die Verlinkung: der Hub
  // selbst kennt keine Adresse, weder fuer eine Unterhaltung noch fuer eine
  // Suche — aber seinen Schluessel nimmt Instagram an. Und das Format
  // /direct/t/ gibt es dort seit Jahren unveraendert, waehrend die Business
  // Suite gerade zum zweiten Mal umgebaut wurde.
  //
  // Beide Formen muessen nebeneinander bestehen: die Altbestaende tragen noch
  // die langen Kennungen, und deren Links funktionieren weiter.
  // An der Laenge einer Kennung laesst sich ihre Herkunft NICHT ablesen. Das
  // war bis 6.8 die Annahme — 39 Stellen hiess Business Suite, kuerzer hiess
  // Instagram. Am 13.10.2026 widerlegt: `1100434292377942` ist 16-stellig und
  // stammt trotzdem aus dem alten Postfach. Der daraus gebaute Instagram-Link
  // oeffnete nur den Posteingang, keine Unterhaltung.
  //
  // Deshalb wird die Herkunft jetzt festgehalten statt geraten:
  //     igfu-thread: <kennung>   Unterhaltung im Postfach der Business Suite
  //     igfu-ig:     <kennung>   Unterhaltung auf instagram.com
  // Beim Schreiben entscheidet, wo das Skript gerade laeuft, nicht wie die
  // Kennung aussieht.
  function postfachLink(tid, aufInstagram) {
    if (aufInstagram) return 'https://www.instagram.com/direct/t/' + encodeURIComponent(tid) + '/';
    const p = new URLSearchParams();
    const jetzt = new URLSearchParams(location.search);
    for (const k of ['asset_id', 'business_id']) {
      if (jetzt.get(k)) p.set(k, jetzt.get(k));
    }
    p.set('selected_item_id', tid);
    p.set('thread_type', 'IG_MESSAGE');
    return 'https://business.facebook.com/latest/inbox/all/?' + p.toString();
  }

  // Die Markerzeile ist die Verbindung zwischen Unterhaltung und Task. Sie steht
  // sichtbar in der Beschreibung, damit jeder sieht, dass sie dazugehoert.
  function beschreibung(tid, handle, bildID) {
    const ig = isIG();
    const z = ['[Unterhaltung ' + (ig ? 'auf Instagram' : 'im Postfach') + ' öffnen]('
      + postfachLink(tid, ig) + ')', ''];
    if (handle) z.push('Instagram: [@' + handle + '](https://www.instagram.com/' + handle + '/)', '');
    z.push('---', 'Vom Postfach-Skript verwaltet. Die folgenden Zeilen bitte nicht ändern.',
      (ig ? 'igfu-ig: ' : 'igfu-thread: ') + tid);
    if (handle) z.push('igfu-handle: ' + handle);
    // Die Bild-ID des Profilfotos ist der Schluessel, ueber den sich ein im
    // Marketplace angelegter Task spaeter mit dieser Unterhaltung verbinden laesst.
    if (bildID) z.push('igfu-bild: ' + bildID);
    return z.join('\n');
  }
  // Metas IDs sind zwar reine Ziffern, aber darauf sollte sich das Auslesen
  // nicht verlassen.
  // ---------- Instagram-Handles ----------
  // Zwei Quellen, unterschiedlich verlaesslich. Die Kontaktkarte der geoeffneten
  // Unterhaltung nennt das echte Handle. Der Vorschautext nennt es nur in der
  // Form „handle gefällt eine Nachricht"; in der Form „Name: Text" steht dort der
  // Anzeigename. Deshalb werden nur kleingeschriebene Treffer akzeptiert, sonst
  // landen Vornamen wie „Laura" als vermeintliches Handle im CRM.
  const HANDLE_MUSTER = /^(?=.*[a-z])[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/;
  // Von Hand eingetragen schlaegt ausgelesen schlaegt geraten.
  // Von Hand eingetragen schlaegt die API schlaegt ausgelesen schlaegt geraten.
  // Die Conversations-API nennt den Handle als Tatsache und nicht als Fundstueck
  // aus einem Vorschautext — nur Josias eigene Eingabe steht darueber.
  // Von Hand eingetragen schlaegt die API schlaegt die Kontaktkarte schlaegt
  // den Zeilentitel schlaegt den Vorschautext.
  //
  // Der Zeilentitel auf instagram.com ist oft der Handle selbst, aber eben
  // nicht immer — ein Anzeigename kann zufaellig wie einer aussehen. Deshalb
  // steht er ueber dem geratenen Vorschautext und unter allem Ausgelesenen.
  const GUETE = { vorschau: 1, titel: 2, karte: 3, api: 4, hand: 5 };

  const handles = () => GM_getValue(CU_HANDLES, {}) || {};
  const handleVon = (tid) => handles()[tid] || null;

  function taskName(handle, titel) {
    const t = String(titel || 'Unbekannt').trim();
    if (!handle) return t;
    if (handle.toLowerCase() === t.toLowerCase()) return t;
    return handle + ' — ' + t;
  }

  function handleMerken(tid, handle, quelle, bild, letzte, nutzer) {
    if (!tid) return;
    const alle = handles();
    const alt = alle[tid] || {};
    let geaendert = false;
    if (letzte && alt.letzte !== letzte) { alt.letzte = letzte; geaendert = true; }
    if (bild && alt.bild !== bild) { alt.bild = bild; geaendert = true; }
    // Die Benutzer-ID wird nie ueberschrieben. Sie kommt aus den Props der
    // Zeile und nicht aus gelesenem Text — es gibt keine bessere Quelle, die
    // sie spaeter korrigieren koennte.
    if (nutzer && !alt.nutzer) { alt.nutzer = String(nutzer); geaendert = true; }
    // Die geoeffnete Unterhaltung („karte") darf einen frueheren Wert
    // *derselben* Guete ersetzen. Ohne das bleibt ein einmal falsch gelesener
    // Handle fuer immer stehen, weil gleiche Guete nicht ueberschreibt — genau
    // so hielten sich im Oktober 2026 die falschen Werte, auch nachdem der
    // Lesefehler behoben war. Von Hand gesetzte und ueber die API geholte
    // Handles bleiben geschuetzt.
    const g = GUETE[quelle] || 0;
    const gAlt = GUETE[alt.quelle] || 0;
    const besser = handle && (!alt.handle || g > gAlt || (quelle === 'karte' && gAlt <= GUETE.karte));
    if (besser && alt.handle !== handle) { alt.handle = handle; alt.quelle = quelle; geaendert = true; }
    else if (besser) { alt.quelle = quelle; geaendert = true; }
    if (!geaendert) return;
    alle[tid] = alt;
    GM_setValue(CU_HANDLES, alle);
    // Hat die Unterhaltung schon einen Task, den Namen nachziehen
    const task = cuTasks[tid];
    if (task && alt.handle && task.titel !== taskName(alt.handle, rohTitel(task.titel))) {
      vormerken({ art: 'name', tid, titel: rohTitel(task.titel) });
    }
  }

  // „handle — Anzeigename" wieder auf den Anzeigenamen zurueckfuehren
  const rohTitel = (name) => String(name || '').replace(/^[a-z0-9._]{2,30}\s+—\s+/, '');

  // Anzeigenamen vergleichbar machen.
  //
  // normalize('NFKD') ist hier das Entscheidende: Instagram-Anzeigenamen stecken
  // oft in Schmuckschrift, und die besteht aus eigenen Unicode-Zeichen. „𝒟𝒶𝓃𝒾ℯ𝓁𝒶"
  // ist nicht „Daniela", und toLowerCase() aendert daran nichts. NFKD loest
  // diese Zeichen in ihre schlichten Entsprechungen auf. Danach fallen die
  // Kombinationszeichen weg, damit aus „Wäschl" und „Waschl" dasselbe wird —
  // auf beiden Seiten gleich, also vergleichbar.
  //
  // Am 06.10.2026 an der echten Liste geprueft:
  //   „𝒟𝒶𝓃𝒾ℯ𝓁𝒶"            → „daniela"
  //   „𝗟𝗶𝗻𝗮 𝗙𝗲𝗹𝗱𝗲𝗿"      → „lina felder"
  // Kapitaelchen wie „ᴀɴᴊᴀ" haben keine solche Entsprechung und bleiben stehen.
  const namensform = (s) => String(s || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  // Die Bruecke fuer die aus UpPromote importierten Tasks. Meta zeigt bei
  // normalen Instagram-DMs fast immer den Anzeigenamen und nicht den Handle —
  // und genau der Anzeigename steht bei diesen Tasks im Namen, weil er aus
  // Vor- und Nachnamen des Affiliates gebaut wurde. Darueber findet eine
  // Unterhaltung ihren Task auch dann, wenn der Handle nirgends auftaucht.
  //
  // Zwei Schranken, damit nichts geraten wird:
  //   1. Mindestens zwei Wortteile. Ein einzelner Vorname („Timo") ist zu
  //      wenig, davon gibt es in jeder Liste mehrere.
  //   2. Genau ein passender Task. Bei zwei Treffern waere jede Wahl geraten,
  //      dann bleibt die Unterhaltung lieber unverbunden.
  // Sucht den Task zu einer Unterhaltung ueber den Anzeigenamen. Drei Wege,
  // alle an der echten Liste vom 06.10.2026 entwickelt:
  //
  //   1. Beide Namen sind gleich.
  //      „Mara Kell NRNS" ↔ „anna_bolko_cali — Mara Kell NRNS"
  //   2. Alle Wortteile des Task-Namens kommen im Titel vor. Instagram-Namen
  //      tragen oft Beiwerk, das in ClickUp nicht steht.
  //      „N o R d | Nordin Makuba" ↔ „nordfit_ — Nordin Makuba"
  //   3. Der Titel ist selbst ein Handle.
  //      „stadtpedal" ↔ Task „stadtpedal"
  //
  // Zwei Schranken verhindern Raten:
  //   - Ein einzelnes Wort zaehlt nur, wenn es als Handle geschrieben ist.
  //     „Timo" ist ein Vorname und passt auf zu viele; „stadtpedal" ist
  //     eindeutig. Geprueft wird dafuer der unveraenderte Titel, nicht die
  //     kleingeschriebene Form — sonst wird aus jedem Vornamen ein Handle.
  //   - Genau ein passender Task. Bei zwei Treffern waere jede Wahl geraten,
  //     dann bleibt die Unterhaltung unverbunden.
  //
  // auchVerbundene schliesst Tasks ein, die schon eine Unterhaltung haben. Das
  // ist der Zusammenfuehrungs-Fall: dieselbe Person schreibt einmal ueber
  // Partner-Nachrichten und einmal als normale DM, und beides gehoert in
  // denselben Task.
  // Wie nameTreffer, aber ohne die Laengenschranke fuer Einzelnamen. „Anja"
  // ist zu wenig, um automatisch zu verbinden — in tausenden Privatchats sitzt
  // garantiert noch eine. Als **Vorschlag** ist es aber genau richtig: ein
  // Klick statt einer Suche durch die ganze Liste.
  //
  // Angewendet wird nichts davon von selbst. Das ist der Unterschied zwischen
  // „hilfreich" und „verknuepft den falschen Creator".
  function namensVorschlag(titel) {
    const roh = String(titel || '').trim();
    const form = namensform(roh);
    if (form.length < 3) return null;
    const passend = alleTasks().filter((x) => {
      if (x.leiche) return false;
      const tf = namensform(rohTitel(x.titel));
      return tf && tf === form;
    });
    return passend.length === 1 ? passend[0] : null;
  }

  function nameTreffer(titel, auchVerbundene) {
    const roh = String(titel || '').trim();
    const form = namensform(roh);
    const worte = form.split(' ').filter(Boolean);
    if (!worte.length) return null;
    const einWort = worte.length === 1;
    const einzelHandle = einWort && HANDLE_MUSTER.test(roh) ? roh.toLowerCase() : '';
    // Ein einzelnes Wort zaehlt in drei Faellen: als Handle („stadtpedal"),
    // oder wenn es lang genug ist, um fuer sich zu stehen. „HertaLarissa" mit
    // zwoelf Zeichen ist ein Name, den es nur einmal gibt; „Timo" mit fuenf
    // passt auf jeden Zweiten. Die Grenze liegt bei acht Zeichen, und die
    // Eindeutigkeit wird ohnehin weiter unten verlangt — es muss genau ein
    // Task passen.
    const langGenug = einWort && form.length >= 8;
    if (einWort && !einzelHandle && !langGenug) return null;
    const passend = alleTasks().filter((x) => {
      if (x.leiche) return false;
      if (!auchVerbundene && x.tid) return false;
      if (einzelHandle) {
        return handleVonTask(x) === einzelHandle || namensform(rohTitel(x.titel)) === form;
      }
      const tf = namensform(rohTitel(x.titel));
      if (!tf) return false;
      if (tf === form) return true;
      const tw = tf.split(' ').filter(Boolean);
      return tw.length >= 2 && tw.every((wort) => worte.includes(wort));
    });
    return passend.length === 1 ? passend[0] : null;
  }

  function textAusSnippet(node, tiefe, raus) {
    if (tiefe > 6 || node == null) return raus;
    if (typeof node === 'string') { if (node.trim()) raus.push(node.trim()); return raus; }
    if (Array.isArray(node)) { node.forEach((n) => textAusSnippet(n, tiefe + 1, raus)); return raus; }
    if (typeof node === 'object') {
      const p = node.props || node;
      for (const k of Object.keys(p)) if (k === 'children' || k === 'text' || k === 'content') textAusSnippet(p[k], tiefe + 1, raus);
    }
    return raus;
  }

  // Wortanfaenge, die nie ein Handle sind. „https" steht vorne, sobald eine
  // Vorschau mit einer Adresse beginnt — und genau so sind am 12.10.2026 Tasks
  // namens „https — <Anzeigename>" entstanden.
  const KEIN_HANDLE = new Set(['http', 'https', 'www', 'du', 'you']);

  function handleAusVorschau(thread) {
    // Auf instagram.com gibt es die Form „handle: Text" nicht: dort steht vor
    // dem Doppelpunkt der Anzeigename des Absenders, nicht sein Handle. Die
    // Regel stammt aus dem Postfach der Business Suite und richtet hier nur
    // Schaden an. Der Handle kommt dort aus dem Zeilentitel.
    if (isIG()) return '';
    let text = '';
    try { text = textAusSnippet(thread.snippet, 0, []).join(' '); } catch (e) { return ''; }
    const m = text.match(/^([a-z0-9._]{2,30})\s+gefällt\b/) || text.match(/^([a-z0-9._]{2,30}):/);
    if (!m || KEIN_HANDLE.has(m[1].toLowerCase())) return '';
    return HANDLE_MUSTER.test(m[1]) ? m[1] : '';
  }

  // Meta stellt eigenen Nachrichten „Du: " voran. Das ist der einzige
  // verlaessliche Hinweis darauf, bei wem die Antwort gerade liegt.
  // Eine blosse Reaktion steht als „<handle> gefaellt eine Nachricht" da und
  // ist keine offene Nachricht, siehe die Regeln der Chat-Durchsicht.
  function werZuletzt(thread) {
    let text = '';
    try { text = textAusSnippet(thread.snippet, 0, []).join(' ').trim(); } catch (e) { return ''; }
    // Ungelesen heisst immer: das Gegenueber hat zuletzt geschrieben. Das gilt
    // auch dann, wenn kein Text da ist — Instagram ersetzt die Vorschau bei
    // ungelesenen durch „3 new messages" und verschluckt sie damit.
    if (thread.isRead === false) return 'gegenueber';
    if (!text) return '';
    // Eigene Nachricht: je nach Spracheinstellung „Du: " oder „You: ".
    if (/^(Du|You):/.test(text)) return 'ich';
    // Eine blosse Reaktion ist keine offene Nachricht. Drei Schreibweisen:
    // das alte Postfach sagt „gefällt eine Nachricht", Instagram „Liked a
    // message" oder „Reacted … to your message".
    if (/gefällt\s+(eine|deine)\s+Nachricht/i.test(text)) return 'reaktion';
    if (/^Liked a message/i.test(text)) return 'reaktion';
    if (/to your message$/i.test(text)) return 'reaktion';
    return 'gegenueber';
  }

  function bildIDVon(thread) {
    const uri = (thread.participantProfileURIs || [])[0] || '';
    try {
      const u = new URL(uri);
      const m = u.pathname.match(/\/([0-9]{6,})_/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  // Die geoeffnete Unterhaltung steht als selected_item_id in der Adresse, die
  // Kontaktkarte daneben nennt das Handle als Linktext unter „Instagram-Profil".
  const offenerThread = () => new URLSearchParams(location.search).get('selected_item_id') || '';

  function handleAusKarte() {
    const marke = [...document.querySelectorAll('span, div, h2, h3')]
      .find((e) => !e.children.length && (e.textContent || '').trim() === 'Instagram-Profil');
    if (!marke) return '';
    let box = marke.parentElement;
    for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
      const a = [...box.querySelectorAll('a')].find((x) => HANDLE_MUSTER.test((x.textContent || '').trim()));
      if (a) return a.textContent.trim();
    }
    return '';
  }

  // Pfade, die wie ein Profil aussehen, aber keines sind.
  const IG_KEIN_PROFIL = new Set(['reels', 'explore', 'direct', 'stories', 'accounts',
    'p', 'reel', 'tv', 'about', 'legal', 'privacy', 'terms', 'your_activity']);

  // Die geoeffnete Unterhaltung auf instagram.com nennt den Handle — exakt, in
  // der Adresse des Profillinks im Gespraechskopf. Das ist der Schluessel, den
  // die Liste nicht hergibt: dort steht nur der Anzeigename, und „Anja" passt
  // auf zu viele.
  //
  // Vom eigenen Konto unterscheidet er sich zuverlaessig daran, dass er Text
  // traegt. Die Links in der linken Leiste sind reine Symbole ohne Beschriftung.
  // Am 13.10.2026 nachgemessen:
  //     /tzampasfood/  x=12   kein Text        ← eigenes Konto
  //     /hey.lumi/     x=488  „Anja\nhey.lumi" ← das Gegenueber
  // Das eigene Konto haengt in der Navigationsleiste und taucht damit in jeder
  // Unterhaltung als Profillink auf. Ohne es zu kennen, ist nicht zu
  // entscheiden, welcher der Links das Gegenueber ist.
  const IG_SELBST = 'ig:selbst:v1';
  const IG_ENTGIFTET = 'ig:entgiftet:v1';
  const eigenerHandle = () => String(GM_getValue(IG_SELBST, '') || '');

  // Alle Profillinks der Seite, nach Handle gebuendelt, mit Anzahl und Text.
  function igProfilLinks() {
    const nach = new Map();
    for (const a of document.querySelectorAll('a[href^="/"]')) {
      const href = String(a.getAttribute('href') || '');
      // Mit *und ohne* Schraegstrich am Ende. In Partner-Unterhaltungen laesst
      // Instagram ihn weg — genau daran ist der Leser bis 7.6 gescheitert und
      // hat dort nie einen Handle gefunden.
      if (!/^\/[A-Za-z0-9._]{2,30}\/?$/.test(href)) continue;
      const name = href.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
      if (IG_KEIN_PROFIL.has(name) || !HANDLE_MUSTER.test(name)) continue;
      const alt = nach.get(name) || { anker: 0, titel: '', leiste: false };
      alt.anker += 1;
      if (!alt.titel) {
        const zeilen = String(a.innerText || '').split('\n').map((z) => z.trim()).filter(Boolean);
        alt.titel = zeilen[0] || '';
      }
      if (!alt.leiste) alt.leiste = inNavigationsleiste(a);
      nach.set(name, alt);
    }
    return nach;
  }

  // Steckt dieser Profillink in der Navigationsleiste? Dann gehoert er zum
  // eigenen Konto, nicht zum Gegenueber.
  //
  // Erkennbar daran, dass er sich einen *nahen* Vorfahren mit „Entdecken" oder
  // „Reels" teilt — die stehen in derselben Leiste. Am 19.10.2026 gemessen:
  // das eigene Konto findet sie ab Ebene 4, der Gegenueber-Link nicht einmal
  // in zwoelf Ebenen. Strukturell und ohne Sprachabhaengigkeit.
  //
  // Das ersetzt die Zaehlheuristik aus 7.7, und zwar nach Schaden: dort galt
  // „bleibt genau ein Kandidat uebrig, nimm ihn". In Partner-Unterhaltungen
  // ohne Profillink des Gegenuebers blieb nur die Navigationsleiste uebrig —
  // und so bekamen vier Creator-Tasks „tzampasfood" als Handle.
  function inNavigationsleiste(a) {
    let el = a.parentElement;
    for (let i = 0; i < 6 && el; i++) {
      // Nicht bis zum Seitenkoerper hoch: der enthaelt die Leiste immer, und
      // dann laege jeder Link „in der Leiste".
      if (el === document.body || el === document.documentElement) return false;
      if (el.querySelector('a[href="/explore/"], a[href="/reels/"]')) return true;
      el = el.parentElement;
    }
    return false;
  }

  // Auf der Liste selbst steht nur ein Profil: das eigene. Am 15.10.2026
  // gemessen — auf /direct/inbox/ war `tzampasfood` der einzige Treffer.
  // Einmal gesehen, ist es dauerhaft bekannt. Bei mehr als einem Treffer wird
  // nichts gelernt: im Partner-Ordner steht rechts ein Vorschlagskasten mit
  // fremden Handles, und die gehoeren zu niemandem aus der Liste.
  function eigenesKontoLernen() {
    if (!isIG()) return;
    // Ueber die Navigationsleiste, nicht mehr ueber „auf der Liste steht nur
    // ein Profil". Das greift auch in einer geoeffneten Unterhaltung und ist
    // unabhaengig davon, was sonst noch auf der Seite verlinkt ist — im
    // Partner-Ordner steht rechts ein Vorschlagskasten mit fremden Handles.
    for (const [name, daten] of igProfilLinks()) {
      if (!daten.leiste) continue;
      if (eigenerHandle() !== name) GM_setValue(IG_SELBST, name);
      handlesEntgiften();
      return;
    }
  }

  // Einmalige Bereinigung nach dem Fehler aus 7.7: Dort konnte das eigene
  // Konto als Handle eines Gegenuebers gespeichert werden. Solche Eintraege
  // sind nicht nur wertlos, sie verhindern aktiv, dass der richtige Handle
  // nachgetragen wird — handleBeschaffen() hoert bei bekanntem Handle auf zu
  // suchen. Laeuft einmal je Konto, danach nie wieder.
  function handlesEntgiften() {
    const selbst = eigenerHandle();
    if (!selbst || GM_getValue(IG_ENTGIFTET, '') === selbst) return;
    const alle = handles();
    let weg = 0;
    for (const eintrag of Object.values(alle)) {
      if (eintrag && eintrag.handle === selbst) {
        delete eintrag.handle;
        delete eintrag.quelle;
        weg += 1;
      }
    }
    if (weg) GM_setValue(CU_HANDLES, alle);
    GM_setValue(IG_ENTGIFTET, selbst);
    if (weg) toast(weg + ' falsch gelesene Handles entfernt — das war das eigene Konto.');
  }

  function igOffeneUnterhaltung() {
    const m = /^\/direct\/t\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname);
    if (!m) return null;
    const nach = igProfilLinks();
    // Das eigene Konto faellt zweifach raus: strukturell ueber die
    // Navigationsleiste und zusaetzlich ueber den gelernten Handle. Zwei
    // Schranken fuer dieselbe Sache, weil eine davon im Oktober 2026 gefehlt
    // hat und vier Creator-Tasks „tzampasfood" als Handle bekamen.
    const selbst = eigenerHandle();
    if (selbst) nach.delete(selbst);
    for (const [name, daten] of [...nach]) if (daten.leiste) nach.delete(name);
    const kandidaten = [...nach.entries()];
    // Bleibt keiner uebrig, war das Gegenueber auf dieser Seite nicht
    // verlinkt. Das kommt in Partner-Unterhaltungen vor. Dann gibt es hier
    // nichts zu holen — und *nichts* ist das richtige Ergebnis, nicht das
    // eigene Konto.
    if (kandidaten.length !== 1) return null;
    const [handle, daten] = kandidaten[0];
    return { tid: m[1], handle, titel: daten.titel || handle };
  }

  function karteAuslesen() {
    if (!isInbox()) return;
    if (isIG()) {
      eigenesKontoLernen();
      const offen = igOffeneUnterhaltung();
      if (!offen) return;
      // Den Handle nur merken, wenn er neu ist — aber das Verknuepfen *immer*
      // versuchen. Vorher stand hier ein `return`, sobald der Handle schon
      // bekannt war. Damit wurde beim ersten Oeffnen zwar der Handle
      // gespeichert; schlug das Verknuepfen in diesem Moment fehl, etwa weil
      // die Task-Liste noch nicht geladen war, kam es nie wieder dazu. Die
      // Unterhaltung blieb dauerhaft unverbunden, und erneutes Oeffnen half
      // nicht — am 15.10.2026 an flo.auf.zeit aufgefallen.
      const vorhanden = handleVon(offen.tid);
      if (!vorhanden || vorhanden.handle !== offen.handle) {
        handleMerken(offen.tid, offen.handle, 'karte');
      }
      if (!cuTasks[offen.tid]) {
        const ziel = alleTasks().find((x) => !x.leiche
          && !(x.tids || []).includes(offen.tid) && handleVonTask(x) === offen.handle);
        if (ziel) vormerken({ art: 'verbinden-handle', tid: offen.tid, titel: offen.titel, taskId: ziel.taskId });
      }
      return;
    }
    const tid = offenerThread();
    if (!tid) return;
    const vorhanden = handleVon(tid);
    if (vorhanden && vorhanden.quelle === 'karte') return;
    const h = handleAusKarte();
    if (h) handleMerken(tid, h, 'karte');
  }

  function beschreibungMarkt(handle, bildID) {
    const z = ['Instagram: [@' + handle + '](https://www.instagram.com/' + handle + '/)', ''];
    z.push('---', 'Im Creator Marketplace erfasst. Die folgende Zeile bitte nicht ändern.');
    if (bildID) z.push('igfu-bild: ' + bildID);
    return z.join('\n');
  }

  const threadAusText = (text) => (String(text || '').match(/igfu-thread:\s*([A-Za-z0-9_-]+)/) || [])[1] || '';
  // Dieselbe Person kann zwei Unterhaltungen haben — eine als Partner-Nachricht,
  // eine als normale DM. Beide gehoeren in denselben Task, also stehen dort auch
  // zwei Markerzeilen. Darum werden immer alle gelesen.
  const threadsAusText = (text) => [...String(text || '')
    .matchAll(/igfu-thread:\s*([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  // Unterhaltungen auf instagram.com. Eigene Zeile, damit die Herkunft
  // eindeutig ist und nicht aus der Kennung geraten werden muss.
  const igsAusText = (text) => [...String(text || '')
    .matchAll(/igfu-ig:\s*([A-Za-z0-9_-]+)/g)].map((m) => m[1]);

  // Mittag als Uhrzeit, damit ein Datum nicht durch Zeitzonen auf den Vortag rutscht
  function msVonIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    const [j, m, t] = iso.split('-').map(Number);
    return new Date(j, m - 1, t, 12, 0, 0, 0).getTime();
  }
  function isoVonMs(ms) {
    if (!ms) return '';
    const d = new Date(Number(ms));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const tagePlus = (iso, n) => {
    const ms = msVonIso(iso);
    return ms ? isoVonMs(ms + n * 86400000) : '';
  };
  // Zaehlt ab dem Tag nach dem Stichtag und ueberspringt Samstag und Sonntag.
  // Feiertage bleiben unberuecksichtigt.
  function wochentagePlus(iso, n) {
    const ms = msVonIso(iso);
    if (!ms) return '';
    const d = new Date(ms);
    let offen = n;
    while (offen > 0) {
      d.setDate(d.getDate() + 1);
      const wt = d.getDay();
      if (wt !== 0 && wt !== 6) offen -= 1;
    }
    return isoVonMs(d.getTime());
  }

  // Nachfass-Frist. Zwei Regeln, es gilt die spaetere:
  //   14 Tage nach der letzten Nachricht oder Reaktion des Creators
  //   10 Wochentage nach dem Versand der Ware, sofern einer bekannt ist
  //
  // Die spaetere zu nehmen ist nicht nur sinnvoll, sondern noetig: das
  // Startdatum traegt bei uns das Datum der letzten Nachricht, und ClickUp
  // lehnt ein Startdatum nach dem Faelligkeitsdatum ab. Eine reine
  // Versandfrist lag bei laufenden Unterhaltungen irgendwann davor, und dann
  // scheiterte jedes weitere Schreiben mit Fehler 400.
  function fristFuer(task, letzteIso) {
    const kandidaten = [];
    const nachNachricht = tagePlus(letzteIso, 14);
    if (nachNachricht) kandidaten.push(nachNachricht);
    if (task && task.ware) {
      const nachVersand = wochentagePlus(task.ware, 10);
      if (nachVersand) kandidaten.push(nachVersand);
    }
    kandidaten.sort();
    return kandidaten.length ? kandidaten[kandidaten.length - 1] : '';
  }

  // Der Token wird pro Anfrage frisch gelesen und nirgends zwischengespeichert.
  function cuRequest(methode, pfad, rumpf) {
    return new Promise((erfuellen, ablehnen) => {
      const token = String(GM_getValue(CU_TOKEN, '') || '').trim();
      if (!token) return ablehnen(Object.assign(new Error('Kein ClickUp-Token hinterlegt.'), { blockierend: true }));
      if (typeof GM_xmlhttpRequest !== 'function') {
        return ablehnen(new Error('GM_xmlhttpRequest steht nicht bereit. Skript neu installieren.'));
      }
      // wiederholbar: geht von allein wieder. blockierend: Josia muss etwas tun,
      // der Auftrag bleibt so lange in der Warteschlange stehen. Ohne beides gilt
      // der einzelne Auftrag als endgültig gescheitert und wird verworfen, damit
      // er die Warteschlange nicht dauerhaft verstopft.
      // ClickUp legt den Grund in das Feld err. Ohne den steht man bei einem 400
      // voellig im Dunkeln, das hat schon einmal eine lange Suche gekostet.
      let grund = '';
      const fehler = (text, art) => ablehnen(Object.assign(new Error(text + grund), {
        wiederholbar: art === 'wiederholbar',
        blockierend: art === 'blockierend',
      }));
      GM_xmlhttpRequest({
        method: methode,
        url: 'https://api.clickup.com/api/v2' + pfad,
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        data: rumpf ? JSON.stringify(rumpf) : undefined,
        timeout: 20000,
        onload: (a) => {
          if (a.status < 200 || a.status >= 300) {
            try {
              const k = JSON.parse(a.responseText || '{}');
              if (k && k.err) grund = ' (' + k.err + ')';
            } catch (e) { /* kein lesbarer Grund, dann eben ohne */ }
          }
          if (a.status === 401 || a.status === 403) {
            return fehler('Der Token wird abgelehnt. Änderungen bleiben gespeichert, bis er stimmt.', 'blockierend');
          }
          if (a.status === 429) return fehler('Limit erreicht, ich versuche es gleich erneut.', 'wiederholbar');
          if (a.status >= 500) return fehler('ClickUp antwortet gerade nicht.', 'wiederholbar');
          if (a.status < 200 || a.status >= 300) return fehler('ClickUp meldet Fehler ' + a.status + '.');
          try { erfuellen(a.responseText ? JSON.parse(a.responseText) : {}); }
          catch (e) { fehler('Antwort von ClickUp war nicht lesbar.'); }
        },
        onerror: () => fehler('Keine Verbindung zu ClickUp.', 'wiederholbar'),
        ontimeout: () => fehler('ClickUp hat zu lange gebraucht.', 'wiederholbar'),
      });
    });
  }

  function upRequest(pfad) {
    return new Promise((erfuellen, ablehnen) => {
      const token = upToken();
      if (!token) return ablehnen(Object.assign(new Error('Kein UpPromote-Token hinterlegt.'), { blockierend: true }));
      let grund = '';
      const fehler = (text, art) => ablehnen(Object.assign(new Error(text + grund), {
        wiederholbar: art === 'wiederholbar', blockierend: art === 'blockierend',
      }));
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://aff-api.uppromote.com/api/v2' + pfad,
        headers: { Authorization: token, Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 20000,
        onload: (a) => {
          if (a.status < 200 || a.status >= 300) {
            try { const k = JSON.parse(a.responseText || '{}'); if (k && (k.message || k.error)) grund = ' (' + (k.message || k.error) + ')'; }
            catch (e) { /* ohne Grund weiter */ }
          }
          if (a.status === 401 || a.status === 403) return fehler('UpPromote lehnt den Token ab.', 'blockierend');
          if (a.status === 429) return fehler('UpPromote-Limit erreicht.', 'wiederholbar');
          if (a.status >= 500) return fehler('UpPromote antwortet gerade nicht.', 'wiederholbar');
          if (a.status < 200 || a.status >= 300) return fehler('UpPromote meldet Fehler ' + a.status + '.');
          try { erfuellen(a.responseText ? JSON.parse(a.responseText) : {}); }
          catch (e) { fehler('Antwort von UpPromote war nicht lesbar.'); }
        },
        onerror: () => fehler('Keine Verbindung zu UpPromote.', 'wiederholbar'),
        ontimeout: () => fehler('UpPromote hat zu lange gebraucht.', 'wiederholbar'),
      });
    });
  }

  // Aus „https://instagram.com/handle/", „@handle" oder „handle" wird „handle"
  function handleAusFeld(wert) {
    let t = String(wert || '').trim();
    if (!t) return '';
    const m = t.match(/instagram\.com\/([^/?#]+)/i);
    if (m) t = m[1];
    t = t.replace(/^@/, '').replace(/\/+$/, '').trim().toLowerCase();
    return HANDLE_MUSTER.test(t) ? t : '';
  }

  // Zwei Felder, getrennt beschriftet: internal_note ist, was ihr ueber den
  // Affiliate notiert habt, personal_detail was er selbst angegeben hat.
  function notizAusAffiliate(a) {
    const teile = [];
    const intern = String((a && a.internal_note) || '').trim();
    const selbst = String((a && a.personal_detail) || '').trim();
    if (intern) teile.push('Notiz aus UpPromote:\n' + intern);
    if (selbst) teile.push('Angaben des Affiliates:\n' + selbst);
    return teile.join('\n\n');
  }

  function handleAusAffiliate(a) {
    const kandidaten = [a.instagram, a.instagram_url, a.social_instagram];
    for (const f of (a.custom_fields || [])) {
      if (!f) continue;
      const name = String(f.name || f.label || f.key || '').toLowerCase();
      if (name.includes('instagram') || name.includes('handle')) kandidaten.push(f.value);
    }
    for (const k of kandidaten) { const h = handleAusFeld(k); if (h) return h; }
    return '';
  }

  // melden(text) zeigt den Fortschritt an. Ohne das sieht ein langer Lauf aus
  // wie ein Haenger, genau so ist es am 30.09. passiert.
  //
  // Die Schleife bricht ab, sobald eine Seite dieselben Eintraege liefert wie die
  // vorige. Liefert UpPromote den Parameter page nicht aus, kaeme sonst immer
  // wieder dieselbe erste Seite und die Schleife liefe bis zum Seitenlimit,
  // bei 20 Seiten und 20 Sekunden Zeitlimit ueber sechs Minuten lang.
  async function upAktive(melden) {
    const gefunden = {};
    let vorige = '';
    for (let seite = 1; seite <= UP_MAX_SEITEN; seite++) {
      if (melden) melden('Frage UpPromote ab, Seite ' + seite + ' \u2026');
      const d = await upRequest('/affiliates?status=active&per_page=100&page=' + seite);
      const liste = d.data || d.affiliates || (Array.isArray(d) ? d : []);
      if (!liste.length) break;
      const kennung = liste.map((a) => (a && (a.id || a.email)) || '').join(',');
      if (kennung === vorige) break;
      vorige = kennung;
      for (const a of liste) {
        const h = handleAusAffiliate(a);
        if (!h) continue;
        // Alles ausser „denied" zaehlt als Verkauf. Die Betraege stehen schon in
        // dieser Antwort, das kostet keine zusaetzliche Anfrage.
        const umsatz = ['approved_amount', 'pending_amount', 'paid_amount']
          .reduce((summe, feld) => summe + (parseFloat(a[feld]) || 0), 0);
        gefunden[h] = {
          name: [a.first_name, a.last_name].filter(Boolean).join(' '),
          email: String(a.email || '').trim().toLowerCase(),
          notiz: notizAusAffiliate(a),
          umsatz,
        };
      }
      if (liste.length < 100) break;
    }
    return gefunden;
  }

  // Das Handle eines Tasks steht im Namen vor dem Gedankenstrich, sonst ist der
  // ganze Name das Handle.
  // Markerzeile schlaegt Name. Der Name bleibt die Anzeige, der Marker ist der
  // Schluessel.
  function handleVonTask(task) {
    if (!task) return '';
    return task.handle || handleAusTaskname(task.titel);
  }

  function handleAusTaskname(name) {
    const n = String(name || '').trim();
    const m = n.match(/^([a-z0-9._]{2,30})\s+—\s+/);
    if (m) return m[1].toLowerCase();
    // Besteht der Name nur aus einem Wort, ist er nur dann ein Handle, wenn er
    // auch so geschrieben ist — also bereits klein. „stadtpedal" und
    // „hansj.stolz" sind Handles, „Timo" und „Sophie" sind Vornamen.
    //
    // Entscheidend ist, dass hier der unveraenderte Name geprueft wird. Vorher
    // stand hier n.toLowerCase(), und damit wurde aus jedem einwortigen
    // Anzeigenamen ein Handle. Solche Tasks galten als versorgt, obwohl der
    // Handle geraten war, und fielen aus der Luecken-Erkennung heraus.
    return HANDLE_MUSTER.test(n) ? n : '';
  }

  // Traegt die E-Mail als Markerzeile nach, damit eine Shopify-Geschenkbestellung
  // spaeter diesem Task zugeordnet werden kann. Ergaenzt nur, ersetzt nie, damit
  // eigene Notizen in der Beschreibung erhalten bleiben.
  // Wie markerEintragen, ersetzt aber eine vorhandene Zeile. Fuer Werte, die
  // sich aendern duerfen.
  async function markerSetzen(task, feld, wert) {
    const voll = await cuRequest('GET', '/task/' + task.taskId + '?include_markdown_description=true');
    const bisher = voll.markdown_description || voll.description || '';
    const muster = new RegExp('^' + feld + ':.*$', 'mi');
    const neu = muster.test(bisher)
      ? bisher.replace(muster, feld + ': ' + wert)
      : bisher.replace(/\s*$/, '') + '\n' + feld + ': ' + wert;
    await cuRequest('PUT', '/task/' + task.taskId, { markdown_description: neu });
  }

  async function markerEintragen(task, feld, wert) {
    const voll = await cuRequest('GET', '/task/' + task.taskId + '?include_markdown_description=true');
    const bisher = voll.markdown_description || voll.description || '';
    if (new RegExp(feld + ':\\s*\\S').test(bisher)) return false;
    await cuRequest('PUT', '/task/' + task.taskId, {
      markdown_description: bisher.replace(/\s*$/, '') + '\n' + feld + ': ' + wert,
    });
    return true;
  }

  // Traegt die Notiz als Kommentar nach, aber nur einmal je Fassung. Aendert
  // sie sich in UpPromote, kommt ein neuer Kommentar dazu und der alte bleibt
  // stehen — ein Verlauf ist hier nuetzlicher als stilles Ueberschreiben.
  async function notizUebertragen(task, notiz) {
    const text = String(notiz || '').trim();
    if (!text) return false;
    const pruef = kurzHash(text);
    if (task.notiz === pruef) return false;
    await cuRequest('POST', '/task/' + task.taskId + '/comment', {
      comment_text: text, notify_all: false,
    });
    await markerSetzen(task, 'igfu-notiz', pruef);
    task.notiz = pruef;
    return true;
  }

  async function mailEintragen(task, mail) {
    const geschrieben = await markerEintragen(task, 'igfu-mail', mail);
    task.mail = mail;
    return geschrieben;
  }

  // Zwei Dinge, die sonst stillschweigend durchfallen:
  //   1. Ist der Handle nur im Namen, wird er als Markerzeile nachgetragen.
  //   2. Fehlt er ganz, bekommt der Task den Tag „handle-fehlt".
  // Ohne Handle ist ein Task fuer saemtliche Automatiken unsichtbar — Content,
  // UpPromote, Sales, E-Mail-Bruecke, Warensendung, Frist. Am 02.10.2026 waren
  // das 17 von rund 54 Tasks, und gemerkt hat es niemand, weil jede Automatik
  // einfach uebersprungen hat, was sie nicht zuordnen konnte.
  async function handleLuecken() {
    if (!cuEingerichtet() || cuLaeuft) return { marker: 0, fehlt: 0 };
    cuLaeuft = true;
    let marker = 0;
    let fehlt = 0;
    try {
      await cuTasksLaden();
      for (const t of alleTasks()) {
        // Abgesagt, keine Antwort, beendet: dort interessiert kein Handle mehr.
        if (STATUS_ENDE.includes(String(t.status || '').toLowerCase())) continue;
        if (t.leiche) continue;
        const h = handleVonTask(t);
        if (h && !t.handle) {
          await markerEintragen(t, 'igfu-handle', h);
          t.handle = h;
          marker += 1;
        }
        if (!h && !t.ohneHandle) {
          await cuTagSetzen(t.taskId, CU_TAG_OHNE_HANDLE, ROT, true);
          t.ohneHandle = true;
          fehlt += 1;
        } else if (h && t.ohneHandle) {
          await cuTagSetzen(t.taskId, CU_TAG_OHNE_HANDLE, ROT, false);
          t.ohneHandle = false;
        }
      }
      cuSpeichern();
    } catch (e) {
      toast('Handles: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
    return { marker, fehlt };
  }

  // Das Onboarding-Datum. UpPromote benennt es je nach Konto unterschiedlich,
  // deshalb werden mehrere Felder der Reihe nach probiert und das erste
  // genommen, das sich als Datum lesen laesst. Findet sich keines, bleibt es
  // leer — dann bekommt der Task eben keine Frist statt einer erfundenen.
  const DATUM_FELDER = ['approved_at', 'created_at', 'joined_at', 'registered_at',
    'approved_date', 'created', 'date_created'];
  function datumAusAffiliate(a) {
    for (const feld of DATUM_FELDER) {
      const roh = a && a[feld];
      if (!roh) continue;
      const d = new Date(typeof roh === 'number' && roh < 1e12 ? roh * 1000 : roh);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return isoVonMs(d.getTime());
    }
    return '';
  }

  // Wie upAktive, aber mit allem, was der Import braucht, und ohne die
  // Beschraenkung auf Affiliates mit Handle.
  async function upAktiveVoll(melden) {
    const raus = [];
    let vorige = '';
    for (let seite = 1; seite <= UP_MAX_SEITEN; seite++) {
      if (melden) melden('Frage UpPromote ab, Seite ' + seite + ' \u2026');
      const d = await upRequest('/affiliates?status=active&per_page=100&page=' + seite);
      const liste = d.data || d.affiliates || (Array.isArray(d) ? d : []);
      if (!liste.length) break;
      const kennung = liste.map((a) => (a && (a.id || a.email)) || '').join(',');
      if (kennung === vorige) break;
      vorige = kennung;
      for (const a of liste) {
        raus.push({
          handle: handleAusAffiliate(a),
          email: String(a.email || '').trim().toLowerCase(),
          name: [a.first_name, a.last_name].filter(Boolean).join(' ').trim(),
          programm: String(a.program_name || '').trim(),
          notiz: notizAusAffiliate(a),
          seit: datumAusAffiliate(a),
          umsatz: ['approved_amount', 'pending_amount', 'paid_amount']
            .reduce((summe, feld) => summe + (parseFloat(a[feld]) || 0), 0),
        });
      }
      if (liste.length < 100) break;
    }
    return raus;
  }

  // Zu einem Handle die Unterhaltung finden, sofern das Skript ihr schon einmal
  // begegnet ist. Metas Thread-ID laesst sich nicht aus dem Handle berechnen,
  // sie muss nachgeschlagen werden.
  function threadZuHandle(h) {
    if (!h) return '';
    const alle = handles();
    for (const tid of Object.keys(alle)) {
      if (alle[tid] && alle[tid].handle === h) return tid;
    }
    return '';
  }

  async function importAnlegen(a) {
    const tid = threadZuHandle(a.handle);
    const z = [];
    const igJetzt = isIG();
    if (tid) {
      z.push('[Unterhaltung ' + (igJetzt ? 'auf Instagram' : 'im Postfach') + ' öffnen]('
        + postfachLink(tid, igJetzt) + ')', '');
    }
    if (a.handle) {
      z.push('[Auf Instagram anschreiben](' + anschreibLink(a.handle) + ')', '');
      z.push('Instagram: [@' + a.handle + '](https://www.instagram.com/' + a.handle + '/)', '');
    }
    z.push('---', 'Aus UpPromote übernommen. Die folgenden Zeilen bitte nicht ändern.');
    if (tid) z.push((igJetzt ? 'igfu-ig: ' : 'igfu-thread: ') + tid);
    if (a.handle) z.push('igfu-handle: ' + a.handle);
    if (a.email) z.push('igfu-mail: ' + a.email);
    const t = await cuRequest('POST', '/list/' + encodeURIComponent(cuListe()) + '/task', {
      name: taskName(a.handle, a.name || a.email || 'Unbekannt'),
      status: a.umsatz > 0 ? CU_STATUS_SALES : CU_STATUS_ONBOARD,
      markdown_description: z.join('\n'),
    });
    const angelegt = taskAufbereiten(t);
    angelegt.tid = tid;
    angelegt.handle = a.handle;
    angelegt.mail = a.email;
    if (tid) cuTasks[tid] = angelegt; else cuOhneThread.push(angelegt);
    if (!a.handle) {
      await cuTagSetzen(angelegt.taskId, CU_TAG_OHNE_HANDLE, ROT, true);
      angelegt.ohneHandle = true;
    }
    await notizUebertragen(angelegt, a.notiz);
    return angelegt;
  }

  // Erster Aufruf zaehlt nur, zweiter legt an. Bei dieser Menge will man vorher
  // sehen, was passiert.
  let importVorschau = null;
  async function upImport() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (!upToken()) { toast('Bitte erst den UpPromote-Token eintragen.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    try {
      const alle = await upAktiveVoll(toast);
      const imProgramm = alle.filter((a) => a.programm === UP_PROGRAMM);
      await cuTasksLaden();
      const handlesDa = new Set();
      const mailsDa = new Set();
      for (const t of alleTasks()) {
        const h = handleVonTask(t);
        if (h) handlesDa.add(h);
        if (t.mail) mailsDa.add(t.mail);
      }
      const neu = imProgramm.filter((a) => !(a.handle && handlesDa.has(a.handle))
        && !(a.email && mailsDa.has(a.email)));
      const ohneH = neu.filter((a) => !a.handle).length;

      if (!importVorschau || importVorschau.stand < Date.now() - 300000) {
        importVorschau = { stand: Date.now(), anzahl: neu.length };
        toast(imProgramm.length + ' aktive im Programm „' + UP_PROGRAMM + '", '
          + (imProgramm.length - neu.length) + ' schon im CRM, ' + neu.length + ' neu'
          + (ohneH ? ', davon ' + ohneH + ' ohne Handle' : '')
          + (alle.length - imProgramm.length ? '. ' + (alle.length - imProgramm.length)
            + ' aus anderen Programmen übersprungen' : '')
          + '. Nochmal klicken legt sie an.');
        return;
      }
      importVorschau = null;
      let fertig = 0;
      let verknuepft = 0;
      for (const a of neu) {
        toast('Lege an: ' + (fertig + 1) + ' von ' + neu.length + ' \u2026');
        const angelegt = await importAnlegen(a);
        if (angelegt.tid) verknuepft += 1;
        fertig += 1;
      }
      cuSpeichern();
      toast(fertig + ' angelegt, davon ' + verknuepft + ' mit Unterhaltung verknüpft.');
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Import: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  // Traegt fehlende Nachfass-Fristen nach. Einmalig gedacht, aber beliebig oft
  // wiederholbar, weil Tasks mit Frist unangetastet bleiben.
  //
  // Drei Regeln, nach Status:
  //   ab „erste ware versendet"  Versand + 10 Wochentage
  //   „ongeboardet"              Onboarding-Datum aus UpPromote + 14 Tage
  //   darunter                   letzte Nachricht + 14 Tage
  //
  // Zwei Dinge, die hier zwingend sind:
  //   1. Nur Tasks ohne Frist. Wer eine hat, wird nicht angefasst — auch nicht
  //      „nur korrigiert". So verlangt, und es macht den Lauf wiederholbar.
  //   2. Nie vor das Startdatum. ClickUp lehnt eine Faelligkeit vor dem
  //      Startdatum ab („Enable the Duration ClickApp"), und das Startdatum
  //      traegt bei uns die letzte Nachricht. Eine Warensendung von Mai ergaebe
  //      bei einem Gespraech von Oktober sonst eine Frist in der Vergangenheit
  //      und einen Fehler 400. Deshalb gilt wie ueberall die spaetere der
  //      beiden Regeln.
  // Holt die Handles und legt sie ab. Die Zuordnung zu den Unterhaltungen
  // passiert danach im Scan ueber den Zeitpunkt, siehe handleAusApi.
  //
  // Die Meldung nennt bewusst auch, was *nicht* geklappt hat: wie viele
  // Unterhaltungen ohne Handle zurueckkamen und ob die Unterhaltungs-ID der API
  // zufaellig doch dem selected_item_id des Postfachs entspricht. Beides laesst
  // sich ohne einen echten Aufruf nicht wissen, und ohne diese Zahlen waere der
  // naechste Schritt wieder Raterei.
  async function metaHandlesHolen() {
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    if (!metaToken()) { toast('Bitte erst den Meta-Token eintragen.'); return; }
    cuLaeuft = true;
    try {
      const roh = await metaUnterhaltungen(toast);
      const liste = metaFunde(roh);
      GM_setValue(META_FUNDE, { stand: Date.now(), liste });
      // Gegenprobe: trifft eine API-Kennung eine Thread-ID aus dem Postfach?
      const imPostfach = new Set(threadRows().map(([, t]) => String(t.threadID)));
      const idTreffer = liste.filter((f) => imPostfach.has(f.id)).length;
      const ohneHandleDa = roh.length - new Set(liste.map((f) => f.id)).size;
      toast(roh.length + ' Unterhaltungen von Meta, ' + liste.length + ' mit Handle'
        + (ohneHandleDa > 0 ? ', ' + ohneHandleDa + ' ohne' : '')
        + '. ' + (idTreffer ? idTreffer + ' Kennungen passen direkt auf das Postfach.'
          : 'Zuordnung läuft über den Zeitpunkt.'));
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Meta: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  // Raeumt die Altlinks aus den Beschreibungen — aber nur dort, wo der
  // Instagram-Link schon drinsteht. Ein Task, der noch keinen hat, behaelt
  // seinen alten, sonst bliebe er ohne jede Verlinkung zurueck.
  //
  // Entfernt werden drei Sorten Zeilen:
  //   - der Link ins alte Postfach (business.facebook.com/latest/inbox)
  //   - die von Hand eingefuegte Zeile „Link zu Nachrichten: …"
  //   - die Markerzeile mit der 39-stelligen Kennung
  // Die Profilzeile „Instagram: @handle" bleibt — die ist kein
  // Unterhaltungslink.
  //
  // Der Instagram-Link wandert dabei nach oben. Er haengt sonst unter dem
  // Markerblock, weil er beim Umzug angehaengt wurde, und genau den klickt
  // Josia staendig.
  function altlinkAufraeumen(text) {
    const zeilen = String(text || '').split('\n');
    const alteKennungen = threadsAusText(text);
    const neueKennungen = igsAusText(text);
    if (!alteKennungen.length || !neueKennungen.length) return null;

    const raus = [];
    let igLink = '';
    for (const z of zeilen) {
      const t = z.trim();
      if (/business\.facebook\.com\/latest\/inbox/.test(t)) continue;
      if (/^Link zu Nachrichten:/i.test(t)) continue;
      if (/^igfu-thread:\s*[A-Za-z0-9_-]+/.test(t)) continue;
      // Den ersten Instagram-Link herausnehmen und spaeter nach oben setzen.
      if (!igLink && /\]\(https:\/\/www\.instagram\.com\/direct\/t\//.test(t)) {
        igLink = '[Unterhaltung auf Instagram öffnen](' + t.slice(t.indexOf('](') + 2, t.lastIndexOf(')')) + ')';
        continue;
      }
      raus.push(z);
    }
    let neu = raus.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
    if (igLink) neu = igLink + '\n\n' + neu;
    return neu.replace(/\s+$/, '');
  }

  // Zum Anschreiben braucht es keine Unterhaltungs-Kennung. Instagrams eigenes
  // Kurzformat oeffnet den Chat mit einer Person allein ueber den Handle:
  //
  //     https://ig.me/m/<handle>
  //
  // Den Handle hat fast jeder Task. Damit bekommt jeder Datensatz sofort einen
  // brauchbaren Link — unabhaengig davon, ob die Unterhaltung je zugeordnet
  // wurde. Das ist der Unterschied zwischen „ich kann arbeiten" und „ich warte
  // auf eine Zuordnung, die vielleicht nie kommt".
  //
  // Wo schon ein Link auf eine konkrete Unterhaltung steht, bleibt es dabei:
  // der oeffnet den Verlauf, ig.me nur den Chat.
  const anschreibLink = (handle) => 'https://ig.me/m/' + encodeURIComponent(handle);

  async function anschreibLinksNachtragen() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    let gesetzt = 0;
    let ohneHandleZahl = 0;
    let fehler = 0;
    try {
      await cuTasksLaden();
      const kandidaten = alleTasks().filter((t) => !t.leiche
        && !STATUS_ENDE.includes(String(t.status || '').toLowerCase().trim()));
      toast(kandidaten.length + ' Tasks werden geprüft …');
      for (const t of kandidaten) {
        const h = handleVonTask(t);
        if (!h) { ohneHandleZahl += 1; continue; }
        try {
          const voll = await cuRequest('GET', '/task/' + t.taskId + '?include_markdown_description=true');
          const bisher = voll.markdown_description || voll.description || '';
          // Schon ein Instagram-Link da? Dann nichts tun.
          if (/instagram\.com\/direct\/t\//.test(bisher) || /ig\.me\/m\//.test(bisher)) continue;
          const zeile = '[Auf Instagram anschreiben](' + anschreibLink(h) + ')';
          await cuRequest('PUT', '/task/' + t.taskId, {
            markdown_description: zeile + '\n\n' + bisher.replace(/^\s+/, ''),
          });
          gesetzt += 1;
        } catch (e) {
          fehler += 1;
        }
      }
      toast(gesetzt + ' Anschreib-Links gesetzt'
        + (ohneHandleZahl ? ', ' + ohneHandleZahl + ' ohne Handle übersprungen' : '')
        + (fehler ? ', ' + fehler + ' fehlgeschlagen' : '') + '.');
      await cuTasksLaden();
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Anschreib-Links: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  // Einmalige Reparatur: Bis 6.8 bekam jede Unterhaltung die Zeile
  // `igfu-thread:`, egal ob sie aus dem Postfach oder von instagram.com kam —
  // unterschieden wurde an der Laenge der Kennung, und die Annahme war falsch.
  //
  // Richtigstellen laesst sich das am Link daneben: steht in der Beschreibung
  // ein `instagram.com/direct/t/<kennung>`, gehoert die Kennung zu Instagram.
  // Das ist kein Raten, sondern eine Tatsache aus derselben Beschreibung.
  function kennungenRichtigstellen(text) {
    const roh = String(text || '');
    let geaendert = false;
    const zeilen = roh.split('\n').map((z) => {
      const m = /^(\s*)igfu-thread:\s*([A-Za-z0-9_-]+)\s*$/.exec(z);
      if (!m) return z;
      const inst = new RegExp('instagram\\.com/direct/t/' + m[2].replace(/[^A-Za-z0-9_-]/g, '') + '\\b');
      if (!inst.test(roh)) return z;
      geaendert = true;
      return m[1] + 'igfu-ig: ' + m[2];
    });
    return geaendert ? zeilen.join('\n') : null;
  }

  // Repariert Namen, die aus fehlerhaft gelesenen Zeilen entstanden sind.
  // Zwei Schaeden, beide am 13.10.2026 im CRM gefunden:
  //
  //   „beispiel.stkl — Beispiel PersonYou: Hi Beispiel," — die Vorschau ist in den
  //   Namen gerutscht, weil Instagram Name und Vorschau zeitweise in einem
  //   Textknoten rendert.
  //
  //   „https — <Anzeigename>" — die Vorschau begann mit einer Adresse, und das Muster
  //   „wort:" machte daraus den Handle „https".
  //
  // Beides ist seit 6.8 behoben, die Altlasten bleiben aber stehen.
  function namenRichtigstellen(task) {
    const alt = String(task.titel || '');
    let name = alt;
    let handleRaus = '';
    // Falscher Handle vorne? Dann weg damit — der echte ist unbekannt, und
    // ein erfundener ist schlimmer als keiner. Der Task faellt danach in die
    // Liste „Handles nachtragen".
    const m = /^([a-z0-9._]{2,30})\s+—\s+(.*)$/.exec(name);
    if (m && KEIN_HANDLE.has(m[1].toLowerCase())) {
      handleRaus = m[1];
      name = m[2];
    }
    // Vorschau im Namen? Alles ab „You: " bzw. „Du: " gehoert nicht dazu.
    name = name.split(/(?:You|Du):\s/)[0].replace(/\s+$/, '');
    if (!name) return null;
    return (name === alt && !handleRaus) ? null : { name, handleRaus };
  }

  // Gegenprobe gegen UpPromote. Ein Handle kann aus dem Vorschautext oder dem
  // Zeilentitel stammen, und beides kann danebenliegen — ein kleingeschriebener
  // Anzeigename sieht aus wie ein Handle. UpPromote dagegen kennt ihn als
  // Tatsache, eingetragen vom Affiliate selbst.
  //
  // Zugeordnet wird ueber die Mailadresse, nicht ueber den Handle — sonst
  // wuerde die Pruefung genau das voraussetzen, was sie pruefen soll.
  //
  // Es wird nichts geaendert. Ein abweichender Handle kann auch heissen, dass
  // Josia ihn von Hand richtiggestellt hat und UpPromote veraltet ist.
  async function handlesPruefen() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (!upToken()) { toast('Dafür wird der UpPromote-Token gebraucht.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    try {
      await cuTasksLaden();
      toast('Frage UpPromote ab …');
      const nachMail = {};
      for (const a of await upAktiveVoll(toast)) {
        if (a.email && a.handle) nachMail[a.email] = a.handle;
      }
      const zweifel = [];
      for (const t of alleTasks()) {
        if (t.leiche || !t.mail) continue;
        const beiUp = nachMail[String(t.mail).toLowerCase()];
        const hier = handleVonTask(t);
        if (!beiUp || !hier || beiUp === hier) continue;
        zweifel.push({ taskId: t.taskId, titel: t.titel, url: t.url, hier, beiUp });
      }
      GM_setValue(HANDLE_ZWEIFEL, { stand: Date.now(), liste: zweifel });
      toast(zweifel.length
        ? zweifel.length + ' Handles weichen von UpPromote ab — die Liste steht im Panel.'
        : 'Alle Handles stimmen mit UpPromote überein.');
      if (panelOpen) renderPanel();
      updateLauncher();
    } catch (e) {
      toast('Handle-Prüfung: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  async function namenReparieren() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    let geaendert = 0;
    let fehler = 0;
    try {
      await cuTasksLaden();
      for (const t of alleTasks()) {
        const neu = namenRichtigstellen(t);
        if (!neu) continue;
        try {
          await cuRequest('PUT', '/task/' + t.taskId, { name: neu.name });
          if (neu.handleRaus) {
            const voll = await cuRequest('GET', '/task/' + t.taskId + '?include_markdown_description=true');
            const bisher = voll.markdown_description || voll.description || '';
            const ohne = bisher.split('\n')
              .filter((z) => !new RegExp('^\\s*igfu-handle:\\s*' + neu.handleRaus + '\\s*$').test(z))
              .join('\n');
            if (ohne !== bisher) await cuRequest('PUT', '/task/' + t.taskId, { markdown_description: ohne });
          }
          geaendert += 1;
        } catch (e) {
          fehler += 1;
        }
      }
      await cuTasksLaden();
      toast(geaendert + ' Namen richtiggestellt'
        + (fehler ? ', ' + fehler + ' fehlgeschlagen' : '') + '.');
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Namen: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  async function kennungenReparieren() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    let geaendert = 0;
    let fehler = 0;
    try {
      await cuTasksLaden();
      const alle = alleTasks();
      toast(alle.length + ' Beschreibungen werden geprüft …');
      for (const t of alle) {
        try {
          const voll = await cuRequest('GET', '/task/' + t.taskId + '?include_markdown_description=true');
          const bisher = voll.markdown_description || voll.description || '';
          const neu = kennungenRichtigstellen(bisher);
          if (!neu) continue;
          await cuRequest('PUT', '/task/' + t.taskId, { markdown_description: neu });
          geaendert += 1;
        } catch (e) {
          fehler += 1;
        }
      }
      await cuTasksLaden();
      toast(geaendert + ' Kennungen als Instagram-Unterhaltung gekennzeichnet'
        + (fehler ? ', ' + fehler + ' fehlgeschlagen' : '') + '.');
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Kennungen: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  async function altlinksEntfernen() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    let geaendert = 0;
    let uebersprungen = 0;
    let fehler = 0;
    try {
      await cuTasksLaden();
      const kandidaten = alleTasks().filter((t) => (t.tidsIG || []).length && (t.tidsBS || []).length);
      if (!kandidaten.length) { toast('Keine Beschreibung trägt noch einen alten Link.'); return; }
      toast(kandidaten.length + ' Beschreibungen werden aufgeräumt …');
      for (const t of kandidaten) {
        try {
          const voll = await cuRequest('GET', '/task/' + t.taskId + '?include_markdown_description=true');
          const bisher = voll.markdown_description || voll.description || '';
          const neu = altlinkAufraeumen(bisher);
          if (!neu || neu === bisher.replace(/\s+$/, '')) { uebersprungen += 1; continue; }
          await cuRequest('PUT', '/task/' + t.taskId, { markdown_description: neu });
          geaendert += 1;
        } catch (e) {
          fehler += 1;
        }
      }
      await cuTasksLaden();
      toast(geaendert + ' Beschreibungen aufgeräumt'
        + (uebersprungen ? ', ' + uebersprungen + ' unverändert' : '')
        + (fehler ? ', ' + fehler + ' fehlgeschlagen' : '') + '.');
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Aufräumen: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  async function fristenNachtragen() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    const zahl = { ware: 0, onboard: 0, gespraech: 0, ohne: 0, fehler: 0 };
    try {
      await cuTasksLaden();
      // Das Onboarding-Datum gibt es nur bei UpPromote. Ohne Token wird dieser
      // Teil uebersprungen, der Rest laeuft trotzdem.
      const nachHandle = {};
      const nachMail = {};
      if (upToken()) {
        toast('Frage UpPromote nach den Onboarding-Daten …');
        for (const a of await upAktiveVoll(toast)) {
          if (a.handle && !nachHandle[a.handle]) nachHandle[a.handle] = a;
          if (a.email && !nachMail[a.email]) nachMail[a.email] = a;
        }
      }
      const offen = alleTasks().filter((t) => !t.due && !t.leiche
        && !STATUS_ENDE.includes(String(t.status || '').toLowerCase().trim()));
      if (!offen.length) { toast('Alle Tasks haben bereits eine Frist.'); return; }
      toast(offen.length + ' Tasks ohne Frist werden versorgt …');
      for (const t of offen) {
        const rang = statusRang(t.status);
        let frist = '';
        let art = '';
        if (rang >= statusRang(CU_STATUS_WARE) && t.ware) {
          frist = wochentagePlus(t.ware, 10);
          art = 'ware';
        } else if (String(t.status || '').toLowerCase().trim() === CU_STATUS_ONBOARD) {
          const a = nachHandle[handleVonTask(t)] || nachMail[t.mail];
          if (a && a.seit) { frist = tagePlus(a.seit, 14); art = 'onboard'; }
        } else if (rang >= 0 && rang < statusRang(CU_STATUS_ONBOARD) && t.letzte) {
          frist = tagePlus(t.letzte, 14);
          art = 'gespraech';
        }
        if (frist && t.letzte) {
          const mindestens = tagePlus(t.letzte, 14);
          if (mindestens && mindestens > frist) frist = mindestens;
        }
        const ms = frist ? msVonIso(frist) : 0;
        if (!ms) { zahl.ohne += 1; continue; }
        try {
          await cuRequest('PUT', '/task/' + t.taskId, { due_date: ms, due_date_time: false });
          t.due = frist;
          zahl[art] += 1;
        } catch (e) {
          zahl.fehler += 1;
        }
      }
      cuSpeichern();
      toast('Fristen nachgetragen: ' + zahl.ware + ' über den Warenversand, '
        + zahl.onboard + ' über das Onboarding, ' + zahl.gespraech + ' über die letzte Nachricht. '
        + zahl.ohne + ' ohne brauchbares Datum'
        + (zahl.fehler ? ', ' + zahl.fehler + ' abgelehnt' : '') + '.');
      scanRows();
      updateLauncher();
    } catch (e) {
      toast('Fristen: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  async function upAbgleichen() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (!upToken()) { toast('Bitte erst den UpPromote-Token eintragen.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    try {
      toast('Frage UpPromote ab …');
      const aktive = await upAktive(toast);
      await cuTasksLaden();
      const treffer = [];
      for (const t of alleTasks()) {
        if (t.leiche) continue;
        const h = handleVonTask(t);
        const a = h && aktive[h];
        if (!a) continue;
        // Wer verkauft hat, ist weiter als nur ongeboardet.
        const ziel = a.umsatz > 0 ? CU_STATUS_SALES : CU_STATUS_ONBOARD;
        const statusNoetig = darfSetzen(t.status, ziel);
        const mailNoetig = !!a.email && !t.mail;
        const notizNoetig = !!a.notiz && t.notiz !== kurzHash(a.notiz.trim());
        if (statusNoetig || mailNoetig || notizNoetig) {
          treffer.push({ t, ziel, statusNoetig, mailNoetig, mail: a.email, notiz: a.notiz });
        }
      }
      if (!treffer.length) {
        toast(Object.keys(aktive).length + ' bestätigte Affiliates bei UpPromote, nichts Neues im CRM.');
        return;
      }
      let fertig = 0;
      let mails = 0;
      let notizen = 0;
      for (const x of treffer) {
        if (x.statusNoetig) {
          toast('Setze auf „' + x.ziel + '" …');
          await cuRequest('PUT', '/task/' + x.t.taskId, { status: x.ziel });
          x.t.status = x.ziel;
          fertig++;
        }
        if (x.mailNoetig) { await mailEintragen(x.t, x.mail); mails++; }
        if (await notizUebertragen(x.t, x.notiz)) notizen++;
      }
      cuSpeichern();
      toast(fertig + ' Status gesetzt'
        + (mails ? ', ' + mails + ' E-Mail(s) nachgetragen' : '')
        + (notizen ? ', ' + notizen + ' Notiz(en) als Kommentar' : '')
        + ', von ' + Object.keys(aktive).length + ' bestätigten Affiliates.');
      scanRows();
    } catch (e) {
      toast('UpPromote: ' + e.message);
    } finally {
      cuLaeuft = false;
    }
  }

  // Die Status der Liste, in ClickUps eigener Reihenfolge und mit ihren Farben.
  //
  // STATUS_LEITER im Skript ist etwas anderes: sie beschreibt, wohin die
  // *Automatik* schieben darf. Fuer die Auswahl von Hand zaehlt, was in der
  // Liste wirklich steht — auch die Endstatus, auch eine Stufe, die spaeter
  // dazukommt.
  const CU_STATI = 'clickup:stati:v1';
  const statiAusCache = () => {
    const roh = GM_getValue(CU_STATI, []);
    return Array.isArray(roh) && roh.length ? roh : [];
  };
  // Faellt der Abruf aus, bleibt die Auswahl trotzdem benutzbar: die im Skript
  // bekannten Stufen stehen dann ohne Farbe da.
  const statiNotnagel = () => STATUS_LEITER.concat(STATUS_ENDE).map((n) => ({ name: n, farbe: '' }));
  const stati = () => { const c = statiAusCache(); return c.length ? c : statiNotnagel(); };

  async function statiLaden() {
    const daten = await cuRequest('GET', '/list/' + encodeURIComponent(cuListe()));
    const liste = (daten.statuses || [])
      .slice()
      .sort((a, b) => (Number(a.orderindex) || 0) - (Number(b.orderindex) || 0))
      .map((x) => ({ name: String(x.status || '').toLowerCase().trim(), farbe: x.color || '' }))
      .filter((x) => x.name);
    if (liste.length) GM_setValue(CU_STATI, liste);
    return liste;
  }

  // Die Tags des Space, mit ihren Farben. Wie bei den Status gelesen statt
  // fest eingebaut: ein Tag, den Josia in ClickUp anlegt, taucht dann von
  // allein in der Auswahl auf.
  const CU_TAGLISTE = 'clickup:tagliste:v1';
  const tagsAusCache = () => {
    const roh = GM_getValue(CU_TAGLISTE, []);
    return Array.isArray(roh) ? roh : [];
  };
  async function tagsLaden() {
    const space = cuSpace() || (await cuSpaceLaden());
    const daten = await cuRequest('GET', '/space/' + space + '/tag');
    const liste = (daten.tags || [])
      .map((t) => ({ name: String(t.name || '').toLowerCase().trim(), farbe: t.tag_bg || '' }))
      .filter((t) => t.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (liste.length) GM_setValue(CU_TAGLISTE, liste);
    return liste;
  }

  // Diese drei vergibt das Skript selbst. Von Hand umschaltbar waeren sie ein
  // Kampf gegen die Automatik: „ad-code" haelt eine Tatsache fest und wird nie
  // entfernt, „handle-fehlt" verschwindet von allein, sobald der Handle da
  // ist, und fuer „follow-up" gibt es den eigenen Knopf daneben.
  const TAGS_AUTOMATIK = {
    [CU_TAG]: 'Dafuer gibt es den Follow-up-Knopf daneben',
    [CU_TAG_ADCODE]: 'Setzt das Skript selbst, wenn Content erkannt wurde',
    'handle-fehlt': 'Setzt und entfernt das Skript selbst',
  };

  async function cuSpaceLaden() {
    const daten = await cuRequest('GET', '/list/' + encodeURIComponent(cuListe()));
    const id = daten && daten.space && daten.space.id;
    if (!id) throw new Error('Zu dieser Liste liess sich kein Space ermitteln.');
    GM_setValue(CU_SPACE, String(id));
    return String(id);
  }
  const cuSpace = () => String(GM_getValue(CU_SPACE, '') || '');

  // Legt den Tag einmalig im Space an, falls er fehlt. Danach nur noch gelesen.
  const tagGeprueft = new Set();
  async function cuTagSichern(name, farbe) {
    // Ohne Namen gibt es nichts zu sichern. Ohne diese Schranke entstand aus
    // einem vergessenen Argument ein Tag namens „undefined" — ClickUp lehnt
    // das mit 400 ab, und auf einem frisch eingerichteten Konto scheiterte
    // dadurch jeder Abgleich. Am 22.10.2026 bei der Einrichtung des zweiten
    // Arbeitsplatzes aufgefallen.
    if (!name) return;
    if (tagGeprueft.has(name)) return;
    const space = cuSpace() || (await cuSpaceLaden());
    const daten = await cuRequest('GET', '/space/' + space + '/tag');
    const da = (daten.tags || []).some((t) => (t.name || '').toLowerCase() === name);
    if (!da) {
      try {
        await cuRequest('POST', '/space/' + space + '/tag', {
          tag: { name, tag_fg: '#1c1e21', tag_bg: farbe || YELLOW },
        });
      } catch (e) {
        if (e.wiederholbar || e.blockierend) throw e;
        throw new Error('Der Tag „' + name + '" fehlt im Space und liess sich nicht anlegen. '
          + 'Bitte einmal von Hand in ClickUp anlegen. ' + e.message);
      }
    }
    tagGeprueft.add(name);
  }

  // „ad-code" wird nur gesetzt und nie entfernt, der haelt eine Tatsache fest.
  // „handle-fehlt" dagegen verschwindet wieder, sobald der Handle da ist.
  async function cuTagSetzen(taskId, name, farbe, an) {
    if (an === false) {
      try {
        await cuRequest('DELETE', '/task/' + taskId + '/tag/' + encodeURIComponent(name));
      } catch (e) {
        if (!e.wiederholbar && !e.blockierend) return;  // war gar nicht dran
        throw e;
      }
      return;
    }
    await cuTagSichern(name, farbe);
    await cuRequest('POST', '/task/' + taskId + '/tag/' + encodeURIComponent(name));
  }

  const bildAusText = (text) => (String(text || '').match(/igfu-bild:\s*([0-9]{6,})/) || [])[1] || '';
  // Die Instagram-Benutzer-ID des Affiliates. Der einzige Schluessel, der eine
  // Person wirklich festhaelt: der Anzeigename aendert sich und wird aus der
  // Liste falsch gelesen, der Handle laesst sich umbenennen und steht in der
  // Zeilenliste gar nicht, die Thread-Kennung ist je Postfach eine andere. Die
  // ID ist fuer dieselbe Person in Partner-Nachrichten und DMs dieselbe.
  const nutzerAusText = (text) => (String(text || '').match(/igfu-iguser:\s*([0-9]{3,})/) || [])[1] || '';
  // Die E-Mail ist die Bruecke zu Shopify. An der Geschenkbestellung dort steht
  // nur die Adresse des Affiliates, kein Instagram-Handle.
  const mailAusText = (text) => String((String(text || '')
    .match(/igfu-mail:\s*([^\s<>()]+@[^\s<>()]+)/) || [])[1] || '').toLowerCase();
  // Der Handle steht weiterhin im Task-Namen, zusaetzlich aber als eigene
  // Markerzeile. Die ist die massgebliche Bezugsstelle: eine Umbenennung in
  // ClickUp kann die Zuordnung damit nicht mehr stillschweigend zerreissen.
  const handleAusText = (text) => {
    const h = (String(text || '').match(/igfu-handle:\s*([a-z0-9._]{2,30})/i) || [])[1] || '';
    return HANDLE_MUSTER.test(h.toLowerCase()) ? h.toLowerCase() : '';
  };
  // Kurze Pruefsumme, damit dieselbe Notiz nicht bei jedem Lauf erneut als
  // Kommentar landet. Sie steht in der Beschreibung und nicht im GM-Speicher,
  // denn der ist pro Browser — sonst postet der Mac, was Windows schon hat.
  function kurzHash(text) {
    let h = 0;
    const t = String(text || '');
    for (let i = 0; i < t.length; i++) { h = ((h * 31) + t.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36);
  }
  const notizAusText = (text) => (String(text || '').match(/igfu-notiz:\s*([a-z0-9]+)/i) || [])[1] || '';

  // Versanddatum der Warenprobe, vom geplanten Shopify-Lauf eingetragen.
  const wareAusText = (text) => (String(text || '').match(/igfu-ware:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';

  function taskAufbereiten(t) {
    const texte = [t.description, t.text_content, t.markdown_description];
    const tidsIG = [];
    const tidsBS = [];
    for (const x of texte) {
      for (const einzel of igsAusText(x)) if (!tidsIG.includes(einzel)) tidsIG.push(einzel);
      for (const einzel of threadsAusText(x)) if (!tidsBS.includes(einzel)) tidsBS.push(einzel);
    }
    // Instagram zuerst: dort wird gearbeitet.
    const tids = tidsIG.concat(tidsBS.filter((x) => !tidsIG.includes(x)));
    let tid = tids[0] || '';
    if (!tid) {
      // Rueckfall fuer Tasks, die noch aus der Zeit mit Custom Fields stammen.
      // Der Treffer muss auch in tids landen, sonst gilt der Task als einer
      // ohne Unterhaltung — cuTasksLaden entscheidet danach.
      for (const f of t.custom_fields || []) {
        if (f.name === FELD_THREAD && f.value) { tid = String(f.value); tids.push(tid); break; }
      }
    }
    let bild = '';
    for (const x of texte) { bild = bild || bildAusText(x); }
    let nutzer = '';
    for (const x of texte) { nutzer = nutzer || nutzerAusText(x); }
    let mail = '';
    for (const x of texte) { mail = mail || mailAusText(x); }
    let ware = '';
    for (const x of texte) { ware = ware || wareAusText(x); }
    let handle = '';
    for (const x of texte) { handle = handle || handleAusText(x); }
    let notiz = '';
    for (const x of texte) { notiz = notiz || notizAusText(x); }
    const tags = (t.tags || []).map((x) => String(x.name || '').toLowerCase());
    return {
      tid: tid ? String(tid) : '',
      // Die erste Markerzeile bleibt die fuehrende, tids traegt alle.
      tids: tids.map(String),
      tidsIG: tidsIG.map(String),
      tidsBS: tidsBS.map(String),
      bild,
      nutzer,
      mail,
      ware,
      handle,
      notiz,
      taskId: t.id,
      titel: t.name,
      status: (t.status && t.status.status) || '',
      farbe: (t.status && t.status.color) || '#65676b',
      // Die Tags selbst, nicht nur die drei daraus abgeleiteten Flaggen: die
      // Kopfleiste zeigt sie als Pillen und schaltet sie um. Bis 8.7 wurden
      // sie berechnet und dann weggeworfen.
      tags,
      follow: tags.includes(CU_TAG),
      adcode: tags.includes(CU_TAG_ADCODE),
      ohneHandle: tags.includes(CU_TAG_OHNE_HANDLE),
      leiche: tags.includes(CU_TAG_LEICHE),
      prio: (t.priority && t.priority.priority) || '',
      due: isoVonMs(t.due_date),
      // Das Startdatum traegt bei uns das Datum der letzten Nachricht. Ein
      // eigenes Custom Field waere im Free-Plan nicht bezahlbar, und im
      // Gegensatz zu einer Zeile in der Beschreibung laesst sich danach sortieren.
      letzte: isoVonMs(t.start_date),
      url: t.url,
    };
  }

  async function cuTasksLaden() {
    const liste = encodeURIComponent(cuListe());
    const gefunden = {};
    const nachBild = {};
    const nachNutzer = {};
    const ohneThread = [];
    for (let seite = 0; seite < 25; seite++) {
      const d = await cuRequest('GET', '/list/' + liste + '/task?include_closed=true&subtasks=false&page=' + seite);
      for (const t of d.tasks || []) {
        const neu = taskAufbereiten(t);
        if (neu.bild && !nachBild[neu.bild]) nachBild[neu.bild] = neu;
        // Karteileichen duerfen den Index nicht besetzen, sonst zieht eine
        // stillgelegte Dublette die Unterhaltung an sich.
        if (neu.nutzer && !neu.leiche && !nachNutzer[neu.nutzer]) nachNutzer[neu.nutzer] = neu;
        if (!neu.tids.length) { ohneThread.push(neu); continue; }
        // Zu einer Unterhaltung kann versehentlich ein zweiter Task existieren.
        // Dann gewinnt der getaggte, sonst loescht ein leerer Doppelgaenger die
        // Markierung. Bei Gleichstand der zuletzt gefundene.
        for (const einzel of neu.tids) {
          const alt = gefunden[einzel];
          if (!alt || neu.follow || !alt.follow) gefunden[einzel] = neu;
        }
      }
      if (d.last_page || !(d.tasks || []).length) break;
    }
    cuTasks = gefunden;
    cuBilder = nachBild;
    cuNutzer = nachNutzer;
    cuOhneThread = ohneThread;
    cuSpeichern();
    return gefunden;
  }

  function cuSpeichern() {
    GM_setValue(CU_TASKS, {
      stand: Date.now(), tasks: cuTasks, bilder: cuBilder, nutzer: cuNutzer, ohneThread: cuOhneThread,
    });
  }

  // Haengt eine Unterhaltung an einen Task, der schon existiert. Hat er noch
  // keine, kommt der Link nach oben; hat er schon eine, kommt die zweite
  // darunter. Die Beschreibung wird nur ergaenzt, nie ersetzt, damit eigene
  // Notizen stehen bleiben.
  async function threadAnhaengen(task, tid, bildID) {
    if (!task || !tid) return task;
    const voll = await cuRequest('GET', '/task/' + task.taskId + '?include_markdown_description=true');
    const bisher = voll.markdown_description || voll.description || '';
    const ig = isIG();
    const schonDrin = threadsAusText(bisher).concat(igsAusText(bisher));
    if (!schonDrin.includes(tid)) {
      const wohin = ig ? ' auf Instagram öffnen]' : ' im Postfach öffnen]';
      const marker = (ig ? '\nigfu-ig: ' : '\nigfu-thread: ') + tid;
      const link = '[' + (schonDrin.length ? 'Weitere Unterhaltung' : 'Unterhaltung')
        + wohin + '(' + postfachLink(tid, ig) + ')';
      const text = schonDrin.length
        ? bisher.replace(/\s*$/, '') + '\n\n' + link + marker
        : link + '\n\n' + bisher.replace(/^\s*/, '').replace(/\s*$/, '') + marker;
      await cuRequest('PUT', '/task/' + task.taskId, { markdown_description: text });
    }
    // Die Bild-ID gleich festhalten, wenn der Task noch keine hat. Erst damit
    // waechst die Bild-Bruecke: ein aus UpPromote importierter Task bringt keine
    // mit, lernt sie hier und findet darueber spaeter weitere Unterhaltungen
    // derselben Person — auch dann, wenn der Handle nirgends auftaucht.
    const bild = bildID || (handleVon(tid) || {}).bild || '';
    if (bild && !task.bild) {
      await markerEintragen(task, 'igfu-bild', bild);
      task.bild = bild;
      cuBilder[bild] = task;
    }
    // Dasselbe fuer die Benutzer-ID, und die wiegt schwerer als die Bild-ID:
    // ein Profilbild wird gewechselt, die ID nicht. Ab hier findet dieselbe
    // Person ihren Task auch ueber das andere Postfach, ohne dass Handle oder
    // Name stimmen muessen.
    const nutzer = (handleVon(tid) || {}).nutzer || '';
    if (nutzer && !task.nutzer) {
      await markerEintragen(task, 'igfu-iguser', nutzer);
      task.nutzer = nutzer;
      if (!task.leiche) cuNutzer[nutzer] = task;
    }
    task.tids = task.tids || (task.tid ? [task.tid] : []);
    if (!task.tids.includes(tid)) task.tids.push(tid);
    if (!task.tid) task.tid = tid;
    cuTasks[tid] = task;
    const i = cuOhneThread.indexOf(task);
    if (i >= 0) cuOhneThread.splice(i, 1);
    cuSpeichern();
    return task;
  }

  async function cuTaskSichern(tid, titel, handle) {
    if (cuTasks[tid]) return cuTasks[tid];
    const w = handleVon(tid);
    const h = handle || (w && w.handle) || '';
    // Dieselbe Person kann zwei Unterhaltungen haben: eine als Partner-Nachricht,
    // eine als normale DM. Beide gehoeren in denselben Task — zwei Datensaetze
    // fuer eine Person sind im CRM schlimmer als eine Beschreibung mit zwei
    // Links. Es wird also kein zweiter angelegt, sondern angehaengt.
    //
    // Karteileichen zaehlen hier nicht mit, die sind absichtlich stillgelegt.
    if (h) {
      const schon = alleTasks().find((x) => !x.leiche && !(x.tids || []).includes(tid)
        && handleVonTask(x) === h);
      if (schon) {
        toast('@' + h + ' hat schon einen Task. Die Unterhaltung wird dort angehängt.');
        return threadAnhaengen(schon, tid);
      }
    }
    const rumpf = {
      name: taskName(h, titel),
      status: CU_STATUS_NEU,
      markdown_description: beschreibung(tid, h, w && w.bild),
    };
    const letzte = w && w.letzte ? msVonIso(w.letzte) : null;
    if (letzte) { rumpf.start_date = letzte; rumpf.start_date_time = false; }
    const t = await cuRequest('POST', '/list/' + encodeURIComponent(cuListe()) + '/task', rumpf);
    const angelegt = taskAufbereiten(t);
    // Die Antwort auf das Anlegen enthaelt die Beschreibung nicht immer zurueck,
    // deshalb Thread und Bild aus dem, was wir gerade geschickt haben.
    angelegt.tid = tid;
    angelegt.bild = angelegt.bild || (w && w.bild) || '';
    cuTasks[tid] = angelegt;
    if (angelegt.bild) cuBilder[angelegt.bild] = angelegt;
    cuSpeichern();
    return cuTasks[tid];
  }

  async function cuFollowSetzen(taskId, an) {
    await cuTagSichern(CU_TAG, YELLOW);
    const pfad = '/task/' + taskId + '/tag/' + encodeURIComponent(CU_TAG);
    try {
      await cuRequest(an ? 'POST' : 'DELETE', pfad);
    } catch (e) {
      // Einen Tag zu entfernen, der gar nicht dran ist, ist kein Fehler.
      if (!an && !e.wiederholbar && !e.blockierend) return;
      throw e;
    }
  }

  // ---------- Warteschlange ----------
  // Jeder Klick wirkt sofort lokal und wird hier fuer ClickUp vorgemerkt. So bleibt
  // das Postfach bedienbar, auch wenn ClickUp klemmt.

  const warteschlange = () => GM_getValue(CU_QUEUE, []) || [];
  const warteschlangeSetzen = (w) => GM_setValue(CU_QUEUE, w);

  function vormerken(auftrag) {
    if (!cuEingerichtet()) return;
    // Fuer einen stillgelegten Task wird gar kein Auftrag vorgemerkt. Das muss
    // hier stehen und nicht erst beim Ausfuehren: abarbeiten() ruft am Ende
    // scanRows() auf, und scanRows merkt denselben Auftrag sofort wieder vor.
    // Ein Auftrag, der erst beim Ausfuehren verworfen wird, dreht deshalb
    // endlos im Kreis — am 06.10.2026 blieb damit das ganze Skript beim Laden
    // haengen, weil der Startdatums-Auftrag fuer eine Karteileiche sich selbst
    // immer wieder nachgelegt hat.
    const stillgelegt = cuTasks[auftrag.tid];
    if (stillgelegt && stillgelegt.leiche) return;
    const w = warteschlange();
    // Gleichartige Auftraege zum selben Thread ersetzen statt anhaengen
    const rest = w.filter((a) => !(a.art === auftrag.art && a.tid === auftrag.tid));
    rest.push(Object.assign({ zeit: Date.now(), versuche: 0 }, auftrag));
    warteschlangeSetzen(rest);
    abarbeiten();
  }

  // Uebernahme und Warteschlange duerfen nie gleichzeitig laufen, sonst legen
  // beide fuer dieselbe Unterhaltung einen Task an. Genau so entstand am
  // 30.09.2026 ein doppelter Eintrag, der anschliessend eine Markierung loeschte.
  let abarbeitenGeplant = null;
  async function abarbeiten() {
    if (cuLaeuft || !cuEingerichtet()) return;
    const w = warteschlange();
    if (!w.length) return;
    cuLaeuft = true;
    let fehlgeschlagen = null;
    try {
      while (warteschlange().length) {
        const alle = warteschlange();
        const auftrag = alle[0];
        try {
          await ausfuehren(auftrag);
          warteschlangeSetzen(warteschlange().slice(1));
        } catch (e) {
          fehlgeschlagen = e;
          if (e.blockierend) break;                    // stehen lassen, Josia muss ran
          if (e.wiederholbar && auftrag.versuche < 5) { // gleich nochmal versuchen
            alle[0] = Object.assign({}, auftrag, { versuche: auftrag.versuche + 1 });
            warteschlangeSetzen(alle);
            break;
          }
          warteschlangeSetzen(warteschlange().slice(1)); // aussichtslos, sonst blockiert er alles
          break;
        }
      }
    } catch (e) {
      fehlgeschlagen = e;   // Felder liessen sich nicht laden, Warteschlange bleibt unangetastet
    } finally {
      cuLaeuft = false;
    }
    if (fehlgeschlagen) {
      toast('ClickUp: ' + fehlgeschlagen.message);
      if (fehlgeschlagen.wiederholbar) {
        clearTimeout(abarbeitenGeplant);
        abarbeitenGeplant = setTimeout(abarbeiten, 30000);
      }
    }
    scanRows();
    if (panelOpen) renderPanel();
    updateLauncher();
  }

  async function ausfuehren(a) {
    // Ein abgeraeumtes Follow-up fuer eine Unterhaltung ohne Task ist nichts zu tun.
    // Sonst entstuende in ClickUp ein leerer Eintrag allein durch An- und Abklicken.
    if (a.art === 'follow' && !a.wert && !cuTasks[a.tid]) return;
    if (a.art === 'due' && !a.wert && !cuTasks[a.tid]) return;
    if (a.art === 'name' && !cuTasks[a.tid]) return;   // umbenennen legt nichts an
    if (a.art === 'letzte' && !cuTasks[a.tid]) return; // Datum legt nichts an
    if (a.art === 'prio' && !cuTasks[a.tid]) return;   // Prioritaet legt nichts an
    if (a.art === 'handle' && !cuTasks[a.tid]) return; // Handle legt nichts an
    // Faengt Auftraege ab, die schon in der gespeicherten Warteschlange lagen,
    // bevor der Tag gesetzt wurde. Neue entstehen keine mehr, darum kann das
    // hier nicht in eine Schleife laufen — siehe vormerken().
    if (cuTasks[a.tid] && cuTasks[a.tid].leiche) return;

    if (a.art === 'verbinden-handle') {
      // Verbindet eine Unterhaltung mit einem Task, der noch keine hat. Gesucht
      // wird entweder ueber den Handle oder, wenn keiner zu holen war, ueber die
      // Task-ID, die der Namensvergleich ermittelt hat.
      if (cuTasks[a.tid]) return;
      // Mit Task-ID wird im ganzen Bestand gesucht, denn beim Zusammenfuehren
      // hat das Ziel schon eine Unterhaltung. Ohne Task-ID geht es ueber den
      // Handle, und dann kommen nur Tasks ohne Unterhaltung in Frage.
      const ziel = a.taskId
        ? alleTasks().find((x) => x.taskId === a.taskId && !x.leiche)
        : cuOhneThread.find((x) => !x.tid && !x.leiche && handleVonTask(x) === a.handle);
      if (!ziel) return;
      await threadAnhaengen(ziel, a.tid, a.bild);
      return;
    }

    if (a.art === 'verbinden') {
      // Im Marketplace erfasster Task bekommt jetzt seine Unterhaltung. Die
      // Beschreibung wird nur ergaenzt, nicht ersetzt, damit eigene Notizen
      // darin erhalten bleiben.
      const ziel = cuBilder[a.bild];
      if (!ziel || ziel.tid || cuTasks[a.tid]) return;
      const voll = await cuRequest('GET', '/task/' + ziel.taskId + '?include_markdown_description=true');
      const bisher = voll.markdown_description || voll.description || '';
      if (!threadAusText(bisher)) {
        const ig = isIG();
        const ergaenzt = bisher.replace(/\s*$/, '')
          + '\n\n[Unterhaltung ' + (ig ? 'auf Instagram' : 'im Postfach') + ' öffnen]('
          + postfachLink(a.tid, ig) + ')\n'
          + (ig ? 'igfu-ig: ' : 'igfu-thread: ') + a.tid;
        await cuRequest('PUT', '/task/' + ziel.taskId, { markdown_description: ergaenzt });
      }
      const w = handleVon(a.tid);
      const neuerName = taskName((w && w.handle) || ziel.titel, a.titel);
      const aenderung = {};
      if (darfSetzen(ziel.status, CU_STATUS_NEU)) aenderung.status = CU_STATUS_NEU;
      if (neuerName && neuerName !== ziel.titel) aenderung.name = neuerName;
      if (Object.keys(aenderung).length) await cuRequest('PUT', '/task/' + ziel.taskId, aenderung);
      ziel.tid = a.tid;
      if (aenderung.status) ziel.status = aenderung.status;
      if (aenderung.name) ziel.titel = aenderung.name;
      cuTasks[a.tid] = ziel;
      cuSpeichern();
      return;
    }
    const task = await cuTaskSichern(a.tid, a.titel);
    if (a.art === 'follow') {
      await cuFollowSetzen(task.taskId, !!a.wert);
      task.follow = !!a.wert;
      if (a.wert && follow[a.tid]) { follow[a.tid].inCu = true; saveFollow(); }
    } else if (a.art === 'due') {
      const ms = msVonIso(a.wert);
      await cuRequest('PUT', '/task/' + task.taskId, ms ? { due_date: ms, due_date_time: false } : { due_date: null });
      task.due = a.wert || '';
    } else if (a.art === 'letzte') {
      const ms = msVonIso(a.wert);
      if (ms) {
        // Frist zusammen mit dem Startdatum schicken. Einzeln abgeschickt
        // lehnt ClickUp das Startdatum ab, sobald es hinter der alten Frist
        // liegt.
        // Dieselbe Schranke wie beim Vormerken, weil ein Auftrag aus der
        // gespeicherten Warteschlange auch aelter sein kann als der Stand.
        if (task.letzte && a.wert <= task.letzte) return;
        const frist = fristFuer(task, a.wert);
        const nutzlast = { start_date: ms, start_date_time: false };
        const fms = msVonIso(frist);
        if (fms && frist !== task.due) { nutzlast.due_date = fms; nutzlast.due_date_time = false; }
        await cuRequest('PUT', '/task/' + task.taskId, nutzlast);
        task.letzte = a.wert;
        if (nutzlast.due_date) task.due = frist;
      }
    } else if (a.art === 'handle') {
      const h = String(a.wert || '').toLowerCase();
      if (h) {
        // Der Anzeigename kommt aus dem Task, nie aus `a.titel`. Dort steht der
        // Zeilentitel aus dem Postfach, und der hat hier nichts zu suchen: er
        // wuerde den Namen aus UpPromote ueberschreiben. Genau darueber sind am
        // 14.10.2026 Vorschautexte und fremde Zeilennamen in die Titel geraten.
        // Ergaenzt wird hier nur der Handle davor.
        const neuerName = taskName(h, rohTitel(task.titel));
        if (neuerName && neuerName !== task.titel) {
          await cuRequest('PUT', '/task/' + task.taskId, { name: neuerName });
          task.titel = neuerName;
        }
        await markerEintragen(task, 'igfu-handle', h);
        task.handle = h;
      }
    } else if (a.art === 'prio') {
      const urgent = a.wert === 'urgent';
      await cuRequest('PUT', '/task/' + task.taskId, { priority: urgent ? 1 : null });
      task.prio = urgent ? 'urgent' : '';
    } else if (a.art === 'name') {
      const w = handleVon(a.tid);
      const neu = taskName(w && w.handle, a.titel || rohTitel(task.titel));
      if (neu && neu !== task.titel) {
        await cuRequest('PUT', '/task/' + task.taskId, { name: neu });
        task.titel = neu;
      }
    } else if (a.art === 'nutzer') {
      const id = String(a.wert || '');
      if (id && !task.nutzer) {
        await markerEintragen(task, 'igfu-iguser', id);
        task.nutzer = id;
        if (!task.leiche) cuNutzer[id] = task;
        cuSpeichern();
      }
    } else if (a.art === 'notiz') {
      if (String(a.wert || '').trim()) {
        await cuRequest('POST', '/task/' + task.taskId + '/comment', { comment_text: a.wert, notify_all: false });
      }
    }
    cuSpeichern();
  }

  async function cuAktualisieren(erzwingen) {
    if (!cuEingerichtet() || cuLaeuft) return;
    if (!erzwingen && Date.now() - cuLetzterAbruf < 120000) return;
    cuLetzterAbruf = Date.now();
    try {
      // Einmal je Seitenaufruf: der Tag muss im Space liegen, sonst laesst er
      // sich weder vom Skript noch von Hand an einen Task haengen.
      await cuTagSichern(CU_TAG_LEICHE, ROT);
      await cuTasksLaden();
      zusammenfuehren();
      scanRows();
      if (panelOpen) renderPanel();
      updateLauncher();
    } catch (e) {
      toast('ClickUp: ' + e.message);
    }
  }

  // ClickUp gewinnt, aber nur fuer Markierungen, die dort auch wirklich schon
  // einmal angekommen sind. Das Merkmal dafuer ist inCu.
  //
  // Ohne diese Bedingung passiert Folgendes: Es genuegt, dass zu einer
  // Unterhaltung irgendein Task existiert, etwa durch einen Klick auf die
  // CRM-Pille oder durch eine abgebrochene Uebernahme. Der Task traegt dann
  // keinen Tag, der Abgleich liest das als „kein Follow-up" und loescht die
  // lokale Markierung. Genau so sind am 29.09.2026 drei Markierungen
  // verschwunden. Eine nie uebertragene Markierung darf ClickUp nicht anfassen.
  function zusammenfuehren() {
    let geaendert = false;
    for (const [tid, t] of Object.entries(cuTasks)) {
      if (t.follow && !follow[tid]) {
        follow[tid] = { title: t.titel, flaggedAt: Date.now(), due: t.due || '', note: '', inCu: true };
        geaendert = true;
      } else if (t.follow && follow[tid]) {
        if (follow[tid].due !== (t.due || '')) { follow[tid].due = t.due || ''; geaendert = true; }
        if (!follow[tid].inCu) { follow[tid].inCu = true; geaendert = true; }
      } else if (!t.follow && follow[tid] && follow[tid].inCu) {
        delete follow[tid];   // war drueben, wurde dort entfernt
        geaendert = true;
      }
    }
    if (geaendert) saveFollow();
  }

  // ---------- Thread-Daten aus Metas React-Zeilen lesen ----------
  // Jede Zeile der Thread-Liste bekommt von Meta ein thread-Objekt mit threadID
  // und title. Weil Meta Zeilen beim Umsortieren wiederverwendet, wird die ID bei
  // jedem Durchlauf neu gelesen und gegen den sichtbaren Namen geprüft.

  function threadFromFiber(fiber) {
    for (let i = 0; i < 4 && fiber; i++, fiber = fiber.return) {
      const p = fiber.memoizedProps;
      if (p && p.thread && p.thread.threadID) return p.thread;
    }
    return null;
  }

  function threadOf(row) {
    const key = Object.keys(row).find((k) => k.startsWith('__reactFiber$'));
    if (!key) return null;
    const fiber = row[key];
    const text = row.textContent || '';
    const candidates = [threadFromFiber(fiber), fiber.alternate && threadFromFiber(fiber.alternate)];
    return candidates.find((t) => t && t.title && text.includes(t.title)) || null;
  }

  // Im Hauptpostfach stehen auch Messenger- und WhatsApp-Unterhaltungen. Die
  // gehen uns nichts an, sonst haengen CRM-Pillen an Gespraechen, die mit
  // Affiliates nichts zu tun haben.
  //
  // Unterschieden wird ueber commPlatform. isPartnershipThread taugt dafuer
  // nicht: das steht am 05.10.2026 auch in der Partner-Ansicht auf false,
  // genau wie das kaputte isFollowUp. Partner-Unterhaltungen und normale DMs
  // sind an den Daten ohnehin nicht zu unterscheiden — der Unterschied ist
  // allein, in welcher Liste man steht. Fuer uns macht das keinen Unterschied,
  // beide sind INSTAGRAM_DIRECT und nutzen denselben Link.
  const istInstagram = (t) => !t.commPlatform || t.commPlatform === 'INSTAGRAM_DIRECT';

  // ---------- Die Unterhaltungsliste auf instagram.com ----------
  // Die Kennung steht an `props.threadRef.thread_key` — genau die, die in der
  // Adresse /direct/t/<id>/ steht. Entscheidend: sie ist aus der Liste lesbar,
  // ohne eine Unterhaltung zu oeffnen. Oeffnen wuerde sie als gelesen
  // markieren, und das kommt nicht in Frage.
  //
  // Name, Vorschau, Zeit und Lesestatus liegen dagegen nicht in den Props,
  // sondern nur im Relay-Speicher — gerendert stehen sie als Zeilen im Text der
  // Zeile:
  //     [0] Name            „stadtpedal"
  //     [1] Vorschau        „You: …" | „Liked a message" | „3 new messages"
  //     [2] Relativzeit     „10m" | „6h" | „3d" | „2w"
  //     [3] „Unread"        nur wenn ungelesen
  const IG_ZEIT = /^(\d+)\s*([smhdw])$/i;
  const IG_SPANNE = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

  // Instagram nennt nur den Abstand, nie den Zeitpunkt. Fuer die Nachfass-Frist
  // reicht Tagesgenauigkeit, und genau die liefert die Umrechnung.
  function igZeitpunkt(text) {
    const m = IG_ZEIT.exec(String(text || '').trim());
    if (!m) return 0;
    return Date.now() - Number(m[1]) * (IG_SPANNE[m[2].toLowerCase()] || 0);
  }

  // Die sichtbaren Zeilen eines Elements. innerText bildet die Umbrueche ab,
  // die hier die Struktur tragen — textContent zoege alles zu einem Klumpen
  // zusammen. jsdom kennt innerText nicht, deshalb der Rueckfall ueber die
  // Blattelemente; der liefert dieselbe Reihenfolge.
  function zeilenText(el) {
    const teile = [];
    for (const kind of el.children) {
      // Der eigene Knopfstreifen haengt als Kind in der Zeile. Er muss hier
      // raus, sonst liest sich das Skript seine eigene Beschriftung ein — und
      // „Ungelesen" auf einem Chip waere dann Metas Lesestatus. Genau so
      // wurde aus einer blossen Reaktion eine offene Nachricht.
      if (kind.classList && kind.classList.contains('igfu-tags')) continue;
      const roh = typeof kind.innerText === 'string' ? kind.innerText : kind.textContent;
      for (const z of String(roh || '').split('\n')) teile.push(z);
    }
    return teile.map((x) => String(x || '').trim()).filter((x) => x && x !== '·');
  }

  function igHostUnter(fiber, tiefe) {
    if (!fiber || (tiefe || 0) > 14) return null;
    if (fiber.stateNode && fiber.stateNode.nodeType === 1) return fiber.stateNode;
    return igHostUnter(fiber.child, (tiefe || 0) + 1);
  }

  // Die Benutzer-ID des Gegenuebers aus einem Eintrag in `users`.
  //
  // Bis Oktober 2026 stand sie schlicht als `id` am Objekt. Seit einem Umbau
  // liefert Instagram dort nur noch eine Relay-Referenz:
  //
  //     { __fragments: {...}, __id: 'XDTUserDict:334549785', __fragmentOwner: {...} }
  //
  // `id` ist weg, und damit lief `userID` still auf den Leerstring. Am
  // 23.10.2026 an der echten Liste gemessen: kein einziger Eintrag hatte noch
  // ein `id`, und seit etwa dem 22.10. bekam kein neuer Task mehr eine
  // `igfu-iguser:`-Zeile — zu sehen an iroma_n72, dessen Unterhaltung das
  // Skript vor sich hatte.
  //
  // **Dieselbe ID-Welt wie vorher.** Gegengehalten an reichert_florian: in
  // ClickUp steht `igfu-iguser: 334549785`, im DOM `XDTUserDict:334549785`.
  // Der Bestand bleibt also gueltig, nur der Zugriffsweg war weg.
  //
  // `id` wird weiter zuerst gelesen, damit ein Rueckbau bei Instagram nichts
  // kostet.
  function nutzerIDVon(u) {
    if (!u) return '';
    if (u.id) return String(u.id);
    const m = /([0-9]{3,})\s*$/.exec(String(u.__id || ''));
    return m ? m[1] : '';
  }

  // Welches der beiden Postfaecher. Nur die beiden bekannten Werte werden
  // zugeordnet; ein unbekannter Untertyp ergibt den Leerstring, damit eine
  // neue Sorte Unterhaltung nicht stillschweigend als normale DM gilt.
  const POSTFACH = { IGD_BC_PARTNERSHIP: 'partner', IG_BUSINESS_ACCOUNT_ONE_TO_ONE: 'normal' };
  const postfachArt = (untertyp) => POSTFACH[String(untertyp || '')] || '';

  // Welche Unterhaltung in welchem Postfach liegt, haelt der Browser fest.
  //
  // Bewusst *nicht* in der Task-Beschreibung: dort stuende es fuer alle drei
  // Rechner, kostete aber beim ersten Lauf eine Schreibanfrage je Task, und
  // die Beschreibung wird ohnehin gerade umgebaut. Der Preis dafuer: auf einem
  // frischen Rechner ist der Postfach-Knopf grau, bis beide Listen einmal
  // offen waren. Das erledigt sich im normalen Arbeiten von selbst.
  //
  // Raten verbietet sich: an der Kennung ist die Herkunft nicht abzulesen. Am
  // 23.10.2026 nachgemessen — normale DMs tragen 15- bis 17-stellige
  // Kennungen, Partner-Unterhaltungen 16- bis 17-stellige, die Bereiche
  // ueberlappen.
  const KEY_POSTFACH = 'igfu:postfachart:v1';
  const postfaecher = () => GM_getValue(KEY_POSTFACH, {}) || {};
  function postfachMerken(tid, art) {
    if (!tid || !art) return;
    const alle = postfaecher();
    if (alle[tid] === art) return;
    alle[tid] = art;
    GM_setValue(KEY_POSTFACH, alle);
  }
  const postfachVon = (tid) => postfaecher()[tid] || '';

  function igRows() {
    // Je Unterhaltung der Knoten, an dem React den threadRef haengen hat, dazu
    // die Benutzer-ID des Gegenuebers.
    //
    // `users` traegt am 14.10.2026 in beiden Postfaechern genau einen Eintrag,
    // und nie das eigene Konto — in den Partner-Nachrichten wie in den normalen
    // DMs, gemessen an der echten Liste. Die ID bleibt ueber ein Neuladen
    // gleich, und fuer dieselbe Person ist sie in beiden Ordnern dieselbe,
    // obwohl die Thread-Kennungen verschieden sind: an der echten Liste
    // nachgemessen hatte dieselbe Person als Partner-Nachricht und als DM zwei
    // verschiedene Kennungen, aber ein und dieselbe Benutzer-ID.
    //
    // Damit ist sie der einzige Schluessel, der ohne Oeffnen der Unterhaltung
    // aus der Liste zu holen ist. Bei mehr als einem Eintrag waere nicht
    // entscheidbar, wer gemeint ist — dann lieber keine ID als eine geratene.
    const traeger = new Map();
    for (const el of document.querySelectorAll('div')) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      if (!key) continue;
      let f = el[key];
      for (let i = 0; i < 6 && f; i++) {
        const p = f.memoizedProps;
        const r = p && p.threadRef;
        if (r && r.thread_key && !traeger.has(String(r.thread_key))) {
          const nutzer = Array.isArray(r.users) ? r.users : [];
          traeger.set(String(r.thread_key), {
            fiber: f,
            userID: nutzer.length === 1 ? nutzerIDVon(nutzer[0]) : '',
            art: postfachArt(r.thread_subtype),
          });
        }
        f = f.return;
      }
    }
    // Der Startknoten jeder Zeile, bevor geklettert wird. Daran wird erkannt,
    // wann ein Aufstieg die eigene Zeile verlassen hat.
    const anker = [];
    for (const [tid, t] of traeger) {
      const el = igHostUnter(t.fiber, 0);
      if (el) anker.push([tid, el]);
    }
    const out = [];
    for (const [tid, t] of traeger) {
      // Vom Traeger nach oben, bis die Zeile Text hat. Darunter liegt nur das
      // Profilbild, und das traegt keinen Namen.
      //
      // Der Aufstieg endet zwingend an der Zeilengrenze. Ohne diese Schranke
      // klettert er in den Behaelter, der *alle* Zeilen enthaelt, und dann ist
      // `teile[0]` der Name der ersten Zeile der Liste statt der eigenen. Genau
      // so trugen am 14.10.2026 mehrere Tasks den Namen einer fremden Zeile,
      // einer sogar den Handle einer anderen Person. Lieber keine Zeile als
      // eine mit fremdem Namen.
      let el = igHostUnter(t.fiber, 0);
      let hoch = 0;
      while (el && zeilenText(el).join('').length < 3 && hoch < 6) {
        const oben = el.parentElement;
        if (!oben) break;
        if (anker.some(([fremd, fEl]) => fremd !== tid && oben.contains(fEl))) break;
        el = oben;
        hoch += 1;
      }
      if (!el) continue;
      const teile = zeilenText(el);
      if (!teile.length) continue;
      // Zeitweise rendert Instagram Name und Vorschau in einem Textknoten, ohne
      // Umbruch dazwischen. Dann steht im Titel so etwas wie
      // „Hannah | Trailrun | RadelnYou: Hi Hannah," — und genau so landete das
      // auch schon in ClickUp. Die Vorschau faengt erkennbar mit „You: " oder
      // „Du: " an; alles ab dort gehoert nicht mehr zum Namen.
      const titel = String(teile[0] || '').split(/(?:You|Du):\s/)[0].trim().slice(0, 120);
      const ungelesen = teile.includes('Unread') || teile.includes('Ungelesen');
      const zeit = teile.map(igZeitpunkt).find((z) => z) || 0;
      out.push([el, {
        threadID: tid,
        userID: t.userID,
        postfach: t.art,
        title: titel,
        timestamp: zeit,
        // Bei ungelesenen ersetzt Instagram die Vorschau durch „N new messages".
        // Der Text geht dadurch verloren — der Lesestatus sagt aber ohnehin,
        // dass das Gegenueber zuletzt geschrieben hat.
        snippet: teile[1] || '',
        participantProfileURIs: (() => { const b = el.querySelector('img'); return b ? [b.src] : []; })(),
        commPlatform: 'INSTAGRAM_DIRECT',
        isRead: !ungelesen,
      }]);
    }
    return out;
  }

  function threadRows() {
    if (isIG()) return igRows();
    const out = [];
    for (const row of document.querySelectorAll('div[role="presentation"]')) {
      const t = threadOf(row);
      if (t && istInstagram(t)) out.push([row, t]);
    }
    return out;
  }

  // ---------- Knöpfe an jeder Zeile ----------
  // Zustände werden als data-Attribute an die Zeile gehängt, nicht als Klassen:
  // Meta setzt die Klassen einer Zeile z. B. beim Öffnen neu, lässt fremde
  // Attribute aber in Ruhe.

  function nameOffset(row, title) {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue.trim() === title && n.parentElement) {
        return Math.max(0, Math.round(n.parentElement.getBoundingClientRect().left - row.getBoundingClientRect().left));
      }
    }
    return 60;
  }

  function makeChip(kind, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'igfu-tag';
    b.dataset.kind = kind;
    b.textContent = label;
    return b;
  }

  function setChip(chip, on, titleOn, titleOff) {
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    chip.title = on ? titleOn : titleOff;
  }

  function setAttr(elm, name, on) {
    if (on && !elm.hasAttribute(name)) elm.setAttribute(name, '');
    else if (!on && elm.hasAttribute(name)) elm.removeAttribute(name);
  }

  function scanRows() {
    if (!isInbox()) return;
    let followTitles = false;
    for (const [row, t] of threadRows()) {
      const tid = t.threadID;
      let wrap = row.querySelector(':scope > .igfu-tags');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'igfu-tags';
        wrap.append(makeChip('followup', 'Follow-up'), makeChip('crm', 'CRM'));
        if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
        row.setAttribute('data-igfu-row', '');
        row.appendChild(wrap);
      }
      if (wrap.dataset.tid !== tid) {
        wrap.dataset.tid = tid;
        wrap.style.left = nameOffset(row, t.title) + 'px';
      }
      wrap.dataset.title = t.title;

      // Gelesene ausblenden, wenn der Filter an ist. Nur auf instagram.com —
      // nur dort kennen wir den Lesestatus je Zeile.
      if (isIG() && nurUngelesen() && t.isRead !== false) {
        row.style.display = 'none';
        continue;
      }
      if (row.style.display === 'none') row.style.display = '';

      const fOn = !!follow[tid];
      setChip(wrap.querySelector('[data-kind="followup"]'), fOn, 'Follow-up entfernen', 'Als Follow-up markieren');
      setzeCrmChip(wrap.querySelector('[data-kind="crm"]'), tid);
      setAttr(row, 'data-igfu-follow', fOn);

      const vorschau = handleAusVorschau(t);
      const bild = bildIDVon(t);
      // Die Benutzer-ID steht in den Props der Zeile und ist damit die einzige
      // Angabe hier, die nicht aus gelesenem Seitentext stammt.
      const nutzerID = t.userID || '';
      if (vorschau || bild || nutzerID) handleMerken(tid, vorschau, 'vorschau', bild, null, nutzerID);
      if (t.postfach) postfachMerken(tid, t.postfach);
      // Auf instagram.com steht in der Zeile haeufig der Handle selbst. Das
      // kostet nichts und ist der verlaesslichste Schluessel, den wir ohne
      // Zutun bekommen. Geprueft wird der unveraenderte Titel — sonst wird aus
      // jedem Vornamen ein Handle.
      //
      // Gespeichert wird er als *schwache* Quelle. Er kann geraten sein — „flo"
      // ist handle-foermig, aber der Anzeigename von flo.auf.zeit. Schaden
      // richtet das keinen mehr an: ein schwacher Handle findet keinen Task,
      // den es nicht gibt, und die geoeffnete Unterhaltung ueberschreibt ihn.
      //
      // Eine Schranke „nur uebernehmen, wenn ein Task diesen Handle traegt"
      // stand hier kurz und war falsch: beim Kaltstart ist die Task-Liste noch
      // leer, und dann fielen auch richtige Handles weg.
      if (isIG() && t.title && HANDLE_MUSTER.test(String(t.title).trim())) {
        handleMerken(tid, String(t.title).trim().toLowerCase(), 'titel', bild);
      }
      // Die Meta-API kennt den Handle auch dann, wenn im Vorschautext keiner
      // steht — und das ist bei normalen DMs die Regel.
      if (!(handleVon(tid) || {}).handle) {
        const ausApi = handleAusApi(t);
        if (ausApi) handleMerken(tid, ausApi, 'api', bild);
      }

      // Datum der letzten Nachricht ins Startdatum des Tasks, damit in ClickUp
      // sichtbar und sortierbar ist, wie lange nichts mehr passiert ist.
      const letzte = isoVonMs(t.timestamp);
      if (letzte) {
        const w = handleVon(tid) || {};
        if (w.letzte !== letzte) handleMerken(tid, '', 'vorschau', null, letzte);
        const task = cuTasks[tid];
        // Nur nach vorn. Haengen zwei Unterhaltungen am selben Task, wuerde sonst
        // jede die andere ueberschreiben: die aeltere setzt zurueck, die neuere
        // wieder vor, und das in jedem Durchlauf. Fuer die Nachfass-Frist zaehlt
        // ohnehin die letzte Aktivitaet, also die spaetere der beiden.
        if (task && (!task.letzte || letzte > task.letzte)) {
          vormerken({ art: 'letzte', tid, titel: t.title, wert: letzte });
        }
      }

      // „urgent" heisst hier: die Antwort liegt bei uns. Sobald Josia
      // geantwortet hat, faellt die Markierung wieder weg. Eine Reaktion
      // aendert nichts, die ist keine offene Nachricht.
      //
      // Nur bei Status „angeschrieben". Sobald ein Task auf kommunikation,
      // abgesagt oder ongeboardet steht, hat Josia ihn selbst in die Hand
      // genommen, und dann fasst das Skript die Prioritaet nicht mehr an.
      // Am 30.09.2026 nachgemessen: von vier Unterhaltungen, bei denen das
      // Gegenueber zuletzt geschrieben hatte, waeren alle vier Fehlalarme
      // gewesen. Dreimal ein blosser Abbinder („Alles klar, danke"), einmal
      // eine Absage. Josia hatte sie am selben Tag bereits einsortiert, die
      // Regel ohne diese Schranke haette seine Triage wieder ueberschrieben.
      const wer = werZuletzt(t);
      if (wer === 'ich' || wer === 'gegenueber') {
        const task = cuTasks[tid];
        if (task && task.status === CU_STATUS_NEU) {
          const soll = wer === 'gegenueber';
          if (soll !== (task.prio === 'urgent')) {
            vormerken({ art: 'prio', tid, titel: t.title, wert: soll ? 'urgent' : '' });
          }
        }
      }

      // Die Benutzer-ID an einem Task nachtragen, der seine Unterhaltung schon
      // hat. Ohne das bekaemen nur neu verknuepfte Tasks eine ID, denn
      // geschrieben wird sie sonst allein beim Verknuepfen — der ganze Bestand
      // bliebe ohne Schluessel. Gesetzt wird einmal; danach ist `task.nutzer`
      // belegt und hier nichts mehr zu tun.
      if (nutzerID && cuTasks[tid] && !cuTasks[tid].nutzer && !cuTasks[tid].leiche) {
        vormerken({ art: 'nutzer', tid, titel: t.title, wert: nutzerID });
      }

      // Zuerst die Benutzer-ID, vor Bild und Handle und Namen. Sie kommt aus
      // den Props der Zeile, nicht aus gelesenem Text, ist ueber ein Neuladen
      // stabil und fuer dieselbe Person in beiden Postfaechern dieselbe. Damit
      // deckt sie beide Faelle auf einmal ab: den Task, der noch gar keine
      // Unterhaltung hat, und den, der schon eine im anderen Ordner hat.
      if (!cuTasks[tid] && nutzerID && cuNutzer[nutzerID]
          && !cuNutzer[nutzerID].leiche && !(cuNutzer[nutzerID].tids || []).includes(tid)) {
        vormerken({
          art: 'verbinden-handle', tid, titel: t.title, taskId: cuNutzer[nutzerID].taskId, bild,
        });
      }

      // Gibt es zu dieser Unterhaltung noch keinen Task, aber einen im
      // Marketplace erfassten mit demselben Profilbild, gehoeren sie zusammen.
      if (!cuTasks[tid] && bild && cuBilder[bild] && !cuBilder[bild].tid) {
        vormerken({ art: 'verbinden', tid, titel: t.title, bild });
      }

      // Dasselbe Profilbild, aber der Task hat schon eine Unterhaltung: dann ist
      // das dieselbe Person ein zweites Mal — einmal als Partner-Nachricht,
      // einmal als normale DM. Beide gehoeren in denselben Task.
      //
      // Das Profilbild ist dafuer der bessere Schluessel als der Handle. Bei
      // normalen DMs nennt der Vorschautext den Handle naemlich nie, dort steht
      // „Name: Text" — am 06.10.2026 im Postfach gemessen: null von neun
      // Unterhaltungen mit bekanntem Handle. Die Bild-ID steht dagegen an jeder
      // Zeile, weil sie in der Adresse des Profilfotos steckt.
      if (!cuTasks[tid] && bild && cuBilder[bild] && cuBilder[bild].tid
          && !cuBilder[bild].leiche && !(cuBilder[bild].tids || []).includes(tid)) {
        vormerken({ art: 'verbinden-handle', tid, titel: t.title, taskId: cuBilder[bild].taskId, bild });
      }

      // Aus UpPromote importierte Tasks haben keine Unterhaltung, weil viele
      // Affiliates nie ueber das Partner-Postfach angeschrieben wurden. Faengt
      // Josia spaeter doch eine an, taucht sie hier auf und wird ueber den
      // Handle mit dem vorhandenen Task verbunden — ohne Zutun.
      if (!cuTasks[tid]) {
        const hier = (handleVon(tid) || {}).handle || vorschau;
        // Gesucht wird im ganzen Bestand, nicht nur unter den Tasks ohne
        // Unterhaltung. Beim Umzug von der Business Suite auf instagram.com
        // tragen die Altbestaende naemlich bereits eine — nur eben die alte,
        // 39-stellige. Genau die sollen ihre Instagram-Unterhaltung bekommen.
        const perHandle = hier && alleTasks().find((x) => !x.leiche
          && !(x.tids || []).includes(tid) && handleVonTask(x) === hier);
        if (perHandle) {
          vormerken({ art: 'verbinden-handle', tid, titel: t.title, taskId: perHandle.taskId, bild });
        }
        // Fruehr wurde hier, wenn kein Handle zu holen war, ueber den
        // Anzeigenamen verknuepft — automatisch. Das ist seit 7.5 vorbei.
        //
        // Der Grund ist nicht, dass der Namensvergleich falsch lag; seine
        // Schranken sind eng, und ein belegter Fehltreffer ist nicht bekannt.
        // Es sind drei andere:
        //
        //   1. Sein Eingangsmaterial kommt aus der Postfachzeile, und genau
        //      das hat sich am 14.10.2026 als unzuverlaessig erwiesen — 33
        //      Task-Titel trugen Vorschautext, weitere den Namen der
        //      Nachbarzeile.
        //   2. Sein Fehler ist still: zwei Creator in einem Datensatz faellt
        //      erst Wochen spaeter an Zahlen auf, die nicht passen. Ein nicht
        //      verknuepfter Task steht dagegen sichtbar im Panel.
        //   3. Die Benutzer-ID deckt inzwischen ab, was er frueher tragen
        //      musste — auch den Zusammenfuehrungs-Fall, und die kommt aus den
        //      Props statt aus gelesenem Text.
        //
        // Vorgeschlagen wird weiter: im Panel unter „Unterhaltungen ohne Task",
        // mit Knopf zum Uebernehmen. Das ist zugleich das Protokoll — dort ist
        // zu sehen, was der Vergleich zugeordnet haette.
      }

      if (fOn && follow[tid].title !== t.title) { follow[tid].title = t.title; followTitles = true; }

    }
    if (followTitles) saveFollow();

  }

  // Zeigt den Pipeline-Status aus ClickUp in der Farbe des Status. Ohne Task ein
  // neutrales Pluszeichen, ohne eingerichtete Verbindung gar nichts.
  function setzeCrmChip(chip, tid) {
    if (!chip) return;
    if (!cuEingerichtet()) { chip.hidden = true; return; }
    chip.hidden = false;
    const task = cuTasks[tid];
    if (task) {
      chip.textContent = task.status || 'im CRM';
      chip.classList.add('on');
      chip.style.background = task.farbe;
      chip.style.borderColor = task.farbe;
      chip.title = 'In ClickUp öffnen';
    } else {
      chip.textContent = 'CRM +';
      chip.classList.remove('on');
      chip.style.background = '';
      chip.style.borderColor = '';
      chip.title = 'Task in ClickUp anlegen';
    }
  }

  // ---------- Handle besorgen, bevor ein Task ohne ihn entsteht ----------
  // Ohne Handle ist ein Task fuer saemtliche Automatiken unsichtbar. Statt das
  // Anlegen zu verweigern — dann waere die Markierung nur noch lokal und fuer
  // Cosima gar nicht sichtbar — wird der Handle beschafft, waehrend der Task
  // ganz normal entsteht.
  //
  // Stufe 1: die Unterhaltung oeffnen und die Kontaktkarte lesen. Das ist die
  // einzige zweifelsfreie Quelle, dort steht das Profil der Person, mit der
  // tatsaechlich geschrieben wird.
  async function handleAusUnterhaltung(tid) {
    const eintrag = threadRows().find(([, t]) => t.threadID === tid);
    if (!eintrag) return '';
    if (offenerThread() !== tid) zeileOeffnen(eintrag[0]);
    for (let i = 0; i < 24; i++) {
      await sleep(250);
      const h = handleAusKarte();
      if (h && HANDLE_MUSTER.test(h.toLowerCase())) return h.toLowerCase();
    }
    return '';   // Es gibt nicht zu jeder Unterhaltung eine Kontaktkarte
  }

  let handleFrageOffen = false;

  // Stufe 2: nachfragen, aber nichts blockieren. „Später nachtragen" ist ein
  // vollwertiger Ausgang — der Task ist dann ueber den Tag „handle-fehlt" und
  // die Liste im Panel auffindbar.
  function handleAbfragen(titel) {
    if (handleFrageOffen) return Promise.resolve('');
    handleFrageOffen = true;
    return new Promise((fertig) => {
      const huelle = el('div');
      huelle.id = 'igfu-frage';
      const kasten = el('div', 'igfu-frage-kasten');
      kasten.append(
        el('b', '', 'Instagram-Handle fehlt'),
        el('div', 'igfu-frage-wer', titel || 'Unbekannt'),
        el('div', 'igfu-frage-text',
          'Die Kontaktkarte gibt nichts her. Ohne Handle greift bei diesem Task '
          + 'keine Automatik — weder UpPromote noch Content noch die Warensendung.'),
      );
      const feld = el('input');
      feld.type = 'text';
      feld.placeholder = 'z. B. max.mustermann';
      feld.autocomplete = 'off';
      kasten.appendChild(feld);
      const hinweis = el('div', 'igfu-frage-text', '');

      const schliessen = (wert) => {
        huelle.remove();
        handleFrageOffen = false;
        fertig(wert);
      };
      const uebernehmen = () => {
        const h = String(feld.value || '').trim().replace(/^@/, '').toLowerCase();
        if (!h) { schliessen(''); return; }
        if (!HANDLE_MUSTER.test(h)) {
          hinweis.textContent = 'Das sieht nicht nach einem Instagram-Handle aus.';
          return;
        }
        schliessen(h);
      };

      const knoepfe = el('div', 'igfu-form-knoepfe');
      knoepfe.append(
        button('igfu-done', 'Übernehmen', uebernehmen),
        button('igfu-link', 'Auf Instagram suchen',
          () => window.open('https://www.instagram.com/', '_blank', 'noopener'),
          'Öffnet Instagram in einem neuen Tab. Das Suchen bleibt Handarbeit.'),
        button('igfu-link', 'Später nachtragen', () => schliessen('')),
      );
      kasten.append(hinweis, knoepfe);
      feld.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') uebernehmen();
        if (e.key === 'Escape') schliessen('');
      });
      huelle.appendChild(kasten);
      document.body.appendChild(huelle);
      try { feld.focus(); } catch (e) { /* egal */ }
    });
  }

  // Beschafft den Handle und traegt ihn nach. Laeuft neben dem Anlegen her und
  // haelt es nie auf.
  async function handleBeschaffen(tid, titel) {
    // Darf nichts unbehandelt nach oben fliegen: der Aufrufer wartet zwar, soll
    // aber am Anlegen nicht scheitern, nur weil der Handle nicht zu holen war.
    try {
      if (!isInbox() || !cuEingerichtet()) return '';
      // Ein bekannter Handle beendet die Suche, auch ein schwacher. Das ist
      // Absicht: diese Funktion laeuft beim *Anlegen* eines Tasks und darf
      // nicht auf eine Zusatzabfrage warten — sonst entsteht der Task zu spaet
      // oder gar nicht. Verbessert wird der Handle an anderer Stelle:
      // karteAuslesen() liest die geoeffnete Unterhaltung aus und ueberschreibt
      // einen schwachen Wert mit der Quelle „karte".
      const bekannt = handleVon(tid);
      if (bekannt && bekannt.handle) return bekannt.handle;
      // Auf instagram.com steht in der Zeile haeufig der Handle selbst
      // („stadtpedal"), nicht der Anzeigename. Dann ist nichts zu holen und
      // nichts zu fragen. Geprueft wird der unveraenderte Titel — so wie
      // ueberall, sonst wird aus jedem Vornamen ein Handle.
      const ausTitel = String(titel || '').trim();
      if (isIG() && HANDLE_MUSTER.test(ausTitel)) {
        handleMerken(tid, ausTitel.toLowerCase(), 'karte');
        vormerken({ art: 'handle', tid, titel, wert: ausTitel.toLowerCase() });
        return ausTitel.toLowerCase();
      }
      const ausKarte = await handleAusUnterhaltung(tid);
      const h = ausKarte || await handleAbfragen(titel);
      if (!h) return '';
      handleMerken(tid, h, ausKarte ? 'karte' : 'hand');
      vormerken({ art: 'handle', tid, titel, wert: h });
      return h;
    } catch (e) {
      toast('Handle: ' + (e && e.message ? e.message : 'unbekannter Fehler'));
      return '';
    }
  }

  async function crmKlick(tid, titel) {
    if (!tid) return;
    const task = cuTasks[tid];
    if (task && task.url) { window.open(task.url, '_blank', 'noopener'); return; }
    // Erst den Handle, dann anlegen — und zwar abgewartet. Ohne Handle kann
    // cuTaskSichern nicht erkennen, dass es zu dieser Person schon einen Task
    // gibt, und legt einen zweiten an. Genau so waere aus Thorsten im normalen
    // Postfach eine Dublette geworden: die Zeile heisst dort
    // „Thorsten | Laufen & Trailrunning", der Task „lauf_bolti_lauf — Thorsten
    // Bolthaup", und ohne Handle verbindet die beiden nichts.
    //
    // Vorher lief das absichtlich nebenher, damit das Anlegen nicht wartet. Der
    // gesparte Augenblick ist eine Dublette im CRM nicht wert.
    toast('Suche den Instagram-Handle …');
    const handle = await handleBeschaffen(tid, titel);
    try {
      const neu = await cuTaskSichern(tid, titel, handle);
      if (neu && neu.tids && neu.tids.length > 1) {
        toast('An den vorhandenen Task gehängt: ' + rohTitel(neu.titel));
        scanRows();
        return;
      }
      scanRows();
      toast('Task angelegt: ' + (neu.titel || titel));
    } catch (e) {
      toast('ClickUp: ' + e.message);
    }
  }

  function toggle(kind, tid, title) {
    if (!tid) return;
    {
      if (follow[tid]) delete follow[tid];
      else follow[tid] = { title: title || 'Unbekannt', flaggedAt: Date.now(), due: '', note: '' };
      saveFollow();
      vormerken({ art: 'follow', tid, titel: title || (follow[tid] && follow[tid].title), wert: !!follow[tid] });
      // Laeuft nebenher. Der Task entsteht sofort, der Handle kommt nach.
      if (follow[tid] && !cuTasks[tid]) handleBeschaffen(tid, title);
    }
    scanRows();
    updateLauncher();
    if (panelOpen) renderPanel();
  }

  // Klicks auf die Knöpfe ganz früh abfangen, damit Meta die Unterhaltung
  // dabei nicht öffnet.
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick']) {
    window.addEventListener(type, (e) => {
      const chip = e.target instanceof Element && e.target.closest('.igfu-tag');
      if (!chip) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      if (type === 'click') {
        const wrap = chip.closest('.igfu-tags');
        if (!wrap) return;
        const imKopf = wrap.classList.contains('igfu-kopf');
        // Im Kopf aendert die Status-Pille den Status, sobald es einen Task
        // gibt. Ohne Task legt sie ihn an, wie an den Zeilen der Liste auch.
        if (chip.dataset.kind === 'crm' && imKopf && cuTasks[wrap.dataset.tid]) {
          statusMenue(chip, wrap.dataset.tid);
        } else if (chip.dataset.kind === 'tag' || chip.dataset.kind === 'tagmenue') {
          tagMenue(chip, wrap.dataset.tid);
        } else if (chip.dataset.kind === 'crm') crmKlick(wrap.dataset.tid, wrap.dataset.title);
        // Der Postfach-Knopf schaltet nichts um, er fuehrt woandershin.
        else if (chip.dataset.kind === 'postfach') {
          if (chip.dataset.ziel) {
            window.open('https://www.instagram.com/direct/t/'
              + encodeURIComponent(chip.dataset.ziel) + '/', '_blank', 'noopener');
          }
        } else toggle(chip.dataset.kind, wrap.dataset.tid, wrap.dataset.title);
      }
    }, true);
  }

  // ---------- Creator Marketplace ----------
  // Hier ist das Handle sicher bekannt. Wer hier erfasst wird, hat es im Task,
  // lange bevor eine Unterhaltung existiert. Die Bild-ID des Profilfotos ist
  // der Schluessel, ueber den beides spaeter zusammenfindet.

  const MARKT_BLOCK = new Set([
    'follower', 'aufrufe', 'interaktionen', 'entdecken', 'listen', 'kampagnen',
    'trends', 'suchen', 'mehr', 'zielgruppe', 'creator', 'kontaktieren',
    'responsive', 'relevanz', 'partnership', 'reels',
  ]);

  function karteZu(knoten) {
    let e = knoten.parentElement;
    for (let i = 0; i < 8 && e; i++, e = e.parentElement) {
      const img = e.querySelector && e.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"]');
      if (img) return { box: e, bild: bildIDAusUrl(img.src) };
    }
    return null;
  }

  function bildIDAusUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/([0-9]{6,})_/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  // ---------- Inhalte des Creator-Marketing-Hubs ----------
  // Jede Content-Kachel traegt am React-Fiber ein content-Objekt. Entscheidend
  // ist ad_ready_status, nicht pa_content_type: Berechtigung und Content-Art
  // sind zwei unabhaengige Achsen, es gibt UGC mit Rechten und Branded Content
  // ohne. Metas Filter kennt genau drei Zustaende:
  //   NO_ISSUES  „Fuer Anzeige bereit"    Rechte liegen vor
  //   WARNINGS   „Handeln erforderlich"   keine Berechtigung, aber anfragbar
  //   (dritter)  „Unzulaessig"            geht nicht
  // Gezaehlt wird als Positivliste, damit der dritte Wert, den wir noch nie
  // gesehen haben, nie versehentlich mitzaehlt.
  const INHALT_BEREIT = 'NO_ISSUES';
  const INHALT_ANFRAGEN = 'WARNINGS';

  function inhaltVonKnoten(el) {
    let f = null;
    for (let k of Object.keys(el)) { if (k.startsWith('__reactFiber$')) { f = el[k]; break; } }
    for (let i = 0; i < 35 && f; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && p.content && p.content.content_id) return p.content;
    }
    return null;
  }

  const inhalte = () => GM_getValue(CU_CONTENT, {}) || {};
  const gesehenInhalte = new Set();

  function scanInhalte() {
    if (!isInhalte()) return;
    const alle = inhalte();
    let neu = false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t.length < 3 || t.length > 30 || !HANDLE_MUSTER.test(t)) continue;
      const p = n.parentElement;
      if (!p || p.closest('.igfu-crm-pille')) continue;
      const c = inhaltVonKnoten(p);
      if (!c) continue;
      const schluessel = c.content_id + '|' + t;
      if (gesehenInhalte.has(schluessel)) continue;
      gesehenInhalte.add(schluessel);
      if (c.ad_ready_status !== INHALT_BEREIT && c.ad_ready_status !== INHALT_ANFRAGEN) continue;
      const e = alle[t] || { bereit: false, anfragen: false };
      if (c.ad_ready_status === INHALT_BEREIT) e.bereit = true; else e.anfragen = true;
      e.stand = Date.now();
      alle[t] = e;
      neu = true;
    }
    if (neu) GM_setValue(CU_CONTENT, alle);
  }

  // Traegt den eingesammelten Stand in ClickUp ein. Laeuft im Postfach, weil der
  // Aktualisieren-Knopf dort sitzt, und arbeitet nur mit dem, was auf der
  // Inhalte-Seite schon gesehen wurde.
  async function inhalteAnwenden() {
    if (!cuEingerichtet() || cuLaeuft) return 0;
    const alle = inhalte();
    const handles = Object.keys(alle).filter((h) => alle[h] && (alle[h].bereit || alle[h].anfragen));
    if (!handles.length) return 0;
    cuLaeuft = true;
    try {
      await cuTasksLaden();
      let fertig = 0;
      for (const t of alleTasks()) {
        if (t.leiche) continue;
        const h = handleVonTask(t);
        if (!h || !alle[h]) continue;
        // Der Tag ist eine Tatsache, kein Zustand: er wird auch dann gesetzt,
        // wenn der Status wegen der Leiter nicht mehr wandert, und nie entfernt.
        if (!t.adcode) {
          await cuTagSetzen(t.taskId, CU_TAG_ADCODE, '#30a46c');
          t.adcode = true;
        }
        if (!darfSetzen(t.status, CU_STATUS_CONTENT)) continue;
        await cuRequest('PUT', '/task/' + t.taskId, { status: CU_STATUS_CONTENT });
        t.status = CU_STATUS_CONTENT;
        fertig++;
      }
      if (fertig) cuSpeichern();
      return fertig;
    } catch (e) {
      toast('Inhalte: ' + e.message);
      return 0;
    } finally {
      cuLaeuft = false;
    }
  }

  function scanMarkt() {
    if (!isMarkt() || !cuEingerichtet()) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const treffer = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t.length < 3 || t.length > 30 || !HANDLE_MUSTER.test(t) || MARKT_BLOCK.has(t)) continue;
      const p = n.parentElement;
      if (!p || p.hasAttribute('data-igfu-crm')) continue;
      // Nicht in die eigene Pille hinein: „recherchiert" sieht aus wie ein Handle
      if (p.closest('.igfu-crm-pille')) continue;
      treffer.push([n, t]);
    }
    for (const [knoten, handle] of treffer) {
      const eltern = knoten.parentNode;
      if (!eltern) continue;
      const karte = karteZu(knoten);
      const pille = document.createElement('button');
      pille.type = 'button';
      pille.className = 'igfu-crm-pille';
      // Das Marketplace-Skript ueberspringt alles mit diesem Merkmal. Ohne das
      // haelt es den Status „recherchiert" fuer ein Handle und haengt seine
      // pinke Pille in diese hier hinein.
      pille.setAttribute('data-igm-linked', '1');
      pille.dataset.handle = handle;
      pille.dataset.bild = (karte && karte.bild) || '';
      eltern.insertBefore(pille, knoten.nextSibling);
      eltern.setAttribute('data-igfu-crm', '1');
    }
    for (const pille of document.querySelectorAll('.igfu-crm-pille')) setzeMarktPille(pille);
  }

  function setzeMarktPille(pille) {
    const task = pille.dataset.bild && cuBilder[pille.dataset.bild];
    if (task) {
      pille.textContent = task.status || 'im CRM';
      pille.dataset.an = '1';
      pille.style.background = task.farbe;
      pille.title = 'In ClickUp öffnen';
    } else {
      pille.textContent = 'ins CRM +';
      pille.dataset.an = '0';
      pille.style.background = '';
      pille.title = 'Creator als „recherchiert" in ClickUp anlegen';
    }
  }

  async function marktKlick(pille) {
    const handle = pille.dataset.handle;
    const bild = pille.dataset.bild;
    const vorhanden = bild && cuBilder[bild];
    if (vorhanden) { window.open(vorhanden.url, '_blank', 'noopener'); return; }
    pille.textContent = 'lege an …';
    try {
      const t = await cuRequest('POST', '/list/' + encodeURIComponent(cuListe()) + '/task', {
        name: handle,
        status: CU_STATUS_MARKT,
        markdown_description: beschreibungMarkt(handle, bild),
      });
      const neu = taskAufbereiten(t);
      neu.bild = neu.bild || bild;
      if (neu.bild) cuBilder[neu.bild] = neu;
      cuSpeichern();
      setzeMarktPille(pille);
    } catch (e) {
      setzeMarktPille(pille);
      console.warn('[Markierungen] ClickUp:', e.message);
    }
  }

  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick']) {
    window.addEventListener(type, (e) => {
      const pille = e.target instanceof Element && e.target.closest('.igfu-crm-pille');
      if (!pille) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      if (type === 'click') marktKlick(pille);
    }, true);
  }

  // ---------- Übersicht ----------

  let panelOpen = false;
  let launcher, panel, bodyEl, toastEl, formEl, refreshBtn, tippEl, filterBtn;
  // Instagram hat keinen Filter fuer Ungelesene. Der Lesestatus steht aber an
  // jeder Zeile, also laesst er sich nachruesten: gelesene Zeilen werden
  // ausgeblendet. Die Einstellung haelt ueber das Neuladen hinweg.
  const KEY_NUR_UNGELESEN = 'igfu:nur-ungelesen:v1';
  const nurUngelesen = () => GM_getValue(KEY_NUR_UNGELESEN, false) === true;

  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

  function dueInfo(due) {
    if (!due) return { text: 'Keine Wiedervorlage', cls: '' };
    const diff = daysBetween(todayStr(), due);
    if (diff < 0) return { text: diff === -1 ? 'Seit gestern überfällig' : 'Seit ' + -diff + ' Tagen überfällig', cls: 'late' };
    if (diff === 0) return { text: 'Heute fällig', cls: 'today' };
    if (diff === 1) return { text: 'Morgen fällig', cls: '' };
    return { text: 'Fällig am ' + fmt(due), cls: '' };
  }

  function sortedFollow() {
    return Object.entries(follow).sort(([, a], [, b]) => {
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return a.flaggedAt - b.flaggedAt;
    });
  }


  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(cls, text, onClick, title) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  function filterStand() {
    if (!filterBtn) return;
    const an = nurUngelesen();
    filterBtn.classList.toggle('on', an);
    filterBtn.textContent = an ? 'Nur ungelesene ✓' : 'Nur ungelesene';
    filterBtn.hidden = !isIG();
  }

  function stilEinspielen() {
    if (document.getElementById('igfu-style')) return;
    const style = document.createElement('style');
    style.id = 'igfu-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildUI() {
    if (launcher) return;
    stilEinspielen();

    launcher = button('', '', () => { panelOpen ? closePanel() : openPanel(); });
    launcher.id = 'igfu-launch';
    document.body.appendChild(launcher);

    refreshBtn = button('', 'Aktualisieren', () => allesAktualisieren());
    refreshBtn.id = 'igfu-refresh';
    document.body.appendChild(refreshBtn);

    filterBtn = button('', 'Nur ungelesene', () => {
      GM_setValue(KEY_NUR_UNGELESEN, !nurUngelesen());
      filterStand();
      scanRows();
    }, 'Blendet gelesene Unterhaltungen aus. Instagram selbst kann das nicht.');
    filterBtn.id = 'igfu-filter';
    document.body.appendChild(filterBtn);
    filterStand();

    // Erklaerung als eigener Tooltip. Die eingebaute Sprechblase des Browsers
    // kommt zu spaet und laesst sich nicht lesbar gliedern.
    tippEl = el('div');
    tippEl.id = 'igfu-tipp';
    tippEl.setAttribute('role', 'tooltip');
    const kopf = el('b', '', 'Holt nach, was seit dem letzten Lauf passiert ist');
    const liste = el('ul');
    for (const t of [
      'neue Nachrichten in beide Richtungen, auch die, die du selbst geschrieben hast',
      'Datum der letzten Nachricht ins Startdatum des Tasks, damit du in ClickUp nach Dringlichkeit sortieren kannst',
      'Priorität „urgent", solange die Antwort bei dir liegt, und wieder weg, sobald du geantwortet hast',
      'Instagram-Handles aus den Vorschautexten, und benennt die Tasks entsprechend um',
      'Unterhaltungen, die zu einem im Marketplace erfassten Creator gehören, werden mit ihm verbunden',
      'bestätigte Affiliates aus UpPromote auf „' + CU_STATUS_ONBOARD + '"',
      'Creator mit nutzbarem Content auf „' + CU_STATUS_CONTENT + '" — eingesammelt auf der Inhalte-Seite',
    ]) liste.appendChild(el('li', '', t));
    const fuss = el('div', 'igfu-tipp-fuss',
      'Läuft nur so weit nach unten, bis er am letzten Lauf vorbei ist, meist ein paar Zeilen. '
      + 'Beim allerersten Mal geht er einmal komplett durch. Legt keine neuen Tasks an und ändert '
      + 'keine Follow-ups. Den vollständigen Durchlauf findest du im Panel unter ClickUp.');
    tippEl.append(kopf, liste, fuss);
    document.body.appendChild(tippEl);

    const tippZeigen = () => {
      const r = refreshBtn.getBoundingClientRect();
      tippEl.style.left = Math.round(Math.max(8, r.left)) + 'px';
      tippEl.style.bottom = Math.round(window.innerHeight - r.top + 10) + 'px';
      tippEl.classList.add('show');
    };
    const tippVerstecken = () => tippEl.classList.remove('show');
    refreshBtn.addEventListener('mouseenter', tippZeigen);
    refreshBtn.addEventListener('focus', tippZeigen);
    refreshBtn.addEventListener('mouseleave', tippVerstecken);
    refreshBtn.addEventListener('blur', tippVerstecken);

    panel = el('section');
    panel.id = 'igfu-panel';
    panel.setAttribute('aria-label', 'Markierungen');
    panel.hidden = true;

    const head = el('header', 'igfu-head');
    head.appendChild(el('h2', '', 'Markierungen'));
    const actions = el('div', 'igfu-head-actions');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => importData(fileInput));
    const closeBtn = button('igfu-close', '×', closePanel, 'Schließen');
    closeBtn.setAttribute('aria-label', 'Schließen');
    actions.append(
      button('igfu-link', 'ClickUp', () => formularUmschalten(), 'Verbindung zu ClickUp einrichten'),
      button('igfu-link', 'Sichern', exportData, 'Alle Markierungen als Datei herunterladen'),
      button('igfu-link', 'Laden', () => fileInput.click(), 'Gesicherte Datei wieder einlesen'),
      fileInput,
      closeBtn,
    );
    head.appendChild(actions);

    formEl = baueFormular();
    bodyEl = el('div', 'igfu-body');
    panel.append(head, formEl, bodyEl);
    document.body.appendChild(panel);

    toastEl = el('div');
    toastEl.id = 'igfu-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen) closePanel(); });
  }

  // Der Token wird nur geschrieben, nie wieder ins Feld zurueckgeschrieben. Im
  // Formular steht deshalb nur, ob einer hinterlegt ist.
  function baueFormular() {
    const f = el('div', 'igfu-form');
    f.hidden = true;

    const hinweis = el('p', 'igfu-form-hinweis');

    const listenFeld = el('input');
    listenFeld.type = 'text';
    listenFeld.placeholder = 'z. B. 901234567890';
    listenFeld.value = cuListe();
    const listenLabel = el('label', '', 'Listen-ID');
    listenLabel.appendChild(listenFeld);

    const tokenFeld = el('input');
    tokenFeld.type = 'password';
    tokenFeld.autocomplete = 'off';
    tokenFeld.placeholder = 'pk_…';
    const tokenLabel = el('label', '', 'ClickUp-Token');
    tokenLabel.appendChild(tokenFeld);

    const upFeld = el('input');
    upFeld.type = 'password';
    upFeld.autocomplete = 'off';
    upFeld.placeholder = 'Schlüssel aus UpPromote, Einstellungen › Integrationen';
    const upLabel = el('label', '', 'UpPromote-Token');
    upLabel.appendChild(upFeld);

    const metaFeld = el('input');
    metaFeld.type = 'password';
    metaFeld.autocomplete = 'off';
    metaFeld.placeholder = 'Page-Access-Token mit instagram_manage_messages';
    const metaLabel = el('label', '', 'Meta-Token');
    metaLabel.appendChild(metaFeld);

    const knoepfe = el('div', 'igfu-form-knoepfe');

    const standAnzeigen = () => {
      const teile = [];
      teile.push(String(GM_getValue(CU_TOKEN, '') || '').trim() ? 'Token hinterlegt.' : 'Kein Token hinterlegt.');
      teile.push(cuListe() ? 'Liste ' + cuListe() + '.' : 'Keine Liste gesetzt.');
      teile.push(upToken() ? 'UpPromote verbunden.' : 'UpPromote nicht verbunden.');
      teile.push(metaToken()
        ? 'Meta-API verbunden' + (metaSeite() ? ', Seite ' + metaSeite() + '.' : ', Seiten-ID fehlt noch.')
        : 'Meta-API nicht verbunden.');
      const funde = GM_getValue(META_FUNDE, null);
      if (funde && funde.liste) teile.push(funde.liste.length + ' Handles von Meta.');
      const offen = warteschlange().length;
      if (offen) teile.push(offen + ' Änderung(en) warten auf Übertragung.');
      hinweis.textContent = teile.join(' ');
    };

    knoepfe.append(
      button('igfu-done', 'Speichern', async () => {
        GM_setValue(CU_LIST, listenFeld.value.trim());
        if (tokenFeld.value.trim()) GM_setValue(CU_TOKEN, tokenFeld.value.trim());
        if (upFeld.value.trim()) GM_setValue(UP_TOKEN, upFeld.value.trim());
        if (metaFeld.value.trim()) GM_setValue(META_TOKEN, metaFeld.value.trim());
        tokenFeld.value = '';
        upFeld.value = '';
        metaFeld.value = '';
        cuEinstellungenGeaendert();
        standAnzeigen();
        toast('Gespeichert. Ich prüfe die Verbindung …');
        await verbindungPruefen();
        standAnzeigen();
      }),
      button('igfu-link', 'Verbindung prüfen', async () => { await verbindungPruefen(); standAnzeigen(); }),
      button('igfu-link', 'Lokale Follow-ups übernehmen', async () => { await uebernehmen(); standAnzeigen(); }),
      button('igfu-link', 'UpPromote abgleichen', async () => { await upAbgleichen(); standAnzeigen(); },
        'Bestätigte Affiliates aus UpPromote auf „' + CU_STATUS_ONBOARD + '" setzen'),
      button('igfu-link', 'Affiliates importieren', () => upImport(),
        'Legt aktive Affiliates aus „' + UP_PROGRAMM + '" als Tasks an. '
        + 'Erster Klick zählt nur, zweiter legt an.'),
      button('igfu-link', 'Inhalte-Seite öffnen', () => {
        const ziel = inhalteZiel();
        closePanel();
        if (!ziel.vollstaendig) {
          toast('Das Konto steht nicht in der Adresse. Bitte oben rechts prüfen, ob „Tzampas Food" ausgewählt ist.');
        }
        window.open(ziel.url, '_blank');
      },
        'Öffnet die Inhalte des Creator-Marketing-Hubs, nach Datum sortiert. Was dort sichtbar wird, '
        + 'sammelt das Skript ein. Beim nächsten Aktualisieren landet es in ClickUp.'),
      button('igfu-link', 'Handles über die Meta-API holen',
        async () => { await metaHandlesHolen(); standAnzeigen(); },
        'Fragt die Instagram-Unterhaltungen bei Meta ab. Die API nennt den Handle jedes '
        + 'Gegenübers — im Postfach steht er nirgends. Es wird nur gelesen, keine Unterhaltung '
        + 'geöffnet, nichts als gelesen markiert.'),
      button('igfu-link', 'Handles gegen UpPromote prüfen',
        async () => { await handlesPruefen(); standAnzeigen(); },
        'Vergleicht den Handle jedes Tasks mit dem, der bei UpPromote hinterlegt ist — '
        + 'zugeordnet über die Mailadresse. Ändert nichts, listet nur die Abweichungen.'),
      button('igfu-link', 'Namen richtigstellen',
        async () => { await namenReparieren(); standAnzeigen(); },
        'Schneidet den Vorschautext aus Task-Namen heraus („… PersonYou: Hi Beispiel,") und '
        + 'entfernt falsche Handles wie „https". Betroffene Tasks landen danach in der Liste '
        + '„Handles nachtragen".'),
      button('igfu-link', 'Kennungen richtigstellen',
        async () => { await kennungenReparieren(); standAnzeigen(); },
        'Einmalig nötig: markiert jede Unterhaltungs-Kennung, zu der ein Instagram-Link in '
        + 'der Beschreibung steht, auch als Instagram-Unterhaltung. Vorher wurde die Herkunft '
        + 'an der Länge der Kennung geraten, und das war falsch.'),
      button('igfu-link', 'Anschreib-Links nachtragen',
        async () => { await anschreibLinksNachtragen(); standAnzeigen(); },
        'Setzt bei jedem Task mit Handle einen Link, der den Instagram-Chat mit dieser Person '
        + 'öffnet. Unabhängig davon, ob die Unterhaltung zugeordnet werden konnte. Wo schon ein '
        + 'Link auf eine Unterhaltung steht, bleibt es dabei.'),
      button('igfu-link', 'Alte Postfach-Links entfernen',
        async () => { await altlinksEntfernen(); standAnzeigen(); },
        'Nimmt den Link ins alte Postfach und die alte Markerzeile aus der Beschreibung — '
        + 'aber nur dort, wo der Instagram-Link schon drinsteht. Der Instagram-Link rückt dabei '
        + 'nach oben.'),
      button('igfu-link', 'Fehlende Fristen nachtragen',
        async () => { await fristenNachtragen(); standAnzeigen(); },
        'Setzt eine Nachfass-Frist bei jedem Task, der noch keine hat: ab „erste ware versendet" '
        + 'Versand plus 10 Wochentage, bei „ongeboardet" das Onboarding-Datum plus 14 Tage, '
        + 'darunter die letzte Nachricht plus 14 Tage. Tasks mit Frist bleiben unangetastet.'),
      button('igfu-link', 'Ganze Liste durchgehen', () => { closePanel(); allesAktualisieren(true); },
        'Scrollt die komplette Unterhaltungsliste durch statt nur bis zum letzten Lauf. '
        + 'Dauert deutlich länger. Nötig nach längerer Abwesenheit oder wenn etwas fehlt.'),
      button('igfu-link', 'Token löschen', () => {
        GM_setValue(CU_TOKEN, '');
        GM_setValue(UP_TOKEN, '');
        cuEinstellungenGeaendert();
        standAnzeigen();
        scanRows();
        toast('Beide Token gelöscht. Das Postfach arbeitet wieder rein lokal.');
      }),
    );

    f.append(hinweis, listenLabel, tokenLabel, upLabel, metaLabel, knoepfe);
    f.standAnzeigen = standAnzeigen;
    standAnzeigen();
    return f;
  }

  function formularUmschalten() {
    if (!formEl) return;
    formEl.hidden = !formEl.hidden;
    if (!formEl.hidden && formEl.standAnzeigen) formEl.standAnzeigen();
  }

  async function verbindungPruefen() {
    if (!cuEingerichtet()) { toast('Bitte erst Listen-ID und Token eintragen.'); return false; }
    try {
      await cuSpaceLaden();
      tagGeprueft.clear();
      await cuTagSichern(CU_TAG, YELLOW);
      await cuTasksLaden();
      zusammenfuehren();
      scanRows();
      if (panelOpen) renderPanel();
      updateLauncher();
      toast('Verbunden. Tag „' + CU_TAG + '" liegt bereit, '
        + Object.keys(cuTasks).length + ' Unterhaltungen sind in ClickUp bekannt.');
      return true;
    } catch (e) {
      toast('ClickUp: ' + e.message);
      return false;
    }
  }

  // Einmaliger Abgleich: alles, was lokal als Follow-up steht und in ClickUp fehlt,
  // wird dort angelegt. Bereits vorhandene Tasks bleiben unangetastet.
  async function uebernehmen() {
    if (!cuEingerichtet()) { toast('Bitte erst Listen-ID und Token eintragen.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    let offen;
    try {
      // Immer erst den aktuellen Stand holen. Sonst legt ein zweiter Durchlauf
      // dieselben Unterhaltungen ein zweites Mal an.
      toast('Gleiche mit ClickUp ab …');
      await cuTagSichern(CU_TAG, YELLOW);
      await cuTasksLaden();
    } catch (e) {
      cuLaeuft = false;
      toast('ClickUp: ' + e.message);
      return;
    }
    offen = Object.entries(follow).filter(([tid]) => !cuTasks[tid] || !cuTasks[tid].follow);
    if (!offen.length) { toast('In ClickUp fehlt nichts.'); return; }
    toast(offen.length + ' Follow-ups werden übertragen …');
    let fertig = 0;
    try {
      for (const [tid, eintrag] of offen) {
        const task = await cuTaskSichern(tid, eintrag.title);
        await cuFollowSetzen(task.taskId, true);
        task.follow = true;
        if (follow[tid]) { follow[tid].inCu = true; saveFollow(); }
        if (eintrag.due) {
          const ms = msVonIso(eintrag.due);
          if (ms) { await cuRequest('PUT', '/task/' + task.taskId, { due_date: ms, due_date_time: false }); task.due = eintrag.due; }
        }
        if (String(eintrag.note || '').trim()) {
          await cuRequest('POST', '/task/' + task.taskId + '/comment', { comment_text: eintrag.note, notify_all: false });
        }
        fertig++;
        cuSpeichern();
      }
      toast(fertig + ' von ' + offen.length + ' übertragen.');
    } catch (e) {
      toast('Nach ' + fertig + ' von ' + offen.length + ' abgebrochen. ' + e.message);
    } finally {
      cuLaeuft = false;
    }
    scanRows();
    if (panelOpen) renderPanel();
    updateLauncher();
  }

  function updateLauncher() {
    if (!launcher) return;

    const all = Object.values(follow);
    const due = all.filter((f) => f.due && f.due <= todayStr()).length;
    launcher.textContent = '';
    launcher.append(el('span', '', 'Follow-ups ' + all.length));
    if (due) launcher.append(el('span', 'igfu-due-badge', due + ' fällig'));
    const offen = cuEingerichtet() ? warteschlange().length : 0;
    if (offen) launcher.append(el('span', 'igfu-due-badge', offen + ' offen'));
    const fehlen = ohneHandle().length;
    if (fehlen) launcher.append(el('span', 'igfu-due-badge', fehlen + ' ohne Handle'));
    const ohneGespraech = ohneUnterhaltung().length;
    if (ohneGespraech) launcher.append(el('span', '', ohneGespraech + ' ohne Unterhaltung'));
    launcher.classList.toggle('has', all.length > 0);
    launcher.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
    positionUI();
  }

  function openPanel() { panelOpen = true; panel.hidden = false; renderPanel(); updateLauncher(); }
  function closePanel() { panelOpen = false; panel.hidden = true; updateLauncher(); }

  // Tasks, bei denen der Handle fehlt und noch gebraucht wird. Endstatus
  // bleiben aussen vor, dort interessiert er nicht mehr.
  function ohneHandle() {
    if (!cuEingerichtet()) return [];
    return alleTasks()
      .filter((t) => !STATUS_ENDE.includes(String(t.status || '').toLowerCase()))
      .filter((t) => !t.leiche)
      .filter((t) => !handleVonTask(t))
      .sort((a, b) => String(a.titel || '').localeCompare(String(b.titel || '')));
  }

  // Tasks, zu denen es noch keine Unterhaltung gibt. Das ist der Normalfall bei
  // allem, was aus UpPromote kam: diese Affiliates wurden nie ueber Instagram
  // angeschrieben, und wo nie geschrieben wurde, gibt es nichts zu verbinden.
  //
  // Zu verbinden ist es trotzdem oft — naemlich sobald geschrieben wurde. Nur
  // findet das Skript die Zuordnung dann haeufig nicht von selbst: im normalen
  // Postfach nennt der Vorschautext nie den Handle, und der Anzeigename traegt
  // meist nur den Vornamen plus Beiwerk. „Thorsten | Laufen & Trailrunning"
  // gegen „lauf_bolti_lauf — Torsten Bolthaup" ist nicht zu raten, zumal es
  // zwei Thorstens gibt. Deshalb hier die Liste und ein Knopf zum Verbinden
  // von Hand. Ein Klick, und ab dann laeuft alles Weitere automatisch — die
  // Bild-ID wird dabei gelernt und traegt kuenftige Zuordnungen.
  // Tasks, die nur noch am alten Postfach haengen: sie tragen ausschliesslich
  // 39-stellige Kennungen und keine von instagram.com. Ihre Links funktionieren
  // heute noch, haengen aber an einer Oberflaeche, die Meta gerade abraeumt.
  //
  // Sie verschwinden von selbst aus dieser Liste, sobald ihre Unterhaltung im
  // Durchlauf auftaucht und ueber Handle oder Namen zugeordnet wird.
  function nurAltlink() {
    if (!cuEingerichtet()) return [];
    return alleTasks()
      .filter((t) => !t.leiche)
      .filter((t) => !STATUS_ENDE.includes(String(t.status || '').toLowerCase().trim()))
      .filter((t) => (t.tidsBS || []).length && !(t.tidsIG || []).length)
      .sort((a, b) => String(a.titel || '').localeCompare(String(b.titel || '')));
  }

  function ohneUnterhaltung() {
    if (!cuEingerichtet()) return [];
    return cuOhneThread
      .filter((t) => !t.leiche)
      .filter((t) => !STATUS_ENDE.includes(String(t.status || '').toLowerCase().trim()))
      .sort((a, b) => (statusRang(b.status) - statusRang(a.status))
        || String(a.titel || '').localeCompare(String(b.titel || '')));
  }

  // Die gerade geoeffnete Unterhaltung, sofern sie noch keinen Task hat.
  function offeneOhneTask() {
    const tid = offenerThread();
    if (!tid || cuTasks[tid]) return null;
    const zeile = threadRows().find(([, t]) => t.threadID === tid);
    return { tid, titel: zeile ? zeile[1].title : '', bild: zeile ? bildIDVon(zeile[1]) : '' };
  }

  // Fuer Tasks ohne Unterhaltung: Name und Markerzeile direkt schreiben.
  async function handleDirektSetzen(task, h) {
    try {
      const neuerName = taskName(h, rohTitel(task.titel));
      if (neuerName && neuerName !== task.titel) {
        await cuRequest('PUT', '/task/' + task.taskId, { name: neuerName });
        task.titel = neuerName;
      }
      await markerEintragen(task, 'igfu-handle', h);
      task.handle = h;
      cuSpeichern();
      if (panelOpen) renderPanel();
      updateLauncher();
    } catch (e) {
      toast('ClickUp: ' + e.message);
    }
  }

  // Was das Skript in diesem Augenblick vor sich hat. Ohne diese Zeile bleibt
  // „es passiert nichts" nicht von „es sieht nichts" zu unterscheiden — und der
  // haeufigste Fall ist das zweite: das Skript liest ausschliesslich die Zeilen,
  // die gerade auf dem Bildschirm stehen. Steht man in den Partner-Nachrichten,
  // sind die normalen DMs gar nicht in der Liste.
  function diagnoseZeile() {
    const zeilen = threadRows();
    const alleZeilen = document.querySelectorAll('div[role="presentation"]').length;
    const mitTask = zeilen.filter(([, t]) => cuTasks[t.threadID]).length;
    const mitHandle = zeilen.filter(([, t]) => (handleVon(t.threadID) || {}).handle).length;
    if (!zeilen.length) {
      return 'Version ' + VERSION + ' · ' + (alleZeilen > 5
        ? 'Keine Instagram-Unterhaltung in dieser Liste erkannt. Stehst du im richtigen Postfach?'
        : 'Die Liste ist noch nicht geladen.');
    }
    return 'Version ' + VERSION + ' · '
      + zeilen.length + ' Unterhaltung' + (zeilen.length === 1 ? '' : 'en') + ' gerade im Dokument, '
      + mitTask + ' mit Task, ' + mitHandle + ' mit bekanntem Handle.' + durchlaufZeile();
  }

  // Zeigt die Unterhaltungen, zu denen kein Task gefunden wurde — und zwar mit
  // dem Namen, wie das Skript ihn liest. Nur so laesst sich sehen, warum die
  // Namensbruecke nicht greift: ein Instagram-Anzeigename ist selten genau
  // „Vorname Nachname", und ein Vergleich, der nichts findet, sagt von sich aus
  // nicht, woran er gescheitert ist.
  function zeigeOhneTask() {
    const offen = threadRows().filter(([, t]) => !cuTasks[t.threadID]);
    if (!offen.length) return;
    bodyEl.appendChild(el('h3', 'igfu-section-title', 'Unterhaltungen ohne Task'));
    bodyEl.appendChild(el('p', 'igfu-empty',
      'So liest das Skript den Namen. Steht rechts „kein Treffer", gibt es in '
      + 'ClickUp keinen passenden Task — oder es passen zwei, dann wird keiner genommen. '
      + 'Über die Auswahl darunter verbindest du von Hand.'));
    const waehlbar = ohneUnterhaltung();
    const ul = el('ol', 'igfu-list');
    for (const [, t] of offen.slice(0, 20)) {
      const tid = t.threadID;
      const treffer = nameTreffer(t.title, true);
      const vorschlag = treffer ? null : namensVorschlag(t.title);
      const li = el('li', 'igfu-item');
      const top = el('div', 'igfu-item-top');
      top.append(
        button('igfu-name', t.title || 'Ohne Namen', () => reveal(tid), 'In der Liste anzeigen'),
        el('span', 'igfu-meta', treffer
          ? 'Treffer: ' + rohTitel(treffer.titel)
          : (vorschlag ? 'Vorschlag: ' + rohTitel(vorschlag.titel) : 'kein Treffer')),
      );
      if (vorschlag) {
        top.appendChild(button('igfu-link', 'Übernehmen', async () => {
          try {
            await threadAnhaengen(vorschlag, tid, bildIDVon(t));
            toast('Verbunden: ' + rohTitel(vorschlag.titel) + ' \u2194 ' + (t.title || 'Unterhaltung'));
            scanRows();
            renderPanel();
            updateLauncher();
          } catch (e) {
            toast('Verbinden: ' + e.message);
          }
        }, 'Der Name stimmt überein, ist aber zu kurz für eine automatische Zuordnung'));
      }
      li.appendChild(top);
      li.appendChild(el('div', 'igfu-meta', 'gelesen als „' + namensform(t.title) + '"'));

      // Von Hand zuordnen, direkt an der Unterhaltung. Bewusst nicht ueber „die
      // gerade geoeffnete Unterhaltung": deren Kennung steht nur dann in der
      // Adresse, wenn man ueber einen Deep-Link gekommen ist. Beim blossen
      // Anklicken einer Zeile schreibt Meta sie nicht hinein — dieselbe
      // Ursache, aus der auch das Auslesen der Kontaktkarte oft leer ausgeht.
      if (waehlbar.length) {
        const zeile = el('div', 'igfu-item-top');
        const auswahl = document.createElement('select');
        auswahl.className = 'igfu-auswahl';
        const leer = document.createElement('option');
        leer.value = '';
        leer.textContent = 'Mit Task verbinden \u2026';
        auswahl.appendChild(leer);
        for (const task of waehlbar) {
          const o = document.createElement('option');
          o.value = task.taskId;
          o.textContent = (task.titel || 'Ohne Namen') + (task.status ? ' \u00b7 ' + task.status : '');
          auswahl.appendChild(o);
        }
        auswahl.addEventListener('change', async () => {
          const ziel = waehlbar.find((x) => x.taskId === auswahl.value);
          if (!ziel) return;
          auswahl.disabled = true;
          try {
            await threadAnhaengen(ziel, tid, bildIDVon(t));
            toast('Verbunden: ' + rohTitel(ziel.titel) + ' \u2194 ' + (t.title || 'Unterhaltung'));
            scanRows();
            renderPanel();
            updateLauncher();
          } catch (e) {
            auswahl.disabled = false;
            toast('Verbinden: ' + e.message);
          }
        });
        zeile.appendChild(auswahl);
        li.appendChild(zeile);
      }
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
  }

  // Metas Liste haelt immer nur gut ein Dutzend Zeilen im Dokument. „Im Blick"
  // ist deshalb kein Mass fuer den Bestand — der steht hier.
  function durchlaufZeile() {
    const b = GM_getValue(LETZTER_DURCHLAUF, null);
    if (!b || !b.gesehen) return '';
    const tage = Math.floor((Date.now() - (b.stand || 0)) / 86400000);
    const wann = tage <= 0 ? 'heute' : (tage === 1 ? 'gestern' : 'vor ' + tage + ' Tagen');
    return ' — Letzter ' + (b.voll ? 'voller Durchlauf' : 'Durchlauf') + ' ' + wann + ': '
      + b.gesehen + ' Unterhaltungen gesehen, ' + b.mitTask + ' mit Task, '
      + b.mitHandle + ' mit bekanntem Handle.';
  }

  // Der Gegenstueck-Abschnitt zu „Unterhaltungen ohne Task": hier stehen die
  // Tasks, denen die Unterhaltung fehlt.
  function zeigeOhneUnterhaltung() {
    const offen = ohneUnterhaltung();
    if (!offen.length) return;
    const jetzt = offeneOhneTask();
    bodyEl.appendChild(el('h3', 'igfu-section-title',
      'Tasks ohne Unterhaltung (' + offen.length + ')'));
    bodyEl.appendChild(el('p', 'igfu-empty', jetzt
      ? 'Offen ist gerade „' + (jetzt.titel || 'eine Unterhaltung')
        + '". Ein Klick auf „Verbinden" hängt sie an den Task.'
      : 'Mit diesen Affiliates wurde nie über Instagram geschrieben — oder das Skript '
        + 'findet die Unterhaltung nicht, weil der Anzeigename ein anderer ist. Öffne die '
        + 'Unterhaltung im Postfach, dann erscheint hier ein Knopf zum Verbinden.'));
    const ul = el('ol', 'igfu-list');
    for (const t of offen.slice(0, 40)) {
      const li = el('li', 'igfu-item');
      const top = el('div', 'igfu-item-top');
      top.append(
        button('igfu-name', t.titel || 'Ohne Namen',
          () => window.open(t.url, '_blank', 'noopener'), 'Task in ClickUp öffnen'),
        el('span', 'igfu-meta', t.status || ''),
      );
      if (jetzt) {
        top.appendChild(button('igfu-link', 'Verbinden', async () => {
          try {
            await threadAnhaengen(t, jetzt.tid, jetzt.bild);
            toast('Verbunden: ' + (t.titel || 'Task') + ' ↔ ' + (jetzt.titel || 'Unterhaltung'));
            scanRows();
            renderPanel();
            updateLauncher();
          } catch (e) {
            toast('Verbinden: ' + e.message);
          }
        }, 'Hängt die gerade geöffnete Unterhaltung an diesen Task'));
      }
      li.appendChild(top);
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
  }

  // Abweichungen aus der Gegenprobe gegen UpPromote.
  function zeigeHandleZweifel() {
    const d = GM_getValue(HANDLE_ZWEIFEL, null);
    if (!d || !d.liste || !d.liste.length) return;
    bodyEl.appendChild(el('h3', 'igfu-section-title',
      'Handle weicht von UpPromote ab (' + d.liste.length + ')'));
    bodyEl.appendChild(el('p', 'igfu-empty',
      'Links steht, was im Task steht, rechts was UpPromote kennt. Beides kann richtig sein: '
      + 'hast du einen Handle von Hand korrigiert, ist UpPromote veraltet. Das Skript ändert '
      + 'hier nichts von selbst.'));
    const ul = el('ol', 'igfu-list');
    for (const z of d.liste.slice(0, 30)) {
      const li = el('li', 'igfu-item');
      const top = el('div', 'igfu-item-top');
      top.append(
        button('igfu-name', rohTitel(z.titel || 'Ohne Namen'),
          () => window.open(z.url, '_blank', 'noopener'), 'Task in ClickUp öffnen'),
        el('span', 'igfu-meta', '@' + z.hier + '  →  UpPromote: @' + z.beiUp),
      );
      li.appendChild(top);
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
  }

  // Der Stand des Umzugs von der Business Suite auf instagram.com.
  function zeigeUmzug() {
    const offen = nurAltlink();
    if (!offen.length) return;
    bodyEl.appendChild(el('h3', 'igfu-section-title', 'Noch am alten Postfach (' + offen.length + ')'));
    bodyEl.appendChild(el('p', 'igfu-empty',
      'Diese Tasks verlinken noch in die Meta Business Suite. Sobald ihre Unterhaltung '
      + 'bei einem Durchlauf auf instagram.com auftaucht und sich zuordnen lässt, kommt '
      + 'der Instagram-Link von selbst dazu. Was übrig bleibt, verbindest du unten von Hand.'));
    const ul = el('ol', 'igfu-list');
    for (const t of offen.slice(0, 30)) {
      const li = el('li', 'igfu-item');
      const top = el('div', 'igfu-item-top');
      top.append(
        button('igfu-name', t.titel || 'Ohne Namen',
          () => window.open(t.url, '_blank', 'noopener'), 'Task in ClickUp öffnen'),
        el('span', 'igfu-meta', t.status || ''),
      );
      li.appendChild(top);
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
  }

  // Steht im Panel ganz oben, direkt unter der Diagnosezeile.
  //
  // Der Grund ist die Bedienung: Nach jedem „Übernehmen" wird das Panel neu
  // aufgebaut und springt an den Anfang. Stand der Abschnitt unten, musste
  // man sich nach jedem einzelnen Handle wieder hinunterscrollen — bei
  // mehreren Dutzend Lücken ist das die eigentliche Arbeit.
  function zeigeHandleLuecken() {
  const luecken = ohneHandle();
  if (luecken.length) {
    bodyEl.appendChild(el('h3', 'igfu-section-title', 'Handles nachtragen'));
    bodyEl.appendChild(el('p', 'igfu-empty',
      'Ohne Handle greift bei diesen Tasks keine Automatik — weder UpPromote '
      + 'noch Content noch die Warensendung.'));
    const ul = el('ol', 'igfu-list');
    for (const t of luecken) {
      const tid = t.tid;
      const li = el('li', 'igfu-item');
      const top = el('div', 'igfu-item-top');
      top.append(
        tid
          ? button('igfu-name', rohTitel(t.titel), () => reveal(tid), 'In der Liste anzeigen')
          : el('span', 'igfu-name', rohTitel(t.titel)),
        // Ohne Unterhaltung gibt es nichts zu zeigen, dafuer den Task selbst
        tid
          ? button('igfu-link', 'Unterhaltung öffnen', () => reveal(tid))
          : button('igfu-link', 'Task öffnen', () => window.open(t.url, '_blank', 'noopener')),
        button('igfu-link', 'Instagram', () => window.open('https://www.instagram.com/', '_blank', 'noopener'),
          'Öffnet Instagram in einem neuen Tab. Das Suchen bleibt Handarbeit.'),
      );
      const feld = el('input');
      feld.type = 'text';
      feld.placeholder = 'Handle';
      feld.autocomplete = 'off';
      const uebernehmen = () => {
        const h = String(feld.value || '').trim().replace(/^@/, '').toLowerCase();
        if (!h) return;
        if (!HANDLE_MUSTER.test(h)) { toast('Das sieht nicht nach einem Instagram-Handle aus.'); return; }
        if (tid) {
          handleMerken(tid, h, 'hand');
          vormerken({ art: 'handle', tid, titel: t.titel, wert: h });
        } else {
          // Ohne Unterhaltung geht es nicht ueber die Warteschlange, die ist
          // nach Thread-ID gefuehrt.
          handleDirektSetzen(t, h);
        }
        toast('Handle übernommen: ' + h);
        renderPanel();
      };
      feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') uebernehmen(); });
      const unten = el('div', 'igfu-item-top');
      unten.append(feld, button('igfu-done', 'Übernehmen', uebernehmen));
      li.append(top, unten);
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
  }
  }

  function renderPanel() {
    bodyEl.textContent = '';
    const fEntries = sortedFollow();

    if (isInbox()) {
      const d = el('p', 'igfu-empty', diagnoseZeile());
      d.id = 'igfu-diagnose';
      bodyEl.appendChild(d);
    }

    // Vor allem anderen — ausser der Diagnosezeile. Und ausserhalb der
    // isInbox-Schranke, weil dieser Abschnitt auch im Marketplace gebraucht
    // wird; dort war er vorher sichtbar und soll es bleiben.
    zeigeHandleLuecken();

    if (isInbox()) {
      zeigeHandleZweifel();
      zeigeUmzug();
      zeigeOhneTask();
      zeigeOhneUnterhaltung();
    }

    if (!fEntries.length && !ohneHandle().length) {
      bodyEl.appendChild(el('p', 'igfu-empty', 'Noch nichts markiert. Fahr mit der Maus über eine Unterhaltung und klick auf „Follow-up".'));
      return;
    }

    if (fEntries.length) {
      bodyEl.appendChild(el('h3', 'igfu-section-title', 'Follow-ups'));
      const ul = el('ol', 'igfu-list');
      for (const [tid, f] of fEntries) {
        const li = el('li', 'igfu-item');

        const top = el('div', 'igfu-item-top');
        top.appendChild(button('igfu-name', f.title, () => reveal(tid), 'In der Liste anzeigen'));
        const info = dueInfo(f.due);
        top.appendChild(el('span', 'igfu-due ' + info.cls, info.text));
        li.appendChild(top);

        const row = el('div', 'igfu-item-row');
        const dateLabel = el('label', 'igfu-date');
        dateLabel.appendChild(el('span', '', 'Wiedervorlage'));
        const date = el('input');
        date.type = 'date';
        date.value = f.due || '';
        date.addEventListener('change', () => {
          if (!follow[tid]) return;
          follow[tid].due = date.value;
          saveFollow();
          vormerken({ art: 'due', tid, titel: follow[tid].title, wert: date.value });
          renderPanel(); updateLauncher();
        });
        dateLabel.appendChild(date);
        row.append(
          dateLabel,
          button('igfu-link', 'Anzeigen', () => reveal(tid)),
          button('igfu-done', 'Erledigt', () => toggle('followup', tid)),
        );
        li.appendChild(row);

        const note = el('textarea', 'igfu-note');
        note.rows = 2;
        note.placeholder = 'Notiz, z. B. Rate, Absprachen, nächster Schritt';
        note.value = f.note || '';
        let t;
        note.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(() => { if (follow[tid]) { follow[tid].note = note.value; saveFollow(); } }, 300);
        });
        // Erst beim Verlassen des Feldes als Kommentar nach ClickUp, nicht bei jedem Tastendruck
        note.addEventListener('blur', () => {
          const text = note.value.trim();
          if (text && text !== (note.dataset.gesendet || '')) {
            note.dataset.gesendet = text;
            vormerken({ art: 'notiz', tid, titel: follow[tid] && follow[tid].title, wert: text });
          }
        });
        li.appendChild(note);

        li.appendChild(el('div', 'igfu-meta', 'Markiert am ' + new Date(f.flaggedAt).toLocaleDateString('de-DE')));
        ul.appendChild(li);
      }
      bodyEl.appendChild(ul);
    }
  }

  function toast(msg) {
    if (!toastEl) { console.warn('[Markierungen]', msg); return; }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('show'), 4000);
  }

  // ---------- Unterhaltung in der Liste finden ----------
  // Metas Liste ist virtualisiert: Nur die sichtbaren Zeilen existieren im
  // Seitencode. Gesucht wird deshalb von oben nach unten in Schritten.

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findRow(tid) {
    for (const [row, t] of threadRows()) if (t.threadID === tid) return row;
    return null;
  }

  function listScroller() {
    const first = threadRows()[0];
    let e = first && first[0];
    let ersatz = null;
    while (e && e !== document.body) {
      const oy = getComputedStyle(e).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        // Bevorzugt der Bereich, der tatsaechlich scrollt. Sonst liefert die
        // Suche einen Container, in dem sich nichts bewegt.
        if (e.scrollHeight > e.clientHeight + 40) return e;
        if (!ersatz) ersatz = e;
      }
      e = e.parentElement;
    }
    return ersatz;
  }

  // Scrollen per Code + Scroll-Ereignis, damit Metas Liste sicher nachrendert
  function setScrollTop(sc, v) {
    sc.scrollTop = v;
    sc.dispatchEvent(new Event('scroll'));
  }

  function highlight(row) {
    if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.removeAttribute('data-igfu-flash');
    void row.offsetWidth;
    row.setAttribute('data-igfu-flash', '');
    setTimeout(() => row.removeAttribute('data-igfu-flash'), 2000);
  }

  // Klickt die Zeile so an, dass Meta die Unterhaltung oeffnet. Der eigene
  // Klickabfang greift nicht, weil die Zeile selbst kein Knopf ist.
  function zeileOeffnen(row) {
    highlight(row);
    const ziel = row.querySelector('[role="button"], a') || row;
    for (const art of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      ziel.dispatchEvent(new MouseEvent(art, { bubbles: true, cancelable: true, view: window }));
    }
  }

  let revealing = false;
  async function reveal(tid, oeffnen) {
    if (revealing) return;
    revealing = true;
    const fertig = (row) => (oeffnen ? zeileOeffnen(row) : highlight(row));
    try {
      let row = findRow(tid);
      if (row) return fertig(row);
      const sc = listScroller();
      if (!sc) return toast('Die Unterhaltungsliste wurde nicht gefunden.');
      toast('Suche in der Liste …');
      setScrollTop(sc, 0);
      await sleep(450);
      let stuck = 0;
      for (let i = 0; i < 200; i++) {
        row = findRow(tid);
        if (row) { toastEl.classList.remove('show'); return fertig(row); }
        const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
        if (atBottom) {
          // Am Ende warten, ob Meta ältere Unterhaltungen nachlädt
          const before = sc.scrollHeight;
          await sleep(1000);
          if (sc.scrollHeight === before && ++stuck >= 2) break;
          if (sc.scrollHeight !== before) stuck = 0;
        }
        setScrollTop(sc, sc.scrollTop + Math.max(200, sc.clientHeight * 0.7));
        await sleep(350);
      }
      toast('Nicht in dieser Liste gefunden. Öffne den Ordner, in dem die Unterhaltung liegt, und versuch es erneut.');
    } finally {
      revealing = false;
    }
  }

  // ---------- Rücksprung aus ClickUp ----------
  // Die Tasks tragen eine Adresse mit #igfu=<threadID>. Ohne Auswertung landet
  // man nur im Postfach, ohne dass sich etwas oeffnet. Genau das war bisher so.

  const hashThread = () => (String(location.hash || '').match(HASH_MUSTER) || [])[1] || '';

  // Solange die Seite hochfaehrt, weiter nach dem Fragment schauen, falls es
  // beim Start noch nicht da war.
  const hashWaechter = setInterval(() => {
    const t = hashThread();
    if (t) gemerkterThread = t;
  }, 100);
  setTimeout(() => clearInterval(hashWaechter), 15000);

  // Die Liste steht erst nach einigen Sekunden. Vorher zu suchen bringt nur die
  // Meldung, dass sie nicht gefunden wurde.
  async function warteAufListe(maxMs) {
    const bis = Date.now() + maxMs;
    while (Date.now() < bis) {
      // Auf die Zeilen warten reicht. Ein Scrollbereich wird nur gebraucht,
      // wenn die gesuchte Zeile nicht ohnehin schon dasteht.
      if (threadRows().length) return true;
      await sleep(300);
    }
    return false;
  }

  let hashErledigt = '';
  async function hashOeffnen() {
    if (!isInbox()) return;
    const tid = hashThread() || gemerkterThread;
    if (!tid || tid === hashErledigt) return;
    hashErledigt = tid;
    gemerkterThread = '';
    toast('Öffne die Unterhaltung aus ClickUp …');
    if (!(await warteAufListe(25000))) {
      toast('Die Unterhaltungsliste lädt ungewöhnlich lange. Bitte nochmal auf den Link klicken.');
      return;
    }
    await reveal(tid, true);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* egal */ }
  }

  window.addEventListener('hashchange', () => { hashErledigt = ''; gemerkterThread = hashThread(); hashOeffnen(); });

  // Geht die ganze Liste von oben nach unten durch, damit jede Zeile einmal
  // gesehen wird. Nur dabei erfaehrt das Skript neue Zeitstempel, Handles und
  // Unterhaltungen, denn Meta haelt immer nur die sichtbaren Zeilen im Seitencode.
  // Der normale Lauf holt nur nach, was seit dem letzten Mal passiert ist.
  // Er filtert bewusst NICHT nach ungelesen: was Josia selbst geschrieben hat,
  // ist gelesen und wuerde sonst durchrutschen. Stattdessen zaehlt die
  // Aktualitaet. Metas Liste ist streng nach Zeitstempel absteigend sortiert
  // (am 30.09.2026 in der Seite nachgemessen), und jede Aktivitaet schiebt eine
  // Unterhaltung nach oben, egal in welche Richtung. Auch eine Antwort vom
  // Handy taucht also oben wieder auf.
  //
  // vollstaendig = true geht die komplette Liste durch. Das braucht es beim
  // ersten Mal, nach laengerer Abwesenheit und zum Reparieren.
  let laeuftDurchlauf = false;
  let abbruchGewuenscht = false;
  // Der volle Durchlauf hatte kein Ende: auf instagram.com liegen tausende
  // private Unterhaltungen, die mit dem CRM nichts zu tun haben, und er ging
  // sie alle durch. Zwei Schranken beenden ihn jetzt.
  //
  // Die wichtigere ist der Leerlauf: Kommen am Stueck so viele Unterhaltungen,
  // die zu keinem Task gehoeren, ist die Liste erschoepft — alles Weitere ist
  // Privates. Die Zahl ist bewusst grosszuegig, damit eine laengere Strecke
  // Fremder zwischen zwei Affiliates den Lauf nicht abwuergt.
  const DURCHLAUF_LEERLAUF = 150;
  const DURCHLAUF_MAX = 2000;

  async function allesAktualisieren(vollstaendig) {
    // Ein zweiter Klick waehrend des Laufs bricht ab, statt nichts zu tun.
    // Bei tausenden Unterhaltungen ist das der Unterschied zwischen „warten"
    // und „ausgeliefert sein".
    if (laeuftDurchlauf) { abbruchGewuenscht = true; toast('Durchlauf wird abgebrochen …'); return; }
    abbruchGewuenscht = false;
    // Fehlt die Liste, wird nur das Durchgehen uebersprungen. Die Uebertragung
    // nach ClickUp, UpPromote und die Inhalte haengen nicht daran und liefen
    // sonst bei jedem Umbau durch Meta stillschweigend gar nicht mehr.
    const sc = listScroller();

    const letzterLauf = Number(GM_getValue(LETZTER_LAUF, 0)) || 0;
    // Ohne vorherigen Lauf fehlt die Grenze, dann bleibt nur der volle Weg.
    const voll = !!vollstaendig || !letzterLauf;
    // Ein Tag Puffer, falls zwischen zwei Laeufen etwas knapp hineinrutscht
    // oder die Uhren auseinanderlaufen.
    const grenze = voll ? 0 : letzterLauf - 86400000;

    laeuftDurchlauf = true;
    const merke = refreshBtn ? refreshBtn.textContent : '';
    // Nicht sperren: der Knopf ist waehrend des Laufs der Abbrechen-Knopf.
    const zeigen = (text) => { if (refreshBtn) refreshBtn.textContent = text + ' — abbrechen'; };
    const gesehen = new Set();
    // Erst nach drei Runden in Folge, die ausschliesslich Aelteres gebracht
    // haben, ist Schluss. Eine einzelne Zeile, die beim Nachrendern aus der
    // Reihe taenzelt, beendet den Lauf damit nicht. Gezaehlt werden nur Runden
    // mit neuen Funden, sonst wuerde blosses Warten den Lauf abwuergen.
    let hinterGrenze = 0;
    let leerlauf = 0;
    let grund = '';
    const erfassen = () => {
      let neu = 0, aktuelle = 0;
      for (const [, t] of threadRows()) {
        if (gesehen.has(t.threadID)) continue;
        gesehen.add(t.threadID);
        neu++;
        if (!t.timestamp || t.timestamp >= grenze) aktuelle++;
        // Gehoert die Unterhaltung zu einem Task, faengt der Leerlauf von vorn
        // an. Sonst zaehlt er hoch.
        if (cuTasks[t.threadID]) leerlauf = 0; else leerlauf += 1;
      }
      if (abbruchGewuenscht) { grund = 'abgebrochen'; return true; }
      if (voll && gesehen.size >= DURCHLAUF_MAX) { grund = 'Obergrenze erreicht'; return true; }
      if (voll && leerlauf >= DURCHLAUF_LEERLAUF) {
        grund = leerlauf + ' Unterhaltungen am Stück ohne Task';
        return true;
      }
      if (voll || !neu) return false;
      if (aktuelle) { hinterGrenze = 0; return false; }
      return ++hinterGrenze >= 3;
    };

    try {
      if (!sc) {
        toast('Die Unterhaltungsliste wurde nicht gefunden, ich übertrage nur den Rest.');
      } else {
        setScrollTop(sc, 0);
        await sleep(700);
        let ohneZuwachs = 0;
        for (let i = 0; i < 400; i++) {
          scanRows();
          if (erfassen()) break;
          zeigen(gesehen.size + ' geprüft');
          const vorher = gesehen.size;
          const obenVorher = sc.scrollTop;
          setScrollTop(sc, sc.scrollTop + Math.max(200, Math.round(sc.clientHeight * 0.6)));
          // Metas Liste laedt teilweise erst auf ein echtes Rad-Ereignis nach
          sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
          await sleep(500);
          const amEnde = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 6;
          if (amEnde || sc.scrollTop === obenVorher) {
            await sleep(1600);
            scanRows();
            if (erfassen()) break;
          }
          if (gesehen.size === vorher) { if (++ohneZuwachs >= 10) break; } else ohneZuwachs = 0;
        }
        setScrollTop(sc, 0);
        await sleep(400);
        scanRows();
      }

      zeigen('überträgt …');
      await abarbeiten();
      const offen = warteschlange().length;
      if (sc) {
        // Festhalten, was der Lauf gesehen hat. Erst diese Zahlen sagen, ob die
        // Liste durchgescrollt wurde und wie viele Unterhaltungen einen Task
        // haben — die Zeilen im Dokument sagen das nicht.
        const ids = [...gesehen];
        const bilanz = {
          stand: Date.now(),
          voll: !!voll,
          gesehen: ids.length,
          mitTask: ids.filter((id) => cuTasks[id]).length,
          mitHandle: ids.filter((id) => (handleVon(id) || {}).handle).length,
        };
        GM_setValue(LETZTER_DURCHLAUF, bilanz);
        toast(gesehen.size + (voll ? ' Unterhaltungen durchgesehen' : ' Unterhaltungen seit dem letzten Lauf')
          + ', davon ' + bilanz.mitTask + ' mit Task und ' + bilanz.mitHandle + ' mit bekanntem Handle'
          + (grund ? ' (Schluss: ' + grund + ')' : '')
          + (offen ? '. ' + offen + ' Änderung(en) gehen noch raus.' : '. Alles auf Stand.'));
        // Der Stand gilt erst als aktuell, wenn die Liste auch wirklich
        // durchgegangen wurde. Sonst ueberspringt der naechste Lauf alles,
        // was in der Zwischenzeit passiert ist.
        GM_setValue(LETZTER_LAUF, Date.now());
      }

      // UpPromote haengt mit dran, damit bestaetigte Affiliates ohne zweiten
      // Knopfdruck auf „ongeboardet" kommen. Ohne Schluessel still uebergehen.
      if (upToken() && cuEingerichtet()) {
        zeigen('UpPromote …');
        await upAbgleichen();
      }
      zeigen('Inhalte …');
      const mitContent = await inhalteAnwenden();
      if (mitContent) toast(mitContent + ' auf „' + CU_STATUS_CONTENT + '" gesetzt.');

      zeigen('Handles …');
      const luecken = await handleLuecken();
      if (luecken.fehlt) {
        toast(luecken.fehlt + ' Task(s) ohne Handle — in ClickUp mit „'
          + CU_TAG_OHNE_HANDLE + '" markiert. Ohne Handle greift keine Automatik.');
      }
    } finally {
      laeuftDurchlauf = false;
      if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = merke || 'Aktualisieren'; }
      updateLauncher();
    }
  }

  // Zähler rechtsbündig unter die Unterhaltungsliste setzen, Übersicht darüber
  function positionUI() {
    if (!launcher || launcher.hidden) return;
    const sc = listScroller();
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (!r.width) return;
    const bottom = Math.max(8, window.innerHeight - r.bottom + 12);
    launcher.style.left = Math.round(Math.max(r.left + 8, r.right - launcher.offsetWidth - 20)) + 'px';
    launcher.style.bottom = bottom + 'px';
    if (refreshBtn) {
      refreshBtn.style.left = Math.round(r.left + 8) + 'px';
      refreshBtn.style.bottom = bottom + 'px';
    }
    // Der Filter sitzt ueber dem Aktualisieren-Knopf, damit er die Liste nicht
    // weiter verdeckt als noetig.
    if (filterBtn) {
      filterStand();
      filterBtn.style.left = Math.round(r.left + 8) + 'px';
      filterBtn.style.bottom = (bottom + 40) + 'px';
    }
    panel.style.left = Math.round(r.left + 8) + 'px';
    panel.style.width = Math.round(Math.min(360, r.width - 16)) + 'px';
    panel.style.bottom = (bottom + 42) + 'px';
    toastEl.style.left = Math.round(r.left + 8) + 'px';
    toastEl.style.bottom = (bottom + 42) + 'px';
  }
  window.addEventListener('resize', () => positionUI());

  // ---------- Sichern und Laden ----------

  function exportData() {
    // Version 3 kennt nur noch Follow-ups. Aeltere Dateien tragen zusaetzlich
    // „unread"; das Feld wird beim Laden stillschweigend uebergangen.
    const data = { version: 3, followups: follow };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'postfach-markierungen-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importData(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Format');
        // Version 2 und 3 tragen die Follow-ups unter „followups", ganz alte
        // Dateien sind selbst die Liste. „unread" aus Version 2 wird
        // uebergangen — die Markierung gibt es seit 6.1 nicht mehr.
        const f = data.version >= 2 ? (data.followups || {}) : data;
        let n = 0;
        for (const [tid, v] of Object.entries(f)) {
          if (!v || typeof v !== 'object') continue;
          follow[tid] = {
            title: String(v.title || 'Unbekannt'),
            flaggedAt: Number(v.flaggedAt) || Date.now(),
            due: /^\d{4}-\d{2}-\d{2}$/.test(v.due || '') ? v.due : '',
            note: String(v.note || ''),
            inCu: v.inCu === true,
          };
          n++;
        }
        saveFollow(); scanRows(); renderPanel(); updateLauncher();
        toast(n + ' Markierungen geladen.');
      } catch (e) {
        toast('Die Datei konnte nicht gelesen werden. Wähle eine mit „Sichern" erstellte Datei.');
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  // ---------- Aktiv nur im Postfach ----------

  let wasInbox = null;
  function syncActive() {
    const now = isInbox();
    if (now === wasInbox) { if (isMarkt()) { stilEinspielen(); scanMarkt(); scanInhalte(); } return; }
    wasInbox = now;
    if (now) {
      buildUI(); launcher.hidden = false; refreshBtn.hidden = false; updateLauncher(); scanRows();
      cuAktualisieren(true);
      abarbeiten();
      hashOeffnen();
      setTimeout(() => {
        // Läuft noch eine zweite Version dieses Skripts (z. B. die alte 1.0)?
        if (document.querySelectorAll('#igfu-launch').length > 1) {
          console.warn('[Markierungen] Mehrere Versionen des Skripts aktiv.');
          toast('Es laufen zwei Versionen dieses Skripts. Lösche in Tampermonkey die ältere, sonst überlagern sich die Knöpfe.');
        }
        if (isInbox() && !threadRows().length && document.querySelectorAll('div[role="presentation"]').length > 5) {
          console.warn('[Markierungen] Die Unterhaltungsliste konnte nicht gelesen werden.');
          toast('Markierungen: Die Unterhaltungsliste lässt sich nicht lesen. Vermutlich hat Meta die Seite umgebaut, dann muss das Skript angepasst werden.');
        }
      }, 8000);
    } else if (launcher) {
      launcher.hidden = true;
      if (refreshBtn) refreshBtn.hidden = true;
      if (tippEl) tippEl.classList.remove('show');
      closePanel();
    }
    if (isMarkt()) { stilEinspielen(); cuAktualisieren(false); scanMarkt(); scanInhalte(); }
  }


  // ======================= Standardnachrichten =========================
  //
  // Gespeicherte Antworten, abgelegt in einer eigenen ClickUp-Liste — ein
  // Task je Vorlage, Name = Titel, Beschreibung = Text.
  //
  // Warum ClickUp und nicht der lokale Speicher: Josia arbeitet an zwei
  // Rechnern, Cosima an einem dritten, und alle brauchen dieselben Texte. Der
  // GM-Speicher liegt pro Browser *und* pro Skript. ClickUp haben ohnehin
  // alle, die Berechtigungen stimmen damit von allein, und Vorlagen lassen
  // sich dort auch ohne das Skript bearbeiten.
  //
  // Die Liste wird am Namen gefunden, nicht ueber eine eingetragene Kennung.
  // Sonst muesste sie jeder auf jedem Rechner nachtragen, und genau solche
  // Einrichtungsschritte gehen schief — siehe der Tag „undefined", ueber den
  // der zweite Arbeitsplatz gestolpert ist.

  const VORLAGEN_LISTE = 'Standardnachrichten';
  const VL_LISTE_ID = 'clickup:vorlagen-liste:v1';
  const VL_CACHE = 'clickup:vorlagen:v1';
  const CU_TEAM = 'clickup:team:v1';

  // Die Adresse einer Liste in ClickUp braucht die Workspace-Kennung:
  //   https://app.clickup.com/<workspace>/v/l/li/<liste>
  // Ohne sie antwortet ClickUp mit 404. Die Kennung wird hier zur Laufzeit
  // geholt und gemerkt — fest eingebaut hat sie im oeffentlichen Repo nichts
  // zu suchen.
  async function cuWorkspace() {
    const gemerkt = String(GM_getValue(CU_TEAM, '') || '');
    if (gemerkt) return gemerkt;
    const daten = await cuRequest('GET', '/team');
    const id = ((daten.teams || [])[0] || {}).id;
    if (!id) throw new Error('Zu diesem Token liess sich kein Workspace ermitteln.');
    GM_setValue(CU_TEAM, String(id));
    return String(id);
  }

  // Kuerzel aus dem ClickUp-Namen: „Josia Loos" wird zu „JL". Bei einem
  // einzelnen Wort die ersten zwei Zeichen. Steht statt eines Namens eine
  // Mailadresse da, zaehlt nur der Teil davor — aus „josia@…" wird sonst „JP".
  function initialen(name) {
    const roh = String(name || '').trim();
    if (!roh) return '';
    const basis = roh.includes('@') ? roh.split('@')[0] : roh;
    const teile = basis.split(/[\s._-]+/).filter(Boolean);
    if (!teile.length) return '';
    if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
    return (teile[0][0] + teile[1][0]).toUpperCase();
  }

  const vorlagenAusCache = () => {
    const roh = GM_getValue(VL_CACHE, []);
    return Array.isArray(roh) ? roh : [];
  };

  // Wer hat Vorlagen angelegt? Einmal je Person, mit Anzahl fuer den Hinweis
  // am Knopf. Vorlagen ohne Urheber — ClickUp liefert ihn nicht immer —
  // tauchen hier nicht auf und bleiben darum nur unter „Alle" sichtbar.
  function vlUrheber(liste) {
    const nach = new Map();
    for (const v of liste) {
      if (!v.wer) continue;
      if (!nach.has(v.wer)) {
        nach.set(v.wer, { wer: v.wer, kuerzel: v.kuerzel || initialen(v.wer), anzahl: 0 });
      }
      nach.get(v.wer).anzahl += 1;
    }
    return [...nach.values()].sort((a, b) => a.wer.localeCompare(b.wer, 'de'));
  }

  // Die Vorschauzeile ist einzeilig. Steht in der Vorlage eine Anrede auf
  // eigener Zeile — bei uns fast immer „Hi," —, zeigte die erste Zeile allein
  // genau das und sonst nichts. Darum alle Umbrueche zu Leerzeichen.
  const vlVorschau = (text) => String(text || '').replace(/\s+/g, ' ').trim();

  async function vorlagenListeFinden() {
    const gemerkt = String(GM_getValue(VL_LISTE_ID, '') || '');
    if (gemerkt) return gemerkt;
    const space = cuSpace() || (await cuSpaceLaden());
    const daten = await cuRequest('GET', '/space/' + space + '/list?archived=false');
    const treffer = (daten.lists || []).find(
      (l) => String(l.name || '').trim().toLowerCase() === VORLAGEN_LISTE.toLowerCase(),
    );
    if (!treffer) {
      throw new Error('Im Space gibt es keine Liste „' + VORLAGEN_LISTE + '". '
        + 'Bitte einmal anlegen — ein Task je Vorlage, Name ist der Titel, '
        + 'die Beschreibung der Text.');
    }
    GM_setValue(VL_LISTE_ID, String(treffer.id));
    return String(treffer.id);
  }

  // Geschlossene Tasks gelten als stillgelegt und erscheinen nicht im Postfach.
  async function vorlagenLaden() {
    const liste = await vorlagenListeFinden();
    const daten = await cuRequest('GET', '/list/' + liste + '/task?include_closed=false&subtasks=false');
    const vorlagen = (daten.tasks || []).map((t) => {
      // ClickUp liefert den Urheber als creator. Fehlt er, bleibt das Kuerzel
      // leer — dann steht eben keines da, statt dass etwas Falsches steht.
      const wer = String((t.creator && (t.creator.username || t.creator.email)) || '').trim();
      return {
        id: String(t.id),
        titel: String(t.name || '').trim(),
        text: String(t.text_content || t.description || ''),
        wer,
        kuerzel: initialen(wer),
      };
    }).filter((v) => v.titel || v.text.trim());
    GM_setValue(VL_CACHE, vorlagen);
    return vorlagen;
  }

  async function vorlageAnlegen(titel, text) {
    const liste = await vorlagenListeFinden();
    await cuRequest('POST', '/list/' + liste + '/task', { name: titel, description: text });
    return vorlagenLaden();
  }

  async function vorlageAendern(id, titel, text) {
    await cuRequest('PUT', '/task/' + id, { name: titel, description: text });
    return vorlagenLaden();
  }

  // Stilllegen statt loeschen: In ClickUp bleibt der Text auffindbar, falls
  // sich jemand vertut. Dieselbe Haltung wie bei den Karteileichen.
  async function vorlageStilllegen(id) {
    await cuRequest('PUT', '/task/' + id, { status: 'closed' });
    return vorlagenLaden();
  }

  function vorlagenSuchen(liste, wort, wer) {
    const w = String(wort || '').trim().toLowerCase();
    let treffer = wer ? liste.filter((v) => v.wer === wer) : liste;
    if (w) treffer = treffer.filter((v) => (v.titel + ' ' + v.text).toLowerCase().includes(w));
    return treffer;
  }

  // ---- Text ins Eingabefeld ----

  const vlFeld = () => document.querySelector('div[role="textbox"][contenteditable="true"]');

  // Die Verfassen-Zeile: vom Feld nach oben, bis ein Vorfahr die Symbole
  // traegt und niedrig genug ist. Ohne die Hoehenschranke landet der Knopf im
  // ganzen Fensterbereich. Am 20.10.2026 gemessen: zwei Ebenen darueber, 44
  // Pixel hoch.
  function vlZeile() {
    let el = vlFeld();
    for (let i = 0; i < 8 && el; i++) {
      const hoch = el.getBoundingClientRect().height;
      if (el.querySelectorAll('[role="button"]').length >= 2 && hoch > 0 && hoch < 120) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Ueber ein Einfuege-Ereignis, nicht ueber execCommand('insertText').
  //
  // Instagram setzt im Nachrichtenfeld Lexical ein. Am 22.10.2026 am echten
  // Feld gemessen: insertText laesst Zeilenumbrueche weg und klebt die Zeilen
  // aneinander, insertLineBreak blockiert alles Weitere, und nur das
  // Einfuege-Ereignis erhaelt die Umbrueche.
  //
  // Lexical verarbeitet es **asynchron** — direkt danach steht im Feld noch
  // der alte Stand. Wer dort sofort nachliest, haelt den Weg faelschlich fuer
  // kaputt; genau darauf bin ich beim Messen hereingefallen.
  function vlEinsetzen(text) {
    const feld = vlFeld();
    if (!feld) return false;
    feld.focus();
    const sel = window.getSelection();
    if (sel && !feld.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(feld);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ereignis = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      if (!feld.dispatchEvent(ereignis)) return true;
    } catch { /* ohne DataTransfer eben der Rueckfall */ }
    return document.execCommand('insertText', false, text);
  }

  // ---- Oberflaeche ----

  let vlOffen = null;

  function vlSchliessen() {
    if (vlOffen) { vlOffen.remove(); vlOffen = null; }
    document.removeEventListener('keydown', vlEscape, true);
    document.removeEventListener('mousedown', vlDaneben, true);
  }
  function vlEscape(e) { if (e.key === 'Escape') { e.stopPropagation(); vlSchliessen(); } }
  function vlDaneben(e) {
    if (vlOffen && !vlOffen.contains(e.target) && !e.target.closest('.igfu-vl-knopf')) vlSchliessen();
  }

  // Der Urheber-Filter gilt nur, solange das Panel offen ist. Beim naechsten
  // Oeffnen stehen wieder alle Vorlagen da: ein Filter, der still
  // weiterwirkt, laesst einen Text vermissen, den es sehr wohl gibt.
  let vlWer = '';

  function vlOeffnen(anker) {
    if (vlOffen) { vlSchliessen(); return; }
    const panel = el('div', 'igfu-vl-panel');
    vlOffen = panel;
    vlWer = '';
    vlListe(panel, '');
    document.body.appendChild(panel);
    const r = anker.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 396)) + 'px';
    panel.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    document.addEventListener('keydown', vlEscape, true);
    document.addEventListener('mousedown', vlDaneben, true);
    const suche = panel.querySelector('.igfu-vl-suche');
    if (suche) suche.focus();
    // Im Hintergrund frisch holen. Das Panel steht sofort aus dem Zwischen-
    // speicher, damit es sich nicht traege anfuehlt.
    vorlagenLaden()
      .then(() => { if (vlOffen === panel) vlListe(panel, suche ? suche.value : ''); })
      .catch((e) => toast('Vorlagen: ' + e.message));
  }

  function vlListe(panel, filter) {
    panel.textContent = '';
    const kopf = el('div', 'igfu-vl-kopf');
    const suche = el('input', 'igfu-vl-suche');
    suche.type = 'search';
    suche.placeholder = 'Vorlagen durchsuchen';
    suche.value = filter || '';
    suche.addEventListener('input', () => {
      const pos = suche.selectionStart;
      vlListe(panel, suche.value);
      const neu = panel.querySelector('.igfu-vl-suche');
      if (neu) { neu.focus(); try { neu.setSelectionRange(pos, pos); } catch { /* egal */ } }
    });
    const neuKnopf = el('button', 'igfu-done', 'Neu');
    neuKnopf.addEventListener('click', () => vlForm(panel, null));
    kopf.append(suche, neuKnopf);

    const liste = el('div', 'igfu-vl-liste');
    const alle = vorlagenAusCache();
    const urheber = vlUrheber(alle);
    // Ist die gefilterte Person weg - nachgeladen, umbenannt, Vorlage
    // stillgelegt -, zeigt das Panel wieder alles statt einer leeren Liste.
    if (vlWer && !urheber.some((u) => u.wer === vlWer)) vlWer = '';

    // Bei nur einem Urheber waere die Leiste eine Zeile, die nichts auswaehlt.
    const leiste = urheber.length > 1 ? el('div', 'igfu-vl-leiste') : null;
    if (leiste) {
      const knopf = (text, wert, hinweis) => button(
        'igfu-vl-wer' + (vlWer === wert ? ' igfu-vl-wer-an' : ''), text,
        () => { vlWer = wert; vlListe(panel, filter); }, hinweis,
      );
      leiste.appendChild(knopf('Alle', '', 'Vorlagen von allen anzeigen'));
      for (const u of urheber) {
        leiste.appendChild(knopf(
          u.kuerzel || u.wer, u.wer,
          u.wer + ' - ' + u.anzahl + (u.anzahl === 1 ? ' Vorlage' : ' Vorlagen'),
        ));
      }
    }

    const treffer = vorlagenSuchen(alle, filter, vlWer);
    if (!treffer.length) {
      liste.appendChild(el('p', 'igfu-empty', alle.length
        ? 'Nichts gefunden.' + (vlWer ? ' Der Urheber-Filter steht auf ' + vlWer + '.' : '')
        : 'Noch keine Vorlage. Mit „Neu" die erste anlegen — sie landet in der '
          + 'ClickUp-Liste „' + VORLAGEN_LISTE + '" und steht damit allen zur Verfügung.'));
    }
    for (const v of treffer) {
      const zeile = el('div', 'igfu-vl-eintrag');
      const mitte = el('div', 'igfu-vl-text');
      const kopfzeile = el('div', 'igfu-vl-titel', v.titel || '(ohne Titel)');
      if (v.kuerzel) {
        const k = el('span', 'igfu-vl-kuerzel', v.kuerzel);
        k.title = 'Angelegt von ' + v.wer;
        kopfzeile.appendChild(k);
      }
      mitte.append(kopfzeile, el('div', 'igfu-vl-vorschau', vlVorschau(v.text)));
      mitte.addEventListener('click', () => { vlSchliessen(); vlEinsetzen(v.text); });
      const bearbeiten = el('button', 'igfu-link', 'Bearbeiten');
      bearbeiten.addEventListener('click', (e) => { e.stopPropagation(); vlForm(panel, v); });
      zeile.append(mitte, bearbeiten);
      liste.appendChild(zeile);
    }

    const fuss = el('div', 'igfu-vl-fuss');
    fuss.append(
      button('igfu-link', 'In ClickUp öffnen', async () => {
        try {
          const id = await vorlagenListeFinden();
          const ws = await cuWorkspace();
          window.open('https://app.clickup.com/' + ws + '/v/l/li/' + id, '_blank', 'noopener');
        } catch (e) { toast('Vorlagen: ' + e.message); }
      }, 'Dort lassen sich die Vorlagen genauso bearbeiten'),
    );
    panel.append(kopf);
    if (leiste) panel.appendChild(leiste);
    panel.append(liste, fuss);
  }

  function vlForm(panel, vorhanden) {
    panel.textContent = '';
    const form = el('div', 'igfu-vl-form');
    const titel = el('input', 'igfu-vl-feld');
    titel.placeholder = 'Kurzer Titel, z. B. „Ad-Codes erklären"';
    titel.value = vorhanden ? vorhanden.titel : '';
    const text = el('textarea', 'igfu-vl-feld igfu-vl-gross');
    text.placeholder = 'Der Nachrichtentext …';
    text.value = vorhanden ? vorhanden.text : '';
    form.append(titel, text);

    const fuss = el('div', 'igfu-vl-fuss');
    const sichern = el('button', 'igfu-done', 'Sichern');
    sichern.addEventListener('click', async () => {
      const t = titel.value.trim();
      const inhalt = text.value;
      if (!t && !inhalt.trim()) { vlListe(panel, ''); return; }
      const name = t || inhalt.trim().split('\n')[0].slice(0, 40);
      sichern.disabled = true;
      try {
        if (vorhanden) await vorlageAendern(vorhanden.id, name, inhalt);
        else await vorlageAnlegen(name, inhalt);
        toast('Vorlage gesichert.');
        vlListe(panel, '');
      } catch (e) {
        sichern.disabled = false;
        toast('Vorlagen: ' + e.message);
      }
    });
    const zurueck = el('button', 'igfu-link', 'Zurück');
    zurueck.addEventListener('click', () => vlListe(panel, ''));
    fuss.append(sichern, zurueck);

    if (vorhanden) {
      const weg = el('button', 'igfu-link', 'Stilllegen');
      let sicher = false;
      weg.addEventListener('click', async () => {
        if (!sicher) { sicher = true; weg.textContent = 'Wirklich stilllegen?'; return; }
        try { await vorlageStilllegen(vorhanden.id); toast('Stillgelegt.'); vlListe(panel, ''); }
        catch (e) { toast('Vorlagen: ' + e.message); }
      });
      fuss.appendChild(weg);
    }
    panel.append(form, fuss);
    titel.focus();
  }

  // Instagram baut die Verfassen-Zeile bei jedem Gespraechswechsel neu auf,
  // deshalb regelmaessig nachsetzen statt einmalig beim Laden.
  // ---------- Die geoeffnete Unterhaltung ----------

  const igOffenerThread = () =>
    (/^\/direct\/t\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname) || [])[1] || '';

  // Die Ueberschrift mit dem Namen des Gegenuebers im Kopf der Unterhaltung.
  //
  // Am 23.10.2026 an der echten Seite gemessen: es gibt drei `h2`. Das eigene
  // Konto links in der Leiste, das Gegenueber im Kopf, und eines aus dem
  // eigenen Panel. Die beiden Stoerer lassen sich benennen — das eigene Konto
  // am gelernten Handle, das Panel an seiner Kennung. Bleibt danach nicht
  // genau eines uebrig, wird nichts eingehaengt: lieber keine Leiste als eine
  // an der falschen Stelle. Dieselbe Haltung wie bei igOffeneUnterhaltung.
  const KOPF_FREMD = '#igfu-panel, #igfu-frage, .igfu-vl-panel, .igfu-ko, .igfu-kopf';

  // Der Kopf ist anklickbar: bei normalen DMs ein a[role="link"] auf das
  // Profil, in Partner-Unterhaltungen ein div[role="button"], das die
  // Profilkarte aufklappt. In beiden Faellen sitzt es vier Ebenen ueber der
  // Ueberschrift — am 28.10.2026 in beiden Postfaechern nachgemessen.
  //
  // Daran haengt die Unterscheidung. Keine Pixel: im Pruefstand hat jedes
  // Element die Groesse null, eine Regel aus gemessenen Abstaenden waere dort
  // nicht pruefbar.
  const KOPF_BEDIENBAR = 'a[href], a[role="link"], [role="button"], [role="link"]';
  function kopfAnker(h2) {
    let n = h2.parentElement;
    for (let i = 0; i < 4 && n; i++) {
      if (n.matches(KOPF_BEDIENBAR)) return n;
      n = n.parentElement;
    }
    return null;
  }

  function kopfUeberschrift() {
    const selbst = eigenerHandle();
    const treffer = [];
    for (const h of document.querySelectorAll('h2')) {
      if (h.closest(KOPF_FREMD)) continue;
      const t = String(h.textContent || '').trim();
      if (!t) continue;
      if (selbst && t.toLowerCase() === selbst.toLowerCase()) continue;
      treffer.push(h);
    }
    // In Partner-Unterhaltungen steht der Name ein zweites Mal im Verlauf, auf
    // der Profilkarte ganz oben. Bis 8.7 blieben damit zwei Kandidaten uebrig,
    // die Regel „genau einer, sonst gar nichts" griff — und die Kopfleiste
    // fehlte in *jeder* Partner-Unterhaltung. Am 28.10.2026 an bellaa_sophie
    // gefunden. Die Karte im Verlauf traegt kein bedienbares Element ueber
    // sich, der Kopf schon.
    const amKopf = treffer.filter(kopfAnker);
    if (amKopf.length === 1) return amKopf[0];
    // Bleiben mehrere mit demselben Text, meinen sie dieselbe Person — dann
    // ist die Wahl ungefaehrlich. Bei verschiedenen Namen lieber nichts:
    // genau davor schuetzt die Regel.
    const wahl = amKopf.length ? amKopf : treffer;
    const text = wahl.length ? String(wahl[0].textContent || '').trim() : '';
    if (wahl.length > 1 && !wahl.every((h) => String(h.textContent || '').trim() === text)) return null;
    return wahl[0] || null;
  }

  // Der Block, neben den die Leiste gehoert.
  //
  // Am 23.10.2026 gemessen: Bild, Name und Handle stecken gemeinsam in einem
  // a[role="link"] auf das Profil des Gegenuebers; der Kopfbalken darueber ist
  // fast fensterbreit. Also an diesem Link festmachen — und nicht an
  // Pixelbreiten. Eine Schranke aus gemessenen Breiten liesse sich im
  // Pruefstand gar nicht pruefen, weil jsdom jedem Element die Groesse null
  // gibt; genau diese Sorte ungepruefter Annahme hat hier schon zweimal
  // Schaden angerichtet.
  //
  // In Partner-Unterhaltungen ist das Gegenueber nicht immer verlinkt. Dann
  // bleibt der Block direkt ueber der Ueberschrift.
  // Der Block, neben den die Leiste gehoert: das bedienbare Element im Kopf,
  // sonst der naechste Vorfahr.
  const kopfBlock = (h2) => kopfAnker(h2) || h2.parentElement || h2;

  // Die Gegenstelle derselben Person im jeweils anderen Postfach.
  //
  // Beide Postfaecher liegen auf instagram.com und oeffnen unter derselben
  // Adressform, aber eine Person hat in jedem eine *andere* Kennung. Welche
  // Kennung wohin gehoert, steht in postfaecher() — gefuellt, sobald die
  // jeweilige Liste einmal offen war. Ist die Art einer der beiden Kennungen
  // unbekannt, gilt sie nicht als Treffer: ein falsches Gruen waere schlimmer
  // als ein Grau.
  function andereUnterhaltung(tid) {
    const art = postfachVon(tid);
    if (!art) return null;
    const task = cuTasks[tid];
    if (!task) return null;
    for (const fremd of task.tids || []) {
      if (fremd === tid) continue;
      const fremdArt = postfachVon(fremd);
      if (fremdArt && fremdArt !== art) return { tid: fremd, art: fremdArt };
    }
    return null;
  }

  // Ein kleines Menue unter einem Knopf. Dieselbe Mechanik fuer Status und
  // Tags — beides ist „aus einer Liste etwas auswaehlen".
  let kopfMenue = null;

  function menueSchliessen() {
    if (!kopfMenue) return;
    kopfMenue.remove();
    kopfMenue = null;
    document.removeEventListener('mousedown', menueDaneben, true);
    document.removeEventListener('keydown', menueEscape, true);
  }
  function menueDaneben(e) {
    if (kopfMenue && e.target instanceof Node && !kopfMenue.contains(e.target)) menueSchliessen();
  }
  function menueEscape(e) { if (e.key === 'Escape') { e.stopPropagation(); menueSchliessen(); } }

  function menueOeffnen(anker, eintraege) {
    const warOffen = !!kopfMenue;
    menueSchliessen();
    if (warOffen) return;
    const m = el('div', 'igfu-menue');
    for (const e of eintraege) {
      if (e.trenner) { m.appendChild(el('div', 'igfu-menue-trenner')); continue; }
      const z = button('igfu-menue-zeile', '', () => {
        if (e.aus) return;
        menueSchliessen();
        e.tun();
      }, e.hinweis || '');
      if (e.aus) z.disabled = true;
      const punkt = el('span', 'igfu-menue-punkt');
      if (e.farbe) punkt.style.background = e.farbe;
      else punkt.style.visibility = 'hidden';
      z.append(punkt, el('span', 'igfu-menue-text', e.text));
      if (e.an) z.appendChild(el('span', 'igfu-menue-haken', '\u2713'));
      m.appendChild(z);
    }
    document.body.appendChild(m);
    const r = anker.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 268)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    kopfMenue = m;
    // Erst im naechsten Takt lauschen, sonst schliesst der Klick, der das
    // Menue gerade geoeffnet hat, es sofort wieder.
    setTimeout(() => {
      if (!kopfMenue) return;
      document.addEventListener('mousedown', menueDaneben, true);
      document.addEventListener('keydown', menueEscape, true);
    }, 0);
  }

  function setzePostfachChip(chip, tid) {
    if (!chip) return;
    const art = postfachVon(tid);
    const andere = andereUnterhaltung(tid);
    chip.dataset.ziel = andere ? andere.tid : '';
    chip.classList.toggle('on', !!andere);
    chip.disabled = !andere;
    if (andere) {
      chip.textContent = andere.art === 'partner' ? 'Partner-Postfach' : 'Normales Postfach';
      chip.title = 'Dieselbe Person im anderen Postfach — öffnet einen neuen Tab';
      return;
    }
    if (!art) {
      chip.textContent = 'Postfach?';
      chip.title = 'Noch unbekannt, in welchem Postfach diese Unterhaltung liegt. '
        + 'Beide Listen einmal öffnen, dann weiß das Skript es.';
      return;
    }
    chip.textContent = art === 'partner' ? 'Nur Partner' : 'Nur normal';
    chip.title = 'Zu dieser Person ist im anderen Postfach keine Unterhaltung bekannt';
  }

  // Status aendern, von Hand. Ohne Rangpruefung — darfSetzen() bremst die
  // Automatik, nicht Josia. Siehe die Begruendung an koStatusSetzen.
  async function statusSetzen(tid, neu) {
    const task = cuTasks[tid];
    const wert = String(neu || '').toLowerCase().trim();
    if (!task || !wert || wert === String(task.status || '').toLowerCase()) return;
    try {
      await cuRequest('PUT', '/task/' + task.taskId, { status: wert });
      task.status = wert;
      const treffer = stati().find((x) => x.name === wert);
      if (treffer && treffer.farbe) task.farbe = treffer.farbe;
      cuSpeichern();
      toast('Status: ' + wert);
      scanRows();
      kopfLeisteSetzen();
      koZeichnen();
    } catch (e) {
      toast('ClickUp: ' + e.message);
    }
  }

  function statusMenue(anker, tid) {
    const task = cuTasks[tid];
    if (!task) return;
    const jetzt = String(task.status || '').toLowerCase();
    const eintraege = stati().map((st) => ({
      text: st.name, farbe: st.farbe, an: st.name === jetzt,
      tun: () => statusSetzen(tid, st.name),
    }));
    eintraege.push({ trenner: true });
    eintraege.push({
      text: 'In ClickUp öffnen',
      tun: () => { if (task.url) window.open(task.url, '_blank', 'noopener'); },
    });
    menueOeffnen(anker, eintraege);
  }

  async function tagUmschalten(tid, name, an) {
    const task = cuTasks[tid];
    if (!task) return;
    try {
      const farbe = (tagsAusCache().find((t) => t.name === name) || {}).farbe || '';
      await cuTagSetzen(task.taskId, name, farbe || YELLOW, an);
      const bisher = (task.tags || []).filter((t) => t !== name);
      task.tags = an ? bisher.concat([name]) : bisher;
      if (name === CU_TAG) task.follow = an;
      cuSpeichern();
      toast(an ? 'Tag gesetzt: ' + name : 'Tag entfernt: ' + name);
      scanRows();
      kopfLeisteSetzen();
    } catch (e) {
      toast('ClickUp: ' + e.message);
    }
  }

  function tagMenue(anker, tid) {
    const task = cuTasks[tid];
    if (!task) return;
    const dran = new Set(task.tags || []);
    const liste = tagsAusCache();
    const eintraege = liste.length
      ? liste.map((t) => ({
        text: t.name, farbe: t.farbe, an: dran.has(t.name),
        aus: !!TAGS_AUTOMATIK[t.name],
        hinweis: TAGS_AUTOMATIK[t.name] || (dran.has(t.name) ? 'Entfernen' : 'Setzen'),
        tun: () => tagUmschalten(tid, t.name, !dran.has(t.name)),
      }))
      : [{ text: 'Keine Tags im Space gefunden', aus: true, tun: () => {} }];
    menueOeffnen(anker, eintraege);
  }

  // Die Leiste neben dem Namen: Status, Tags, Follow-up, anderes Postfach. Die
  // Knöpfe sind dieselben wie an den Zeilen der Liste, samt Klick-Weiche —
  // sie hängen nur an einem anderen Ort.
  function kopfLeisteSetzen() {
    const alt = document.querySelector('.igfu-kopf');
    if (!isIG() || !cuEingerichtet()) { if (alt) alt.remove(); return; }
    const tid = igOffenerThread();
    if (!tid) { if (alt) alt.remove(); return; }
    const h2 = kopfUeberschrift();
    if (!h2) { if (alt) alt.remove(); return; }

    const block = kopfBlock(h2);
    let wrap = alt;
    if (!wrap || wrap.previousElementSibling !== block) {
      if (wrap) wrap.remove();
      wrap = el('div', 'igfu-tags igfu-kopf');
      block.insertAdjacentElement('afterend', wrap);
    }
    wrap.dataset.tid = tid;
    wrap.dataset.title = String(h2.textContent || '').trim();

    const task = cuTasks[tid];
    // Die Tags im Space einmal holen, damit das Menue sie anbieten kann.
    if (task && !tagsAusCache().length && !tagsLaeuft) {
      tagsLaeuft = true;
      tagsLaden().catch(() => {}).finally(() => { tagsLaeuft = false; });
    }

    // Neu bauen nur, wenn sich etwas geaendert hat. Sonst verschwindet ein
    // gerade geoeffnetes Menue bei jedem Takt unter den Fingern.
    const eigene = (task ? task.tags || [] : []).filter((t) => !TAGS_AUTOMATIK[t]);
    const sig = [tid, task ? task.status : '', eigene.join(','), !!follow[tid],
      postfachVon(tid), (andereUnterhaltung(tid) || {}).tid || ''].join('|');
    if (wrap.dataset.sig !== sig) {
      wrap.dataset.sig = sig;
      wrap.textContent = '';
      wrap.append(makeChip('crm', 'CRM'));
      // Die Tags, die Josia selbst vergibt — die drei vom Skript verwalteten
      // haben eigene Anzeigen und wuerden die Zeile nur fuellen.
      for (const name of eigene) {
        const pille = makeChip('tag', name);
        pille.classList.add('on');
        const farbe = (tagsAusCache().find((t) => t.name === name) || {}).farbe;
        if (farbe) { pille.style.background = farbe; pille.style.borderColor = farbe; }
        wrap.appendChild(pille);
      }
      if (task) wrap.appendChild(makeChip('tagmenue', eigene.length ? '+' : '+ Tag'));
      wrap.append(makeChip('followup', 'Follow-up'), makeChip('postfach', 'Postfach'));
    }

    setzeCrmChip(wrap.querySelector('[data-kind="crm"]'), tid);
    const crm = wrap.querySelector('[data-kind="crm"]');
    if (crm) {
      crm.title = task
        ? 'Status ändern. Ein Schritt zurück innerhalb der Pipeline hält nicht — '
          + 'den holt der nächste Abgleich wieder ein. Endstatus bleiben liegen.'
        : 'Task in ClickUp anlegen';
    }
    setChip(wrap.querySelector('[data-kind="followup"]'), !!follow[tid],
      'Follow-up entfernen', 'Als Follow-up markieren');
    setzePostfachChip(wrap.querySelector('[data-kind="postfach"]'), tid);
  }

  // Kopieren. Die Schreibrechte auf die Zwischenablage haengen an der Seite
  // und an einer echten Nutzergeste; faellt der moderne Weg aus, bleibt der
  // alte ueber ein kurzlebiges Textfeld.
  async function inZwischenablage(text) {
    const wert = String(text || '');
    if (!wert) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(wert);
        return true;
      }
    } catch { /* unten weiter */ }
    try {
      const hilf = document.createElement('textarea');
      hilf.value = wert;
      hilf.setAttribute('readonly', '');
      hilf.style.position = 'fixed';
      hilf.style.top = '-1000px';
      document.body.appendChild(hilf);
      // Erst den Fokus, dann die Auswahl: execCommand('copy') nimmt die
      // Auswahl des *fokussierten* Elements. Browser setzen den Fokus bei
      // select() meist gleich mit, verlassen sollte man sich darauf nicht.
      hilf.focus();
      hilf.select();
      const gut = document.execCommand('copy');
      hilf.remove();
      return gut;
    } catch { return false; }
  }

  // ---------- Notizen: die Kommentare aus ClickUp ----------
  //
  // Die Kommentare eines Tasks sind unsere Notizen zu einem Affiliate. Sie
  // standen bisher nur in ClickUp — also genau dort nicht, wo gearbeitet wird.
  //
  // Die Leiste hängt rechts am Fensterrand. Gibt es Notizen, steht sie offen;
  // eine Notiz, die man erst aufklappen muss, wird nicht gelesen. Gibt es
  // keine, bleibt sie zu, laesst sich aber jederzeit oeffnen, um eine zu
  // schreiben. Ohne Task gibt es sie gar nicht — so entschieden, weil eine
  // Leiste ohne Inhalt nur Platz kostet.

  let koTid = '';        // Unterhaltung, zu der der Stand gehoert
  let koTaskId = '';
  let koListe = null;    // null = noch nicht geladen
  let koOffen = false;
  let koManuell = false; // von Hand geklappt? Dann nicht mehr von selbst
  let koLaedt = false;
  let koFehler = '';
  let koSendet = false;
  let koEntwurf = '';    // angefangene Notiz, ueberlebt das Neuzeichnen
  let statiLaeuft = false;
  let tagsLaeuft = false;
  let koStand = '';      // woran erkannt wird, dass sich wirklich etwas geaendert hat

  async function koKommentareLaden(taskId) {
    const daten = await cuRequest('GET', '/task/' + taskId + '/comment');
    return (daten.comments || []).map((c) => ({
      id: String(c.id || ''),
      text: String(c.comment_text || '').trim(),
      wer: String((c.user && (c.user.username || c.user.email)) || '').trim(),
      wann: Number(c.date) || 0,
    })).filter((c) => c.text);
  }

  // ClickUp sortiert die Kommentare neueste zuerst. Gelesen wird von oben nach
  // unten, also wird umgedreht — der jüngste steht dann unten, wie in jedem
  // Nachrichtenverlauf.
  const koSortiert = (liste) => [...(liste || [])].sort((a, b) => a.wann - b.wann);

  function koZeitpunkt(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const heute = new Date();
    const gleich = d.toDateString() === heute.toDateString();
    return gleich
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
        + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function koZustandSetzen(tid) {
    koTid = tid;
    koTaskId = '';
    koListe = null;
    koOffen = false;
    koManuell = false;
    koFehler = '';
    koLaedt = false;
    koEntwurf = '';
  }

  async function koHolen(taskId) {
    if (koLaedt) return;
    koLaedt = true;
    const fuer = koTid;
    try {
      const liste = await koKommentareLaden(taskId);
      if (koTid !== fuer) return;
      koListe = liste;
      koFehler = '';
      // Der eine Moment, in dem sich die Leiste von selbst oeffnet.
      if (!koManuell && liste.length) koOffen = true;
    } catch (e) {
      if (koTid !== fuer) return;
      koListe = [];
      koFehler = e.message;
    } finally {
      koLaedt = false;
      koZeichnen();
    }
  }

  function koLeisteSetzen() {
    const vorhanden = document.querySelector('.igfu-ko');
    if (!isIG() || !cuEingerichtet()) { if (vorhanden) vorhanden.remove(); return; }
    const tid = igOffenerThread();
    const task = tid ? cuTasks[tid] : null;
    // Ohne Task keine Leiste.
    if (!tid || !task) {
      if (vorhanden) vorhanden.remove();
      if (koTid) koZustandSetzen('');
      return;
    }
    if (tid !== koTid) koZustandSetzen(tid);
    if (koTaskId !== task.taskId) { koTaskId = task.taskId; koListe = null; }
    if (koListe === null && !koLaedt) koHolen(task.taskId);
    // Die Status der Liste einmal holen. Sie fuellen das Menue an der
    // Status-Pille oben; ohne sie bleiben die im Skript bekannten Stufen,
    // aber ohne Farben und ohne spaeter ergaenzte.
    if (!statiAusCache().length && !statiLaeuft) {
      statiLaeuft = true;
      statiLaden().catch(() => {}).finally(() => { statiLaeuft = false; koZeichnen(); });
    }
    koZeichnen();
  }

  // Das Textfeld darf nicht unter den Fingern neu gebaut werden. Deshalb
  // zeichnet der Takt nur, wenn sich wirklich etwas geaendert hat — sonst
  // waere eine angefangene Notiz nach anderthalb Sekunden weg.
  function koSignatur() {
    const task = cuTasks[koTid];
    return [koTid, koTaskId, koOffen, koLaedt, koSendet, koFehler,
      task ? handleVonTask(task) : '',
      koListe === null ? 'x' : koListe.length + ':' + koListe.map((k) => k.id).join(','),
    ].join('|');
  }

  function koZeichnen() {
    const tid = igOffenerThread();
    if (!tid || tid !== koTid) return;
    const sig = koSignatur();
    const schonDa = document.querySelector('.igfu-ko');
    if (schonDa && sig === koStand) return;
    koStand = sig;
    let huelle = schonDa;
    if (!huelle) {
      huelle = el('div', 'igfu-ko');
      document.body.appendChild(huelle);
    }
    huelle.textContent = '';
    huelle.classList.toggle('auf', koOffen);

    const anzahl = koListe ? koListe.length : 0;
    const griff = button('igfu-ko-griff', '', () => {
      koOffen = !koOffen;
      koManuell = true;
      koZeichnen();
    }, koOffen ? 'Notizen zuklappen' : 'Notizen aufklappen');
    griff.append(el('span', 'igfu-ko-pfeil', koOffen ? '›' : '‹'));
    griff.append(el('span', 'igfu-ko-schrift',
      koListe === null ? 'Notizen …' : (anzahl ? 'Notizen ' + anzahl : 'Notiz schreiben')));
    huelle.appendChild(griff);
    if (!koOffen) return;

    const koerper = el('div', 'igfu-ko-koerper');
    const kopf = el('div', 'igfu-ko-kopf');
    kopf.appendChild(el('strong', '', 'Notizen'));
    if (koTaskId) {
      kopf.appendChild(button('igfu-link', 'In ClickUp', () => {
        const t = cuTasks[koTid];
        if (t && t.url) window.open(t.url, '_blank', 'noopener');
      }, 'Den Task in ClickUp öffnen'));
    }
    koerper.appendChild(kopf);

    const task = cuTasks[koTid];

    // Der Handle. Er ist der Schluessel, an dem im CRM alles haengt, und wird
    // staendig gebraucht — fuer die Suche in UpPromote, fuer Shopify, fuer
    // Ad-Codes. Deshalb steht er hier mit einem Knopf daneben.
    const handle = task ? handleVonTask(task) : '';
    const hzeile = el('div', 'igfu-ko-handle');
    if (handle) {
      const name = el('a', 'igfu-ko-at', '@' + handle);
      name.href = 'https://www.instagram.com/' + encodeURIComponent(handle) + '/';
      name.target = '_blank';
      name.rel = 'noopener';
      name.title = 'Profil in einem neuen Tab oeffnen';
      const kopieren = button('igfu-link igfu-ko-kopie', 'Kopieren', async () => {
        const gut = await inZwischenablage(handle);
        if (!gut) { toast('Kopieren hat nicht geklappt.'); return; }
        kopieren.textContent = 'Kopiert';
        setTimeout(() => { if (kopieren.isConnected) kopieren.textContent = 'Kopieren'; }, 1400);
      }, 'Den Handle in die Zwischenablage legen');
      hzeile.append(name, kopieren);
    } else {
      // Ohne Handle ist der Task fuer jede Automatik unsichtbar, und zwar
      // lautlos. Das gehoert hier hingeschrieben, nicht verschwiegen.
      hzeile.appendChild(el('span', 'igfu-ko-leer', 'Kein Handle hinterlegt'));
    }
    koerper.appendChild(hzeile);


    const verlauf = el('div', 'igfu-ko-verlauf');
    if (koFehler) verlauf.appendChild(el('p', 'igfu-empty', 'ClickUp: ' + koFehler));
    else if (koListe === null) verlauf.appendChild(el('p', 'igfu-empty', 'Wird geladen …'));
    else if (!koListe.length) verlauf.appendChild(el('p', 'igfu-empty', 'Noch keine Notiz zu dieser Person.'));
    else {
      for (const k of koSortiert(koListe)) {
        const e = el('div', 'igfu-ko-eintrag');
        const z = el('div', 'igfu-ko-zeile');
        z.append(el('span', 'igfu-ko-wer', k.wer || 'Unbekannt'),
          el('span', 'igfu-ko-wann', koZeitpunkt(k.wann)));
        // textContent, nicht innerHTML: der Text kommt von aussen.
        e.append(z, el('div', 'igfu-ko-text', k.text));
        verlauf.appendChild(e);
      }
    }
    koerper.appendChild(verlauf);

    const feld = el('textarea', 'igfu-ko-feld');
    feld.placeholder = 'Notiz schreiben …';
    feld.value = koEntwurf;
    feld.disabled = koSendet;
    feld.addEventListener('input', () => { koEntwurf = feld.value; });
    const senden = button('igfu-done', koSendet ? 'Sendet …' : 'Notiz sichern', async () => {
      const text = feld.value.trim();
      if (!text || koSendet) return;
      koSendet = true;
      const fuer = koTid;
      const taskId = koTaskId;
      koZeichnen();
      try {
        await cuRequest('POST', '/task/' + taskId + '/comment', { comment_text: text, notify_all: false });
        if (koTid === fuer) { koEntwurf = ''; koListe = await koKommentareLaden(taskId); koOffen = true; }
        toast('Notiz gesichert.');
      } catch (e) {
        toast('ClickUp: ' + e.message);
      } finally {
        koSendet = false;
        koZeichnen();
      }
    });
    const fuss = el('div', 'igfu-ko-fuss');
    fuss.append(feld, senden);
    koerper.appendChild(fuss);
    huelle.appendChild(koerper);

    // Nach dem Neuzeichnen dorthin, wo zuletzt gelesen wurde.
    verlauf.scrollTop = verlauf.scrollHeight;
  }

  function vlKnopfSetzen() {
    if (!isIG() || !cuEingerichtet()) return;
    const zeile = vlZeile();
    if (!zeile || zeile.querySelector('.igfu-vl-knopf')) return;
    const knopf = el('button', 'igfu-vl-knopf');
    knopf.type = 'button';
    knopf.title = 'Standardnachrichten';
    knopf.setAttribute('aria-label', 'Standardnachrichten');
    knopf.textContent = '⚡︎ Vorlagen';
    knopf.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); vlOeffnen(knopf); });
    zeile.appendChild(knopf);
  }

  let scheduled = null;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      syncActive();
      if (isInbox()) { scanRows(); positionUI(); }
      if (isMarkt()) { scanMarkt(); scanInhalte(); }
    }, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(syncActive, 1500);
  // Alle zwei Minuten nachsehen, was in ClickUp passiert ist. cuAktualisieren
  // bremst sich selbst, haeufigere Aufrufe kosten also keine Anfragen.
  setInterval(() => { if (isInbox()) { cuAktualisieren(false); abarbeiten(); } }, 120000);
  // Die Kontaktkarte der geoeffneten Unterhaltung nebenbei auslesen. Kostet nichts
  // und fuellt die fehlenden Handles waehrend der normalen Arbeit nach.
  setInterval(karteAuslesen, 3000);
  // Der Vorlagen-Knopf in der Verfassen-Zeile.
  setInterval(vlKnopfSetzen, 1500);
  // Die Leiste neben dem Namen und die Notizen am rechten Rand. Beide haengen
  // an der geoeffneten Unterhaltung; Instagram baut deren Kopf beim Wechsel
  // neu, deshalb im Takt statt einmalig.
  setInterval(() => { kopfLeisteSetzen(); koLeisteSetzen(); }, 1500);
  syncActive();
})();
