// Prüfstand für die Standardnachrichten.
//
// Eigener, kleiner Aufbau statt des grossen Postfach-Prüfstands: Dieses Skript
// hängt an nichts von dort, und ein gemeinsamer Prüfstand würde die beiden
// wieder verkoppeln, die wir gerade absichtlich getrennt halten.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SKRIPT = new URL('../standardnachrichten.user.js', import.meta.url);

let gelaufen = 0;
let fehlgeschlagen = 0;
const gruppe = (t) => console.log('\n' + t);
function pruefe(was, bedingung, beleg) {
  gelaufen += 1;
  if (bedingung) { console.log('  ok   ' + was); return; }
  fehlgeschlagen += 1;
  console.log('  FEHL ' + was + (beleg === undefined ? '' : '   → ' + beleg));
}

// Die Verfassen-Zeile so nachgebaut, wie sie am 20.10.2026 auf instagram.com
// aussah: das Eingabefeld zwei Ebenen unter einer 44 Pixel hohen Zeile, die
// vier Symbole trägt.
const SEITE = `<!doctype html><html><body>
  <div id="fenster">
    <div id="zeile">
      <div role="button" aria-label="Emoji"></div>
      <div><div role="textbox" contenteditable="true"></div></div>
      <div role="button" aria-label="Foto"></div>
      <div role="button" aria-label="Sprachnachricht"></div>
      <div role="button" aria-label="Sticker"></div>
    </div>
  </div>
</body></html>`;

let voriges = null;

