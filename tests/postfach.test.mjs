import { starte, warte, chip, klick, knopf, klickKnopf, beschreibungMit, macheThread, LISTE, SPACE, TAG, PAGE } from './harness.mjs';
import { readFileSync } from 'node:fs';

let fehlgeschlagen = 0, gelaufen = 0;
const pruefe = (name, bedingung, extra = '') => {
  gelaufen++;
  console.log((bedingung ? '  ok   ' : '  FEHL ') + name + (bedingung ? '' : '   → ' + extra));
  if (!bedingung) fehlgeschlagen++;
};
const gruppe = (t) => console.log('\n' + t);
const MIT_CLICKUP = { 'clickup:token:v1': 'pk_geheim_123', 'clickup:list:v1': LISTE };
const angelegte = (a) => a.filter((x) => x.methode === 'POST' && /^\/list\/[^/]+\/task$/.test(x.pfad));

gruppe('Ohne ClickUp bleibt alles wie vorher');
{
  const { doc, w, store, aufrufe } = await starte();
  pruefe('Knöpfe erscheinen an jeder Zeile', doc.querySelectorAll('.igfu-tag[data-kind="followup"]').length === 3);
  pruefe('CRM-Pille ist ausgeblendet', chip(doc, 0, 'crm').hidden === true);
  pruefe('Keine einzige Anfrage an ClickUp', aufrufe.length === 0, JSON.stringify(aufrufe));
  let zeileSahKlick = false;
  doc.querySelector('.row').addEventListener('click', () => { zeileSahKlick = true; });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 50);
  pruefe('Klick öffnet die Unterhaltung nicht', zeileSahKlick === false);
  pruefe('Follow-up landet im lokalen Speicher', !!store.get('igfu:v1').T1);
  pruefe('Zeile ist als Follow-up markiert', doc.querySelector('.row').hasAttribute('data-igfu-follow'));
}

gruppe('Außerhalb des Postfachs passiert nichts');
{
  const { doc, aufrufe } = await starte({ pfad: '/latest/home/', speicher: MIT_CLICKUP });
  pruefe('Keine Knöpfe', doc.querySelectorAll('.igfu-tag').length === 0);
  pruefe('Keine Anfrage an ClickUp', aufrufe.length === 0, JSON.stringify(aufrufe.map((a) => a.pfad)));
}

gruppe('Keine einzige Befüllung eines Custom Fields');
{
  const { w, doc, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  pruefe('Kein Aufruf auf einen Feld-Endpunkt', !aufrufe.some((a) => a.pfad.includes('/field')),
    JSON.stringify(aufrufe.map((a) => a.pfad)));
  pruefe('Kein custom_fields in der Nutzlast',
    !aufrufe.some((a) => a.data && Object.prototype.hasOwnProperty.call(a.data, 'custom_fields')));
}

gruppe('Status aus ClickUp erscheint in der Zeile');
{
  const { doc } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'verhandlung', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  const c = chip(doc, 0, 'crm');
  pruefe('Thread wird über die Beschreibung erkannt', c.textContent === 'verhandlung', c.textContent);
  pruefe('CRM-Pille trägt die Statusfarbe', c.style.background === 'rgb(182, 96, 224)', c.style.background);
  pruefe('Zeile ohne Task zeigt das Pluszeichen', chip(doc, 1, 'crm').textContent === 'CRM +');
  pruefe('Tag wird als Follow-up gelesen', doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Alte Tasks mit Custom Field werden weiter erkannt');
{
  const { doc } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'alt', name: 'Timo', status: 'zugesagt', farbe: '#30a46c', beschreibung: '',
              custom_fields: [{ id: 'f1', name: 'Thread-ID', value: 'T3' }] }],
  });
  pruefe('Rückfall auf das alte Feld greift', chip(doc, 2, 'crm').textContent === 'zugesagt',
    chip(doc, 2, 'crm').textContent);
}

gruppe('Follow-up-Klick legt Task an und setzt den Tag');
{
  const { doc, w, aufrufe, serverTasks } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 1, 'followup'));
  await warte(w, 600);
  const neu = angelegte(aufrufe);
  pruefe('Genau ein Task wurde angelegt', neu.length === 1, JSON.stringify(neu.map((n) => n.data.name)));
  pruefe('Task trägt den Anzeigenamen', neu[0] && neu[0].data.name === 'Rosina Bärtl');
  const b = neu[0] ? neu[0].data.markdown_description : '';
  pruefe('Markerzeile steht in der Beschreibung', /igfu-thread:\s*T2/.test(b), b);
  pruefe('Rücksprung-Link zeigt direkt auf die Unterhaltung',
    b.includes('selected_item_id=T2') && b.includes('thread_type=IG_MESSAGE'), b);
  pruefe('Tag wurde gesetzt', serverTasks[0] && serverTasks[0].tags.includes(TAG),
    JSON.stringify(serverTasks[0] && serverTasks[0].tags));
}

gruppe('Fehlender Tag wird einmalig im Space angelegt');
{
  const { doc, w, aufrufe, spaceTags } = await starte({ speicher: MIT_CLICKUP, tags: [] });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  pruefe('Tag existiert danach im Space', spaceTags.includes(TAG), JSON.stringify(spaceTags));
  klick(w, chip(doc, 1, 'followup'));
  await warte(w, 600);
  // Nur der Follow-up-Tag wird gezaehlt: „karteileiche" legt das Skript beim
  // Aktualisieren ebenfalls an, das gehoert hier nicht zur Frage.
  pruefe('Tag wird nur einmal angelegt',
    aufrufe.filter((a) => a.methode === 'POST' && /^\/space\/[^/]+\/tag$/.test(a.pfad)
      && a.data && a.data.tag && a.data.tag.name === TAG).length === 1);
}

gruppe('Follow-up abräumen entfernt den Tag');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '' } } },
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  pruefe('Startet als markiert', chip(doc, 0, 'followup').classList.contains('on'));
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  pruefe('Tag ist weg', !serverTasks[0].tags.includes(TAG), JSON.stringify(serverTasks[0].tags));
  pruefe('Kein neuer Task', angelegte(aufrufe).length === 0);
}

gruppe('Abräumen ohne Task legt keinen an');
{
  const { doc, w, aufrufe } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '' } } },
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  pruefe('Kein Task wurde angelegt', angelegte(aufrufe).length === 0);
}

gruppe('CRM-Pille öffnet den vorhandenen Task');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'zugesagt', farbe: '#30a46c', beschreibung: beschreibungMit('T1') }],
  });
  klick(w, chip(doc, 0, 'crm'));
  await warte(w, 100);
  pruefe('Task wird in neuem Tab geöffnet', (w.__geoeffnet || [])[0] === 'https://app.clickup.com/t/a1');
}

gruppe('Netzwerkfehler: Änderung bleibt lokal und in der Warteschlange');
{
  const { doc, w, store } = await starte({ speicher: MIT_CLICKUP, fehler: (m) => (m === 'POST' ? 'netz' : null) });
  klick(w, chip(doc, 2, 'followup'));
  await warte(w, 600);
  pruefe('Lokal ist die Markierung gesetzt', !!store.get('igfu:v1').T3);
  const q = store.get('clickup:queue:v1') || [];
  pruefe('Auftrag steht in der Warteschlange', q.length === 1 && q[0].tid === 'T3', JSON.stringify(q));
  pruefe('Der Versuch wurde gezählt', q[0] && q[0].versuche >= 1);
}

gruppe('Abgelehnter Token: nichts geht verloren');
{
  const { doc, w, store } = await starte({ speicher: MIT_CLICKUP, fehler: () => 'token' });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  const q = store.get('clickup:queue:v1') || [];
  pruefe('Auftrag bleibt stehen', q.length === 1 && q[0].tid === 'T1', JSON.stringify(q));
  pruefe('Kein sinnloser Wiederholungszähler', q[0] && q[0].versuche === 0);
  pruefe('Lokale Markierung bleibt', !!store.get('igfu:v1').T1);
}

gruppe('Aussichtsloser Auftrag verstopft die Warteschlange nicht');
{
  const { doc, w, store } = await starte({
    speicher: MIT_CLICKUP,
    fehler: (m, p) => (m === 'POST' && /^\/list\/[^/]+\/task$/.test(p) ? 'ungueltig' : null),
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 700);
  pruefe('Auftrag wurde verworfen', (store.get('clickup:queue:v1') || []).length === 0);
  pruefe('Lokale Markierung bleibt trotzdem', !!store.get('igfu:v1').T1);
}

gruppe('Token bleibt im GM-Speicher');
{
  const { doc, w, store, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  pruefe('Nicht am window-Objekt',
    !Object.keys(w).some((k) => typeof w[k] === 'string' && w[k].includes('pk_geheim')));
  pruefe('Nicht im Seitentext', !doc.body.innerHTML.includes('pk_geheim'));
  pruefe('Nicht im Anfrageinhalt', !aufrufe.some((a) => JSON.stringify(a.data || '').includes('pk_geheim')));
  pruefe('Liegt im GM-Speicher', store.get('clickup:token:v1') === 'pk_geheim_123');
}

gruppe('Übernahme der lokalen Follow-ups');
{
  const lokal = {
    T1: { title: 'Mara Kell', flaggedAt: 1, due: '2026-10-08', note: 'Rate offen' },
    T2: { title: 'Rosina Bärtl', flaggedAt: 2, due: '', note: '' },
    T3: { title: 'Timo', flaggedAt: 3, due: '', note: '' },
  };
  const { doc, w, aufrufe, serverTasks } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': lokal },
    tasks: [{ id: 'vorhanden', name: 'Rosina Bärtl', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T2'), tags: [TAG] }],
  });
  await klickKnopf(w, doc, 'Lokale Follow-ups übernehmen');
  await warte(w, 1200);
  pruefe('Nur die zwei fehlenden werden angelegt', angelegte(aufrufe).length === 2,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data.name)));
  pruefe('Der vorhandene bleibt einmalig',
    serverTasks.filter((t) => /igfu-thread:\s*T2/.test(t.beschreibung)).length === 1);
  pruefe('Alle drei tragen den Tag', serverTasks.filter((t) => t.tags.includes(TAG)).length === 3,
    JSON.stringify(serverTasks.map((t) => [t.name, t.tags])));
  pruefe('Datum wird übertragen', aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.due_date));
  pruefe('Notiz wird Kommentar',
    aufrufe.some((a) => /\/comment$/.test(a.pfad) && a.data.comment_text === 'Rate offen'));
  const vorher = angelegte(aufrufe).length;
  await klickKnopf(w, doc, 'Lokale Follow-ups übernehmen');
  await warte(w, 1200);
  pruefe('Zweiter Durchlauf legt nichts doppelt an', angelegte(aufrufe).length === vorher,
    vorher + ' → ' + angelegte(aufrufe).length);
  pruefe('Insgesamt drei Unterhaltungen', serverTasks.length === 3, JSON.stringify(serverTasks.map((t) => t.name)));
}

gruppe('Fehlermeldungen nennen ClickUps eigenen Grund');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    fehler: (m, p) => (m === 'POST' && /^\/list\/[^/]+\/task$/.test(p) ? 'mitGrund' : null),
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 700);
  const meldung = (doc.querySelector('#igfu-toast') || {}).textContent || '';
  pruefe('Der Grund steht in der Meldung',
    meldung.includes('Custom field usages exceeded for your plan'), meldung);
  pruefe('Der Statuscode steht auch drin', meldung.includes('400'), meldung);
}

gruppe('Ein Task ohne Tag löscht keine Markierung, die nie übertragen wurde');
{
  // Genau der Fall vom 29.09.2026: Klick auf die CRM-Pille legte einen Task an,
  // der Abgleich las den fehlenden Tag als "kein Follow-up" und loeschte lokal.
  const { doc, w, store } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '' } } },
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [] }],
  });
  pruefe('Markierung überlebt den ersten Abgleich', !!store.get('igfu:v1').T1);
  await klickKnopf(w, doc, 'Verbindung prüfen');
  await warte(w, 700);
  pruefe('Markierung überlebt auch den erzwungenen Abgleich', !!store.get('igfu:v1').T1,
    JSON.stringify(store.get('igfu:v1')));
  pruefe('Zeile bleibt markiert', doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Entfernt jemand den Tag in ClickUp, verschwindet die Markierung');
{
  const { doc, w, store } = await starte({
    speicher: { ...MIT_CLICKUP,
      'igfu:v1': { T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '', inCu: true } } },
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [] }],
  });
  pruefe('Markierung ist weg', !store.get('igfu:v1').T1, JSON.stringify(store.get('igfu:v1')));
  pruefe('Zeile ist nicht mehr markiert', !doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Ein Klick auf die CRM-Pille lässt das Follow-up in Ruhe');
{
  const { doc, w, store, serverTasks } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '' } } },
  });
  klick(w, chip(doc, 0, 'crm'));
  await warte(w, 600);
  pruefe('Task wurde angelegt', serverTasks.length === 1, JSON.stringify(serverTasks.map((t) => t.name)));
  await klickKnopf(w, doc, 'Verbindung prüfen');
  await warte(w, 700);
  pruefe('Markierung ist noch da', !!store.get('igfu:v1').T1, JSON.stringify(store.get('igfu:v1')));
}

gruppe('Nach der Übertragung ist die Markierung als übertragen vermerkt');
{
  const { doc, w, store } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 700);
  const e = (store.get('igfu:v1') || {}).T1;
  pruefe('Merkmal inCu ist gesetzt', e && e.inCu === true, JSON.stringify(e));
}

gruppe('Handle aus der Vorschau landet im Task-Namen');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 700);
  const neu = angelegte(aufrufe)[0];
  pruefe('Name ist „handle — Anzeigename"', neu && neu.data.name === 'marakell.runs — Mara Kell', neu && neu.data.name);
  pruefe('Status wird ausdrücklich gesetzt', neu && neu.data.status === 'angeschrieben', neu && neu.data.status);
  pruefe('Bild-ID steht in der Beschreibung',
    neu && /igfu-bild:\s*111111111/.test(neu.data.markdown_description), neu && neu.data.markdown_description);
  pruefe('Instagram-Link steht in der Beschreibung',
    neu && neu.data.markdown_description.includes('instagram.com/marakell.runs'));
}

gruppe('Großgeschriebener Vorname wird nicht als Handle genommen');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 1, 'followup'));   // Rosina, Vorschau „Rosina: Hallo Josia"
  await warte(w, 700);
  const neu = angelegte(aufrufe)[0];
  pruefe('Name bleibt der Anzeigename', neu && neu.data.name === 'Rosina Bärtl', neu && neu.data.name);
  pruefe('Kein Handle in der Beschreibung', neu && !/Instagram: \[@/.test(neu.data.markdown_description));
}

gruppe('Ohne Handle bleibt es beim Anzeigenamen');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 2, 'followup'));   // Timo, Vorschau „Du: …"
  await warte(w, 700);
  const neu = angelegte(aufrufe)[0];
  pruefe('Name ist nur der Anzeigename', neu && neu.data.name === 'Timo', neu && neu.data.name);
}

gruppe('Die Kontaktkarte schlägt die Vorschau und benennt um');
{
  const { w, serverTasks, aufrufe } = await starte({
    pfad: '/latest/inbox/all/?selected_item_id=T1',
    speicher: MIT_CLICKUP,
    karte: { handle: 'die.echte.mara' },
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  await warte(w, 4000);   // der Kartenleser läuft alle drei Sekunden
  const umbenannt = aufrufe.filter((a) => a.methode === 'PUT' && a.data && a.data.name);
  pruefe('Es wird umbenannt', umbenannt.length === 1, JSON.stringify(umbenannt.map((u) => u.data.name)));
  pruefe('Neuer Name nutzt das Handle aus der Karte',
    serverTasks[0].name === 'die.echte.mara — Mara Kell', serverTasks[0].name);
  pruefe('Kein zusätzlicher Task', angelegte(aufrufe).length === 0);
}

gruppe('Umbenennen legt keinen Task an');
{
  const { w, aufrufe } = await starte({
    pfad: '/latest/inbox/all/?selected_item_id=T3',
    speicher: MIT_CLICKUP,
    karte: { handle: 'timo.unterwegs' },
  });
  await warte(w, 4000);
  pruefe('Kein Task entstanden', angelegte(aufrufe).length === 0, JSON.stringify(angelegte(aufrufe)));
  pruefe('Keine Umbenennung ins Leere', !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.name));
}

gruppe('Doppelter Task: der getaggte gewinnt');
{
  const { doc, store } = await starte({
    speicher: { ...MIT_CLICKUP,
      'igfu:v1': { T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '', inCu: true } } },
    tasks: [
      { id: 'mitTag', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e', beschreibung: beschreibungMit('T1'), tags: [TAG] },
      { id: 'ohneTag', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e', beschreibung: beschreibungMit('T1'), tags: [] },
    ],
  });
  pruefe('Markierung überlebt den Doppelgänger', !!store.get('igfu:v1').T1, JSON.stringify(store.get('igfu:v1')));
  pruefe('Zeile bleibt markiert', doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Zwei Übernahmen gleichzeitig legen nichts doppelt an');
{
  const lokal = {
    T1: { title: 'Mara Kell', flaggedAt: 1, due: '', note: '' },
    T2: { title: 'Rosina Bärtl', flaggedAt: 2, due: '', note: '' },
  };
  const { doc, w, aufrufe, serverTasks } = await starte({ speicher: { ...MIT_CLICKUP, 'igfu:v1': lokal } });
  const b = knopf(doc, 'Lokale Follow-ups übernehmen');
  klick(w, b);
  klick(w, b);      // sofort ein zweites Mal
  await warte(w, 1500);
  pruefe('Genau zwei Tasks', angelegte(aufrufe).length === 2,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data.name)));
  pruefe('Keine doppelten Unterhaltungen', serverTasks.length === 2);
}

const marktPille = (doc, handle) =>
  [...doc.querySelectorAll('.igfu-crm-pille')].find((p) => p.dataset.handle === handle);

gruppe('Marketplace: Creator erfassen');
{
  const { doc, w, aufrufe, serverTasks } = await starte({
    pfad: '/creator_marketing_hub/creator_discovery/',
    speicher: MIT_CLICKUP,
    markt: [{ handle: 'hey.lumi', bild: '573134618' }, { handle: 'theveganberlin', bild: '610648384' }],
  });
  await warte(w, 600);
  pruefe('An jeder Karte eine Pille', doc.querySelectorAll('.igfu-crm-pille').length === 2,
    String(doc.querySelectorAll('.igfu-crm-pille').length));
  const p = marktPille(doc, 'hey.lumi');
  pruefe('Pille lädt zum Erfassen ein', p && p.textContent === 'ins CRM +', p && p.textContent);
  klick(w, p);
  await warte(w, 600);
  const neu = angelegte(aufrufe)[0];
  pruefe('Genau ein Task', angelegte(aufrufe).length === 1);
  pruefe('Name ist das Handle', neu && neu.data.name === 'hey.lumi', neu && neu.data.name);
  pruefe('Status ist recherchiert', neu && neu.data.status === 'recherchiert', neu && neu.data.status);
  pruefe('Bild-ID in der Beschreibung', neu && /igfu-bild:\s*573134618/.test(neu.data.markdown_description));
  pruefe('Noch keine Thread-Zeile', neu && !/igfu-thread:/.test(neu.data.markdown_description));
  pruefe('Pille zeigt danach den Status', p.textContent === 'recherchiert', p.textContent);
  pruefe('Die andere Karte bleibt unberührt', serverTasks.length === 1);
}

gruppe('Die eigene Pille wird nicht selbst zur Karte');
{
  const { doc, w } = await starte({
    pfad: '/creator_marketing_hub/creator_discovery/',
    speicher: MIT_CLICKUP,
    markt: [{ handle: 'hey.lumi', bild: '573134618' }],
  });
  await warte(w, 600);
  const p = marktPille(doc, 'hey.lumi');
  klick(w, p);
  await warte(w, 800);
  pruefe('Status steht auf der Pille', p.textContent === 'recherchiert', p.textContent);
  pruefe('Keine zweite Pille in der ersten', p.querySelectorAll('.igfu-crm-pille').length === 0);
  pruefe('Insgesamt nur eine Pille', doc.querySelectorAll('.igfu-crm-pille').length === 1,
    String(doc.querySelectorAll('.igfu-crm-pille').length));
  pruefe('Merkmal für das Marketplace-Skript ist gesetzt', p.getAttribute('data-igm-linked') === '1');
}

gruppe('Marketplace: schon erfasster Creator zeigt seinen Status');
{
  const { doc, w } = await starte({
    pfad: '/creator_marketing_hub/creator_discovery/',
    speicher: MIT_CLICKUP,
    markt: [{ handle: 'hey.lumi', bild: '573134618' }],
    tasks: [{ id: 'm1', name: 'hey.lumi', status: 'verhandlung', farbe: '#b660e0',
              beschreibung: 'igfu-bild: 573134618', tags: [] }],
  });
  await warte(w, 700);
  const p = marktPille(doc, 'hey.lumi');
  pruefe('Status steht auf der Pille', p && p.textContent === 'verhandlung', p && p.textContent);
  klick(w, p);
  await warte(w, 300);
  pruefe('Klick öffnet den Task', (w.__geoeffnet || [])[0] === 'https://app.clickup.com/t/m1');
}

gruppe('Die Unterhaltung findet ihren Marketplace-Task über das Profilbild');
{
  // T1 traegt die Bild-ID 111111111, dazu gibt es schon einen erfassten Creator
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'm1', name: 'marakell.runs', status: 'recherchiert', farbe: '#656f7d',
              beschreibung: 'Instagram: @marakell.runs\n\nigfu-bild: 111111111', tags: [] }],
  });
  await warte(w, 1200);
  pruefe('Kein neuer Task', angelegte(aufrufe).length === 0, JSON.stringify(angelegte(aufrufe)));
  pruefe('Thread-Zeile wurde ergänzt', /igfu-thread:\s*T1/.test(serverTasks[0].beschreibung), serverTasks[0].beschreibung);
  pruefe('Handle in der Beschreibung blieb erhalten', /@marakell\.runs/.test(serverTasks[0].beschreibung));
  pruefe('Status steht jetzt auf angeschrieben', serverTasks[0].status === 'angeschrieben', serverTasks[0].status);
  pruefe('Name trägt Handle und Anzeigenamen',
    serverTasks[0].name === 'marakell.runs — Mara Kell', serverTasks[0].name);
}

