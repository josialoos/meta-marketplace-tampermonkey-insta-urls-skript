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
  pruefe('Rücksprung-Link steht in der Beschreibung', b.includes('#igfu=T2'), b);
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
