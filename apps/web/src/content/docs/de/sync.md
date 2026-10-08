---
title: So funktioniert die Synchronisation
description: Was bei jedem Pull und jedem Export passiert, wie Änderungen auf beiden Seiten zusammengeführt werden und warum deine Pull Requests klein bleiben.
---

In einem verbundenen Projekt fliessen Daten in zwei Richtungen:

- ein **Pull** liest das Repository in wortwerk ein,
- ein **Export** schreibt Übersetzungen (und in wortwerk bearbeitete Quelltexte) als Pull Request zurück.

Beides läuft als Hintergrund-Job, pro Projekt immer nur einer gleichzeitig. Ein Pull und ein Export überschneiden sich also nie.

## Wem was gehört

|                                             | Gehört     | Richtung                                     |
| ------------------------------------------- | ---------- | -------------------------------------------- |
| Keys: welche Texte es gibt                  | Repository | Repo → wortwerk                              |
| Struktur: Platzhalter, Markup, Pluralformen | Repository | Repo → wortwerk                              |
| Formulierung der Quelltexte                 | gemeinsam  | in beide Richtungen, pro Key zusammengeführt |
| Übersetzungen                               | wortwerk   | wortwerk → Repo                              |

Keys eines verbundenen Projekts werden ausschliesslich von Entwicklern im Repository angelegt, nie in wortwerk. So bleiben Code und Übersetzungsdateien konsistent: Ein Key existiert genau dann, wenn Code ihn verwenden kann.

## Pull: Repository → wortwerk

### Wann er läuft

- bei jedem **Push** auf den verfolgten Branch (GitHub App oder Bitbucket-Webhook),
- wenn du im Projekt auf **Jetzt synchronisieren** klickst,
- aus der CI mit `wortwerk sync` oder der [API](/docs/api),
- nachdem du ein Repository verbunden, den verfolgten Branch geändert oder ein Dateimuster bzw. eine Sprache hinzugefügt hast,
- vor jedem Export, falls sich der verfolgte Branch seit dem letzten Pull bewegt hat (siehe unten).

Webhooks enthalten den Commit-SHA. Ein bereits synchronisierter Commit wird übersprungen, doppelt zugestellte Webhooks schaden also nicht.

### Was er macht

Für jedes Dateimuster liest wortwerk die **Datei der Quellsprache** bei diesem Commit und vergleicht sie mit dem Projekt:

1. **Neue Keys** werden angelegt, in der Reihenfolge der Datei.
2. **Keys, die in der Datei fehlen,** werden _veraltet_. Sie verschwinden aus dem Editor, ihre Übersetzungen bleiben aber erhalten, und taucht der Key später wieder auf, ist alles wieder da. Veraltete Keys werden erst gelöscht, wenn du in den Projekteinstellungen auf **Veraltete Keys löschen** klickst.
3. **Quelltexte** werden pro Key zusammengeführt (siehe unten). Ändert sich die Formulierung, wechseln die Übersetzungen dieses Keys auf _Zu prüfen_.

Danach werden die **Dateien der Zielsprachen** gelesen. Übersetzungen aus dem Repository füllen nur Lücken und überschreiben nie Arbeit, die in wortwerk gemacht wurde:

- beim **ersten Pull** einer Datei oder Sprache werden alle Übersetzungen aus dem Repository importiert,
- danach nur noch Übersetzungen von **Keys, die in diesem Pull neu sind**.

Importierte Übersetzungen sind als _Zu prüfen_ markiert.

## Quelltexte zusammenführen

Entwickler ändern Formulierungen im Code Review, Texterinnen korrigieren Texte in wortwerk, manchmal denselben Text zur selben Zeit. wortwerk führt jeden Key **dreiseitig** zusammen und nimmt dabei den Wert, den es zuletzt im Repository gesehen hat, als gemeinsame Basis:

| Repository  | wortwerk    | Ergebnis                                                           |
| ----------- | ----------- | ------------------------------------------------------------------ |
| geändert    | unverändert | der Text aus dem Repository wird übernommen                        |
| unverändert | geändert    | der Text aus wortwerk bleibt und geht mit dem nächsten Export raus |
| geändert    | geändert    | **Konflikt**: das Repository gewinnt                               |

Bei einem Konflikt geht die Formulierung aus wortwerk nicht verloren. Der Editor zeigt den Key mit _Vorher_, _Jetzt im Repository_ und _Formulierung aus wortwerk_. Wähle **Meine Formulierung verwenden**, um deine Änderung erneut anzuwenden (sie geht dann mit dem nächsten Export raus), oder **Version aus dem Repository behalten**, um sie zu verwerfen.

### Nur Formulierung, nie Struktur