function starte({ gespeichert = [] } = {}) {
  if (voriges) { try { voriges.close(); } catch { /* schon zu */ } }
  const dom = new JSDOM(SEITE, {
    url: 'https://www.instagram.com/direct/t/1234567890/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  voriges = w;

  // jsdom misst nichts, liefert also überall Höhe 0. Die Zeile braucht aber
  // eine Höhe zwischen 0 und 120, sonst findet verfassenZeile() sie nicht —
  // genau diese Schranke verhindert im Browser, dass der Knopf im ganzen
  // Fensterbereich statt in der Zeile landet.
  const echt = w.Element.prototype.getBoundingClientRect;
  w.Element.prototype.getBoundingClientRect = function () {
    const r = echt.call(this);
    if (this.id === 'zeile') return { ...r, height: 44, width: 1377, top: 800, left: 500, bottom: 844, right: 1877 };
    if (this.id === 'fenster') return { ...r, height: 600, width: 1400, top: 200, left: 500, bottom: 800, right: 1900 };
    return r;
  };

  const speicher = new Map([['sn:vorlagen:v1', gespeichert]]);
  w.GM_getValue = (k, fallback) => (speicher.has(k) ? speicher.get(k) : fallback);
  w.GM_setValue = (k, v) => speicher.set(k, v);

  // Die Marke, hinter der das Skript seinen Prüfzugang freigibt.
  w.__IGSN_PRUEFSTAND__ = true;

  // jsdom kennt execCommand nicht. Nachgebaut wird nur, was gebraucht wird:
  // Text an der Einfügestelle ergänzen.
  w.document.execCommand = (befehl, _ui, wert) => {
    if (befehl !== 'insertText') return false;
    const feld = w.document.querySelector('div[role="textbox"]');
    if (!feld) return false;
    feld.textContent += wert;
    return true;
  };

  w.eval(readFileSync(SKRIPT, 'utf8'));
  return { w, doc: w.document, api: w.__igsn, speicher };
}

const klick = (w, e) => {
  if (!e) throw new Error('klick: Element nicht da');
  return e.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
};

// ---------------------------------------------------------------

gruppe('Der Knopf landet in der Verfassen-Zeile');
{
  const { doc, api } = starte();
  pruefe('Die Zeile wird gefunden', !!api.verfassenZeile());
  pruefe('Der Knopf ist da', !!doc.querySelector('.igsn-knopf'));
  pruefe('Und zwar in der Zeile',
    doc.getElementById('zeile').querySelector('.igsn-knopf') !== null);
  api.knopfSetzen();
  api.knopfSetzen();
  pruefe('Mehrfaches Setzen erzeugt keinen zweiten',
    doc.querySelectorAll('.igsn-knopf').length === 1,
    String(doc.querySelectorAll('.igsn-knopf').length));
}

gruppe('Ohne Eingabefeld passiert nichts');
{
  const { doc, api } = starte();
  doc.querySelector('div[role="textbox"]').remove();
  doc.querySelector('.igsn-knopf').remove();
  api.knopfSetzen();
  pruefe('Kein Knopf ohne Feld', !doc.querySelector('.igsn-knopf'));
}

gruppe('Anlegen, Ändern, Löschen');
{
  const { api, speicher } = starte();
  api.vorlageSpeichern({ id: 'a', titel: 'Ad-Codes', text: 'So geht das mit den Ad-Codes.' });
  api.vorlageSpeichern({ id: 'b', titel: 'Versand', text: 'Die Box ist unterwegs.' });
  pruefe('Zwei Vorlagen gespeichert', api.vorlagen().length === 2);
  api.vorlageSpeichern({ id: 'a', titel: 'Ad-Codes neu', text: 'Geänderter Text.' });
  pruefe('Ändern legt keine zweite an', api.vorlagen().length === 2);
  pruefe('Der Titel ist geändert',
    api.vorlagen().find((v) => v.id === 'a').titel === 'Ad-Codes neu');
  api.vorlageLoeschen('b');
  pruefe('Löschen entfernt genau eine', api.vorlagen().length === 1);
  pruefe('Und zwar die richtige', api.vorlagen()[0].id === 'a');
  pruefe('Es liegt wirklich im Speicher', (speicher.get('sn:vorlagen:v1') || []).length === 1);
}

gruppe('Kaputter Speicherinhalt wirft das Skript nicht um');
{
  // Was hier liegt, hat irgendwann jemand von Hand eingelesen. Darauf darf
  // sich das Skript nicht verlassen.
  const { api } = starte({ gespeichert: 'kein Array' });
  pruefe('Unsinn ergibt eine leere Liste', Array.isArray(api.vorlagen()) && api.vorlagen().length === 0);
}
{
  const { api } = starte({ gespeichert: [null, 5, { text: 'ohne Titel und ohne ID' }] });
  const liste = api.vorlagen();
  pruefe('Unbrauchbare Einträge fallen weg', liste.length === 1, JSON.stringify(liste));
  pruefe('Fehlende ID wird ergänzt', !!liste[0].id);
}

gruppe('Suche greift über Titel und Text');
{
  const { api } = starte();
  const liste = [
    { id: 'a', titel: 'Ad-Codes', text: 'Schau dir die Anleitung an.' },
    { id: 'b', titel: 'Versand', text: 'Deine Box mit den Riegeln ist raus.' },
  ];
  pruefe('Treffer im Titel', api.suchen(liste, 'versand').length === 1);
  pruefe('Treffer im Text', api.suchen(liste, 'riegeln').length === 1);
  pruefe('Groß- und Kleinschreibung egal', api.suchen(liste, 'AD-CODES').length === 1);
  pruefe('Leere Suche zeigt alles', api.suchen(liste, '   ').length === 2);
  pruefe('Kein Treffer bleibt leer', api.suchen(liste, 'zzz').length === 0);
}

gruppe('Ein Klick setzt den Text ins Eingabefeld');
{
  const { w, doc, api } = starte({
    gespeichert: [{ id: 'a', titel: 'Ad-Codes', text: 'Hier die Anleitung:\nhttps://example.invalid' }],
  });
  klick(w, doc.querySelector('.igsn-knopf'));
  pruefe('Das Panel ist offen', !!doc.querySelector('.igsn-panel'));
  pruefe('Die Vorlage steht drin',
    /Ad-Codes/.test(doc.querySelector('.igsn-panel').textContent));
  klick(w, doc.querySelector('.igsn-eintrag-text'));
  pruefe('Der Text steht im Feld',
    doc.querySelector('div[role="textbox"]').textContent === 'Hier die Anleitung:\nhttps://example.invalid',
    JSON.stringify(doc.querySelector('div[role="textbox"]').textContent));
  pruefe('Das Panel ist wieder zu', !doc.querySelector('.igsn-panel'));
}

gruppe('Vorhandener Text wird ergänzt, nicht ersetzt');
{
  // Wer schon halb getippt hat, soll seinen Anfang behalten.
  const { w, doc } = starte({ gespeichert: [{ id: 'a', titel: 'Gruß', text: 'Viele Grüße, Josia' }] });
  doc.querySelector('div[role="textbox"]').textContent = 'Hi Anna! ';
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, doc.querySelector('.igsn-eintrag-text'));
  pruefe('Beides steht da',
    doc.querySelector('div[role="textbox"]').textContent === 'Hi Anna! Viele Grüße, Josia',
    doc.querySelector('div[role="textbox"]').textContent);
}

gruppe('Über die Oberfläche anlegen');
{
  const { w, doc, api } = starte();
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Neu'));
  const felder = doc.querySelectorAll('.igsn-form .igsn-feld');
  felder[0].value = 'Begrüßung';
  felder[1].value = 'Hallo und willkommen!';
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Sichern'));
  pruefe('Die Vorlage ist gespeichert', api.vorlagen().length === 1, JSON.stringify(api.vorlagen()));
  pruefe('Mit dem eingegebenen Titel', (api.vorlagen()[0] || {}).titel === 'Begrüßung');
  pruefe('Und sie steht in der Liste', /Begrüßung/.test(doc.querySelector('.igsn-panel').textContent));
}

gruppe('Ohne Titel wird die erste Zeile genommen');
{
  const { w, doc, api } = starte();
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Neu'));
  const felder = doc.querySelectorAll('.igsn-form .igsn-feld');
  felder[1].value = 'Danke für deine Nachricht!\nMelde mich gleich.';
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Sichern'));
  pruefe('Titel aus der ersten Zeile',
    (api.vorlagen()[0] || {}).titel === 'Danke für deine Nachricht!',
    JSON.stringify(api.vorlagen()[0]));
}

gruppe('Leeres Formular legt nichts an');
{
  const { w, doc, api } = starte();
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Neu'));
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Sichern'));
  pruefe('Nichts gespeichert', api.vorlagen().length === 0);
}

gruppe('Löschen fragt einmal nach');
{
  const { w, doc, api } = starte({ gespeichert: [{ id: 'a', titel: 'Weg damit', text: 'x' }] });
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, [...doc.querySelectorAll('.igsn-mini')].find((b) => b.textContent === 'Bearbeiten'));
  const weg = [...doc.querySelectorAll('.igsn-mini')].find((b) => b.textContent === 'Löschen');
  klick(w, weg);
  pruefe('Erster Klick löscht noch nicht', api.vorlagen().length === 1);
  pruefe('Der Knopf fragt nach', weg.textContent === 'Wirklich löschen?');
  klick(w, weg);
  pruefe('Zweiter Klick löscht', api.vorlagen().length === 0);
}

