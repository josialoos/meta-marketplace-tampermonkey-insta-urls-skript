// ==UserScript==
// @name         Standardnachrichten für Instagram
// @namespace    tzampas.standardnachrichten
// @version      0.1
// @description  Gespeicherte Antworten im Instagram-Postfach: anlegen, bearbeiten, mit einem Klick ins Eingabefeld setzen.
// @author       Josia Loos
// @match        https://www.instagram.com/direct/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @sandbox      JavaScript
// @updateURL    https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/standardnachrichten/standardnachrichten.user.js
// @downloadURL  https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/standardnachrichten/standardnachrichten.user.js
// ==/UserScript==

/* Eigenständiges Skript, bewusst getrennt vom Postfach-Skript.
 *
 * Warum getrennt: Das Postfach-Skript ist gross und greift tief in Metas
 * Oberflaeche. Diese Erweiterung soll sich parallel testen lassen, ohne dass
 * ein Fehler hier den taeglichen Betrieb dort stoert. Beide duerfen
 * gleichzeitig laufen.
 *
 * Deshalb traegt hier alles das Praefix `igsn-`, nie `igfu-`. Das ist nicht
 * Kosmetik: Das Postfach-Skript liest den Text von Unterhaltungszeilen aus und
 * hat frueher schon einmal seine eigene Beschriftung mitgelesen. Diese
 * Erweiterung fasst ausschliesslich die Verfassen-Zeile an und niemals eine
 * Zeile der Unterhaltungsliste — damit kann das nicht passieren.
 *
 * Eigener Speicher: Ein zweites Skript hat einen eigenen GM-Speicher. Die
 * Vorlagen liegen also nicht dort, wo das Postfach-Skript seine Daten hat.
 * Fuer den spaeteren Umzug gibt es „Ausgeben" und „Einlesen".
 */