Quelltexte darfst du in wortwerk umformulieren, aber nicht ihre Struktur ändern, denn der Code hängt davon ab. Der Editor lehnt eine Änderung am Quelltext ab, die

- einen Platzhalter hinzufügt, entfernt oder umbenennt (`{name}`, `{count}`),
- Markup ändert (`<b>…</b>`, `<link>…</link>`),
- einen Text zum Plural macht oder umgekehrt, oder eine Pluralform weglässt.

Solche Änderungen gehören ins Repository. Übersetzungen müssen gültige ICU-Texte sein. Maschinelle Übersetzungen werden zusätzlich auf dieselben Platzhalter, dasselbe Markup und die Pluralformen geprüft, die jede Sprache braucht (im Polnischen zum Beispiel `one`, `few`, `many`, `other`). [`wortwerk lint`](/docs/cli#dateien-offline-pruefen) führt die vollständige Strukturprüfung für Übersetzungsdateien durch.

## Export: wortwerk → Repository

### Wann er läuft

- wenn du auf **Jetzt exportieren** klickst,
- automatisch eine Minute nach der letzten Änderung an Übersetzungen, wenn **automatisch exportieren** aktiv ist,
- aus der CI mit `wortwerk sync --export` oder der API.

### Was er macht

1. **Mit dem Repository gleichziehen.** Hat sich der verfolgte Branch seit dem letzten Pull bewegt, macht wortwerk zuerst einen Pull. Sonst könnte der Export Änderungen rückgängig machen, die Entwickler gerade erst gemacht haben.
2. **Die Quelldatei patchen.** In wortwerk bearbeitete Quelltexte werden in die Quelldatei des Repositorys geschrieben, _so wie sie bei diesem Commit ist_. Nur die bearbeiteten Einträge ändern sich. Alles andere bleibt Byte für Byte gleich, inklusive Formatierung und Kommentaren.
3. **Die Dateien der Zielsprachen schreiben.** Jede Sprachdatei wird aus wortwerk erzeugt, mit der Quelldatei als Vorlage, damit Reihenfolge, Verschachtelung und Kommentare übereinstimmen. Dateien, deren Inhalt identisch mit dem Repository ist, werden weggelassen.
4. **Den Branch aktualisieren.** Der Export-Branch (`wortwerk/translations`) wird vom Kopf des verfolgten Branches neu erzeugt und per Force-Push geschrieben. Bei Bitbucket kommt stattdessen ein neuer Commit auf den bisherigen Export.
5. **Den Pull Request öffnen oder aktualisieren**: _Update translations from wortwerk_. Seine Beschreibung listet geänderte Quelltexte als Vorher/Nachher-Tabelle und die Zahl geänderter Texte pro Sprache.

Pro Projekt gibt es immer nur einen wortwerk-Pull-Request. Jeder Export ersetzt seinen Inhalt, er zeigt also stets den vollständigen, aktuellen Unterschied. Deshalb solltest du auch nicht selbst auf den Export-Branch committen.

### Nach dem Merge

Der Merge ist ein Push auf den verfolgten Branch, also holt wortwerk ihn per Pull. Die Werte im Repository stimmen jetzt mit wortwerk überein, und das Projekt zeigt **Mit Repository synchron**. Bis dahin zeigt es _Änderungen noch nicht in einem Pull Request_ oder _Pull Request eingereicht_.

## Dateiformate

wortwerk speichert jeden Text als **ICU MessageFormat** und konvertiert beim Ein- und Auslesen:

| Format  | Details                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON    | verschachtelte oder flache Keys. Plurale als ICU (`{count, plural, …}`) oder mit i18next-Suffixen (`key_one`, `key_other`), Platzhalter `{name}` oder `{{name}}` |
| YAML    | Rails-Stil, mit oder ohne Sprach-Key an der Wurzel, Platzhalter `%{name}`                                                                                        |
| PO      | gettext, inklusive `msgctxt` und Pluralformen                                                                                                                    |
| TS / JS | Objektliterale in `.ts`-, `.js`-, `.mjs`-Dateien usw. Sie werden geparst, nie ausgeführt                                                                         |

Der Stil wird aus der Quelldatei erkannt und beim Schreiben beibehalten. Eine Datei mit i18next-Pluralen behält also ihre i18next-Plurale.

## Sprach-Aliase

Projektsprachen und Dateinamen passen nicht immer zusammen. Ordne sie in den Repository-Einstellungen zu, eine Zuordnung pro Zeile:

```text
de-CH=de
pt-BR=pt_BR
```

Die Sprache `de-CH` wird dann beim Muster `locales/%locale%.json` aus `locales/de.json` gelesen und dorthin geschrieben.