gruppe('Ein bereits verbundener Task wird nicht nochmal verbunden');
{
  const { w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'm1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-bild: 111111111', tags: [] }],
  });
  await warte(w, 1200);
  pruefe('Kein neuer Task', angelegte(aufrufe).length === 0);
  pruefe('Keine zweite Verknüpfung', !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.markdown_description));
}

const MIT_UP = { ...MIT_CLICKUP, 'uppromote:token:v1': 'up_geheim_999' };

gruppe('UpPromote: bestätigte Affiliates werden ongeboardet');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [
      { id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: beschreibungMit('T1'), tags: [TAG] },
      { id: 'a2', name: 'Rosina Bärtl', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: beschreibungMit('T2'), tags: [TAG] },
    ],
    affiliates: [
      { first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'https://www.instagram.com/marakell.runs/' },
      { first_name: 'Fremd', last_name: 'Person', email: 'x@y.de', instagram: '@jemand.anders' },
    ],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1200);
  pruefe('Der passende Task wird ongeboardet', serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
  pruefe('Der Task ohne Handle bleibt unberührt', serverTasks[1].status === 'angeschrieben', serverTasks[1].status);
  pruefe('UpPromote wurde nach aktiven gefragt',
    aufrufe.some((a) => a.pfad.startsWith('UP/affiliates') && a.pfad.includes('status=active')));
  pruefe('Der UpPromote-Token steht in keiner Nutzlast',
    !aufrufe.some((a) => JSON.stringify(a.data || '').includes('up_geheim')));
}

gruppe('UpPromote: Sales heben den Status auf „hat sales"');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de',
                   instagram: 'marakell.runs', approved_amount: '12.50' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1200);
  pruefe('Status ist „hat sales"', serverTasks[0].status === 'hat sales', serverTasks[0].status);
}

gruppe('UpPromote: ohne Umsatz bleibt es bei ongeboardet');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de',
                   instagram: 'marakell.runs', denied_amount: '99.00' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1200);
  pruefe('Abgelehnte Provision zählt nicht als Sale',
    serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('Die Leiter zieht keinen Task zurück');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [
      { id: 'a1', name: 'marakell.runs — Mara Kell', status: 'erste ware versendet', farbe: '#b660e0',
        beschreibung: beschreibungMit('T1') + '\nigfu-mail: a@b.de', tags: [TAG] },
      { id: 'a2', name: 'rosina_baertl — Rosina Bärtl', status: 'abgesagt', farbe: '#e5484d',
        beschreibung: beschreibungMit('T2') + '\nigfu-mail: c@b.de', tags: [TAG] },
    ],
    affiliates: [
      { first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs' },
      { first_name: 'Rosina', last_name: 'Bösch', email: 'c@b.de', instagram: 'rosina_baertl' },
    ],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1200);
  pruefe('„erste ware versendet" bleibt stehen',
    serverTasks[0].status === 'erste ware versendet', serverTasks[0].status);
  pruefe('„abgesagt" wird nicht angefasst',
    serverTasks[1].status === 'abgesagt', serverTasks[1].status);
  pruefe('Gar kein Statuswechsel übertragen',
    !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.status),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
}

gruppe('UpPromote: die E-Mail wird als Brücke zu Shopify nachgetragen');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'Mara@B.de', instagram: 'marakell.runs' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1500);
  pruefe('Markerzeile steht in der Beschreibung',
    /igfu-mail:\s*mara@b\.de/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-80));
  pruefe('Der Thread-Marker bleibt erhalten',
    /igfu-thread:/.test(serverTasks[0].beschreibung || ''));
}

gruppe('Die Inhalte-Seite wird mit dem richtigen Konto geöffnet');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    pfad: '/latest/inbox/all/?asset_id=2222222222222222&business_id=1111111111111111&partnership_messages=true',
  });
  await klickKnopf(w, doc, 'Inhalte-Seite öffnen');
  const url = (w.__geoeffnet || [])[0] || '';
  pruefe('Business wird mitgegeben', /business_id=1111111111111111/.test(url), url);
  pruefe('Asset wird mitgegeben', /asset_id=2222222222222222/.test(url), url);
  pruefe('Seite wird als Asset vorausgewählt',
    /selected_business_page_id=2222222222222222/.test(url), url);
  pruefe('Nach Datum sortiert', /sort_index=upac_publish_time/.test(url), url);
}

gruppe('Fehlt das Konto in der Adresse, wird gewarnt');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP, pfad: '/latest/inbox/all/' });
  await klickKnopf(w, doc, 'Inhalte-Seite öffnen');
  await warte(w, 150);
  const url = (w.__geoeffnet || [])[0] || '';
  pruefe('Es wird trotzdem geöffnet', /ad_content/.test(url), url);
  pruefe('Kein fremdes Konto erfunden', !/business_id=/.test(url), url);
  const toastEl = doc.querySelector('#igfu-toast');
  pruefe('Hinweis auf das Konto erscheint',
    /Tzampas Food/.test((toastEl && toastEl.textContent) || ''),
    (toastEl && toastEl.textContent) || '');
}

gruppe('Eingesammelter Content hebt auf „erster content"');
{
  const { doc, w, serverTasks } = await starte({
    speicher: {
      ...MIT_CLICKUP,
      'clickup:content:v1': {
        'marakell.runs': { bereit: true, anfragen: false, stand: Date.now() },
        'rosina_baertl': { bereit: false, anfragen: true, stand: Date.now() },
      },
    },
    tasks: [
      { id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: beschreibungMit('T1'), tags: [TAG] },
      { id: 'a2', name: 'rosina_baertl — Rosina Bärtl', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: beschreibungMit('T2'), tags: [TAG] },
    ],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('„Für Anzeige bereit" zählt',
    serverTasks[0].status === 'erster content', serverTasks[0].status);
  pruefe('„Handeln erforderlich" zählt auch',
    serverTasks[1].status === 'erster content', serverTasks[1].status);
}

gruppe('Content zieht niemanden von „hat sales" zurück');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: {
      ...MIT_CLICKUP,
      'clickup:content:v1': { 'marakell.runs': { bereit: true, anfragen: false, stand: Date.now() } },
    },
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'hat sales', farbe: '#e16b16',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Status bleibt „hat sales"', serverTasks[0].status === 'hat sales', serverTasks[0].status);
  pruefe('Kein Statuswechsel übertragen',
    !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.status),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
}

gruppe('Ohne eingesammelten Content passiert nichts');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Status unverändert', serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('UpPromote: Handle wird aus allen Schreibweisen gelesen');
{
  const faelle = [
    ['https://www.instagram.com/marakell.runs/', 'volle URL'],
    ['@marakell.runs', 'mit At-Zeichen'],
    ['marakell.runs', 'nackt'],
  ];
  for (const [wert, name] of faelle) {
    const { doc, w, serverTasks } = await starte({
      speicher: MIT_UP,
      tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
                beschreibung: beschreibungMit('T1'), tags: [TAG] }],
      affiliates: [{ first_name: 'Mara', last_name: 'K', email: 'a@b.de', instagram: wert }],
    });
    await klickKnopf(w, doc, 'UpPromote abgleichen');
    await warte(w, 1000);
    pruefe('Erkennt ' + name, serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
  }
}

gruppe('UpPromote: Handle auch aus einem Anmeldefeld');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Mara', last_name: 'K', email: 'a@b.de', instagram: '',
                   custom_fields: [{ name: 'Dein Instagram-Handle', value: 'marakell.runs' }] }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1000);
  pruefe('Anmeldefeld wird gelesen', serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('UpPromote: bereits ongeboardet wird nicht erneut geschrieben');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Mara', last_name: 'K', email: 'a@b.de', instagram: 'marakell.runs' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1000);
  pruefe('Kein Statuswechsel', !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.status));
}

gruppe('UpPromote: ohne Token passiert nichts');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 700);
  pruefe('Keine Anfrage an UpPromote', !aufrufe.some((a) => a.pfad.startsWith('UP/')));
  pruefe('Hinweis erscheint',
    (doc.querySelector('#igfu-toast') || {}).textContent.includes('UpPromote-Token'),
    (doc.querySelector('#igfu-toast') || {}).textContent);
}

const alsDatum = (ms) => ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null;

gruppe('Fehlender Handle wird aus der Kontaktkarte geholt');
{
  // T3 = Timo. Weder Name noch Vorschautext geben einen Handle her, die
  // Kontaktkarte schon. Stufe 1: Unterhaltung öffnen, Karte lesen, nachtragen.
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    karte: { handle: 'timo__83' },
  });
  await warte(w, 600);
  klick(w, chip(doc, 2, 'followup'));   // Timo
  await warte(w, 2500);
  pruefe('Task trägt den Handle im Namen',
    serverTasks[0] && serverTasks[0].name === 'timo__83 — Timo',
    serverTasks[0] && serverTasks[0].name);
  pruefe('Markerzeile ist gesetzt',
    /igfu-handle:\s*timo__83/.test((serverTasks[0] || {}).beschreibung || ''),
    ((serverTasks[0] || {}).beschreibung || '').slice(-80));
}

gruppe('Ohne Kontaktkarte wird der Task trotzdem angelegt');
{
  // Nichts blockieren: sonst wäre die Markierung nur noch lokal und für
  // Cosima gar nicht sichtbar.
  const { doc, w, serverTasks } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  klick(w, chip(doc, 2, 'followup'));   // Timo, keine Karte vorhanden
  await warte(w, 1500);
  pruefe('Task existiert', serverTasks.length === 1, String(serverTasks.length));
  pruefe('Name bleibt vorerst ohne Handle',
    serverTasks[0] && serverTasks[0].name === 'Timo', serverTasks[0] && serverTasks[0].name);
}

gruppe('Ohne Kontaktkarte erscheint die Nachfrage');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  klick(w, chip(doc, 2, 'followup'));
  await warte(w, 6500);                 // Kartensuche läuft erst ab
  const frage = doc.querySelector('#igfu-frage');
  pruefe('Nachfrage ist da', !!frage);
  pruefe('Sie nennt den Namen', !!frage && /Timo/.test(frage.textContent || ''));
  pruefe('Sie lässt sich überspringen',
    !!frage && /Später nachtragen/.test(frage.textContent || ''));
}

gruppe('Das Panel listet Tasks ohne Handle zum Nachtragen');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Timo', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T3'), tags: [TAG] }],
  });
  await warte(w, 900);
  const launcher = doc.querySelector('#igfu-launch');
  pruefe('Zähler an der Pille', /ohne Handle/.test((launcher && launcher.textContent) || ''),
    (launcher && launcher.textContent) || '');
  klick(w, launcher);
  await warte(w, 200);
  const panel = doc.querySelector('#igfu-panel');
  pruefe('Abschnitt im Panel',
    /Handles nachtragen/.test((panel && panel.textContent) || ''));
  const feld = [...doc.querySelectorAll('#igfu-panel input')].find((i) => i.placeholder === 'Handle');
  pruefe('Eingabefeld vorhanden', !!feld);
  if (feld) {
    feld.value = 'timo__83';
    const uebernehmen = [...doc.querySelectorAll('#igfu-panel button')]
      .find((b) => (b.textContent || '').trim() === 'Übernehmen');
    klick(w, uebernehmen);
    await warte(w, 1200);
    pruefe('Handle landet im Task',
      serverTasks[0].name === 'timo__83 — Timo', serverTasks[0].name);
  }
}

gruppe('Notizen aus UpPromote landen als Kommentar');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs',
                   internal_note: 'Will nur Reels machen', personal_detail: 'Läuft Ultratrails' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 2000);
  const kommentare = aufrufe.filter((a) => a.methode === 'POST' && /\/comment$/.test(a.pfad));
  pruefe('Genau ein Kommentar', kommentare.length === 1, String(kommentare.length));
  const text = kommentare[0] ? kommentare[0].data.comment_text : '';
  pruefe('Eure Notiz ist drin', /Notiz aus UpPromote:\nWill nur Reels machen/.test(text), text);
  pruefe('Angaben des Affiliates getrennt beschriftet',
    /Angaben des Affiliates:\nLäuft Ultratrails/.test(text), text);
  pruefe('Prüfsumme steht in der Beschreibung',
    /igfu-notiz:\s*\w+/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-60));
}

gruppe('Dieselbe Notiz kommt kein zweites Mal');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs',
                   internal_note: 'Will nur Reels machen' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 2000);
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 2000);
  const kommentare = aufrufe.filter((a) => a.methode === 'POST' && /\/comment$/.test(a.pfad));
  pruefe('Immer noch nur ein Kommentar', kommentare.length === 1, String(kommentare.length));
}

gruppe('Ohne Notiz passiert nichts');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 2000);
  pruefe('Kein Kommentar',
    !aufrufe.some((a) => a.methode === 'POST' && /\/comment$/.test(a.pfad)));
}

gruppe('Messenger-Unterhaltungen bekommen keine Pillen');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  const zeilen = doc.querySelectorAll('.row').length;
  const markiert = doc.querySelectorAll('[data-igfu-row]').length;
  pruefe('Vier Zeilen, aber nur drei mit Knöpfen',
    zeilen === 4 && markiert === 3, zeilen + ' Zeilen, ' + markiert + ' markiert');
}

gruppe('Der Link gilt für Partner-Nachrichten und normale DMs gleichermaßen');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  klick(w, chip(doc, 1, 'followup'));   // Rosina
  await warte(w, 1200);
  const neu = aufrufe.find((a) => a.methode === 'POST' && a.data && a.data.markdown_description);
  const text = neu ? neu.data.markdown_description : '';
  pruefe('Thread steht im Link', /selected_item_id=T2/.test(text), text.slice(0, 120));
  pruefe('Kein partnership_messages mehr', !/partnership_messages/.test(text), text.slice(0, 120));
  pruefe('thread_type bleibt', /thread_type=IG_MESSAGE/.test(text));
}

const PROG = 'TZAMPAS Affiliate Programm';

gruppe('Import: erster Klick zählt nur');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    affiliates: [
      { first_name: 'Neu', last_name: 'Eins', email: 'n1@b.de', instagram: 'neu_eins', program_name: PROG },
      { first_name: 'Neu', last_name: 'Zwei', email: 'n2@b.de', instagram: 'neu_zwei', program_name: PROG },
    ],
  });
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 1500);
  pruefe('Noch nichts angelegt', serverTasks.length === 0, String(serverTasks.length));
  const toastEl = doc.querySelector('#igfu-toast');
  pruefe('Zählung wird gemeldet', /2 neu/.test((toastEl && toastEl.textContent) || ''),
    (toastEl && toastEl.textContent) || '');
}

