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

### Der Umzug der Altbestände

Die Tasks aus der Zeit vor dem Umzug verlinken noch in die Business Suite. Im
Panel steht dafür der Abschnitt **„Noch am alten Postfach (N)"** mit der Liste.

**Das meiste erledigt sich von selbst.** Taucht die Unterhaltung bei einem
Durchlauf auf instagram.com auf und lässt sie sich zuordnen — über den Handle,
den Instagram oft als Zeilentitel zeigt, sonst über den Namen —, kommt der
Instagram-Link dazu und der Task verschwindet aus der Liste. Die alte Kennung
bleibt stehen; der alte Link funktioniert also weiter, solange es das Postfach
gibt.

Am schnellsten geht es mit **„Ganze Liste durchgehen"** auf instagram.com. Was
danach übrig bleibt, verbindest du unten über **„Tasks ohne Unterhaltung"** von
Hand.

**Der Durchlauf hört von selbst auf.** In deinen Instagram-Nachrichten liegen
tausende private Unterhaltungen, die mit dem CRM nichts zu tun haben. Kommen
150 am Stück, zu denen es keinen Task gibt, ist die Liste erschöpft und der Lauf
endet — die Meldung sagt dann „Schluss: 150 Unterhaltungen am Stück ohne Task".
Eine harte Obergrenze von 2000 gibt es zusätzlich.

**Abbrechen geht jederzeit:** Während des Laufs heißt der Knopf
„… — abbrechen". Ein Klick stoppt ihn, und was bis dahin gefunden wurde, bleibt
erhalten.

**Die alten Links funktionieren weiter.** Woher eine Kennung stammt, steht in
ihrer **Markerzeile** — `igfu-ig` für Instagram, `igfu-thread` für das alte
Postfach. Beide Sorten können nebeneinander im selben Datensatz stehen, bis die
Altbestände umgezogen sind.

> An der **Länge** ist das nicht zu erkennen, auch wenn es eine Zeit lang so im
> Skript stand. Am 10.11.2026 nachgemessen: normale DMs mit 15 und mit 17
> Stellen, eine Partner-Kennung mit 16, eine aus dem alten Postfach mit 39.

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
│      [ Follow-up ] [ ongeboardet ]             │
└────────────────────────────────────────────────┘
                                         └ Status aus ClickUp,
                                           in der Farbe des Status
```

- **Follow-up** — hier willst du nachhaken. Legt beim ersten Mal einen Task in
  ClickUp an.
- **CRM-Pille** — zeigt den Status aus ClickUp. Ein Klick öffnet den Task.
  Steht dort `CRM +`, gibt es noch keinen Task.

Unten am Rand der Liste liegen zwei Schaltflächen:

```
[ ⟳ Aktualisieren ]        [ Follow-ups 39   24 fällig ]
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

     abgesagt     ignore     keine antwort     beendet
