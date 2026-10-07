import { starte, warte, chip, klick, knopf, beschreibungMit, macheThread, LISTE, SPACE, TAG } from './harness.mjs';
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
  pruefe('Knöpfe erscheinen an jeder Zeile', doc.querySelectorAll('.igfu-tag[data-kind="unread"]').length === 3);
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
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'verhandlung', farbe: '#b660e0',
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
    tasks: [{ id: 'alt', name: 'Willi', status: 'zugesagt', farbe: '#30a46c', beschreibung: '',
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
  pruefe('Task trägt den Anzeigenamen', neu[0] && neu[0].data.name === 'Corina Bösch');
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
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '' } } },
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '' } } },
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  pruefe('Kein Task wurde angelegt', angelegte(aufrufe).length === 0);
}

gruppe('CRM-Pille öffnet den vorhandenen Task');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'zugesagt', farbe: '#30a46c', beschreibung: beschreibungMit('T1') }],
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
    T1: { title: 'Anna Bolko', flaggedAt: 1, due: '2026-10-08', note: 'Rate offen' },
    T2: { title: 'Corina Bösch', flaggedAt: 2, due: '', note: '' },
    T3: { title: 'Willi', flaggedAt: 3, due: '', note: '' },
  };
  const { doc, w, aufrufe, serverTasks } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': lokal },
    tasks: [{ id: 'vorhanden', name: 'Corina Bösch', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T2'), tags: [TAG] }],
  });
  klick(w, knopf(doc, 'Lokale Follow-ups übernehmen'));
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
  klick(w, knopf(doc, 'Lokale Follow-ups übernehmen'));
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
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '' } } },
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [] }],
  });
  pruefe('Markierung überlebt den ersten Abgleich', !!store.get('igfu:v1').T1);
  klick(w, knopf(doc, 'Verbindung prüfen'));
  await warte(w, 700);
  pruefe('Markierung überlebt auch den erzwungenen Abgleich', !!store.get('igfu:v1').T1,
    JSON.stringify(store.get('igfu:v1')));
  pruefe('Zeile bleibt markiert', doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Entfernt jemand den Tag in ClickUp, verschwindet die Markierung');
{
  const { doc, w, store } = await starte({
    speicher: { ...MIT_CLICKUP,
      'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '', inCu: true } } },
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [] }],
  });
  pruefe('Markierung ist weg', !store.get('igfu:v1').T1, JSON.stringify(store.get('igfu:v1')));
  pruefe('Zeile ist nicht mehr markiert', !doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Ein Klick auf die CRM-Pille lässt das Follow-up in Ruhe');
{
  const { doc, w, store, serverTasks } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '' } } },
  });
  klick(w, chip(doc, 0, 'crm'));
  await warte(w, 600);
  pruefe('Task wurde angelegt', serverTasks.length === 1, JSON.stringify(serverTasks.map((t) => t.name)));
  klick(w, knopf(doc, 'Verbindung prüfen'));
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
  pruefe('Name ist „handle — Anzeigename"', neu && neu.data.name === 'annabolko.runs — Anna Bolko', neu && neu.data.name);
  pruefe('Status wird ausdrücklich gesetzt', neu && neu.data.status === 'angeschrieben', neu && neu.data.status);
  pruefe('Bild-ID steht in der Beschreibung',
    neu && /igfu-bild:\s*111111111/.test(neu.data.markdown_description), neu && neu.data.markdown_description);
  pruefe('Instagram-Link steht in der Beschreibung',
    neu && neu.data.markdown_description.includes('instagram.com/annabolko.runs'));
}

gruppe('Großgeschriebener Vorname wird nicht als Handle genommen');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 1, 'followup'));   // Corina, Vorschau „Corina: Hallo Josia"
  await warte(w, 700);
  const neu = angelegte(aufrufe)[0];
  pruefe('Name bleibt der Anzeigename', neu && neu.data.name === 'Corina Bösch', neu && neu.data.name);
  pruefe('Kein Handle in der Beschreibung', neu && !/Instagram: \[@/.test(neu.data.markdown_description));
}

