import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

export const SKRIPT = new URL('../postfach-markierungen.user.js', import.meta.url);
export const LISTE = '900000000001';
export const PAGE = '1605958876394212';
export const SPACE = '90151611845';
export const TAG = 'follow-up';

const zeile = (name, vorschau) =>
  `<div class="row" role="presentation"><div class="n">${name}</div><div class="p">${vorschau}</div><span class="t">12:30</span></div>`;

const vorschau = (text) => ({ props: { children: text } });
const avatar = (id) => ['https://scontent-muc2-1.cdninstagram.com/v/t51.2885-19/' + id + '_1234_n.jpg?stp=x'];

export const THREADS = [
  // Handle in der Vorschau, „gefällt"-Form
  { threadID: 'T1', title: 'Mara Kell', snippet: vorschau('marakell.runs gefällt eine Nachricht'), participantProfileURIs: avatar('111111111'), timestamp: new Date(2026, 8, 14, 12, 0, 0).getTime() },
  // Grossgeschriebener Vorname vor dem Doppelpunkt, das ist kein Handle
  { threadID: 'T2', title: 'Rosina Bärtl', snippet: vorschau('Rosina: Hallo Josia, danke dir!'), participantProfileURIs: avatar('222222222'), timestamp: new Date(2026, 8, 20, 9, 30, 0).getTime() },
  // Du hast zuletzt geschrieben, kein Handle zu holen
  { threadID: 'T3', title: 'Timo', snippet: vorschau('Du: Melde dich gern nochmal'), participantProfileURIs: avatar('333333333'), timestamp: new Date(2026, 7, 30, 18, 0, 0).getTime() },
  // Kein Instagram. Steht im Hauptpostfach mit drin und darf keine Pillen bekommen.
  { threadID: 'T4', title: 'Manage AI', snippet: vorschau('Du: Test'), participantProfileURIs: avatar('444444444'), timestamp: new Date(2026, 8, 25, 9, 0, 0).getTime(), commPlatform: 'MESSENGER' },
];

// Baut die Beschreibung so, wie das Skript sie schreibt.
export const beschreibungMit = (tid) =>
  `Unterhaltung im Postfach öffnen\n\nVom Postfach-Skript verwaltet.\nigfu-thread: ${tid}`;

// Jede Gruppe laesst sonst ein jsdom-Fenster mit laufenden Timern zurueck:
// syncActive alle 1,5 s, karteAuslesen alle 3 s, der ClickUp-Abruf alle zwei
// Minuten. Bei ueber siebzig Gruppen feuern am Ende Hunderte Timer gleichzeitig,
// der Lauf wird immer langsamer, und Pruefungen mit einem Zeitfenster fallen
// irgendwann um, obwohl am Skript nichts falsch ist. Genau das ist am 06.10.2026
// passiert, als acht neue Gruppen dazukamen.
//
// Deshalb wird das Fenster der vorigen Gruppe geschlossen. Sicher ist das, weil
// keine Gruppe zwei Fenster gleichzeitig braucht — „Speicher uebersteht ein
// Neuladen" greift nach dem zweiten starte() nur noch auf den Speicher zu, und
// der ist eine gewoehnliche Map.
let voriges = null;

