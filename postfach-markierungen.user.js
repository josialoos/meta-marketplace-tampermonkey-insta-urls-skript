// ==UserScript==
// @name         Postfach: eigene Markierungen
// @namespace    local.inbox-followups
// @version      5.2
// @description  Eigene Markierungen „Ungelesen" und „Follow-up" im Postfach der Meta Business Suite, dazu die Anbindung an ClickUp und das Erfassen von Creatorn im Marketplace.
// @match        https://business.facebook.com/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-markierungen.user.js
// @downloadURL  https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-markierungen.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      api.clickup.com
// @connect      aff-api.uppromote.com
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
    .igfu-tag[data-kind="unread"]::before {
      content: ""; width: 7px; height: 7px; border-radius: 50%;
      border: 1.5px solid currentColor; box-sizing: border-box;
    }
    [data-igfu-row]:hover .igfu-tag, .igfu-tag:focus-visible { opacity: 1; pointer-events: auto; }
    .igfu-tag:focus-visible { outline: 2px solid ${PINK}; outline-offset: 1px; }
    .igfu-tag.on { opacity: 1; pointer-events: auto; }
    .igfu-tag.on[data-kind="unread"] { background: ${BLACK}; border-color: ${BLACK}; color: #fff; }
    .igfu-tag.on[data-kind="unread"]::before { background: #fff; border-color: #fff; }
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

    /* Ungelesen: Name und Vorschau fett und dunkel, wie Metas eigene Darstellung.
       Die Uhrzeit (SPAN/ABBR mit eigener Farbe) bleibt grau. */
    [data-igfu-unread] div:not(.igfu-tags) {
      font-weight: 700 !important;
      color: rgb(28, 43, 51) !important;
    }

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
    .igfu-unread-item { display: flex; align-items: center; gap: 8px; }
    .igfu-unread-item .igfu-name { margin-right: auto; }
    .igfu-date { display: flex; align-items: center; gap: 6px; margin-right: auto; font-size: 12px; color: #65676b; }
    .igfu-date input { font: inherit; font-size: 12px; color: #1c2b33; border: 1px solid #ccd0d5; border-radius: 6px; padding: 2px 4px; }
    .igfu-note {
      display: block; box-sizing: border-box; width: 100%; margin-top: 8px; resize: vertical;
      font: inherit; font-size: 12px; line-height: 1.4; color: #1c2b33;
      border: 1px solid #ccd0d5; border-radius: 6px; padding: 6px 8px;
    }
    .igfu-note:focus, .igfu-date input:focus { outline: 2px solid ${PINK}; outline-offset: 0; border-color: transparent; }
    .igfu-meta { margin-top: 6px; font-size: 11px; color: #8a8d91; }
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
  const VERSION = '5.2';
  const INBOX_PATH = /^\/latest\/inbox(\/|$)/;
  const isInbox = () => INBOX_PATH.test(location.pathname);
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
  // Ungelesen:  { [threadID]: { title, markedAt } }
  // Der Schlüssel für Follow-ups ist derselbe wie in Version 1.0, damit
  // bestehende Markierungen erhalten bleiben.

  const KEY_FOLLOW = 'igfu:v1';
  const KEY_UNREAD = 'igfu:unread:v1';
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
  let unread = load(KEY_UNREAD);
  const saveFollow = () => store(KEY_FOLLOW, follow);
  const saveUnread = () => store(KEY_UNREAD, unread);

  // Änderungen aus anderen Tabs übernehmen
  function onExternalChange() {
    follow = load(KEY_FOLLOW);
    unread = load(KEY_UNREAD);
    scanRows();
    if (panelOpen) renderPanel();
    updateLauncher();
  }
  if (hasGM && typeof GM_addValueChangeListener === 'function') {
    for (const k of [KEY_FOLLOW, KEY_UNREAD]) {
      GM_addValueChangeListener(k, (name, oldVal, newVal, remote) => { if (remote) onExternalChange(); });
    }
  } else {
    window.addEventListener('storage', (e) => { if (e.key === KEY_FOLLOW || e.key === KEY_UNREAD) onExternalChange(); });
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
  const STATUS_ENDE = ['abgesagt', 'keine antwort', 'beendet'];
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
  function postfachLink(tid) {
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
    const z = ['[Unterhaltung im Postfach öffnen](' + postfachLink(tid) + ')', ''];
    if (handle) z.push('Instagram: [@' + handle + '](https://www.instagram.com/' + handle + '/)', '');
    z.push('---', 'Vom Postfach-Skript verwaltet. Die folgenden Zeilen bitte nicht ändern.', 'igfu-thread: ' + tid);
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
  const GUETE = { vorschau: 1, karte: 2, hand: 3 };

  const handles = () => GM_getValue(CU_HANDLES, {}) || {};
  const handleVon = (tid) => handles()[tid] || null;

  function taskName(handle, titel) {
    const t = String(titel || 'Unbekannt').trim();
    if (!handle) return t;
    if (handle.toLowerCase() === t.toLowerCase()) return t;
    return handle + ' — ' + t;
  }

  function handleMerken(tid, handle, quelle, bild, letzte) {
    if (!tid) return;
    const alle = handles();
    const alt = alle[tid] || {};
    let geaendert = false;
    if (letzte && alt.letzte !== letzte) { alt.letzte = letzte; geaendert = true; }
    if (bild && alt.bild !== bild) { alt.bild = bild; geaendert = true; }
    const besser = handle && (!alt.handle || (GUETE[quelle] || 0) > (GUETE[alt.quelle] || 0));
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
  // Kombinationszeichen weg, damit aus „Wäschle" und „Waschle" dasselbe wird —
  // auf beiden Seiten gleich, also vergleichbar.
  //
  // Am 06.10.2026 an der echten Liste geprueft:
  //   „𝒟𝒶𝓃𝒾ℯ𝓁𝒶"            → „daniela"
  //   „𝗖𝗵𝗶𝗮𝗿𝗮 𝗪𝗮𝗹𝗱𝗻𝗲𝗿"      → „chiara waldner"
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
  //   1. Mindestens zwei Wortteile. Ein einzelner Vorname („Willi") ist zu
  //      wenig, davon gibt es in jeder Liste mehrere.
  //   2. Genau ein passender Task. Bei zwei Treffern waere jede Wahl geraten,
  //      dann bleibt die Unterhaltung lieber unverbunden.
  // Sucht den Task zu einer Unterhaltung ueber den Anzeigenamen. Drei Wege,
  // alle an der echten Liste vom 06.10.2026 entwickelt:
  //
  //   1. Beide Namen sind gleich.
  //      „Anna Bolko NRNS" ↔ „anna_bolko_cali — Anna Bolko NRNS"
  //   2. Alle Wortteile des Task-Namens kommen im Titel vor. Instagram-Namen
  //      tragen oft Beiwerk, das in ClickUp nicht steht.
  //      „G o V e | Govind Mukubay" ↔ „govefit_ — Govind Mukubay"
  //   3. Der Titel ist selbst ein Handle.
  //      „naturpedal" ↔ Task „naturpedal"
  //
  // Zwei Schranken verhindern Raten:
  //   - Ein einzelnes Wort zaehlt nur, wenn es als Handle geschrieben ist.
  //     „Willi" ist ein Vorname und passt auf zu viele; „naturpedal" ist
  //     eindeutig. Geprueft wird dafuer der unveraenderte Titel, nicht die
  //     kleingeschriebene Form — sonst wird aus jedem Vornamen ein Handle.
  //   - Genau ein passender Task. Bei zwei Treffern waere jede Wahl geraten,
  //     dann bleibt die Unterhaltung unverbunden.
  //
  // auchVerbundene schliesst Tasks ein, die schon eine Unterhaltung haben. Das
  // ist der Zusammenfuehrungs-Fall: dieselbe Person schreibt einmal ueber
  // Partner-Nachrichten und einmal als normale DM, und beides gehoert in
  // denselben Task.
  function nameTreffer(titel, auchVerbundene) {
    const roh = String(titel || '').trim();
    const form = namensform(roh);
    const worte = form.split(' ').filter(Boolean);
    if (!worte.length) return null;
    const einzelHandle = worte.length === 1 && HANDLE_MUSTER.test(roh) ? roh.toLowerCase() : '';
    if (worte.length < 2 && !einzelHandle) return null;
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

  function handleAusVorschau(thread) {
    let text = '';
    try { text = textAusSnippet(thread.snippet, 0, []).join(' '); } catch (e) { return ''; }
    const m = text.match(/^([a-z0-9._]{2,30})\s+gefällt\b/) || text.match(/^([a-z0-9._]{2,30}):/);
    return m && HANDLE_MUSTER.test(m[1]) ? m[1] : '';
  }

  // Meta stellt eigenen Nachrichten „Du: " voran. Das ist der einzige
  // verlaessliche Hinweis darauf, bei wem die Antwort gerade liegt.
  // Eine blosse Reaktion steht als „<handle> gefaellt eine Nachricht" da und
  // ist keine offene Nachricht, siehe die Regeln der Chat-Durchsicht.
  function werZuletzt(thread) {
    let text = '';
    try { text = textAusSnippet(thread.snippet, 0, []).join(' ').trim(); } catch (e) { return ''; }
    if (!text) return '';
    if (/^Du:/.test(text)) return 'ich';
    if (/gefällt\s+(eine|deine)\s+Nachricht/i.test(text)) return 'reaktion';
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

  function karteAuslesen() {
    if (!isInbox()) return;
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
    // auch so geschrieben ist — also bereits klein. „naturpedal" und
    // „hansj.stolz" sind Handles, „Willi" und „Sophie" sind Vornamen.
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
    if (tid) z.push('[Unterhaltung im Postfach öffnen](' + postfachLink(tid) + ')', '');
    if (a.handle) z.push('Instagram: [@' + a.handle + '](https://www.instagram.com/' + a.handle + '/)', '');
    z.push('---', 'Aus UpPromote übernommen. Die folgenden Zeilen bitte nicht ändern.');
    if (tid) z.push('igfu-thread: ' + tid);
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
    const tids = [];
    for (const x of texte) {
      for (const einzel of threadsAusText(x)) if (!tids.includes(einzel)) tids.push(einzel);
    }
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
      bild,
      mail,
      ware,
      handle,
      notiz,
      taskId: t.id,
      titel: t.name,
      status: (t.status && t.status.status) || '',
      farbe: (t.status && t.status.color) || '#65676b',
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
    const ohneThread = [];
    for (let seite = 0; seite < 25; seite++) {
      const d = await cuRequest('GET', '/list/' + liste + '/task?include_closed=true&subtasks=false&page=' + seite);
      for (const t of d.tasks || []) {
        const neu = taskAufbereiten(t);
        if (neu.bild && !nachBild[neu.bild]) nachBild[neu.bild] = neu;
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
    cuOhneThread = ohneThread;
    cuSpeichern();
    return gefunden;
  }

  function cuSpeichern() {
    GM_setValue(CU_TASKS, {
      stand: Date.now(), tasks: cuTasks, bilder: cuBilder, ohneThread: cuOhneThread,
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
    const schonDrin = threadsAusText(bisher);
    if (!schonDrin.includes(tid)) {
      const link = '[' + (schonDrin.length ? 'Weitere Unterhaltung' : 'Unterhaltung')
        + ' im Postfach öffnen](' + postfachLink(tid) + ')';
      const text = schonDrin.length
        ? bisher.replace(/\s*$/, '') + '\n\n' + link + '\nigfu-thread: ' + tid
        : link + '\n\n' + bisher.replace(/^\s*/, '').replace(/\s*$/, '') + '\nigfu-thread: ' + tid;
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
        const ergaenzt = bisher.replace(/\s*$/, '')
          + '\n\n[Unterhaltung im Postfach öffnen](' + postfachLink(a.tid) + ')\n'
          + 'igfu-thread: ' + a.tid;
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
        const neuerName = taskName(h, rohTitel(a.titel || task.titel));
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

  function threadRows() {
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
    let followTitles = false, unreadTitles = false;
    for (const [row, t] of threadRows()) {
      const tid = t.threadID;
      let wrap = row.querySelector(':scope > .igfu-tags');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'igfu-tags';
        wrap.append(makeChip('unread', 'Ungelesen'), makeChip('followup', 'Follow-up'), makeChip('crm', 'CRM'));
        if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
        row.setAttribute('data-igfu-row', '');
        row.appendChild(wrap);
      }
      if (wrap.dataset.tid !== tid) {
        wrap.dataset.tid = tid;
        wrap.style.left = nameOffset(row, t.title) + 'px';
      }
      wrap.dataset.title = t.title;

      const fOn = !!follow[tid];
      const uOn = !!unread[tid];
      setChip(wrap.querySelector('[data-kind="unread"]'), uOn, 'Als gelesen markieren', 'Als ungelesen markieren');
      setChip(wrap.querySelector('[data-kind="followup"]'), fOn, 'Follow-up entfernen', 'Als Follow-up markieren');
      setzeCrmChip(wrap.querySelector('[data-kind="crm"]'), tid);
      setAttr(row, 'data-igfu-follow', fOn);
      setAttr(row, 'data-igfu-unread', uOn);

      const vorschau = handleAusVorschau(t);
      const bild = bildIDVon(t);
      if (vorschau || bild) handleMerken(tid, vorschau, 'vorschau', bild);

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
        if (hier && cuOhneThread.some((x) => !x.tid && !x.leiche && handleVonTask(x) === hier)) {
          vormerken({ art: 'verbinden-handle', tid, titel: t.title, handle: hier });
        } else if (!hier) {
          // Kein Handle zu holen: dann ueber den Anzeigenamen versuchen, und
          // zwar auch in Tasks, die schon eine Unterhaltung haben — genau dort
          // sitzt der Zusammenfuehrungs-Fall.
          const ziel = nameTreffer(t.title, true);
          if (ziel) {
            vormerken({ art: 'verbinden-handle', tid, titel: t.title, taskId: ziel.taskId, bild });
          }
        }
      }

      if (fOn && follow[tid].title !== t.title) { follow[tid].title = t.title; followTitles = true; }
      if (uOn && unread[tid].title !== t.title) { unread[tid].title = t.title; unreadTitles = true; }
    }
    if (followTitles) saveFollow();
    if (unreadTitles) saveUnread();
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
    // Wird bewusst nicht abgewartet, damit das Anlegen nicht wartet. Deshalb
    // darf hier nichts unbehandelt nach oben fliegen.
    try {
      if (!isInbox() || !cuEingerichtet()) return '';
      const bekannt = handleVon(tid);
      if (bekannt && bekannt.handle) return bekannt.handle;
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
    toast('Lege Task in ClickUp an …');
    handleBeschaffen(tid, titel);
    try {
      const neu = await cuTaskSichern(tid, titel);
      scanRows();
      toast('Task angelegt: ' + (neu.titel || titel));
    } catch (e) {
      toast('ClickUp: ' + e.message);
    }
  }

  function toggle(kind, tid, title) {
    if (!tid) return;
    if (kind === 'unread') {
      if (unread[tid]) delete unread[tid];
      else unread[tid] = { title: title || 'Unbekannt', markedAt: Date.now() };
      saveUnread();
    } else {
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
        if (chip.dataset.kind === 'crm') crmKlick(wrap.dataset.tid, wrap.dataset.title);
        else toggle(chip.dataset.kind, wrap.dataset.tid, wrap.dataset.title);
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
  let launcher, panel, bodyEl, toastEl, formEl, refreshBtn, tippEl;

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
  const sortedUnread = () => Object.entries(unread).sort(([, a], [, b]) => b.markedAt - a.markedAt);

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

    const knoepfe = el('div', 'igfu-form-knoepfe');

    const standAnzeigen = () => {
      const teile = [];
      teile.push(String(GM_getValue(CU_TOKEN, '') || '').trim() ? 'Token hinterlegt.' : 'Kein Token hinterlegt.');
      teile.push(cuListe() ? 'Liste ' + cuListe() + '.' : 'Keine Liste gesetzt.');
      teile.push(upToken() ? 'UpPromote verbunden.' : 'UpPromote nicht verbunden.');
      const offen = warteschlange().length;
      if (offen) teile.push(offen + ' Änderung(en) warten auf Übertragung.');
      hinweis.textContent = teile.join(' ');
    };

    knoepfe.append(
      button('igfu-done', 'Speichern', async () => {
        GM_setValue(CU_LIST, listenFeld.value.trim());
        if (tokenFeld.value.trim()) GM_setValue(CU_TOKEN, tokenFeld.value.trim());
        if (upFeld.value.trim()) GM_setValue(UP_TOKEN, upFeld.value.trim());
        tokenFeld.value = '';
        upFeld.value = '';
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

    f.append(hinweis, listenLabel, tokenLabel, upLabel, knoepfe);
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
      await cuTagSichern();
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
      await cuTagSichern();
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
    const nUnread = Object.keys(unread).length;
    const all = Object.values(follow);
    const due = all.filter((f) => f.due && f.due <= todayStr()).length;
    launcher.textContent = '';
    launcher.append(el('span', '', 'Ungelesen ' + nUnread), el('span', '', 'Follow-ups ' + all.length));
    if (due) launcher.append(el('span', 'igfu-due-badge', due + ' fällig'));
    const offen = cuEingerichtet() ? warteschlange().length : 0;
    if (offen) launcher.append(el('span', 'igfu-due-badge', offen + ' offen'));
    const fehlen = ohneHandle().length;
    if (fehlen) launcher.append(el('span', 'igfu-due-badge', fehlen + ' ohne Handle'));
    launcher.classList.toggle('has', nUnread + all.length > 0);
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
      + zeilen.length + ' Unterhaltung' + (zeilen.length === 1 ? '' : 'en') + ' im Blick, '
      + mitTask + ' mit Task, ' + mitHandle + ' mit bekanntem Handle.';
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
      + 'ClickUp keinen passenden Task — oder es passen zwei, dann wird keiner genommen.'));
    const ul = el('ol', 'igfu-list');
    for (const [, t] of offen.slice(0, 20)) {
      const tid = t.threadID;
      const treffer = nameTreffer(t.title, true);
      const li = el('li', 'igfu-item');
      const top = el('div', 'igfu-item-top');
      top.append(
        button('igfu-name', t.title || 'Ohne Namen', () => reveal(tid), 'In der Liste anzeigen'),
        el('span', 'igfu-meta', treffer ? 'Treffer: ' + rohTitel(treffer.titel) : 'kein Treffer'),
      );
      li.appendChild(top);
      li.appendChild(el('div', 'igfu-meta', 'gelesen als „' + namensform(t.title) + '"'));
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
  }

  function renderPanel() {
    bodyEl.textContent = '';
    const uEntries = sortedUnread();
    const fEntries = sortedFollow();

    if (isInbox()) {
      const d = el('p', 'igfu-empty', diagnoseZeile());
      d.id = 'igfu-diagnose';
      bodyEl.appendChild(d);
      zeigeOhneTask();
    }

    if (!uEntries.length && !fEntries.length && !ohneHandle().length) {
      bodyEl.appendChild(el('p', 'igfu-empty', 'Noch nichts markiert. Fahr mit der Maus über eine Unterhaltung und klick auf „Ungelesen" oder „Follow-up".'));
      return;
    }

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

    if (uEntries.length) {
      bodyEl.appendChild(el('h3', 'igfu-section-title', 'Ungelesen'));
      const ul = el('ol', 'igfu-list');
      for (const [tid, u] of uEntries) {
        const li = el('li', 'igfu-item igfu-unread-item');
        li.append(
          button('igfu-name', u.title, () => reveal(tid), 'In der Liste anzeigen'),
          button('igfu-link', 'Anzeigen', () => reveal(tid)),
          button('igfu-done', 'Gelesen', () => toggle('unread', tid)),
        );
        ul.appendChild(li);
      }
      bodyEl.appendChild(ul);
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
  async function allesAktualisieren(vollstaendig) {
    if (laeuftDurchlauf) return;
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
    const zeigen = (text) => { if (refreshBtn) refreshBtn.textContent = text; };
    if (refreshBtn) refreshBtn.disabled = true;
    const gesehen = new Set();
    // Erst nach drei Runden in Folge, die ausschliesslich Aelteres gebracht
    // haben, ist Schluss. Eine einzelne Zeile, die beim Nachrendern aus der
    // Reihe taenzelt, beendet den Lauf damit nicht. Gezaehlt werden nur Runden
    // mit neuen Funden, sonst wuerde blosses Warten den Lauf abwuergen.
    let hinterGrenze = 0;
    const erfassen = () => {
      let neu = 0, aktuelle = 0;
      for (const [, t] of threadRows()) {
        if (gesehen.has(t.threadID)) continue;
        gesehen.add(t.threadID);
        neu++;
        if (!t.timestamp || t.timestamp >= grenze) aktuelle++;
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
        toast(gesehen.size + (voll ? ' Unterhaltungen durchgesehen' : ' Unterhaltungen seit dem letzten Lauf')
          + (offen ? ', ' + offen + ' Änderung(en) gehen noch raus.' : ', alles auf Stand.'));
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
    panel.style.left = Math.round(r.left + 8) + 'px';
    panel.style.width = Math.round(Math.min(360, r.width - 16)) + 'px';
    panel.style.bottom = (bottom + 42) + 'px';
    toastEl.style.left = Math.round(r.left + 8) + 'px';
    toastEl.style.bottom = (bottom + 42) + 'px';
  }
  window.addEventListener('resize', () => positionUI());

  // ---------- Sichern und Laden ----------

  function exportData() {
    const data = { version: 2, followups: follow, unread };
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
        // Version 2: { followups, unread }; ältere Dateien enthalten nur Follow-ups
        const f = data.version === 2 ? (data.followups || {}) : data;
        const u = data.version === 2 ? (data.unread || {}) : {};
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
        for (const [tid, v] of Object.entries(u)) {
          if (!v || typeof v !== 'object') continue;
          unread[tid] = { title: String(v.title || 'Unbekannt'), markedAt: Number(v.markedAt) || Date.now() };
          n++;
        }
        saveFollow(); saveUnread(); scanRows(); renderPanel(); updateLauncher();
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
  syncActive();
})();
