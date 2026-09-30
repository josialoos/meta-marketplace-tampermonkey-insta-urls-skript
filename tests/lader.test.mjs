import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const LADER = readFileSync(new URL('../postfach-lader.user.js', import.meta.url), 'utf8');

let fehl = 0, n = 0;
const pruefe = (name, ok, extra = '') => {
  n++;
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '   → ' + extra));
  if (!ok) fehl++;
};
const gruppe = (t) => console.log('\n' + t);

// Ein Kern, der nur festhaelt, womit er aufgerufen wurde. Muss die
// Plausibilitaetspruefung des Laders bestehen: lang genug und mit igfu-launch.
const kern = (marke) => `
  /* ${'x'.repeat(5200)} igfu-launch */
  globalThis.__gestartet = globalThis.__gestartet || [];
  globalThis.__gestartet.push({ marke: ${JSON.stringify(marke)}, hash: IGFU_START_HASH,
    hatGM: typeof GM_getValue === 'function' && typeof GM_xmlhttpRequest === 'function' });
`;

async function starte({ hash = '', antwort = 'ok', cache = null } = {}) {
  const dom = new JSDOM('<body></body>', {
    url: 'https://business.facebook.com/latest/inbox/all/' + hash,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  const store = new Map();
  if (cache) store.set('kern:cache:v1', cache);
  w.GM_getValue = (k, d) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d);
  w.GM_setValue = (k, v) => store.set(k, JSON.parse(JSON.stringify(v)));
  w.GM_addValueChangeListener = () => {};
  const urls = [];
  w.GM_xmlhttpRequest = (o) => {
    urls.push(o.url);
    w.setTimeout(() => {
      if (antwort === 'netz') return o.onerror && o.onerror({});
      if (antwort === 'kurz') return o.onload && o.onload({ status: 200, responseText: 'zu kurz' });
      if (antwort === 'fehler') return o.onload && o.onload({ status: 500, responseText: '' });
      o.onload && o.onload({ status: 200, responseText: kern('frisch') });
    }, 0);
  };
  w.eval(LADER);
  await new Promise((r) => w.setTimeout(r, 200));
  return { w, store, urls };
}

gruppe('Lader holt den Kern und führt ihn aus');
{
  const { w, store, urls } = await starte({ hash: '#igfu=T9' });
  const g = w.__gestartet || [];
  pruefe('Kern wurde gestartet', g.length === 1, JSON.stringify(g));
  pruefe('Es ist die frische Fassung', g[0] && g[0].marke === 'frisch');
  pruefe('Fragment wird durchgereicht', g[0] && g[0].hash === '#igfu=T9', g[0] && g[0].hash);
  pruefe('GM-Funktionen kommen an', g[0] && g[0].hatGM === true);
  pruefe('Kern wird zwischengespeichert', !!(store.get('kern:cache:v1') || {}).code);
  pruefe('Abruf umgeht den Zwischenspeicher', urls[0] && urls[0].includes('frisch='), urls[0]);
}

gruppe('Ohne Netz läuft die zuletzt geladene Fassung');
{
  const { w } = await starte({ antwort: 'netz', cache: { code: kern('aus dem Speicher'), stand: Date.now() - 7200000 } });
  const g = w.__gestartet || [];
  pruefe('Kern läuft trotzdem', g.length === 1, JSON.stringify(g));
  pruefe('Und zwar der zwischengespeicherte', g[0] && g[0].marke === 'aus dem Speicher');
}

gruppe('Unplausible Antwort wird nicht ausgeführt');
{
  const { w, store } = await starte({ antwort: 'kurz', cache: { code: kern('alt'), stand: Date.now() } });
  const g = w.__gestartet || [];
  pruefe('Der Fehlertext wird nicht gestartet', g.length === 1 && g[0].marke === 'alt', JSON.stringify(g));
  pruefe('Zwischenspeicher bleibt unangetastet',
    (store.get('kern:cache:v1') || {}).code.includes('alt'));
}

gruppe('Nichts da, nichts gespeichert');
{
  const { w } = await starte({ antwort: 'fehler' });
  pruefe('Kein Start, kein Absturz', !(w.__gestartet || []).length);
}

console.log('\n' + (fehl ? `${fehl} von ${n} Prüfungen fehlgeschlagen` : `Alle ${n} Prüfungen bestanden`));
process.exit(fehl ? 1 : 0);