gruppe('Import: zweiter Klick legt an');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    affiliates: [
      { first_name: 'Neu', last_name: 'Eins', email: 'N1@B.de', instagram: 'neu_eins',
        program_name: PROG, approved_amount: '0' },
      { first_name: 'Mit', last_name: 'Sales', email: 'n2@b.de', instagram: 'neu_zwei',
        program_name: PROG, paid_amount: '42.00' },
    ],
  });
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 1500);
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 2500);
  pruefe('Zwei Tasks angelegt', serverTasks.length === 2, String(serverTasks.length));
  const eins = serverTasks.find((x) => /neu_eins/.test(x.name));
  const zwei = serverTasks.find((x) => /neu_zwei/.test(x.name));
  pruefe('Name ist handle — Name', eins && eins.name === 'neu_eins — Neu Eins', eins && eins.name);
  pruefe('Ohne Umsatz ongeboardet', eins && eins.status === 'ongeboardet', eins && eins.status);
  pruefe('Mit Umsatz hat sales', zwei && zwei.status === 'hat sales', zwei && zwei.status);
  pruefe('Handle als Marker', /igfu-handle:\s*neu_eins/.test((eins || {}).beschreibung || ''));
  pruefe('E-Mail klein als Marker', /igfu-mail:\s*n1@b\.de/.test((eins || {}).beschreibung || ''),
    ((eins || {}).beschreibung || '').slice(-70));
}

gruppe('Import: Vorhandene und fremde Programme bleiben aussen vor');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [
      { id: 'a1', name: 'neu_eins — Neu Eins', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: beschreibungMit('T1'), tags: [] },
      { id: 'a2', name: 'Jemand', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: beschreibungMit('T2') + '\nigfu-mail: n2@b.de', tags: [] },
    ],
    affiliates: [
      { first_name: 'Neu', last_name: 'Eins', email: 'n1@b.de', instagram: 'neu_eins', program_name: PROG },
      { first_name: 'Per', last_name: 'Mail', email: 'n2@b.de', instagram: 'per_mail', program_name: PROG },
      { first_name: 'Anderes', last_name: 'Programm', email: 'n3@b.de', instagram: 'woanders',
        program_name: 'Zweitprogramm' },
    ],
  });
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 1500);
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 2500);
  pruefe('Nichts Neues angelegt', serverTasks.length === 2, String(serverTasks.length));
}

gruppe('Import: ohne Handle gibt es den roten Tag');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    affiliates: [{ first_name: 'Ohne', last_name: 'Handle', email: 'oh@b.de',
                   instagram: '', program_name: PROG }],
  });
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 1500);
  await klickKnopf(w, doc, 'Affiliates importieren');
  await warte(w, 2500);
  pruefe('Task heißt nach der Person',
    serverTasks[0] && serverTasks[0].name === 'Ohne Handle', serverTasks[0] && serverTasks[0].name);
  pruefe('Tag handle-fehlt ist dran',
    (serverTasks[0] || {}).tags && serverTasks[0].tags.includes('handle-fehlt'),
    JSON.stringify((serverTasks[0] || {}).tags));
}

gruppe('Ein Task ohne Unterhaltung wird später über den Handle verbunden');
{
  // T1 = Anna, Vorschau nennt marakell.runs. Der Task kennt den Handle, aber
  // keine Unterhaltung — genau der Fall nach einem Import.
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'Instagram: @marakell.runs\n\nigfu-handle: marakell.runs', tags: [] }],
  });
  await warte(w, 2000);
  pruefe('Thread-Marker wurde nachgetragen',
    /igfu-thread:\s*T1/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(0, 120));
  pruefe('Link steht in der Beschreibung',
    /selected_item_id=T1/.test(serverTasks[0].beschreibung || ''));
}

gruppe('Handle wandert als Markerzeile in die Beschreibung');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Markerzeile wurde nachgetragen',
    /igfu-handle:\s*marakell\.runs/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-90));
  pruefe('Kein Tag „handle-fehlt"',
    !(serverTasks[0].tags || []).includes('handle-fehlt'), JSON.stringify(serverTasks[0].tags));
}

gruppe('Ohne Handle wird der Task sichtbar markiert');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Carsten Schymik', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Tag „handle-fehlt" ist gesetzt',
    (serverTasks[0].tags || []).includes('handle-fehlt'), JSON.stringify(serverTasks[0].tags));
}

gruppe('Der Tag verschwindet, sobald der Handle da ist');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG, 'handle-fehlt'] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Tag ist wieder weg',
    !(serverTasks[0].tags || []).includes('handle-fehlt'), JSON.stringify(serverTasks[0].tags));
}

gruppe('Die Markerzeile schlägt den Namen');
{
  // Der Name trägt keinen Handle, die Beschreibung schon. UpPromote muss
  // trotzdem zuordnen können — genau dafür ist der Marker da.
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-handle: marakell.runs', tags: [TAG] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1500);
  pruefe('Trotz Namen ohne Handle zugeordnet',
    serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('Bei abgesagt interessiert kein fehlender Handle');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Timo', status: 'abgesagt', farbe: '#e5484d',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Kein Tag auf einem abgesagten Task',
    !(serverTasks[0].tags || []).includes('handle-fehlt'), JSON.stringify(serverTasks[0].tags));
}

gruppe('Nachfass-Frist: 14 Tage nach der letzten Nachricht');
{
  // T1 = Anna, letzte Nachricht 14.09.2026
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  await warte(w, 1500);
  pruefe('Startdatum ist die letzte Nachricht',
    alsDatum(serverTasks[0].start) === '2026-09-14', String(alsDatum(serverTasks[0].start)));
  pruefe('Frist ist 14 Tage später',
    alsDatum(serverTasks[0].due) === '2026-09-28', String(alsDatum(serverTasks[0].due)));
}

gruppe('Nachfass-Frist: Versand schlägt die 14 Tage, wenn er später liegt');
{
  // T3 = Timo, letzte Nachricht 30.08.2026 → +14 Tage = 13.09.
  // Versand Montag 14.09. + 10 Wochentage = 28.09., die spätere gilt.
  // Zugleich die Probe auf die Wochentagsrechnung: kalendarisch wären es
  // der 24.09., nur mit übersprungenen Wochenenden kommt der 28.09. heraus.
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Timo', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T3') + '\nigfu-ware: 2026-09-14', tags: [TAG] }],
  });
  await warte(w, 1500);
  pruefe('Frist richtet sich nach dem Versand',
    alsDatum(serverTasks[0].due) === '2026-09-28', String(alsDatum(serverTasks[0].due)));
}

gruppe('Startdatum liegt nie nach der Frist');
{
  // ClickUp lehnt das sonst mit Fehler 400 ab. Genau so ist es passiert:
  // eine reine Versandfrist lag bei laufender Unterhaltung irgendwann vor der
  // letzten Nachricht, und jedes weitere Schreiben scheiterte.
  const frueh = new Date(2026, 8, 1, 12, 0, 0).getTime();
  const { w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T2') + '\nigfu-ware: 2026-09-01',
              tags: [TAG], due: frueh }],
  });
  await warte(w, 1500);
  const verstoss = aufrufe.filter((a) => a.methode === 'PUT' && a.data
    && a.data.start_date && a.data.due_date && a.data.start_date > a.data.due_date);
  pruefe('Keine Nutzlast mit start nach due', verstoss.length === 0, JSON.stringify(verstoss));
  const mitBeidem = aufrufe.find((a) => a.methode === 'PUT' && a.data && a.data.start_date);
  pruefe('Frist wird gleich mitgeschickt',
    !!(mitBeidem && mitBeidem.data.due_date), JSON.stringify(mitBeidem && mitBeidem.data));
}

gruppe('Der Tag „ad-code" wird gesetzt und bleibt');
{
  const { doc, w, serverTasks } = await starte({
    speicher: {
      ...MIT_CLICKUP,
      'clickup:content:v1': { 'marakell.runs': { bereit: true, anfragen: false, stand: Date.now() } },
    },
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'hat sales', farbe: '#e16b16',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Tag ist dran', (serverTasks[0].tags || []).includes('ad-code'),
    JSON.stringify(serverTasks[0].tags));
  pruefe('Status bleibt trotzdem „hat sales"',
    serverTasks[0].status === 'hat sales', serverTasks[0].status);
}


gruppe('Datum der letzten Nachricht landet im Startdatum');
{
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  await warte(w, 1200);
  pruefe('Startdatum entspricht der letzten Nachricht',
    alsDatum(serverTasks[0].start) === '2026-09-14', String(serverTasks[0].start) + ' -> ' + alsDatum(serverTasks[0].start));
}

gruppe('Stimmt das Startdatum schon, wird nicht geschrieben');
{
  const passend = new Date(2026, 8, 14, 12, 0, 0).getTime();
  const { w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG], start: passend }],
  });
  await warte(w, 1200);
  pruefe('Kein überflüssiger Schreibvorgang',
    !aufrufe.some((a) => a.methode === 'PUT' && a.data && 'start_date' in a.data),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
}

gruppe('Neuer Task bekommt das Datum gleich mit');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  klick(w, chip(doc, 1, 'followup'));   // Rosina, letzte Nachricht 20.09.2026
  await warte(w, 900);
  const neu = angelegte(aufrufe)[0];
  pruefe('Startdatum ist beim Anlegen dabei',
    neu && alsDatum(neu.data.start_date) === '2026-09-20',
    neu && String(neu.data.start_date));
}

gruppe('Liegt die Antwort bei uns, wird der Task dringend');
{
  // T2 = Rosina, Vorschau „Rosina: Hallo Josia, danke dir!" — sie hat zuletzt geschrieben
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T2'), tags: [TAG] }],
  });
  await warte(w, 1200);
  pruefe('Prioritaet wird auf urgent gesetzt', serverTasks[0].prio === 'urgent', String(serverTasks[0].prio));
  pruefe('Als urgent uebertragen',
    aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.priority === 1));
}

gruppe('Haben wir zuletzt geschrieben, faellt urgent wieder weg');
{
  // T3 = Timo, Vorschau „Du: Melde dich gern nochmal"
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Timo', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T3'), tags: [TAG], prio: 'urgent' }],
  });
  await warte(w, 1200);
  pruefe('Prioritaet ist wieder leer', !serverTasks[0].prio, String(serverTasks[0].prio));
}

gruppe('Eine blosse Reaktion aendert die Prioritaet nicht');
{
  // T1 = Anna, Vorschau „marakell.runs gefällt eine Nachricht" — keine offene Nachricht
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG], prio: 'urgent' }],
  });
  await warte(w, 1200);
  pruefe('urgent bleibt unangetastet', serverTasks[0].prio === 'urgent', String(serverTasks[0].prio));
  pruefe('Keine Prioritaets-Uebertragung',
    !aufrufe.some((a) => a.methode === 'PUT' && a.data && 'priority' in a.data),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
}

gruppe('Hat Josia den Task schon einsortiert, bleibt die Prioritaet seine');
{
  // T2 = Rosina, Gegenueber zuletzt. Status ist aber nicht mehr angeschrieben,
  // also hat Josia den Fall selbst in der Hand.
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'kommunikation', farbe: '#7b68ee',
              beschreibung: beschreibungMit('T2'), tags: [TAG] }],
  });
  await warte(w, 1200);
  pruefe('Keine Prioritaet gesetzt', !serverTasks[0].prio, String(serverTasks[0].prio));
  pruefe('Nichts uebertragen',
    !aufrufe.some((a) => a.methode === 'PUT' && a.data && 'priority' in a.data),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
}

gruppe('Ohne Task legt die Prioritaet nichts an');
{
  const { w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 1200);
  pruefe('Kein Task nur wegen der Prioritaet',
    !aufrufe.some((a) => a.methode === 'POST' && a.data && a.data.name));
}

gruppe('Der Aktualisieren-Knopf und sein Tooltip');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  const b = doc.querySelector('#igfu-refresh');
  pruefe('Knopf ist da und sichtbar', !!b && b.hidden === false);
  pruefe('Knopf ist beschriftet', b && b.textContent === 'Aktualisieren', b && b.textContent);
  const tipp = doc.querySelector('#igfu-tipp');
  pruefe('Tooltip existiert', !!tipp);
  pruefe('Tooltip ist zunächst unsichtbar', tipp && !tipp.classList.contains('show'));
  b.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: false }));
  pruefe('Tooltip erscheint beim Überfahren', tipp.classList.contains('show'));
  pruefe('Tooltip nennt das Startdatum', /Startdatum/.test(tipp.textContent));
  pruefe('Tooltip nennt die Handles', /Handles/.test(tipp.textContent));
  pruefe('Tooltip sagt, was er nicht tut', /Legt keine neuen Tasks an/.test(tipp.textContent));
  pruefe('Tooltip nennt das Abschichten', /letzten Lauf/.test(tipp.textContent), tipp.textContent.slice(0, 120));
  pruefe('Tooltip nennt beide Richtungen', /beide Richtungen/.test(tipp.textContent));
  pruefe('Tooltip nennt urgent', /urgent/.test(tipp.textContent));
  pruefe('Tooltip nennt UpPromote', /UpPromote/.test(tipp.textContent));
  pruefe('Tooltip verweist auf den vollen Durchlauf', /vollständigen Durchlauf/.test(tipp.textContent));
  b.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: false }));
  pruefe('Tooltip verschwindet wieder', !tipp.classList.contains('show'));
}

gruppe('Unsichtbare Knöpfe fangen keine Klicks ab');
{
  const { doc } = await starte({ speicher: MIT_CLICKUP });
  const stil = doc.getElementById('igfu-style').textContent;
  pruefe('Der Knopfstreifen ist klickdurchlässig',
    /\.igfu-tags \{[^}]*pointer-events: none/s.test(stil));
  pruefe('Unsichtbare Knöpfe nehmen keine Klicks an',
    /\.igfu-tags > \.igfu-tag \{[^}]*pointer-events: none/s.test(stil));
  pruefe('Beim Überfahren nehmen sie wieder Klicks an',
    /:hover \.igfu-tag[^{]*\{[^}]*pointer-events: auto/.test(stil));
  pruefe('Aktive Knöpfe bleiben klickbar',
    /\.igfu-tag\.on \{[^}]*pointer-events: auto/.test(stil));
}

gruppe('Rücksprung aus ClickUp öffnet die richtige Unterhaltung');
{
  const { w } = await starte({ pfad: '/latest/inbox/all/#igfu=T2', speicher: MIT_CLICKUP });
  await warte(w, 1600);
  pruefe('Genau eine Zeile wurde angeklickt', w.__zeilenKlicks.length === 1, JSON.stringify(w.__zeilenKlicks));
  pruefe('Es ist die aus dem Link', w.__zeilenKlicks[0] === 1, JSON.stringify(w.__zeilenKlicks));
  pruefe('Die Zeile wird hervorgehoben', w.__flashGesehen.includes(1), JSON.stringify(w.__flashGesehen));
  pruefe('Das Fragment ist danach weg', !w.location.hash, w.location.hash);
}

gruppe('Ohne Rücksprung-Link wird nichts geöffnet');
{
  const { w } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 1600);
  pruefe('Keine Zeile angeklickt', w.__zeilenKlicks.length === 0, JSON.stringify(w.__zeilenKlicks));
}

gruppe('Speicher übersteht ein Neuladen');
{
  const erst = await starte({ speicher: MIT_CLICKUP });
  klick(erst.w, chip(erst.doc, 0, 'followup'));
  await warte(erst.w, 600);
  const zweit = await starte({ speicher: Object.fromEntries(erst.store) });
  pruefe('Markierung ist noch da', zweit.doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
  pruefe('Knopf ist aktiv', chip(zweit.doc, 0, 'followup').classList.contains('on'));
}

gruppe('Token löschen schaltet ClickUp sauber ab');
{
  const { doc, w, store } = await starte({ speicher: MIT_CLICKUP });
  pruefe('CRM-Pille ist sichtbar', chip(doc, 0, 'crm').hidden === false);
  await klickKnopf(w, doc, 'Token löschen');
  await warte(w, 200);
  pruefe('Token ist weg', !store.get('clickup:token:v1'));
  pruefe('CRM-Pille verschwindet', chip(doc, 0, 'crm').hidden === true);
  pruefe('Follow-up läuft weiter lokal', (klick(w, chip(doc, 1, 'followup')), !!store.get('igfu:v1').T2));
}

gruppe('Eine Karteileiche wird nicht mehr angefasst');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Sherin Rassoul', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'Testkonto, bleibt stehen.', tags: ['karteileiche'] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Kein Tag „handle-fehlt", obwohl kein Handle da ist',
    !(serverTasks[0].tags || []).includes('handle-fehlt'), JSON.stringify(serverTasks[0].tags));
  pruefe('Die Beschreibung bleibt unverändert',
    serverTasks[0].beschreibung === 'Testkonto, bleibt stehen.', serverTasks[0].beschreibung);
}

gruppe('Der Tag karteileiche wird im Space angelegt');
{
  const { doc, w, spaceTags } = await starte({ speicher: MIT_CLICKUP });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 1500);
  pruefe('Der Tag liegt im Space, damit er sich anhängen lässt',
    spaceTags.includes('karteileiche'), JSON.stringify(spaceTags));
}

gruppe('Die Karteileiche bleibt beim UpPromote-Abgleich stehen');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG, 'karteileiche'] }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1200);
  pruefe('Der Status wandert nicht auf ongeboardet',
    serverTasks[0].status === 'angeschrieben', serverTasks[0].status);
}

gruppe('Eine Unterhaltung wird über den Anzeigenamen vorgeschlagen');
{
  // Seit 7.5 verknuepft der Namensvergleich nicht mehr von selbst — er legt
  // vor, verbunden wird per Klick. Der Vergleich selbst ist unveraendert; was
  // sich geaendert hat, ist nur, wer die Entscheidung trifft.
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'Aus UpPromote übernommen.\nigfu-mail: c@b.de' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Nicht von selbst verbunden',
    !/igfu-thread/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-120));
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Treffer steht im Panel', /Treffer: Rosina Bärtl/.test(panel), panel.slice(0, 400));
  // Die Zeilen stehen in der Reihenfolge der Unterhaltungen: Anna, Rosina, Timo.
  const auswahl = doc.querySelectorAll('.igfu-auswahl')[1];
  pruefe('Es gibt eine Auswahl zum Verbinden', !!auswahl);
  if (auswahl) {
    auswahl.value = 'a1';
    auswahl.dispatchEvent(new w.Event('change', { bubbles: true }));
    await warte(w, 2000);
  }
  pruefe('Nach dem Verbinden steht die Markerzeile igfu-thread da',
    /igfu-thread:\s*T2/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-120));
  pruefe('Der Link ins Postfach steht in der Beschreibung',
    /selected_item_id=T2/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(0, 120));
}

gruppe('Zwei gleich benannte Tasks bleiben unverbunden');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'eine' },
      { id: 'a2', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'andere' },
    ],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Keiner der beiden bekommt die Unterhaltung',
    !/igfu-thread/.test(serverTasks[0].beschreibung || '')
    && !/igfu-thread/.test(serverTasks[1].beschreibung || ''),
    JSON.stringify([serverTasks[0].beschreibung, serverTasks[1].beschreibung]));
}