gruppe('Ohne Handle bleibt es beim Anzeigenamen');
{
  const { doc, w, aufrufe } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 2, 'followup'));   // Willi, Vorschau „Du: …"
  await warte(w, 700);
  const neu = angelegte(aufrufe)[0];
  pruefe('Name ist nur der Anzeigename', neu && neu.data.name === 'Willi', neu && neu.data.name);
}

gruppe('Die Kontaktkarte schlägt die Vorschau und benennt um');
{
  const { w, serverTasks, aufrufe } = await starte({
    pfad: '/latest/inbox/all/?selected_item_id=T1',
    speicher: MIT_CLICKUP,
    karte: { handle: 'die.echte.anna' },
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  await warte(w, 4000);   // der Kartenleser läuft alle drei Sekunden
  const umbenannt = aufrufe.filter((a) => a.methode === 'PUT' && a.data && a.data.name);
  pruefe('Es wird umbenannt', umbenannt.length === 1, JSON.stringify(umbenannt.map((u) => u.data.name)));
  pruefe('Neuer Name nutzt das Handle aus der Karte',
    serverTasks[0].name === 'die.echte.anna — Anna Bolko', serverTasks[0].name);
  pruefe('Kein zusätzlicher Task', angelegte(aufrufe).length === 0);
}

gruppe('Umbenennen legt keinen Task an');
{
  const { w, aufrufe } = await starte({
    pfad: '/latest/inbox/all/?selected_item_id=T3',
    speicher: MIT_CLICKUP,
    karte: { handle: 'willi.unterwegs' },
  });
  await warte(w, 4000);
  pruefe('Kein Task entstanden', angelegte(aufrufe).length === 0, JSON.stringify(angelegte(aufrufe)));
  pruefe('Keine Umbenennung ins Leere', !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.name));
}

gruppe('Doppelter Task: der getaggte gewinnt');
{
  const { doc, store } = await starte({
    speicher: { ...MIT_CLICKUP,
      'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '', inCu: true } } },
    tasks: [
      { id: 'mitTag', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e', beschreibung: beschreibungMit('T1'), tags: [TAG] },
      { id: 'ohneTag', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e', beschreibung: beschreibungMit('T1'), tags: [] },
    ],
  });
  pruefe('Markierung überlebt den Doppelgänger', !!store.get('igfu:v1').T1, JSON.stringify(store.get('igfu:v1')));
  pruefe('Zeile bleibt markiert', doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

gruppe('Zwei Übernahmen gleichzeitig legen nichts doppelt an');
{
  const lokal = {
    T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '' },
    T2: { title: 'Corina Bösch', flaggedAt: 2, due: '', note: '' },
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
    markt: [{ handle: 'hey.luzi', bild: '573134618' }, { handle: 'theveganberlin', bild: '610648384' }],
  });
  await warte(w, 600);
  pruefe('An jeder Karte eine Pille', doc.querySelectorAll('.igfu-crm-pille').length === 2,
    String(doc.querySelectorAll('.igfu-crm-pille').length));
  const p = marktPille(doc, 'hey.luzi');
  pruefe('Pille lädt zum Erfassen ein', p && p.textContent === 'ins CRM +', p && p.textContent);
  klick(w, p);
  await warte(w, 600);
  const neu = angelegte(aufrufe)[0];
  pruefe('Genau ein Task', angelegte(aufrufe).length === 1);
  pruefe('Name ist das Handle', neu && neu.data.name === 'hey.luzi', neu && neu.data.name);
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
    markt: [{ handle: 'hey.luzi', bild: '573134618' }],
  });
  await warte(w, 600);
  const p = marktPille(doc, 'hey.luzi');
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
    markt: [{ handle: 'hey.luzi', bild: '573134618' }],
    tasks: [{ id: 'm1', name: 'hey.luzi', status: 'verhandlung', farbe: '#b660e0',
              beschreibung: 'igfu-bild: 573134618', tags: [] }],
  });
  await warte(w, 700);
  const p = marktPille(doc, 'hey.luzi');
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
    tasks: [{ id: 'm1', name: 'annabolko.runs', status: 'recherchiert', farbe: '#656f7d',
              beschreibung: 'Instagram: @annabolko.runs\n\nigfu-bild: 111111111', tags: [] }],
  });
  await warte(w, 1200);
  pruefe('Kein neuer Task', angelegte(aufrufe).length === 0, JSON.stringify(angelegte(aufrufe)));
  pruefe('Thread-Zeile wurde ergänzt', /igfu-thread:\s*T1/.test(serverTasks[0].beschreibung), serverTasks[0].beschreibung);
  pruefe('Handle in der Beschreibung blieb erhalten', /@annabolko\.runs/.test(serverTasks[0].beschreibung));
  pruefe('Status steht jetzt auf angeschrieben', serverTasks[0].status === 'angeschrieben', serverTasks[0].status);
  pruefe('Name trägt Handle und Anzeigenamen',
    serverTasks[0].name === 'annabolko.runs — Anna Bolko', serverTasks[0].name);
}

