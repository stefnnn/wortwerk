---
title: Erste Schritte
description: Vom neuen Konto zum ersten übersetzten Pull Request in rund zehn Minuten.
---

## 1. Konto und Workspace anlegen

[Erstelle ein Konto](/sign-up) mit deiner E-Mail-Adresse. Danach meldest du dich mit einem Magic Link oder deinem Passwort an.

Anschliessend fragt wortwerk nach dem Namen deines **Workspace**. Ein Workspace enthält deine Projekte, Mitglieder und dein Abo. Alle besitzen einen eigenen Workspace und können in beliebig viele weitere eingeladen werden. Gewechselt wird oben links in der App.

## 2. Projekt erstellen

Ein Projekt entspricht meist einer App oder einem Repository. Gib ihm:

- einen **Namen** und einen **Slug** (für URLs),
- die **Quellsprache**, in der deine Entwickler die Texte schreiben, zum Beispiel `en`,
- die **Zielsprachen**, in die du übersetzen willst, zum Beispiel `de`, `fr`, `it`.

Sprachcodes haben die übliche Form `sprache` oder `sprache-REGION` (`de`, `de-CH`, `pt-BR`). Sprachen kannst du später in den Projekteinstellungen hinzufügen und entfernen.

## 3. Festlegen, woher die Dateien kommen

Nach dem Erstellen fragt wortwerk, wie deine Übersetzungsdateien ins Projekt kommen:

### Repository verbinden (empfohlen)

Verbinde [GitHub](/docs/github) oder [Bitbucket](/docs/bitbucket), wähle das Repository und füge ein **Dateimuster** hinzu, mit `%locale%` an der Stelle des Sprachcodes:

```text
locales/%locale%.json
config/locales/%locale%.yml
src/i18n/%locale%/messages.po
```

Die erste Synchronisation startet sofort. Sie liest die Quelldatei, legt für jeden Text einen Key an und importiert die Übersetzungen, die schon im Repository liegen. Danach aktualisiert jeder Push auf den verfolgten Branch wortwerk automatisch.

### Dateien hochladen

Kein Repository, oder noch nicht? Lade zuerst die Quelldatei hoch (sie legt die Keys an), danach die Dateien der anderen Sprachen. Die [CLI](/docs/cli) macht dasselbe im Terminal mit `wortwerk push`, und `wortwerk pull` lädt die übersetzten Dateien herunter.

## 4. Team einladen

Unter **Einstellungen → Mitglieder** lädst du Personen per E-Mail ein:

- **Mitglieder** dürfen im Workspace alles: Projekte, Einstellungen, Repository-Verbindungen, Mitglieder.
- **Gäste** sind für Übersetzerinnen und Agenturen gedacht. Sie sehen nur die Projekte, die du ihnen freigibst, optional beschränkt auf einzelne Sprachen, und können Übersetzungen bearbeiten, kommentieren und Screenshots anhängen. Einstellungen und andere Mitglieder sehen sie nicht.

Mitglieder und Gäste zählen beide zur Benutzerlimite deines Abos.

## 5. Übersetzen

Der Editor zeigt pro Key und Sprache eine Zeile mit dem Quelltext. Jede Übersetzung hat einen Status:

| Status      | Bedeutung                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Unübersetzt | noch keine Übersetzung                                                                                     |
| Übersetzt   | hat einen Wert, nicht geprüft                                                                              |
| Zu prüfen   | der Quelltext hat sich geändert, oder der Wert stammt aus einem Import oder einer maschinellen Übersetzung |
| Freigegeben | geprüft und final                                                                                          |

Beim Übersetzen bekommst du Vorschläge aus dem **Translation Memory** (ähnliche Texte aus all deinen Projekten), kannst einzelne Keys **maschinell übersetzen** lassen (bezahlte Abos), **Kommentare** schreiben und **Screenshots** als Kontext anhängen. Jede Änderung bleibt im Verlauf der Übersetzung erhalten.

Platzhalter wie `{name}`, Pluralformen und Markup gehören zur Struktur eines Textes. wortwerk speichert alle Texte intern als ICU MessageFormat und konvertiert von und zu deinem Dateiformat, damit Übersetzer in jedem Projekt dieselbe Schreibweise sehen.

## 6. Übersetzungen ausliefern

Bei verbundenen Repositories exportiert wortwerk die Übersetzungen als **Pull Request** auf einem eigenen Branch (standardmässig `wortwerk/translations`). Klicke im Projekt auf **Jetzt exportieren**, lass wortwerk eine Minute nach der letzten Änderung automatisch exportieren, oder starte den Export aus der CI. Den Pull Request mergst du wie jeden anderen.

Ohne Repository lädst du die Dateien auf der Seite **Dateien** herunter oder führst `wortwerk pull` aus.

> Du willst genau wissen, was bei jeder Synchronisation passiert, auch wenn Entwickler und Übersetzerinnen denselben Text gleichzeitig ändern? Lies [So funktioniert die Synchronisation](/docs/sync).