gruppe('Ein einzelner Vorname verbindet nicht');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Timo', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'nur Vorname' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Kein Thread angehängt',
    !/igfu-thread/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Eine Karteileiche wird nicht über den Namen verbunden');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'altes Konto', tags: ['karteileiche'] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Kein Thread angehängt',
    !/igfu-thread/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Dieselbe Person in zwei Unterhaltungen landet in einem Task');
{
  // T5 ist dieselbe Person wie T1: der Vorschautext nennt denselben Handle.
  const spaeter = macheThread({ id: 'T5', titel: 'Mara Kell', zeit: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    vorschau: 'marakell.runs gefällt eine Nachricht' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [spaeter],
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, chip(doc, 4, 'crm'));
  await warte(w, 2500);
  pruefe('Es entsteht kein zweiter Task', angelegte(aufrufe).length === 0,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data && a.data.name)));
  pruefe('Immer noch genau ein Task', serverTasks.length === 1, String(serverTasks.length));
  pruefe('Die zweite Unterhaltung steht als Markerzeile dabei',
    /igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-140));
  pruefe('Die erste Markerzeile bleibt stehen',
    /igfu-thread:\s*T1/.test(serverTasks[0].beschreibung || ''));
  pruefe('Der zweite Link ist als weitere Unterhaltung benannt',
    /Weitere Unterhaltung im Postfach öffnen/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-140));
}

gruppe('Bei zwei Unterhaltungen zählt die spätere für das Startdatum');
{
  const spaeter = macheThread({ id: 'T5', titel: 'Mara Kell', zeit: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    vorschau: 'marakell.runs gefällt eine Nachricht' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [spaeter],
    // Die Beschreibung traegt beide Unterhaltungen von Anfang an.
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-thread: T5', tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  const gesetzt = new Date(Number(serverTasks[0].start)).toISOString().slice(0, 10);
  pruefe('Das Startdatum ist das der späteren Unterhaltung', gesetzt === '2026-10-01', gesetzt);
}

gruppe('Eine Karteileiche fängt die zweite Unterhaltung nicht ab');
{
  const spaeter = macheThread({ id: 'T5', titel: 'Mara Kell', zeit: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    vorschau: 'marakell.runs gefällt eine Nachricht' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [spaeter],
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG, 'karteileiche'] }],
  });
  klick(w, chip(doc, 4, 'crm'));
  await warte(w, 2500);
  pruefe('Ein neuer Task entsteht', angelegte(aufrufe).length === 1,
    JSON.stringify(angelegte(aufrufe).length));
  pruefe('Die Karteileiche bleibt unangetastet',
    !/igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-120));
}

gruppe('Das Panel sagt, was das Skript gerade sieht');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const d = doc.querySelector('#igfu-diagnose');
  pruefe('Die Diagnosezeile ist da', !!d);
  pruefe('Sie nennt die drei erkannten Instagram-Unterhaltungen',
    !!d && /3 Unterhaltungen gerade im Dokument/.test(d.textContent || ''), d && d.textContent);
  pruefe('Sie nennt, wie viele einen Task haben',
    !!d && /0 mit Task/.test(d.textContent || ''), d && d.textContent);
}

gruppe('Die Diagnosezeile zählt Tasks und Handles mit');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const d = doc.querySelector('#igfu-diagnose');
  pruefe('Ein Task wird gezählt', !!d && /1 mit Task/.test(d.textContent || ''), d && d.textContent);
  pruefe('Ein bekannter Handle wird gezählt',
    !!d && /1 mit bekanntem Handle/.test(d.textContent || ''), d && d.textContent);
}

gruppe('Außerhalb der Unterhaltungsliste sagt sie Bescheid');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP, markt: [{ handle: 'jemand', bild: '555' }] });
  pruefe('Im Marketplace steht keine Diagnosezeile', !doc.querySelector('#igfu-diagnose'));
}

gruppe('Das Panel zeigt die Unterhaltungen ohne Task');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'ohne Thread' }],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const text = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Abschnitt ist da', /Unterhaltungen ohne Task/.test(text));
  pruefe('Für Anna steht kein Treffer', /kein Treffer/.test(text));
  pruefe('Die gelesene Form wird gezeigt', /gelesen als „mara kell"/.test(text), text.slice(0, 400));
  // Rosina bleibt seit 7.5 in dieser Liste stehen: der Namensvergleich findet
  // sie, verbindet aber nicht mehr von selbst. Statt stillschweigend zu
  // verschwinden, steht sie hier mit ihrem Vorschlag — das ist zugleich das
  // Protokoll dessen, was frueher ungefragt passiert waere.
  const abschnitt = (text.split('Unterhaltungen ohne Task')[1] || '')
    .split(/Tasks ohne Unterhaltung|Handles nachtragen|Follow-ups/)[0];
  pruefe('Die erkannte Unterhaltung steht mit ihrem Treffer drin',
    /Treffer: Rosina Bärtl/.test(abschnitt), abschnitt.slice(0, 300));
}

gruppe('Dasselbe Profilbild führt zwei Unterhaltungen zusammen');
{
  // T5 ist dieselbe Person wie T1: gleiche Bild-ID, aber der Vorschautext nennt
  // keinen Handle — so sehen normale DMs aus.
  const zweite = macheThread({ id: 'T5', titel: 'Mara K. 🏃', bild: '111111111',
    zeit: new Date(2026, 9, 2, 8, 0, 0).getTime(), vorschau: 'Mara: Hey, schau mal' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [zweite],
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-bild: 111111111', tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Es entsteht kein zweiter Task', angelegte(aufrufe).length === 0,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data && a.data.name)));
  pruefe('Die zweite Unterhaltung hängt am selben Task',
    /igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-160));
  pruefe('Die erste bleibt stehen', /igfu-thread:\s*T1/.test(serverTasks[0].beschreibung || ''));
}

gruppe('Die Bild-ID wird nachgetragen, wenn sie noch fehlt');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    // Task ohne Unterhaltung und ohne Bild-ID, Name passt auf T2.
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'aus UpPromote' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  // Verbunden wird seit 7.5 per Klick. Die Bild-ID wird beim Verbinden
  // nachgetragen — darum geht es hier.
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const auswahl = doc.querySelectorAll('.igfu-auswahl')[1];
  pruefe('Es gibt eine Auswahl zum Verbinden', !!auswahl);
  if (auswahl) {
    auswahl.value = 'a1';
    auswahl.dispatchEvent(new w.Event('change', { bubbles: true }));
    await warte(w, 2000);
  }
  pruefe('Die Unterhaltung ist verbunden',
    /igfu-thread:\s*T2/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Die Bild-ID steht jetzt dabei',
    /igfu-bild:\s*222222222/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-160));
}

gruppe('Eine Karteileiche fängt das Zusammenführen über das Bild nicht ab');
{
  const zweite = macheThread({ id: 'T5', titel: 'Mara K. 🏃', bild: '111111111',
    zeit: new Date(2026, 9, 2, 8, 0, 0).getTime(), vorschau: 'Mara: Hey, schau mal' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [zweite],
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-bild: 111111111', tags: [TAG, 'karteileiche'] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Die Karteileiche bleibt unangetastet',
    !/igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-160));
}

gruppe('Schmuckschrift im Anzeigenamen wird aufgelöst');
{
  // Meta zeigt den Namen in fetter Schmuckschrift, ClickUp schlicht. Das sind
  // eigene Unicode-Zeichen, kein Formatierungs-Beiwerk.
  const schmuck = macheThread({ id: 'T5', titel: '𝗟𝗶𝗻𝗮 𝗙𝗲𝗹𝗱𝗲𝗿',
    bild: '777777777', zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Hey, schau mal' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [schmuck],
    tasks: [{ id: 'a1', name: 'lina_felder — Lina Felder', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: lina_felder' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der schlicht geschriebene Task wird gefunden',
    /Treffer: Lina Felder/.test(panel), panel.slice(0, 800));
  pruefe('Von selbst verbunden wird nichts',
    !/igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Ein einzelner Vorname bleibt unverbunden, auch in Schmuckschrift');
{
  // „Daniela" ist ein Vorname und passt auf zu viele. Dass er hübsch gesetzt
  // ist, macht ihn nicht eindeutiger.
  const schmuck = macheThread({ id: 'T5', titel: '\u{1D49F}\u{1D4B6}\u{1D4C3}\u{1D4BE}ℯ\u{1D4C1}\u{1D4B6}',
    bild: '777777777', zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Hey, schau mal' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [schmuck],
    tasks: [{ id: 'a1', name: 'Daniela', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'aus UpPromote' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Kein Thread angehängt',
    !/igfu-thread/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Beiwerk im Instagram-Namen stört nicht');
{
  const mitBeiwerk = macheThread({ id: 'T5', titel: 'N o R d | Nordin Makuba', bild: '777777777',
    zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Nordin: Hallo' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [mitBeiwerk],
    tasks: [{ id: 'a1', name: 'nordfit_ — Nordin Makuba', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: nordfit_' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Task wird trotz Beiwerk gefunden',
    /Treffer: Nordin Makuba/.test(panel), panel.slice(0, 800));
}

gruppe('Ein einzelnes Wort zählt nur als Handle');
{
  const alsHandle = macheThread({ id: 'T5', titel: 'stadtpedal', bild: '777777777',
    zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Hallo' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [alsHandle],
    tasks: [{ id: 'a1', name: 'stadtpedal', status: 'hat sales', farbe: '#008844', beschreibung: 'alt' },
            { id: 'a2', name: 'Timo', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'alt' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Handle-Task wird als Treffer erkannt',
    /Treffer: stadtpedal/.test(panel), panel.slice(0, 800));
  // „Timo" darf als schwacher Vorschlag erscheinen — ein Klick ist in Ordnung,
  // ein Treffer waere es nicht.
  pruefe('Der Vorname-Task ist kein Treffer',
    !/Treffer: Timo/.test(panel), panel.slice(0, 800));
  pruefe('Der Vorname-Task bleibt unverbunden',
    !/igfu-thread/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
}

gruppe('Die zweite Unterhaltung findet den Task auch über den Namen');
{
  // Der Task hat schon eine Unterhaltung. Trotzdem gehört die zweite dorthin.
  const zweite = macheThread({ id: 'T5', titel: 'Rosina Bärtl', bild: '777777777',
    zeit: new Date(2026, 9, 3, 9, 0, 0).getTime(), vorschau: 'Rosina: noch was' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [zweite],
    tasks: [{ id: 'a1', name: 'Rosina Bärtl', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T2') }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Es entsteht kein zweiter Task', angelegte(aufrufe).length === 0,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data && a.data.name)));
  pruefe('Die erste Unterhaltung bleibt am Task',
    /igfu-thread:\s*T2/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-180));
  // Das Zusammenfuehren traegt seit 7.5 die Benutzer-ID, nicht der Name. Fuer
  // Unterhaltungen ohne ID bleibt der Vorschlag.
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Die zweite wird zum selben Task gefunden',
    /Treffer: Rosina Bärtl/.test(panel), panel.slice(0, 800));
}

gruppe('Fehlende Fristen nachtragen: Warenversand');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'erste ware versendet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: zzz.niemand\nigfu-ware: 2026-09-21' }],
  });
  await klickKnopf(w, doc, 'Fehlende Fristen nachtragen');
  await warte(w, 1500);
  // 21.09.2026 ist ein Montag. Zehn Wochentage weiter, Wochenenden
  // uebersprungen, ist Montag der 05.10.
  const gesetzt = new Date(Number(serverTasks[0].due)).toISOString().slice(0, 10);
  pruefe('Versand plus 10 Wochentage', gesetzt === '2026-10-05', gesetzt);
}

gruppe('Fehlende Fristen nachtragen: Onboarding-Datum');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: zzz.niemand' }],
    affiliates: [{ first_name: 'Zzz', last_name: 'Niemand', email: 'a@b.de', instagram: 'zzz.niemand',
                   approved_at: '2026-09-01T10:00:00Z' }],
  });
  await klickKnopf(w, doc, 'Fehlende Fristen nachtragen');
  await warte(w, 2000);
  const gesetzt = new Date(Number(serverTasks[0].due)).toISOString().slice(0, 10);
  pruefe('Onboarding plus 14 Tage', gesetzt === '2026-09-15', gesetzt);
}

gruppe('Fehlende Fristen nachtragen: letzte Nachricht');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'aus UpPromote\nigfu-handle: zzz.niemand',
              start: new Date(2026, 8, 1, 12, 0, 0).getTime() }],
  });
  await klickKnopf(w, doc, 'Fehlende Fristen nachtragen');
  await warte(w, 1500);
  const gesetzt = new Date(Number(serverTasks[0].due)).toISOString().slice(0, 10);
  pruefe('Letzte Nachricht plus 14 Tage', gesetzt === '2026-09-15', gesetzt);
}

gruppe('Fehlende Fristen nachtragen: vorhandene bleiben unangetastet');
{
  const vorhanden = new Date(2026, 0, 5, 12, 0, 0).getTime();
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'erste ware versendet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: zzz.niemand\nigfu-ware: 2026-09-21',
              due: vorhanden }],
  });
  await klickKnopf(w, doc, 'Fehlende Fristen nachtragen');
  await warte(w, 1500);
  pruefe('Die Frist ist unverändert', Number(serverTasks[0].due) === vorhanden, String(serverTasks[0].due));
}

gruppe('Fehlende Fristen nachtragen: Endstatus und Karteileichen bleiben außen vor');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'abgesagt', farbe: '#87909e',
              beschreibung: 'x\nigfu-handle: zzz.niemand\nigfu-ware: 2026-09-21' },
            { id: 'a2', name: 'yyy.niemand — Yyy Niemand', status: 'erste ware versendet', farbe: '#b660e0',
              beschreibung: 'x\nigfu-handle: yyy.niemand\nigfu-ware: 2026-09-21', tags: ['karteileiche'] }],
  });
  await klickKnopf(w, doc, 'Fehlende Fristen nachtragen');
  await warte(w, 1500);
  pruefe('Abgesagt bekommt keine Frist', !serverTasks[0].due, String(serverTasks[0].due));
  pruefe('Die Karteileiche bekommt keine Frist', !serverTasks[1].due, String(serverTasks[1].due));
}

gruppe('Fehlende Fristen nachtragen: nie vor das Startdatum');
{
  // Ware vom Mai, Gespräch vom Oktober. Die Warenregel allein ergäbe eine Frist
  // vor dem Startdatum, und die lehnt ClickUp ab.
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'erste ware versendet', farbe: '#b660e0',
              beschreibung: 'x\nigfu-handle: zzz.niemand\nigfu-ware: 2026-05-12',
              start: new Date(2026, 9, 1, 12, 0, 0).getTime() }],
  });
  await klickKnopf(w, doc, 'Fehlende Fristen nachtragen');
  await warte(w, 1500);
  const gesetzt = new Date(Number(serverTasks[0].due)).toISOString().slice(0, 10);
  pruefe('Es gilt die spätere Regel', gesetzt === '2026-10-15', gesetzt);
  pruefe('Die Frist liegt nach dem Startdatum',
    Number(serverTasks[0].due) > Number(serverTasks[0].start), gesetzt);
  pruefe('Kein Startdatum mitgeschickt',
    !aufrufe.some((a) => a.methode === 'PUT' && a.data && 'start_date' in a.data),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
}

gruppe('Die Versionsnummer steht im Panel und stimmt mit dem Kopf überein');
{
  const quelle = readFileSync(new URL('../postfach-markierungen.user.js', import.meta.url), 'utf8');
  const imKopf = (quelle.match(/@version\s+([0-9.]+)/) || [])[1];
  const alsKonstante = (quelle.match(/const VERSION = '([0-9.]+)'/) || [])[1];
  pruefe('Kopf und Konstante sind gleich', imKopf === alsKonstante, imKopf + ' vs ' + alsKonstante);

  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const d = doc.querySelector('#igfu-diagnose');
  pruefe('Die Version steht in der Diagnosezeile',
    !!d && d.textContent.includes('Version ' + imKopf), d && d.textContent);
}

gruppe('Die Bilanz des letzten Durchlaufs steht im Panel');
{
  const { doc, w, store } = await starte({
    speicher: {
      ...MIT_CLICKUP,
      'igfu:durchlauf:v1': { stand: Date.now(), voll: true, gesehen: 128, mitTask: 41, mitHandle: 12 },
    },
  });
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = (doc.querySelector('#igfu-diagnose') || {}).textContent || '';
  pruefe('Sie nennt die Zahl der gesehenen Unterhaltungen', /128 Unterhaltungen gesehen/.test(t), t);
  pruefe('Sie nennt, wie viele einen Task haben', /41 mit Task/.test(t), t);
  pruefe('Sie unterscheidet vom Dokument-Stand', /gerade im Dokument/.test(t), t);
  pruefe('Der Speicher bleibt unangetastet', !!store.get('igfu:durchlauf:v1'));
}

gruppe('Ohne Durchlauf steht dort nichts davon');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = (doc.querySelector('#igfu-diagnose') || {}).textContent || '';
  pruefe('Keine erfundene Bilanz', !/Durchlauf/.test(t), t);
}

gruppe('Tasks ohne Unterhaltung stehen im Panel');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'lauf_bolti_lauf — Torsten Bolthaup', status: 'hat sales', farbe: '#e16b16',
        beschreibung: 'aus UpPromote\nigfu-handle: lauf_bolti_lauf' },
      { id: 'a2', name: 'abgesagt.person — Weg Damit', status: 'abgesagt', farbe: '#87909e',
        beschreibung: 'aus UpPromote\nigfu-handle: abgesagt.person' },
      { id: 'a3', name: 'leiche.person — Alt Konto', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'aus UpPromote\nigfu-handle: leiche.person', tags: ['karteileiche'] },
    ],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Abschnitt nennt die Zahl', /Tasks ohne Unterhaltung \(1\)/.test(t), t.slice(0, 500));
  pruefe('Der offene Task steht drin', /Torsten Bolthaup/.test(t));
  pruefe('Ein Endstatus steht nicht drin', !/Weg Damit/.test(t));
  pruefe('Eine Karteileiche steht nicht drin', !/Alt Konto/.test(t));
  // Auf den Knopf pruefen, nicht auf den Text: der Hinweissatz nennt das Wort
  // „Verbinden" ebenfalls.
  pruefe('Ohne offene Unterhaltung kein Verbinden-Knopf',
    ![...doc.querySelectorAll('.igfu-link')].some((b) => b.textContent === 'Verbinden'));
}