export async function starte({
  pfad = '/latest/inbox/all/',
  speicher = {},
  tasks = [],
  tags = [TAG],            // im Space vorhandene Tags
  fehler = null,           // (methode, pfad) => 'netz'|'limit'|'token'|'weg'|'ungueltig'|null
  affiliates = null,       // [{ first_name, last_name, email, instagram, custom_fields }] für UpPromote
  karte = null,            // { handle } fuer die Kontaktkarte der geoeffneten Unterhaltung
  markt = null,            // [{ handle, bild }] baut stattdessen Marketplace-Karten
  zusatz = [],             // weitere Unterhaltungen hinter den vier festen
  metaUnterhaltungen = null, // [{ id, username, zeit }] fuer die Conversations-API
  ig = null,               // [{ id, titel, vorschau, zeit, ungelesen, bild }] baut die Instagram-Liste
  igOffen = null,          // { tid, handle, titel } simuliert eine geoeffnete Unterhaltung
  kommentare = null,       // { '<taskId>': [{ text, wer, wann }] } Notizen an Tasks
  stati = null,            // [{ status, color, orderindex }] die Status der Liste
  vorlagen = null,         // [{ id, titel, text, wer }] legt die Liste „Standardnachrichten" an
} = {}) {
  // Die vier festen Threads bleiben unangetastet, damit bestehende Pruefungen
  // ihre Zeilenzahl behalten. Wer eine fuenfte Unterhaltung braucht — etwa um
  // dieselbe Person in zwei Unterhaltungen zu haben — gibt sie hier mit.
  const threads = THREADS.concat(zusatz);
  const seitenleiste = karte
    ? '<aside><div>Instagram-Profil</div><div><a href="https://l.facebook.com/l.php">' + karte.handle + '</a></div></aside>'
    : '';
  const karten = (markt || []).map((c) =>
    '<div class="karte"><img src="https://scontent-muc2-1.cdninstagram.com/v/t51.2885-19/' + c.bild + '_9_n.jpg">'
    + '<div class="h">' + c.handle + '</div><div class="meta">1234 Follower</div></div>').join('');
  const body = markt
    ? '<body><div id="markt">' + karten + '</div></body>'
    : '<body><div id="liste">' + threads.map((t) => zeile(t.title, 'Hallo')).join('') + '</div>' + seitenleiste + '</body>';
  if (voriges) { try { voriges.close(); } catch { /* schon zu */ } }
  // Instagram bringt eine eigene Liste mit: andere Struktur, andere Domain.
  // Die Zeile traegt ihren Text in getrennten Elementen, genau wie dort.
  // ohneText: eine Zeile, die ihren Namen nicht selbst traegt. Damit klettert
  // das Skript auf der Suche nach Text nach oben — und muss an der Zeilengrenze
  // haltmachen, statt sich den Namen der Nachbarzeile zu nehmen.
  const igZeile = (c) =>
    '<div class="igrow">'
    + '<img src="https://scontent-fra3-1.cdninstagram.com/v/t51.82787-19/' + (c.bild || '900000001') + '_17967_n.jpg">'
    + (c.ohneText ? '' : '<span>' + c.titel + '</span>'
      + '<span>' + (c.vorschau || '') + '</span>'
      + '<span>' + (c.zeit || '5m') + '</span>'
      + (c.ungelesen ? '<span>Unread</span>' : ''))
    + '</div>';
  // Eine geoeffnete Unterhaltung: links die Leiste mit dem eigenen Konto als
  // reines Symbol, oben im Kopf der Profillink des Gegenuebers mit Text.
  // partner: In einer Partner-Unterhaltung traegt kein einziger Profillink
  // Text — auch der auf das Gegenueber nicht — und der Schraegstrich am Ende
  // fehlt. Unterscheidbar ist das Gegenueber dort nur daran, dass es vielfach
  // verlinkt ist, das eigene Konto dagegen nur in der Navigationsleiste.
  // Die Navigationsleiste, wie Instagram sie auf jeder Seite hat: „Entdecken",
  // „Reels" und das eigene Konto, alle drei als reine Symbole in einem
  // gemeinsamen Behälter. Daran erkennt das Skript das eigene Konto — ohne
  // diese Leiste im Prüfstand wäre die Regel nicht geprüft, und genau das war
  // am 19.10.2026 der Grund, warum ein Fehler durchrutschen konnte.
  const igLeiste = '<nav><a href="/explore/"><i></i></a><a href="/reels/"><i></i></a>'
    + '<a href="/tzampasfood/"><i></i></a></nav>'
    + '<header><h2>tzampasfood</h2></header>';
  // nurLeiste: eine Unterhaltung, in der das Gegenüber überhaupt nicht
  // verlinkt ist — gemessen am 19.10.2026 in einer echten Partner-Unterhaltung.
  // Dann bleibt nur das eigene Konto übrig, und genau dieser Fall hat in 7.7
  // vier Creator-Tasks den Handle „tzampasfood" eingetragen.
  const igKopf = igOffen && igOffen.nurLeiste
    ? igLeiste
    : igOffen
    ? igLeiste + '<section><div><div>' + (igOffen.partner
      // Eine Partner-Unterhaltung, am 28.10.2026 nachgemessen: kein einziger
      // Profillink, der Kopf ist ein div[role="button"] statt einer <a>, und
      // der Name steht ein **zweites** Mal im Verlauf, auf der Profilkarte
      // ganz oben. Ueber der steht nichts Bedienbares. Bis 8.7 blieben damit
      // zwei Kandidaten uebrig und die Kopfleiste fehlte ganz.
      ? ('<a href="/' + igOffen.handle + '"><i></i></a>').repeat(3)
        + '<div role="button"><div><div><h2><span>'
        + (igOffen.titel || igOffen.handle) + '</span></h2></div></div></div>'
        + '<div><div><div><div><h2><span>'
        + (igOffen.titel || igOffen.handle) + '</span></h2></div></div></div></div>'
      : '<a href="/' + igOffen.handle + '/" role="link"><div><div><h2><span>'
        + (igOffen.titel || igOffen.handle) + '</span></h2></div>'
        + '<div><span>' + igOffen.handle + '</span></div></div></a>') + '</div></div></section>'
    : igLeiste;
  // Die Verfassen-Zeile, wie sie am 20.10.2026 aussah: das Eingabefeld zwei
  // Ebenen unter einer niedrigen Zeile, die mehrere Symbole traegt.
  const igVerfassen = '<div id="vzeile">'
    + '<div role="button" aria-label="Emoji"></div>'
    + '<div><div role="textbox" contenteditable="true"></div></div>'
    + '<div role="button" aria-label="Foto"></div>'
    + '<div role="button" aria-label="Sticker"></div></div>';
  const igBody = '<body>' + igKopf + '<div id="igliste">' + (ig || []).map(igZeile).join('') + '</div>'
    + igVerfassen + '</body>';

  const dom = new JSDOM(ig ? igBody : body, {
    url: ig
      ? ('https://www.instagram.com/direct/' + (igOffen ? 't/' + igOffen.tid + '/' : 'inbox/'))
      : ('https://business.facebook.com' + pfad),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const doc = w.document;

  // jsdom misst nichts und liefert ueberall Hoehe 0. Die Verfassen-Zeile
  // braucht aber eine Hoehe unter 120, sonst findet vlZeile() sie nicht —
  // genau diese Schranke verhindert im Browser, dass der Knopf im ganzen
  // Fensterbereich landet.
  const echteMasse = w.Element.prototype.getBoundingClientRect;
  w.Element.prototype.getBoundingClientRect = function () {
    const r = echteMasse.call(this);
    if (this.id === 'vzeile') return { ...r, height: 44, width: 1377, top: 800, left: 500, bottom: 844, right: 1877 };
    return r;
  };

  // Weder DataTransfer noch ClipboardEvent kennt jsdom. Das Feld verhaelt
  // sich wie Lexical: Es faengt das Einfuege-Ereignis ab und uebernimmt den
  // Text **samt** Umbruechen. execCommand('insertText') dagegen verliert sie,
  // so wie am echten Feld gemessen — sonst saehe der alte, kaputte Weg hier
  // richtig aus.
  if (!w.DataTransfer) {
    w.DataTransfer = class {
      constructor() { this._d = {}; }
      setData(typ, wert) { this._d[typ] = String(wert); }
      getData(typ) { return this._d[typ] || ''; }
    };
  }
  if (!w.ClipboardEvent) {
    w.ClipboardEvent = class extends w.Event {
      constructor(typ, init = {}) { super(typ, init); this.clipboardData = init.clipboardData || null; }
    };
  }
  w.document.addEventListener('paste', (e) => {
    const f = w.document.querySelector('div[role="textbox"]');
    if (!f) return;
    e.preventDefault();
    f.textContent += (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  }, true);
  // Die Zwischenablage. jsdom bringt keine mit. `ablage.frei = false` stellt
  // eine Seite nach, die das Schreiben verbietet — dann muss der Rueckfall
  // ueber execCommand greifen.
  const ablage = { inhalt: '', weg: '', frei: true };
  Object.defineProperty(w.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (t) => {
        if (!ablage.frei) throw new Error('verboten');
        ablage.inhalt = String(t);
        ablage.weg = 'modern';
      },
    },
  });
  w.document.execCommand = (befehl, _ui, wert) => {
    if (befehl === 'copy') {
      const f = w.document.activeElement;
      if (!f || typeof f.value !== 'string') return false;
      ablage.inhalt = f.value;
      ablage.weg = 'alt';
      return true;
    }
    if (befehl !== 'insertText') return false;
    const f = w.document.querySelector('div[role="textbox"]');
    if (!f) return false;
    f.textContent += String(wert).replace(/\n/g, '');
    return true;
  };

  [...doc.querySelectorAll('.row')].forEach((r, i) => {
    r['__reactFiber$test'] = { memoizedProps: { thread: threads[i] }, return: null, alternate: null };
  });
  // Auf instagram.com haengt die Kennung an props.threadRef.thread_key, und das
  // Element findet das Skript ueber fiber.stateNode.
  [...doc.querySelectorAll('.igrow')].forEach((r, i) => {
    const c = ig[i] || {};
    // `users` traegt in beiden Postfaechern genau einen Eintrag, den Gegenueber.
    // Fehlt die Angabe im Test, bleibt sie weg — dann muss das Skript ohne ID
    // zurechtkommen, so wie bei alten Unterhaltungen.
    const ref = { thread_key: String(c.id || ''), thread_fbid: 'fb' + i };
    // Zwei Formen desselben Eintrags. Bis Oktober 2026 stand die ID als `id`
    // am Objekt; seit einem Umbau liefert Instagram nur noch eine
    // Relay-Referenz mit `__id: 'XDTUserDict:<id>'` und *ohne* `id`. Beide
    // muessen gelesen werden, damit ein Rueckbau bei Instagram nichts kostet.
    if (c.nutzer) ref.users = [{ id: String(c.nutzer) }];
    else if (c.nutzerRef) ref.users = [{ __id: 'XDTUserDict:' + c.nutzerRef, __fragments: {} }];
    if (c.postfach) {
      ref.thread_subtype = c.postfach === 'partner'
        ? 'IGD_BC_PARTNERSHIP' : 'IG_BUSINESS_ACCOUNT_ONE_TO_ONE';
      if (c.postfach === 'partner') ref.is_group = true;
    }
    r['__reactFiber$test'] = {
      memoizedProps: { threadRef: ref },
      stateNode: r, child: null, return: null, alternate: null,
    };
  });

  // jsdom kennt kein innerText. Ohne Ersatz zieht textContent alle Texte zu
  // einem Klumpen zusammen — und genau an den Umbruechen haengt auf
  // instagram.com die Struktur der Zeile. Ein Mutationstest lief deshalb
  // gruen durch, obwohl der Fehler im Browser aufgetreten waere.
  // Je Textknoten eine Zeile, so wie es der Browser hier auch tut.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      const teile = [];
      (function lauf(knoten) {
        for (const k of knoten.childNodes) {
          if (k.nodeType === 3) { const t = String(k.textContent || '').trim(); if (t) teile.push(t); }
          else if (k.nodeType === 1) lauf(k);
        }
      })(this);
      return teile.join('\n');
    },
  });

  const store = new Map(Object.entries(speicher));
  w.GM_getValue = (k, d) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d);
  w.GM_setValue = (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); };
  w.GM_addValueChangeListener = () => {};

  const aufrufe = [];
  const spaceTags = [...tags];
  const VLISTE = '900000000002';
  const WORKSPACE = '900000009';
  const vorlagenTasks = (vorlagen || []).map((v, i) => (
    { id: v.id || ('vl' + i), titel: v.titel, text: v.text, wer: v.wer || '' }));
  const serverTasks = tasks.map((t) => ({ tags: [], ...t }));
  // Notizen je Task. ClickUp liefert sie neueste zuerst — genau so gibt der
  // Pruefstand sie auch heraus, sonst waere das Sortieren im Skript ungeprueft.
  const kommentarListen = {};
  for (const [id, liste] of Object.entries(kommentare || {})) {
    kommentarListen[id] = liste.map((k, i) => ({
      id: k.id || (id + '-k' + i),
      comment_text: k.text,
      user: k.wer ? { username: k.wer } : undefined,
      date: String(k.wann || (1700000000000 + i * 60000)),
    }));
  }
  let naechste = 100;

  const alsApiTask = (t) => ({
    id: t.id,
    name: t.name,
    url: 'https://app.clickup.com/t/' + t.id,
    status: { status: t.status, color: t.farbe },
    due_date: t.due || null,
    start_date: t.start || null,
    description: t.beschreibung || '',
    text_content: t.beschreibung || '',
    tags: (t.tags || []).map((n) => ({ name: n })),
    priority: t.prio ? { priority: t.prio, color: '#f50000' } : null,
    custom_fields: t.custom_fields || [],
  });

  const antwort = (methode, url, data) => {
    if (url.startsWith('https://graph.facebook.com')) {
      aufrufe.push({ methode, pfad: 'META' + url.replace(/^https:\/\/graph\.facebook\.com\/v[0-9.]+/, ''), data: null });
      const f = fehler && fehler(methode, 'META');
      if (f === 'token') return { status: 401, responseText: JSON.stringify({ error: { message: 'Invalid OAuth token' } }) };
      if (f === 'netz') return { netz: true };
      return {
        status: 200,
        responseText: JSON.stringify({
          data: (metaUnterhaltungen || []).map((u) => ({
            id: u.id,
            updated_time: new Date(u.zeit).toISOString(),
            participants: { data: [
              { id: PAGE, username: 'tzampas.food', name: 'Tzampas Food' },
              { id: u.id + '_p', username: u.username, name: u.name || u.username },
            ] },
          })),
        }),
      };
    }
    if (url.startsWith('https://aff-api.uppromote.com/api/v2')) {
      const pf = url.replace('https://aff-api.uppromote.com/api/v2', '');
      aufrufe.push({ methode, pfad: 'UP' + pf, data: null });
      const f = fehler && fehler(methode, 'UP' + pf);
      if (f === 'token') return { status: 401, responseText: JSON.stringify({ message: 'Invalid API key' }) };
      if (f === 'netz') return { netz: true };
      const seite = Number((pf.match(/[?&]page=(\d+)/) || [])[1] || 1);
      return { status: 200, responseText: JSON.stringify({ data: seite === 1 ? (affiliates || []) : [] }) };
    }
    const pf = url.replace('https://api.clickup.com/api/v2', '');
    aufrufe.push({ methode, pfad: pf, data: data ? JSON.parse(data) : null });

    const f = fehler && fehler(methode, pf);
    if (f === 'netz') return { netz: true };
    if (f === 'limit') return { status: 429, responseText: '' };
    if (f === 'token') return { status: 401, responseText: '' };
    if (f === 'weg') return { status: 404, responseText: '' };
    if (f === 'ungueltig') return { status: 400, responseText: '' };
    if (f === 'mitGrund') return { status: 400, responseText: JSON.stringify({ err: 'Custom field usages exceeded for your plan', ECODE: 'FIELD_017' }) };

    const ok = (o) => ({ status: 200, responseText: JSON.stringify(o || {}) });

    if (methode === 'GET' && pf === '/team') return ok({ teams: [{ id: WORKSPACE, name: 'Workspace' }] });
    // --- Vorlagenliste. Muss vor den allgemeinen Regeln stehen, sonst
    // greift die Task-Abfrage fuer *jede* Liste. ---
    if (methode === 'GET' && /^\/space\/[^/]+\/list/.test(pf)) {
      return ok({ lists: vorlagen ? [{ id: VLISTE, name: 'Standardnachrichten' }] : [] });
    }
    if (methode === 'GET' && pf.startsWith('/list/' + VLISTE + '/task')) {
      // ClickUp liefert den Urheber als creator.username. Fehlt er, fehlt das
      // Feld ganz — genau so stellt es der Pruefstand nach.
      return ok({ tasks: vorlagenTasks.filter((v) => !v.zu).map((v) => {
        const t = { id: v.id, name: v.titel, text_content: v.text };
        if (v.wer) t.creator = { username: v.wer };
        return t;
      }) });
    }
    if (methode === 'POST' && pf === '/list/' + VLISTE + '/task') {
      const k = JSON.parse(data);
      const neu = { id: 'vl' + (naechste++), titel: k.name, text: k.description || '', wer: '' };
      vorlagenTasks.push(neu);
      return ok({ id: neu.id });
    }
    // --- Notizen. Muss vor der allgemeinen Task-Abfrage stehen, sonst
    // schluckt die /task/<id>/comment mit. ---
    if (/^\/task\/[^/]+\/comment$/.test(pf)) {
      const id = pf.split('/')[2];
      if (methode === 'GET') {
        return ok({ comments: [...(kommentarListen[id] || [])].reverse() });
      }
      if (methode === 'POST') {
        const k = JSON.parse(data);
        if (!kommentarListen[id]) kommentarListen[id] = [];
        kommentarListen[id].push({
          id: id + '-k' + kommentarListen[id].length,
          comment_text: k.comment_text,
          user: { username: 'Josia Loos' },
          date: String(Date.now()),
        });
        return ok({ id: 'neu' });
      }
    }
    if (methode === 'GET' && /^\/list\/[^/]+$/.test(pf)) {
      // ClickUp liefert die Status der Liste gleich mit, unsortiert und mit
      // orderindex. Der Pruefstand gibt sie bewusst in falscher Reihenfolge
      // heraus, damit das Sortieren im Skript geprueft ist.
      return ok({
        id: LISTE,
        space: { id: SPACE },
        statuses: stati || [
          { status: 'hat sales', color: '#e16b16', orderindex: 7 },
          { status: 'recherchiert', color: '#87909e', orderindex: 0 },
          { status: 'angeschrieben', color: '#87909e', orderindex: 1 },
          { status: 'abgesagt', color: '#d33d44', orderindex: 8 },
        ],
      });
    }
    if (methode === 'GET' && /^\/task\/[^/?]+/.test(pf)) {
      const id = pf.split('/')[2].split('?')[0];
      const t = serverTasks.find((x) => x.id === id);
      return t ? ok(alsApiTask(t)) : { status: 404, responseText: '' };
    }
    if (methode === 'GET' && /^\/space\/[^/]+\/tag$/.test(pf)) return ok({ tags: spaceTags.map((n) => ({ name: n })) });
    if (methode === 'POST' && /^\/space\/[^/]+\/tag$/.test(pf)) {
      spaceTags.push(JSON.parse(data).tag.name);
      return ok();
    }
    if (methode === 'GET' && pf.includes('/task?')) {
      const seite = Number((pf.match(/page=(\d+)/) || [])[1] || 0);
      return ok({ tasks: seite === 0 ? serverTasks.map(alsApiTask) : [], last_page: true });
    }
    if (methode === 'POST' && /^\/list\/[^/]+\/task$/.test(pf)) {
      const k = JSON.parse(data);
      const neu = { id: 'neu' + (naechste++), name: k.name, status: k.status || 'recherchiert', farbe: '#87909e',
                    beschreibung: k.markdown_description || '', tags: [], due: null, start: k.start_date || null };
      serverTasks.push(neu);
      return ok(alsApiTask(neu));
    }
    const tagTreffer = pf.match(/^\/task\/([^/]+)\/tag\/(.+)$/);
    if (tagTreffer) {
      const t = serverTasks.find((x) => x.id === tagTreffer[1]);
      const name = decodeURIComponent(tagTreffer[2]);
      if (!t) return { status: 404, responseText: '' };
      if (methode === 'POST') { if (!t.tags.includes(name)) t.tags.push(name); return ok(); }
      if (methode === 'DELETE') {
        if (!t.tags.includes(name)) return { status: 404, responseText: '' };
        t.tags = t.tags.filter((x) => x !== name);
        return ok();
      }
    }
    if (methode === 'PUT' && /^\/task\/vl[0-9]+$/.test(pf)) {
      const v = vorlagenTasks.find((x) => x.id === pf.split('/')[2]);
      if (!v) return { status: 404, responseText: '' };
      const k = JSON.parse(data);
      if (k.name !== undefined) v.titel = k.name;
      if (k.description !== undefined) v.text = k.description;
      if (k.status === 'closed') v.zu = true;
      return ok();
    }
    if (methode === 'PUT' && /^\/task\/[^/]+$/.test(pf)) {
      const t = serverTasks.find((x) => x.id === pf.split('/')[2]);
      const k = JSON.parse(data);
      if (t && 'due_date' in k) t.due = k.due_date;
      if (t && k.name) t.name = k.name;
      if (t && k.status) t.status = k.status;
      if (t && k.markdown_description) t.beschreibung = k.markdown_description;
      if (t && 'start_date' in k) t.start = k.start_date;
      if (t && 'priority' in k) t.prio = k.priority === 1 ? 'urgent' : '';
      return ok();
    }
    if (methode === 'POST' && /\/comment$/.test(pf)) return ok({ id: 'k1' });
    return { status: 404, responseText: '' };
  };

  w.GM_xmlhttpRequest = (o) => {
    const a = antwort(o.method, o.url, o.data);
    w.setTimeout(() => { if (a.netz) o.onerror && o.onerror({}); else o.onload && o.onload(a); }, 0);
  };
  w.open = (url) => { (w.__geoeffnet = w.__geoeffnet || []).push(url); return null; };

  // Klicks auf Zeilen schon vor dem Start des Skripts mitschneiden, sonst
  // entgehen uns die, die direkt beim Laden passieren.
  w.__zeilenKlicks = [];
  doc.addEventListener('click', (e) => {
    const r = e.target && e.target.closest && e.target.closest('.row');
    if (r) w.__zeilenKlicks.push([...doc.querySelectorAll('.row')].indexOf(r));
  }, true);
  w.__flashGesehen = [];
  new w.MutationObserver((ms) => {
    for (const m of ms) {
      if (m.attributeName === 'data-igfu-flash' && m.target.hasAttribute('data-igfu-flash')) {
        w.__flashGesehen.push([...doc.querySelectorAll('.row')].indexOf(m.target));
      }
    }
  }).observe(doc.body, { attributes: true, subtree: true, attributeFilter: ['data-igfu-flash'] });

  w.eval(readFileSync(SKRIPT, 'utf8'));
  voriges = w;
  // Nicht blind warten, sondern bis die Zeilen versorgt sind. Eine feste
  // Wartezeit haelt nur so lange, wie der Lauf schnell ist — wird die Suite
  // laenger, fallen Pruefungen um, obwohl am Skript nichts falsch ist. Genau
  // das ist am 06.10. und am 09.10.2026 passiert.
  // Zeilen ohne eigenen Text bekommen bewusst keine Knopfleiste — sie werden
  // uebersprungen, statt sich einen fremden Namen zu borgen. Sie zaehlen hier
  // also nicht mit, sonst liefe die Wartschleife in ihre Schranke.
  const erwartet = ig
    ? ig.filter((c) => !c.ohneText).length
    : (markt ? 0 : THREADS.concat(zusatz).filter((t) => !t.commPlatform || t.commPlatform === 'INSTAGRAM_DIRECT').length);
  for (let i = 0; i < 40 && erwartet; i++) {
    if (doc.querySelectorAll('.igfu-tags').length >= erwartet) break;
    await warte(w, 50);
  }
  // Auf das Menü gesondert warten. Es entsteht erst, wenn ClickUp eingerichtet
  // ist, und zwar unabhaengig von den Zeilen — knopf() griff deshalb
  // gelegentlich ins Leere und die Suite brach ab. Am 15.10.2026 gemessen: in
  // etwa jedem zweiten Lauf, immer an einer anderen Stelle. Ein Testlauf, der
  // zufaellig rot wird, entwertet jede Mutationspruefung.
  // Nicht nur darauf warten, *dass* Knöpfe da sind, sondern dass das Menü
  // steht. Es wird neu aufgebaut, sobald die Task-Liste eintrifft — wer in die
  // Lücke dazwischen greift, findet nichts, und zwar an wechselnder Stelle.
  // Geprüft wird deshalb auf eine dreimal gleiche Anzahl.
  let zuletzt = -1;
  let stabil = 0;
  for (let i = 0; i < 80 && speicher['clickup:token:v1']; i++) {
    const n = doc.querySelectorAll('.igfu-form button').length;
    if (n > 0 && n === zuletzt) { stabil += 1; if (stabil >= 2) break; } else { stabil = 0; }
    zuletzt = n;
    await warte(w, 50);
  }
  await warte(w, 120);
  return { dom, w, doc, store, aufrufe, serverTasks, spaceTags, vorlagenTasks, kommentarListen, ablage };
}

