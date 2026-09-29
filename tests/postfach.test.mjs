import { starte, warte, chip, klick, LISTE, FELDER } from './harness.mjs';

let fehlgeschlagen = 0, gelaufen = 0;
const pruefe = (name, bedingung, extra = '') => {
  gelaufen++;
  console.log((bedingung ? '  ok   ' : '  FEHL ') + name + (bedingung ? '' : '   → ' + extra));
  if (!bedingung) fehlgeschlagen++;
};
const gruppe = (t) => console.log('\n' + t);

const MIT_CLICKUP = { 'clickup:token:v1': 'pk_geheim_123', 'clickup:list:v1': LISTE };

// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
gruppe('Außerhalb des Postfachs passiert nichts');
{
  const { doc, aufrufe } = await starte({ pfad: '/latest/home/', speicher: MIT_CLICKUP });
  pruefe('Keine Knöpfe', doc.querySelectorAll('.igfu-tag').length === 0);
  pruefe('Keine Anfrage an ClickUp', aufrufe.length === 0, JSON.stringify(aufrufe.map((a) => a.pfad)));
}

// ---------------------------------------------------------------
gruppe('Mit ClickUp: Status aus der Liste erscheint in der Zeile');
{
  const { doc, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'verhandlung', farbe: '#b660e0',
              felder: { 'f-thread': 'T1', 'f-follow': true }, due: null }],
  });
  pruefe('Felder werden einmal geladen', aufrufe.filter((a) => a.pfad.endsWith('/field')).length === 1);
  pruefe('Tasks werden geladen', aufrufe.some((a) => a.pfad.includes('/task?')));
  const c = chip(doc, 0, 'crm');
  pruefe('CRM-Pille zeigt den Status', c.textContent === 'verhandlung', c.textContent);
  pruefe('CRM-Pille trägt die Statusfarbe', c.style.background === 'rgb(182, 96, 224)', c.style.background);
  pruefe('Zeile ohne Task zeigt das Pluszeichen', chip(doc, 1, 'crm').textContent === 'CRM +');
  pruefe('Follow-up aus ClickUp färbt die Zeile',
    doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

// ---------------------------------------------------------------
gruppe('Follow-up-Klick schreibt nach ClickUp');
{
  const { doc, w, aufrufe, serverTasks } = await starte({ speicher: MIT_CLICKUP });
  klick(w, chip(doc, 1, 'followup'));
  await warte(w, 400);
  const angelegt = aufrufe.filter((a) => a.methode === 'POST' && /^\/list\/.+\/task$/.test(a.pfad));
  pruefe('Genau ein Task wurde angelegt', angelegt.length === 1, JSON.stringify(angelegt));
  pruefe('Task trägt den Anzeigenamen', angelegt[0] && angelegt[0].data.name === 'Corina Bösch');
  const cf = angelegt[0] ? Object.fromEntries(angelegt[0].data.custom_fields.map((c) => [c.id, c.value])) : {};
  pruefe('Thread-ID steht im Custom Field', cf['f-thread'] === 'T2', JSON.stringify(cf));
  pruefe('Rücksprung-Link enthält das Fragment',
    String(cf['f-link']).endsWith('#igfu=T2'), String(cf['f-link']));
  const gesetzt = aufrufe.find((a) => a.pfad.includes('/field/f-follow'));
  pruefe('Follow-up-Haken wird gesetzt', gesetzt && gesetzt.data.value === true, JSON.stringify(gesetzt));
  pruefe('Warteschlange ist danach leer', (JSON.parse(JSON.stringify(serverTasks)), true));
}

// ---------------------------------------------------------------
gruppe('CRM-Pille öffnet den vorhandenen Task');
{
  const { doc, w } = await starte({
    speicher: MIT_CLICKUP,
    tasks: [{ id: 'a1', name: 'Anna Bolko', status: 'zugesagt', farbe: '#30a46c',
              felder: { 'f-thread': 'T1' }, due: null }],
  });
  klick(w, chip(doc, 0, 'crm'));
  await warte(w, 100);
  pruefe('Task wird in neuem Tab geöffnet',
    (w.__geoeffnet || [])[0] === 'https://app.clickup.com/t/a1', JSON.stringify(w.__geoeffnet));
}

// ---------------------------------------------------------------
gruppe('Netzwerkfehler: Änderung bleibt lokal und in der Warteschlange');
{
  const { doc, w, store } = await starte({
    speicher: MIT_CLICKUP,
    fehler: (m, p) => (m === 'POST' ? 'netz' : null),
  });
  klick(w, chip(doc, 2, 'followup'));
  await warte(w, 400);
  pruefe('Lokal ist die Markierung gesetzt', !!store.get('igfu:v1').T3);
  pruefe('Zeile bleibt markiert', doc.querySelectorAll('.row')[2].hasAttribute('data-igfu-follow'));
  const w8 = store.get('clickup:queue:v1') || [];
  pruefe('Auftrag steht in der Warteschlange', w8.length === 1 && w8[0].tid === 'T3', JSON.stringify(w8));
  pruefe('Der Versuch wurde gezählt', w8[0] && w8[0].versuche >= 1, JSON.stringify(w8[0]));
}

// ---------------------------------------------------------------
gruppe('Abgelehnter Token: nichts geht verloren');
{
  const { doc, w, store } = await starte({
    speicher: MIT_CLICKUP,
    fehler: () => 'token',
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 400);
  const w8 = store.get('clickup:queue:v1') || [];
  pruefe('Auftrag bleibt stehen, bis der Token stimmt', w8.length === 1 && w8[0].tid === 'T1', JSON.stringify(w8));
  pruefe('Kein sinnloser Wiederholungszähler', w8[0] && w8[0].versuche === 0, JSON.stringify(w8[0]));
  pruefe('Lokale Markierung bleibt erhalten', !!store.get('igfu:v1').T1);
  pruefe('Zeile bleibt markiert', doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
}

// ---------------------------------------------------------------
gruppe('Aussichtsloser Auftrag verstopft die Warteschlange nicht');
{
  // 404 auf das Anlegen: nicht wiederholbar und nicht behebbar
  const { doc, w, store } = await starte({
    speicher: MIT_CLICKUP,
    fehler: (m, p) => (m === 'POST' && /^\/list\/.+\/task$/.test(p) ? 'weg' : null),
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 500);
  const w8 = store.get('clickup:queue:v1') || [];
  pruefe('Auftrag wurde verworfen', w8.length === 0, JSON.stringify(w8));
  pruefe('Lokale Markierung bleibt trotzdem', !!store.get('igfu:v1').T1);
}

// ---------------------------------------------------------------
gruppe('Token bleibt im GM-Speicher');
{
  const { doc, w, store, aufrufe } = await starte({ speicher: MIT_CLICKUP, tasks: [] });
  pruefe('Token steht nicht am window-Objekt',
    !Object.keys(w).some((k) => typeof w[k] === 'string' && w[k].includes('pk_geheim')));
  pruefe('Token steht nicht im Seitentext', !doc.body.innerHTML.includes('pk_geheim'));
  pruefe('Token geht nur als Kopfzeile raus, nie im Inhalt',
    !aufrufe.some((a) => JSON.stringify(a.data || '').includes('pk_geheim')));
  pruefe('Token liegt im GM-Speicher', store.get('clickup:token:v1') === 'pk_geheim_123');
}

// ---------------------------------------------------------------
gruppe('Speicher übersteht ein Neuladen');
{
  const erst = await starte({ speicher: MIT_CLICKUP });
  klick(erst.w, chip(erst.doc, 0, 'followup'));
  await warte(erst.w, 400);
  const uebernommen = Object.fromEntries(erst.store);
  const zweit = await starte({ speicher: uebernommen });
  pruefe('Markierung ist nach Neustart noch da',
    zweit.doc.querySelectorAll('.row')[0].hasAttribute('data-igfu-follow'));
  pruefe('Knopf ist aktiv', chip(zweit.doc, 0, 'followup').classList.contains('on'));
}

// ---------------------------------------------------------------
const knopf = (doc, text) =>
  [...doc.querySelectorAll('.igfu-form button')].find((b) => b.textContent === text);

gruppe('Follow-up abräumen legt keinen leeren Task an');
{
  // T1 ist lokal markiert, in ClickUp gibt es dazu nichts.
  const { doc, w, aufrufe } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': { T1: { title: 'Anna Bolko', flaggedAt: 1, due: '', note: '' } } },
  });
  pruefe('Startet als markiert', chip(doc, 0, 'followup').classList.contains('on'));
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 400);
  const angelegt = aufrufe.filter((a) => a.methode === 'POST' && /^\/list\/.+\/task$/.test(a.pfad));
  pruefe('Kein Task wurde angelegt', angelegt.length === 0, JSON.stringify(angelegt));
}

gruppe('Übernahme der lokalen Follow-ups');
{
  const lokal = {
    T1: { title: 'Anna Bolko', flaggedAt: 1, due: '2026-10-08', note: 'Rate offen' },
    T2: { title: 'Corina Bösch', flaggedAt: 2, due: '', note: '' },
    T3: { title: 'Willi', flaggedAt: 3, due: '', note: '' },
  };
  // T2 steht schon in ClickUp und darf kein zweites Mal entstehen.
  const { doc, w, aufrufe, serverTasks } = await starte({
    speicher: { ...MIT_CLICKUP, 'igfu:v1': lokal },
    tasks: [{ id: 'vorhanden', name: 'Corina Bösch', status: 'angeschrieben', farbe: '#87909e',
              felder: { 'f-thread': 'T2', 'f-follow': true }, due: null }],
  });

  klick(w, knopf(doc, 'Lokale Follow-ups übernehmen'));
  await warte(w, 900);

  const angelegt = aufrufe.filter((a) => a.methode === 'POST' && /^\/list\/.+\/task$/.test(a.pfad));
  pruefe('Nur die zwei fehlenden werden angelegt', angelegt.length === 2,
    JSON.stringify(angelegt.map((a) => a.data.name)));
  pruefe('Der vorhandene bleibt unberührt', serverTasks.filter((t) => t.felder['f-thread'] === 'T2').length === 1);
  pruefe('Haken wird bei beiden gesetzt',
    aufrufe.filter((a) => /\/field\/f-follow$/.test(a.pfad) && a.data.value === true).length === 2);
  pruefe('Datum wird übertragen',
    aufrufe.some((a) => a.methode === 'PUT' && a.data && a.data.due_date),
    JSON.stringify(aufrufe.filter((a) => a.methode === 'PUT').map((a) => a.data)));
  pruefe('Notiz wird Kommentar',
    aufrufe.some((a) => /\/comment$/.test(a.pfad) && a.data.comment_text === 'Rate offen'));

  // Zweiter Durchlauf darf nichts verdoppeln
  const vorher = aufrufe.filter((a) => a.methode === 'POST' && /^\/list\/.+\/task$/.test(a.pfad)).length;
  klick(w, knopf(doc, 'Lokale Follow-ups übernehmen'));
  await warte(w, 900);
  const nachher = aufrufe.filter((a) => a.methode === 'POST' && /^\/list\/.+\/task$/.test(a.pfad)).length;
  pruefe('Zweiter Durchlauf legt nichts doppelt an', nachher === vorher, vorher + ' → ' + nachher);
  pruefe('Insgesamt drei Unterhaltungen in ClickUp', serverTasks.length === 3,
    JSON.stringify(serverTasks.map((t) => t.name)));
}

gruppe('Checkbox: Rückfall auf Text, wenn ClickUp den Wahrheitswert ablehnt');
{
  let ersterVersuch = true;
  const { doc, w, aufrufe } = await starte({
    speicher: MIT_CLICKUP,
    fehler: (m, p) => {
      if (/\/field\/f-follow$/.test(p) && ersterVersuch) { ersterVersuch = false; return 'weg'; }
      return null;
    },
  });
  klick(w, chip(doc, 0, 'followup'));
  await warte(w, 600);
  const versuche = aufrufe.filter((a) => /\/field\/f-follow$/.test(a.pfad));
  pruefe('Es wird ein zweites Mal versucht', versuche.length === 2, JSON.stringify(versuche.map((v) => v.data)));
  pruefe('Erst Wahrheitswert', versuche[0] && versuche[0].data.value === true);
  pruefe('Dann Text', versuche[1] && versuche[1].data.value === 'true');
}

gruppe('Token löschen schaltet ClickUp sauber ab');
{
  const { doc, w, store } = await starte({ speicher: MIT_CLICKUP });
  pruefe('CRM-Pille ist sichtbar', chip(doc, 0, 'crm').hidden === false);
  klick(w, knopf(doc, 'Token löschen'));
  await warte(w, 200);
  pruefe('Token ist weg', !store.get('clickup:token:v1'));
  pruefe('CRM-Pille verschwindet sofort', chip(doc, 0, 'crm').hidden === true);
  pruefe('Follow-up funktioniert weiter lokal', (klick(w, chip(doc, 1, 'followup')), !!store.get('igfu:v1').T2));
}

// ---------------------------------------------------------------
console.log('\n' + (fehlgeschlagen
  ? `${fehlgeschlagen} von ${gelaufen} Prüfungen fehlgeschlagen`
  : `Alle ${gelaufen} Prüfungen bestanden`));
process.exit(fehlgeschlagen ? 1 : 0);