gruppe('Die offene Unterhaltung lässt sich von Hand verbinden');
{
  const { doc, w, serverTasks } = await starte({
    pfad: '/latest/inbox/all/?selected_item_id=T3',
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'lauf_bolti_lauf — Torsten Bolthaup', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'aus UpPromote\nigfu-handle: lauf_bolti_lauf' }],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const verbinden = [...doc.querySelectorAll('.igfu-link')].find((b) => b.textContent === 'Verbinden');
  pruefe('Der Knopf ist da', !!verbinden);
  if (verbinden) {
    klick(w, verbinden);
    await warte(w, 1200);
  }
  pruefe('Die Unterhaltung hängt am Task',
    /igfu-thread:\s*T3/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Der Link ins Postfach steht dabei',
    /selected_item_id=T3/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Die Bild-ID wurde gelernt',
    /igfu-bild:\s*333333333/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('CRM-Pille legt keine Dublette an, wenn der Handle passt');
{
  // Die Kontaktkarte nennt den Handle. In ClickUp gibt es dazu schon einen
  // Task ohne Unterhaltung — es darf kein zweiter entstehen.
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    karte: { handle: 'lauf_bolti_lauf' },
    pfad: '/latest/inbox/all/?selected_item_id=T3',
    tasks: [{ id: 'a1', name: 'lauf_bolti_lauf — Torsten Bolthaup', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'aus UpPromote\nigfu-handle: lauf_bolti_lauf' }],
  });
  klick(w, chip(doc, 2, 'crm'));
  await warte(w, 3000);
  pruefe('Kein zweiter Task', angelegte(aufrufe).length === 0,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data && a.data.name)));
  pruefe('Die Unterhaltung hängt am vorhandenen Task',
    /igfu-thread:\s*T3/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Die Auswahl zum Verbinden steht an der Unterhaltung');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'lauf_bolti_lauf — Torsten Bolthaup', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'aus UpPromote\nigfu-handle: lauf_bolti_lauf' }],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const auswahl = doc.querySelector('.igfu-auswahl');
  pruefe('Es gibt eine Auswahl', !!auswahl);
  pruefe('Der Task steht zur Wahl',
    !!auswahl && /Torsten Bolthaup/.test(auswahl.textContent || ''), auswahl && auswahl.textContent);
  if (auswahl) {
    auswahl.value = 'a1';
    auswahl.dispatchEvent(new w.Event('change', { bubbles: true }));
    await warte(w, 1500);
  }
  pruefe('Die gewählte Unterhaltung hängt am Task',
    /igfu-thread:\s*T/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Der Link ins Postfach steht dabei',
    /selected_item_id=T/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

const MIT_META = { ...MIT_CLICKUP, 'meta:token:v1': 'EAAG_geheim_meta' };
// Die Seiten-ID steht als asset_id in der Postfach-Adresse.
const META_PFAD = '/latest/inbox/all/?asset_id=' + PAGE;
// T2 ist „Rosina Bärtl", Zeitstempel 20.09.2026 09:30.
const T2_ZEIT = new Date(2026, 8, 20, 9, 30, 0).getTime();

gruppe('Die Meta-API liefert den Handle, den das Postfach nicht nennt');
{
  const { doc, w, store, aufrufe } = await starte({
    pfad: META_PFAD,
    speicher: MIT_META,
    metaUnterhaltungen: [{ id: 't_111', username: 'rosina_baertl', zeit: T2_ZEIT }],
  });
  await klickKnopf(w, doc, 'Handles über die Meta-API holen');
  await warte(w, 1500);
  pruefe('Die Conversations-Abfrage ging raus',
    aufrufe.some((a) => a.pfad.startsWith('META/') && a.pfad.includes('platform=instagram')),
    JSON.stringify(aufrufe.filter((a) => a.pfad.startsWith('META')).map((a) => a.pfad)));
  pruefe('Die Seiten-ID stammt aus der Adresse',
    aufrufe.some((a) => a.pfad.includes(PAGE)),
    JSON.stringify(aufrufe.filter((a) => a.pfad.startsWith('META')).map((a) => a.pfad)));
  const funde = store.get('meta:funde:v1');
  pruefe('Ein Handle wurde abgelegt', !!funde && funde.liste.length === 1, JSON.stringify(funde));
  pruefe('Die eigene Seite zählt nicht als Gegenüber',
    !!funde && funde.liste[0].handle === 'rosina_baertl', JSON.stringify(funde));
  // Der Scan ordnet ueber den Zeitpunkt zu.
  await warte(w, 700);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Die Unterhaltung kennt jetzt ihren Handle',
    (handles.T2 || {}).handle === 'rosina_baertl', JSON.stringify(handles.T2));
  pruefe('Die Quelle ist die API', (handles.T2 || {}).quelle === 'api', JSON.stringify(handles.T2));
}

gruppe('Der Meta-Token steht in keiner Adresse');
{
  const { doc, w, aufrufe } = await starte({
    pfad: META_PFAD,
    speicher: MIT_META,
    metaUnterhaltungen: [{ id: 't_111', username: 'rosina_baertl', zeit: T2_ZEIT }],
  });
  await klickKnopf(w, doc, 'Handles über die Meta-API holen');
  await warte(w, 1500);
  pruefe('Kein Token im Pfad',
    !aufrufe.some((a) => String(a.pfad).includes('EAAG_geheim_meta')),
    JSON.stringify(aufrufe.map((a) => a.pfad)));
  pruefe('Kein Token in einer Nutzlast',
    !aufrufe.some((a) => JSON.stringify(a.data || '').includes('EAAG_geheim_meta')));
}

gruppe('Zwei Unterhaltungen zur selben Zeit bleiben unzugeordnet');
{
  const { doc, w, store } = await starte({
    pfad: META_PFAD,
    speicher: MIT_META,
    metaUnterhaltungen: [
      { id: 't_111', username: 'rosina_baertl', zeit: T2_ZEIT },
      { id: 't_222', username: 'jemand_anders', zeit: T2_ZEIT + 1000 },
    ],
  });
  await klickKnopf(w, doc, 'Handles über die Meta-API holen');
  await warte(w, 2000);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Kein geratener Handle', !(handles.T2 || {}).handle, JSON.stringify(handles.T2));
}

gruppe('Ohne Meta-Token passiert nichts');
{
  const { doc, w, aufrufe } = await starte({ pfad: META_PFAD, speicher: MIT_CLICKUP });
  await klickKnopf(w, doc, 'Handles über die Meta-API holen');
  await warte(w, 800);
  pruefe('Keine Anfrage an Meta', !aufrufe.some((a) => String(a.pfad).startsWith('META')),
    JSON.stringify(aufrufe.map((a) => a.pfad)));
}

gruppe('Auf instagram.com wird die Liste gelesen');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [
      { id: '17843301684077278', titel: 'stadtpedal', vorschau: '3 new messages', zeit: '10m', ungelesen: true, bild: '840052174' },
      { id: '113874680003704', titel: 'Stefanie | Vegan Food Inspo', vorschau: 'You: habe dir geantwortet ;)', zeit: '59m' },
      { id: '17847685227038439', titel: 'Thorsten | Laufen & Trailrunning', vorschau: 'Liked a message', zeit: '19h' },
    ],
  });
  pruefe('Knöpfe erscheinen an jeder Zeile',
    doc.querySelectorAll('.igfu-tag[data-kind="followup"]').length === 3,
    String(doc.querySelectorAll('.igfu-tag[data-kind="followup"]').length));
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const d = doc.querySelector('#igfu-diagnose');
  pruefe('Die Diagnose zählt drei Unterhaltungen',
    !!d && /3 Unterhaltungen gerade im Dokument/.test(d.textContent || ''), d && d.textContent);
}

gruppe('Der Link zeigt auf instagram.com');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17847685227038439', titel: 'stadtpedal', vorschau: 'Hallo', zeit: '2h' }],
  });
  klick(w, chip(doc, 0, 'crm'));
  await warte(w, 2500);
  const angelegt = angelegte(aufrufe)[0];
  pruefe('Ein Task entsteht', !!angelegt, JSON.stringify(aufrufe.map((a) => a.pfad)));
  const text = (angelegt && angelegt.data && angelegt.data.markdown_description) || '';
  pruefe('Der Link geht nach instagram.com',
    text.includes('https://www.instagram.com/direct/t/17847685227038439/'), text.slice(0, 180));
  pruefe('Kein Link in die Business Suite', !/business\.facebook\.com/.test(text), text.slice(0, 180));
  pruefe('Die Markerzeile trägt den thread_key',
    /igfu-ig:\s*17847685227038439/.test(text), text.slice(-120));
}

gruppe('Alte Kennungen behalten ihren alten Link');
{
  // Die 39-stelligen Kennungen aus dem Postfach gibt es auf instagram.com
  // nicht. Ihre Links muessen weiter in die Business Suite zeigen, sonst
  // laufen die Altbestaende ins Leere.
  const alt = macheThread({ id: '340282366841710301244259840012452280991', titel: 'Alte Person',
    zeit: new Date(2026, 9, 1, 9, 0, 0).getTime(), vorschau: 'Hallo' });
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_CLICKUP, zusatz: [alt], karte: { handle: 'alte.person' },
  });
  klick(w, chip(doc, 4, 'crm'));
  await warte(w, 2500);
  const text = ((angelegte(aufrufe)[0] || {}).data || {}).markdown_description || '';
  pruefe('Der Link geht in die Business Suite',
    text.includes('business.facebook.com/latest/inbox/all/'), text.slice(0, 160));
  pruefe('Nicht nach instagram.com', !/instagram\.com\/direct\/t\//.test(text), text.slice(0, 160));
}

gruppe('Ungelesen heißt: das Gegenüber hat geschrieben');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077278', titel: 'stadtpedal', vorschau: '3 new messages', zeit: '10m', ungelesen: true }],
    tasks: [{ id: 'a1', name: 'stadtpedal', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-thread: 17843301684077278\nigfu-handle: stadtpedal' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Die Priorität steht auf urgent', serverTasks[0].prio === 'urgent', String(serverTasks[0].prio));
}

gruppe('Eine Reaktion ist keine offene Nachricht');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17847685227038439', titel: 'Thorsten', vorschau: 'Liked a message', zeit: '19h' }],
    tasks: [{ id: 'a1', name: 'thorsten.b — Thorsten', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-thread: 17847685227038439\nigfu-handle: thorsten.b' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Keine Priorität gesetzt', !serverTasks[0].prio, String(serverTasks[0].prio));
}

gruppe('Der Umzug: ein Altbestand bekommt seine Instagram-Unterhaltung');
{
  // Der Task haengt an der alten 39-stelligen Kennung. Auf instagram.com steht
  // seine Unterhaltung unter einer ganz anderen — zugeordnet wird ueber den
  // Handle, den Instagram als Zeilentitel zeigt.
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077278', titel: 'stadtpedal', vorschau: 'Hallo', zeit: '2h' }],
    tasks: [{ id: 'a1', name: 'stadtpedal', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'x\nigfu-thread: 340282366841710301244259840012452280991\nigfu-handle: stadtpedal' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  const text = serverTasks[0].beschreibung || '';
  pruefe('Es entsteht kein zweiter Task', angelegte(aufrufe).length === 0,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data && a.data.name)));
  pruefe('Die Instagram-Kennung kam dazu', /igfu-ig:\s*17843301684077278/.test(text), text.slice(-200));
  pruefe('Die alte Kennung bleibt stehen',
    /igfu-thread:\s*340282366841710301244259840012452280991/.test(text), text.slice(-200));
  pruefe('Der neue Link geht nach instagram.com',
    text.includes('https://www.instagram.com/direct/t/17843301684077278/'), text.slice(-200));
  pruefe('Er ist als Instagram-Link benannt', /auf Instagram öffnen/.test(text), text.slice(-200));
}

gruppe('Das Panel zeigt, was noch am alten Postfach hängt');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'alt.person — Alte Person', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-thread: 340282366841710301244259840012452280991\nigfu-handle: alt.person' },
      { id: 'a2', name: 'neu.person — Neue Person', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-ig: 17843301684077278\nigfu-handle: neu.person' },
    ],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Die Zahl stimmt', /Noch am alten Postfach \(1\)/.test(t), t.slice(0, 400));
  pruefe('Der Altbestand steht drin', /Alte Person/.test(t));
  pruefe('Der umgezogene nicht',
    !/Neue Person/.test(t.split('Noch am alten Postfach')[1] || ''), t.slice(0, 400));
}

gruppe('Der volle Durchlauf hört auf, wenn nur noch Fremdes kommt');
{
  // Vier Unterhaltungen, keine davon gehört zu einem Task. Der Lauf darf nicht
  // endlos weiterscrollen — auf instagram.com liegen tausende private Chats.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: Array.from({ length: 4 }, (_, i) => ({
      id: '1784330168407727' + i, titel: 'Fremde Person ' + i, vorschau: 'Hallo', zeit: (i + 1) + 'h',
    })),
  });
  await klickKnopf(w, doc, 'Ganze Liste durchgehen');
  await warte(w, 4000);
  const knopfText = (doc.querySelector('#igfu-refresh') || {}).textContent || '';
  pruefe('Der Lauf ist beendet', !/abbrechen/.test(knopfText), knopfText);
}

gruppe('Ein zweiter Klick bricht den Durchlauf ab');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: Array.from({ length: 3 }, (_, i) => ({
      id: '1784330168407728' + i, titel: 'Person ' + i, vorschau: 'Hallo', zeit: (i + 1) + 'h',
    })),
  });
  const refresh = doc.querySelector('#igfu-refresh');
  pruefe('Der Knopf ist da', !!refresh);
  klick(w, refresh);
  await warte(w, 200);
  // Waehrend des Laufs ist der Knopf nicht gesperrt, sondern der Abbrecher.
  pruefe('Der Knopf bleibt klickbar', refresh.disabled !== true, String(refresh.disabled));
  klick(w, refresh);
  await warte(w, 4000);
  pruefe('Danach steht er wieder normal da',
    !/abbrechen/.test(refresh.textContent || ''), refresh.textContent);
}

const ALT_UND_NEU = [
  '[Unterhaltung im Postfach öffnen](https://business.facebook.com/latest/inbox/all/?asset_id=1&selected_item_id=340282366841710301244259840012452280991&thread_type=IG_MESSAGE)',
  '',
  'Instagram: [@stadtpedal](https://www.instagram.com/stadtpedal/)',
  '',
  'Link zu Nachrichten: https://business.facebook.com/latest/inbox/all/?ir_qe_exposed=1',
  '',
  '* * *',
  '',
  'Vom Postfach-Skript verwaltet. Die folgende Zeile bitte nicht ändern.',
  'igfu-thread: 340282366841710301244259840012452280991',
  'igfu-handle: stadtpedal',
  'igfu-ware: 2026-09-24',
  '',
  '[Weitere Unterhaltung auf Instagram öffnen](https://www.instagram.com/direct/t/17843301684077278/)',
  'igfu-ig: 17843301684077278',
].join('\n');

gruppe('Alte Postfach-Links werden entfernt, wo ein Instagram-Link da ist');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'stadtpedal', status: 'hat sales', farbe: '#e16b16', beschreibung: ALT_UND_NEU }],
  });
  await klickKnopf(w, doc, 'Alte Postfach-Links entfernen');
  await warte(w, 2000);
  const t = serverTasks[0].beschreibung || '';
  pruefe('Der Link ins alte Postfach ist weg', !/business\.facebook\.com/.test(t), t);
  pruefe('Die Zeile „Link zu Nachrichten" ist weg', !/Link zu Nachrichten/.test(t), t);
  pruefe('Die alte Markerzeile ist weg', !/igfu-thread:\s*340282/.test(t), t);
  pruefe('Die Instagram-Kennung bleibt', /igfu-ig:\s*17843301684077278/.test(t), t);
  pruefe('Das Profil bleibt', /Instagram: \[@stadtpedal\]/.test(t), t);
  pruefe('Handle und Ware bleiben', /igfu-handle: stadtpedal/.test(t) && /igfu-ware: 2026-09-24/.test(t), t);
  pruefe('Der Instagram-Link steht jetzt oben',
    t.startsWith('[Unterhaltung auf Instagram öffnen](https://www.instagram.com/direct/t/17843301684077278/)'),
    t.slice(0, 120));
  pruefe('Nicht mehr „Weitere"', !/Weitere Unterhaltung/.test(t), t);
}

gruppe('Ohne Instagram-Link bleibt der alte stehen');
{
  // Sonst bliebe der Task ganz ohne Verlinkung zurueck.
  const nurAlt = [
    '[Unterhaltung im Postfach öffnen](https://business.facebook.com/latest/inbox/all/?selected_item_id=340282366841710301244259840012452280991&thread_type=IG_MESSAGE)',
    '',
    'igfu-thread: 340282366841710301244259840012452280991',
    'igfu-handle: altperson',
  ].join('\n');
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'altperson — Alte Person', status: 'ongeboardet', farbe: '#b660e0', beschreibung: nurAlt }],
  });
  await klickKnopf(w, doc, 'Alte Postfach-Links entfernen');
  await warte(w, 1500);
  const t = serverTasks[0].beschreibung || '';
  pruefe('Der alte Link bleibt', /business\.facebook\.com/.test(t), t);
  pruefe('Die alte Markerzeile bleibt', /igfu-thread:\s*340282/.test(t), t);
}

gruppe('Zwei Instagram-Unterhaltungen bleiben beide erhalten');
{
  const zwei = [
    '[Unterhaltung im Postfach öffnen](https://business.facebook.com/latest/inbox/all/?selected_item_id=340282366841710301244259840012452280991)',
    'igfu-thread: 340282366841710301244259840012452280991',
    'igfu-handle: doppelt',
    '',
    '[Weitere Unterhaltung auf Instagram öffnen](https://www.instagram.com/direct/t/17843301684077278/)',
    'igfu-ig: 17843301684077278',
    '',
    '[Weitere Unterhaltung auf Instagram öffnen](https://www.instagram.com/direct/t/1629424262158448/)',
    'igfu-ig: 1629424262158448',
  ].join('\n');
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'doppelt — Zwei Chats', status: 'ongeboardet', farbe: '#b660e0', beschreibung: zwei }],
  });
  await klickKnopf(w, doc, 'Alte Postfach-Links entfernen');
  await warte(w, 1500);
  const t = serverTasks[0].beschreibung || '';
  pruefe('Beide Instagram-Kennungen bleiben',
    /igfu-ig:\s*17843301684077278/.test(t) && /igfu-ig:\s*1629424262158448/.test(t), t);
  pruefe('Beide Instagram-Links bleiben',
    (t.match(/instagram\.com\/direct\/t\//g) || []).length === 2, t);
  pruefe('Das alte Postfach ist raus', !/business\.facebook\.com/.test(t), t);
}

gruppe('Status „ignore" wird nicht mehr angefasst');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status: 'ignore', farbe: '#e5484d',
              beschreibung: beschreibungMit('T1') + '\nigfu-handle: marakell.runs' }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs',
                   approved_amount: '120.00' }],
  });
  await klickKnopf(w, doc, 'UpPromote abgleichen');
  await warte(w, 1500);
  pruefe('Der Status bleibt auf ignore', serverTasks[0].status === 'ignore', serverTasks[0].status);
}

