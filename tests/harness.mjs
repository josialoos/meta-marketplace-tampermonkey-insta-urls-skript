import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

export const SKRIPT = new URL('../postfach-markierungen.user.js', import.meta.url);
export const LISTE = '900000000001';
export const SPACE = '90151611845';
export const TAG = 'follow-up';

const zeile = (name, vorschau) =>
  `<div class="row" role="presentation"><div class="n">${name}</div><div class="p">${vorschau}</div><span class="t">12:30</span></div>`;

const vorschau = (text) => ({ props: { children: text } });
const avatar = (id) => ['https://scontent-muc2-1.cdninstagram.com/v/t51.2885-19/' + id + '_1234_n.jpg?stp=x'];

export const THREADS = [
  // Handle in der Vorschau, „gefällt"-Form
  { threadID: 'T1', title: 'Anna Bolko', snippet: vorschau('annabolko.runs gefällt eine Nachricht'), participantProfileURIs: avatar('111111111'), timestamp: new Date(2026, 8, 14, 12, 0, 0).getTime() },
  // Grossgeschriebener Vorname vor dem Doppelpunkt, das ist kein Handle
  { threadID: 'T2', title: 'Corina Bösch', snippet: vorschau('Corina: Hallo Josia, danke dir!'), participantProfileURIs: avatar('222222222'), timestamp: new Date(2026, 8, 20, 9, 30, 0).getTime() },
  // Du hast zuletzt geschrieben, kein Handle zu holen
  { threadID: 'T3', title: 'Willi', snippet: vorschau('Du: Melde dich gern nochmal'), participantProfileURIs: avatar('333333333'), timestamp: new Date(2026, 7, 30, 18, 0, 0).getTime() },
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
  const dom = new JSDOM(body, {
    url: 'https://business.facebook.com' + pfad,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const doc = w.document;

  [...doc.querySelectorAll('.row')].forEach((r, i) => {
    r['__reactFiber$test'] = { memoizedProps: { thread: threads[i] }, return: null, alternate: null };
  });

  const store = new Map(Object.entries(speicher));
  w.GM_getValue = (k, d) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d);
  w.GM_setValue = (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); };
  w.GM_addValueChangeListener = () => {};

  const aufrufe = [];
  const spaceTags = [...tags];
  const serverTasks = tasks.map((t) => ({ tags: [], ...t }));
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

    if (methode === 'GET' && /^\/list\/[^/]+$/.test(pf)) return ok({ id: LISTE, space: { id: SPACE } });
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
  await warte(w, 400);
  return { dom, w, doc, store, aufrufe, serverTasks, spaceTags };
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
export const chip = (doc, i, art) => doc.querySelectorAll('.row')[i].querySelector(`.igfu-tag[data-kind="${art}"]`);
export const klick = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
export const knopf = (doc, text) => [...doc.querySelectorAll('.igfu-form button')].find((b) => b.textContent === text);
