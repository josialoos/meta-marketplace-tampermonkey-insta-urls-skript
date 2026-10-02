# Bedienung

Für alle, die mit dem Postfach und dem CRM arbeiten. Installation und Technik
stehen in [entwicklung.md](entwicklung.md).

---

## Was du im Postfach siehst

An jeder Unterhaltung hängt unten ein schmaler Streifen mit drei Knöpfen:

```
┌────────────────────────────────────────────────┐
│  🖼  Anna Musterfrau                    Mo     │
│      Du: Hey, schön dass du dabei bist …       │
│      [ Ungelesen ] [ Follow-up ] [ ongeboardet]│
└────────────────────────────────────────────────┘
                                         └ Status aus ClickUp,
                                           in der Farbe des Status
```

- **Ungelesen** — deine eigene Markierung, unabhängig von Metas Lesestatus
- **Follow-up** — hier willst du nachhaken. Legt beim ersten Mal einen Task in
  ClickUp an.
- **CRM-Pille** — zeigt den Status aus ClickUp. Ein Klick öffnet den Task.
  Steht dort `CRM +`, gibt es noch keinen Task.

Unten am Rand der Liste liegen zwei Schaltflächen:

```
[ ⟳ Aktualisieren ]        [ Ungelesen 1   Follow-ups 39 ]
                                        └ das ist der Knopf
                                          fürs Panel
```

Die rechte, farbige Pille ist nicht nur Anzeige — ein Klick öffnet das Panel
mit Einstellungen und weiteren Funktionen.

---

## Der Aktualisieren-Knopf

Das ist der Knopf für den Alltag. Beim Überfahren erklärt ein Tooltip, was er
tut. In Kürze:

1. Geht die Unterhaltungsliste durch — **nur so weit, bis er am letzten Lauf
   vorbei ist.** Normalerweise ein paar Zeilen, ein, zwei Sekunden.
2. Überträgt offene Änderungen nach ClickUp.
3. Fragt UpPromote ab und setzt `ongeboardet` beziehungsweise `hat sales`.
4. Trägt eingesammelten Content als `erster content` ein.

Der **allererste** Lauf nach der Installation geht einmal komplett durch und
dauert entsprechend.

Er erfasst Nachrichten **in beide Richtungen** — auch die, die du selbst
geschrieben hast, und auch Antworten vom Handy.

---

## Die Status-Pipeline

```
recherchiert → angeschrieben → kommunikation → zugesagt
     → ongeboardet → erste ware versendet → erster content → hat sales

     abgesagt     keine antwort     beendet
```

Die ersten acht sind eine Leiter, und **die Automatik schiebt nur nach vorn.**
Wer schon bei „hat sales" steht, wird nicht wieder auf „ongeboardet"
zurückgezogen.

Die drei rechten sind deine Entscheidung. **Sobald ein Task auf `abgesagt`,
`keine antwort` oder `beendet` steht, fasst das Skript ihn nicht mehr an** —
weder Status noch Priorität.

Was die Automatik setzt:

| Status | wird gesetzt, wenn |
|---|---|
| ongeboardet | der Affiliate in UpPromote aktiv ist |
| erste ware versendet | das Probierpaket in Shopify versendet wurde |
| erster content | mindestens ein Content vorliegt, auf den ihr Ads schalten könnt oder könntet |
| hat sales | in UpPromote eine Provision angefallen ist |

---

## Priorität „urgent"