gruppe('Der Filter blendet gelesene Unterhaltungen aus');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [
      { id: '17843301684077278', titel: 'stadtpedal', vorschau: '2 new messages', zeit: '10m', ungelesen: true },
      { id: '113874680003704', titel: 'Stefanie', vorschau: 'You: hallo', zeit: '59m' },
      { id: '17847685227038439', titel: 'Thorsten', vorschau: 'Liked a message', zeit: '19h' },
    ],
  });
  const zeilen = () => [...doc.querySelectorAll('.igrow')].filter((r) => r.style.display !== 'none').length;
  pruefe('Zuerst sind alle drei zu sehen', zeilen() === 3, String(zeilen()));
  const f = doc.querySelector('#igfu-filter');
  pruefe('Der Filterknopf ist da', !!f);
  klick(w, f);
  await warte(w, 400);
  pruefe('Nur die ungelesene bleibt', zeilen() === 1, String(zeilen()));
  pruefe('Der Knopf zeigt den Zustand', /✓/.test(f.textContent || ''), f.textContent);
  klick(w, f);
  await warte(w, 400);
  pruefe('Danach wieder alle', zeilen() === 3, String(zeilen()));
}

gruppe('Im alten Postfach gibt es den Filter nicht');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 300);
  const f = doc.querySelector('#igfu-filter');
  pruefe('Der Filterknopf ist ausgeblendet', !f || f.hidden === true, String(f && f.hidden));
}

gruppe('Ein langer Einzelname wird zugeordnet, ein kurzer Vorname nicht');
{
  // „HertaLarissa" ist ein Wort, aber kein Handle — Grossbuchstaben. Zwoelf
  // Zeichen reichen trotzdem, um dafuer geradezustehen. „Timo" nicht.
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [
      { id: '17843301684077280', titel: 'HertaLarissa', vorschau: 'Hallo', zeit: '3h' },
      { id: '17843301684077281', titel: 'Timo', vorschau: 'Hallo', zeit: '4h' },
    ],
    tasks: [
      { id: 'a1', name: 'hertafichtel — HertaLarissa', status: 'erste ware versendet', farbe: '#b660e0',
        beschreibung: 'aus UpPromote\nigfu-handle: hertafichtel' },
      { id: 'a2', name: 'timo__83 — Timo', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: 'aus UpPromote\nigfu-handle: timo__83' },
    ],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('HertaLarissa wird als Treffer erkannt',
    /Treffer: HertaLarissa/.test(panel), panel.slice(0, 800));
  // Der kurze Vorname darf vorgeschlagen werden, aber nie als Treffer gelten.
  pruefe('Timo ist kein Treffer',
    !/Treffer: Timo/.test(panel), panel.slice(0, 800));
  pruefe('Timo bleibt unverbunden',
    !/igfu-thread/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
}

gruppe('Zwei gleich lange Einzelnamen bleiben unzugeordnet');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077282', titel: 'Sonnenschein', vorschau: 'Hallo', zeit: '3h' }],
    tasks: [
      { id: 'a1', name: 'erste.person — Sonnenschein', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-handle: erste.person' },
      { id: 'a2', name: 'zweite.person — Sonnenschein', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-handle: zweite.person' },
    ],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Keiner der beiden wird verbunden',
    !/igfu-thread/.test(serverTasks[0].beschreibung || '') && !/igfu-thread/.test(serverTasks[1].beschreibung || ''),
    JSON.stringify([serverTasks[0].beschreibung, serverTasks[1].beschreibung]));
}

gruppe('Alle Endstatus bleiben stehen');
{
  // Nicht nur ignore: abgesagt, keine antwort und beendet gehoeren genauso
  // dazu. Josia hat dort von Hand einsortiert.
  for (const status of ['abgesagt', 'ignore', 'keine antwort', 'beendet']) {
    const { doc, w, serverTasks } = await starte({
      speicher: MIT_UP,
      tasks: [{ id: 'a1', name: 'marakell.runs — Mara Kell', status, farbe: '#e5484d',
                beschreibung: beschreibungMit('T1') + '\nigfu-handle: marakell.runs' }],
      affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de',
                     instagram: 'marakell.runs', approved_amount: '120.00' }],
    });
    await klickKnopf(w, doc, 'UpPromote abgleichen');
    await warte(w, 1200);
    pruefe('„' + status + '" bleibt stehen', serverTasks[0].status === status, serverTasks[0].status);
  }
}

gruppe('Eine Vorschau mit Adresse ergibt keinen Handle');
{
  // So sind Tasks namens „https — Erste Zeile" entstanden: die Vorschau begann mit
  // einer Adresse, und das Muster „wort:" griff auf „https:". Geprüft wird am
  // Handle-Speicher, nicht am Task — ein Task entstünde hier gar nicht, weil
  // ohne Handle die Nachfrage aufgeht.
  const { w, store } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077290', titel: 'Erste Zeile', vorschau: 'https://cdn.uppromote.com/anleitung.pdf', zeit: '2h' }],
  });
  await warte(w, 900);
  const handles = store.get('clickup:handles:v1') || {};
  const eintrag = handles['17843301684077290'] || {};
  pruefe('Kein Handle „https" gemerkt', eintrag.handle !== 'https', JSON.stringify(eintrag));
  pruefe('Überhaupt kein geratener Handle', !eintrag.handle, JSON.stringify(eintrag));
}

gruppe('Rutscht die Vorschau in den Namen, wird sie abgeschnitten');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077291', titel: 'Hannah | Trailrun | RadelnYou: Hi Hannah,', vorschau: 'egal', zeit: '2h' }],
  });
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Die Vorschau ist raus', !/Hi Hannah/.test(t), t.slice(0, 300));
  pruefe('Der Name bleibt stehen', /Hannah \| Trailrun \| Radeln/.test(t), t.slice(0, 300));
}

gruppe('Anschreib-Links aus dem Handle');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'hey.lumi — Lumi', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'aus UpPromote\nigfu-handle: hey.lumi' },
      { id: 'a2', name: 'mit.chat — Hat schon', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: '[Unterhaltung auf Instagram öffnen](https://www.instagram.com/direct/t/17843301684077278/)\nigfu-ig: 17843301684077278\nigfu-handle: mit.chat' },
      { id: 'a3', name: 'Ohne Handle', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'nichts' },
      { id: 'a4', name: 'weg.damit — Weg', status: 'abgesagt', farbe: '#e5484d',
        beschreibung: 'x\nigfu-handle: weg.damit' },
    ],
  });
  await klickKnopf(w, doc, 'Anschreib-Links nachtragen');
  await warte(w, 2500);
  pruefe('Der Task ohne Link bekommt einen',
    (serverTasks[0].beschreibung || '').includes('https://ig.me/m/hey.lumi'), serverTasks[0].beschreibung);
  pruefe('Er steht ganz oben',
    (serverTasks[0].beschreibung || '').startsWith('[Auf Instagram anschreiben]'), serverTasks[0].beschreibung);
  pruefe('Wer schon eine Unterhaltung hat, bleibt unberührt',
    !/ig\.me/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
  pruefe('Ohne Handle passiert nichts',
    !/ig\.me/.test(serverTasks[2].beschreibung || ''), serverTasks[2].beschreibung);
  pruefe('Endstatus bleibt außen vor',
    !/ig\.me/.test(serverTasks[3].beschreibung || ''), serverTasks[3].beschreibung);
}

gruppe('Kennungen richtigstellen: der Link entscheidet, nicht die Länge');
{
  // 1100434292377942 ist 16-stellig und stammt trotzdem aus dem Postfach —
  // genau daran ist die alte Annahme gescheitert.
  const ausPostfach = [
    '[Unterhaltung im Postfach öffnen](https://business.facebook.com/latest/inbox/all/?selected_item_id=1100434292377942&thread_type=IG_MESSAGE)',
    'igfu-thread: 1100434292377942',
    'igfu-handle: nachtstill_',
  ].join('\n');
  const vonInstagram = [
    '[Unterhaltung auf Instagram öffnen](https://www.instagram.com/direct/t/2566949743743413/)',
    'igfu-thread: 2566949743743413',
    'igfu-handle: clara.kehl',
  ].join('\n');
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'nachtstill_ — Noreth', status: 'ongeboardet', farbe: '#b660e0', beschreibung: ausPostfach },
      { id: 'a2', name: 'clara.kehl — Clara', status: 'ongeboardet', farbe: '#b660e0', beschreibung: vonInstagram },
    ],
  });
  await klickKnopf(w, doc, 'Kennungen richtigstellen');
  await warte(w, 2000);
  pruefe('Die Postfach-Kennung bleibt igfu-thread',
    /igfu-thread:\s*1100434292377942/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Sie wird nicht zu Instagram umgedeutet',
    !/igfu-ig:/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Die Instagram-Kennung wird umgestellt',
    /igfu-ig:\s*2566949743743413/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
  pruefe('Und steht nicht mehr als igfu-thread',
    !/igfu-thread:\s*2566949743743413/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
}

gruppe('„Noch am alten Postfach" zählt jetzt richtig');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'nachtstill_ — Aus dem Postfach', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-thread: 1100434292377942\nigfu-handle: nachtstill_' },
      { id: 'a2', name: 'clara.kehl — Von Instagram', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-ig: 2566949743743413\nigfu-handle: clara.kehl' },
    ],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Die kurze Postfach-Kennung zählt als offen',
    /Noch am alten Postfach \(1\)/.test(t), t.slice(0, 300));
  pruefe('Der Instagram-Task nicht',
    !/Von Instagram/.test((t.split('Noch am alten Postfach')[1] || '').split(/Unterhaltungen ohne Task|Tasks ohne/)[0] || ''), t.slice(0, 400));
}

gruppe('Namen richtigstellen');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'beispiel.stkl — Beispiel PersonYou: Hi Beispiel,', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: 'x\nigfu-handle: beispiel.stkl' },
      { id: 'a2', name: 'https — Erste Zeile', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: 'x\nigfu-handle: https' },
      { id: 'a3', name: 'sauber.person — Alles gut', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: 'x\nigfu-handle: sauber.person' },
    ],
  });
  await klickKnopf(w, doc, 'Namen richtigstellen');
  await warte(w, 2500);
  pruefe('Die Vorschau ist aus dem Namen raus',
    serverTasks[0].name === 'beispiel.stkl — Beispiel Person', serverTasks[0].name);
  pruefe('Der falsche Handle ist aus dem Namen raus',
    serverTasks[1].name === 'Erste Zeile', serverTasks[1].name);
  pruefe('Und auch aus der Beschreibung',
    !/igfu-handle:\s*https/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
  pruefe('Ein sauberer Name bleibt unangetastet',
    serverTasks[2].name === 'sauber.person — Alles gut', serverTasks[2].name);
}

gruppe('Handles gegen UpPromote prüfen');
{
  const { doc, w, store } = await starte({
    speicher: MIT_UP,
    tasks: [
      // Handle im Task weicht ab — UpPromote kennt hey.lumi
      { id: 'a1', name: 'falsch.geraten — Anka', status: 'hat sales', farbe: '#e16b16',
        beschreibung: 'x\nigfu-handle: falsch.geraten\nigfu-mail: anka.engl@example.de' },
      // Stimmt überein
      { id: 'a2', name: 'marakell.runs — Mara', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-handle: marakell.runs\nigfu-mail: a@b.de' },
      // Ohne Mailadresse nicht prüfbar
      { id: 'a3', name: 'ohne.mail — Niemand', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-handle: ohne.mail' },
    ],
    affiliates: [
      { first_name: 'Anka', last_name: 'Engl', email: 'anka.engl@example.de', instagram: 'hey.lumi' },
      { first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs' },
    ],
  });
  await klickKnopf(w, doc, 'Handles gegen UpPromote prüfen');
  await warte(w, 2000);
  const d = store.get('clickup:handle-zweifel:v1') || { liste: [] };
  pruefe('Genau eine Abweichung', d.liste.length === 1, JSON.stringify(d.liste));
  pruefe('Es ist die richtige',
    (d.liste[0] || {}).hier === 'falsch.geraten' && (d.liste[0] || {}).beiUp === 'hey.lumi',
    JSON.stringify(d.liste[0]));
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Die Liste steht im Panel', /Handle weicht von UpPromote ab \(1\)/.test(t), t.slice(0, 300));
  pruefe('Beide Handles werden genannt', /@falsch\.geraten/.test(t) && /@hey\.lumi/.test(t), t.slice(0, 400));
}

gruppe('Ohne Abweichung steht im Panel nichts davon');
{
  const { doc, w } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'marakell.runs — Mara', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'x\nigfu-handle: marakell.runs\nigfu-mail: a@b.de' }],
    affiliates: [{ first_name: 'Mara', last_name: 'Kell', email: 'a@b.de', instagram: 'marakell.runs' }],
  });
  await klickKnopf(w, doc, 'Handles gegen UpPromote prüfen');
  await warte(w, 1800);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  pruefe('Kein Abschnitt', !/Handle weicht von UpPromote ab/.test(doc.querySelector('.igfu-body').textContent || ''));
}

gruppe('Kurze Namen werden vorgeschlagen, nicht verbunden');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077295', titel: 'Anka', vorschau: 'You: Hi Anka,', zeit: '2h' }],
    tasks: [{ id: 'a1', name: 'hey.lumi — Anka', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'x\nigfu-handle: hey.lumi' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Nicht von selbst verbunden',
    !/igfu-ig/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Vorschlag steht im Panel', /Vorschlag: Anka/.test(t), t.slice(0, 400));
  const uebernehmen = [...doc.querySelectorAll('.igfu-link')].find((b) => b.textContent === 'Übernehmen');
  pruefe('Es gibt einen Übernehmen-Knopf', !!uebernehmen);
  if (uebernehmen) {
    klick(w, uebernehmen);
    await warte(w, 1500);
  }
  pruefe('Nach dem Klick ist sie verbunden',
    /igfu-ig:\s*17843301684077295/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Mit Instagram-Link',
    /instagram\.com\/direct\/t\/17843301684077295/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Bei zwei gleichnamigen Tasks gibt es keinen Vorschlag');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077296', titel: 'Anka', vorschau: 'Hallo', zeit: '2h' }],
    tasks: [
      { id: 'a1', name: 'eine.anka — Anka', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'x\nigfu-handle: eine.anka' },
      { id: 'a2', name: 'andere.anka — Anka', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'x\nigfu-handle: andere.anka' },
    ],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Kein Vorschlag', !/Vorschlag:/.test(t), t.slice(0, 400));
  pruefe('Kein Übernehmen-Knopf',
    ![...doc.querySelectorAll('.igfu-link')].some((b) => b.textContent === 'Übernehmen'));
}

gruppe('Die geöffnete Unterhaltung verrät den Handle');
{
  // In der Liste heisst die Zeile nur „Anka" — zu kurz zum Zuordnen. Im
  // Gespraechskopf steht dagegen der Profillink mit dem echten Handle.
  const { doc, w, store, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '106620957406652', titel: 'Anka', vorschau: 'You: Hi Anka,', zeit: '2h' }],
    igOffen: { tid: '106620957406652', handle: 'hey.lumi', titel: 'Anka' },
    tasks: [{ id: 'a1', name: 'hey.lumi — Anka', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'x\nigfu-handle: hey.lumi' }],
  });
  await warte(w, 4000);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Der Handle wurde gelesen',
    (handles['106620957406652'] || {}).handle === 'hey.lumi', JSON.stringify(handles['106620957406652']));
  pruefe('Die Quelle ist die Kontaktkarte',
    (handles['106620957406652'] || {}).quelle === 'karte', JSON.stringify(handles['106620957406652']));
  pruefe('Der Task wurde verbunden',
    /igfu-ig:\s*106620957406652/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Mit Instagram-Link',
    /instagram\.com\/direct\/t\/106620957406652/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Das eigene Konto wird nicht für das Gegenüber gehalten');
{
  // Ohne Gegenueber bleibt nur der Link auf das eigene Konto in der Leiste —
  // und der traegt keinen Text.
  const { doc, w, store } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '106620957406652', titel: 'Anka', vorschau: 'Hallo', zeit: '2h' }],
  });
  await warte(w, 2000);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Kein Handle aus der Navigationsleiste',
    !(handles['106620957406652'] || {}).handle, JSON.stringify(handles['106620957406652']));
}

gruppe('Eine Zeile ohne eigenen Text borgt sich keinen fremden Namen');
{
  // Die zweite Zeile traegt ihren Namen nicht selbst. Ohne Schranke klettert
  // das Skript auf der Suche nach Text bis in den Behaelter, der alle Zeilen
  // enthaelt, und nimmt den Namen der ersten. Genau so bekam der Task von
  // am 14.10.2026 mehrere Tasks den Namen einer fremden Zeile — einer sogar
  // den Handle einer wildfremden Person.
  const { doc, w, store } = await starte({
    speicher: MIT_CLICKUP,
    ig: [
      { id: '111000111', titel: 'Erste Zeile', vorschau: 'Hallo', zeit: '2h' },
      { id: '222000222', titel: 'Zweite Zeile', ohneText: true },
    ],
  });
  await warte(w, 2500);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Die textlose Zeile wird übersprungen',
    !handles['222000222'], JSON.stringify(handles['222000222']));
  pruefe('Die Zeile mit Text wird normal versorgt',
    doc.querySelectorAll('.igfu-tags').length === 1,
    String(doc.querySelectorAll('.igfu-tags').length));
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const panel = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Name der ersten Zeile taucht nicht zweimal auf',
    (panel.match(/Erste Zeile/g) || []).length <= 1, panel.slice(0, 400));
}

