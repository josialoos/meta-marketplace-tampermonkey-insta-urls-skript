import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

export const SKRIPT = new URL('../postfach-markierungen.user.js', import.meta.url);

export const LISTE = '1200250000007224';
export const FELDER = {
  'Thread-ID': 'f-thread',
  'Follow-up': 'f-follow',
  'Instagram-Handle': 'f-handle',
  'Postfach-Link': 'f-link',
};

const zeile = (name, vorschau) =>
  `<div class="row" role="presentation"><div class="n">${name}</div><div class="p">${vorschau}</div><span class="t">12:30</span></div>`;

export const THREADS = [
  { threadID: 'T1', title: 'Anna Bolko' },
  { threadID: 'T2', title: 'Corina Bösch' },
  { threadID: 'T3', title: 'Willi' },
];

// Baut eine Umgebung auf: jsdom + GM-Speicher + nachgebildete ClickUp-API.
export async function starte({
  pfad = '/latest/inbox/all/',
  speicher = {},
  tasks = [],
  fehler = null,          // (methode, pfad) => 'netz' | 'limit' | 'token' | null
} = {}) {
  const body = '<body><div id="liste">' + THREADS.map((t) => zeile(t.title, 'Hallo')).join('') + '</div></body>';
  const dom = new JSDOM(body, {
    url: 'https://business.facebook.com' + pfad,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const doc = w.document;

  // Fiber an die Zeilen haengen, wie Meta es tut
  const reihen = [...doc.querySelectorAll('.row')];
  reihen.forEach((r, i) => {
    r['__reactFiber$test'] = { memoizedProps: { thread: THREADS[i] }, return: null, alternate: null };
  });

  // --- GM-Speicher ---
  const store = new Map(Object.entries(speicher));
  const horcher = [];
  w.GM_getValue = (k, d) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d);
  w.GM_setValue = (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); };
  w.GM_addValueChangeListener = (k, cb) => { horcher.push([k, cb]); };

  // --- ClickUp-Nachbildung ---
  const aufrufe = [];
  let naechsteId = 100;
  const serverTasks = tasks.map((t) => ({ ...t }));

  const antwort = (methode, url, data) => {
    const pfadTeil = url.replace('https://api.clickup.com/api/v2', '');
    aufrufe.push({ methode, pfad: pfadTeil, data: data ? JSON.parse(data) : null });

    const f = fehler && fehler(methode, pfadTeil);
    if (f === 'netz') return { netz: true };
    if (f === 'limit') return { status: 429, responseText: '' };
    if (f === 'token') return { status: 401, responseText: '' };

    if (methode === 'GET' && pfadTeil.endsWith('/field')) {
      return { status: 200, responseText: JSON.stringify({
        fields: Object.entries(FELDER).map(([name, id]) => ({ id, name })),
      }) };
    }
    if (methode === 'GET' && pfadTeil.includes('/task?')) {
      const seite = Number((pfadTeil.match(/page=(\d+)/) || [])[1] || 0);
      return { status: 200, responseText: JSON.stringify({
        tasks: seite === 0 ? serverTasks.map(alsApiTask) : [],
        last_page: seite > 0 || serverTasks.length < 100,
      }) };
    }
    if (methode === 'POST' && /^\/list\/[^/]+\/task$/.test(pfadTeil)) {
      const k = JSON.parse(data);
      const neu = {
        id: 'neu' + (naechsteId++),
        name: k.name,
        status: 'angeschrieben',
        farbe: '#87909e',
        felder: Object.fromEntries((k.custom_fields || []).map((c) => [c.id, c.value])),
        due: null,
      };
      serverTasks.push(neu);
      return { status: 200, responseText: JSON.stringify(alsApiTask(neu)) };
    }
    if (methode === 'POST' && /\/field\//.test(pfadTeil)) {
      const [, taskId, feldId] = pfadTeil.match(/^\/task\/([^/]+)\/field\/([^/]+)$/);
      const t = serverTasks.find((x) => x.id === taskId);
      if (t) t.felder[feldId] = JSON.parse(data).value;
      return { status: 200, responseText: '{}' };
    }
    if (methode === 'PUT' && /^\/task\/[^/]+$/.test(pfadTeil)) {
      const t = serverTasks.find((x) => x.id === pfadTeil.split('/')[2]);
      if (t) t.due = JSON.parse(data).due_date;
      return { status: 200, responseText: '{}' };
    }
    if (methode === 'POST' && /\/comment$/.test(pfadTeil)) {
      return { status: 200, responseText: JSON.stringify({ id: 'k1' }) };
    }
    return { status: 404, responseText: '' };
  };

  function alsApiTask(t) {
    return {
      id: t.id,
      name: t.name,
      url: 'https://app.clickup.com/t/' + t.id,
      status: { status: t.status, color: t.farbe },
      due_date: t.due || null,
      custom_fields: Object.entries(FELDER).map(([name, id]) => ({ id, name, value: t.felder[id] })),
    };
  }

  w.GM_xmlhttpRequest = (o) => {
    const a = antwort(o.method, o.url, o.data);
    w.setTimeout(() => {
      if (a.netz) o.onerror && o.onerror({});
      else o.onload && o.onload(a);
    }, 0);
  };

  w.open = (url) => { (w.__geoeffnet = w.__geoeffnet || []).push(url); return null; };

  w.eval(readFileSync(SKRIPT, 'utf8'));
  await warte(w, 400);
  return { dom, w, doc, store, aufrufe, serverTasks, reihen };
}

export const warte = (w, ms) => new Promise((r) => w.setTimeout(r, ms));
export const chip = (doc, i, art) => doc.querySelectorAll('.row')[i].querySelector(`.igfu-tag[data-kind="${art}"]`);
export const klick = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
