import { starte, warte, chip, klick, knopf, beschreibungMit, LISTE, SPACE, TAG } from './harness.mjs';

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
  pruefe('Tag wird nur einmal angelegt',
    aufrufe.filter((a) => a.methode === 'POST' && /^\/space\/[^/]+\/tag$/.test(a.pfad)).length === 1);
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

console.log('\n' + (fehlgeschlagen
  ? `${fehlgeschlagen} von ${gelaufen} Prüfungen fehlgeschlagen`
  : `Alle ${gelaufen} Prüfungen bestanden`));
process.exit(fehlgeschlagen ? 1 : 0);