gruppe('Die Benutzer-ID wird am Task verankert');
{
  const { w, store, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '333000333', titel: 'Zweitname', vorschau: 'Hallo', zeit: '2h', nutzer: '4100000077' }],
    igOffen: { tid: '333000333', handle: 'zzz.zweitname', titel: 'Zweitname' },
    tasks: [{ id: 'c1', name: 'zzz.zweitname — Zweitname', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'x\nigfu-handle: zzz.zweitname' }],
  });
  await warte(w, 4000);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Die ID steht im Speicher',
    (handles['333000333'] || {}).nutzer === '4100000077', JSON.stringify(handles['333000333']));
  pruefe('Die ID steht als Markerzeile am Task',
    /igfu-iguser:\s*4100000077/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Dieselbe Person in zwei Postfächern bleibt ein Task');
{
  // Am 14.10.2026 an der echten Liste gemessen: dieselbe Person als
  // Partner-Nachricht und als normale DM —
  // zwei Kennungen, aber dieselbe Benutzer-ID. Ueber den Namen waere das nicht
  // zu entscheiden, ueber die ID schon.
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '100000000000002', titel: 'Zweitname', vorschau: 'Hallo', zeit: '2h', nutzer: '4100000077' }],
    tasks: [{ id: 'c1', name: 'zzz.zweitname — Zweitname', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'Unterhaltung\nigfu-ig: 2100000000000001\nigfu-handle: zzz.zweitname\nigfu-iguser: 4100000077' }],
  });
  await warte(w, 4000);
  pruefe('Kein zweiter Task', serverTasks.length === 1, String(serverTasks.length));
  pruefe('Die zweite Unterhaltung hängt am selben Task',
    /igfu-ig:\s*100000000000002/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Die erste bleibt stehen',
    /igfu-ig:\s*2100000000000001/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Ein schon verbundener Task bekommt die Benutzer-ID nachgetragen');
{
  // Geschrieben wird die ID sonst allein beim Verknüpfen. Ohne dieses
  // Nachtragen bekäme nur Neues einen Schlüssel, und der ganze Bestand — rund
  // zweihundert Tasks, die ihre Unterhaltung längst haben — bliebe ohne.
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '444000444', titel: 'Schon verbunden', vorschau: 'Hallo', zeit: '2h', nutzer: '4100000088' }],
    tasks: [{ id: 'a1', name: 'zzz.verbunden — Schon Verbunden', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'Unterhaltung\nigfu-ig: 444000444\nigfu-handle: zzz.verbunden' }],
  });
  await warte(w, 3000);
  pruefe('Die Markerzeile wurde nachgetragen',
    /igfu-iguser:\s*4100000088/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Die bestehende Unterhaltung bleibt stehen',
    /igfu-ig:\s*444000444/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Auch in einer Partner-Unterhaltung wird der Handle gelesen');
{
  // Dort trägt kein Profillink Text, und der Schrägstrich am Ende fehlt. Bis
  // 7.6 fand der Leser deshalb nichts, und Partner ohne sprechenden
  // Anzeigenamen blieben dauerhaft unverbunden.
  const { w, store, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '1600607831797831', titel: 'zzz', vorschau: 'Hallo', zeit: '2h' }],
    igOffen: { tid: '1600607831797831', handle: 'zzz.auf.zeit', partner: true },
    tasks: [{ id: 'a1', name: 'zzz.auf.zeit — Zzz Aufzeit', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'x\nigfu-handle: zzz.auf.zeit' }],
  });
  await warte(w, 4000);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Der Handle wurde gelesen',
    (handles['1600607831797831'] || {}).handle === 'zzz.auf.zeit',
    JSON.stringify(handles['1600607831797831']));
  pruefe('Der Task wurde darüber verbunden',
    /igfu-ig:\s*1600607831797831/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Ein geratener Handle blockiert den richtigen nicht');
{
  // „zzz" ist handle-förmig, aber nur der Anzeigename von zzz.auf.zeit. Er
  // darf gemerkt werden — er darf nur nicht verhindern, dass die geöffnete
  // Unterhaltung den echten Handle nachliefert. Bis 7.7 tat er genau das.
  const { w, store, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '990000990', titel: 'zzz', vorschau: 'Hallo', zeit: '2h' }],
    igOffen: { tid: '990000990', handle: 'zzz.auf.zeit', partner: true },
    tasks: [{ id: 'a1', name: 'zzz.auf.zeit — Zzz Aufzeit', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'x\nigfu-handle: zzz.auf.zeit' }],
  });
  await warte(w, 4000);
  const handles = store.get('clickup:handles:v1') || {};
  pruefe('Der echte Handle setzt sich durch',
    (handles['990000990'] || {}).handle === 'zzz.auf.zeit', JSON.stringify(handles['990000990']));
  pruefe('Und der Task wird verbunden',
    /igfu-ig:\s*990000990/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Das eigene Konto wird nie für das Gegenüber gehalten');
{
  // In manchen Partner-Unterhaltungen ist das Gegenüber gar nicht verlinkt.
  // Dann bleibt nur die Navigationsleiste übrig — und die gehört dir. In 7.7
  // galt „bleibt genau einer übrig, nimm ihn", und so bekamen vier
  // Creator-Tasks „tzampasfood" als Handle eingetragen.
  const { w, store, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '550000550', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    igOffen: { tid: '550000550', handle: 'egal', nurLeiste: true },
    tasks: [{ id: 'a1', name: 'zzz.jemand — Zzz Jemand', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'x\nigfu-handle: zzz.jemand' }],
  });
  await warte(w, 4000);
  const eintrag = (store.get('clickup:handles:v1') || {})['550000550'] || {};
  pruefe('Kein Handle gemerkt', !eintrag.handle, JSON.stringify(eintrag));
  pruefe('Erst recht nicht das eigene Konto',
    eintrag.handle !== 'tzampasfood', JSON.stringify(eintrag));
  pruefe('Kein Task wurde umbenannt',
    serverTasks[0].name === 'zzz.jemand — Zzz Jemand', serverTasks[0].name);
}

gruppe('Ein früher falsch gelesener Handle wird entgiftet');
{
  // Nach dem Fehler aus 7.7 steht in manchen Einträgen das eigene Konto als
  // Handle, mit Güte „karte". Gleiche Güte überschreibt nicht, also bliebe er
  // für immer stehen und würde jede bessere Quelle blockieren.
  const { w, store } = await starte({
    speicher: {
      ...MIT_CLICKUP,
      'ig:selbst:v1': 'tzampasfood',
      'clickup:handles:v1': {
        '660000660': { handle: 'tzampasfood', quelle: 'karte', bild: '900000001' },
        '660000661': { handle: 'echt.person', quelle: 'karte', bild: '900000002' },
      },
    },
    ig: [{ id: '660000660', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
  });
  await warte(w, 3000);
  const alle = store.get('clickup:handles:v1') || {};
  pruefe('Das eigene Konto ist aus dem Speicher raus',
    !(alle['660000660'] || {}).handle, JSON.stringify(alle['660000660']));
  pruefe('Fremde Handles bleiben unangetastet',
    (alle['660000661'] || {}).handle === 'echt.person', JSON.stringify(alle['660000661']));
}

gruppe('Beim Abgleich entsteht kein Tag ohne Namen');
{
  // Zwei Aufrufe von cuTagSichern() hatten das Argument vergessen. Der Tag
  // hieß dadurch „undefined", ClickUp lehnt das mit Fehler 400 ab — und auf
  // einem frisch eingerichteten Arbeitsplatz scheiterte jeder Abgleich daran.
  // Bei Josia fiel es nicht auf, weil in seinem Space irgendwann ein Tag
  // dieses Namens entstanden war und die Prüfung ihn fand.
  const { doc, w, spaceTags } = await starte({
    speicher: MIT_CLICKUP,
    tags: [],
    tasks: [],
  });
  await klickKnopf(w, doc, 'Lokale Follow-ups übernehmen');
  await warte(w, 1500);
  pruefe('Kein Tag „undefined" angelegt',
    !spaceTags.some((t) => String(t) === 'undefined'), JSON.stringify(spaceTags));
  pruefe('Der Follow-up-Tag wurde angelegt', spaceTags.includes(TAG), JSON.stringify(spaceTags));
}

gruppe('Auch „Verbindung prüfen" legt keinen Tag ohne Namen an');
{
  const { doc, w, spaceTags } = await starte({ speicher: MIT_CLICKUP, tags: [], tasks: [] });
  await klickKnopf(w, doc, 'Verbindung prüfen');
  await warte(w, 1500);
  pruefe('Kein Tag „undefined" angelegt',
    !spaceTags.some((t) => String(t) === 'undefined'), JSON.stringify(spaceTags));
  pruefe('Der Follow-up-Tag wurde angelegt', spaceTags.includes(TAG), JSON.stringify(spaceTags));
}

gruppe('„Handles nachtragen" steht ganz oben');
{
  // Nach jedem „Übernehmen" wird das Panel neu aufgebaut und springt an den
  // Anfang. Stand der Abschnitt unten, musste man sich nach jedem einzelnen
  // Handle wieder hinunterscrollen — bei mehreren Dutzend Lücken ist das die
  // eigentliche Arbeit.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'Ohne Handle Jemand', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: 'aus UpPromote', tags: ['handle-fehlt'] },
      { id: 'a2', name: 'zzz.wer — Zzz Wer', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: 'x\nigfu-handle: zzz.wer' },
    ],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const t = doc.querySelector('.igfu-body').textContent || '';
  const handles = t.indexOf('Handles nachtragen');
  pruefe('Der Abschnitt ist da', handles >= 0, t.slice(0, 200));
  for (const spaeter of ['Unterhaltungen ohne Task', 'Tasks ohne Unterhaltung', 'Follow-ups']) {
    const i = t.indexOf(spaeter);
    pruefe('Vor „' + spaeter + '"', i < 0 || handles < i, 'Handles bei ' + handles + ', ' + spaeter + ' bei ' + i);
  }
  pruefe('Nur die Diagnosezeile steht davor',
    t.slice(0, handles).includes('Unterhaltungen gerade im Dokument'), t.slice(0, handles).slice(0, 160));
}

gruppe('Vorlagen: der Knopf sitzt in der Verfassen-Zeile');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [{ id: 'v1', titel: 'Ad-Codes', text: 'So geht das.' }],
  });
  await warte(w, 2000);
  pruefe('Der Knopf ist da', !!doc.querySelector('.igfu-vl-knopf'));
  pruefe('Und zwar in der Verfassen-Zeile',
    !!doc.getElementById('vzeile') && !!doc.getElementById('vzeile').querySelector('.igfu-vl-knopf'));
  pruefe('Nicht doppelt', doc.querySelectorAll('.igfu-vl-knopf').length === 1,
    String(doc.querySelectorAll('.igfu-vl-knopf').length));
}

gruppe('Vorlagen kommen aus ClickUp, nicht aus dem lokalen Speicher');
{
  // Der Grund für den Umbau: Josia arbeitet an zwei Rechnern, Cosima an einem
  // dritten. Der GM-Speicher liegt pro Browser — ClickUp haben alle.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [
      { id: 'v1', titel: 'Ad-Codes', text: 'Schau dir die Anleitung an.' },
      { id: 'v2', titel: 'Versand', text: 'Die Box ist raus.' },
    ],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  const t = doc.querySelector('.igfu-vl-panel').textContent || '';
  pruefe('Beide Vorlagen stehen im Panel', /Ad-Codes/.test(t) && /Versand/.test(t), t.slice(0, 200));
}

gruppe('Vorlagen: Klick setzt den Text mehrzeilig ein');
{
  const text = 'Hi,\n\nschau mal hier:\nhttps://example.invalid\n\nGruß\nJosia';
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [{ id: 'v1', titel: 'Lang', text }],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  // Nicht blind klicken: Fehlt der Eintrag, soll die Prüfung rot werden und
  // nicht die ganze Suite abbrechen — sonst ist jeder Folgefehler unlesbar.
  const eintrag = doc.querySelector('.igfu-vl-text');
  pruefe('Die Vorlage steht im Panel', !!eintrag,
    (doc.querySelector('.igfu-vl-panel') || {}).textContent);
  if (eintrag) { klick(w, eintrag); await warte(w, 300); }
  const drin = doc.querySelector('div[role="textbox"]').textContent;
  pruefe('Der Text steht vollständig im Feld', drin === text, JSON.stringify(drin));
  pruefe('Die Leerzeilen sind erhalten', /\n\n/.test(drin), JSON.stringify(drin));
  pruefe('Das Panel ist zu', !doc.querySelector('.igfu-vl-panel'));
}

gruppe('Vorlagen: Neuanlegen schreibt nach ClickUp');
{
  const { doc, w, vorlagenTasks } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  klick(w, [...doc.querySelectorAll('.igfu-done')].find((b) => b.textContent === 'Neu'));
  const felder = doc.querySelectorAll('.igfu-vl-form .igfu-vl-feld');
  felder[0].value = 'Begrüßung';
  felder[1].value = 'Hallo und willkommen!';
  klick(w, [...doc.querySelectorAll('.igfu-done')].find((b) => b.textContent === 'Sichern'));
  await warte(w, 1500);
  pruefe('Die Vorlage liegt in ClickUp', vorlagenTasks.length === 1, JSON.stringify(vorlagenTasks));
  pruefe('Mit Titel und Text',
    (vorlagenTasks[0] || {}).titel === 'Begrüßung' && (vorlagenTasks[0] || {}).text === 'Hallo und willkommen!',
    JSON.stringify(vorlagenTasks[0]));
}

gruppe('Vorlagen: „In ClickUp öffnen" trifft die richtige Adresse');
{
  // Die Adresse braucht die Workspace-Kennung. Ohne sie antwortet ClickUp mit
  // 404 — am 22.10.2026 gemeldet, nachdem ich die Kennung entfernt hatte, um
  // sie nicht ins öffentliche Repo zu schreiben. Sie wird jetzt zur Laufzeit
  // geholt.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [{ id: 'v1', titel: 'Eins', text: 'Text' }],
  });
  await warte(w, 2000);
  let geoeffnet = '';
  w.open = (u) => { geoeffnet = String(u); return null; };
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  const knopf = [...doc.querySelectorAll('.igfu-link')].find((b) => b.textContent === 'In ClickUp öffnen');
  pruefe('Der Knopf ist da', !!knopf);
  if (knopf) { klick(w, knopf); await warte(w, 1200); }
  pruefe('Die Workspace-Kennung steht in der Adresse',
    /app\.clickup\.com\/900000009\//.test(geoeffnet), geoeffnet || '(nichts geöffnet)');
  pruefe('Und die Listen-Kennung',
    /\/v\/l\/li\/900000000002$/.test(geoeffnet), geoeffnet || '(nichts geöffnet)');
}

gruppe('Vorlagen: die Farben folgen Instagram, nicht festen Werten');
{
  // Bis 8.1 standen hier feste Farben. Im dunklen Modus war der Knopf dadurch
  // kaum zu sehen und die Schrift im Formular hell auf hell. Instagram liefert
  // seine Farben als CSS-Variablen; wer die benutzt, folgt dem Modus von
  // allein — auch wenn in der Oberfläche umgeschaltet wird.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [{ id: 'v1', titel: 'Eins', text: 'Text' }],
  });
  await warte(w, 1500);
  const stil = doc.getElementById('igfu-style');
  pruefe('Der Stilblock ist da', !!stil);
  const css = (stil && stil.textContent) || '';
  // Nur der Vorlagen-Teil, sonst erwischt die Prüfung fremde Regeln, die
  // feste Farben haben dürfen.
  const vonHier = css.indexOf('.igfu-vl-knopf');
  const bisHier = css.indexOf('.igfu-vl-gross');
  const vlTeil = css.slice(vonHier, bisHier >= 0 ? css.indexOf('}', bisHier) + 1 : undefined);
  pruefe('Die Schriftfarbe kommt von Instagram',
    /color:\s*rgb\(var\(--ig-primary-text/.test(vlTeil), vlTeil.slice(0, 200));
  pruefe('Der Hintergrund des Panels auch',
    /background:\s*rgb\(var\(--ig-elevated-background/.test(vlTeil), vlTeil.slice(0, 400));
  pruefe('Die Eingabefelder auch',
    /\.igfu-vl-feld[^}]*color:\s*rgb\(var\(--ig-primary-text/.test(vlTeil), vlTeil.slice(-500));
  pruefe('Keine festen Hex-Farben mehr im Vorlagen-Teil',
    !/#[0-9a-fA-F]{3,6}/.test(vlTeil), (vlTeil.match(/#[0-9a-fA-F]{3,6}/g) || []).join(' '));
}

gruppe('Vorlagen: fehlende Liste erklärt sich');
{
  // Ohne die Liste darf es keine stumme Fehlfunktion geben — die Meldung muss
  // sagen, was zu tun ist.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: null,
  });
  await warte(w, 2000);
  pruefe('Der Knopf ist trotzdem da', !!doc.querySelector('.igfu-vl-knopf'));
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1500);
  const meldung = doc.body.textContent || '';
  pruefe('Es gibt einen Hinweis auf die fehlende Liste',
    /Standardnachrichten/.test(meldung), meldung.slice(-300));
}

gruppe('Vorlagen: die Vorschauzeile zeigt nicht nur die Anrede');
{
  // Vorher nahm die Vorschau die erste nicht leere Zeile. Unsere Vorlagen
  // beginnen fast alle mit „Hi," auf eigener Zeile — es stand also bei jeder
  // Vorlage dasselbe da und man musste raten. Jetzt werden die Umbrueche zu
  // Leerzeichen, abgeschnitten wird per CSS.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [
      { id: 'v1', titel: 'Probeware', text: 'Hi,\nklar! Probieren kommt zuerst.\n\nGruß\nJosia' },
      { id: 'v2', titel: 'Bedingungen', text: 'Hi,\ngibt keine Bedingungen.' },
    ],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  const vorschauen = [...doc.querySelectorAll('.igfu-vl-vorschau')].map((e) => e.textContent);
  pruefe('Zwei Vorschauzeilen', vorschauen.length === 2, JSON.stringify(vorschauen));
  pruefe('Keine steht nur auf der Anrede',
    vorschauen.every((t) => t !== 'Hi,'), JSON.stringify(vorschauen));
  pruefe('Die erste zeigt den Satz dahinter',
    (vorschauen[0] || '').startsWith('Hi, klar! Probieren kommt zuerst.'), JSON.stringify(vorschauen[0]));
  pruefe('Kein Umbruch mehr drin',
    vorschauen.every((t) => !/\n/.test(t)), JSON.stringify(vorschauen));
  pruefe('Die beiden sind unterscheidbar', vorschauen[0] !== vorschauen[1], JSON.stringify(vorschauen));
}

gruppe('Vorlagen: Kuerzel des Urhebers und Filter danach');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [
      { id: 'v1', titel: 'Probeware', text: 'Von Josia.', wer: 'Josia Loos' },
      { id: 'v2', titel: 'Bedingungen', text: 'Auch von Josia.', wer: 'Josia Loos' },
      { id: 'v3', titel: 'Versand', text: 'Von Cosima.', wer: 'Cosima Werr' },
    ],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);

  const kuerzel = [...doc.querySelectorAll('.igfu-vl-kuerzel')].map((e) => e.textContent);
  pruefe('Jede Vorlage traegt ein Kuerzel', kuerzel.length === 3, JSON.stringify(kuerzel));
  pruefe('Die Kuerzel sind richtig gebildet',
    kuerzel.filter((k) => k === 'JL').length === 2 && kuerzel.includes('CW'), JSON.stringify(kuerzel));
  const hinweis = [...doc.querySelectorAll('.igfu-vl-kuerzel')].map((e) => e.title);
  pruefe('Der vollstaendige Name steht im Hinweis',
    hinweis.some((h) => h === 'Angelegt von Cosima Werr'), JSON.stringify(hinweis));

  const knoepfe = [...doc.querySelectorAll('.igfu-vl-wer')];
  pruefe('Die Filterleiste hat Alle plus zwei Personen', knoepfe.length === 3,
    JSON.stringify(knoepfe.map((b) => b.textContent)));
  pruefe('Zu Beginn steht sie auf Alle',
    (knoepfe[0] || {}).className && knoepfe[0].className.includes('igfu-vl-wer-an'),
    (knoepfe[0] || {}).className);

  const cw = knoepfe.find((b) => b.textContent === 'CW');
  pruefe('Cosimas Knopf ist da', !!cw);
  if (cw) { klick(w, cw); await warte(w, 300); }
  let titel = [...doc.querySelectorAll('.igfu-vl-titel')].map((e) => e.textContent);
  pruefe('Jetzt steht nur Cosimas Vorlage da',
    titel.length === 1 && /Versand/.test(titel[0]), JSON.stringify(titel));

  const jl = [...doc.querySelectorAll('.igfu-vl-wer')].find((b) => b.textContent === 'JL');
  if (jl) { klick(w, jl); await warte(w, 300); }
  titel = [...doc.querySelectorAll('.igfu-vl-titel')].map((e) => e.textContent);
  pruefe('Und auf JL gestellt die beiden von Josia', titel.length === 2, JSON.stringify(titel));

  const alle = [...doc.querySelectorAll('.igfu-vl-wer')].find((b) => b.textContent === 'Alle');
  if (alle) { klick(w, alle); await warte(w, 300); }
  pruefe('Zurueck auf Alle sind wieder drei da',
    doc.querySelectorAll('.igfu-vl-titel').length === 3);
}