```

Die ersten acht sind eine Leiter, und **die Automatik schiebt nur nach vorn.**
Wer schon bei „hat sales" steht, wird nicht wieder auf „ongeboardet"
zurückgezogen.

Die vier rechten sind deine Entscheidung. **Sobald ein Task auf `abgesagt`,
`ignore`, `keine antwort` oder `beendet` steht, ändert keine Automatik seinen
Status mehr** — kein UpPromote-Abgleich, kein Content-Lauf, kein Verknüpfen,
auch keine Automatik, die später dazukommt. Herausholen kannst nur du, von
Hand: im Statusmenü der Kopfleiste oder direkt in ClickUp.

Das gilt seit 13.11.2026 ohne Wenn und Aber. Vorher hat das Skript dafür in
seinen eigenen Zwischenspeicher geschaut, und der war manchmal Stunden alt:
hattest du einen Task gerade auf `ignore` gestellt, stand dort noch die alte
Stufe, und die nächste Automatik hob ihn wieder heraus. Jetzt fragt es
unmittelbar vor dem Schreiben bei ClickUp nach, wo der Task **wirklich** steht.
Hat jemand ihn in der Zwischenzeit einsortiert, bleibt er liegen, und die
Meldung sagt es dir: „… 2 Endstatus unangetastet …".

Dieselbe Nachfrage schützt auch die Leiter: schiebst du einen Task von Hand
nach vorn, während ein Abgleich läuft, zieht der ihn nicht mehr zurück. In der
Meldung steht dann „… 1 stand schon weiter …".

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

### Mögliche Dubletten

Das Skript legt für eine Person nur einen Task an. Trotzdem sind zweimal zwei
Datensätze entstanden — einmal, weil zwei Abläufe gleichzeitig losgelaufen sind,
einmal, weil der lokale Stand den schon vorhandenen Task nicht kannte. Seit
Version 9.0 ist beides abgedichtet.

Für den Altbestand steht im Panel der Abschnitt **„Mögliche Dubletten"**. Dort
landet jedes Paar, das sich eine Unterhaltung oder einen Handle teilt, mit einem
Link auf beide Tasks. Vorher sah man so ein Paar gar nicht: das Skript musste
sich beim Einlesen für einen der beiden entscheiden, und der andere war danach
unsichtbar.

Das Skript **legt nichts zusammen und löscht nichts**. Entscheide, welcher Task
bleibt, trag seine Nummer in die Beschreibung des anderen ein und häng dem
anderen den Tag `karteileiche` an. Gelöscht kommt er beim nächsten Import
zurück.

Karteileichen zählen in dem Abschnitt nicht mit — eine bewusst stillgelegte
Dopplung soll dort nicht jeden Tag wieder auftauchen.

**Seit Version 9.4 reicht der Tag allein.** Vorher musste aus der Beschreibung
der Karteileiche auch die Zeile mit der Unterhaltungs-Kennung und die mit der
Bild-ID heraus — sonst zog die stillgelegte Dublette die Unterhaltung an sich,
und die Person fiel still aus dem CRM, obwohl ihr richtiger Task daneben stand.
Das Skript übergeht die Leiche jetzt auch dann, wenn die Zeilen stehen bleiben.
Rausnehmen schadet nicht, nötig ist es nicht mehr. Handle und Mailadresse
bleiben ohnehin drin, die braucht der Import.

### Falsch verbundene Unterhaltungen finden

Name und Markerzeile eines Tasks halten sich seit 9.2 und 9.5 gegenseitig
gerade. Die **Verbindung zwischen Unterhaltung und Task** tut das nicht. Sie
entsteht einmal — beim Anlegen, beim Verbinden, über die Bild-ID oder die
Benutzer-ID — und danach korrigiert sie niemand mehr. Hängt eine Unterhaltung
am falschen Task, bleibt das so, bis du es von Hand löst. Der Task trägt dann
die UpPromote-Daten der einen und die Unterhaltung der anderen Person, und
jede Automatik darauf arbeitet still an der falschen Person.

Dreimal belegt:

* `limit_dani` (𝓓𝓪𝓷𝓲𝓮𝓵𝓪) hing an **„livingwithcrazydogs — Michelle Mehnen"**.
  Am 13.11.2026 getrennt, Daniela hat jetzt einen eigenen Task.
* `tina_gerhard_on_bike` hängt an **Biancas** Task. Am 13.11.2026 noch offen.
* `branded_content_ad`, Instagrams System-Konto, hing an **Opel**. Am
  11.11.2026 entfernt.

Im Menü unter ClickUp liegt dafür **„Falsch verbundene Unterhaltungen
finden"**. Der Knopf **liest nur**: er benennt nichts um, hängt nichts ab,
setzt keinen Tag und schreibt überhaupt nichts nach ClickUp. Er sucht und
listet, entschieden wird von Hand.

Verglichen werden zwei Dinge:

* **Die Benutzer-ID.** Steht an einem Task `igfu-iguser` und hat die
  Unterhaltung, die daran hängt, eine andere, sind es zwei Personen. Das ist
  der verlässlichste Befund hier: die ID kommt aus den Daten der Zeile, nie
  aus gelesenem Text, und sie ist in beiden Postfächern dieselbe.
* **Der Handle.** Der Handle der Unterhaltung gegen die Markerzeile des Tasks.
  Dabei zählt, **woher** der Handle der Unterhaltung kommt: aus der
  Kontaktkarte, aus der Meta-API oder von deiner Eingabe zählt er. Nur aus dem
  Vorschautext oder dem Zeilentitel geraten zählt er nicht — „flo" sieht aus
  wie ein Handle und ist der Anzeigename von flo.auf.zeit. Sonst stünde hier
  ein Fehlalarm je Vorname.

  Ein geratener Handle zählt aber doch, wenn er in ClickUp als Markerzeile
  eines **anderen** Tasks steht. Dann ist er nicht geraten, sondern belegt.
  Genau so taucht `tina_gerhard_on_bike` auf: ihr Handle steht auf
  instagram.com nur im Zeilentitel.

Dazu meldet der Lauf, wenn **zwei Tasks dieselbe Benutzer-ID** tragen. Dann
ist entweder einer eine Dublette oder einer hängt an der falschen Person. Der
Abschnitt „Mögliche Dubletten" findet das nicht, der schaut nur auf
Unterhaltung und Handle.

Die Befunde stehen im Panel unter **„Unterhaltung passt nicht zum Task"**, mit
einem Link auf den Task und einem auf die Unterhaltung. Dort gibt es
**absichtlich keinen Knopf, der etwas richtet**: bei Daniela musste die
Unterhaltung weg und an einen neuen Task, bei `branded_content_ad` musste sie
nur weg. Ein „Reparieren" hätte in beiden Fällen das Falsche getan.

Zwei Dinge wertet der Lauf bewusst nicht:

* **Die Bild-ID.** Sie wechselt, sobald jemand sein Profilfoto ändert, und das
  tun Creator oft. Eine Abweichung dort heißt „neues Foto", nicht „falsche
  Person".
* **Fehlendes.** Kennt das Skript zu einer Unterhaltung weder Handle noch
  Benutzer-ID, ist das kein Befund. Es weiß nur, was die Liste ihm gezeigt
  hat — Abwesenheit beweist dort nichts.

Karteileichen bleiben außen vor, und ihr Handle belegt auch nichts.

### Abgeschlossen: der Tag `ignore`

`ignore` hängt an Profilen, mit denen wir fertig sind — aus welchem Grund auch
immer wird dort kein positives Ergebnis mehr erwartet.

Der Tag ist eine Notiz für euch, **kein Schalter**: das Skript kennt ihn nicht
und zieht Status, Frist und Priorität dort weiter mit. Soll ein Task wirklich
nicht mehr angefasst werden, braucht er zusätzlich `karteileiche` oder einen der
Endstatus.

**Nicht verwechseln:** den **Status** `ignore` beachtet das Skript, den
gleichnamigen **Tag** nicht. Wer in der Liste auf dem Status `ignore` steht, ist
für jede Automatik tabu — wer nur den Tag trägt, nicht.

### Anschreib-Links

**Zum Anschreiben brauchst du keine Unterhaltung.** Instagrams Kurzformat
`ig.me/m/<handle>` öffnet den Chat mit einer Person allein über den Handle — und
den hat fast jeder Task.

Der Menüpunkt **„Anschreib-Links nachtragen"** setzt bei jedem Task mit Handle
die Zeile **„Auf Instagram anschreiben"** ganz nach oben. Unabhängig davon, ob
die Unterhaltung je zugeordnet wurde.

Wo schon ein Link auf eine konkrete Unterhaltung steht, bleibt es dabei: der
öffnet den **Verlauf**, `ig.me` nur den Chat. Neue Tasks bekommen den Link
automatisch mit.

Außen vor bleiben Tasks ohne Handle und die Endstatus.

### Namen richtigstellen

Zwei Fehler haben bis Version 6.8 kaputte Task-Namen erzeugt, und die bleiben
stehen, bis man sie aufräumt:

- **„beispiel.stkl — Beispiel PersonYou: Hi Beispiel,"** — Instagram rendert zeitweise
  Name und Vorschau in einem Textknoten, und die Vorschau rutschte in den Namen.
- **„https — <Anzeigename>"** — die Vorschau begann mit einer Adresse, und daraus wurde
  der „Handle" `https`.

Dazu kam am 10.11.2026 ein dritter Fehler:

- **Ein fremder Handle im Namen, während die Markerzeile stimmt.** Eine
  Automatik hat ihn aus dem Browser-Speicher gesetzt, nachdem der Handle beim
  Wechsel der Unterhaltung an der falschen Kennung gelandet war. Betroffen
  waren zwei Datensätze; die Markerzeile blieb in beiden Fällen richtig.

Und am 11.11.2026 ein vierter, der anders funktioniert als die drei darüber:

- **Ein Handle mit umschließenden Unterstrichen verlor sie.** `_deneazy_` stand
  in der Markerzeile richtig, aber ClickUp liest `_…_` als Kursivschrift und
  gab beim Auslesen `deneazy` zurück. Das Skript lernte den verstümmelten
  Handle, fand die Unterhaltung nicht mehr — und baute daraus auch noch einen
  Anschreib-Link ins Leere. Unterstriche **mitten** im Handle sind harmlos;
  betroffen sind nur führende und schließende.

> Seit 9.5 liest das Skript die Markdown-Fassung zuerst und schreibt
> Unterstriche escaped. Datensätze, deren Markerzeile noch heil ist, erholen
> sich damit von allein. War der Handle schon in der Markerzeile selbst
> beschädigt, muss er einmal von Hand zurückgesetzt werden — in dem Fall weiß
> niemand mehr, wo die Unterstriche standen.

Und ein fünfter, der nichts mit Namen zu tun hat, sondern mit dem Ordner:

- **Im Partner-Ordner geöffnete Unterhaltungen wurden gar nicht gesehen.** Der
  Partner-Ordner hat eine eigene Adresse (`/direct/partnerships/t/…`), und das
  Skript kannte nur die normale. Folge: keine Pillen im Kopf, keine
  ClickUp-Karte — und der **Handle wurde dort nie aus der Kontaktkarte
  gelesen**. Partner bekamen nur, was Titel und Vorschau hergaben. Das erklärt
  einen Teil der Tasks unter „Handles nachtragen".
- **Die geschriebenen Links zeigten immer in das normale Postfach**, auch bei
  Partner-Unterhaltungen. Seit 9.5 fragt das Skript das Postfach, bevor es den
  Link baut. Ist es auf diesem Rechner noch nicht bekannt, bleibt es bei der
  normalen Adresse — die öffnet die Unterhaltung auch, nur im anderen Ordner.

Der Menüpunkt **„Namen richtigstellen"** schneidet den Vorschautext heraus,
entfernt falsche Handles — auch aus der Beschreibung — und **setzt einen Namen,
der der Markerzeile widerspricht, auf die Markerzeile zurück**. Die Tasks mit
einem entfernten Handle landen danach in **„Handles nachtragen"**, weil der
echte Handle unbekannt ist. Ein erfundener wäre schlimmer als keiner.

Ein **fehlender** Handle im Namen wird dabei nicht ergänzt. Das ist kein
Schaden, und ein Klick würde sonst die halbe Liste umbenennen.

> Die Ursache ist seit 9.2 behoben: der Name folgt jetzt der Markerzeile, nicht
> dem Browser-Speicher. Beschädigte Namen heilen deshalb auch von allein,
> sobald die Unterhaltung in der Liste auftaucht — der Knopf ist für die Fälle
> da, deren Unterhaltung du nicht mehr aufmachst, und für Datensätze ohne
> Unterhaltung.

### Alte Links aufräumen

Nach dem Umzug stehen in vielen Beschreibungen beide Links. Der Menüpunkt
**„Alte Postfach-Links entfernen"** nimmt den alten heraus — aber **nur dort, wo
der Instagram-Link schon drinsteht**. Ein Task ohne neuen Link behält seinen
alten, sonst bliebe er ganz ohne Verlinkung.

Entfernt werden der Link ins alte Postfach, die von Hand eingefügte Zeile
„Link zu Nachrichten: …" und die alte Markerzeile. Die Profilzeile
„Instagram: @handle" bleibt, und der Instagram-Link rückt nach oben.

---

## Nur ungelesene anzeigen

Instagram selbst hat keinen Filter dafür. Unten links, über dem
Aktualisieren-Knopf, liegt deshalb **„Nur ungelesene"**. Ein Klick blendet alle
gelesenen Unterhaltungen aus; der Knopf zeigt dann ein Häkchen. Die Einstellung
bleibt über das Neuladen hinweg erhalten.

Den Knopf gibt es nur auf instagram.com — nur dort steht der Lesestatus an jeder
Zeile.

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
   „lauf\_bolti\_lauf — Torsten Bolthaup" ist nicht zu erraten — zumal es zwei
   Thorstens im CRM gibt. Raten wäre hier schlimmer als nichts zu tun.

**Vorschläge.** Stimmt der Name überein, ist er aber zu kurz für eine
automatische Zuordnung — „Anja", „Lena", „mel" —, steht im Panel
**„Vorschlag: …"** mit einem Knopf **„Übernehmen"**. Ein Klick statt einer Suche
durch die ganze Liste.

Automatisch verbunden wird so etwas nicht: In tausenden privaten Chats sitzt
garantiert noch eine Anja, und ein falsch verknüpfter Creator ist schlimmer als
ein unverknüpfter.

**Handles gegen UpPromote prüfen.** Ein Handle kann aus dem Vorschautext oder dem
Zeilentitel stammen, und beides kann danebenliegen. UpPromote kennt ihn dagegen
als Tatsache. Der Menüpunkt vergleicht beides — zugeordnet über die Mailadresse,
nicht über den Handle — und listet die Abweichungen im Panel. **Geändert wird
nichts:** hast du einen Handle von Hand korrigiert, ist UpPromote veraltet, nicht
dein Task.

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

Außen vor bleiben die Endstatus `abgesagt`, `ignore`, `keine antwort`, `beendet`
und alles mit `karteileiche`. Dort nachzufassen hat keinen Zweck.

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
| Affiliates importieren | Legt aktive Affiliates aus UpPromote als Tasks an, aus dem Affiliate- **und** dem Ambassador-Programm. **Erster Klick zählt nur**, zweiter legt an. |
| Falsch verbundene Unterhaltungen finden | Sucht Tasks, an denen die Unterhaltung einer anderen Person hängt. Liest nur, ändert nichts — siehe oben. |
| Ganze Liste durchgehen | Kompletter Durchlauf statt nur bis zum letzten Lauf |
| Token löschen | Trennt die ClickUp-Verbindung. Follow-ups bleiben lokal erhalten. |

„Ganze Liste durchgehen" brauchst du nach längerer Abwesenheit oder wenn etwas
fehlt. Im Alltag reicht der normale Knopf.

**Unten im Panel steht eine Standzeile.** Sie sagt, was verbunden ist, wie viele
Änderungen noch auf Übertragung warten — und wie viele **aktive Affiliates noch
keinen Task haben**, mit dem Datum der Messung. Ist die Zahl älter als zwölf
Stunden, zählt das Skript beim Öffnen des Panels im Hintergrund nach; es legt
dabei nichts an.

> Warum die Zahl dort steht: der Import kann sie nur nennen, wenn jemand ihn
> anstößt — und das tat ein halbes Jahr niemand, während 20 aktive Affiliates
> außerhalb des CRM lagen. Aufgefallen ist es erst, als eine davon sich selbst
> gemeldet hat.

Daneben steht seit 9.7 die Gegenrichtung: **wie viele Tasks weder Handle noch
Mailadresse tragen** und deshalb beim Zuordnen unsichtbar sind. Diese Zahl
braucht keinen Zähllauf — sie steht im gespiegelten Task-Stand — und sie
erklärt, warum die Lücke darüber zu groß aussehen kann: jeder dieser Tasks kann
einen der angeblich fehlenden Affiliates in Wahrheit schon abdecken.

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
an, die noch nicht im CRM sind.

**Gelesen werden zwei Programme:**

| Programm | kommt ins CRM | Tag |
|---|---|---|
| TZAMPAS Affiliate Programm | ja | — |
| Ambassador Programm | ja | `ambassador`, automatisch |
| TZAMPAS Brand-Kooperation | **nein** | |
| September-Aktion 2026 | **nein** | |

Wer im Ambassador-Programm liegt, bekommt den Tag `ambassador` ohne Zutun —
beim Import und, für die schon vorhandenen Datensätze, beim nächsten
**„UpPromote abgleichen"**. Entfernt wird er nie; nimmst du ihn von Hand ab,
setzt ihn der nächste Abgleich wieder. Von Hand **setzen** kannst du ihn
weiterhin, etwa für Ambassadore, die gar nicht bei UpPromote stehen.

**Der erste Klick legt nichts an**, er zählt nur und sagt dir, wie viele neu
wären. Erst der zweite legt an.

Die Zählung nennt **jedes Programm mit Namen und Zahl**, auch die
übersprungenen. Steht dort plötzlich „0 aus „Ambassador Programm"", ist das
Programm in UpPromote umbenannt worden — dann stimmt die Liste im Skript nicht
mehr, und sie muss nachgezogen werden. Ohne diese Zahlen fiele das nicht auf:
der Import würde brav „0 neu" melden.

Wichtig vorher: Tasks, denen der Handle fehlt, kann der Import nicht
wiedererkennen und legt sie doppelt an. Also erst die Liste „Handles
nachtragen" abarbeiten.

**Das gilt auch für Endstatus.** Zugeordnet wird über Handle und Mailadresse —
der Status spielt dabei keine Rolle. Ein Task auf `ignore` mit Handle oder
Mailadresse gilt als vergeben und bleibt in Ruhe. Fehlt ihm **beides**, kann
der Import ihn nicht erkennen und legt die Person als neuen Task an, mit
`ongeboardet` oder `hat sales`. Das ist kein Herausholen — der alte Task steht
unverändert auf `ignore` —, es sieht in ClickUp aber genauso aus. (Nachgemessen
am 13.11.2026.)

**Der Tag `karteileiche` allein hilft dagegen nicht.** Auch eine Leiche hält
den Affiliate nur zurück, wenn sie einen Handle oder eine Mailadresse trägt —
der Import liest beide Felder, nicht den Tag. Das einzige Gegenmittel ist also,
**Handle oder Mailadresse im Task nachzutragen**.

**Seit 9.7 sagt die Vorschau es dir.** Der erste Klick auf „Affiliates
importieren" nennt zusätzlich, wie viele Tasks im CRM weder Handle noch
Mailadresse tragen und deshalb beim Zuordnen unsichtbar sind — und wie viele
davon auf einem Endstatus stehen oder `karteileiche` sind. Die erste Gruppe
findest du unter „Handles nachtragen", die zweite unter dem neuen Abschnitt
**„Weder Handle noch Mail"** ganz oben im Panel.

**Der Abschnitt „Weder Handle noch Mail"** steht direkt unter „Handles
nachtragen" und listet genau die Tasks, die sonst nirgends auftauchen: „Handles
nachtragen" lässt Endstatus und Karteileichen bewusst aus, weil dort der Handle
für die Arbeit nicht mehr gebraucht wird — für den Import aber sehr wohl. Jeder
Eintrag ist ein Link in den Task; was dort nachgetragen wird, entscheidest du.
Ein Eingabefeld gibt es hier absichtlich nicht.

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

## In der geöffneten Unterhaltung

Neben dem Namen des Gegenübers steht eine Leiste mit drei Knöpfen. Es sind
dieselben wie an den Zeilen der Liste — nur dort, wo du gerade hinsiehst, wenn
du antwortest.

Alles steht **in einer Zeile** neben dem Namen. Wird es eng, lässt sich die
Leiste seitlich schieben — der Kopf wird nie höher.

| | |
|---|---|
| Status-Pille | derselbe Status und dieselbe Farbe wie in der Liste. **Klick öffnet die Auswahl** zum Umstellen, ganz unten steht „In ClickUp öffnen" |
| „CRM +" | gibt es noch keinen Datensatz, legt der Klick ihn an |
| Tag-Pillen | deine eigenen Tags am Datensatz |
| „+" | öffnet die Tag-Auswahl: anklicken setzt, nochmal anklicken entfernt |
| Follow-up | setzt und entfernt die Markierung |
| Postfach-Knopf | **grün**: dieselbe Person gibt es auch im anderen Postfach, Klick öffnet sie in einem neuen Tab. **Rot**: gibt es nicht, der Knopf tut nichts. Steht dort **„Alte Adresse“**, führt er ins alte Postfach der Business Suite. |

### Status und Tags ändern

Die Stufen und die Tags kommen **aus ClickUp selbst**. Legst du dort eine neue
Stufe oder einen neuen Tag an, taucht er hier von allein auf — die Tag-Liste
wird höchstens eine halbe Stunde alt, dann holt das Skript sie neu. Wenn du
nicht warten willst: Seite neu laden.

> Bis 9.1 wurde die Liste nur geholt, **solange sie leer war**. Ein Tag, den du
> später in ClickUp angelegt hast, erschien im Menü deshalb nie. Am 10.11.2026
> an `low potential` aufgefallen.

> **Zum Status von Hand.** Die Pipeline ist für das Skript eine Leiter: die
> Automatik schiebt nur nach vorn. Für dich gilt das **nicht** — du kannst
> jede Stufe wählen, auch rückwärts. Zwei Dinge dabei:
>
> - Ein Schritt **zurück innerhalb der Pipeline hält nicht**. Beim nächsten
>   Abgleich zieht Onboarding, Ware oder Sales ihn wieder nach vorn.
> - **Endstatus bleiben liegen** — `abgesagt`, `ignore`, `keine antwort`,
>   `beendet` fasst keine Automatik mehr an.

Drei Tags stehen im Menü, lassen sich aber **nicht** anklicken, weil das
Skript sie selbst verwaltet: `follow-up` (dafür gibt es den Knopf daneben),
`ad-code` (hält eine Tatsache fest und wird nie entfernt) und `handle-fehlt`
(verschwindet von allein, sobald der Handle da ist). Der Mauszeiger sagt
jeweils, warum.

`ambassador` ist der Sonderfall dazwischen: anklickbar wie deine eigenen Tags,
aber das Skript setzt ihn auch selbst, sobald jemand bei UpPromote im
Ambassador-Programm liegt. Abnehmen hält deshalb nur bis zum nächsten
Abgleich.

### Der Postfach-Knopf

Partner-Nachrichten und normale DMs sind **verschiedene Unterhaltungen mit
verschiedenen Kennungen**, auch wenn es dieselbe Person ist. Der Knopf sagt,
ob es die zweite gibt, und bringt dich hin.

**Zum Öffnen genügt die Kennung** — beide Postfächer liegen unter derselben
Adressform. Steht im Datensatz eine zweite Unterhaltung, ist der Knopf also
grün, auch wenn das Skript sie noch nie in einer Liste gesehen hat.

Nur die **Beschriftung** hängt daran, woher eine Unterhaltung stammt, und das
ist ihrer Kennung nicht anzusehen. Das merkt sich dein Browser aus den Listen,
die offen waren. Weiß er es nicht, steht im Knopf „Andere Unterhaltung" statt
„Partner-Postfach" oder „Normales Postfach" — er funktioniert trotzdem.
Geraten wird nicht.

Steht „Nur normal" oder „Nur Partner", kennt der Datensatz überhaupt nur eine
Unterhaltung.

**„Alte Adresse"** ist der vierte Fall. Dann trägt der Datensatz neben der
Instagram-Kennung noch eine aus dem alten Postfach der Business Suite, und der
Knopf öffnet dort. Meist ist das **dieselbe** Unterhaltung, nur anders
adressiert: die alte Markerzeile entstand, als hier noch im alten Postfach
gearbeitet wurde, die Instagram-Zeile kam beim Umzug dazu. Deshalb heißt der
Knopf dort nicht „Andere Unterhaltung" — das wäre eine Behauptung.

Gibt es **beides**, eine zweite Instagram-Kennung und eine alte, gewinnt die
Instagram-Kennung: nur dort ist nachweislich eine zweite Unterhaltung.

> Bis 9.1 baute der Knopf aus **jeder** Kennung eine Instagram-Adresse — auch
> aus einer aus dem alten Postfach. Instagram kann die nicht auflösen und
> zeigte wieder die Liste: der Klick sah aus, als tue er nichts. Am 10.11.2026
> an tborowsky aufgefallen.

> Bis 8.8 verlangte der Knopf, dass **beide** Kennungen schon in einer Liste
> gestanden hatten. Beide Listen zeigen aber nur rund 15 bis 20 Zeilen auf
> einmal, und alles darunter blieb ungesehen — der Knopf war deshalb bei
> nahezu jedem Kontakt grau. Seit 8.9 nicht mehr.

## Notizen zu einer Person

Rechts am Fensterrand hängt eine schmale Leiste. Darin stehen die
**ClickUp-Kommentare** des Datensatzes — unsere Notizen zu diesem Affiliate —
und du kannst neue schreiben.

Oben in der Leiste stehen zwei Dinge, die ständig gebraucht werden:

- **Der Handle**, als Link aufs Profil, daneben **„Kopieren"**. Kopiert wird
  der nackte Handle ohne `@` — so, wie du ihn in UpPromote oder Shopify
  einfügst. Fehlt er, steht dort „Kein Handle hinterlegt"; ein Task ohne
  Handle ist für sämtliche Automatiken unsichtbar, und zwar lautlos.
- **Die E-Mail-Adresse**, falls am Datensatz eine hinterlegt ist, ebenfalls mit
  **„Kopieren"**. Der Text selbst öffnet dein Mailprogramm. Sie ist die
  Brücke zu Shopify und zu UpPromote — dort wird nach der Adresse gesucht,
  nicht nach dem Handle. Ist keine hinterlegt, bleibt die Zeile weg; die
  Adresse kommt meist beim nächsten UpPromote-Abgleich von allein dazu.

Status und Tags sitzen **nicht** hier, sondern oben neben dem Namen — zwei
Bedienstellen für dieselbe Sache wären nur verwirrend.

| | |
|---|---|
| Es gibt Notizen | die Leiste steht **offen** |
| Es gibt keine | sie ist zu, ein Klick auf den Streifen öffnet sie |
| Es gibt keinen Datensatz | die Leiste erscheint gar nicht |
| „In ClickUp" | öffnet den Task |

Geschrieben wird mit „Notiz sichern". Die Notiz landet als Kommentar am Task,
unter dem Namen, zu dem dein ClickUp-Token gehört — Cosima sieht sie also als
ihre, wenn sie ihren eigenen Token benutzt.

Ein angefangener Text bleibt stehen, solange du in der Unterhaltung bist.
Wechselst du die Unterhaltung, ist er weg.

## Standardnachrichten

In jeder Unterhaltung steht rechts in der Verfassen-Zeile ein Knopf
**„⚡︎ Vorlagen"**. Sobald du tippst, weichen Instagrams Symbole dem
Senden-Knopf, und der Vorlagen-Knopf steht direkt daneben.

| | |
|---|---|
| Knopf anklicken | Liste öffnet sich über der Verfassen-Zeile |
| Auf eine Vorlage klicken | Text landet an der Schreibmarke, mehrzeilig |
| Suchfeld | durchsucht Titel **und** Text |
| Kürzel hinter dem Titel | wer die Vorlage angelegt hat, z. B. `JL`; Mauszeiger darauf zeigt den ganzen Namen |
| Leiste „Alle │ JL │ CW" | zeigt nur die Vorlagen einer Person |
| „Neu" | Titel und Text eingeben, „Sichern" |
| „Bearbeiten" → „Stilllegen" | verschwindet aus dem Postfach, bleibt in ClickUp |
| „In ClickUp öffnen" | führt direkt in die Liste |

Der Text wird **ergänzt, nicht ersetzt** — ein angefangener Satz bleibt
stehen. Abgeschickt wird nichts; du drückst Enter.

Die zweite Zeile je Eintrag ist der **Anfang des Textes in einer Zeile** —
Umbrüche werden zu Leerzeichen. Vorher stand dort die erste Zeile allein,
und weil unsere Vorlagen fast alle mit „Hi," beginnen, hießen alle gleich.

Die Urheber-Leiste erscheint erst, wenn **mehr als eine Person** Vorlagen
angelegt hat, und sie steht beim Öffnen immer auf „Alle". Ein Filter, der
still weiterwirkt, lässt sonst einen Text vermissen, den es sehr wohl gibt.
Vorlagen, zu denen ClickUp keinen Urheber liefert, tragen kein Kürzel und
sind nur unter „Alle" zu sehen.

### Wo die Vorlagen liegen

In der ClickUp-Liste **„Standardnachrichten"** im Space Marketing. Ein Task je
Vorlage: Name ist der Titel, Beschreibung ist der Text.

Das ist Absicht und der Grund für den Umbau: Vorher lagen sie im Speicher des
Browsers, also auf jedem Rechner andere. Über ClickUp haben Josia an zwei
Rechnern und Cosima an ihrem dieselben Texte, die Berechtigungen stimmen von
allein, und bearbeiten lässt sich alles auch direkt in ClickUp.

Die Liste wird **am Namen gefunden**, nicht über eine eingetragene Kennung —
sonst müsste sie jeder auf jedem Rechner nachtragen. Wird sie umbenannt,
meldet das Panel das und sagt, was zu tun ist.

Bei drei Leuten auf denselben Vorlagen gewinnt die zuletzt gespeicherte
Fassung. Bei einer Handvoll selten geänderter Texte ist das unproblematisch.

Das Panel holt die Liste **bei jedem Öffnen** frisch von ClickUp; es zeigt
zuerst den letzten Stand, damit es nicht träge wirkt. Eine Vorlage,
die gerade in ClickUp angelegt wurde, erscheint also beim nächsten Öffnen —
Instagram muss nicht neu geladen werden.

**Aufzählungen mit Bindestrich**
Wird eine Beschreibung in ClickUps Oberfläche oder über `markdown_description`
geschrieben, macht ClickUp aus einer Zeile, die mit `- ` beginnt, eine echte
Liste — und der Klartext, den das Panel einsetzt, verliert die Bindestriche
dann ganz. Abhilfe: den Bindestrich maskieren (`\- …`). Im Klartext steht
danach wieder `- …`.

**Ein Task-Titel sieht falsch aus**
Der Titel ist seit Version 7.5 reine Beschriftung. Zugeordnet wird über die
Zeile `igfu-iguser:` in der Beschreibung — die Instagram-Benutzer-ID des
Affiliates. Ein schiefer Name kostet deshalb nichts mehr und darf von Hand
korrigiert werden; das Skript schreibt ihn nicht wieder um.

Bis Version 7.4 war das anders: da konnte Text aus der Postfachzeile in den
Titel geraten, etwa die Vorschau („… You: Hi Anna,") oder, bei Zeilen ohne
eigenen Text, der Name der Nachbarzeile. Beide Wege sind zu.

**Nach dem Aktualisieren steht „… Änderungen gehen noch raus"**
Normal. Die Warteschlange wird nach und nach abgearbeitet; beim nächsten Lauf
ist sie leer. Bleibt die Zahl stehen, stimmt etwas mit dem Token nicht.
