# Bedienung

Für alle, die mit dem Postfach und dem CRM arbeiten. Installation und Technik
stehen in [entwicklung.md](entwicklung.md).

---

## Wo gearbeitet wird

Seit Oktober 2026 auf **instagram.com/direct**. Dort wird gelesen, geschrieben und
erstangeschrieben, und dorthin zeigen die Links aus ClickUp.

Der Grund: Meta hat die Partner-Nachrichten in den Creator Marketing Hub
ausgelagert, und **der Hub kennt keinen Deep-Link** — weder auf eine Unterhaltung
noch auf eine Suche. Aus ClickUp heraus käme man dort nirgends gezielt hin.
instagram.com hat einen, seit Jahren unverändert:

```
https://www.instagram.com/direct/t/<id>/
```

| Oberfläche | Wofür noch |
|---|---|
| **instagram.com/direct** | Alles an Nachrichten |
| Creator Marketing Hub | Nur Recherche |
| Altes Postfach der Business Suite | Läuft weiter, wird nicht mehr gebraucht |

**Die alten Links funktionieren weiter.** Das Skript erkennt am Format, wohin ein
Link gehört: 39-stellige Kennungen stammen aus dem Postfach, kürzere von
Instagram. Beide Sorten können nebeneinander bestehen, bis die Altbestände
umgezogen sind.

Beim Update fragt Tampermonkey einmal nach, weil `instagram.com` als neue Domain
dazukommt.

---

## Das Wichtigste zuerst: das Skript liest nur, was auf dem Bildschirm steht

Es fragt bei Meta **nichts** ab. Es liest die Unterhaltungsliste, die gerade
angezeigt wird. Daraus folgt alles andere:

- Stehst du in den **Partner-Nachrichten**, sieht es ausschließlich
  Partner-Unterhaltungen. Normale Instagram-DMs sind dann gar nicht in der Liste,
  also kann es sie auch nicht verbinden und keine Frist daraus berechnen.
- Für normale DMs musst du in das **normale Instagram-Postfach** wechseln. Erst
  dort tauchen diese Unterhaltungen auf, bekommen Chips und werden mit ihren
  Tasks verbunden.
- Die Liste ist **virtualisiert**: Meta hält nur gut ein Dutzend Zeilen im
  Dokument. Was weiter unten liegt, sieht das Skript erst, wenn gescrollt wurde —
  dafür gibt es im Menü den vollen Durchlauf.

**Woran du erkennst, dass es greift:** Öffne das Panel über die Pille unten
rechts. Ganz oben steht eine Zeile wie

> Version 5.3 · 14 Unterhaltungen gerade im Dokument, 9 mit Task, 11 mit bekanntem
> Handle. — Letzter voller Durchlauf heute: 128 Unterhaltungen gesehen, 41 mit
> Task, 12 mit bekanntem Handle.

**Die beiden Hälften messen Verschiedenes, und das ist wichtig.** „Gerade im
Dokument" sind die gut ein Dutzend Zeilen, die Meta in diesem Moment geladen
hält — nach einem Durchlauf ist die Liste wieder oben, und die Zahl ist klein.
Was der Durchlauf **insgesamt** gesehen hat, steht in der zweiten Hälfte. Nur die
sagt etwas über den Bestand.

**Ganz vorn steht die installierte Version.** Stimmt sie nicht mit der im
Install-Link überein, hat Tampermonkey das Update nicht gezogen — dann ist jede
weitere Fehlersuche verschwendet. Ein Tab, der schon vor dem Update offen war,
zeigt übrigens den alten Stand; vor jeder Messung neu laden.

Darunter steht die Liste **„Unterhaltungen ohne Task"**: jede erkannte
Unterhaltung, die noch nicht mit ClickUp verbunden ist, mit dem Namen **so, wie
das Skript ihn liest**, und dahinter entweder ein Treffer oder „kein Treffer".
Damit siehst du auf einen Blick, ob die Namen bei Meta überhaupt zu euren
ClickUp-Namen passen — und musst nicht raten, warum eine Verbindung ausbleibt.