gruppe('Vorlagen: der Filter wirkt nicht still weiter');
{
  // Ein Filter, der das naechste Oeffnen ueberlebt, laesst einen Text
  // vermissen, den es sehr wohl gibt. Darum: beim Oeffnen immer alles.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [
      { id: 'v1', titel: 'Probeware', text: 'Von Josia.', wer: 'Josia Loos' },
      { id: 'v3', titel: 'Versand', text: 'Von Cosima.', wer: 'Cosima Werr' },
    ],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  const cw = [...doc.querySelectorAll('.igfu-vl-wer')].find((b) => b.textContent === 'CW');
  pruefe('Cosimas Knopf ist da', !!cw);
  if (cw) { klick(w, cw); await warte(w, 300); }
  pruefe('Gefiltert ist es eine', doc.querySelectorAll('.igfu-vl-titel').length === 1);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 300);
  pruefe('Das Panel ist zu', !doc.querySelector('.igfu-vl-panel'));
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  pruefe('Beim naechsten Oeffnen stehen wieder beide da',
    doc.querySelectorAll('.igfu-vl-titel').length === 2,
    JSON.stringify([...doc.querySelectorAll('.igfu-vl-titel')].map((e) => e.textContent)));
}

gruppe('Vorlagen: bei einem Urheber gibt es keine Filterleiste');
{
  // Eine Leiste mit genau einer Person waehlt nichts aus und kostet nur Platz.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [
      { id: 'v1', titel: 'Probeware', text: 'Von Josia.', wer: 'Josia Loos' },
      { id: 'v2', titel: 'Bedingungen', text: 'Auch von Josia.', wer: 'Josia Loos' },
    ],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  pruefe('Keine Leiste', !doc.querySelector('.igfu-vl-leiste'));
  pruefe('Die Kuerzel stehen trotzdem da',
    doc.querySelectorAll('.igfu-vl-kuerzel').length === 2);
}

gruppe('Vorlagen: ohne Urheber bleibt das Kuerzel weg');
{
  // ClickUp liefert den creator nicht immer. Dann steht lieber nichts da als
  // etwas Erfundenes — und die Vorlage darf nicht unauffindbar werden.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '17843301684077111', titel: 'Jemand', vorschau: 'Hallo', zeit: '2h' }],
    vorlagen: [
      { id: 'v1', titel: 'Namenlos', text: 'Ohne Urheber.' },
      { id: 'v2', titel: 'Von Cosima', text: 'Mit Urheber.', wer: 'Cosima Werr' },
    ],
  });
  await warte(w, 2000);
  klick(w, doc.querySelector('.igfu-vl-knopf'));
  await warte(w, 1200);
  pruefe('Nur eine traegt ein Kuerzel',
    doc.querySelectorAll('.igfu-vl-kuerzel').length === 1);
  pruefe('Beide stehen unter Alle in der Liste',
    doc.querySelectorAll('.igfu-vl-titel').length === 2);
  pruefe('Keine Leiste, weil nur ein Urheber bekannt ist',
    !doc.querySelector('.igfu-vl-leiste'));
}

gruppe('Benutzer-ID: auch als Relay-Referenz lesbar');
{
  // Bis Oktober 2026 stand die ID als `id` am Nutzerobjekt. Seit einem Umbau
  // liefert Instagram dort nur noch { __id: 'XDTUserDict:<id>' } und kein `id`
  // mehr — gemessen am 23.10.2026. Dadurch lief die ID still auf den
  // Leerstring, und neue Tasks bekamen keine `igfu-iguser:`-Zeile mehr.
  // Dieselbe ID-Welt wie vorher: in ClickUp steht bei reichert_florian
  // `igfu-iguser: 334549785`, im DOM `XDTUserDict:334549785`.
  const { w, store } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian Reichert', vorschau: 'Hallo', zeit: '2h',
           nutzerRef: '334549785' }],
  });
  await warte(w, 2500);
  const h = (store.get('clickup:handles:v1') || {})['101925914541472'] || {};
  pruefe('Die ID wurde gelesen', h.nutzer === '334549785', JSON.stringify(h));
}

gruppe('Benutzer-ID: die alte Form zaehlt weiter');
{
  const { w, store } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'Hallo', zeit: '2h', nutzer: '334549785' }],
  });
  await warte(w, 2500);
  const h = (store.get('clickup:handles:v1') || {})['101925914541472'] || {};
  pruefe('Auch mit id am Objekt', h.nutzer === '334549785', JSON.stringify(h));
}

gruppe('Postfach-Art wird gemerkt, nicht geraten');
{
  // An der Kennung ist die Herkunft nicht abzulesen: am 23.10.2026 gemessen
  // tragen normale DMs 15- bis 17-stellige Kennungen, Partner-Unterhaltungen
  // 16- bis 17-stellige. Deshalb kommt die Art aus thread_subtype.
  const { w, store } = await starte({
    speicher: MIT_CLICKUP,
    ig: [
      { id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h', postfach: 'normal' },
      { id: '1636057484698926', titel: 'Bella', vorschau: 'b', zeit: '3h', postfach: 'partner' },
      { id: '999000999', titel: 'Ohne', vorschau: 'c', zeit: '4h' },
    ],
  });
  await warte(w, 2500);
  const arten = store.get('igfu:postfachart:v1') || {};
  pruefe('Normale DM erkannt', arten['101925914541472'] === 'normal', JSON.stringify(arten));
  pruefe('Partner-Unterhaltung erkannt', arten['1636057484698926'] === 'partner', JSON.stringify(arten));
  pruefe('Ohne Untertyp wird nichts eingetragen', !arten['999000999'], JSON.stringify(arten));
}

gruppe('Kopfleiste: Status und Follow-up neben dem Namen');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian Reichert', vorschau: 'a', zeit: '2h', postfach: 'normal' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian Reichert' },
    tasks: [{ id: 'a1', name: 'reichert_florian — Florian Reichert', status: 'erster content',
              farbe: '#008844', beschreibung: 'x\nigfu-ig: 101925914541472' }],
  });
  await warte(w, 3000);
  const leiste = doc.querySelector('.igfu-kopf');
  pruefe('Die Leiste ist da', !!leiste);
  pruefe('Sie haengt an der Unterhaltung', leiste && leiste.dataset.tid === '101925914541472',
    leiste && leiste.dataset.tid);
  pruefe('Sie steht neben dem Namensblock, nicht irgendwo',
    !!(leiste && leiste.previousElementSibling && leiste.previousElementSibling.querySelector('h2')),
    leiste && leiste.previousElementSibling && leiste.previousElementSibling.tagName);
  const crm = leiste && leiste.querySelector('[data-kind="crm"]');
  pruefe('Der Status steht dran', crm && crm.textContent === 'erster content', crm && crm.textContent);
  pruefe('In der Farbe des Status',
    crm && /(#008844|rgb\(0,\s*136,\s*68\))/i.test(crm.style.background || ''),
    crm && crm.style.background);
  pruefe('Der Follow-up-Knopf ist auch da', !!(leiste && leiste.querySelector('[data-kind="followup"]')));
}

gruppe('Kopfleiste: ohne Task steht dort CRM +');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian Reichert', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian Reichert' },
  });
  await warte(w, 3000);
  const crm = doc.querySelector('.igfu-kopf [data-kind="crm"]');
  pruefe('Der Anlegen-Knopf steht da', crm && crm.textContent === 'CRM +', crm && crm.textContent);
}

gruppe('Kopfleiste: das eigene Konto wird nicht fuer das Gegenueber gehalten');
{
  // Auf der Seite stehen mehrere h2: das eigene Konto links, das Gegenueber im
  // Kopf, dazu das eigene Panel. Bleibt nicht genau eines uebrig, wird nichts
  // eingehaengt — lieber keine Leiste als eine an der falschen Stelle.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian Reichert' },
  });
  await warte(w, 3000);
  const leiste = doc.querySelector('.igfu-kopf');
  pruefe('Genau eine Leiste', doc.querySelectorAll('.igfu-kopf').length === 1,
    String(doc.querySelectorAll('.igfu-kopf').length));
  pruefe('Nicht am eigenen Konto',
    !!(leiste && !/tzampasfood/.test(leiste.previousElementSibling.textContent || '')),
    leiste && leiste.previousElementSibling.textContent);
}

gruppe('Postfach-Knopf: gruen und klickbar, wenn es die Person zweimal gibt');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [
      { id: '101925914541472', titel: 'Bella', vorschau: 'a', zeit: '2h', postfach: 'normal' },
      { id: '1636057484698926', titel: 'Bella', vorschau: 'b', zeit: '3h', postfach: 'partner' },
    ],
    igOffen: { tid: '101925914541472', handle: 'bellaa_sophie', titel: 'Bella' },
    tasks: [{ id: 'a1', name: 'bellaa_sophie — BELLA', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472\nigfu-ig: 1636057484698926' }],
  });
  await warte(w, 3500);
  const k = doc.querySelector('.igfu-kopf [data-kind="postfach"]');
  pruefe('Der Knopf ist da', !!k);
  pruefe('Er steht auf gruen', k && k.classList.contains('on'), k && k.className);
  pruefe('Er ist klickbar', k && !k.disabled);
  pruefe('Er nennt das andere Postfach', k && k.textContent === 'Partner-Postfach', k && k.textContent);
  pruefe('Und kennt die Gegenstelle', k && k.dataset.ziel === '1636057484698926', k && k.dataset.ziel);
}

gruppe('Postfach-Knopf: rot und tot, wenn es die Person nur einmal gibt');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h', postfach: 'normal' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian' },
    tasks: [{ id: 'a1', name: 'reichert_florian — Florian', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472' }],
  });
  await warte(w, 3500);
  const k = doc.querySelector('.igfu-kopf [data-kind="postfach"]');
  pruefe('Nicht gruen', k && !k.classList.contains('on'), k && k.className);
  pruefe('Nicht klickbar', k && k.disabled === true);
  pruefe('Und sagt, dass es nur eines gibt', k && k.textContent === 'Nur normal', k && k.textContent);
}

gruppe('Postfach-Knopf: unbekannte Art ergibt kein falsches Gruen');
{
  // Die zweite Unterhaltung des Tasks hat dieses Geraet noch nie gesehen.
  // Dann ist nicht entscheidbar, ob sie im anderen Postfach liegt — und ein
  // falsches Gruen waere schlimmer als ein Grau.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Bella', vorschau: 'a', zeit: '2h', postfach: 'normal' }],
    igOffen: { tid: '101925914541472', handle: 'bellaa_sophie', titel: 'Bella' },
    tasks: [{ id: 'a1', name: 'bellaa_sophie — BELLA', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472\nigfu-ig: 1636057484698926' }],
  });
  await warte(w, 3500);
  const k = doc.querySelector('.igfu-kopf [data-kind="postfach"]');
  pruefe('Bleibt rot', k && !k.classList.contains('on'), k && k.className);
  pruefe('Ohne Ziel', k && !k.dataset.ziel, k && k.dataset.ziel);
}

gruppe('Notizen: offen, wenn es welche gibt');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian' },
    tasks: [{ id: 'a1', name: 'reichert_florian — Florian', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472' }],
    kommentare: { a1: [
      { text: 'Hat Ware bekommen, wartet auf Content.', wer: 'Josia Loos', wann: 1700000000000 },
      { text: 'Nachgefasst am Montag.', wer: 'Cosima Werr', wann: 1700086400000 },
    ] },
  });
  await warte(w, 3500);
  const leiste = doc.querySelector('.igfu-ko');
  pruefe('Die Leiste ist da', !!leiste);
  pruefe('Und aufgeklappt', leiste && leiste.classList.contains('auf'), leiste && leiste.className);
  const texte = [...doc.querySelectorAll('.igfu-ko-text')].map((e) => e.textContent);
  pruefe('Beide Notizen stehen da', texte.length === 2, JSON.stringify(texte));
  pruefe('Die aelteste zuerst', texte[0] === 'Hat Ware bekommen, wartet auf Content.', JSON.stringify(texte));
  const wer = [...doc.querySelectorAll('.igfu-ko-wer')].map((e) => e.textContent);
  pruefe('Mit Urheber', wer.includes('Cosima Werr'), JSON.stringify(wer));
}

gruppe('Notizen: zu, wenn es keine gibt');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian' },
    tasks: [{ id: 'a1', name: 'reichert_florian — Florian', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472' }],
    kommentare: { a1: [] },
  });
  await warte(w, 3500);
  const leiste = doc.querySelector('.igfu-ko');
  pruefe('Die Leiste ist da', !!leiste);
  pruefe('Aber zugeklappt', leiste && !leiste.classList.contains('auf'), leiste && leiste.className);
  pruefe('Kein Textfeld', !doc.querySelector('.igfu-ko-feld'));
  const griff = doc.querySelector('.igfu-ko-griff');
  pruefe('Der Griff laedt zum Schreiben ein',
    griff && /Notiz schreiben/.test(griff.textContent || ''), griff && griff.textContent);
  if (griff) { klick(w, griff); await warte(w, 300); }
  pruefe('Nach dem Klick offen',
    !!doc.querySelector('.igfu-ko.auf') && !!doc.querySelector('.igfu-ko-feld'));
}

gruppe('Notizen: ohne Task gibt es die Leiste nicht');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian' },
  });
  await warte(w, 3500);
  pruefe('Keine Leiste', !doc.querySelector('.igfu-ko'));
}

gruppe('Notizen: schreiben landet in ClickUp');
{
  const { doc, w, kommentarListen } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian' },
    tasks: [{ id: 'a1', name: 'reichert_florian — Florian', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472' }],
    kommentare: { a1: [{ text: 'Erste Notiz.', wer: 'Josia Loos', wann: 1700000000000 }] },
  });
  await warte(w, 3500);
  const feld = doc.querySelector('.igfu-ko-feld');
  pruefe('Das Textfeld ist da', !!feld);
  if (feld) {
    feld.value = 'Hat heute geantwortet.';
    feld.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  const sichern = [...doc.querySelectorAll('.igfu-ko-fuss button')]
    .find((b) => b.textContent === 'Notiz sichern');
  pruefe('Der Sichern-Knopf ist da', !!sichern);
  if (sichern) klick(w, sichern);
  await warte(w, 1500);
  const liste = kommentarListen.a1 || [];
  pruefe('Die Notiz liegt in ClickUp', liste.length === 2, JSON.stringify(liste.map((k) => k.comment_text)));
  pruefe('Mit dem geschriebenen Text',
    liste.some((k) => k.comment_text === 'Hat heute geantwortet.'),
    JSON.stringify(liste.map((k) => k.comment_text)));
  pruefe('Und steht danach in der Leiste',
    [...doc.querySelectorAll('.igfu-ko-text')].some((e) => e.textContent === 'Hat heute geantwortet.'),
    JSON.stringify([...doc.querySelectorAll('.igfu-ko-text')].map((e) => e.textContent)));
  const feld2 = doc.querySelector('.igfu-ko-feld');
  pruefe('Das Feld ist wieder leer', feld2 && feld2.value === '', feld2 && feld2.value);
}

gruppe('Notizen: das Textfeld wird beim Takt nicht neu gebaut');
{
  // Der Takt zeichnet alle anderthalb Sekunden. Wuerde dabei das Textfeld neu
  // entstehen, waeren Fokus, Schreibmarke und Scrollstand jedes Mal weg —
  // beim Tippen unbrauchbar. Der Text allein beweist das nicht: den schreibt
  // koEntwurf ohnehin zurueck. Gemessen wird deshalb, ob es *dasselbe*
  // Element ist. Ein Mutationstest ohne diese Pruefung lief gruen durch.
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    ig: [{ id: '101925914541472', titel: 'Florian', vorschau: 'a', zeit: '2h' }],
    igOffen: { tid: '101925914541472', handle: 'reichert_florian', titel: 'Florian' },
    tasks: [{ id: 'a1', name: 'reichert_florian — Florian', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: 'x\nigfu-ig: 101925914541472' }],
    kommentare: { a1: [{ text: 'Erste Notiz.', wer: 'Josia Loos', wann: 1700000000000 }] },
  });
  await warte(w, 3500);
  const feld = doc.querySelector('.igfu-ko-feld');
  pruefe('Das Textfeld ist da', !!feld);
  if (feld) {
    feld.value = 'Halb getippt';
    feld.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  if (feld) { feld.focus(); feld.selectionStart = 4; feld.selectionEnd = 4; }
  await warte(w, 4000);
  const spaeter = doc.querySelector('.igfu-ko-feld');
  pruefe('Es ist dasselbe Feld geblieben', spaeter === feld);
  pruefe('Der Text steht noch da', spaeter && spaeter.value === 'Halb getippt', spaeter && spaeter.value);
  pruefe('Die Schreibmarke steht noch, wo sie stand',
    spaeter && spaeter.selectionStart === 4, spaeter && String(spaeter.selectionStart));
  pruefe('Und der Fokus ist noch drin', doc.activeElement === feld,
    doc.activeElement && doc.activeElement.className);
}

console.log('\n' + (fehlgeschlagen
  ? `${fehlgeschlagen} von ${gelaufen} Prüfungen fehlgeschlagen`
  : `Alle ${gelaufen} Prüfungen bestanden`));
process.exit(fehlgeschlagen ? 1 : 0);
