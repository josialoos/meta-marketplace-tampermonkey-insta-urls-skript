// ==UserScript==
// @name         Postfach: eigene Markierungen
// @namespace    local.inbox-followups
// @version      2.9
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

  const INBOX_PATH = /^\/latest\/inbox(\/|$)/;
  const isInbox = () => INBOX_PATH.test(location.pathname);
  // Der Marketplace ist die Stelle, an der das Handle sicher bekannt ist. Wer hier
  // erfasst wird, hat es von Anfang an im Task stehen.
  const MARKT_PATH = /^\/(latest\/creator_marketplace|creator_marketing_hub)(\/|$)/;
  const isMarkt = () => MARKT_PATH.test(location.pathname);

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
  const CU_QUEUE = 'clickup:queue:v1';

  // Custom Fields sind bewusst nicht im Spiel: ClickUp Free erlaubt nur 60
  // Befuellungen im gesamten Workspace, allein die Erstuebernahme braucht mehr.
  // Die Thread-ID steht deshalb in der Beschreibung, das Follow-up ist ein Tag.
  // Beschreibungen und Tags haben kein Kontingent.
  const CU_TAG = 'follow-up';
  const FELD_THREAD = 'Thread-ID';   // wird nur noch gelesen, falls vorhanden
  const CU_HANDLES = 'clickup:handles:v1';

  // Seit „recherchiert" der erste Status der Liste ist, waere er die Vorgabe beim
  // Anlegen. Eine Unterhaltung im Postfach heisst aber, dass schon geschrieben
  // wurde, deshalb wird der Status hier ausdruecklich gesetzt.
  const CU_STATUS_NEU = 'angeschrieben';
  const CU_STATUS_MARKT = 'recherchiert';
  const CU_STATUS_ONBOARD = 'ongeboardet';

  // UpPromote kennt den Freigabestatus der Affiliates. Shopify kennt ihn nicht,
  // dort steht nur ein Tag ohne Aussage. Die Zuordnung laeuft ueber das
  // Instagram-Profil, das UpPromote bei jedem Affiliate mitliefert.
  const UP_TOKEN = 'uppromote:token:v1';
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
  let cuLetzterAbruf = 0;
  let cuLaeuft = false;

  // Metas eigener Link auf eine Unterhaltung. Das Briefing sagte, so etwas
  // gebe es nicht, inzwischen gibt es das: selected_item_id oeffnet die
  // Unterhaltung direkt, ganz ohne Zutun des Skripts. Live geprueft.
  const postfachLink = (tid) =>
    'https://business.facebook.com/latest/inbox/all/?partnership_messages=true'
    + '&selected_item_id=' + tid + '&thread_type=IG_MESSAGE';

  // Die Markerzeile ist die Verbindung zwischen Unterhaltung und Task. Sie steht
  // sichtbar in der Beschreibung, damit jeder sieht, dass sie dazugehoert.
  function beschreibung(tid, handle, bildID) {
    const z = ['[Unterhaltung im Postfach öffnen](' + postfachLink(tid) + ')', ''];
    if (handle) z.push('Instagram: [@' + handle + '](https://www.instagram.com/' + handle + '/)', '');
    z.push('---', 'Vom Postfach-Skript verwaltet. Die folgenden Zeilen bitte nicht ändern.', 'igfu-thread: ' + tid);
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
  const GUETE = { vorschau: 1, karte: 2 };

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

  async function upAktive() {
    const gefunden = {};
    for (let seite = 1; seite <= 20; seite++) {
      const d = await upRequest('/affiliates?status=active&per_page=100&page=' + seite);
      const liste = d.data || d.affiliates || (Array.isArray(d) ? d : []);
      for (const a of liste) {
        const h = handleAusAffiliate(a);
        if (h) gefunden[h] = { name: [a.first_name, a.last_name].filter(Boolean).join(' '), email: a.email };
      }
      if (!liste.length || liste.length < 100) break;
    }
    return gefunden;
  }

  // Das Handle eines Tasks steht im Namen vor dem Gedankenstrich, sonst ist der
  // ganze Name das Handle.
  function handleAusTaskname(name) {
    const n = String(name || '').trim();
    const m = n.match(/^([a-z0-9._]{2,30})\s+—\s+/);
    if (m) return m[1].toLowerCase();
    return HANDLE_MUSTER.test(n.toLowerCase()) ? n.toLowerCase() : '';
  }

  async function upAbgleichen() {
    if (!cuEingerichtet()) { toast('Bitte erst ClickUp einrichten.'); return; }
    if (!upToken()) { toast('Bitte erst den UpPromote-Token eintragen.'); return; }
    if (cuLaeuft) { toast('Es läuft gerade eine Übertragung, bitte kurz warten.'); return; }
    cuLaeuft = true;
    try {
      toast('Frage UpPromote ab …');
      const aktive = await upAktive();
      await cuTasksLaden();
      const treffer = [];
      for (const t of Object.values(cuTasks)) {
        const h = handleAusTaskname(t.titel);
        if (!h || !aktive[h]) continue;
        if (t.status === CU_STATUS_ONBOARD) continue;
        treffer.push([t, h]);
      }
      if (!treffer.length) {
        toast(Object.keys(aktive).length + ' bestätigte Affiliates bei UpPromote, keiner davon neu im CRM.');
        return;
      }
      let fertig = 0;
      for (const [t] of treffer) {
        await cuRequest('PUT', '/task/' + t.taskId, { status: CU_STATUS_ONBOARD });
        t.status = CU_STATUS_ONBOARD;
        fertig++;
      }
      GM_setValue(CU_TASKS, { stand: Date.now(), tasks: cuTasks, bilder: cuBilder });
      toast(fertig + ' auf „' + CU_STATUS_ONBOARD + '" gesetzt, von ' + Object.keys(aktive).length + ' bestätigten Affiliates.');
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
  let tagGeprueft = false;
  async function cuTagSichern() {
    if (tagGeprueft) return;
    const space = cuSpace() || (await cuSpaceLaden());
    const daten = await cuRequest('GET', '/space/' + space + '/tag');
    const da = (daten.tags || []).some((t) => (t.name || '').toLowerCase() === CU_TAG);
    if (!da) {
      try {
        await cuRequest('POST', '/space/' + space + '/tag', {
          tag: { name: CU_TAG, tag_fg: '#1c1e21', tag_bg: YELLOW },
        });
      } catch (e) {
        if (e.wiederholbar || e.blockierend) throw e;
        throw new Error('Der Tag „' + CU_TAG + '" fehlt im Space und liess sich nicht anlegen. '
          + 'Bitte einmal von Hand in ClickUp anlegen. ' + e.message);
      }
    }
    tagGeprueft = true;
  }

  const bildAusText = (text) => (String(text || '').match(/igfu-bild:\s*([0-9]{6,})/) || [])[1] || '';

  function taskAufbereiten(t) {
    const texte = [t.description, t.text_content, t.markdown_description];
    let tid = '';
    for (const x of texte) { tid = tid || threadAusText(x); }
    if (!tid) {
      // Rueckfall fuer Tasks, die noch aus der Zeit mit Custom Fields stammen
      for (const f of t.custom_fields || []) {
        if (f.name === FELD_THREAD && f.value) { tid = String(f.value); break; }
      }
    }
    let bild = '';
    for (const x of texte) { bild = bild || bildAusText(x); }
    const tags = (t.tags || []).map((x) => String(x.name || '').toLowerCase());
    return {
      tid: tid ? String(tid) : '',
      bild,
      taskId: t.id,
      titel: t.name,
      status: (t.status && t.status.status) || '',
      farbe: (t.status && t.status.color) || '#65676b',
      follow: tags.includes(CU_TAG),
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
    for (let seite = 0; seite < 25; seite++) {
      const d = await cuRequest('GET', '/list/' + liste + '/task?include_closed=true&subtasks=false&page=' + seite);
      for (const t of d.tasks || []) {
        const neu = taskAufbereiten(t);
        if (neu.bild && !nachBild[neu.bild]) nachBild[neu.bild] = neu;
        if (!neu.tid) continue;
        // Zu einer Unterhaltung kann versehentlich ein zweiter Task existieren.
        // Dann gewinnt der getaggte, sonst loescht ein leerer Doppelgaenger die
        // Markierung. Bei Gleichstand der zuletzt gefundene.
        const alt = gefunden[neu.tid];
        if (!alt || neu.follow || !alt.follow) gefunden[neu.tid] = neu;
      }
      if (d.last_page || !(d.tasks || []).length) break;
    }
    cuTasks = gefunden;
    cuBilder = nachBild;
    GM_setValue(CU_TASKS, { stand: Date.now(), tasks: gefunden, bilder: nachBild });
    return gefunden;
  }

  async function cuTaskSichern(tid, titel, handle) {
    if (cuTasks[tid]) return cuTasks[tid];
    const w = handleVon(tid);
    const h = handle || (w && w.handle) || '';
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
    GM_setValue(CU_TASKS, { stand: Date.now(), tasks: cuTasks, bilder: cuBilder });
    return cuTasks[tid];
  }

  async function cuFollowSetzen(taskId, an) {
    await cuTagSichern();
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
      const aenderung = { status: CU_STATUS_NEU };
      if (neuerName && neuerName !== ziel.titel) aenderung.name = neuerName;
      await cuRequest('PUT', '/task/' + ziel.taskId, aenderung);
      ziel.tid = a.tid;
      ziel.status = CU_STATUS_NEU;
      if (aenderung.name) ziel.titel = aenderung.name;
      cuTasks[a.tid] = ziel;
      GM_setValue(CU_TASKS, { stand: Date.now(), tasks: cuTasks, bilder: cuBilder });
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
        await cuRequest('PUT', '/task/' + task.taskId, { start_date: ms, start_date_time: false });
        task.letzte = a.wert;
      }
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
    GM_setValue(CU_TASKS, { stand: Date.now(), tasks: cuTasks });
  }

  async function cuAktualisieren(erzwingen) {
    if (!cuEingerichtet() || cuLaeuft) return;
    if (!erzwingen && Date.now() - cuLetzterAbruf < 120000) return;
    cuLetzterAbruf = Date.now();
    try {
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

  function threadRows() {
    const out = [];
    for (const row of document.querySelectorAll('div[role="presentation"]')) {
      const t = threadOf(row);
      if (t) out.push([row, t]);
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
        if (task && task.letzte !== letzte) vormerken({ art: 'letzte', tid, titel: t.title, wert: letzte });
      }

      // Gibt es zu dieser Unterhaltung noch keinen Task, aber einen im
      // Marketplace erfassten mit demselben Profilbild, gehoeren sie zusammen.
      if (!cuTasks[tid] && bild && cuBilder[bild] && !cuBilder[bild].tid) {
        vormerken({ art: 'verbinden', tid, titel: t.title, bild });
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

  async function crmKlick(tid, titel) {
    if (!tid) return;
    const task = cuTasks[tid];
    if (task && task.url) { window.open(task.url, '_blank', 'noopener'); return; }
    toast('Lege Task in ClickUp an …');
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
      GM_setValue(CU_TASKS, { stand: Date.now(), tasks: cuTasks, bilder: cuBilder });
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
    const kopf = el('b', '', 'Geht die ganze Liste einmal durch');
    const liste = el('ul');
    for (const t of [
      'Datum der letzten Nachricht ins Startdatum des Tasks, damit du in ClickUp nach Dringlichkeit sortieren kannst',
      'Instagram-Handles aus den Vorschautexten, und benennt die Tasks entsprechend um',
      'Unterhaltungen, die zu einem im Marketplace erfassten Creator gehören, werden mit ihm verbunden',
      'geänderte Anzeigenamen in deinen Markierungen',
    ]) liste.appendChild(el('li', '', t));
    const fuss = el('div', 'igfu-tipp-fuss',
      'Legt keine neuen Tasks an und ändert keine Follow-ups. Nötig, weil Meta immer nur die '
      + 'sichtbaren Zeilen lädt und das Skript nur sieht, woran es vorbeikommt.');
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
    listenFeld.placeholder = 'z. B. 1200250000007224';
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
      tagGeprueft = false;
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
        GM_setValue(CU_TASKS, { stand: Date.now(), tasks: cuTasks });
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
    launcher.classList.toggle('has', nUnread + all.length > 0);
    launcher.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
    positionUI();
  }

  function openPanel() { panelOpen = true; panel.hidden = false; renderPanel(); updateLauncher(); }
  function closePanel() { panelOpen = false; panel.hidden = true; updateLauncher(); }

  function renderPanel() {
    bodyEl.textContent = '';
    const uEntries = sortedUnread();
    const fEntries = sortedFollow();

    if (!uEntries.length && !fEntries.length) {
      bodyEl.appendChild(el('p', 'igfu-empty', 'Noch nichts markiert. Fahr mit der Maus über eine Unterhaltung und klick auf „Ungelesen" oder „Follow-up".'));
      return;
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
  let laeuftDurchlauf = false;
  async function allesAktualisieren() {
    if (laeuftDurchlauf) return;
    const sc = listScroller();
    if (!sc) { toast('Die Unterhaltungsliste wurde nicht gefunden.'); return; }
    laeuftDurchlauf = true;
    const merke = refreshBtn ? refreshBtn.textContent : '';
    const zeigen = (text) => { if (refreshBtn) refreshBtn.textContent = text; };
    if (refreshBtn) refreshBtn.disabled = true;
    const gesehen = new Set();
    try {
      setScrollTop(sc, 0);
      await sleep(700);
      let ohneZuwachs = 0;
      for (let i = 0; i < 400; i++) {
        scanRows();
        for (const [, t] of threadRows()) gesehen.add(t.threadID);
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
          for (const [, t] of threadRows()) gesehen.add(t.threadID);
        }
        if (gesehen.size === vorher) { if (++ohneZuwachs >= 10) break; } else ohneZuwachs = 0;
      }
      setScrollTop(sc, 0);
      await sleep(400);
      scanRows();
      const offen = warteschlange().length;
      toast(gesehen.size + ' Unterhaltungen durchgesehen'
        + (offen ? ', ' + offen + ' Änderung(en) gehen noch raus.' : ', alles auf Stand.'));
      abarbeiten();
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
    if (now === wasInbox) { if (isMarkt()) { stilEinspielen(); scanMarkt(); } return; }
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
    if (isMarkt()) { stilEinspielen(); cuAktualisieren(false); scanMarkt(); }
  }

  let scheduled = null;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      syncActive();
      if (isInbox()) { scanRows(); positionUI(); }
      if (isMarkt()) scanMarkt();
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