gruppe('Ausgeben und Einlesen');
{
  const { w, doc, api } = starte({ gespeichert: [{ id: 'a', titel: 'Eins', text: 'Text eins' }] });
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, [...doc.querySelectorAll('.igsn-zweit')].find((b) => b.textContent === 'Ausgeben'));
  const feld = doc.querySelector('.igsn-form .igsn-feld');
  pruefe('Die vorhandene Vorlage steht im Text', /Text eins/.test(feld.value));
  feld.value = JSON.stringify([{ id: 'b', titel: 'Zwei', text: 'Text zwei' }]);
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Einlesen'));
  pruefe('Die eingelesene kam dazu', api.vorlagen().length === 2, JSON.stringify(api.vorlagen()));
  pruefe('Die vorhandene blieb', api.vorlagen().some((v) => v.id === 'a'));
}

gruppe('Kaputter Einlesetext ändert nichts');
{
  const { w, doc, api } = starte({ gespeichert: [{ id: 'a', titel: 'Eins', text: 'Text eins' }] });
  klick(w, doc.querySelector('.igsn-knopf'));
  klick(w, [...doc.querySelectorAll('.igsn-zweit')].find((b) => b.textContent === 'Ausgeben'));
  doc.querySelector('.igsn-form .igsn-feld').value = '{kaputt';
  klick(w, [...doc.querySelectorAll('.igsn-haupt')].find((b) => b.textContent === 'Einlesen'));
  pruefe('Bestand unverändert', api.vorlagen().length === 1);
  pruefe('Eine Meldung erscheint',
    /kein gültiger Text/.test(doc.querySelector('.igsn-panel').textContent));
}

gruppe('Nichts kollidiert mit dem Postfach-Skript');
{
  // Beide Skripte laufen gleichzeitig. Das Postfach-Skript liest den Text von
  // Unterhaltungszeilen aus und hat sich dabei schon einmal selbst mitgelesen.
  const { doc } = starte({ gespeichert: [{ id: 'a', titel: 'Eins', text: 'x' }] });
  pruefe('Keine igfu-Klasse irgendwo',
    doc.querySelectorAll('[class*="igfu"], [id*="igfu"]').length === 0);
  pruefe('Alles Eigene trägt igsn-',
    [...doc.querySelectorAll('[class]')]
      .filter((e) => /igsn|igfu/.test(e.className))
      .every((e) => /^igsn-/.test(e.className.split(' ')[0])));
}

console.log('\n' + (fehlgeschlagen
  ? `${fehlgeschlagen} von ${gelaufen} Prüfungen fehlgeschlagen`
  : `Alle ${gelaufen} Prüfungen bestanden`));
process.exit(fehlgeschlagen ? 1 : 0);
