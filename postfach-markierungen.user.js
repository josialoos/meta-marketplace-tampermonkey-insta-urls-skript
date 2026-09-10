// ==UserScript==
// @name         Postfach: eigene Markierungen
// @namespace    local.inbox-followups
// @version      1.4
// @description  Eigene Markierungen „Ungelesen" und „Follow-up" (mit Wiedervorlage und Notiz) im Postfach der Meta Business Suite. Gespeichert in Tampermonkey, Meta kann sie nicht zurücksetzen.
// @match        https://business.facebook.com/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-markierungen.user.js
// @downloadURL  https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/main/postfach-markierungen.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
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
// Hinweis zu Updates: Tampermonkey holt neue Versionen automatisch von GitHub
// (@updateURL). Manuell: Tampermonkey-Menü → „Nach Userscript-Updates suchen".
// Der Speicher gehört zum installierten Skript und bleibt bei Updates erhalten.

(function () {
  'use strict';

  // ---------- Aussehen ----------

  const PINK = '#e1306c';
  const BLACK = '#1c1e21';   // Ungelesen
  const YELLOW = '#f7c600';  // Follow-up

  const CSS = `
    .igfu-tags {
      position: absolute; bottom: 7px; z-index: 2;
      display: flex; flex-direction: row; flex-wrap: nowrap; gap: 6px;
      width: max-content;
    }
    .igfu-tags > .igfu-tag {
      position: static; flex: none;
      display: inline-flex; align-items: center; gap: 4px;
      height: 20px; padding: 0 8px; border-radius: 10px;
      border: 1px solid #ccd0d5; background: #fff; color: #65676b;
      font-family: inherit; font-size: 11px; font-weight: 600; line-height: 1;
      cursor: pointer; opacity: 0; transition: opacity .12s;
    }
    .igfu-tag[data-kind="followup"]::before { content: "⚑"; font-size: 11px; }
    .igfu-tag[data-kind="unread"]::before {
      content: ""; width: 7px; height: 7px; border-radius: 50%;
      border: 1.5px solid currentColor; box-sizing: border-box;
    }
    [data-igfu-row]:hover .igfu-tag, .igfu-tag:focus-visible { opacity: 1; }
    .igfu-tag:focus-visible { outline: 2px solid ${PINK}; outline-offset: 1px; }
    .igfu-tag.on { opacity: 1; }
    .igfu-tag.on[data-kind="unread"] { background: ${BLACK}; border-color: ${BLACK}; color: #fff; }
    .igfu-tag.on[data-kind="unread"]::before { background: #fff; border-color: #fff; }
    .igfu-tag.on[data-kind="followup"] { background: ${YELLOW}; border-color: #e0b400; color: ${BLACK}; }

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
        wrap.append(makeChip('unread', 'Ungelesen'), makeChip('followup', 'Follow-up'));
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
      setAttr(row, 'data-igfu-follow', fOn);
      setAttr(row, 'data-igfu-unread', uOn);

      if (fOn && follow[tid].title !== t.title) { follow[tid].title = t.title; followTitles = true; }
      if (uOn && unread[tid].title !== t.title) { unread[tid].title = t.title; unreadTitles = true; }
    }
    if (followTitles) saveFollow();
    if (unreadTitles) saveUnread();
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
        if (wrap) toggle(chip.dataset.kind, wrap.dataset.tid, wrap.dataset.title);
      }
    }, true);
  }

  // ---------- Übersicht ----------

  let panelOpen = false;
  let launcher, panel, bodyEl, toastEl;

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

  function buildUI() {
    if (launcher) return;
    const style = el('style');
    style.id = 'igfu-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    launcher = button('', '', () => { panelOpen ? closePanel() : openPanel(); });
    launcher.id = 'igfu-launch';
    document.body.appendChild(launcher);

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
      button('igfu-link', 'Sichern', exportData, 'Alle Markierungen als Datei herunterladen'),
      button('igfu-link', 'Laden', () => fileInput.click(), 'Gesicherte Datei wieder einlesen'),
      fileInput,
      closeBtn,
    );
    head.appendChild(actions);

    bodyEl = el('div', 'igfu-body');
    panel.append(head, bodyEl);
    document.body.appendChild(panel);

    toastEl = el('div');
    toastEl.id = 'igfu-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen) closePanel(); });
  }

  function updateLauncher() {
    if (!launcher) return;
    const nUnread = Object.keys(unread).length;
    const all = Object.values(follow);
    const due = all.filter((f) => f.due && f.due <= todayStr()).length;
    launcher.textContent = '';
    launcher.append(el('span', '', 'Ungelesen ' + nUnread), el('span', '', 'Follow-ups ' + all.length));
    if (due) launcher.append(el('span', 'igfu-due-badge', due + ' fällig'));
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
          saveFollow(); renderPanel(); updateLauncher();
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
        li.appendChild(note);

        li.appendChild(el('div', 'igfu-meta', 'Markiert am ' + new Date(f.flaggedAt).toLocaleDateString('de-DE')));
        ul.appendChild(li);
      }
      bodyEl.appendChild(ul);
    }
  }

  function toast(msg) {
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
    while (e && e !== document.body) {
      const oy = getComputedStyle(e).overflowY;
      if (oy === 'auto' || oy === 'scroll') return e;
      e = e.parentElement;
    }
    return null;
  }

  // Scrollen per Code + Scroll-Ereignis, damit Metas Liste sicher nachrendert
  function setScrollTop(sc, v) {
    sc.scrollTop = v;
    sc.dispatchEvent(new Event('scroll'));
  }

  function highlight(row) {
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.removeAttribute('data-igfu-flash');
    void row.offsetWidth;
    row.setAttribute('data-igfu-flash', '');
    setTimeout(() => row.removeAttribute('data-igfu-flash'), 2000);
  }

  let revealing = false;
  async function reveal(tid) {
    if (revealing) return;
    revealing = true;
    try {
      let row = findRow(tid);
      if (row) return highlight(row);
      const sc = listScroller();
      if (!sc) return toast('Die Unterhaltungsliste wurde nicht gefunden.');
      toast('Suche in der Liste …');
      setScrollTop(sc, 0);
      await sleep(450);
      let stuck = 0;
      for (let i = 0; i < 200; i++) {
        row = findRow(tid);
        if (row) { toastEl.classList.remove('show'); return highlight(row); }
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
    if (now === wasInbox) return;
    wasInbox = now;
    if (now) {
      buildUI(); launcher.hidden = false; updateLauncher(); scanRows();
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
      closePanel();
    }
  }

  let scheduled = null;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      syncActive();
      if (isInbox()) { scanRows(); positionUI(); }
    }, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(syncActive, 1500);
  syncActive();
})();
