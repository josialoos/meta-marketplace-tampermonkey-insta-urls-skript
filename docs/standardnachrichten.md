# Standardnachrichten

Gespeicherte Antworten für das Instagram-Postfach: anlegen, suchen, mit einem
Klick ins Eingabefeld setzen. Nachbau dessen, was Meta in den
Partner-Nachrichten anbietet — Instagram selbst hat im Web nichts dergleichen.

**Dies ist ein eigenes Skript auf einem eigenen Branch.** Es läuft neben dem
Postfach-Skript, nicht an dessen Stelle.

## Einrichten

Zum Testen beide Skripte aktiviert lassen. Installieren über diese Adresse:

```
https://raw.githubusercontent.com/josialoos/meta-marketplace-tampermonkey-insta-urls-skript/standardnachrichten/standardnachrichten.user.js
```

Tampermonkey fängt `.user.js`-Adressen ab und zeigt eine Installationsseite.

Danach steht in jeder Unterhaltung rechts in der Verfassen-Zeile ein Knopf
**„⚡︎ Vorlagen"**. Sobald du zu tippen beginnst, weichen Instagrams Symbole
dem Senden-Knopf, und der Vorlagen-Knopf steht direkt daneben.

## Bedienen

| | |
|---|---|
| Knopf anklicken | Liste öffnet sich über der Verfassen-Zeile |
| Auf eine Vorlage klicken | Text landet an der Schreibmarke im Eingabefeld |
| Suchfeld | durchsucht Titel **und** Text |
| „Neu" | Titel und Text eingeben, „Sichern" |
| „Bearbeiten" | ändern oder löschen |
| Escape, oder Klick daneben | schließt die Liste |

Der Text wird **ergänzt, nicht ersetzt**: Wer schon halb getippt hat, behält
seinen Anfang. Abgeschickt wird nichts automatisch — du drückst Enter.

Ohne Titel wird die erste Zeile des Textes als Titel genommen. Löschen fragt
einmal nach.

## Der eigene Speicher, und warum das wichtig ist

Ein zweites Tampermonkey-Skript hat einen **eigenen** Speicher. Die Vorlagen
liegen hier, nicht beim Postfach-Skript. Wenn das Feature später dorthin
wandert, kommen sie **nicht** von selbst mit.

Dafür gibt es unten „Ausgeben": Es zeigt alle Vorlagen als Text. Kopieren,
beim neuen Skript einfügen, „Einlesen" — vorhandene bleiben dabei erhalten,
gleiche Kennungen werden aktualisiert. Taugt auch als Sicherung.

## Warum getrennt vom Postfach-Skript

Das Postfach-Skript ist gross und greift tief in Metas Oberfläche. Ein Fehler
hier soll den täglichen Betrieb dort nicht stören. Deshalb:

* eigener Branch, eigene Update-Adresse — das Hauptskript aktualisiert
  unabhängig davon weiter
* alles trägt das Präfix `igsn-`, nie `igfu-`
* angefasst wird **ausschließlich** die Verfassen-Zeile, nie eine Zeile der
  Unterhaltungsliste

Der letzte Punkt hat einen konkreten Grund: Das Postfach-Skript liest den Text
von Unterhaltungszeilen aus und hat dabei im Oktober 2026 schon einmal seine
eigene Beschriftung mitgelesen — aus einem Chip „Ungelesen" wurde Metas
Lesestatus. Eine Prüfung stellt sicher, dass dieses Skript nichts in die
Zeilen schreibt.

## Technisches

Der Text wird über ein **Einfüge-Ereignis** gesetzt. Instagram benutzt im
Nachrichtenfeld den Lexical-Editor; am 22.10.2026 am echten Feld gemessen:

| Weg | Ergebnis |
|---|---|
| `textContent = …` | steht da, verschwindet beim Absenden |
| `insertText` mit `\n` | Text kommt an, **Umbrüche fallen weg**, Zeilen kleben aneinander |
| `insertLineBreak` dazwischen | danach landet gar nichts mehr |
| Einfüge-Ereignis | Umbrüche bleiben erhalten ✓ |

Lexical verarbeitet das Ereignis **asynchron**: Direkt danach steht im Feld
noch der alte Stand. Wer dort sofort nachliest, hält den Weg fälschlich für
kaputt — genau darauf bin ich beim Messen erst hereingefallen.

Die Verfassen-Zeile wird vom Eingabefeld aus nach oben gesucht, bis ein
Vorfahr mindestens zwei Knöpfe trägt und **unter 120 Pixel hoch** ist. Ohne
die Höhenschranke landet man im ganzen Fensterbereich. Am 20.10.2026 gemessen:
die Zeile liegt zwei Ebenen über dem Feld und ist 44 Pixel hoch.

Instagram baut die Zeile bei jedem Gesprächswechsel neu auf, deshalb wird der
Knopf alle 1,5 Sekunden nachgesetzt statt einmalig beim Laden.

## Prüfungen

```bash
node tests/standardnachrichten.test.mjs
```

39 Prüfungen, eigener kleiner Prüfstand. Bewusst nicht der des
Postfach-Skripts — ein gemeinsamer würde die beiden wieder verkoppeln, die
hier absichtlich getrennt sind.