gruppe('Ein bereits verbundener Task wird nicht nochmal verbunden');
{
  const { w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'm1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
      { id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: beschreibungMit('T1'), tags: [TAG] },
      { id: 'a2', name: 'Corina Bösch', status: 'angeschrieben', farbe: '#87909e',
        beschreibung: beschreibungMit('T2'), tags: [TAG] },
    ],
    affiliates: [
      { first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'https://www.instagram.com/annabolko.runs/' },
      { first_name: 'Fremd', last_name: 'Person', email: 'x@y.de', instagram: '@jemand.anders' },
    ],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de',
                   instagram: 'annabolko.runs', approved_amount: '12.50' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1200);
  pruefe('Status ist „hat sales"', serverTasks[0].status === 'hat sales', serverTasks[0].status);
}

gruppe('UpPromote: ohne Umsatz bleibt es bei ongeboardet');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de',
                   instagram: 'annabolko.runs', denied_amount: '99.00' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1200);
  pruefe('Abgelehnte Provision zählt nicht als Sale',
    serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('Die Leiter zieht keinen Task zurück');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [
      { id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'erste ware versendet', farbe: '#b660e0',
        beschreibung: beschreibungMit('T1') + '\nigfu-mail: a@b.de', tags: [TAG] },
      { id: 'a2', name: 'corina_boesch — Corina Bösch', status: 'abgesagt', farbe: '#e5484d',
        beschreibung: beschreibungMit('T2') + '\nigfu-mail: c@b.de', tags: [TAG] },
    ],
    affiliates: [
      { first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'annabolko.runs' },
      { first_name: 'Corina', last_name: 'Bösch', email: 'c@b.de', instagram: 'corina_boesch' },
    ],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'Anna@B.de', instagram: 'annabolko.runs' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1500);
  pruefe('Markerzeile steht in der Beschreibung',
    /igfu-mail:\s*anna@b\.de/.test(serverTasks[0].beschreibung || ''),
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
  klick(w, knopf(doc, 'Inhalte-Seite öffnen'));
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
  klick(w, knopf(doc, 'Inhalte-Seite öffnen'));
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
        'annabolko.runs': { bereit: true, anfragen: false, stand: Date.now() },
        'corina_boesch': { bereit: false, anfragen: true, stand: Date.now() },
      },
    },
    tasks: [
      { id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
        beschreibung: beschreibungMit('T1'), tags: [TAG] },
      { id: 'a2', name: 'corina_boesch — Corina Bösch', status: 'angeschrieben', farbe: '#87909e',
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
      'clickup:content:v1': { 'annabolko.runs': { bereit: true, anfragen: false, stand: Date.now() } },
    },
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'hat sales', farbe: '#e16b16',
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Status unverändert', serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('UpPromote: Handle wird aus allen Schreibweisen gelesen');
{
  const faelle = [
    ['https://www.instagram.com/annabolko.runs/', 'volle URL'],
    ['@annabolko.runs', 'mit At-Zeichen'],
    ['annabolko.runs', 'nackt'],
  ];
  for (const [wert, name] of faelle) {
    const { doc, w, serverTasks } = await starte({
      speicher: MIT_UP,
      tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
                beschreibung: beschreibungMit('T1'), tags: [TAG] }],
      affiliates: [{ first_name: 'Anna', last_name: 'B', email: 'a@b.de', instagram: wert }],
    });
    klick(w, knopf(doc, 'UpPromote abgleichen'));
    await warte(w, 1000);
    pruefe('Erkennt ' + name, serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
  }
}