(function () {
  'use strict';

  const VERSION = '0.1';
  const SPEICHER = 'sn:vorlagen:v1';

  // ---------- Speicher ----------
  //
  // Eine Vorlage ist { id, titel, text }. Mehr nicht — jede weitere Spalte
  // waere eine, die beim Zusammenfuehren mitwandern muesste.

  const neueID = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function vorlagen() {
    const roh = GM_getValue(SPEICHER, []);
    if (!Array.isArray(roh)) return [];
    return roh
      .filter((v) => v && typeof v === 'object')
      .map((v) => ({
        id: String(v.id || neueID()),
        titel: String(v.titel || '').slice(0, 80),
        text: String(v.text || ''),
      }));
  }

  const vorlagenSichern = (liste) => GM_setValue(SPEICHER, liste);

  function vorlageSpeichern(eintrag) {
    const liste = vorlagen();
    const i = liste.findIndex((v) => v.id === eintrag.id);
    if (i >= 0) liste[i] = eintrag; else liste.push(eintrag);
    vorlagenSichern(liste);
    return liste;
  }

  function vorlageLoeschen(id) {
    const liste = vorlagen().filter((v) => v.id !== id);
    vorlagenSichern(liste);
    return liste;
  }

  // Suche ueber Titel *und* Text. Wer nach „Ad-Code" sucht, meint meistens den
  // Inhalt, nicht die Ueberschrift.
  function suchen(liste, wort) {
    const w = String(wort || '').trim().toLowerCase();
    if (!w) return liste;
    return liste.filter((v) => (v.titel + ' ' + v.text).toLowerCase().includes(w));
  }

  // ---------- Das Eingabefeld ----------

  const eingabefeld = () => document.querySelector('div[role="textbox"][contenteditable="true"]');

  // Die Verfassen-Zeile: vom Eingabefeld nach oben, bis ein Vorfahr die
  // Symbole enthaelt. Am 20.10.2026 gemessen liegt sie zwei Ebenen darueber
  // und ist 44 Pixel hoch. Geprueft wird auf die Symbole und auf eine geringe
  // Hoehe — ohne die Hoehenschranke landet man im ganzen Fensterbereich.
  function verfassenZeile() {
    let el = eingabefeld();
    for (let i = 0; i < 8 && el; i++) {
      const hoch = el.getBoundingClientRect().height;
      if (el.querySelectorAll('[role="button"]').length >= 2 && hoch > 0 && hoch < 120) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Text ins Eingabefeld setzen.
  //
  // `execCommand('insertText')` statt `textContent = …`: Instagram hoert auf
  // Eingabe-Ereignisse, und nur dieser Weg loest sie so aus, wie es beim
  // Tippen geschieht. Direkt gesetzter Text bleibt stehen, verschwindet aber
  // beim Absenden, weil die Oberflaeche ihn nie mitbekommen hat.
  function einsetzen(text) {
    const feld = eingabefeld();
    if (!feld) return false;
    feld.focus();
    const sel = window.getSelection();
    if (sel && !feld.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(feld);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return document.execCommand('insertText', false, text);
  }

  // ---------- Oberflaeche ----------

  const el = (tag, klasse, text) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  };

  function stil() {
    if (document.getElementById('igsn-stil')) return;
    const s = el('style');
    s.id = 'igsn-stil';
    s.textContent = `
.igsn-knopf{display:flex;align-items:center;gap:6px;border:0;background:transparent;
  cursor:pointer;padding:6px 10px;border-radius:8px;font:inherit;font-size:14px;color:#262626}
.igsn-knopf:hover{background:#efefef}
.igsn-panel{position:fixed;z-index:2147483000;width:380px;max-height:60vh;display:flex;
  flex-direction:column;background:#fff;border:1px solid #dbdbdb;border-radius:12px;
  box-shadow:0 8px 28px rgba(0,0,0,.18);font:14px/1.45 system-ui,-apple-system,sans-serif;color:#262626}
.igsn-kopf{display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #efefef}
.igsn-suche{flex:1;border:1px solid #dbdbdb;border-radius:8px;padding:7px 10px;font:inherit}
.igsn-liste{overflow:auto;padding:6px}
.igsn-leer{padding:18px 12px;color:#8e8e8e;text-align:center}
.igsn-eintrag{display:flex;gap:8px;align-items:flex-start;padding:9px 10px;border-radius:8px;cursor:pointer}
.igsn-eintrag:hover{background:#fafafa}
.igsn-eintrag-text{flex:1;min-width:0}
.igsn-titel{font-weight:600;margin-bottom:2px}
.igsn-vorschau{color:#8e8e8e;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igsn-mini{border:0;background:transparent;cursor:pointer;color:#8e8e8e;padding:4px;border-radius:6px;font:inherit;font-size:12px}
.igsn-mini:hover{background:#efefef;color:#262626}
.igsn-fuss{display:flex;gap:8px;padding:8px 10px;border-top:1px solid #efefef}
.igsn-haupt{background:#0095f6;color:#fff;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit;font-weight:600}
.igsn-haupt:hover{background:#1877f2}
.igsn-zweit{background:#efefef;color:#262626;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit}
.igsn-feld{width:100%;box-sizing:border-box;border:1px solid #dbdbdb;border-radius:8px;padding:8px;font:inherit;margin-bottom:8px}
.igsn-gross{min-height:160px;resize:vertical}
.igsn-form{padding:10px;overflow:auto}
.igsn-hinweis{color:#8e8e8e;font-size:12px;margin-bottom:8px}`;
    document.head.appendChild(s);
  }

  let offen = null;

  function schliessen() {
    if (offen) { offen.remove(); offen = null; }
    document.removeEventListener('keydown', aufEscape, true);
    document.removeEventListener('mousedown', aufKlickDaneben, true);
  }

  function aufEscape(e) { if (e.key === 'Escape') { e.stopPropagation(); schliessen(); } }
  function aufKlickDaneben(e) {
    if (offen && !offen.contains(e.target) && !e.target.closest('.igsn-knopf')) schliessen();
  }

  // Das Panel sitzt ueber der Verfassen-Zeile und weicht nach oben aus, damit
  // es die Zeile nie verdeckt — dort wird ja gleich weitergeschrieben.
  function platzieren(panel, anker) {
    const r = anker.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 396)) + 'px';
    panel.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  }

  function panelOeffnen(anker) {
    if (offen) { schliessen(); return; }
    stil();
    const panel = el('div', 'igsn-panel');
    offen = panel;
    zeigeListe(panel, '');
    document.body.appendChild(panel);
    platzieren(panel, anker);
    document.addEventListener('keydown', aufEscape, true);
    document.addEventListener('mousedown', aufKlickDaneben, true);
    const suche = panel.querySelector('.igsn-suche');
    if (suche) suche.focus();
  }

  function zeigeListe(panel, filter) {
    panel.textContent = '';

    const kopf = el('div', 'igsn-kopf');
    const suche = el('input', 'igsn-suche');
    suche.type = 'search';
    suche.placeholder = 'Vorlagen durchsuchen';
    suche.value = filter || '';
    suche.addEventListener('input', () => {
      const pos = suche.selectionStart;
      zeigeListe(panel, suche.value);
      const neu = panel.querySelector('.igsn-suche');
      if (neu) { neu.focus(); try { neu.setSelectionRange(pos, pos); } catch { /* egal */ } }
    });
    const neuKnopf = el('button', 'igsn-haupt', 'Neu');
    neuKnopf.addEventListener('click', () => zeigeForm(panel, null));
    kopf.append(suche, neuKnopf);

    const liste = el('div', 'igsn-liste');
    const treffer = suchen(vorlagen(), filter);
    if (!treffer.length) {
      liste.appendChild(el('div', 'igsn-leer', vorlagen().length
        ? 'Nichts gefunden.'
        : 'Noch keine Vorlage. Mit „Neu" die erste anlegen.'));
    }
    for (const v of treffer) {
      const zeile = el('div', 'igsn-eintrag');
      const mitte = el('div', 'igsn-eintrag-text');
      mitte.append(
        el('div', 'igsn-titel', v.titel || '(ohne Titel)'),
        el('div', 'igsn-vorschau', v.text.split('\n').find((z) => z.trim()) || ''),
      );
      mitte.addEventListener('click', () => {
        schliessen();
        einsetzen(v.text);
      });
      const bearbeiten = el('button', 'igsn-mini', 'Bearbeiten');
      bearbeiten.addEventListener('click', (e) => { e.stopPropagation(); zeigeForm(panel, v); });
      zeile.append(mitte, bearbeiten);
      liste.appendChild(zeile);
    }

    const fuss = el('div', 'igsn-fuss');
    const raus = el('button', 'igsn-zweit', 'Ausgeben');
    raus.title = 'Alle Vorlagen als Text, zum Sichern oder Umziehen';
    raus.addEventListener('click', () => zeigeAustausch(panel));
    fuss.append(raus, el('div', 'igsn-hinweis', 'Standardnachrichten ' + VERSION));

    panel.append(kopf, liste, fuss);
  }

  function zeigeForm(panel, vorhanden) {
    panel.textContent = '';
    const form = el('div', 'igsn-form');

    const titel = el('input', 'igsn-feld');
    titel.placeholder = 'Kurzer Titel, z. B. „Ad-Codes erklären"';
    titel.value = vorhanden ? vorhanden.titel : '';

    const text = el('textarea', 'igsn-feld igsn-gross');
    text.placeholder = 'Der Nachrichtentext …';
    text.value = vorhanden ? vorhanden.text : '';

    form.append(titel, text);

    const fuss = el('div', 'igsn-fuss');
    const sichern = el('button', 'igsn-haupt', 'Sichern');
    sichern.addEventListener('click', () => {
      const eintrag = {
        id: vorhanden ? vorhanden.id : neueID(),
        titel: titel.value.trim(),
        text: text.value,
      };
      if (!eintrag.titel && !eintrag.text.trim()) { zeigeListe(panel, ''); return; }
      if (!eintrag.titel) eintrag.titel = eintrag.text.trim().split('\n')[0].slice(0, 40);
      vorlageSpeichern(eintrag);
      zeigeListe(panel, '');
    });
    const zurueck = el('button', 'igsn-zweit', 'Zurück');
    zurueck.addEventListener('click', () => zeigeListe(panel, ''));
    fuss.append(sichern, zurueck);

    if (vorhanden) {
      const weg = el('button', 'igsn-mini', 'Löschen');
      // Zweistufig, weil ein Fehlklick hier einen Text vernichtet, den du
      // vielleicht nur einmal geschrieben hast.
      let sicher = false;
      weg.addEventListener('click', () => {
        if (!sicher) { sicher = true; weg.textContent = 'Wirklich löschen?'; return; }
        vorlageLoeschen(vorhanden.id);
        zeigeListe(panel, '');
      });
      fuss.appendChild(weg);
    }

    panel.append(form, fuss);
    titel.focus();
  }

  // Ausgeben und Einlesen. Der Grund steht oben: Dieses Skript hat einen
  // eigenen Speicher, und beim Zusammenfuehren mit dem Postfach-Skript muessen
  // die Vorlagen mitkommen koennen.
  function zeigeAustausch(panel) {
    panel.textContent = '';
    const form = el('div', 'igsn-form');
    form.appendChild(el('div', 'igsn-hinweis',
      'Zum Sichern den Text kopieren. Zum Einlesen einen zuvor ausgegebenen Text '
      + 'hier einfügen und auf „Einlesen" klicken — vorhandene Vorlagen bleiben erhalten.'));
    const feld = el('textarea', 'igsn-feld igsn-gross');
    feld.value = JSON.stringify(vorlagen(), null, 2);
    form.appendChild(feld);

    const fuss = el('div', 'igsn-fuss');
    const rein = el('button', 'igsn-haupt', 'Einlesen');
    const meldung = el('div', 'igsn-hinweis', '');
    rein.addEventListener('click', () => {
      let roh;
      try { roh = JSON.parse(feld.value); } catch { meldung.textContent = 'Das ist kein gültiger Text.'; return; }
      if (!Array.isArray(roh)) { meldung.textContent = 'Erwartet wird eine Liste.'; return; }
      const liste = vorlagen();
      let neu = 0;
      for (const v of roh) {
        if (!v || typeof v !== 'object' || !String(v.text || '').trim()) continue;
        const id = String(v.id || neueID());
        const eintrag = { id, titel: String(v.titel || '').slice(0, 80), text: String(v.text) };
        const i = liste.findIndex((x) => x.id === id);
        if (i >= 0) liste[i] = eintrag; else { liste.push(eintrag); neu += 1; }
      }
      vorlagenSichern(liste);
      meldung.textContent = neu + ' neu, ' + (roh.length - neu) + ' aktualisiert.';
    });
    const zurueck = el('button', 'igsn-zweit', 'Zurück');
    zurueck.addEventListener('click', () => zeigeListe(panel, ''));
    fuss.append(rein, zurueck, meldung);

    panel.append(form, fuss);
  }

  // ---------- Knopf an der Verfassen-Zeile ----------

  function knopfSetzen() {
    const zeile = verfassenZeile();
    if (!zeile) return;
    if (zeile.querySelector('.igsn-knopf')) return;
    stil();
    const knopf = el('button', 'igsn-knopf');
    knopf.type = 'button';
    knopf.title = 'Standardnachrichten';
    knopf.setAttribute('aria-label', 'Standardnachrichten');
    knopf.textContent = '⚡︎ Vorlagen';
    knopf.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      panelOeffnen(knopf);
    });
    zeile.appendChild(knopf);
  }

  // Instagram baut die Verfassen-Zeile bei jedem Gespraechswechsel neu auf,
  // deshalb regelmaessig nachsetzen statt einmalig beim Laden.
  setInterval(knopfSetzen, 1500);
  knopfSetzen();

  // Zugang fuer die Pruefungen — und *nur* fuer die.
  //
  // Das Skript laeuft im Seitenkontext. Was hier an `window` haengt, kann
  // Instagrams eigenes JavaScript lesen; die Vorlagen sind zwar keine
  // Geheimnisse, aber sie gehen die Seite nichts an. Der Pruefstand setzt die
  // Marke vor dem Auswerten, im Browser ist sie nie gesetzt.
  if (typeof window !== 'undefined' && window.__IGSN_PRUEFSTAND__) {
    window.__igsn = {
      VERSION, vorlagen, vorlageSpeichern, vorlageLoeschen, suchen,
      einsetzen, knopfSetzen, verfassenZeile,
    };
  }
}());
