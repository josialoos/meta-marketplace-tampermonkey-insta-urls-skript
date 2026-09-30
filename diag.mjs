import { starte, warte, klick, knopf, beschreibungMit, LISTE, TAG } from './tests/harness.mjs';
const MIT_UP = { 'clickup:token:v1': 'pk_geheim_123', 'clickup:list:v1': LISTE, 'uppromote:token:v1': 'up_geheim_999' };
const { doc, w, serverTasks, aufrufe } = await starte({
  speicher: MIT_UP,
  tasks: [{ id: 'a1', name: 'annabolko.runs — Anna Bolko', status: 'angeschrieben', farbe: '#87909e',
            beschreibung: beschreibungMit('T1'), tags: [TAG] }],
  affiliates: [{ first_name: 'Anna', last_name: 'B', email: 'a@b.de', instagram: 'annabolko.runs' }],
});
await warte(w, 800);
klick(w, knopf(doc, 'UpPromote abgleichen'));
await warte(w, 1500);
console.log('Meldung:', (doc.querySelector('#igfu-toast')||{}).textContent);
console.log('Status :', serverTasks[0].status);
console.log('Aufrufe:', aufrufe.map(a => a.methode + ' ' + a.pfad).join('\n         '));