Die erste Zahl sagt, wie viele Instagram-Unterhaltungen das Skript gerade
erkennt. Steht dort stattdessen „Keine Instagram-Unterhaltung in dieser Liste
erkannt", bist du im falschen Postfach oder die Liste zeigt nur
Messenger-Unterhaltungen. Wechsel ins normale Instagram-Postfach und die Zahl
muss hochgehen.

---

## Welche Unterhaltungen erfasst werden

**Alle Instagram-Unterhaltungen** — sowohl Partner-Nachrichten als auch normale
Direktnachrichten. Das Skript behandelt beide gleich, für dich macht es keinen
Unterschied, in welcher Liste du stehst.

**Messenger und WhatsApp bleiben außen vor.** Die stehen im Hauptpostfach zwar
mit drin, bekommen aber keine Knöpfe.

Eine Besonderheit: Manche Leute haben **zwei** Unterhaltungen mit euch, eine
als Partner-Nachricht und eine als normale DM. Markierst du beide, entstehen
zwei Tasks für dieselbe Person. Das Skript sagt dir dann Bescheid — verhindern
tut es das nicht, weil es auch Fälle gibt, in denen zwei getrennte Gespräche
richtig sind.

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

Wer so erkannt wird, bekommt dauerhaft den Tag **`ad-code`**. Der bleibt
stehen, auch wenn der Task später auf „hat sales" weiterwandert — am Status
sieht man, wo jemand gerade steht, am Tag, dass es nutzbaren Content gibt.

Gezählt wird Content, der **„Für Anzeige bereit"** ist *oder* auf **„Handeln
erforderlich"** steht. Das zweite heißt: der Creator hat euch markiert, die
Rechte fehlen noch — aber ihr könnt sie mit einem Klick anfragen. Oft die
dankbarste Gelegenheit zum Nachhaken.

---

## Wenn der Handle fehlt

Ohne Instagram-Handle ist ein Task für jede Automatik unsichtbar. Deshalb geht
das Skript ihm beim Anlegen hinterher:

1. Es **öffnet die Unterhaltung** und liest den Handle aus der Kontaktkarte.
   Meistens reicht das, und du merkst nichts davon außer dass die Unterhaltung
   aufgeht.
2. Gibt die Karte nichts her, fragt ein kleiner Kasten nach. Du kannst ihn mit
   **„Später nachtragen"** wegklicken — der Task wird trotzdem angelegt.
3. Alles, was offen bleibt, sammelt sich im Panel unter **„Handles nachtragen"**,
   mit Eingabefeld pro Eintrag. An der Pille unten rechts steht dann
   „N ohne Handle".

Der Task entsteht also immer. Nichts wird blockiert — eine Markierung, die es
nicht nach ClickUp schafft, wäre für Cosima unsichtbar, und das wäre schlimmer
als ein Task ohne Handle.

**Instagram wird nicht automatisch durchsucht.** Der Knopf öffnet nur einen
Tab; das Suchen bleibt Handarbeit. Automatische Suchläufe über euren Account
bergen das Risiko einer Sperre.

---

## Karteileichen stilllegen

Manche Datensätze willst du nicht mehr sehen, aber auch nicht löschen: ein alter
Account von jemandem, der inzwischen einen neuen hat, ein Testkonto, eine
Dopplung, die in UpPromote wirklich zweimal existiert.

**Löschen bringt nichts** — beim nächsten Import ist der Eintrag wieder da, weil
der Import anhand von Handle und Mailadresse prüft, was schon vorhanden ist.

Häng solchen Tasks stattdessen den Tag **`karteileiche`** an. Dann lässt das
Skript sie komplett in Ruhe: kein Status, keine Frist, keine Priorität, kein
`handle-fehlt`, und sie tauchen auch nicht mehr unter „Handles nachtragen" auf.
Nur beim Import zählen sie weiter mit — und genau deshalb kommt der Eintrag
nicht wieder.

Schreib in die Beschreibung dazu, **warum** der Task stillgelegt ist. Das Skript
überschreibt deine Notizen nicht, es ergänzt nur.

### Abgeschlossen: der Tag `ignore`

`ignore` hängt an Profilen, mit denen wir fertig sind — aus welchem Grund auch
immer wird dort kein positives Ergebnis mehr erwartet.