gruppe('UpPromote: Handle auch aus einem Anmeldefeld');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Anna', last_name: 'B', email: 'a@b.de', instagram: '',
                   custom_fields: [{ name: 'Dein Instagram-Handle', value: 'annabolko.runs' }] }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1000);
  pruefe('Anmeldefeld wird gelesen', serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('UpPromote: bereits ongeboardet wird nicht erneut geschrieben');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
    affiliates: [{ first_name: 'Anna', last_name: 'B', email: 'a@b.de', instagram: 'annabolko.runs' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1000);
  pruefe('Kein Statuswechsel', !aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.status));
}

gruppe('UpPromote: ohne Token passiert nichts');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 700);
  pruefe('Keine Anfrage an UpPromote', !aufrufe.some((a) => a.pfad.startsWith('UP/')));
  pruefe('Hinweis erscheint',
    (doc.querySelector('#igfu-toast') || {}).textContent.includes('UpPromote-Token'),
    (doc.querySelector('#igfu-toast') || {}).textContent);
}

const alsDatum = (ms) => ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null;

gruppe('Fehlender Handle wird aus der Kontaktkarte geholt');
{
  // T3 = Willi. Weder Name noch Vorschautext geben einen Handle her, die
  // Kontaktkarte schon. Stufe 1: Unterhaltung öffnen, Karte lesen, nachtragen.
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    karte: { handle: 'willi__83' },
  });
  await warte(w, 600);
  klick(w, chip(doc, 2, 'followup'));   // Willi
  await warte(w, 2500);
  pruefe('Task trägt den Handle im Namen',
    serverTasks[0] && serverTasks[0].name === 'willi__83 — Willi',
    serverTasks[0] && serverTasks[0].name);
  pruefe('Markerzeile ist gesetzt',
    /igfu-handle:\s*willi__83/.test((serverTasks[0] || {}).beschreibung || ''),
    ((serverTasks[0] || {}).beschreibung || '').slice(-80));
}

gruppe('Ohne Kontaktkarte wird der Task trotzdem angelegt');
{
  // Nichts blockieren: sonst wäre die Markierung nur noch lokal und für
  // Cosima gar nicht sichtbar.
  const { doc, w, serverTasks } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  klick(w, chip(doc, 2, 'followup'));   // Willi, keine Karte vorhanden
  await warte(w, 1500);
  pruefe('Task existiert', serverTasks.length === 1, String(serverTasks.length));
  pruefe('Name bleibt vorerst ohne Handle',
    serverTasks[0] && serverTasks[0].name === 'Willi', serverTasks[0] && serverTasks[0].name);
}

gruppe('Ohne Kontaktkarte erscheint die Nachfrage');
{
  const { doc, w } = await starte({ speicher: MIT_CLICKUP });
  await warte(w, 600);
  klick(w, chip(doc, 2, 'followup'));
  await warte(w, 6500);                 // Kartensuche läuft erst ab
  const frage = doc.querySelector('#igfu-frage');
  pruefe('Nachfrage ist da', !!frage);
  pruefe('Sie nennt den Namen', !!frage && /Willi/.test(frage.textContent || ''));
  pruefe('Sie lässt sich überspringen',
    !!frage && /Später nachtragen/.test(frage.textContent || ''));
}

