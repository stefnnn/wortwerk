---
title: Maschinelle Übersetzung
description: Wie die automatische Übersetzung neue Keys mit Claude füllt und der Status «Zu prüfen» dafür sorgt, dass ein Mensch das letzte Wort hat.
---

wortwerk übersetzt maschinell mit den neusten Claude-Modellen von Anthropic. Du kannst das auf drei Arten nutzen:

- **Neue Keys automatisch übersetzen**: Jeder Key, den ein Entwickler hinzufügt, wird direkt nach der Synchronisation in alle Sprachen übersetzt, ohne dass jemand wortwerk öffnen muss.
- **Vorübersetzen**: Fülle mit **Alle fehlenden übersetzen** in der Projektübersicht alles aus, was noch fehlt, oder nur die Keys, die du im Editor auswählst.
- **Pro Key**: Klicke beim Bearbeiten einer einzelnen Übersetzung auf **Maschinell übersetzen** und passe den Vorschlag vor dem Speichern an.

Die maschinelle Übersetzung ist in den Abos Project und Agency ohne Aufpreis enthalten, im Rahmen einer fairen Nutzung.

## Neue Keys automatisch übersetzen

Die Einstellung findest du in den **Einstellungen** des Projekts unter **Allgemein**. Sie ist standardmässig eingeschaltet. Damit läuft der Weg vom Commit zur gemergten Übersetzung von selbst:

1. Ein Entwickler fügt `checkout.title` in die Quelldatei ein und pusht auf den verfolgten Branch.
2. wortwerk synchronisiert, legt den Key an und übersetzt ihn maschinell in alle Zielsprachen.
3. Ist **Automatisch exportieren** eingeschaltet, landen die Übersetzungen eine Minute später im Pull Request von wortwerk.

Ein Feature-Branch, der in den verfolgten Branch gemergt wird, kommt so mit seinen Übersetzungen zurück, und in der Zwischenzeit bleibt nichts leer.

Was als neu zählt:

- Automatisch übersetzt werden nur Keys, die **bei einer Synchronisation** oder einem Dateiimport **neu** dazukommen, und nur in Sprachen ohne Übersetzung. Bestehende Übersetzungen werden nie überschrieben.
- Die **erste Synchronisation** eines Projekts wird nicht automatisch übersetzt. Die fehlenden Übersetzungen daraus sind dein Rückstand: Übersetze sie vor, wenn du so weit bist.
- Eine Synchronisation mit **mehr als 500 neuen Keys** auf einmal (ein neues Dateimuster, eine Massenumbenennung) wird übersprungen und im Synchronisationsverlauf vermerkt. Übersetze diese Keys stattdessen vor.
- Feature-Branches werden nicht verfolgt. Ihre Keys werden übersetzt, sobald sie im verfolgten Branch ankommen.

## Zu prüfen

Jede maschinelle Übersetzung wird mit dem Status **Zu prüfen** gespeichert, egal ob sie aus der automatischen Übersetzung, einer Vorübersetzung oder einem einzelnen Key stammt. Der Status bedeutet: Dieser Text hat einen Wert und geht mit dem nächsten Export raus, aber noch niemand hat ihn bestätigt.

| Status      | Bedeutung                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ |
| Unübersetzt | Noch keine Übersetzung                                                                     |
| Übersetzt   | Hat einen Wert, nicht geprüft                                                              |
| Zu prüfen   | Der Quelltext hat sich geändert, oder der Wert stammt aus einem Import oder einer Maschine |
| Freigegeben | Geprüft und final                                                                          |

Zum Prüfen filterst du den Editor nach **Zu prüfen**, liest jede Übersetzung in ihrem Kontext (Beschreibung des Keys, Kommentare, Screenshots) und korrigierst sie oder klickst auf **Freigeben**. Du kannst auch mehrere Keys auswählen und ihren Status auf einmal ändern. Der Verlauf jeder Übersetzung hält fest, dass ihre erste Fassung maschinell übersetzt wurde.

Ändert sich der Quelltext später, wechseln auch freigegebene Übersetzungen wieder auf _Zu prüfen_. So zeigt die Liste immer, was einen Blick braucht.

## Bessere Ergebnisse mit Kontext

Claude sieht mehr als den nackten Text. Jede Anfrage enthält:

- den **Namen des Keys** und seine **Beschreibung**, nur als Kontext,
- den **Projektkontext** aus **Einstellungen → Anweisungen für die maschinelle Übersetzung**, zum Beispiel für wen das Produkt ist und welchen Ton es anschlägt,
- die **Anweisungen pro Sprache**, zum Beispiel «immer duzen» oder «Schweizer Schreibweise (ss statt ß)».

Je genauer der Projektkontext, desto näher kommt der erste Entwurf an deinen Ton.

## Platzhalter und Pluralformen bleiben intakt

Nachrichten werden als ICU MessageFormat mit geschützten Platzhaltern gesendet. Jedes Ergebnis wird vor dem Speichern geprüft: Platzhalter wie `{name}`, Plural- und Select-Formen (inklusive der Pluralkategorien, die die Zielsprache braucht) und Markup müssen mit dem Quelltext übereinstimmen. Eine Übersetzung, die die Prüfung nicht besteht, wird verworfen und der Key bleibt unübersetzt. So landen nie kaputte Nachrichten in deinem Repository.

## Abos

Automatische Übersetzung, Vorübersetzung und maschinelle Übersetzung pro Key gibt es in den Abos Project und Agency. Im Free-Abo ist die Einstellung ausgeschaltet und lässt sich nicht einschalten.