Setzt sich von selbst: solange **das Gegenüber zuletzt geschrieben hat**, liegt
die Antwort bei dir, und der Task steht auf urgent. Sobald du geantwortet hast,
fällt die Markierung weg. Eine bloße Reaktion („… gefällt eine Nachricht")
zählt nicht.

**Nur bei Status `angeschrieben`.** Ziehst du einen Task weiter, übernimmst du
die Priorität selbst.

> Eine Einschränkung, die man kennen sollte: Setzt du bei einem Task im Status
> `angeschrieben` urgent aus einem anderen Grund von Hand, nimmt der nächste
> Lauf es wieder weg, sobald du zuletzt geschrieben hast.

---

## Content einsammeln

Der Status `erster content` kommt nicht von allein — Metas Inhalte-Seite muss
dafür offen gewesen sein.

1. Panel öffnen (die farbige Pille unten rechts)
2. **„Inhalte-Seite öffnen"** — öffnet einen neuen Tab, nach Datum sortiert und
   mit dem richtigen Konto
3. Dort so weit nach unten scrollen, wie du zurückschauen willst
4. Zurück ins Postfach, einmal **Aktualisieren**

Alles, was dabei sichtbar war, hat das Skript eingesammelt. Einmal erfasste
Profile musst du nicht erneut durchscrollen.

Gezählt wird Content, der **„Für Anzeige bereit"** ist *oder* auf **„Handeln
erforderlich"** steht. Das zweite heißt: der Creator hat euch markiert, die
Rechte fehlen noch — aber ihr könnt sie mit einem Klick anfragen. Oft die
dankbarste Gelegenheit zum Nachhaken.

---

## Die Nachfass-Frist

Sobald eine Warensendung erkannt wird, bekommt der Task automatisch ein
**Fälligkeitsdatum: Versanddatum plus 10 Wochentage.** Samstag und Sonntag
zählen nicht mit. Das ist die Deadline, bis zu der nachgehakt sein sollte.

Fällige Fristen siehst du ohne Umweg an der farbigen Pille unten rechts — dort
erscheint dann zusätzlich „N fällig".

Ein Fälligkeitsdatum, das du **selbst** gesetzt hast, bleibt unangetastet. Die
Automatik trägt nur dort ein, wo noch keines steht.

---

## Das Panel

| Knopf | Was er tut |
|---|---|
| Speichern | Token und Listen-ID übernehmen |
| UpPromote abgleichen | Nur den UpPromote-Teil, ohne Listendurchlauf |
| Inhalte-Seite öffnen | Metas Inhalte, datumssortiert, richtiges Konto |
| Ganze Liste durchgehen | Kompletter Durchlauf statt nur bis zum letzten Lauf |
| Token löschen | Trennt die ClickUp-Verbindung. Follow-ups bleiben lokal erhalten. |

„Ganze Liste durchgehen" brauchst du nach längerer Abwesenheit oder wenn etwas
fehlt. Im Alltag reicht der normale Knopf.

---

## Aktualisieren des Skripts

Das Skript aktualisiert sich selbst. Wenn es schneller gehen soll: die
Rohadresse aufrufen und die Installation bestätigen. Name und Namespace bleiben
gleich, Token und Markierungen überleben.

**Nicht löschen und neu installieren** — dabei geht der gesamte Speicher
verloren.

---

## Zwei Regeln für den Alltag

**Nur ein Rechner gleichzeitig im Postfach.** Laufen zwei Browser parallel,
legen beide Skripte Tasks an und es entstehen Dubletten.

**Jeder braucht eigene Zugangsdaten.** Ohne eigenen ClickUp-Token laufen alle
Einträge unter dem Namen dessen, dem der Token gehört.

---

## Wenn etwas nicht stimmt

**Gar keine Pillen und kein Knopf im Postfach**
Zuerst die **Versionsnummer** im Tampermonkey-Dashboard ansehen. Es gibt ein
zweites, zurückgestelltes Skript mit identischem Namen, das nichts anzeigt —
unterscheidbar nur an der Nummer. Steht dort eine ältere Version als die des
Kernskripts, die Rohadresse des Kernskripts aufrufen und neu bestätigen.

Hilft das nicht: in `chrome://extensions` unter Tampermonkey › Details prüfen,
ob **„Allow user scripts"** an ist und der Websitezugriff auf allen Websites
steht.

**Die Inhalte-Seite zeigt das falsche Konto**
Oben rechts auf das richtige Business umstellen. Wenn der Knopf im Panel das
falsche Konto öffnet, stand es auch im Postfach nicht in der Adresse — das
Skript sagt dann Bescheid.

**„Die Unterhaltungsliste wurde nicht gefunden"**
Meta hat die Seite umgebaut. Der Rest läuft weiter, nur das Durchgehen fällt
aus. Das Skript muss angepasst werden.

**Ein Task bekommt keinen Status**
Fast immer fehlt das Instagram-Handle im Task-Namen. Ohne Handle gibt es keinen
UpPromote-Treffer, ohne den keine E-Mail, ohne die keine Zuordnung zur
Warensendung. Format: `handle — Anzeigename`.

**Nach dem Aktualisieren steht „… Änderungen gehen noch raus"**
Normal. Die Warteschlange wird nach und nach abgearbeitet; beim nächsten Lauf
ist sie leer. Bleibt die Zahl stehen, stimmt etwas mit dem Token nicht.