gruppe('Das Panel listet Tasks ohne Handle zum Nachtragen');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Willi', status: 'angeschrieben', farbe: '#87909e',
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
    feld.value = 'willi__83';
    const uebernehmen = [...doc.querySelectorAll('#igfu-panel button')]
      .find((b) => (b.textContent || '').trim() === 'Übernehmen');
    klick(w, uebernehmen);
    await warte(w, 1200);
    pruefe('Handle landet im Task',
      serverTasks[0].name === 'willi__83 — Willi', serverTasks[0].name);
  }
}

gruppe('Notizen aus UpPromote landen als Kommentar');
{
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'annabolko.runs',
                   internal_note: 'Will nur Reels machen', personal_detail: 'Läuft Ultratrails' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'annabolko.runs',
                   internal_note: 'Will nur Reels machen' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 2000);
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 2000);
  const kommentare = aufrufe.filter((a) => a.methode === 'POST' && /\/comment$/.test(a.pfad));
  pruefe('Immer noch nur ein Kommentar', kommentare.length === 1, String(kommentare.length));
}

gruppe('Ohne Notiz passiert nichts');
{
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_UP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T1'), tags: [] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'annabolko.runs' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
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
  klick(w, chip(doc, 1, 'followup'));   // Corina
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
  klick(w, knopf(doc, 'Affiliates importieren'));
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
  klick(w, knopf(doc, 'Affiliates importieren'));
  await warte(w, 1500);
  klick(w, knopf(doc, 'Affiliates importieren'));
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
  klick(w, knopf(doc, 'Affiliates importieren'));
  await warte(w, 1500);
  klick(w, knopf(doc, 'Affiliates importieren'));
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
  klick(w, knopf(doc, 'Affiliates importieren'));
  await warte(w, 1500);
  klick(w, knopf(doc, 'Affiliates importieren'));
  await warte(w, 2500);
  pruefe('Task heißt nach der Person',
    serverTasks[0] && serverTasks[0].name === 'Ohne Handle', serverTasks[0] && serverTasks[0].name);
  pruefe('Tag handle-fehlt ist dran',
    (serverTasks[0] || {}).tags && serverTasks[0].tags.includes('handle-fehlt'),
    JSON.stringify((serverTasks[0] || {}).tags));
}

gruppe('Ein Task ohne Unterhaltung wird später über den Handle verbunden');
{
  // T1 = Anna, Vorschau nennt annabolko.runs. Der Task kennt den Handle, aber
  // keine Unterhaltung — genau der Fall nach einem Import.
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'Instagram: @annabolko.runs\n\nigfu-handle: annabolko.runs', tags: [] }],
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Markerzeile wurde nachgetragen',
    /igfu-handle:\s*annabolko\.runs/.test(serverTasks[0].beschreibung || ''),
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-handle: annabolko.runs', tags: [TAG] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'annabolko.runs' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1500);
  pruefe('Trotz Namen ohne Handle zugeordnet',
    serverTasks[0].status === 'ongeboardet', serverTasks[0].status);
}

gruppe('Bei abgesagt interessiert kein fehlender Handle');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Willi', status: 'abgesagt', farbe: '#e5484d',
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
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
  // T3 = Willi, letzte Nachricht 30.08.2026 → +14 Tage = 13.09.
  // Versand Montag 14.09. + 10 Wochentage = 28.09., die spätere gilt.
  // Zugleich die Probe auf die Wochentagsrechnung: kalendarisch wären es
  // der 24.09., nur mit übersprungenen Wochenenden kommt der 28.09. heraus.
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Willi', status: 'angeschrieben', farbe: '#87909e',
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
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'angeschrieben', farbe: '#87909e',
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
      'clickup:content:v1': { 'annabolko.runs': { bereit: true, anfragen: false, stand: Date.now() } },
    },
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'hat sales', farbe: '#e16b16',
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
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
  klick(w, chip(doc, 1, 'followup'));   // Corina, letzte Nachricht 20.09.2026
  await warte(w, 900);
  const neu = angelegte(aufrufe)[0];
  pruefe('Startdatum ist beim Anlegen dabei',
    neu && alsDatum(neu.data.start_date) === '2026-09-20',
    neu && String(neu.data.start_date));
}