// Bausteine fuer eigene Unterhaltungen in einzelnen Pruefungen.
export const macheThread = ({ id, titel, vorschau: v, bild = '999999999', zeit }) => ({
  threadID: id,
  title: titel,
  snippet: { props: { children: v } },
  participantProfileURIs: ['https://scontent-muc2-1.cdninstagram.com/v/t51.2885-19/' + bild + '_1234_n.jpg?stp=x'],
  timestamp: zeit,
});

export const warte = (w, ms) => new Promise((r) => w.setTimeout(r, ms));
// Zeilen heissen im alten Postfach .row und auf instagram.com .igrow.
export const chip = (doc, i, art) =>
  doc.querySelectorAll('.row, .igrow')[i].querySelector(`.igfu-tag[data-kind="${art}"]`);
// Fehlt das Element, soll die Meldung sagen was, statt nur „undefined".
// Bei Mutationstests ist das der Unterschied zwischen einer Minute und einer
// halben Stunde Suche.
export const klick = (w, el) => {
  if (!el) throw new Error('klick: Element nicht gefunden — vermutlich hat sich die Oberfläche geändert');
  return el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
};
export const knopf = (doc, text) => [...doc.querySelectorAll('.igfu-form button')].find((b) => b.textContent === text);

// Wartet, bis der Knopf da ist, und klickt dann erst.
//
// Das Menü wird neu aufgebaut, sobald die Task-Liste eintrifft. Ein synchroner
// Zugriff erwischt sonst die Lücke dazwischen — und weil die Klicks über die
// ganze Suite verteilt sind, an wechselnder Stelle. Am 15.10.2026 brach etwa
// jeder zweite Lauf ab, mal in Zeile 68, mal 733, mal 2186. Eine Wartebedingung
// beim Start kann das prinzipiell nicht abfangen.
export const klickKnopf = async (w, doc, text) => {
  for (let i = 0; i < 60; i++) {
    const b = knopf(doc, text);
    if (b) return klick(w, b);
    await warte(w, 50);
  }
  throw new Error('klickKnopf: „' + text + '" ist auch nach drei Sekunden nicht da');
};