Der Tag ist eine Notiz für euch, **kein Schalter**: das Skript kennt ihn nicht
und zieht Status, Frist und Priorität dort weiter mit. Soll ein Task wirklich
nicht mehr angefasst werden, braucht er zusätzlich `karteileiche` oder einen der
Endstatus `abgesagt`, `keine antwort`, `beendet`.

---

## Tasks ohne Unterhaltung verbinden

Im Panel steht unter den erkannten Unterhaltungen der Abschnitt **„Tasks ohne
Unterhaltung"** mit einer Zahl. Das sind Datensätze, zu denen es in ClickUp
alles gibt — Handle, Status, Frist — nur keine verknüpfte Unterhaltung.

Zwei Gründe gibt es dafür:

1. **Mit dem Affiliate wurde nie über Instagram geschrieben.** Der Normalfall bei
   allem, was aus UpPromote kam. Da ist nichts zu verbinden, solange du nicht
   schreibst.
2. **Das Skript findet die Zuordnung nicht.** Im normalen Postfach nennt der
   Vorschautext nie den Handle, und der Anzeigename trägt meist nur den Vornamen
   plus Beiwerk. „Thorsten | Laufen & Trailrunning" gegen
   „lauf\_bulti\_lauf — Thorsten Bulthaup" ist nicht zu erraten — zumal es zwei
   Thorstens im CRM gibt. Raten wäre hier schlimmer als nichts zu tun.

**So verbindest du von Hand:** Panel öffnen, im Abschnitt **„Unterhaltungen ohne
Task"** steht unter jeder Unterhaltung eine Auswahlliste **„Mit Task
verbinden …"**. Den richtigen Task auswählen — fertig.

Die Auswahl hängt bewusst an der Unterhaltung und nicht an „der gerade
geöffneten". Deren Kennung schreibt Meta nämlich nur dann in die Adresse, wenn
man über einen Deep-Link gekommen ist; beim bloßen Anklicken einer Zeile nicht.

**Die CRM-Pille ist hier der falsche Knopf**, wenn der Kontakt schon in ClickUp
steht: sie legt einen Task an. Sie fragt zwar vorher nach dem Handle und hängt
die Unterhaltung an den vorhandenen Task, wenn der Handle passt — findet sie
keinen, entsteht ein zweiter Datensatz.

Danach läuft alles Weitere von selbst: Status, Frist und Markierungen hängen an
dem Task, und **die Bild-ID des Profilfotos wird dabei gelernt**. Taucht dieselbe
Person später in einer zweiten Unterhaltung auf, findet das Skript sie daran
wieder — ohne Handle, ohne Namensvergleich, ohne dich.

---

## Die Nachfass-Frist

Jeder Task bekommt automatisch ein **Fälligkeitsdatum** — deine Deadline, bis zu
der nachgehakt sein sollte. Es gelten zwei Regeln, und es gilt immer die
**spätere**:

- **14 Tage** nach der letzten Nachricht oder Reaktion des Creators
- **10 Wochentage** nach dem Versand der Warenprobe, falls eine raus ist

Wochenenden zählen bei den Wochentagen nicht mit. Schreibt ein Creator wieder,
rückt die Frist entsprechend nach hinten — die Uhr beginnt von vorn.

Fällige Fristen siehst du ohne Umweg an der farbigen Pille unten rechts, dort
erscheint dann zusätzlich „N fällig".

Ein Fälligkeitsdatum, das du **selbst** im Panel einträgst, überschreibt die
Automatik nicht von sich aus.

**Importierte Kontakte bekommen ihre Frist, sobald eine Unterhaltung da ist.**
Direkt nach dem Import haben sie keine, weil es kein Datum gibt, von dem aus
gerechnet werden könnte. Das Skript verbindet sie aber selbständig mit der
passenden Unterhaltung im Postfach, sobald es eine sieht — über den Handle, und
wenn der nirgends auftaucht, über den Anzeigenamen. Danach läuft die Frist wie
bei allen anderen.

### Fehlende Fristen nachtragen

Im Menü unter ClickUp liegt **„Fehlende Fristen nachtragen"**. Der Knopf versorgt
jeden Task, der noch **keine** Fälligkeit hat — nach Status:

| Status | Frist |
|---|---|
| ab `erste ware versendet` | Versanddatum + 10 Wochentage |
| `ongeboardet` | Onboarding-Datum aus UpPromote + 14 Tage |
| darunter | letzte Nachricht + 14 Tage |