gruppe('Liegt die Antwort bei uns, wird der Task dringend');
{
  // T2 = Corina, Vorschau „Corina: Hallo Josia, danke dir!" — sie hat zuletzt geschrieben
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T2'), tags: [TAG] }],
  });
  await warte(w, 1200);
  pruefe('Prioritaet wird auf urgent gesetzt', serverTasks[0].prio === 'urgent', String(serverTasks[0].prio));
  pruefe('Als urgent uebertragen',
    aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.priority === 1));
}

gruppe('Haben wir zuletzt geschrieben, faellt urgent wieder weg');
{
  // T3 = Willi, Vorschau „Du: Melde dich gern nochmal"
  const { w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Willi', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T3'), tags: [TAG], prio: 'urgent' }],
  });
  await warte(w, 1200);
  pruefe('Prioritaet ist wieder leer', !serverTasks[0].prio, String(serverTasks[0].prio));
}

gruppe('Eine blosse Reaktion aendert die Prioritaet nicht');
{
  // T1 = Anna, Vorschau „annabolko.runs gefällt eine Nachricht" — keine offene Nachricht
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
  // T2 = Corina, Gegenueber zuletzt. Status ist aber nicht mehr angeschrieben,
  // also hat Josia den Fall selbst in der Hand.
  const { w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'kommunikation', farbe: '#7b68ee',
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
  klick(w, knopf(doc, 'Token löschen'));
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1'), tags: [TAG, 'karteileiche'] }],
    affiliates: [{ first_name: 'Anna', last_name: 'Bolko', email: 'a@b.de', instagram: 'annabolko.runs' }],
  });
  klick(w, knopf(doc, 'UpPromote abgleichen'));
  await warte(w, 1200);
  pruefe('Der Status wandert nicht auf ongeboardet',
    serverTasks[0].status === 'angeschrieben', serverTasks[0].status);
}

gruppe('Eine Unterhaltung findet ihren Task über den Anzeigenamen');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'Aus UpPromote übernommen.\nigfu-mail: c@b.de' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 2500);
  pruefe('Die Markerzeile igfu-thread wurde nachgetragen',
    /igfu-thread:\s*T2/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-120));
  pruefe('Der Link ins Postfach steht in der Beschreibung',
    /selected_item_id=T2/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(0, 120));
  pruefe('Das Datum der letzten Nachricht landet im Startdatum',
    !!serverTasks[0].start, String(serverTasks[0].start));
}

gruppe('Zwei gleich benannte Tasks bleiben unverbunden');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [
      { id: 'a1', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'eine' },
      { id: 'a2', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'andere' },
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
    tasks: [{ id: 'a1', name: 'Willi', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'nur Vorname' }],
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
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0',
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
  const spaeter = macheThread({ id: 'T5', titel: 'Anna Bolko', zeit: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    vorschau: 'annabolko.runs gefällt eine Nachricht' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [spaeter],
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
  const spaeter = macheThread({ id: 'T5', titel: 'Anna Bolko', zeit: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    vorschau: 'annabolko.runs gefällt eine Nachricht' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [spaeter],
    // Die Beschreibung traegt beide Unterhaltungen von Anfang an.
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
              beschreibung: beschreibungMit('T1') + '\nigfu-thread: T5', tags: [TAG] }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  const gesetzt = new Date(Number(serverTasks[0].start)).toISOString().slice(0, 10);
  pruefe('Das Startdatum ist das der späteren Unterhaltung', gesetzt === '2026-10-01', gesetzt);
}

gruppe('Eine Karteileiche fängt die zweite Unterhaltung nicht ab');
{
  const spaeter = macheThread({ id: 'T5', titel: 'Anna Bolko', zeit: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    vorschau: 'annabolko.runs gefällt eine Nachricht' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [spaeter],
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'ohne Thread' }],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const text = doc.querySelector('.igfu-body').textContent || '';
  pruefe('Der Abschnitt ist da', /Unterhaltungen ohne Task/.test(text));
  pruefe('Für Anna steht kein Treffer', /kein Treffer/.test(text));
  pruefe('Die gelesene Form wird gezeigt', /gelesen als „anna bolko"/.test(text), text.slice(0, 400));
  // Corina wurde über die Namensbrücke schon verbunden und gehört damit nicht
  // mehr in diese Liste.
  pruefe('Die verbundene Unterhaltung steht nicht mehr drin',
    !/Corina/.test(text.split('Handles nachtragen')[0] || ''), text.slice(0, 400));
}

gruppe('Dasselbe Profilbild führt zwei Unterhaltungen zusammen');
{
  // T5 ist dieselbe Person wie T1: gleiche Bild-ID, aber der Vorschautext nennt
  // keinen Handle — so sehen normale DMs aus.
  const zweite = macheThread({ id: 'T5', titel: 'Anna B. 🏃', bild: '111111111',
    zeit: new Date(2026, 9, 2, 8, 0, 0).getTime(), vorschau: 'Anna: Hey, schau mal' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [zweite],
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'aus UpPromote' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Die Unterhaltung ist verbunden',
    /igfu-thread:\s*T2/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Die Bild-ID steht jetzt dabei',
    /igfu-bild:\s*222222222/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-160));
}

gruppe('Eine Karteileiche fängt das Zusammenführen über das Bild nicht ab');
{
  const zweite = macheThread({ id: 'T5', titel: 'Anna B. 🏃', bild: '111111111',
    zeit: new Date(2026, 9, 2, 8, 0, 0).getTime(), vorschau: 'Anna: Hey, schau mal' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [zweite],
    tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
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
  const schmuck = macheThread({ id: 'T5', titel: '𝗖𝗵𝗶𝗮𝗿𝗮 𝗪𝗮𝗹𝗱𝗻𝗲𝗿',
    bild: '777777777', zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Hey, schau mal' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [schmuck],
    tasks: [{ id: 'a1', name: 'chiara_waldner — Chiara Waldner', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: chiara_waldner' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Der schlicht geschriebene Task wird gefunden',
    /igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
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
  const mitBeiwerk = macheThread({ id: 'T5', titel: 'G o V e | Govind Mukubay', bild: '777777777',
    zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Govind: Hallo' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [mitBeiwerk],
    tasks: [{ id: 'a1', name: 'govefit_ — Govind Mukubay', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: govefit_' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Der Task wird trotz Beiwerk gefunden',
    /igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
}

gruppe('Ein einzelnes Wort zählt nur als Handle');
{
  const alsHandle = macheThread({ id: 'T5', titel: 'naturpedal', bild: '777777777',
    zeit: new Date(2026, 9, 2, 9, 0, 0).getTime(), vorschau: 'Hallo' });
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [alsHandle],
    tasks: [{ id: 'a1', name: 'naturpedal', status: 'hat sales', farbe: '#008844', beschreibung: 'alt' },
            { id: 'a2', name: 'Willi', status: 'ongeboardet', farbe: '#b660e0', beschreibung: 'alt' }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Der Handle-Task wird verbunden',
    /igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''), serverTasks[0].beschreibung);
  pruefe('Der Vorname-Task bleibt unverbunden',
    !/igfu-thread/.test(serverTasks[1].beschreibung || ''), serverTasks[1].beschreibung);
}

gruppe('Die zweite Unterhaltung findet den Task auch über den Namen');
{
  // Der Task hat schon eine Unterhaltung. Trotzdem gehört die zweite dorthin.
  const zweite = macheThread({ id: 'T5', titel: 'Corina Bösch', bild: '777777777',
    zeit: new Date(2026, 9, 3, 9, 0, 0).getTime(), vorschau: 'Corina: noch was' });
  const { doc, w, serverTasks, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    zusatz: [zweite],
    tasks: [{ id: 'a1', name: 'Corina Bösch', status: 'ongeboardet', farbe: '#b660e0',
              beschreibung: beschreibungMit('T2') }],
  });
  klick(w, doc.querySelector('#igfu-refresh'));
  await warte(w, 3000);
  pruefe('Es entsteht kein zweiter Task', angelegte(aufrufe).length === 0,
    JSON.stringify(angelegte(aufrufe).map((a) => a.data && a.data.name)));
  pruefe('Beide Unterhaltungen hängen am selben Task',
    /igfu-thread:\s*T2/.test(serverTasks[0].beschreibung || '')
    && /igfu-thread:\s*T5/.test(serverTasks[0].beschreibung || ''),
    (serverTasks[0].beschreibung || '').slice(-180));
}

gruppe('Fehlende Fristen nachtragen: Warenversand');
{
  const { doc, w, serverTasks } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'zzz.niemand — Zzz Niemand', status: 'erste ware versendet', farbe: '#b660e0',
              beschreibung: 'aus UpPromote\nigfu-handle: zzz.niemand\nigfu-ware: 2026-09-21' }],
  });
  klick(w, knopf(doc, 'Fehlende Fristen nachtragen'));
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
  klick(w, knopf(doc, 'Fehlende Fristen nachtragen'));
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
  klick(w, knopf(doc, 'Fehlende Fristen nachtragen'));
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
  klick(w, knopf(doc, 'Fehlende Fristen nachtragen'));
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
  klick(w, knopf(doc, 'Fehlende Fristen nachtragen'));
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
  klick(w, knopf(doc, 'Fehlende Fristen nachtragen'));
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
      { id: 'a1', name: 'lauf_bulti_lauf — Thorsten Bulthaup', status: 'hat sales', farbe: '#e16b16',
        beschreibung: 'aus UpPromote\nigfu-handle: lauf_bulti_lauf' },
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
  pruefe('Der offene Task steht drin', /Thorsten Bulthaup/.test(t));
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
    tasks: [{ id: 'a1', name: 'lauf_bulti_lauf — Thorsten Bulthaup', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'aus UpPromote\nigfu-handle: lauf_bulti_lauf' }],
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
    karte: { handle: 'lauf_bulti_lauf' },
    pfad: '/latest/inbox/all/?selected_item_id=T3',
    tasks: [{ id: 'a1', name: 'lauf_bulti_lauf — Thorsten Bulthaup', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'aus UpPromote\nigfu-handle: lauf_bulti_lauf' }],
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
    tasks: [{ id: 'a1', name: 'lauf_bulti_lauf — Thorsten Bulthaup', status: 'hat sales', farbe: '#e16b16',
              beschreibung: 'aus UpPromote\nigfu-handle: lauf_bulti_lauf' }],
  });
  await warte(w, 900);
  klick(w, doc.querySelector('#igfu-launch'));
  await warte(w, 300);
  const auswahl = doc.querySelector('.igfu-auswahl');
  pruefe('Es gibt eine Auswahl', !!auswahl);
  pruefe('Der Task steht zur Wahl',
    !!auswahl && /Thorsten Bulthaup/.test(auswahl.textContent || ''), auswahl && auswahl.textContent);
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

console.log('\n' + (fehlgeschlagen
  ? `${fehlgeschlagen} von ${gelaufen} Prüfungen fehlgeschlagen`
  : `Alle ${gelaufen} Prüfungen bestanden`));
process.exit(fehlgeschlagen ? 1 : 0);