**Tasks, die schon eine Frist haben, werden nicht angefasst** — auch nicht
„nur korrigiert". Deshalb kannst du den Knopf gefahrlos mehrfach drücken.

Außen vor bleiben die Endstatus `abgesagt`, `keine antwort`, `beendet` und alles
mit `karteileiche`. Dort nachzufassen hat keinen Zweck.

Findet sich kein brauchbares Datum — kein Versand, kein Onboarding-Datum bei
UpPromote, keine Nachricht —, bleibt der Task ohne Frist. Die Meldung am Ende
sagt, wie viele das betrifft.

Zwei Fälle bleiben ohne Frist, und zwar bewusst: wenn der Anzeigename bei Meta
ein anderer ist als der Name in UpPromote, und wenn zwei Tasks denselben Namen
tragen. Im zweiten Fall wäre jede Zuordnung geraten.

---

## Das Panel

| Knopf | Was er tut |
|---|---|
| Speichern | Token und Listen-ID übernehmen |
| UpPromote abgleichen | Nur den UpPromote-Teil, ohne Listendurchlauf |
| Inhalte-Seite öffnen | Metas Inhalte, datumssortiert, richtiges Konto |
| Affiliates importieren | Legt aktive Affiliates aus UpPromote als Tasks an. **Erster Klick zählt nur**, zweiter legt an. |
| Ganze Liste durchgehen | Kompletter Durchlauf statt nur bis zum letzten Lauf |
| Token löschen | Trennt die ClickUp-Verbindung. Follow-ups bleiben lokal erhalten. |

„Ganze Liste durchgehen" brauchst du nach längerer Abwesenheit oder wenn etwas
fehlt. Im Alltag reicht der normale Knopf.

---

## Notizen aus UpPromote

Was in UpPromote am Affiliat-Profil als Notiz steht, landet beim Abgleich
automatisch als **Kommentar** am ClickUp-Task — getrennt danach, ob ihr es
notiert habt oder der Affiliate selbst.

Jede Notiz kommt nur **einmal**. Änderst du sie in UpPromote, kommt ein neuer
Kommentar dazu, der alte bleibt als Verlauf stehen.

Beim ersten Abgleich nach dem Update kommen alle vorhandenen Notizen auf
einmal rüber.

---

## Affiliates aus UpPromote holen

Der Knopf **„Affiliates importieren"** im Panel legt alle aktiven Affiliates
des Programms an, die noch nicht im CRM sind.

**Der erste Klick legt nichts an**, er zählt nur und sagt dir, wie viele neu
wären. Erst der zweite legt an.

Wichtig vorher: Tasks, denen der Handle fehlt, kann der Import nicht
wiedererkennen und legt sie doppelt an. Also erst die Liste „Handles
nachtragen" abarbeiten.

**Nicht jeder bekommt einen Unterhaltungs-Link.** Viele Affiliates wurden nie
über das Partner-Postfach angeworben — dann gibt es keine Unterhaltung, und
der Link kann nicht erfunden werden. Schreibst du später doch jemanden an,
verbindet das Skript Unterhaltung und Task beim nächsten Durchlauf von selbst.

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
Fast immer fehlt das Instagram-Handle. Ohne Handle gibt es keinen
UpPromote-Treffer, ohne den keine E-Mail, ohne die keine Zuordnung zur
Warensendung — und auch keinen Content und keine Frist.

Solche Tasks tragen in ClickUp den roten Tag **`handle-fehlt`**. Danach filtern,
Handle ergänzen, fertig: Format `handle — Anzeigename` im Titel. Beim nächsten
Aktualisieren verschwindet der Tag von selbst, und das Skript schreibt den
Handle zusätzlich als Zeile `igfu-handle:` in die Beschreibung — die ist dann
die maßgebliche Stelle, eine spätere Umbenennung schadet nicht mehr.

**Nach dem Aktualisieren steht „… Änderungen gehen noch raus"**
Normal. Die Warteschlange wird nach und nach abgearbeitet; beim nächsten Lauf
ist sie leer. Bleibt die Zahl stehen, stimmt etwas mit dem Token nicht.
